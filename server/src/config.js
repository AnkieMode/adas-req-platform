// 环境变量配置
const path = require('path');

// 数据目录：默认项目内 server/data；服务器部署时通过 DATA_DIR 指向独立目录
// （与 xhs-platform 的数据完全隔离，各自独立 SQLite 文件）
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const PORT = process.env.PORT || 3002;
const JWT_SECRET = process.env.JWT_SECRET || 'adas-req-dev-secret-change-me';
const JWT_EXPIRES = '7d';
const CORS_ORIGIN = process.env.CORS_ORIGIN || '';

module.exports = { DATA_DIR, PORT, JWT_SECRET, JWT_EXPIRES, CORS_ORIGIN };
