import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import cron from 'node-cron';
import XLSX from 'xlsx';
import { ChartJSNodeCanvas } from 'chartjs-node-canvas';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import { pool, query } from './db.js';
import { ensureCooperateRequestsSchema, registerCooperateRoutes } from './services/cooperate.js';
import { registerPaymentRoutes } from './services/paymentsRoutes.js';
import { wechatJsapiPrepay, alipayWapPay, verifyWechatNotifySignature, decryptWechatResource, verifyAlipayNotify, getConfigFromEnv } from './services/payments.js';

const app = express();
const { CORS_ORIGIN = '*' } = process.env;
app.use(cors({ origin: CORS_ORIGIN === '*' ? true : CORS_ORIGIN }));
app.use(express.json({ limit: '1mb', verify: (req, res, buf) => { req.rawBody = buf.toString('utf8') } }));
app.use(express.urlencoded({ extended: false })); // 支持支付宝回调的表单解析
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 300 });
app.use(limiter);
// Static hosting for uploaded files
const uploadDir = path.join(process.cwd(), 'uploads');
try { fs.mkdirSync(uploadDir, { recursive: true }); } catch {}
app.use('/uploads', express.static(uploadDir));

// Ensure voucher_config has extended columns for advanced rules
const ensureVoucherConfigSchema = async () => {
  try {
    const cols = await query(
      "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'voucher_config'"
    );
    const set = new Set(cols.map((c) => c.COLUMN_NAME));
    const alters = [];
    if (!set.has('singleVoucherOnly')) alters.push("ADD COLUMN singleVoucherOnly TINYINT(1) NOT NULL DEFAULT 0");
    if (!set.has('minAmount')) alters.push("ADD COLUMN minAmount DECIMAL(10,2) NOT NULL DEFAULT 0");
    if (!set.has('categoryRules')) alters.push("ADD COLUMN categoryRules JSON NULL");
    if (!set.has('cashbackTiers')) alters.push("ADD COLUMN cashbackTiers JSON NULL");
    if (!set.has('specialActivities')) alters.push("ADD COLUMN specialActivities JSON NULL");
    if (alters.length) {
      const sql = `ALTER TABLE voucher_config ${alters.join(', ')}`;
      await query(sql);
    }
  } catch (e) {
    // swallow to avoid crashing server; will use fallback logic
    console.warn('ensureVoucherConfigSchema failed:', e?.message || e);
  }
};
// Ensure admin users
const ensureAdminUsersSchema = async () => {
  await query(`CREATE TABLE IF NOT EXISTS admin_users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(64) UNIQUE NOT NULL,
    passwordHash VARCHAR(128) NOT NULL,
    disabled TINYINT(1) DEFAULT 0,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`);
  const { ADMIN_USER = 'admin', ADMIN_PASS = 'admin123' } = process.env;
  const rows = await query('SELECT id FROM admin_users WHERE username = ?', [ADMIN_USER]);
  if (!rows[0]) {
    const hash = crypto.createHash('sha256').update(ADMIN_PASS).digest('hex');
    await query('INSERT INTO admin_users (username, passwordHash, disabled) VALUES (?,?,0)', [ADMIN_USER, hash]);
  }
};
// Ensure payment errors
const ensurePaymentErrorsSchema = async () => {
  await query(`CREATE TABLE IF NOT EXISTS payment_errors (
    id INT AUTO_INCREMENT PRIMARY KEY,
    provider VARCHAR(20) NOT NULL,
    orderId INT NULL,
    reason VARCHAR(255) NOT NULL,
    detail TEXT NULL,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    KEY idx_provider (provider),
    KEY idx_orderId (orderId)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`);
};
// Ensure members table includes avatar column
const ensureMembersAvatarColumn = async () => {
  try {
    const cols = await query(
      "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'members'"
    );
    const set = new Set(cols.map((c) => c.COLUMN_NAME));
    if (!set.has('avatar')) {
      await query("ALTER TABLE members ADD COLUMN avatar VARCHAR(255) NULL");
    }
  } catch (e) {
    console.warn('ensureMembersAvatarColumn failed:', e?.message || e);
  }
};
// 新增：确保成员偏好相关列存在
const ensureMembersProfileColumns = async () => {
  try {
    const cols = await query(
      "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'members'"
    );
    const set = new Set(cols.map((c) => c.COLUMN_NAME));
    const ops = [];
    if (!set.has('language')) ops.push("ALTER TABLE members ADD COLUMN language VARCHAR(64) NULL");
    if (!set.has('occupation')) ops.push("ALTER TABLE members ADD COLUMN occupation VARCHAR(64) NULL");
    if (!set.has('city')) ops.push("ALTER TABLE members ADD COLUMN city VARCHAR(64) NULL");
    if (!set.has('favorite')) ops.push("ALTER TABLE members ADD COLUMN favorite VARCHAR(128) NULL");
    for (const sql of ops) {
      await query(sql);
    }
  } catch (e) {
    console.warn('ensureMembersProfileColumns failed:', e?.message || e);
  }
};
// kickoff schema check on startup
ensureVoucherConfigSchema();
ensureAdminUsersSchema();
ensurePaymentErrorsSchema();
ensureMembersAvatarColumn();
ensureMembersProfileColumns();
ensureCooperateRequestsSchema();
// Ensure points-related tables
const ensurePointsSchema = async () => {
  try {
    await query(`CREATE TABLE IF NOT EXISTS member_points_accounts (
      id INT AUTO_INCREMENT PRIMARY KEY,
      memberId INT NOT NULL UNIQUE,
      balance BIGINT NOT NULL DEFAULT 0,
      locked BIGINT NOT NULL DEFAULT 0,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_member_points (memberId)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`);
    await query(`CREATE TABLE IF NOT EXISTS points_transactions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      memberId INT NOT NULL,
      type VARCHAR(20) NOT NULL,
      direction ENUM('credit','debit') NOT NULL,
      amount BIGINT NOT NULL,
      origin VARCHAR(32) NULL,
      activityId INT NULL,
      orderId INT NULL,
      meta TEXT NULL,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_pt_member (memberId),
      INDEX idx_pt_type (type),
      INDEX idx_pt_created (createdAt)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`);
    await query(`CREATE TABLE IF NOT EXISTS points_settlement_jobs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      activityId INT NOT NULL,
      status ENUM('pending','running','done','error') NOT NULL DEFAULT 'pending',
      dryRun TINYINT(1) NOT NULL DEFAULT 0,
      params JSON NULL,
      processed INT NOT NULL DEFAULT 0,
      skipped INT NOT NULL DEFAULT 0,
      errors INT NOT NULL DEFAULT 0,
      startedAt DATETIME NULL,
      finishedAt DATETIME NULL,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_psj_activity (activityId),
      INDEX idx_psj_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`);
    await query(`CREATE TABLE IF NOT EXISTS member_invite_codes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      memberId INT NOT NULL UNIQUE,
      code VARCHAR(16) NOT NULL UNIQUE,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`);
    await query(`CREATE TABLE IF NOT EXISTS referrals (
      id INT AUTO_INCREMENT PRIMARY KEY,
      inviterId INT NOT NULL,
      inviteeId INT NOT NULL UNIQUE,
      channel VARCHAR(32) NULL,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_ref_inviter (inviterId),
      INDEX idx_ref_invitee (inviteeId)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`);
  } catch (e) {
    console.warn('ensurePointsSchema failed:', e?.message || e);
  }
};
ensurePointsSchema();
registerCooperateRoutes(app);
// Register official payment routes early to override mocks
registerPaymentRoutes(app);

// Health check
app.get('/api/health', async (req, res) => {
  try {
    const conn = await pool.getConnection();
    await conn.ping();
    conn.release();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Auth: admin login & change password
const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || 'goup-secret';
const authMiddleware = (req, res, next) => {
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'unauthorized' });
  try {
    const payload = jwt.verify(token, ADMIN_JWT_SECRET);
    req.admin = payload;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'invalid token' });
  }
};

// Helpers: points account & transactions
const ensurePointsAccount = async (memberId) => {
  const rows = await query('SELECT id, memberId, balance, locked, updatedAt FROM member_points_accounts WHERE memberId = ?', [memberId]);
  if (!rows[0]) {
    await query('INSERT INTO member_points_accounts (memberId, balance, locked) VALUES (?,?,?)', [memberId, 0, 0]);
    return { id: null, memberId, balance: 0, locked: 0, updatedAt: null };
  }
  return rows[0];
};
const recordPointsTransaction = async (memberId, { type, direction, amount, origin = null, activityId = null, orderId = null, meta = null }) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const delta = direction === 'credit' ? Number(amount || 0) : -Number(amount || 0);
    await conn.execute(
      'INSERT INTO points_transactions (memberId, type, direction, amount, origin, activityId, orderId, meta) VALUES (?,?,?,?,?,?,?,?)',
      [memberId, String(type || ''), String(direction || 'credit'), Number(amount || 0), origin, activityId, orderId, meta ? JSON.stringify(meta) : null]
    );
    // Fix: when account row does not exist yet, initialize balance with the delta if it's a credit; otherwise 0.
    const initialBalance = delta > 0 ? delta : 0;
    await conn.execute(
      'INSERT INTO member_points_accounts (memberId, balance, locked) VALUES (?,?,?) ON DUPLICATE KEY UPDATE balance = GREATEST(balance + ?, 0), updatedAt = CURRENT_TIMESTAMP',
      [memberId, initialBalance, 0, delta]
    );
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
};
// Points: account query
app.get('/api/points/account', async (req, res) => {
  const memberId = Number(req.query.memberId || 0);
  if (!Number.isFinite(memberId) || memberId <= 0) return res.status(400).json({ error: 'memberId required' });
  try {
    const acc = await ensurePointsAccount(memberId);
    res.json({ id: acc.id || null, memberId: acc.memberId || memberId, balance: Number(acc.balance || 0), locked: Number(acc.locked || 0), updatedAt: acc.updatedAt || null });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 管理员端：手动发放积分（仅信用入账）
app.post('/api/points/grant', authMiddleware, async (req, res) => {
  const { memberId, amount, type, note } = req.body || {};
  const mid = Number(memberId || 0);
  const pts = Math.floor(Number(amount || 0));
  if (!Number.isFinite(mid) || mid <= 0) return res.status(400).json({ error: 'invalid memberId' });
  if (!Number.isFinite(pts) || pts <= 0) return res.status(400).json({ error: 'invalid amount' });
  const t = String(type || 'manual');
  try {
    await recordPointsTransaction(mid, {
      type: t,
      direction: 'credit',
      amount: pts,
      origin: 'admin',
      activityId: null,
      orderId: null,
      meta: { by: (req.admin?.username || req.admin?.id || null), note: note || null, grantedAt: new Date().toISOString() }
    });
    const accRows = await query('SELECT memberId, balance, locked, updatedAt FROM member_points_accounts WHERE memberId = ?', [mid]);
    const acc = accRows[0] || { memberId: mid, balance: 0, locked: 0, updatedAt: null };
    return res.json({ ok: true, memberId: mid, balance: Number(acc.balance || 0), locked: Number(acc.locked || 0), updatedAt: acc.updatedAt || null });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// 管理员端：积分调整（支持增减）
app.post('/api/points/adjust', authMiddleware, async (req, res) => {
  const { memberId, amount, direction, type, note } = req.body || {};
  const mid = Number(memberId || 0);
  const pts = Math.floor(Number(amount || 0));
  const dir = String(direction || '').toLowerCase();
  if (!Number.isFinite(mid) || mid <= 0) return res.status(400).json({ error: 'invalid memberId' });
  if (!Number.isFinite(pts) || pts <= 0) return res.status(400).json({ error: 'invalid amount' });
  if (!['credit','debit'].includes(dir)) return res.status(400).json({ error: 'invalid direction' });
  const t = String(type || 'manual_adjust');
  try {
    await recordPointsTransaction(mid, { type: t, direction: dir, amount: pts, origin: 'admin', activityId: null, orderId: null, meta: { by: (req.admin?.username || req.admin?.id || null), note: note || null, adjustedAt: new Date().toISOString() } });
    const accRows = await query('SELECT memberId, balance, locked, updatedAt FROM member_points_accounts WHERE memberId = ?', [mid]);
    const acc = accRows[0] || { memberId: mid, balance: 0, locked: 0, updatedAt: null };
    return res.json({ ok: true, memberId: mid, balance: Number(acc.balance || 0), locked: Number(acc.locked || 0), updatedAt: acc.updatedAt || null });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

// 管理员端：积分交易查询
app.get('/api/points/transactions', authMiddleware, async (req, res) => {
  const { memberId, type, direction, start, end } = req.query || {};
  const page = Math.max(Number(req.query.page || 1), 1);
  const pageSize = Math.min(Math.max(Number(req.query.pageSize || 20), 1), 200);
  const offset = (page - 1) * pageSize;
  try {
    let base = 'FROM points_transactions WHERE 1=1';
    const params = [];
    if (Number.isFinite(Number(memberId)) && Number(memberId) > 0) { base += ' AND memberId = ?'; params.push(Number(memberId)); }
    if (type) { base += ' AND type = ?'; params.push(String(type)); }
    if (direction) { base += ' AND direction = ?'; params.push(String(direction)); }
    if (start) { base += ' AND createdAt >= ?'; params.push(start); }
    if (end) { base += ' AND createdAt <= ?'; params.push(end); }
    const [countRow] = await query(`SELECT COUNT(*) AS total ${base}`, params);
    const rows = await query(`SELECT id, memberId, type, direction, amount, origin, activityId, orderId, meta, createdAt ${base} ORDER BY createdAt DESC, id DESC LIMIT ? OFFSET ?`, [...params, pageSize, offset]);
    res.json({ total: Number(countRow?.total || 0), items: rows, page, pageSize });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 管理员端：会员检索
app.get('/api/members/search', authMiddleware, async (req, res) => {
  const q = String(req.query.q || '').trim();
  const page = Math.max(Number(req.query.page || 1), 1);
  const pageSize = Math.min(Math.max(Number(req.query.pageSize || 20), 1), 200);
  const offset = (page - 1) * pageSize;
  try {
    let base = 'FROM members WHERE 1=1';
    const params = [];
    if (q) {
      base += ' AND (nameEn LIKE ? OR CAST(id AS CHAR) LIKE ? OR CAST(memberGroup AS CHAR) LIKE ? OR nation LIKE ?)';
      params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
    }
    const [countRow] = await query(`SELECT COUNT(*) AS total ${base}`, params);
    const rows = await query(`SELECT id, nameEn, gender, age, nation, avatar, flag, DATE_FORMAT(registeredAt, "%Y-%m-%d") AS registeredAt, memberGroup AS \`group\`, totalParticipations, disabled ${base} ORDER BY id DESC LIMIT ? OFFSET ?`, [...params, pageSize, offset]);
    res.json({ total: Number(countRow?.total || 0), items: rows, page, pageSize });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'username/password required' });
  try {
    const rows = await query('SELECT id, username, passwordHash, disabled FROM admin_users WHERE username = ?', [username]);
    const user = rows[0];
    if (!user) return res.status(401).json({ error: 'invalid credentials' });
    if (Number(user.disabled || 0) === 1) return res.status(403).json({ error: 'account disabled' });
    const hash = crypto.createHash('sha256').update(password).digest('hex');
    if (hash !== user.passwordHash) return res.status(401).json({ error: 'invalid credentials' });
    const token = jwt.sign({ id: user.id, username: user.username }, ADMIN_JWT_SECRET, { expiresIn: '7d' });
    res.json({ token });
  } catch (e) {
    // 数据库异常兜底：允许使用环境变量中的管理员账号登录（开发环境）
    try {
      const { ADMIN_USER = 'admin', ADMIN_PASS = 'admin123' } = process.env;
      const passHash = crypto.createHash('sha256').update(password).digest('hex');
      const envHash = crypto.createHash('sha256').update(ADMIN_PASS).digest('hex');
      if (username === ADMIN_USER && passHash === envHash) {
        const token = jwt.sign({ id: 0, username: ADMIN_USER }, ADMIN_JWT_SECRET, { expiresIn: '7d' });
        return res.json({ token });
      }
    } catch {}
    return res.status(500).json({ error: e.message });
  }
});

// 新增：管理员注册接口（用于小程序注册创建登录账户）
app.post('/api/admin/register', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'username/password required' });
  if (String(username).length < 3) return res.status(400).json({ error: 'username too short' });
  const pwdOk = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{8,20}$/.test(String(password || ''));
  if (!pwdOk) return res.status(400).json({ error: 'password weak' });
  try {
    const exist = await query('SELECT id FROM admin_users WHERE username = ?', [username]);
    if (exist[0]) return res.status(409).json({ error: 'username exists' });
    const hash = crypto.createHash('sha256').update(password).digest('hex');
    const result = await query('INSERT INTO admin_users (username, passwordHash, disabled) VALUES (?,?,0)', [username, hash]);
    return res.json({ ok: true, id: result.insertId });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// 新增：链接管理员账号与会员ID（注册后调用）
app.post('/api/admin/link-member', async (req, res) => {
  const { username, memberId } = req.body || {};
  const mid = Number(memberId || 0);
  if (!username || !Number.isFinite(mid) || mid <= 0) return res.status(400).json({ error: 'username/memberId required' });
  try {
    await query(`CREATE TABLE IF NOT EXISTS admin_member_links (
      id INT AUTO_INCREMENT PRIMARY KEY,
      adminId INT NOT NULL,
      memberId INT NOT NULL,
      UNIQUE KEY uniq_admin (adminId),
      UNIQUE KEY uniq_member (memberId)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`);
    const rows = await query('SELECT id FROM admin_users WHERE username = ? LIMIT 1', [username]);
    const admin = rows && rows[0];
    if (!admin) return res.status(404).json({ error: 'admin not found' });
    const mrows = await query('SELECT id FROM members WHERE id = ? LIMIT 1', [mid]);
    if (!mrows[0]) return res.status(404).json({ error: 'member not found' });
    const conflictRows = await query('SELECT id FROM admin_member_links WHERE memberId = ? AND adminId <> ? LIMIT 1', [mid, admin.id]);
    if (conflictRows && conflictRows[0]) return res.status(409).json({ error: 'member linked elsewhere' });
    await query('INSERT INTO admin_member_links (adminId, memberId) VALUES (?, ?) ON DUPLICATE KEY UPDATE memberId = VALUES(memberId)', [admin.id, mid]);
    return res.json({ ok: true, adminId: admin.id, memberId: mid });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// 获取当前管理员用户信息（昵称与头像）
app.get('/api/admin/me', authMiddleware, async (req, res) => {
  try {
    const { id, username } = req.admin || {};
    // 简单头像生成（可后续改为数据库字段）
    const avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(username || 'User')}&background=0ea5e9&color=fff`;
    // 确保映射表存在并查询绑定的会员ID
    try {
      await query(`CREATE TABLE IF NOT EXISTS admin_member_links (
        id INT AUTO_INCREMENT PRIMARY KEY,
        adminId INT NOT NULL,
        memberId INT NOT NULL,
        UNIQUE KEY uniq_admin (adminId),
        UNIQUE KEY uniq_member (memberId)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`);
    } catch {}
    let memberId = null;
    try {
      const rows = await query('SELECT memberId FROM admin_member_links WHERE adminId = ? LIMIT 1', [id]);
      memberId = rows && rows[0] ? Number(rows[0].memberId || 0) : null;
    } catch {}
    res.json({ id, username, nickname: username, avatar, memberId });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// WeChat: exchange code to openid
app.get('/api/wechat/openid', async (req, res) => {
  const code = String(req.query.code || '');
  if (!code) return res.status(400).json({ error: 'code required' });
  const appid = process.env.WECHAT_APP_ID || process.env.WECHAT_APPID || null;
  const secret = process.env.WECHAT_APP_SECRET || null;
  if (!appid || !secret) return res.status(500).json({ error: 'wechat appid/secret not configured' });
  try {
    const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${encodeURIComponent(appid)}&secret=${encodeURIComponent(secret)}&js_code=${encodeURIComponent(code)}&grant_type=authorization_code`;
    const resp = await fetch(url);
    const data = await resp.json();
    if (data.errcode) {
      return res.status(400).json({ error: 'wechat_error', detail: data });
    }
    return res.json({ openid: data.openid || null, unionid: data.unionid || null, session_key: data.session_key || null });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

app.post('/api/user/change-password', authMiddleware, async (req, res) => {
  const { username } = req.admin || {};
  const { oldPassword, newPassword } = req.body || {};
  if (!oldPassword || !newPassword) return res.status(400).json({ error: 'oldPassword/newPassword required' });
  try {
    const rows = await query('SELECT id, passwordHash FROM admin_users WHERE username = ?', [username]);
    const user = rows[0];
    if (!user) return res.status(404).json({ error: 'user not found' });
    const oldHash = crypto.createHash('sha256').update(oldPassword).digest('hex');
    if (oldHash !== user.passwordHash) return res.status(401).json({ error: 'invalid old password' });
    const newHash = crypto.createHash('sha256').update(newPassword).digest('hex');
    await query('UPDATE admin_users SET passwordHash = ? WHERE id = ?', [newHash, user.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Categories
app.get('/api/categories', async (req, res) => {
  try {
    const rows = await query('SELECT id, name, weight, builtin FROM categories ORDER BY weight ASC');
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.post('/api/categories', async (req, res) => {
  const { name, weight = 0 } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name required' });
  try {
    const result = await query('INSERT INTO categories (name, weight, builtin) VALUES (?, ?, ?)', [name, weight, 0]);
    const id = result.insertId;
    res.json({ id, name, weight, builtin: 0 });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.put('/api/categories/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { name, weight } = req.body || {};
  try {
    await query('UPDATE categories SET name = COALESCE(?, name), weight = COALESCE(?, weight) WHERE id = ?', [name ?? null, weight ?? null, id]);
    const rows = await query('SELECT id, name, weight, builtin FROM categories WHERE id = ?', [id]);
    res.json(rows[0] || { id, name, weight });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.delete('/api/categories/:id', async (req, res) => {
  const id = Number(req.params.id);
  try {
    await query('DELETE FROM categories WHERE id = ?', [id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Activities
app.get('/api/activities', async (req, res) => {
  try {
    const { keyword } = req.query || {};
    const where = [];
    const params = [];
    if (keyword && String(keyword).trim()) {
      const kw = `%${String(keyword).trim()}%`;
      // 标题、地点、内容模糊匹配
      where.push('(title LIKE ? OR place LIKE ? OR content LIKE ?)');
      params.push(kw, kw, kw);
    }
    const sql =
      'SELECT id, title, start, end, place, lat, lng, categoryIds, groupTags AS `groups`, min, max, waitlist, enrolled, price, status, isTop, isHot, publishedAt, mainImage, images, content FROM activities' +
      (where.length ? ' WHERE ' + where.join(' AND ') : '') +
      ' ORDER BY isTop DESC, id DESC';
    const rows = await query(sql, params);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.post('/api/activities', async (req, res) => {
  const a = req.body || {};
  try {
    const result = await query(
      'INSERT INTO activities (title, start, end, place, lat, lng, categoryIds, groupTags, min, max, waitlist, enrolled, price, status, isTop, isHot, publishedAt, mainImage, images, content) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [a.title, a.start, a.end, a.place, a.lat, a.lng, JSON.stringify(a.categoryIds || []), JSON.stringify(a.groups || []), a.min || 0, a.max || 1, a.waitlist || 0, a.enrolled || 0, a.price || 0, a.status || '草稿', a.isTop ? 1 : 0, a.isHot ? 1 : 0, a.publishedAt || '', a.mainImage || '', JSON.stringify(a.images || []), a.content || '']
    );
    res.json({ id: result.insertId, ...a });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.put('/api/activities/:id', async (req, res) => {
  const id = Number(req.params.id);
  const a = req.body || {};
  try {
    await query(
      'UPDATE activities SET title=?, start=?, end=?, place=?, lat=?, lng=?, categoryIds=?, groupTags=?, min=?, max=?, waitlist=?, enrolled=?, price=?, status=?, isTop=?, isHot=?, publishedAt=?, mainImage=?, images=?, content=? WHERE id=?',
      [a.title, a.start, a.end, a.place, a.lat, a.lng, JSON.stringify(a.categoryIds || []), JSON.stringify(a.groups || []), a.min || 0, a.max || 1, a.waitlist || 0, a.enrolled || 0, a.price || 0, a.status || '草稿', a.isTop ? 1 : 0, a.isHot ? 1 : 0, a.publishedAt || '', a.mainImage || '', JSON.stringify(a.images || []), a.content || '', id]
    );
    const rows = await query(
      'SELECT id, title, start, end, place, lat, lng, categoryIds, groupTags AS `groups`, min, max, waitlist, enrolled, price, status, isTop, isHot, publishedAt, mainImage, images, content FROM activities WHERE id = ?',
      [id]
    );
    res.json(rows[0] || { id, ...a });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.patch('/api/activities/:id/status', async (req, res) => {
  const id = Number(req.params.id);
  const { status } = req.body || {};
  try {
    await query('UPDATE activities SET status = ? WHERE id = ?', [status, id]);
    const rows = await query('SELECT id, status FROM activities WHERE id = ?', [id]);
    res.json(rows[0] || { id, status });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Members
app.get('/api/members', async (req, res) => {
  try {
    const rows = await query(
      'SELECT id, nameEn, gender, age, nation, avatar, flag, language, occupation, city, favorite, DATE_FORMAT(registeredAt, "%Y-%m-%d") AS registeredAt, memberGroup AS `group`, totalParticipations, disabled FROM members ORDER BY id DESC'
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.get('/api/members/:id', async (req, res) => {
  const id = Number(req.params.id);
  try {
    const rows = await query(
      'SELECT id, nameEn, gender, age, nation, avatar, flag, language, occupation, city, favorite, DATE_FORMAT(registeredAt, "%Y-%m-%d") AS registeredAt, memberGroup AS `group`, totalParticipations, disabled FROM members WHERE id = ?',
      [id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'not found' });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.post('/api/members', async (req, res) => {
  const m = req.body || {};
  try {
    const result = await query(
      'INSERT INTO members (nameEn, gender, age, nation, flag, registeredAt, memberGroup, totalParticipations, disabled, avatar, language, occupation, city, favorite) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [
        m.nameEn,
        m.gender ?? null,
        (Number.isFinite(Number(m.age)) ? Number(m.age) : null),
        m.nation ?? null,
        m.flag ?? null,
        m.registeredAt ?? null,
        m.group ?? null,
        Number.isFinite(Number(m.totalParticipations)) ? Number(m.totalParticipations) : 0,
        m.disabled ? 1 : 0,
        m.avatar ?? null,
        m.language ?? null,
        m.occupation ?? null,
        m.city ?? null,
        m.favorite ?? null
      ]
    );
    res.json({ id: result.insertId, ...m });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.put('/api/members/:id', async (req, res) => {
  const id = Number(req.params.id);
  const m = req.body || {};
  try {
    await query(
      'UPDATE members SET nameEn=?, gender=?, age=?, nation=?, flag=?, registeredAt=?, memberGroup=?, totalParticipations=?, disabled=?, avatar=?, language=?, occupation=?, city=?, favorite=? WHERE id=?',
      [
        m.nameEn,
        m.gender ?? null,
        (Number.isFinite(Number(m.age)) ? Number(m.age) : null),
        m.nation ?? null,
        m.flag ?? null,
        m.registeredAt ?? null,
        m.group ?? null,
        Number.isFinite(Number(m.totalParticipations)) ? Number(m.totalParticipations) : 0,
        m.disabled ? 1 : 0,
        m.avatar ?? null,
        m.language ?? null,
        m.occupation ?? null,
        m.city ?? null,
        m.favorite ?? null,
        id
      ]
    );
    const rows = await query(
      'SELECT id, nameEn, gender, age, nation, avatar, flag, language, occupation, city, favorite, DATE_FORMAT(registeredAt, "%Y-%m-%d") AS registeredAt, memberGroup AS `group`, totalParticipations, disabled FROM members WHERE id = ?',
      [id]
    );
    res.json(rows[0] || { id, ...m });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.patch('/api/members/:id/group', async (req, res) => {
  const id = Number(req.params.id);
  const { group } = req.body || {};
  try {
    await query('UPDATE members SET memberGroup = ? WHERE id = ?', [group || null, id]);
    const rows = await query('SELECT id, memberGroup FROM members WHERE id = ?', [id]);
    res.json({ id, group: rows[0]?.memberGroup ?? group ?? null });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.patch('/api/members/:id/disable', async (req, res) => {
  const id = Number(req.params.id);
  const { disabled } = req.body || {};
  try {
    await query('UPDATE members SET disabled = ? WHERE id = ?', [disabled ? 1 : 0, id]);
    const rows = await query('SELECT id, disabled FROM members WHERE id = ?', [id]);
    res.json({ id, disabled: rows[0]?.disabled === 1 });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 头像上传接口
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname || '') || '';
    const name = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, name);
  }
});
const upload = multer({ storage });
app.post('/api/upload/avatar', upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'file required' });
    const url = `/uploads/${file.filename}`;
    res.json({ url });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Activity signup (qualification and capacity)
app.post('/api/activity/signup', async (req, res) => {
  const { activityId, memberId, amount, currency = 'CNY', voucherUsage } = req.body || {};
  if (!activityId || !memberId) return res.status(400).json({ error: 'activityId and memberId required' });
  try {
    // Use a dedicated connection to ensure transactional consistency
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      // Lock activity row for capacity checks
      const [actRows] = await conn.execute('SELECT id, max, enrolled, waitlist, groupTags, start FROM activities WHERE id = ? FOR UPDATE', [activityId]);
      const activity = actRows[0];
      if (!activity) {
        await conn.rollback();
        conn.release();
        return res.status(404).json({ error: 'activity not found' });
      }
      // Member status and group qualification
      const [memRows] = await conn.execute('SELECT id, memberGroup, disabled FROM members WHERE id = ?', [memberId]);
      const member = memRows[0];
      if (!member) {
        await conn.rollback();
        conn.release();
        return res.status(404).json({ error: 'member not found' });
      }
      if (member.disabled === 1) {
        await conn.rollback();
        conn.release();
        return res.status(403).json({ error: 'member disabled' });
      }
      // Group match: if activity has group tags, member must match one of them
      let allowed = true;
      try {
        const groups = activity.groupTags ? JSON.parse(activity.groupTags || '[]') : [];
        if (Array.isArray(groups) && groups.length > 0) {
          const mg = member.memberGroup || '';
          allowed = groups.includes(mg);
        }
      } catch {}
      if (!allowed) {
        await conn.rollback();
        conn.release();
        return res.status(403).json({ error: 'member not qualified for activity groups' });
      }
      // Determine capacity and waitlist
      const max = Number(activity.max || 0);
      const enrolled = Number(activity.enrolled || 0);
      const waitlist = Number(activity.waitlist || 0);
      const now = new Date();
      // block signup if activity already started
      try {
        const startTime = activity.start ? new Date(activity.start) : null;
        if (startTime && now >= startTime) {
          await conn.rollback();
          conn.release();
          return res.status(403).json({ error: 'signup closed: activity started' });
        }
      } catch {}
      let status = 'created';
      if (max > 0 && enrolled >= max) {
        // full, increase waitlist
        status = 'waitlist';
        await conn.execute('UPDATE activities SET waitlist = ? WHERE id = ?', [waitlist + 1, activityId]);
      } else {
        // seat available, increase enrolled
        await conn.execute('UPDATE activities SET enrolled = ? WHERE id = ?', [enrolled + 1, activityId]);
      }
      // Compute discount based on global/category rules and minAmount
      let finalAmount = Number(amount || 0);
      let discountAmount = 0;
      let voucherAppliedJson = null;
      try {
        const [cfgRows] = await conn.execute('SELECT discountRate, maxDiscount, singleVoucherOnly, minAmount, categoryRules FROM voucher_config ORDER BY id DESC LIMIT 1');
        const cfg = cfgRows[0] || {};
        const minAmt = Number(cfg.minAmount || 0);
        const singleOnly = Number(cfg.singleVoucherOnly || 0) === 1;
        const categories = activity.categoryIds ? JSON.parse(activity.categoryIds || '[]') : [];
        // parse category rules
        let rate = Number(cfg.discountRate || 0);
        let maxD = Number(cfg.maxDiscount || 0);
        try {
          const rules = cfg.categoryRules ? JSON.parse(cfg.categoryRules) : [];
          if (Array.isArray(rules) && rules.length && Array.isArray(categories)) {
            // pick rule that yields max discount
            let best = null;
            for (const r of rules) {
              if (!r) continue;
              const cid = Number(r.categoryId || r.categoryID || r.category);
              if (categories.includes(cid)) {
                const rr = Number(r.discountRate || 0);
                const md = Number(r.maxDiscount || 0);
                const est = Math.min(finalAmount * rr, md);
                if (!best || est > best.est) best = { rr, md, est, rule: r };
              }
            }
            if (best) { rate = best.rr; maxD = best.md; }
          }
        } catch {}
        // apply only when amount meets min threshold, and skip if singleVoucherOnly with user voucher provided
        const allowGlobal = !(singleOnly && voucherUsage && Number(voucherUsage.amount || 0) > 0);
        if (allowGlobal && finalAmount >= minAmt && rate > 0) {
          const computed = Math.min(finalAmount * rate, maxD);
          discountAmount = Number.isFinite(computed) ? computed : 0;
          finalAmount = Math.max(finalAmount - discountAmount, 0);
          voucherAppliedJson = JSON.stringify({ rate, maxDiscount: maxD, minAmount: minAmt, originalAmount: Number(amount || 0) });
        }
      } catch {}
      // Optional member voucher usage
      let usedVoucher = null;
      if (voucherUsage && voucherUsage.voucherId && Number(voucherUsage.amount || 0) > 0) {
        try {
          const [vRows] = await conn.execute('SELECT id, memberId, balance, status, expireAt FROM member_vouchers WHERE id = ? AND memberId = ? FOR UPDATE', [voucherUsage.voucherId, memberId]);
          const v = vRows[0];
          const notExpired = !v?.expireAt || new Date(v.expireAt) >= now;
          if (v && v.status === 'available' && notExpired) {
            const want = Number(voucherUsage.amount || 0);
            const can = Math.min(Number(v.balance || 0), want, finalAmount);
            if (can > 0) {
              finalAmount = Math.max(finalAmount - can, 0);
              discountAmount += can;
              usedVoucher = { voucherId: v.id, usedAmount: can };
              await conn.execute(
                "UPDATE member_vouchers SET balance = GREATEST(balance - ?, 0), usedAt = CASE WHEN balance - ? <= 0 THEN CURRENT_TIMESTAMP ELSE usedAt END, status = CASE WHEN balance - ? <= 0 THEN 'used' ELSE status END WHERE id = ?",
                [can, can, can, v.id]
              );
            }
          }
        } catch {}
      }
      // Create order in transaction
      const [insertResult] = await conn.execute(
        'INSERT INTO orders (activityId, memberId, amount, currency, status, paymentMethod, transactionId, discountAmount, voucherApplied, createdAt, paidAt, refundAt) VALUES (?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,NULL,NULL)',
        [activityId, memberId, finalAmount, currency || 'CNY', status, null, null, discountAmount, usedVoucher ? JSON.stringify({ ...(voucherAppliedJson ? JSON.parse(voucherAppliedJson) : {}), voucherUsage: usedVoucher }) : voucherAppliedJson]
      );
      const orderId = insertResult.insertId;
      await conn.commit();
      conn.release();
      return res.json({ id: orderId, activityId, memberId, amount: finalAmount, currency, status, discountAmount, voucherApplied: usedVoucher || null, waitlisted: status === 'waitlist' });
    } catch (e) {
      try { await pool.query('ROLLBACK'); } catch {}
      try { /* ensure release */ } catch {}
      return res.status(500).json({ error: e.message });
    }
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// Member vouchers list
app.get('/api/members/:id/vouchers', async (req, res) => {
  const id = Number(req.params.id);
  const { status } = req.query || {};
  try {
    const params = [id];
    let sql = 'SELECT id, title, source, orderId, amount, balance, status, createdAt, expireAt, usedAt, meta FROM member_vouchers WHERE memberId = ?';
    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }
    sql += ' ORDER BY createdAt DESC, id DESC';
    const rows = await query(sql, params);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Points: account query
app.get('/api/members/:id/points', async (req, res) => {
  const memberId = Number(req.params.id);
  if (!Number.isFinite(memberId) || memberId <= 0) return res.status(400).json({ error: 'invalid member id' });
  try {
    const acc = await ensurePointsAccount(memberId);
    const txRows = await query('SELECT id, type, direction, amount, origin, activityId, orderId, createdAt, meta FROM points_transactions WHERE memberId = ? ORDER BY id DESC LIMIT 50', [memberId]);
    const tx = txRows.map((r) => ({ id: r.id, type: r.type, direction: r.direction, amount: Number(r.amount || 0), origin: r.origin, activityId: r.activityId, orderId: r.orderId, createdAt: r.createdAt, meta: (() => { try { return r.meta ? JSON.parse(r.meta) : null; } catch { return null; } })() }));
    res.json({ account: { memberId: memberId, balance: Number(acc.balance || 0), locked: Number(acc.locked || 0), updatedAt: acc.updatedAt }, recent: tx });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Orders
// Orders with unified pagination & filters
app.get('/api/orders', async (req, res) => {
  const page = Math.max(Number(req.query.page || 1), 1);
  const pageSize = Math.min(Math.max(Number(req.query.pageSize || 20), 1), 200);
  const offset = (page - 1) * pageSize;
  const { keyword, status, start, end } = req.query || {};
  const sortBy = String(req.query.sortBy || 'id');
  const sortOrder = String(req.query.sortOrder || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  const sortable = new Set(['id','createdAt','paidAt','refundAt','amount','status']);
  const orderField = sortable.has(sortBy) ? sortBy : 'id';
  try {
    let base = 'FROM orders WHERE 1=1';
    const params = [];
    if (status) { base += ' AND status = ?'; params.push(status); }
    if (keyword) { base += ' AND (CAST(id AS CHAR) LIKE ? OR CAST(memberId AS CHAR) LIKE ? OR CAST(activityId AS CHAR) LIKE ?)'; params.push(`%${keyword}%`,`%${keyword}%`,`%${keyword}%`); }
    if (start) { base += ' AND createdAt >= ?'; params.push(start); }
    if (end) { base += ' AND createdAt <= ?'; params.push(end); }
    const [countRow] = await query(`SELECT COUNT(*) AS total ${base}`, params);
    const items = await query(`SELECT id, activityId, memberId, amount, currency, status, paymentMethod, transactionId, discountAmount, voucherApplied, createdAt, paidAt, refundAt ${base} ORDER BY ${orderField} ${sortOrder} LIMIT ? OFFSET ?`, [...params, pageSize, offset]);
    res.json({ total: Number(countRow?.total || 0), items, page, pageSize });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.get('/api/orders/:id', async (req, res) => {
  const id = Number(req.params.id);
  try {
    const rows = await query('SELECT id, activityId, memberId, amount, currency, status, paymentMethod, transactionId, discountAmount, voucherApplied, createdAt, paidAt, refundAt FROM orders WHERE id = ?', [id]);
    if (!rows[0]) return res.status(404).json({ error: 'not found' });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.post('/api/orders', async (req, res) => {
  const o = req.body || {};
  try {
    // 业务约束：订单金额只允许整数（单位：元）
    if (o.amount != null && !Number.isInteger(Number(o.amount))) {
      return res.status(400).json({ error: 'amount must be integer yuan' });
    }
    // 禁用账号拦截
    if (o.memberId) {
      const rows = await query('SELECT disabled FROM members WHERE id = ?', [o.memberId]);
      if (Number(rows[0]?.disabled || 0) === 1) {
        return res.status(403).json({ error: 'member disabled' });
      }
    }
    // apply voucher discount
    let finalAmount = Number(o.amount || 0);
    let discountAmount = Number(o.discountAmount || 0);
    let voucherAppliedJson = o.voucherApplied ? JSON.stringify(o.voucherApplied) : null;
    let usedVoucher = null;
    try {
      const cfgRows = await query('SELECT discountRate, maxDiscount, singleVoucherOnly, minAmount, categoryRules FROM voucher_config ORDER BY id DESC LIMIT 1');
      const cfg = cfgRows[0] || {};
      const minAmt = Number(cfg.minAmount || 0);
      const singleOnly = Number(cfg.singleVoucherOnly || 0) === 1;
      // fetch activity categories if available
      const categories = [];
      try {
        if (o.activityId) {
          const aRows = await query('SELECT categoryIds FROM activities WHERE id = ?', [o.activityId]);
          const a = aRows[0];
          if (a && a.categoryIds) {
            const arr = JSON.parse(a.categoryIds || '[]');
            if (Array.isArray(arr)) arr.forEach((x) => categories.push(x));
          }
        }
      } catch {}
      let rate = Number(cfg.discountRate || 0);
      let maxD = Number(cfg.maxDiscount || 0);
      try {
        const rules = cfg.categoryRules ? JSON.parse(cfg.categoryRules) : [];
        if (Array.isArray(rules) && rules.length && Array.isArray(categories)) {
          let best = null;
          for (const r of rules) {
            if (!r) continue;
            const cid = Number(r.categoryId || r.categoryID || r.category);
            if (categories.includes(cid)) {
              const rr = Number(r.discountRate || 0);
              const md = Number(r.maxDiscount || 0);
              const est = Math.min(finalAmount * rr, md);
              if (!best || est > best.est) best = { rr, md, est, rule: r };
            }
          }
          if (best) { rate = best.rr; maxD = best.md; }
        }
      } catch {}
      const allowGlobal = !(singleOnly && o.voucherUsage && Number(o.voucherUsage.amount || 0) > 0);
      if (allowGlobal && finalAmount >= minAmt && rate > 0) {
        const computed = Math.min(finalAmount * rate, maxD);
        discountAmount = Number.isFinite(computed) ? computed : 0;
        finalAmount = Math.max(finalAmount - discountAmount, 0);
        voucherAppliedJson = JSON.stringify({ rate, maxDiscount: maxD, minAmount: minAmt, originalAmount: Number(o.amount || 0) });
      }
    } catch (e) {}

    // optional: use member voucher for partial/full payment
    const voucherUsage = o.voucherUsage || null;
    if (voucherUsage && voucherUsage.voucherId && Number(voucherUsage.amount || 0) > 0 && o.memberId) {
      try {
        const vRows = await query('SELECT id, memberId, balance, status, expireAt FROM member_vouchers WHERE id = ? AND memberId = ?', [voucherUsage.voucherId, o.memberId]);
        const v = vRows[0];
        const notExpired = !v?.expireAt || new Date(v.expireAt) >= new Date();
        if (v && v.status === 'available' && notExpired) {
          const want = Number(voucherUsage.amount || 0);
          const can = Math.min(Number(v.balance || 0), want, finalAmount);
          if (can > 0) {
            finalAmount = Math.max(finalAmount - can, 0);
            discountAmount += can;
            usedVoucher = { voucherId: v.id, usedAmount: can };
          }
        }
      } catch {}
    }
    // 最终应付金额按元取整，保持整数价格策略
    finalAmount = Math.round(Number(finalAmount || 0));
    const result = await query(
      'INSERT INTO orders (activityId, memberId, amount, currency, status, paymentMethod, transactionId, discountAmount, voucherApplied, createdAt, paidAt, refundAt) VALUES (?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,?,?)',
      [o.activityId || null, o.memberId || null, finalAmount, o.currency || 'CNY', o.status || 'created', o.paymentMethod || null, o.transactionId || null, discountAmount, usedVoucher ? JSON.stringify({ ...(voucherAppliedJson ? JSON.parse(voucherAppliedJson) : {}), voucherUsage: usedVoucher }) : voucherAppliedJson, o.paidAt || null, o.refundAt || null]
    );
    if (usedVoucher) {
      try {
        await query(
          "UPDATE member_vouchers SET balance = GREATEST(balance - ?, 0), usedAt = CASE WHEN balance - ? <= 0 THEN CURRENT_TIMESTAMP ELSE usedAt END, status = CASE WHEN balance - ? <= 0 THEN 'used' ELSE status END, orderId = ? WHERE id = ?",
          [usedVoucher.usedAmount, usedVoucher.usedAmount, usedVoucher.usedAmount, result.insertId, usedVoucher.voucherId]
        );
      } catch {}
    }
    res.json({ id: result.insertId, ...o, amount: finalAmount, discountAmount });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.put('/api/orders/:id', async (req, res) => {
  const id = Number(req.params.id);
  const o = req.body || {};
  try {
    // 业务约束：订单金额只允许整数（单位：元）
    if (o.amount != null && !Number.isInteger(Number(o.amount))) {
      return res.status(400).json({ error: 'amount must be integer yuan' });
    }
    // 强制订单金额为整数（元）
    const roundedAmount = Math.round(Number(o.amount || 0));
    await query(
      'UPDATE orders SET activityId=?, memberId=?, amount=?, currency=?, status=?, paymentMethod=?, transactionId=?, discountAmount=?, voucherApplied=?, paidAt=?, refundAt=? WHERE id=?',
      [o.activityId || null, o.memberId || null, roundedAmount, o.currency || 'CNY', o.status || 'created', o.paymentMethod || null, o.transactionId || null, o.discountAmount || 0, o.voucherApplied ? JSON.stringify(o.voucherApplied) : null, o.paidAt || null, o.refundAt || null, id]
    );
    const rows = await query('SELECT * FROM orders WHERE id = ?', [id]);
    res.json(rows[0] || { id, ...o });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.patch('/api/orders/:id/status', async (req, res) => {
  const id = Number(req.params.id);
  const { status, paidAt, refundAt } = req.body || {};
  try {
    await query('UPDATE orders SET status = COALESCE(?, status), paidAt = COALESCE(?, paidAt), refundAt = COALESCE(?, refundAt) WHERE id = ?', [status ?? null, paidAt ?? null, refundAt ?? null, id]);
    const rows = await query('SELECT id, status, paidAt, refundAt FROM orders WHERE id = ?', [id]);
    res.json(rows[0] || { id, status, paidAt, refundAt });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Refund order (admin)
app.post('/api/orders/:id/refund', authMiddleware, async (req, res) => {
  const id = Number(req.params.id);
  try {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [rows] = await conn.execute('SELECT id, status, amount FROM orders WHERE id = ? FOR UPDATE', [id]);
      const order = rows[0];
      if (!order) { await conn.rollback(); conn.release(); return res.status(404).json({ error: 'order not found' }); }
      if (order.status !== 'paid') { await conn.rollback(); conn.release(); return res.status(400).json({ error: 'order not paid' }); }
      const now = new Date();
      await conn.execute(
        'INSERT INTO payments (orderId, provider, providerTxnId, status, amount, refundAt, meta, createdAt) VALUES (?,?,?,?,?,?,?,CURRENT_TIMESTAMP)',
        [order.id, 'internal', null, 'refunded', Number(order.amount || 0), now, JSON.stringify({ reason: 'admin_refund', at: now.toISOString() })]
      );
      await conn.execute("UPDATE orders SET status='refunded', refundAt=? WHERE id=?", [now, order.id]);
      await conn.commit();
      conn.release();
      return res.json({ id: order.id, status: 'refunded', refundAt: now });
    } catch (e) {
      try { await pool.query('ROLLBACK'); } catch {}
      try { /* ensure release */ } catch {}
      return res.status(500).json({ error: e.message });
    }
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// Payments
// Payments with unified pagination & filters
app.get('/api/payments', async (req, res) => {
  const page = Math.max(Number(req.query.page || 1), 1);
  const pageSize = Math.min(Math.max(Number(req.query.pageSize || 20), 1), 200);
  const offset = (page - 1) * pageSize;
  const { keyword, status, provider, type, start, end } = req.query || {};
  const sortBy = String(req.query.sortBy || 'id');
  const sortOrder = String(req.query.sortOrder || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  const sortable = new Set(['id','createdAt','paidAt','refundAt','amount','status']);
  const orderField = sortable.has(sortBy) ? sortBy : 'id';
  try {
    let base = 'FROM payments WHERE 1=1';
    const params = [];
    if (status) { base += ' AND status = ?'; params.push(status); }
    if (provider) { base += ' AND provider = ?'; params.push(provider); }
    if (type) { base += ' AND (CASE WHEN refundAt IS NOT NULL THEN "refund" ELSE "pay" END) = ?'; params.push(type); }
    if (keyword) { base += ' AND (CAST(id AS CHAR) LIKE ? OR CAST(orderId AS CHAR) LIKE ? OR providerTxnId LIKE ?)'; params.push(`%${keyword}%`,`%${keyword}%`, `%${keyword}%`); }
    if (start) { base += ' AND createdAt >= ?'; params.push(start); }
    if (end) { base += ' AND createdAt <= ?'; params.push(end); }
    const [countRow] = await query(`SELECT COUNT(*) AS total ${base}`, params);
    const items = await query(`SELECT id, orderId, provider, providerTxnId, status, amount, paidAt, refundAt, meta, createdAt ${base} ORDER BY ${orderField} ${sortOrder} LIMIT ${pageSize} OFFSET ${offset}` , params);
    res.json({ total: Number(countRow?.total || 0), items, page, pageSize });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.get('/api/payments/:id', async (req, res) => {
  const id = Number(req.params.id);
  try {
    const rows = await query('SELECT id, orderId, provider, providerTxnId, status, amount, paidAt, refundAt, meta, createdAt FROM payments WHERE id = ?', [id]);
    if (!rows[0]) return res.status(404).json({ error: 'not found' });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.post('/api/payments', async (req, res) => {
  const p = req.body || {};
  try {
    const result = await query(
      'INSERT INTO payments (orderId, provider, providerTxnId, status, amount, paidAt, refundAt, meta, createdAt) VALUES (?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)',
      [p.orderId, p.provider, p.providerTxnId || null, p.status || 'initiated', p.amount || 0, p.paidAt || null, p.refundAt || null, p.meta ? JSON.stringify(p.meta) : null]
    );
    res.json({ id: result.insertId, ...p });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.put('/api/payments/:id', async (req, res) => {
  const id = Number(req.params.id);
  const p = req.body || {};
  try {
    await query(
      'UPDATE payments SET orderId=?, provider=?, providerTxnId=?, status=?, amount=?, paidAt=?, refundAt=?, meta=? WHERE id=?',
      [p.orderId, p.provider, p.providerTxnId || null, p.status || 'initiated', p.amount || 0, p.paidAt || null, p.refundAt || null, p.meta ? JSON.stringify(p.meta) : null, id]
    );
    const rows = await query('SELECT * FROM payments WHERE id = ?', [id]);
    res.json(rows[0] || { id, ...p });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.patch('/api/payments/:id/status', async (req, res) => {
  const id = Number(req.params.id);
  const { status, paidAt, refundAt } = req.body || {};
  try {
    await query('UPDATE payments SET status = COALESCE(?, status), paidAt = COALESCE(?, paidAt), refundAt = COALESCE(?, refundAt) WHERE id = ?', [status ?? null, paidAt ?? null, refundAt ?? null, id]);
    const rows = await query('SELECT id, status, paidAt, refundAt FROM payments WHERE id = ?', [id]);
    res.json(rows[0] || { id, status, paidAt, refundAt });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Create prepay for client payment (mock signature)
app.post('/api/payments/prepay', async (req, res) => {
  const { orderId, amount, provider, useVoucher, voucherAmount, memberId, pointsToUse, usePoints, openid, description, subject, returnUrl } = req.body || {};
  if (!orderId || !provider) return res.status(400).json({ error: 'orderId/provider required' });
  try {
    const now = new Date();
    const prepayId = 'prepay_' + crypto.randomBytes(8).toString('hex');
    // 1) 代金券抵扣（服务端统一计算）
    let finalPayable = Number(amount || 0);
    let appliedVoucher = 0;
    try {
      if (useVoucher && Number(voucherAmount || 0) > 0) {
        const cfgRows = await query('SELECT discountRate, maxDiscount, minAmount FROM voucher_config ORDER BY id DESC LIMIT 1');
        const cfg = cfgRows[0] || {};
        const { computeDeduction } = await import('./services/voucher.js');
        const r = computeDeduction(finalPayable, Number(voucherAmount || 0), cfg);
        appliedVoucher = Number(r.appliedVoucher || 0);
        finalPayable = Number(r.finalPayable || finalPayable);
      }
    } catch {}

    // 2) 积分抵扣（单位：10000积分 = 1元）。按整数元向下取整。
    const requestedPoints = Number(pointsToUse != null ? pointsToUse : (usePoints != null ? usePoints : 0)) || 0;
    let appliedPoints = 0;
    let pointsCashDeduction = 0; // 元
    if (requestedPoints > 0) {
      try {
        let available = requestedPoints;
        if (memberId) {
          const acc = await ensurePointsAccount(memberId);
          available = Math.max(Number(acc.balance || 0) - Number(acc.locked || 0), 0);
          available = Math.min(available, requestedPoints);
        }
        // 按整元扣减：10000积分 = 1元
        pointsCashDeduction = Math.floor(Number(available || 0) / 10000);
        // 不能超过应付金额
        pointsCashDeduction = Math.min(pointsCashDeduction, Math.round(Number(finalPayable || 0)));
        appliedPoints = pointsCashDeduction * 10000; // 实际使用积分（向下取整到10000的倍数）
        finalPayable = Math.max(Math.round(Number(finalPayable || 0)) - pointsCashDeduction, 0);
      } catch {}
    }

    // 3) 预支付金额按元取整
    finalPayable = Math.round(Number(finalPayable || 0));
    const meta = {
      prepayId,
      requestedAt: now.toISOString(),
      appliedVoucher,
      pointsUsage: {
        memberId: memberId || null,
        requestedPoints,
        appliedPoints,
        pointsCashDeduction,
        unitPerCurrency: 10000,
      },
      orderInfo: {
        description: description || null,
        subject: subject || null,
        openid: openid || null,
        returnUrl: returnUrl || null,
      }
    };

    await query(
      'INSERT INTO payments (orderId, provider, providerTxnId, status, amount, meta, createdAt) VALUES (?,?,?,?,?, ?, CURRENT_TIMESTAMP)',
      [orderId, provider, prepayId, 'initiated', Number(finalPayable || 0), JSON.stringify(meta)]
    );

    const key = provider === 'wechat' ? (process.env.WECHAT_KEY || 'dev-key') : (process.env.ALIPAY_KEY || 'dev-key');
    const payload = { orderId, amount: Number(finalPayable || 0), prepayId, provider, openid: openid || null };
    const signature = crypto.createHmac('sha256', key).update(JSON.stringify(payload)).digest('hex');
    let payParams = null;
    let payUrl = null;
    if (provider === 'wechat') {
      const timeStamp = String(Math.floor(Date.now() / 1000));
      const nonceStr = crypto.randomBytes(16).toString('hex');
      const pkg = `prepay_id=${prepayId}`;
      const signType = 'HMAC-SHA256';
      const signStr = `${timeStamp}\n${nonceStr}\n${pkg}\n`;
      const paySign = crypto.createHmac('sha256', key).update(signStr).digest('hex');
      payParams = { timeStamp, nonceStr, package: pkg, signType, paySign };
    } else if (provider === 'alipay') {
      payUrl = `https://sandbox.alipay.com/pay?prepayId=${encodeURIComponent(prepayId)}`;
    }
    res.json({ ok: true, ...payload, signature, originalAmount: Math.round(Number(amount || 0)), appliedVoucher, pointsUsage: meta.pointsUsage, payParams, payUrl });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/payments/points-only', async (req, res) => {
  const { orderId, memberId } = req.body || {};
  if (!orderId || !memberId) return res.status(400).json({ error: 'orderId/memberId required' });
  try {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [oRows] = await conn.execute('SELECT id, amount, currency, status FROM orders WHERE id = ? FOR UPDATE', [orderId]);
      const order = oRows[0];
      if (!order) {
        await conn.rollback(); conn.release();
        return res.status(404).json({ error: 'order not found' });
      }
      if (String(order.status || '') !== 'created') {
        await conn.rollback(); conn.release();
        return res.status(400).json({ error: 'order not payable by points' });
      }
      const pointsNeeded = Math.floor(Number(order.amount || 0) * 10000);
      const [accRows] = await conn.execute('SELECT id, memberId, balance, locked FROM member_points_accounts WHERE memberId = ? FOR UPDATE', [memberId]);
      let acc = accRows[0] || null;
      if (!acc) {
        await conn.execute('INSERT INTO member_points_accounts (memberId, balance, locked) VALUES (?,?,?)', [memberId, 0, 0]);
        acc = { balance: 0, locked: 0 };
      }
      const available = Math.max(Number(acc.balance || 0) - Number(acc.locked || 0), 0);
      if (available < pointsNeeded) {
        await conn.rollback(); conn.release();
        return res.status(400).json({ error: 'insufficient points', required: pointsNeeded, available });
      }
      await conn.execute(
        'INSERT INTO points_transactions (memberId, type, direction, amount, origin, activityId, orderId, meta) VALUES (?,?,?,?,?,?,?,?)',
        [memberId, 'spend', 'debit', pointsNeeded, 'order_payment', null, orderId, JSON.stringify({ method: 'points_only' })]
      );
      await conn.execute(
        'UPDATE member_points_accounts SET balance = GREATEST(balance - ?, 0), updatedAt = CURRENT_TIMESTAMP WHERE memberId = ?',
        [pointsNeeded, memberId]
      );

      const txnId = 'points_' + crypto.randomBytes(8).toString('hex');
      await conn.execute(
        'INSERT INTO payments (orderId, provider, providerTxnId, status, amount, meta, createdAt, updatedAt) VALUES (?,?,?,?,?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
        [orderId, 'points', txnId, 'paid', Number(order.amount || 0), JSON.stringify({ pointsOnly: true, pointsSpent: pointsNeeded })]
      );
      await conn.execute("UPDATE orders SET status = 'paid', paymentMethod = 'points', transactionId = ?, paidAt = CURRENT_TIMESTAMP WHERE id = ?", [txnId, orderId]);
      await conn.commit(); conn.release();
      return res.json({ ok: true, orderId, paid: true, provider: 'points', txnId, pointsSpent: pointsNeeded, amount: Number(order.amount || 0) });
    } catch (e) {
      try { await pool.query('ROLLBACK'); } catch {}
      try { conn.release(); } catch {}
      return res.status(500).json({ error: e.message });
    }
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// Payments errors listing (admin)
app.get('/api/payments/errors', authMiddleware, async (req, res) => {
  const { provider, keyword, start, end } = req.query || {};
  const page = Math.max(Number(req.query.page || 1), 1);
  const pageSize = Math.min(Math.max(Number(req.query.pageSize || 50), 1), 200);
  const offset = (page - 1) * pageSize;
  try {
    let base = 'FROM payment_errors WHERE 1=1';
    const params = [];
    if (provider) { base += ' AND provider = ?'; params.push(provider); }
    if (keyword) { base += ' AND (reason LIKE ? OR detail LIKE ?)'; params.push(`%${keyword}%`, `%${keyword}%`); }
    if (start) { base += ' AND createdAt >= ?'; params.push(start); }
    if (end) { base += ' AND createdAt <= ?'; params.push(end); }
    const [countRow] = await query(`SELECT COUNT(*) AS total ${base}`, params);
    const items = await query(`SELECT id, provider, orderId, reason, detail, createdAt ${base} ORDER BY id DESC LIMIT ? OFFSET ?`, [...params, pageSize, offset]);
    res.json({ total: Number(countRow?.total || 0), items, page, pageSize });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Payment callbacks (simplified signature check placeholders)
const hmacCheck = (secret, payloadObj, signature) => {
  try {
    const raw = JSON.stringify(payloadObj);
    const h = crypto.createHmac('sha256', String(secret || ''));
    h.update(raw);
    const expect = h.digest('hex');
    return expect === String(signature || '');
  } catch {
    return false;
  }
};
app.post('/api/payments/wechat/notify', async (req, res) => {
  const { orderId, amount, signature, providerTxnId } = req.body || {};
  const ok = hmacCheck(process.env.WECHAT_KEY, { orderId, amount }, signature);
  if (!ok) {
    try { await query('INSERT INTO payment_errors (provider, orderId, reason, detail) VALUES (?,?,?,?)', ['wechat', orderId || null, 'invalid_signature', JSON.stringify({ orderId, amount })]); } catch {}
    return res.status(400).json({ error: 'invalid signature' });
  }
  try {
    const now = new Date();
    // idempotency: if already paid for this order, skip duplicate insert
    const existingPaid = await query("SELECT id FROM orders WHERE id = ? AND status = 'paid'", [orderId]);
    if (existingPaid[0]) {
      return res.json({ ok: true, skipped: true });
    }
    const payResult = await query(
      'INSERT INTO payments (orderId, provider, providerTxnId, status, amount, paidAt, meta, createdAt) VALUES (?,?,?,?,?,?,?,CURRENT_TIMESTAMP)',
      [orderId, 'wechat', providerTxnId || null, 'paid', amount || 0, now, JSON.stringify({ notifiedAt: now.toISOString() })]
    );
    await query("UPDATE orders SET status='paid', paidAt=? WHERE id=?", [now, orderId]);
    // points deduction from prepay meta (idempotent)
    try {
      const rows = await query(
        "SELECT id, meta FROM payments WHERE orderId = ? AND status = 'initiated' ORDER BY id DESC LIMIT 1",
        [orderId]
      );
      const pre = rows[0];
      let pointsMemberId = null;
      let pointsToDebit = 0;
      try {
        const m = pre?.meta ? JSON.parse(pre.meta) : null;
        const pu = m?.pointsUsage || null;
        pointsMemberId = pu?.memberId || null;
        pointsToDebit = Number(pu?.appliedPoints || 0);
      } catch {}
      if (pointsMemberId && pointsToDebit > 0) {
        const exist = await query(
          "SELECT id FROM points_transactions WHERE memberId = ? AND orderId = ? AND type = 'spend' AND direction = 'debit' LIMIT 1",
          [pointsMemberId, orderId]
        );
        if (!exist[0]) {
          await query(
            'INSERT INTO points_transactions (memberId, type, direction, amount, origin, activityId, orderId, meta) VALUES (?,?,?,?,?,?,?,?)',
            [pointsMemberId, 'spend', 'debit', pointsToDebit, 'order_payment', null, orderId, JSON.stringify({ via: 'wechat', notifiedAt: now.toISOString() })]
          );
          await query('UPDATE member_points_accounts SET balance = GREATEST(balance - ?, 0), updatedAt = CURRENT_TIMESTAMP WHERE memberId = ?', [pointsToDebit, pointsMemberId]);
        }
      }
    } catch {}
    // cashback voucher issue (tiered + special activity multiplier)
    try {
      const [cfg] = await query('SELECT cashbackRate, cashbackTiers, specialActivities FROM voucher_config ORDER BY id DESC LIMIT 1');
      const orderRows = await query('SELECT memberId, activityId FROM orders WHERE id = ?', [orderId]);
      const memberId = orderRows[0]?.memberId;
      const activityId = orderRows[0]?.activityId;
      if (memberId) {
        let baseRate = Number(cfg?.cashbackRate || 0);
        try {
          const tiers = cfg?.cashbackTiers ? JSON.parse(cfg.cashbackTiers) : [];
          if (Array.isArray(tiers) && tiers.length) {
            // pick highest threshold <= amount
            let chosen = null;
            const paid = Number(amount || 0);
            for (const t of tiers) {
              const th = Number(t.threshold || t.min || 0);
              const rt = Number(t.rate || 0);
              if (paid >= th && rt >= 0) {
                if (!chosen || th > chosen.th) chosen = { th, rt };
              }
            }
            if (chosen) baseRate = chosen.rt;
          }
        } catch {}
        let multiplier = 1;
        try {
          const specs = cfg?.specialActivities ? JSON.parse(cfg.specialActivities) : [];
          if (Array.isArray(specs) && specs.length && activityId) {
            const match = specs.find((s) => Number(s.activityId || s.activityID || s.id) === Number(activityId));
            if (match) multiplier = Number(match.cashbackMultiplier || match.multiplier || 1);
          }
        } catch {}
        const effRate = baseRate * (Number.isFinite(multiplier) ? multiplier : 1);
        const cashbackAmt = Number(((Number(amount || 0) * effRate)).toFixed(2));
        if (cashbackAmt > 0) {
          await query(
            "INSERT INTO member_vouchers (memberId, title, source, orderId, amount, balance, status, expireAt, meta) VALUES (?,?,?,?,?,?, 'available', NULL, ?)",
            [memberId, '报名返券', 'cashback', orderId, cashbackAmt, cashbackAmt, JSON.stringify({ via: 'wechat', paidAt: now.toISOString(), baseRate, multiplier })]
          );
        }
      }
    } catch {}
    res.json({ ok: true, paymentId: payResult.insertId });
  } catch (e) {
    try { await query('INSERT INTO payment_errors (provider, orderId, reason, detail) VALUES (?,?,?,?)', ['wechat', orderId || null, 'notify_error', e.message]); } catch {}
    res.status(500).json({ error: e.message });
  }
});
app.post('/api/payments/alipay/notify', async (req, res) => {
  const { orderId, amount, signature, providerTxnId } = req.body || {};
  const ok = hmacCheck(process.env.ALIPAY_KEY, { orderId, amount }, signature);
  if (!ok) {
    try { await query('INSERT INTO payment_errors (provider, orderId, reason, detail) VALUES (?,?,?,?)', ['alipay', orderId || null, 'invalid_signature', JSON.stringify({ orderId, amount })]); } catch {}
    return res.status(400).json({ error: 'invalid signature' });
  }
  try {
    const now = new Date();
    const existingPaid = await query("SELECT id FROM orders WHERE id = ? AND status = 'paid'", [orderId]);
    if (existingPaid[0]) {
      return res.json({ ok: true, skipped: true });
    }
    const payResult = await query(
      'INSERT INTO payments (orderId, provider, providerTxnId, status, amount, paidAt, meta, createdAt) VALUES (?,?,?,?,?,?,?,CURRENT_TIMESTAMP)',
      [orderId, 'alipay', providerTxnId || null, 'paid', amount || 0, now, JSON.stringify({ notifiedAt: now.toISOString() })]
    );
    await query("UPDATE orders SET status='paid', paidAt=? WHERE id=?", [now, orderId]);
    // points deduction from prepay meta (idempotent)
    try {
      const rows = await query(
        "SELECT id, meta FROM payments WHERE orderId = ? AND status = 'initiated' ORDER BY id DESC LIMIT 1",
        [orderId]
      );
      const pre = rows[0];
      let pointsMemberId = null;
      let pointsToDebit = 0;
      try {
        const m = pre?.meta ? JSON.parse(pre.meta) : null;
        const pu = m?.pointsUsage || null;
        pointsMemberId = pu?.memberId || null;
        pointsToDebit = Number(pu?.appliedPoints || 0);
      } catch {}
      if (pointsMemberId && pointsToDebit > 0) {
        const exist = await query(
          "SELECT id FROM points_transactions WHERE memberId = ? AND orderId = ? AND type = 'spend' AND direction = 'debit' LIMIT 1",
          [pointsMemberId, orderId]
        );
        if (!exist[0]) {
          await query(
            'INSERT INTO points_transactions (memberId, type, direction, amount, origin, activityId, orderId, meta) VALUES (?,?,?,?,?,?,?,?)',
            [pointsMemberId, 'spend', 'debit', pointsToDebit, 'order_payment', null, orderId, JSON.stringify({ via: 'alipay', notifiedAt: now.toISOString() })]
          );
          await query('UPDATE member_points_accounts SET balance = GREATEST(balance - ?, 0), updatedAt = CURRENT_TIMESTAMP WHERE memberId = ?', [pointsToDebit, pointsMemberId]);
        }
      }
    } catch {}
    // cashback voucher issue (tiered + special activity multiplier)
    try {
      const [cfg] = await query('SELECT cashbackRate, cashbackTiers, specialActivities FROM voucher_config ORDER BY id DESC LIMIT 1');
      const orderRows = await query('SELECT memberId, activityId FROM orders WHERE id = ?', [orderId]);
      const memberId = orderRows[0]?.memberId;
      const activityId = orderRows[0]?.activityId;
      if (memberId) {
        let baseRate = Number(cfg?.cashbackRate || 0);
        try {
          const tiers = cfg?.cashbackTiers ? JSON.parse(cfg.cashbackTiers) : [];
          if (Array.isArray(tiers) && tiers.length) {
            let chosen = null;
            const paid = Number(amount || 0);
            for (const t of tiers) {
              const th = Number(t.threshold || t.min || 0);
              const rt = Number(t.rate || 0);
              if (paid >= th && rt >= 0) {
                if (!chosen || th > chosen.th) chosen = { th, rt };
              }
            }
            if (chosen) baseRate = chosen.rt;
          }
        } catch {}
        let multiplier = 1;
        try {
          const specs = cfg?.specialActivities ? JSON.parse(cfg.specialActivities) : [];
          if (Array.isArray(specs) && specs.length && activityId) {
            const match = specs.find((s) => Number(s.activityId || s.activityID || s.id) === Number(activityId));
            if (match) multiplier = Number(match.cashbackMultiplier || match.multiplier || 1);
          }
        } catch {}
        const effRate = baseRate * (Number.isFinite(multiplier) ? multiplier : 1);
        const cashbackAmt = Number(((Number(amount || 0) * effRate)).toFixed(2));
        if (cashbackAmt > 0) {
          await query(
            "INSERT INTO member_vouchers (memberId, title, source, orderId, amount, balance, status, expireAt, meta) VALUES (?,?,?,?,?,?, 'available', NULL, ?)",
            [memberId, '报名返券', 'cashback', orderId, cashbackAmt, cashbackAmt, JSON.stringify({ via: 'alipay', paidAt: now.toISOString(), baseRate, multiplier })]
          );
        }
      }
    } catch {}
    res.json({ ok: true, paymentId: payResult.insertId });
  } catch (e) {
    try { await query('INSERT INTO payment_errors (provider, orderId, reason, detail) VALUES (?,?,?,?)', ['alipay', orderId || null, 'notify_error', e.message]); } catch {}
    res.status(500).json({ error: e.message });
  }
});

// Cancel signup and handle refunds/voucher restoration
app.post('/api/user/activity/cancel', async (req, res) => {
  const { orderId } = req.body || {};
  if (!orderId) return res.status(400).json({ error: 'orderId required' });
  try {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [orderRows] = await conn.execute('SELECT id, activityId, memberId, amount, status, voucherApplied FROM orders WHERE id = ? FOR UPDATE', [orderId]);
      const order = orderRows[0];
      if (!order) {
        await conn.rollback();
        conn.release();
        return res.status(404).json({ error: 'order not found' });
      }
      const [actRows] = await conn.execute('SELECT id, start, enrolled, waitlist FROM activities WHERE id = ? FOR UPDATE', [order.activityId]);
      const activity = actRows[0];
      if (!activity) {
        await conn.rollback();
        conn.release();
        return res.status(404).json({ error: 'activity not found' });
      }
      // If activity started, cannot cancel
      if (activity.start && new Date(activity.start) <= new Date()) {
        await conn.rollback();
        conn.release();
        return res.status(400).json({ error: 'activity started; cannot cancel' });
      }
      // Decrement counters based on order status
      const isWaitlist = order.status === 'waitlist';
      if (isWaitlist) {
        const wl = Math.max(Number(activity.waitlist || 0) - 1, 0);
        await conn.execute('UPDATE activities SET waitlist = ? WHERE id = ?', [wl, activity.id]);
      } else {
        const en = Math.max(Number(activity.enrolled || 0) - 1, 0);
        await conn.execute('UPDATE activities SET enrolled = ? WHERE id = ?', [en, activity.id]);
      }
      // Restore voucher usage if any
      try {
        const applied = order.voucherApplied ? JSON.parse(order.voucherApplied) : null;
        const vu = applied && applied.voucherUsage ? applied.voucherUsage : null;
        if (vu && vu.voucherId && Number(vu.usedAmount || 0) > 0) {
          await conn.execute(
            "UPDATE member_vouchers SET balance = balance + ?, status = 'available', usedAt = NULL WHERE id = ?",
            [Number(vu.usedAmount || 0), vu.voucherId]
          );
        }
      } catch {}
      const now = new Date();
      let newStatus = 'canceled';
      if (order.status === 'paid') {
        newStatus = 'refunded';
        // record refund payment entry (simplified)
        await conn.execute(
          'INSERT INTO payments (orderId, provider, providerTxnId, status, amount, refundAt, meta, createdAt) VALUES (?,?,?,?,?,?,?,CURRENT_TIMESTAMP)',
          [order.id, 'internal', null, 'refunded', Number(order.amount || 0), now, JSON.stringify({ reason: 'user_cancel', at: now.toISOString() })]
        );
      }
      await conn.execute('UPDATE orders SET status = ?, refundAt = ? WHERE id = ?', [newStatus, newStatus === 'refunded' ? now : null, order.id]);
      await conn.commit();
      conn.release();
      return res.json({ id: order.id, status: newStatus });
    } catch (e) {
      try { await pool.query('ROLLBACK'); } catch {}
      try { /* ensure release */ } catch {}
      return res.status(500).json({ error: e.message });
    }
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// Referral: return member's invitation code (create if missing)
app.get('/api/referral/code/:memberId', async (req, res) => {
  const memberId = Number(req.params.memberId);
  if (!Number.isFinite(memberId) || memberId <= 0) return res.status(400).json({ error: 'invalid member id' });
  try {
    const rows = await query('SELECT code FROM member_invite_codes WHERE memberId = ?', [memberId]);
    let code = rows[0]?.code;
    if (!code) {
      // generate simple base36 code with 8 chars
      const gen = Math.random().toString(36).slice(2, 10).toUpperCase();
      await query('INSERT INTO member_invite_codes (memberId, code) VALUES (?,?)', [memberId, gen]);
      code = gen;
    }
    res.json({ memberId, code });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Referral: bind invitation code to invitee
app.post('/api/referral/bind', async (req, res) => {
  const { memberId, invitationCode, channel } = req.body || {};
  const inviteeId = Number(memberId);
  if (!Number.isFinite(inviteeId) || inviteeId <= 0) return res.status(400).json({ error: 'invalid member id' });
  const code = String(invitationCode || '').trim().toUpperCase();
  if (!code) return res.status(400).json({ error: 'missing invitationCode' });
  try {
    const already = await query('SELECT id FROM referrals WHERE inviteeId = ?', [inviteeId]);
    if (already[0]) return res.json({ status: 'already_bound', inviteeId, inviterId: null });
    const owners = await query('SELECT memberId FROM member_invite_codes WHERE code = ?', [code]);
    const inviterId = owners[0]?.memberId;
    if (!inviterId) return res.status(404).json({ error: 'invalid invitation code' });
    if (inviterId === inviteeId) return res.status(400).json({ error: 'cannot bind self' });
    await query('INSERT INTO referrals (inviterId, inviteeId, channel) VALUES (?,?,?)', [inviterId, inviteeId, channel || null]);
    res.json({ status: 'bound', inviterId, inviteeId });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Stats overview
app.get('/api/stats/overview', async (req, res) => {
  try {
    const [orderCount] = await query('SELECT COUNT(*) AS cnt FROM orders');
    const [paidOrderCount] = await query("SELECT COUNT(*) AS cnt FROM orders WHERE status = 'paid'");
    const [totalPaidAmount] = await query("SELECT COALESCE(SUM(amount),0) AS amt FROM orders WHERE status = 'paid'");
    const [totalRefundedAmount] = await query("SELECT COALESCE(SUM(amount),0) AS amt FROM orders WHERE status = 'refunded'");
    res.json({
      totalOrders: Number(orderCount?.cnt || 0),
      paidOrders: Number(paidOrderCount?.cnt || 0),
      totalPaidAmount: Number(totalPaidAmount?.amt || 0),
      totalRefundedAmount: Number(totalRefundedAmount?.amt || 0),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Stats daily
app.get('/api/stats/daily', async (req, res) => {
  const from = req.query.from;
  const to = req.query.to;
  if (!from || !to) return res.status(400).json({ error: 'from/to required (YYYY-MM-DD)' });
  try {
    const orderRows = await query(
      'SELECT DATE(createdAt) AS d, COUNT(*) AS cnt FROM orders WHERE DATE(createdAt) BETWEEN ? AND ? GROUP BY DATE(createdAt) ORDER BY d',
      [from, to]
    );
    const paidRows = await query(
      "SELECT DATE(paidAt) AS d, COALESCE(SUM(amount),0) AS amt FROM orders WHERE status = 'paid' AND DATE(paidAt) BETWEEN ? AND ? GROUP BY DATE(paidAt) ORDER BY d",
      [from, to]
    );
    const map = {};
    orderRows.forEach((r) => { map[r.d] = { date: r.d, orders: Number(r.cnt || 0), paidAmount: 0 }; });
    paidRows.forEach((r) => { map[r.d] = { ...(map[r.d] || { date: r.d, orders: 0, paidAmount: 0 }), paidAmount: Number(r.amt || 0) }; });
    const days = [];
    const start = new Date(from + 'T00:00:00');
    const end = new Date(to + 'T00:00:00');
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const key = d.toISOString().slice(0, 10);
      const item = map[key] || { date: key, orders: 0, paidAmount: 0 };
      days.push(item);
    }
    res.json(days);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Stats trends by week/month
app.get('/api/stats/trends', async (req, res) => {
  const granularity = (req.query.granularity || 'week').toLowerCase();
  const from = req.query.from;
  const to = req.query.to;
  if (!from || !to) return res.status(400).json({ error: 'from/to required (YYYY-MM-DD)' });
  try {
    if (granularity === 'week') {
      const rows = await query(
        `SELECT YEARWEEK(createdAt, 1) AS w, COUNT(*) AS orders, SUM(CASE WHEN status='paid' THEN amount ELSE 0 END) AS paidAmount
         FROM orders WHERE DATE(createdAt) BETWEEN ? AND ? GROUP BY YEARWEEK(createdAt, 1) ORDER BY w`, [from, to]);
      return res.json(rows.map(r => ({ week: String(r.w), orders: Number(r.orders||0), paidAmount: Number(r.paidAmount||0) })));
    } else if (granularity === 'month') {
      const rows = await query(
        `SELECT DATE_FORMAT(createdAt, '%Y-%m') AS m, COUNT(*) AS orders, SUM(CASE WHEN status='paid' THEN amount ELSE 0 END) AS paidAmount
         FROM orders WHERE DATE(createdAt) BETWEEN ? AND ? GROUP BY DATE_FORMAT(createdAt, '%Y-%m') ORDER BY m`, [from, to]);
      return res.json(rows.map(r => ({ month: String(r.m), orders: Number(r.orders||0), paidAmount: Number(r.paidAmount||0) })));
    }
    return res.status(400).json({ error: 'granularity must be week|month' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Stats category share
app.get('/api/stats/category-share', async (req, res) => {
  const from = req.query.from;
  const to = req.query.to;
  if (!from || !to) return res.status(400).json({ error: 'from/to required (YYYY-MM-DD)' });
  try {
    const orders = await query(`SELECT o.id, o.amount, o.status, o.activityId FROM orders o WHERE DATE(o.createdAt) BETWEEN ? AND ? AND o.status='paid'`, [from, to]);
    const map = new Map(); // categoryId -> amount
    for (const o of orders) {
      let cats = [];
      if (o.activityId) {
        const rows = await query('SELECT categoryIds FROM activities WHERE id = ?', [o.activityId]);
        const raw = rows[0]?.categoryIds;
        try { cats = raw ? JSON.parse(raw) : []; } catch { cats = []; }
      }
      if (!cats || cats.length === 0) continue;
      const split = Number(o.amount || 0) / cats.length;
      cats.forEach(cid => {
        const prev = map.get(cid) || 0;
        map.set(cid, prev + split);
      });
    }
    const catRows = await query('SELECT id, name FROM categories');
    const result = catRows.map(c => ({ categoryId: c.id, categoryName: c.name, amount: Number(map.get(c.id) || 0) }));
    const total = result.reduce((s, r) => s + r.amount, 0);
    const withShare = result.map(r => ({ ...r, share: total > 0 ? r.amount / total : 0 }));
    res.json(withShare);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Export Excel/PNG report
app.get('/api/stats/export', async (req, res) => {
  const type = (req.query.type || 'excel').toLowerCase();
  const granularity = (req.query.granularity || 'week').toLowerCase();
  const from = req.query.from;
  const to = req.query.to;
  if (!from || !to) return res.status(400).json({ error: 'from/to required' });
  try {
    const trendsResp = await (await fetch(`http://localhost:${PORT}/api/stats/trends?granularity=${granularity}&from=${from}&to=${to}`)).json();
    const shareResp = await (await fetch(`http://localhost:${PORT}/api/stats/category-share?from=${from}&to=${to}`)).json();
    if (type === 'excel') {
      const wb = XLSX.utils.book_new();
      const tSheet = XLSX.utils.json_to_sheet(trendsResp);
      const sSheet = XLSX.utils.json_to_sheet(shareResp);
      XLSX.utils.book_append_sheet(wb, tSheet, 'Trends');
      XLSX.utils.book_append_sheet(wb, sSheet, 'CategoryShare');
      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="report-${granularity}.xlsx"`);
      return res.send(buf);
    } else if (type === 'png') {
      const width = 800, height = 400;
      const chartJSNodeCanvas = new ChartJSNodeCanvas({ width, height });
      const labels = trendsResp.map(x => x.week || x.month);
      const paid = trendsResp.map(x => Number(x.paidAmount || 0));
      const config = {
        type: 'line',
        data: { labels, datasets: [{ label: 'Paid Amount', data: paid, borderColor: 'rgba(54,162,235,1)', backgroundColor: 'rgba(54,162,235,0.2)' }] },
        options: { responsive: false }
      };
      const image = await chartJSNodeCanvas.renderToBuffer(config);
      res.setHeader('Content-Type', 'image/png');
      return res.send(image);
    }
    return res.status(400).json({ error: 'type must be excel|png' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Points settlement job: admin-triggered
app.post('/api/points/settlement/run', authMiddleware, async (req, res) => {
  const { activityId, start, end, afterEndedMinutes = 30, batchSize = 100, dryRun = false } = req.body || {};
  const aid = Number(activityId);
  if (!Number.isFinite(aid) || aid <= 0) return res.status(400).json({ error: 'invalid activityId' });
  const s = start ? new Date(start) : null;
  const e = end ? new Date(end) : null;
  try {
    const [activity] = await query('SELECT id, end FROM activities WHERE id = ?', [aid]);
    if (!activity) return res.status(404).json({ error: 'activity not found' });
    const now = new Date();
    if (activity.end && !dryRun) {
      const diffMs = now - new Date(activity.end);
      if (diffMs < Number(afterEndedMinutes || 0) * 60_000) {
        return res.status(400).json({ error: 'too_early_to_settle' });
      }
    }
    const jobRes = await query('INSERT INTO points_settlement_jobs (activityId, status, dryRun, params, startedAt) VALUES (?,?,?,?,CURRENT_TIMESTAMP)', [aid, 'running', dryRun ? 1 : 0, JSON.stringify({ start, end, afterEndedMinutes, batchSize, dryRun })]);
    const jobId = jobRes?.insertId || null;
    let processed = 0, skipped = 0, errors = 0;
    const where = ['status = \'paid\'', 'activityId = ?'];
    const args = [aid];
    if (s) { where.push('paidAt >= ?'); args.push(s); }
    if (e) { where.push('paidAt <= ?'); args.push(e); }
    const orders = await query(`SELECT id, memberId, amount FROM orders WHERE ${where.join(' AND ')} ORDER BY id ASC`, args);
    for (let i = 0; i < orders.length; i += 1) {
      const o = orders[i];
      try {
        // idempotency: check existing settlement transaction
        const exist = await query('SELECT id FROM points_transactions WHERE memberId = ? AND orderId = ? AND type = \'settlement\'', [o.memberId, o.id]);
        if (exist[0]) { skipped += 1; continue; }
        const pts = Math.floor(Number(o.amount || 0) * 10000);
        if (pts > 0 && !dryRun) {
          await recordPointsTransaction(o.memberId, { type: 'settlement', direction: 'credit', amount: pts, origin: 'job', activityId: aid, orderId: o.id, meta: { via: 'activity_end' } });
        }
        // referral bonus: 100 points for inviter per paid order of invitee (idempotent per order)
        const refRows = await query('SELECT inviterId FROM referrals WHERE inviteeId = ?', [o.memberId]);
        const inviterId = refRows[0]?.inviterId;
        if (inviterId) {
          const exists = await query("SELECT id FROM points_transactions WHERE memberId = ? AND orderId = ? AND type = 'referral'", [inviterId, o.id]);
          if (!exists[0] && !dryRun) {
            const referralPts = Math.floor(Number(o.amount || 0) * 100);
            if (referralPts > 0) {
              await recordPointsTransaction(inviterId, { type: 'referral', direction: 'credit', amount: referralPts, origin: 'job', activityId: aid, orderId: o.id, meta: { inviteeId: o.memberId, ratio: '100_per_RMB' } });
            }
          }
        }
        processed += 1;
      } catch (err) {
        errors += 1;
      }
    }
    await query('UPDATE points_settlement_jobs SET status = ?, processed = ?, skipped = ?, errors = ?, finishedAt = CURRENT_TIMESTAMP WHERE id = ?', ['done', processed, skipped, errors, jobId]);
    res.json({ jobId, activityId: aid, processed, skipped, errors, dryRun: !!dryRun });
  } catch (e2) {
    res.status(500).json({ error: e2.message });
  }
});

// Weekly cron job: generate last week report to reports/
const REPORT_DIR = path.join(process.cwd(), 'reports');
if (!fs.existsSync(REPORT_DIR)) {
  try { fs.mkdirSync(REPORT_DIR, { recursive: true }); } catch {}
}
cron.schedule('0 9 * * 1', async () => {
  const now = new Date();
  // last week Monday to Sunday
  const monday = new Date(now);
  const day = monday.getDay(); // 0-6
  const diffToMonday = ((day + 6) % 7) + 7; // previous week Monday
  monday.setDate(monday.getDate() - diffToMonday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const from = monday.toISOString().slice(0,10);
  const to = sunday.toISOString().slice(0,10);
  try {
    const trendsRows = await query(
      `SELECT YEARWEEK(createdAt, 1) AS w, COUNT(*) AS orders, SUM(CASE WHEN status='paid' THEN amount ELSE 0 END) AS paidAmount
       FROM orders WHERE DATE(createdAt) BETWEEN ? AND ? GROUP BY YEARWEEK(createdAt, 1) ORDER BY w`, [from, to]);
    const shareResp = await (await fetch(`http://localhost:${PORT}/api/stats/category-share?from=${from}&to=${to}`)).json();
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(trendsRows), 'Trends');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(shareResp), 'CategoryShare');
    const xlsxPath = path.join(REPORT_DIR, `weekly-${from}-to-${to}.xlsx`);
    XLSX.writeFile(wb, xlsxPath);
    const width = 800, height = 400;
    const chartJSNodeCanvas = new ChartJSNodeCanvas({ width, height });
    const labels = trendsRows.map(x => String(x.w));
    const paid = trendsRows.map(x => Number(x.paidAmount || 0));
    const config = { type: 'line', data: { labels, datasets: [{ label: 'Paid Amount', data: paid, borderColor: 'rgba(54,162,235,1)', backgroundColor: 'rgba(54,162,235,0.2)' }] }, options: { responsive: false } };
    const image = await chartJSNodeCanvas.renderToBuffer(config);
    const pngPath = path.join(REPORT_DIR, `weekly-${from}-to-${to}.png`);
    fs.writeFileSync(pngPath, image);
    console.log(`[cron] Weekly report generated: ${xlsxPath}, ${pngPath}`);
  } catch (e) {
    console.error('[cron] weekly report failed:', e.message);
  }
});

// Voucher config
app.get('/api/voucher', async (req, res) => {
  try {
    const rows = await query('SELECT discountRate, maxDiscount, cashbackRate, singleVoucherOnly, minAmount, categoryRules, cashbackTiers, specialActivities, updatedAt FROM voucher_config ORDER BY id DESC LIMIT 1');
    const raw = rows[0] || { discountRate: 0, maxDiscount: 0, cashbackRate: 0, singleVoucherOnly: 0, minAmount: 0, categoryRules: null, cashbackTiers: null, specialActivities: null, updatedAt: null };
    // parse JSON fields to objects
    const cfg = {
      discountRate: Number(raw.discountRate || 0),
      maxDiscount: Number(raw.maxDiscount || 0),
      cashbackRate: Number(raw.cashbackRate || 0),
      singleVoucherOnly: Number(raw.singleVoucherOnly || 0) === 1,
      minAmount: Number(raw.minAmount || 0),
      categoryRules: raw.categoryRules ? (() => { try { return JSON.parse(raw.categoryRules); } catch { return []; } })() : [],
      cashbackTiers: raw.cashbackTiers ? (() => { try { return JSON.parse(raw.cashbackTiers); } catch { return []; } })() : [],
      specialActivities: raw.specialActivities ? (() => { try { return JSON.parse(raw.specialActivities); } catch { return []; } })() : [],
      updatedAt: raw.updatedAt,
    };
    res.json(cfg);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.put('/api/voucher', async (req, res) => {
  const { discountRate = 0, maxDiscount = 0, cashbackRate = 0, singleVoucherOnly = false, minAmount = 0, categoryRules = [], cashbackTiers = [], specialActivities = [] } = req.body || {};
  try {
    const rows = await query('SELECT id FROM voucher_config ORDER BY id DESC LIMIT 1');
    if (rows[0]) {
      await query(
        'UPDATE voucher_config SET discountRate=?, maxDiscount=?, cashbackRate=?, singleVoucherOnly=?, minAmount=?, categoryRules=?, cashbackTiers=?, specialActivities=? WHERE id=?',
        [discountRate, maxDiscount, cashbackRate, singleVoucherOnly ? 1 : 0, minAmount, JSON.stringify(categoryRules || []), JSON.stringify(cashbackTiers || []), JSON.stringify(specialActivities || []), rows[0].id]
      );
    } else {
      await query(
        'INSERT INTO voucher_config (discountRate, maxDiscount, cashbackRate, singleVoucherOnly, minAmount, categoryRules, cashbackTiers, specialActivities) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [discountRate, maxDiscount, cashbackRate, singleVoucherOnly ? 1 : 0, minAmount, JSON.stringify(categoryRules || []), JSON.stringify(cashbackTiers || []), JSON.stringify(specialActivities || [])]
      );
    }
    const latest = await query('SELECT discountRate, maxDiscount, cashbackRate, singleVoucherOnly, minAmount, categoryRules, cashbackTiers, specialActivities, updatedAt FROM voucher_config ORDER BY id DESC LIMIT 1');
    const raw = latest[0] || {};
    const cfg = {
      discountRate: Number(raw.discountRate || 0),
      maxDiscount: Number(raw.maxDiscount || 0),
      cashbackRate: Number(raw.cashbackRate || 0),
      singleVoucherOnly: Number(raw.singleVoucherOnly || 0) === 1,
      minAmount: Number(raw.minAmount || 0),
      categoryRules: raw.categoryRules ? (() => { try { return JSON.parse(raw.categoryRules); } catch { return []; } })() : [],
      cashbackTiers: raw.cashbackTiers ? (() => { try { return JSON.parse(raw.cashbackTiers); } catch { return []; } })() : [],
      specialActivities: raw.specialActivities ? (() => { try { return JSON.parse(raw.specialActivities); } catch { return []; } })() : [],
      updatedAt: raw.updatedAt,
    };
    res.json(cfg);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, () => {
  console.log(`GoUp server listening on http://localhost:${PORT}`);
});