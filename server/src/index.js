const express = require('express');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { db } = require('./db');
const { sign, authRequired, statusRequired, adminRequired, STATUS_ROLES } = require('./auth');
const risk = require('./risk');

const app = express();
app.use(express.json());

// ---------- 认证 ----------
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: '请输入用户名和密码' });
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }
  res.json({ token: sign(user), user: { id: user.id, username: user.username, display_name: user.display_name, role: user.role, fo_name: user.fo_name } });
});

app.get('/api/auth/me', authRequired, (req, res) => {
  const user = db.prepare('SELECT id, username, display_name, role, fo_name FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(401).json({ error: '用户不存在' });
  res.json({ user });
});

// ---------- 用户管理（管理员） ----------
app.get('/api/users', authRequired, adminRequired, (req, res) => {
  res.json({ users: db.prepare('SELECT id, username, display_name, role, fo_name, created_at FROM users ORDER BY id').all() });
});

app.post('/api/users', authRequired, adminRequired, (req, res) => {
  const { username, password, display_name, role, fo_name } = req.body || {};
  if (!username || !password || !display_name) return res.status(400).json({ error: '用户名/密码/姓名必填' });
  if (!['admin', 'editor', 'supplier', 'viewer'].includes(role)) return res.status(400).json({ error: '角色不合法' });
  try {
    const info = db.prepare(
      'INSERT INTO users (username, password_hash, display_name, role, fo_name) VALUES (?, ?, ?, ?, ?)'
    ).run(username, bcrypt.hashSync(password, 10), display_name, role, fo_name || null);
    res.json({ id: info.lastInsertRowid });
  } catch (e) {
    res.status(400).json({ error: '用户名已存在' });
  }
});

app.delete('/api/users/:id', authRequired, adminRequired, (req, res) => {
  if (Number(req.params.id) === req.user.id) return res.status(400).json({ error: '不能删除自己' });
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ---------- 需求模块 ----------
const MODULE_FIELDS = ['seq','module_name','hwsw','fo_name','fo_email','subdomain','spdt','status','supplier_status','sent_at','labeled_at','locked_at','total_reqs','accepted_reqs','rejected_reqs','na_reqs','tbc_reqs','outstanding_reqs','remark'];

app.get('/api/modules', authRequired, (req, res) => {
  const { status, hwsw, fo, risk: riskFilter, search } = req.query;
  let sql = 'SELECT * FROM modules WHERE 1=1';
  const params = [];
  if (status) { sql += ' AND status = ?'; params.push(status); }
  if (hwsw) { sql += ' AND hwsw = ?'; params.push(hwsw); }
  if (fo) { sql += ' AND fo_name = ?'; params.push(fo); }
  if (search) { sql += ' AND (module_name LIKE ? OR fo_name LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
  sql += ' ORDER BY seq IS NULL, seq, id';
  let rows = db.prepare(sql).all(...params).map((m) => risk.decorate(m));
  if (riskFilter) rows = rows.filter((m) => m.risk === riskFilter);
  res.json({ modules: rows });
});

app.get('/api/modules/:id', authRequired, (req, res) => {
  const m = db.prepare('SELECT * FROM modules WHERE id = ?').get(req.params.id);
  if (!m) return res.status(404).json({ error: '模块不存在' });
  const comments = db.prepare('SELECT * FROM exchange_comments WHERE module_id = ? ORDER BY created_at DESC').all(m.id);
  res.json({ module: risk.decorate(m), comments });
});

function pickFields(body) {
  const data = {};
  for (const f of MODULE_FIELDS) if (body[f] !== undefined) data[f] = body[f];
  return data;
}

// 新增模块（含全部字段编辑权）：仅管理员。Cariad / 供应商只能流转状态。
app.post('/api/modules', authRequired, adminRequired, (req, res) => {
  const data = pickFields(req.body || {});
  if (!data.module_name) return res.status(400).json({ error: 'module_name 必填' });
  if (!risk.STATUSES.includes(data.status || 'draft')) return res.status(400).json({ error: '状态不合法' });
  data.status = data.status || 'draft';
  const cols = Object.keys(data);
  const info = db.prepare(
    `INSERT INTO modules (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`
  ).run(...cols.map((c) => data[c]));
  res.json({ id: info.lastInsertRowid });
});

// 更新模块：Cariad(editor)/供应商(supplier) 仅可改 status；其他任何字段仅管理员
app.put('/api/modules/:id', authRequired, (req, res) => {
  const data = pickFields(req.body || {});
  const onlyStatus = Object.keys(data).length > 0 && Object.keys(data).every((k) => k === 'status');
  if (!onlyStatus) {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: '仅管理员可修改需求内容，你只能变更需求状态' });
    }
  } else if (!STATUS_ROLES.includes(req.user.role)) {
    return res.status(403).json({ error: '无状态流转权限（只读账号）' });
  }
  const existing = db.prepare('SELECT * FROM modules WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: '模块不存在' });

  // 状态流转校验
  if (data.status && data.status !== existing.status) {
    if (!risk.canTransition(existing.status, data.status)) {
      return res.status(400).json({
        error: `不允许的状态流转: ${risk.STATUS_LABELS[existing.status]} -> ${risk.STATUS_LABELS[data.status]}`,
      });
    }
    // 联动日期字段
    const now = new Date().toISOString().slice(0, 10);
    if (data.status === 'transmitted' && !data.sent_at && !existing.sent_at) data.sent_at = now;
    if (['in_review', 'to_be_clarified', 'rejection_tbc', 'accepted'].includes(data.status) && !existing.labeled_at && !data.labeled_at) {
      data.labeled_at = now;
    }
    if (data.status === 'accepted') data.locked_at = now;
  }

  const cols = Object.keys(data);
  if (cols.length) {
    db.prepare(
      `UPDATE modules SET ${cols.map((c) => `${c} = ?`).join(', ')}, updated_at = datetime('now','localtime') WHERE id = ?`
    ).run(...cols.map((c) => data[c]), req.params.id);
  }
  const m = db.prepare('SELECT * FROM modules WHERE id = ?').get(req.params.id);
  res.json({ module: risk.decorate(m) });
});

app.delete('/api/modules/:id', authRequired, adminRequired, (req, res) => {
  db.prepare('DELETE FROM modules WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ---------- 交换评论（遵循 [dd/mm/yyyy, 姓名] 格式规范） ----------
// 交换评论：仅管理员（Cariad/供应商仅可流转状态，不修改需求内容与记录）
app.post('/api/modules/:id/comments', authRequired, adminRequired, (req, res) => {
  const { side, body } = req.body || {};
  if (!['OEM', 'SUPPLIER'].includes(side)) return res.status(400).json({ error: 'side 必须为 OEM 或 SUPPLIER' });
  if (!body || !body.trim()) return res.status(400).json({ error: '评论内容不能为空' });
  const m = db.prepare('SELECT id FROM modules WHERE id = ?').get(req.params.id);
  if (!m) return res.status(404).json({ error: '模块不存在' });
  const author = `${req.user.display_name}`;
  const d = new Date();
  const prefix = `[${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}, ${author}] `;
  const info = db.prepare(
    'INSERT INTO exchange_comments (module_id, side, author, body) VALUES (?, ?, ?, ?)'
  ).run(req.params.id, side, author, prefix + body.trim());
  res.json({ id: info.lastInsertRowid });
});

// ---------- 统计 ----------
app.get('/api/stats', authRequired, (req, res) => {
  const mods = db.prepare('SELECT * FROM modules').all().map((m) => risk.decorate(m));
  const by = (fn) => mods.reduce((acc, m) => { const k = fn(m); acc[k] = (acc[k] || 0) + 1; return acc; }, {});
  const foStats = Object.entries(by((m) => m.fo_name || '未分配'))
    .map(([fo, count]) => ({ fo, count, open: mods.filter((m) => m.fo_name === fo && !['accepted', 'cancelled'].includes(m.status)).length }))
    .sort((a, b) => b.count - a.count);
  res.json({
    total: mods.length,
    by_status: by((m) => m.status),
    by_hwsw: by((m) => m.hwsw),
    by_risk: by((m) => m.risk),
    risk_modules: mods.filter((m) => m.risk === 'red' || m.risk === 'yellow').sort((a, b) => (a.deadline_at > b.deadline_at ? 1 : -1)),
    fo_stats: foStats,
    req_total: mods.reduce((s, m) => s + (m.total_reqs || 0), 0),
    req_accepted: mods.reduce((s, m) => s + (m.accepted_reqs || 0), 0),
    req_rejected: mods.reduce((s, m) => s + (m.rejected_reqs || 0), 0),
    req_na: mods.reduce((s, m) => s + (m.na_reqs || 0), 0),
    req_tbc: mods.reduce((s, m) => s + (m.tbc_reqs || 0), 0),
    req_outstanding: mods.reduce((s, m) => s + (m.outstanding_reqs || 0), 0),
  });
});

app.get('/api/meta', authRequired, (req, res) => {
  res.json({
    statuses: risk.STATUSES,
    status_labels: risk.STATUS_LABELS,
    transitions: risk.TRANSITIONS,
    supplier_status: risk.SUPPLIER_STATUS,
    supplier_labels: risk.SUPPLIER_LABELS,
    risk_labels: risk.RISK_LABELS,
    risk_colors: risk.RISK_COLORS,
  });
});

app.get('/api/health', (req, res) => res.json({ ok: true, ts: Date.now() }));

// ---------- 生产环境：托管前端构建产物 ----------
const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get(/^(?!\/api).*/, (req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

// 错误兜底
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: '服务器内部错误' });
});

const { PORT } = require('./config');
app.listen(PORT, () => {
  console.log(`[adas-req-platform] server listening on http://localhost:${PORT}`);
});
