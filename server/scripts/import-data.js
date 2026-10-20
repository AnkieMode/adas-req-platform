// 数据导入脚本：从 seed-data.json（源自 20241121_Overall requirement list.xlsx Meeting 页）
// 导入 67 个需求模块。日期全部按导入日"复活"：
//   - 已锁定(50): locked_at 铺在最近 28 天内（近一个月），sent_at = locked_at - (3~11) 天
//   - 流转中(17): 全部压在最近一周内（1~9 天），含 2 红(逾期)/2 黄(临期)/1 绿演示案例
// 用法: npm run import   （重复执行会清空 modules 表后重灌）
// 账号：默认**不重建**（users 表非空时跳过），避免刷新数据时把线上口令洗掉；
//       需要重置账号时设 FORCE_USERS=1。
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { db, dbPath } = require('../src/db');
const { fmtLocal } = require('../src/risk');

const seedPath = path.join(__dirname, 'seed-data.json');
const rows = JSON.parse(fs.readFileSync(seedPath, 'utf-8'));
if (rows.length !== 67) throw new Error(`seed 数据异常: ${rows.length} != 67`);

// 初始口令：优先环境变量 SEED_PASSWORD；未提供则随机生成，仅在本次控制台输出一次，仓库内不留明文
const seedPassword = process.env.SEED_PASSWORD || crypto.randomBytes(9).toString('base64url');
const generated = !process.env.SEED_PASSWORD;

// 统一走 risk.fmtLocal：本地时区日期，不能用 toISOString（UTC 会让 08:00 前的导入整体差一天）
function dstr(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() - offsetDays);
  return fmtLocal(d);
}

const ins = db.prepare(`
INSERT INTO modules (seq, module_name, hwsw, fo_name, fo_email, subdomain, spdt, status, supplier_status,
  sent_at, labeled_at, locked_at, total_reqs, accepted_reqs, rejected_reqs, na_reqs, tbc_reqs, outstanding_reqs, remark)
VALUES (@seq, @module_name, @hwsw, @fo_name, @fo_email, @subdomain, @spdt, @status, @supplier_status,
  @sent_at, @labeled_at, @locked_at, @total_reqs, @accepted_reqs, @rejected_reqs, @na_reqs, @tbc_reqs, @outstanding_reqs, @remark)
`);

// 流转中模块的演示日期：module_name -> { offset(发送日距今天数) }
// 只给 5 个 transmitted 模块指定（它们是唯一参与 7 日打标计时的），其余按序号铺在 1~7 天内
const flowDates = {
  '00_CAA_Law_Regulation_Standard': { offset: 9 },                 // 红：逾期 2 天
  '00_CAA_PPC_Module_Requirements': { offset: 8 },                 // 红：逾期 1 天（澄清后二轮发送）
  '02_CAA_ASMH': { offset: 5 },                                    // 黄：剩余 2 天
  '01_CAA_IDI_CuFu_UI': { offset: 6 },                             // 黄：剩余 1 天
  '01_CAA_LIDAR_85D_907_Basismodul': { offset: 2 },                // 绿
};

let createdUsers = false;
const tx = db.transaction(() => {
  db.prepare('DELETE FROM exchange_comments').run();
  db.prepare('DELETE FROM modules').run();
  let lockedIdx = 0;
  let flowIdx = 0;
  for (const r of rows) {
    const flowOffset = flowDates[r.module_name]?.offset ?? (1 + (flowIdx++ % 7));
    // 已锁定：锁定日落最近 28 天，发送日在其前 3~11 天；流转中：最近一周内
    const lockedBack = r.status === 'accepted' ? 1 + (lockedIdx % 28) : 0;
    const sentBack = r.status === 'accepted' ? lockedBack + 3 + (lockedIdx % 9) : flowOffset;
    const sent_at = dstr(sentBack);
    const labeled_at = r.status === 'accepted'
      ? dstr(lockedBack + Math.max(1, Math.floor((3 + (lockedIdx % 9)) / 2)))
      : (r.labeled_at !== undefined && r.labeled_at !== null
        ? dstr(Math.max(0, flowOffset - r.labeled_at))
        : (['in_review', 'to_be_clarified', 'rejection_tbc'].includes(r.status)
          ? dstr(Math.max(0, flowOffset - 2)) : null));
    const locked_at = r.status === 'accepted' ? dstr(lockedBack) : null;
    if (r.status === 'accepted') lockedIdx++;
    ins.run({
      seq: r.seq, module_name: r.module_name, hwsw: r.hwsw,
      fo_name: r.fo_name, fo_email: r.fo_email,
      subdomain: r.subdomain || null, spdt: r.spdt || null,
      status: r.status, supplier_status: r.supplier_status,
      sent_at, labeled_at, locked_at,
      total_reqs: r.total_reqs || 0, accepted_reqs: r.accepted_reqs || 0,
      rejected_reqs: r.rejected_reqs || 0, na_reqs: r.na_reqs || 0,
      tbc_reqs: r.tbc_reqs || 0, outstanding_reqs: r.outstanding_reqs || 0,
      remark: null,
    });
  }
  // 示例账号：默认只在空库时创建，避免刷新数据把已改过的口令洗掉（FORCE_USERS=1 才重建）
  const existing = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  if (existing > 0 && process.env.FORCE_USERS !== '1') {
    console.log(`[users] 已存在 ${existing} 个账号，本次不重建（保持现有口令）；需重置请设 FORCE_USERS=1`);
    return;
  }
  const hash = bcrypt.hashSync(seedPassword, 10);
  db.prepare('DELETE FROM users').run();
  const insertUser = db.prepare('INSERT INTO users (username, password_hash, display_name, role) VALUES (?, ?, ?, ?)');
  insertUser.run('admin', hash, '安琪（PMO）', 'admin');
  insertUser.run('huawei01', hash, '华为供应商（打标）', 'supplier');
  insertUser.run('cariad01', hash, 'Cariad 同事', 'editor');
  insertUser.run('pmo01', hash, 'PMO 同事（只读）', 'viewer');
  createdUsers = true;
});
tx();

const counts = db.prepare('SELECT status, COUNT(*) n FROM modules GROUP BY status').all();
console.log(`导入完成 -> ${dbPath}`);
console.table(counts);

const accounts = db.prepare('SELECT username, role, display_name FROM users ORDER BY id').all();
console.table(accounts);
if (!createdUsers) {
  console.log('\n账号未改动，口令保持原状。\n');
} else if (generated) {
  console.log('\n本次初始口令（随机生成，仅显示这一次，请立即保存并在首次登录后修改）:');
  console.log(`  ${seedPassword}\n`);
} else {
  console.log('\n初始口令取自环境变量 SEED_PASSWORD（未在此输出）。\n');
}
