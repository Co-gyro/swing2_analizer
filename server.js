import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import db from './db.js';
import { authenticateUser, requireAuth, requireAdmin, logAccess } from './auth.js';

const app = express();
const PORT = process.env.PORT || 3001;

// M-Tracer API endpoints
const ENCRYPT_API = 'https://dental-hotline.com/mtracer/uid_encrypt/uid_encrypt.php';
const API_BASE = 'https://obs.m-tracer.golf/api/';

// CORS設定
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Accept', 'Authorization'],
}));

app.use(express.json({ limit: '50mb' }));

// ログミドルウェア
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// ==========================================
// 公開エンドポイント（認証不要）
// ==========================================

app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

// --- ログイン ---
app.post('/api/auth/login', (req, res) => {
  const { loginId, password } = req.body;
  if (!loginId || !password) {
    return res.status(400).json({ error: 'ログインIDとパスワードを入力してください' });
  }

  const result = authenticateUser(loginId, password);
  if (result.error) {
    logAccess(req, 'login_failed', { loginId });
    return res.status(401).json({ error: result.error });
  }

  logAccess({ ...req, user: { userId: result.user.id, tenantId: result.user.tenantId } }, 'login');
  res.json(result);
});

// ==========================================
// 認証必須エンドポイント
// ==========================================

// --- ログインユーザー情報 ---
app.get('/api/auth/me', requireAuth, (req, res) => {
  const user = db.prepare(`
    SELECT u.id, u.tenant_id, u.login_id, u.display_name, u.role,
           t.name as tenant_name
    FROM users u
    JOIN tenants t ON u.tenant_id = t.id
    WHERE u.id = ?
  `).get(req.user.userId);

  if (!user) return res.status(404).json({ error: 'ユーザーが見つかりません' });

  const features = db.prepare(`
    SELECT feature_key FROM feature_flags
    WHERE tenant_id = ? AND enabled = 1
  `).all(user.tenant_id).map(f => f.feature_key);

  res.json({
    id: user.id,
    tenantId: user.tenant_id,
    tenantName: user.tenant_name,
    loginId: user.login_id,
    displayName: user.display_name,
    role: user.role,
    features,
  });
});

// --- UID暗号化 ---
app.post('/api/encrypt', requireAuth, async (req, res) => {
  try {
    const { uid } = req.body;
    if (!uid) return res.status(400).json({ error: 'UID is required' });

    logAccess(req, 'encrypt', { uid });

    const response = await fetch(ENCRYPT_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid }),
    });

    if (!response.ok) throw new Error(`Encryption API error: ${response.status}`);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Encryption error:', error);
    res.status(500).json({ error: 'Failed to encrypt UID', message: error.message });
  }
});

// --- スイングリスト ---
app.get('/api/swing_list', requireAuth, async (req, res) => {
  try {
    const { uid, start_date, end_date } = req.query;
    if (!uid) return res.status(400).json({ error: 'UID parameter is required' });

    logAccess(req, 'search', { uid, start_date, end_date });

    const queryParams = new URLSearchParams();
    queryParams.append('uid', uid);
    if (start_date) queryParams.append('start_date', start_date);
    if (end_date) queryParams.append('end_date', end_date);

    const url = `${API_BASE}swing_list?${queryParams.toString()}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    });

    if (!response.ok) {
      if (response.status === 404) return res.status(404).json({ error: 'No swing data found' });
      const errorText = await response.text();
      return res.status(response.status).json({ error: `API error: ${response.statusText}`, details: errorText });
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Swing list fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch swing list', message: error.message });
  }
});

// --- スイング詳細 ---
app.get('/api/swing_detail', requireAuth, async (req, res) => {
  try {
    const { uid, swing_id } = req.query;
    if (!uid) return res.status(400).json({ error: 'UID parameter is required' });
    if (!swing_id) return res.status(400).json({ error: 'Swing ID parameter is required' });

    logAccess(req, 'view_detail', { uid, swing_id });

    const queryParams = new URLSearchParams();
    queryParams.append('uid', uid);
    queryParams.append('swing_id', swing_id);

    const url = `${API_BASE}swing_detail?${queryParams.toString()}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    });

    if (!response.ok) {
      if (response.status === 404) return res.status(404).json({ error: 'Swing detail not found' });
      const errorText = await response.text();
      return res.status(response.status).json({ error: `API error: ${response.statusText}`, details: errorText });
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Swing detail fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch swing detail', message: error.message });
  }
});

// ==========================================
// お気に入りAPI（テナント分離）
// ==========================================

app.get('/api/favorites', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT id, name, metadata, created_at FROM favorites
    WHERE user_id = ? AND tenant_id = ?
    ORDER BY created_at DESC
  `).all(req.user.userId, req.user.tenantId);

  const favorites = rows.map(r => ({
    ...r,
    metadata: r.metadata ? JSON.parse(r.metadata) : null,
  }));
  res.json(favorites);
});

app.get('/api/favorites/:id', requireAuth, (req, res) => {
  const row = db.prepare(`
    SELECT * FROM favorites WHERE id = ? AND tenant_id = ?
  `).get(req.params.id, req.user.tenantId);

  if (!row) return res.status(404).json({ error: 'お気に入りが見つかりません' });

  res.json({
    ...row,
    swing_data: JSON.parse(row.swing_data),
    metadata: row.metadata ? JSON.parse(row.metadata) : null,
  });
});

app.post('/api/favorites', requireAuth, (req, res) => {
  const { id, name, swingData, metadata } = req.body;
  if (!id || !name || !swingData) {
    return res.status(400).json({ error: '必須項目が不足しています' });
  }

  db.prepare(`
    INSERT INTO favorites (id, user_id, tenant_id, name, swing_data, metadata)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, req.user.userId, req.user.tenantId, name, JSON.stringify(swingData), JSON.stringify(metadata || {}));

  logAccess(req, 'save_favorite', { favoriteId: id, name });
  res.json({ success: true, id });
});

app.put('/api/favorites/:id', requireAuth, (req, res) => {
  const { name } = req.body;
  const result = db.prepare(`
    UPDATE favorites SET name = ? WHERE id = ? AND tenant_id = ?
  `).run(name, req.params.id, req.user.tenantId);

  if (result.changes === 0) return res.status(404).json({ error: '対象が見つかりません' });
  res.json({ success: true });
});

app.delete('/api/favorites/:id', requireAuth, (req, res) => {
  const result = db.prepare(`
    DELETE FROM favorites WHERE id = ? AND tenant_id = ?
  `).run(req.params.id, req.user.tenantId);

  if (result.changes === 0) return res.status(404).json({ error: '対象が見つかりません' });
  logAccess(req, 'delete_favorite', { favoriteId: req.params.id });
  res.json({ success: true });
});

// ==========================================
// 登録ユーザーAPI（テナント分離）
// ==========================================

app.get('/api/registered-users', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT swing_user_id as id, display_name as name FROM registered_swing_users
    WHERE tenant_id = ? ORDER BY created_at
  `).all(req.user.tenantId);
  res.json(rows);
});

app.post('/api/registered-users', requireAuth, (req, res) => {
  const { id, name } = req.body;
  if (!id || !name) return res.status(400).json({ error: 'IDと名前が必要です' });

  try {
    db.prepare(`
      INSERT INTO registered_swing_users (tenant_id, swing_user_id, display_name)
      VALUES (?, ?, ?)
    `).run(req.user.tenantId, id, name.slice(0, 10));
    res.json({ success: true });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: '既に登録されています' });
    }
    throw err;
  }
});

app.delete('/api/registered-users/:id', requireAuth, (req, res) => {
  db.prepare(`
    DELETE FROM registered_swing_users WHERE tenant_id = ? AND swing_user_id = ?
  `).run(req.user.tenantId, req.params.id);
  res.json({ success: true });
});

// ==========================================
// 管理API（admin権限のみ）
// ==========================================

app.get('/api/admin/users', requireAuth, requireAdmin, (req, res) => {
  const rows = db.prepare(`
    SELECT u.id, u.tenant_id, u.login_id, u.display_name, u.role, u.is_active,
           u.created_at, u.expires_at, t.name as tenant_name
    FROM users u JOIN tenants t ON u.tenant_id = t.id
    ORDER BY u.tenant_id, u.created_at
  `).all();
  res.json(rows);
});

app.post('/api/admin/users', requireAuth, requireAdmin, (req, res) => {
  const { tenantId, loginId, password, displayName, role, expiresAt } = req.body;
  if (!tenantId || !loginId || !password || !displayName) {
    return res.status(400).json({ error: '必須項目が不足しています' });
  }

  const hash = bcrypt.hashSync(password, 10);
  try {
    db.prepare(`
      INSERT INTO users (id, tenant_id, login_id, password_hash, display_name, role, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(uuidv4(), tenantId, loginId, hash, displayName, role || 'user', expiresAt || null);
    res.json({ success: true });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'ログインIDが既に使用されています' });
    }
    throw err;
  }
});

app.put('/api/admin/users/:id/toggle', requireAuth, requireAdmin, (req, res) => {
  const user = db.prepare('SELECT is_active FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'ユーザーが見つかりません' });
  db.prepare('UPDATE users SET is_active = ? WHERE id = ?').run(user.is_active ? 0 : 1, req.params.id);
  res.json({ success: true, is_active: !user.is_active });
});

app.get('/api/admin/tenants', requireAuth, requireAdmin, (req, res) => {
  res.json(db.prepare('SELECT * FROM tenants ORDER BY id').all());
});

app.put('/api/admin/tenants/:id', requireAuth, requireAdmin, (req, res) => {
  const { contractEnd, isActive } = req.body;
  db.prepare('UPDATE tenants SET contract_end = ?, is_active = ? WHERE id = ?')
    .run(contractEnd || null, isActive ? 1 : 0, req.params.id);
  res.json({ success: true });
});

app.get('/api/admin/features', requireAuth, requireAdmin, (req, res) => {
  const rows = db.prepare(`
    SELECT f.*, t.name as tenant_name FROM feature_flags f
    JOIN tenants t ON f.tenant_id = t.id ORDER BY f.tenant_id, f.feature_key
  `).all();
  res.json(rows);
});

app.put('/api/admin/features/:tenantId/:featureKey', requireAuth, requireAdmin, (req, res) => {
  const { tenantId, featureKey } = req.params;
  const { enabled } = req.body;
  db.prepare(`
    INSERT INTO feature_flags (tenant_id, feature_key, enabled) VALUES (?, ?, ?)
    ON CONFLICT(tenant_id, feature_key) DO UPDATE SET enabled = ?
  `).run(tenantId, featureKey, enabled ? 1 : 0, enabled ? 1 : 0);
  res.json({ success: true });
});

app.get('/api/admin/logs', requireAuth, requireAdmin, (req, res) => {
  const { tenantId, startDate, endDate, limit: maxRows } = req.query;
  let sql = `
    SELECT l.*, u.login_id, u.display_name as user_name
    FROM access_logs l LEFT JOIN users u ON l.user_id = u.id WHERE 1=1
  `;
  const params = [];

  if (tenantId) { sql += ' AND l.tenant_id = ?'; params.push(tenantId); }
  if (startDate) { sql += ' AND l.created_at >= ?'; params.push(startDate); }
  if (endDate) { sql += ' AND l.created_at <= ?'; params.push(endDate + 'T23:59:59'); }

  sql += ' ORDER BY l.created_at DESC LIMIT ?';
  params.push(parseInt(maxRows) || 200);

  res.json(db.prepare(sql).all(...params));
});

// ==========================================
// エラーハンドリング
// ==========================================

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

app.listen(PORT, () => {
  console.log(`\nServer running on http://localhost:${PORT}`);
  console.log(`  Health: http://localhost:${PORT}/health`);
  console.log(`  Login:  POST http://localhost:${PORT}/api/auth/login`);
});
