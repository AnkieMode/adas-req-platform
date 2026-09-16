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
// 状态流转权限：admin / editor(Cariad) / supplier(华为供应商)；viewer 只读
// 说明：具体接口的权限在 src/index.js 内联判定（按“是否只改 status 字段”区分），
// 这里只保留登录态校验与管理员校验，避免出现与实际授权逻辑不一致的死中间件。

function adminRequired(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: '仅管理员可操作' });
  }
  next();
}

module.exports = { sign, authRequired, adminRequired, ROLES, STATUS_ROLES };
