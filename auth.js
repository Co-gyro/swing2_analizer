/**
 * 認証ミドルウェア・ユーティリティ
 */
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import db from './db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'swing-analyzer-secret-key-change-in-production';
const JWT_EXPIRES_IN = '24h';

/**
 * JWTトークン生成
 */
export function generateToken(user) {
  return jwt.sign(
    {
      userId: user.id,
      tenantId: user.tenant_id,
      loginId: user.login_id,
      role: user.role,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

/**
 * ログイン認証
 */
export function authenticateUser(loginId, password) {
  const user = db.prepare(`
    SELECT u.*, t.is_active as tenant_active, t.contract_end, t.name as tenant_name
    FROM users u
    JOIN tenants t ON u.tenant_id = t.id
    WHERE u.login_id = ?
  `).get(loginId);

  if (!user) return { error: 'ユーザーIDまたはパスワードが正しくありません' };
  if (!user.is_active) return { error: 'このアカウントは無効化されています' };
  if (!user.tenant_active) return { error: 'このテナントは無効化されています' };

  // 契約期限チェック
  if (user.contract_end) {
    const now = new Date().toISOString().split('T')[0];
    if (now > user.contract_end) {
      return { error: '契約期間が終了しています。管理者にお問い合わせください' };
    }
  }

  // 個別有効期限チェック
  if (user.expires_at) {
    const now = new Date().toISOString();
    if (now > user.expires_at) {
      return { error: 'アカウントの有効期限が切れています' };
    }
  }

  // パスワード検証
  if (!bcrypt.compareSync(password, user.password_hash)) {
    return { error: 'ユーザーIDまたはパスワードが正しくありません' };
  }

  // 機能フラグ取得
  const features = db.prepare(`
    SELECT feature_key FROM feature_flags
    WHERE tenant_id = ? AND enabled = 1
  `).all(user.tenant_id).map(f => f.feature_key);

  const token = generateToken(user);

  return {
    token,
    user: {
      id: user.id,
      tenantId: user.tenant_id,
      tenantName: user.tenant_name,
      loginId: user.login_id,
      displayName: user.display_name,
      role: user.role,
      features,
    },
  };
}

/**
 * JWT認証ミドルウェア
 */
export function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '認証が必要です' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'トークンが無効または期限切れです' });
  }
}

/**
 * 管理者権限チェックミドルウェア
 */
export function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: '管理者権限が必要です' });
  }
  next();
}

/**
 * アクセスログ記録
 */
export function logAccess(req, action, detail = null) {
  try {
    db.prepare(`
      INSERT INTO access_logs (user_id, tenant_id, action, detail, ip_address, user_agent)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      req.user?.userId || null,
      req.user?.tenantId || null,
      action,
      detail ? JSON.stringify(detail) : null,
      req.ip || req.connection?.remoteAddress || null,
      req.headers['user-agent'] || null
    );
  } catch (err) {
    console.error('Failed to log access:', err.message);
  }
}
