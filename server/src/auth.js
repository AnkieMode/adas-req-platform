// JWT 认证与角色鉴权
const jwt = require('jsonwebtoken');
const { JWT_SECRET, JWT_EXPIRES } = require('./config');

const ROLES = ['admin', 'editor', 'supplier', 'viewer'];
// 可流转需求状态的角色：管理员 / 同事(Cariad) / 华为供应商
const STATUS_ROLES = ['admin', 'editor', 'supplier'];

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

// 状态流转权限：admin / editor(Cariad) / supplier(华为供应商)；viewer 只读
function statusRequired(req, res, next) {
  if (!req.user || !STATUS_ROLES.includes(req.user.role)) {
    return res.status(403).json({ error: '无状态流转权限（只读账号）' });
  }
  next();
}

function adminRequired(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: '仅管理员可操作' });
  }
  next();
}

module.exports = { sign, authRequired, writeRequired, statusRequired, adminRequired, ROLES, STATUS_ROLES };
