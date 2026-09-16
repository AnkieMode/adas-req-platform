// SQLite 数据库初始化（独立库文件 adas-req.db，与 xhs-platform 的 app.db 完全隔离）
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { DATA_DIR } = require('./config');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const dbPath = path.join(DATA_DIR, 'adas-req.db');

function createDb(p) {
  const d = new Database(p);
  d.pragma('journal_mode = WAL');
  d.pragma('foreign_keys = ON');
  return d;
}

const db = createDb(dbPath);

function initSchema(d) {
  d.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name  TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin','editor','supplier','viewer')),
  fo_name       TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS modules (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  seq             INTEGER,
  module_name     TEXT NOT NULL UNIQUE,
  hwsw            TEXT NOT NULL DEFAULT 'SW' CHECK (hwsw IN ('HW','SW')),
  fo_name         TEXT,
  fo_email        TEXT,
  subdomain       TEXT,
  spdt            TEXT,
  status          TEXT NOT NULL DEFAULT 'transmitted' CHECK (status IN ('transmitted','changed','in_review','to_be_clarified','rejection_tbc','accepted','cancelled')),
  supplier_status TEXT CHECK (supplier_status IS NULL OR supplier_status IN ('TO_BE_CLARIFIED','IN_REVIEW','ACCEPTED','REJECTED','N/A')),
  sent_at         TEXT,
  labeled_at      TEXT,
  locked_at       TEXT,
  total_reqs      INTEGER DEFAULT 0,
  accepted_reqs   INTEGER DEFAULT 0,
  rejected_reqs   INTEGER DEFAULT 0,
  na_reqs         INTEGER DEFAULT 0,
  tbc_reqs        INTEGER DEFAULT 0,
  outstanding_reqs INTEGER DEFAULT 0,
  remark          TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE INDEX IF NOT EXISTS idx_modules_status ON modules(status);
CREATE INDEX IF NOT EXISTS idx_modules_fo ON modules(fo_name);
CREATE INDEX IF NOT EXISTS idx_modules_hwsw ON modules(hwsw);

CREATE TABLE IF NOT EXISTS exchange_comments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  module_id  INTEGER NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  side       TEXT NOT NULL CHECK (side IN ('OEM','SUPPLIER')),
  author     TEXT NOT NULL,
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE INDEX IF NOT EXISTS idx_comments_module ON exchange_comments(module_id);
`);
}

function ensureAdmin() {
  const count = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  if (count === 0) {
    // 初始管理员口令：只认环境变量 ADMIN_PASSWORD，代码内不留默认口令；
    // 未设置则随机生成并仅打印一次，请立即保存并在首次登录后修改。
    const generated = !process.env.ADMIN_PASSWORD;
    const pwd = process.env.ADMIN_PASSWORD || crypto.randomBytes(9).toString('base64url');
    const hash = bcrypt.hashSync(pwd, 10);
    db.prepare(
      "INSERT INTO users (username, password_hash, display_name, role) VALUES (?, ?, ?, 'admin')"
    ).run('admin', hash, '管理员');
    console.log('[init] 默认管理员已创建: admin');
    if (generated) console.log(`[init] 本次随机初始口令（仅显示一次）: ${pwd}`);
  }
}

// 迁移：旧库 users 表的 CHECK 约束不含 supplier 角色，需重建表（SQLite 不支持改 CHECK）
function migrateUsers(d) {
  const t = d.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'").get();
  if (t && !t.sql.includes("'supplier'")) {
    d.exec(`
      ALTER TABLE users RENAME TO users_old;
      CREATE TABLE users (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        username      TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        display_name  TEXT NOT NULL,
        role          TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin','editor','supplier','viewer')),
        fo_name       TEXT,
        created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime')),
        updated_at    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
      );
      INSERT INTO users (id, username, password_hash, display_name, role, fo_name, created_at, updated_at)
        SELECT id, username, password_hash, display_name, role, fo_name, created_at, updated_at FROM users_old;
      DROP TABLE users_old;
    `);
    console.log('[migrate] users 表已重建，新增 supplier 角色');
  }
}

// 迁移：旧库 modules 表的 CHECK 约束仍是旧状态机（含 draft/new、缺 changed），
// 拖拽到「已变更」时数据库层会拒绝写入（SQLITE_CONSTRAINT_CHECK）。SQLite 不支持改 CHECK，需重建表。
function migrateModules(d) {
  const t = d.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='modules'").get();
  if (t && !t.sql.includes("'changed'")) {
    // legacy_alter_table=ON：RENAME 时不改写 exchange_comments 的外键引用，
    // 否则引用会被改到 modules_old，删除旧表后评论表外键悬空
    d.pragma('foreign_keys = OFF');
    d.pragma('legacy_alter_table = ON');
    d.exec(`
      ALTER TABLE modules RENAME TO modules_old;
      CREATE TABLE modules (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        seq             INTEGER,
        module_name     TEXT NOT NULL UNIQUE,
        hwsw            TEXT NOT NULL DEFAULT 'SW' CHECK (hwsw IN ('HW','SW')),
        fo_name         TEXT,
        fo_email        TEXT,
        subdomain       TEXT,
        spdt            TEXT,
        status          TEXT NOT NULL DEFAULT 'transmitted' CHECK (status IN ('transmitted','changed','in_review','to_be_clarified','rejection_tbc','accepted','cancelled')),
        supplier_status TEXT CHECK (supplier_status IS NULL OR supplier_status IN ('TO_BE_CLARIFIED','IN_REVIEW','ACCEPTED','REJECTED','N/A')),
        sent_at         TEXT,
        labeled_at      TEXT,
        locked_at       TEXT,
        total_reqs      INTEGER DEFAULT 0,
        accepted_reqs   INTEGER DEFAULT 0,
        rejected_reqs   INTEGER DEFAULT 0,
        na_reqs         INTEGER DEFAULT 0,
        tbc_reqs        INTEGER DEFAULT 0,
        outstanding_reqs INTEGER DEFAULT 0,
        remark          TEXT,
        created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime')),
        updated_at      TEXT NOT NULL DEFAULT (datetime('now','localtime'))
      );
      INSERT INTO modules SELECT
        id, seq, module_name, hwsw, fo_name, fo_email, subdomain, spdt,
        CASE WHEN status IN ('draft','new') THEN 'transmitted' ELSE status END,
        supplier_status, sent_at, labeled_at, locked_at,
        total_reqs, accepted_reqs, rejected_reqs, na_reqs, tbc_reqs, outstanding_reqs,
        remark, created_at, updated_at
      FROM modules_old;
      DROP TABLE modules_old;
      CREATE INDEX IF NOT EXISTS idx_modules_status ON modules(status);
      CREATE INDEX IF NOT EXISTS idx_modules_fo ON modules(fo_name);
      CREATE INDEX IF NOT EXISTS idx_modules_hwsw ON modules(hwsw);
    `);
    d.pragma('legacy_alter_table = OFF');
    d.pragma('foreign_keys = ON');
    console.log('[migrate] modules 表已重建，状态机更新（移除 draft/new，新增 changed）');
  }
}

initSchema(db);
migrateUsers(db);
migrateModules(db);
ensureAdmin();

module.exports = { db, dbPath, initSchema };
