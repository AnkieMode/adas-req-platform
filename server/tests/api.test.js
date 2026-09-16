// 接口级冒烟测试：真实起一个服务进程 + 临时数据目录，走完整 HTTP 链路。
// 覆盖四个真实缺陷的回归点：新增模块默认状态、状态流转日期口径、
// 交换记录的双侧写权限、终态不可流转。
const test = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PORT = 3099;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'adas-api-test-'));
// 仅用于测试进程的临时口令（注入 ADMIN_PASSWORD 覆盖），与任何真实环境口令无关
const TEST_PASSWORD = 'unit-test-only-pass';
let child = null;

async function waitForHealth() {
  for (let i = 0; i < 80; i += 1) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) return;
    } catch (_) { /* 还没起来 */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('服务未在预期时间内启动');
}

async function api(method, url, { token, body } = {}) {
  const res = await fetch(BASE + url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try { data = await res.json(); } catch (_) { /* 无 body */ }
  return { status: res.status, data };
}

async function login(username, password) {
  const r = await api('POST', '/api/auth/login', { body: { username, password } });
  assert.equal(r.status, 200, `登录失败: ${username} ${JSON.stringify(r.data)}`);
  return r.data.token;
}

test('API 冒烟：需求模块全链路', async (t) => {
  child = spawn(process.execPath, [path.join(__dirname, '..', 'src', 'index.js')], {
    env: { ...process.env, PORT: String(PORT), DATA_DIR, JWT_SECRET: 'api-test-secret', ADMIN_PASSWORD: TEST_PASSWORD },
    stdio: 'ignore',
  });
  try {
    await waitForHealth();
    const admin = () => login('admin', TEST_PASSWORD);

    await t.test('未登录访问接口返回 401', async () => {
      const r = await api('GET', '/api/modules');
      assert.equal(r.status, 401);
    });

    await t.test('全新数据库初始为空（需自行导入种子数据）', async () => {
      const token = await admin();
      const r = await api('GET', '/api/modules', { token });
      assert.equal(r.status, 200);
      assert.equal(r.data.modules.length, 0);
    });

    const adminToken = await admin();

    await t.test('新增模块默认「已发送华为」，不再落到已废弃的 draft', async () => {
      const r = await api('POST', '/api/modules', {
        token: adminToken,
        body: { module_name: 'TEST_Default_Status' },
      });
      assert.equal(r.status, 200, JSON.stringify(r.data));
      const g = await api('GET', `/api/modules/${r.data.id}`, { token: adminToken });
      assert.equal(g.data.module.status, 'transmitted');
    });

    await t.test('新增模块显式传 draft 被拒绝', async () => {
      const r = await api('POST', '/api/modules', {
        token: adminToken,
        body: { module_name: 'TEST_Bad_Status', status: 'draft' },
      });
      assert.equal(r.status, 400);
    });

    await t.test('状态流转：已发送华为 → 华为打标中，自动补打标日期（本地日期）', async () => {
      const list = await api('GET', '/api/modules', { token: adminToken });
      const id = list.data.modules[0].id;
      const r = await api('PUT', `/api/modules/${id}`, { token: adminToken, body: { status: 'in_review' } });
      assert.equal(r.status, 200, JSON.stringify(r.data));
      assert.ok(r.data.module.labeled_at, '应自动写入打标日期');
      assert.match(r.data.module.labeled_at, /^\d{4}-\d{2}-\d{2}$/);
      const today = new Date();
      const local = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      assert.equal(r.data.module.labeled_at, local, '打标日期必须按本地日期记录');
    });

    await t.test('终态不可再流转', async () => {
      const list = await api('GET', '/api/modules', { token: adminToken });
      const id = list.data.modules[0].id;
      assert.equal((await api('PUT', `/api/modules/${id}`, { token: adminToken, body: { status: 'accepted' } })).status, 200);
      const r = await api('PUT', `/api/modules/${id}`, { token: adminToken, body: { status: 'transmitted' } });
      assert.equal(r.status, 400);
    });

    await t.test('非法流转（已锁定 → 华为打标中）被拒绝', async () => {
      const list = await api('GET', '/api/modules', { token: adminToken });
      const id = list.data.modules[0].id;
      const r = await api('PUT', `/api/modules/${id}`, { token: adminToken, body: { status: 'in_review' } });
      assert.equal(r.status, 400);
    });

    const mkUser = async (username, role) => {
      const r = await api('POST', '/api/users', {
        token: adminToken,
        body: { username, password: TEST_PASSWORD, display_name: username, role },
      });
      assert.equal(r.status, 200, JSON.stringify(r.data));
      return login(username, TEST_PASSWORD);
    };

    const supplierToken = await mkUser('sup_test', 'supplier');
    const viewerToken = await mkUser('view_test', 'viewer');

    await t.test('华为供应商可写交换记录，且强制记为 SUPPLIER 侧', async () => {
      const list = await api('GET', '/api/modules', { token: adminToken });
      const id = list.data.modules[0].id;
      // 供应商即使试图写 OEM 侧，也必须落到 SUPPLIER
      const r = await api('POST', `/api/modules/${id}/comments`, {
        token: supplierToken,
        body: { side: 'OEM', body: '打标完成，需求已接受' },
      });
      assert.equal(r.status, 200, JSON.stringify(r.data));
      const g = await api('GET', `/api/modules/${id}`, { token: adminToken });
      const c = g.data.comments[0];
      assert.equal(c.side, 'SUPPLIER');
      assert.equal(c.author, 'sup_test');
      assert.match(c.body, /^\[\d{2}\/\d{2}\/\d{4}, sup_test\] 打标完成/);
    });

    await t.test('只读账号不可写交换记录、不可流转状态', async () => {
      const list = await api('GET', '/api/modules', { token: adminToken });
      const id = list.data.modules[0].id;
      const c = await api('POST', `/api/modules/${id}/comments`, {
        token: viewerToken, body: { side: 'OEM', body: '不该写进去' },
      });
      assert.equal(c.status, 403);
      const s = await api('PUT', `/api/modules/${id}`, { token: viewerToken, body: { status: 'in_review' } });
      assert.equal(s.status, 403);
    });

    await t.test('华为供应商可流转状态（打标）', async () => {
      const cr = await api('POST', '/api/modules', { token: adminToken, body: { module_name: 'TEST_Supplier_Flow' } });
      const r = await api('PUT', `/api/modules/${cr.data.id}`, { token: supplierToken, body: { status: 'in_review' } });
      assert.equal(r.status, 200, JSON.stringify(r.data));
      const back = await api('PUT', `/api/modules/${cr.data.id}`, { token: supplierToken, body: { status: 'accepted' } });
      assert.equal(back.status, 200);
    });

    await t.test('统计接口可用', async () => {
      const r = await api('GET', '/api/stats', { token: adminToken });
      assert.equal(r.status, 200);
      assert.ok(r.data.total >= 2);
    });
  } finally {
    if (child) child.kill();
    try { fs.rmSync(DATA_DIR, { recursive: true, force: true }); } catch (_) { /* Windows 句柄未释放时忽略 */ }
  }
});
