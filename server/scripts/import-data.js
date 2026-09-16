// 数据导入脚本：从 seed-data.json（源自 20241121_Overall requirement list.xlsx Meeting 页）
// 导入 67 个需求模块。日期全部按导入日"复活"：
//   - 已锁定(50): locked_at 分布在近 100 天内，sent_at = locked_at - (10+i%20) 天
//   - 流转中(17): 按预置偏移分布近 2 周，含 2 红(逾期)/2 黄(临期)/3 绿演示案例
// 用法: npm run import   （重复执行会清空 modules 表后重灌）
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { db, dbPath } = require('../src/db');
const { fmtLocal } = require('../src/risk');

const seedPath = path.join(__dirname, 'seed-data.json');
const rows = JSON.parse(fs.readFileSync(seedPath, 'utf-8'));
if (rows.length !== 67) throw new Error(`seed 数据异常: ${rows.length} != 67`);

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

// 流转中模块的演示日期：module_name -> { offset(发送日距今), labeled(+N 天打标) }
const flowDates = {
  '00_CAA_Law_Regulation_Standard': { offset: 9 },                 // 红：逾期 2 天
  '00_CAA_PPC_Module_Requirements': { offset: 8 },                 // 红：逾期 1 天（澄清后二轮发送）
  '02_CAA_ASMH': { offset: 5 },                                    // 黄：剩余 2 天
  '01_CAA_IDI_CuFu_UI': { offset: 6 },                             // 黄：剩余 1 天
  '01_CAA_LIDAR_85D_907_Basismodul': { offset: 2 },                // 绿
};

const tx = db.transaction(() => {
  db.prepare('DELETE FROM exchange_comments').run();
  db.prepare('DELETE FROM modules').run();
  let lockedIdx = 0;
  for (const r of rows) {
    const flowOffset = flowDates[r.module_name]?.offset ?? 14;
    // 已锁定模块的发送日铺开在近 100 天内；流转中模块按预置偏移（含 2 红 / 2 黄演示案例）
    const sent_at = dstr(r.status === 'accepted' ? 20 + (lockedIdx % 20) + Math.floor(lockedIdx / 20) * 12 : flowOffset);
    const labeled_at = r.labeled_at !== undefined && r.labeled_at !== null
      ? dstr(flowOffset - r.labeled_at)
      : (['in_review', 'to_be_clarified', 'rejection_tbc', 'accepted'].includes(r.status) ? dstr(flowOffset - 2) : null);
    const locked_at = r.status === 'accepted' ? dstr(10 + (lockedIdx++ % 90)) : null;
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
  // 示例账号
  db.prepare('DELETE FROM users').run();
  db.prepare("INSERT INTO users (username, password_hash, display_name, role) VALUES (?, ?, ?, 'admin')")
    .run('admin', bcrypt.hashSync('adas2026', 10), '安琪（PMO）');
  db.prepare("INSERT INTO users (username, password_hash, display_name, role) VALUES (?, ?, ?, 'supplier')")
    .run('huawei01', bcrypt.hashSync('adas2026', 10), '华为供应商（打标）');
  db.prepare("INSERT INTO users (username, password_hash, display_name, role) VALUES (?, ?, ?, 'editor')")
    .run('cariad01', bcrypt.hashSync('adas2026', 10), 'Cariad 同事');
  db.prepare("INSERT INTO users (username, password_hash, display_name, role) VALUES (?, ?, ?, 'viewer')")
    .run('pmo01', bcrypt.hashSync('adas2026', 10), 'PMO 同事（只读）');
});
tx();

const counts = db.prepare('SELECT status, COUNT(*) n FROM modules GROUP BY status').all();
console.log(`导入完成 -> ${dbPath}`);
console.table(counts);
