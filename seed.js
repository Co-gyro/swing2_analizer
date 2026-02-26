/**
 * 初期データ投入スクリプト
 * 実行: node seed.js
 */
import db from './db.js';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

// === テナント作成 ===
const upsertTenant = db.prepare(`
  INSERT OR IGNORE INTO tenants (id, name, contract_start, contract_end, is_active)
  VALUES (?, ?, ?, ?, ?)
`);

upsertTenant.run('owner', '管理者', '2024-01-01', null, 1);
upsertTenant.run('yonex', 'ヨネックス', '2025-01-01', '2026-12-31', 1);

// === ユーザー作成 ===
const upsertUser = db.prepare(`
  INSERT OR IGNORE INTO users (id, tenant_id, login_id, password_hash, display_name, role, is_active, expires_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

// 管理者アカウント
const adminHash = bcrypt.hashSync('mtracer2', 10);
upsertUser.run(uuidv4(), 'owner', 'admin', adminHash, '管理者', 'admin', 1, null);

// ヨネックスサンプルアカウント
const yonexHash = bcrypt.hashSync('yonex2025', 10);
upsertUser.run(uuidv4(), 'yonex', 'yonex01', yonexHash, 'ヨネックス担当1', 'user', 1, '2026-12-31');

// === 機能フラグ ===
const upsertFlag = db.prepare(`
  INSERT OR IGNORE INTO feature_flags (tenant_id, feature_key, enabled)
  VALUES (?, ?, ?)
`);

// ownerは全機能ON
const allFeatures = [
  'single_swing', 'comparison', 'multi_swing',
  'torque_analysis', 'torque_force_analysis',
  'scatter_plots', 'favorites', '3d_viewer',
];
for (const f of allFeatures) {
  upsertFlag.run('owner', f, 1);
}

// ヨネックスは基本機能のみ（後から管理画面で追加可能）
const yonexFeatures = [
  'single_swing', 'comparison', 'multi_swing',
  'torque_analysis', 'scatter_plots', 'favorites', '3d_viewer',
];
for (const f of yonexFeatures) {
  upsertFlag.run('yonex', f, 1);
}

console.log('Seed data inserted successfully.');
console.log('  Admin login: admin / mtracer2');
console.log('  Yonex login: yonex01 / yonex2025');

db.close();
