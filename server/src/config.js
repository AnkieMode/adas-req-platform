// 环境变量配置
const path = require('path');

// 数据目录：默认项目内 server/data；服务器部署时通过 DATA_DIR 指向独立目录
// （与 xhs-platform 的数据完全隔离，各自独立 SQLite 文件）
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const PORT = process.env.PORT || 3002;

// JWT 密钥：生产环境必须显式注入——仓库里的默认值一旦生效，任何人都能伪造 token。
// 开发环境未设置时生成本次进程内有效的随机密钥（重启后旧 token 失效，属预期行为）。
let JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    console.error('[config] 生产环境必须设置 JWT_SECRET（建议 32 位以上随机串），已停止启动');
    process.exit(1);
  }
  JWT_SECRET = require('crypto').randomBytes(32).toString('hex');
  console.warn('[config] 未设置 JWT_SECRET，已生成进程内临时密钥（重启后已签发 token 失效）');
}

const JWT_EXPIRES = '7d';
const CORS_ORIGIN = process.env.CORS_ORIGIN || '';

// 登录失败限流：窗口内同 IP+用户名失败超过 maxAttempts 次即暂时拒绝
const LOGIN_MAX_ATTEMPTS = Number(process.env.LOGIN_MAX_ATTEMPTS || 10);
const LOGIN_WINDOW_MS = Number(process.env.LOGIN_WINDOW_MS || 10 * 60 * 1000);

module.exports = { DATA_DIR, PORT, JWT_SECRET, JWT_EXPIRES, CORS_ORIGIN, LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW_MS };
