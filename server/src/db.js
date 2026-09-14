// SQLite 数据库初始化（独立库文件 adas-req.db，与 xhs-platform 的 app.db 完全隔离）
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
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
  status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','new','transmitted','in_review','to_be_clarified','rejection_tbc','accepted','cancelled')),
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
    const hash = bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'adas2026', 10);
    db.prepare(
      "INSERT INTO users (username, password_hash, display_name, role) VALUES (?, ?, ?, 'admin')"
    ).run('admin', hash, '管理员');
    console.log('[init] 默认管理员已创建: admin');
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

initSchema(db);
migrateUsers(db);
ensureAdmin();

module.exports = { db, dbPath, initSchema };
