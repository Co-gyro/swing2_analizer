/**
 * SQLiteデータベース初期化・接続管理
 */
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DB_PATH = join(__dirname, 'data.sqlite');

const db = new Database(DB_PATH);

// WALモード（パフォーマンス向上）
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// テーブル作成
db.exec(`
  -- テナント（組織）
  CREATE TABLE IF NOT EXISTS tenants (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    contract_start DATE,
    contract_end   DATE,
    is_active     INTEGER DEFAULT 1,
    created_at    DATETIME DEFAULT (datetime('now'))
  );

  -- ユーザーアカウント
  CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    tenant_id     TEXT NOT NULL REFERENCES tenants(id),
    login_id      TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name  TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'user',
    is_active     INTEGER DEFAULT 1,
    created_at    DATETIME DEFAULT (datetime('now')),
    expires_at    DATETIME
  );

  -- お気に入り（テナント・ユーザー別）
  CREATE TABLE IF NOT EXISTS favorites (
    id            TEXT PRIMARY KEY,
    user_id       TEXT NOT NULL REFERENCES users(id),
    tenant_id     TEXT NOT NULL REFERENCES tenants(id),
    name          TEXT NOT NULL,
    swing_data    TEXT NOT NULL,
    metadata      TEXT,
    created_at    DATETIME DEFAULT (datetime('now'))
  );

  -- 登録スイングユーザーID（テナント別）
  CREATE TABLE IF NOT EXISTS registered_swing_users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id     TEXT NOT NULL REFERENCES tenants(id),
    swing_user_id TEXT NOT NULL,
    display_name  TEXT NOT NULL,
    created_at    DATETIME DEFAULT (datetime('now')),
    UNIQUE(tenant_id, swing_user_id)
  );

  -- アクセスログ
  CREATE TABLE IF NOT EXISTS access_logs (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       TEXT REFERENCES users(id),
    tenant_id     TEXT,
    action        TEXT NOT NULL,
    detail        TEXT,
    ip_address    TEXT,
    user_agent    TEXT,
    created_at    DATETIME DEFAULT (datetime('now'))
  );

  -- テナント別機能フラグ
  CREATE TABLE IF NOT EXISTS feature_flags (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id     TEXT NOT NULL REFERENCES tenants(id),
    feature_key   TEXT NOT NULL,
    enabled       INTEGER DEFAULT 0,
    UNIQUE(tenant_id, feature_key)
  );
`);

export default db;
