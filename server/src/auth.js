// JWT 认证与角色鉴权
const jwt = require('jsonwebtoken');
const { JWT_SECRET, JWT_EXPIRES } = require('./config');

const ROLES = ['admin', 'editor', 'viewer'];

function sign(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role, display_name: user.display_name },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );
}

function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: '未登录' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: '登录已过期，请重新登录' });
  }
}

// 写权限：admin / editor；viewer 只读
function writeRequired(req, res, next) {
  if (!req.user || !['admin', 'editor'].includes(req.user.role)) {
    return res.status(403).json({ error: '无写权限（只读账号）' });
  }
  next();
}

function adminRequired(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: '仅管理员可操作' });
  }
  next();
}

module.exports = { sign, authRequired, writeRequired, adminRequired, ROLES };
