// 数据库每日备份：用 SQLite backup API 生成一致性快照（直接 cp 在 WAL 模式下不是安全快照）
// 用法：DATA_DIR=/home/ubuntu/adas-req-platform/data node scripts/backup-db.js
// 可选：BACKUP_DIR（默认 <DATA_DIR>/backups）、BACKUP_KEEP（默认保留 14 份）
const fs = require('fs');
const path = require('path');
const { db } = require('../src/db');
const { DATA_DIR } = require('../src/config');

const dir = process.env.BACKUP_DIR || path.join(DATA_DIR, 'backups');
const keep = Number(process.env.BACKUP_KEEP || 14);
fs.mkdirSync(dir, { recursive: true });

const d = new Date();
const p = (n, w = 2) => String(n).padStart(w, '0');
// 带毫秒，避免同一秒内跑两次互相覆盖
const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}${p(d.getMilliseconds(), 3)}`;
const out = path.join(dir, `adas-req-${stamp}.db`);

db.backup(out)
  .then(() => {
    const mb = (fs.statSync(out).size / 1024 / 1024).toFixed(2);
    console.log(`[backup] 已生成 ${out} (${mb} MB)`);
    const files = fs.readdirSync(dir).filter((f) => /^adas-req-\d{8}-\d{9}\.db$/.test(f)).sort();
    const drop = files.slice(0, Math.max(0, files.length - keep));
    for (const f of drop) fs.unlinkSync(path.join(dir, f));
    if (drop.length) console.log(`[backup] 清理旧备份 ${drop.length} 份`);
    console.log(`[backup] 现有 ${files.length - drop.length} 份，保留上限 ${keep}`);
    process.exit(0);
  })
  .catch((e) => {
    console.error('[backup] 失败: ' + e.message);
    process.exit(1);
  });
