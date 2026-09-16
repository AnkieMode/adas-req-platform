# ADAS 软硬件项目需求管理平台

大众 × 华为 LAH 需求交换场景的需求管理平台：67 个需求模块（HW/SW 分类、FO 责任人）、需求流转状态机、华为打标 7 日时限跟踪（黄/红预警）、列表 / 看板 / 甘特三版联动。

> 技术栈复用 xhs-platform 的组件选型（React 18 + TS + AntD 5 + ECharts + dnd-kit / Express + better-sqlite3 + JWT），按需求管理场景重新建模。

## 功能

- **三版联动**：需求列表 / 状态看板 / 打标时间线，选中同一模块三视图联动高亮，共享筛选条件
- **状态机**（依据 Requirement Exchange Guideline）：
  `已发送华为 ⇄ 已变更 → 华为打标中 / 待澄清 / 拒绝待澄清 → 已锁定 / 已取消`（终态不可流转，非法流转在接口层与 UI 层双重拦截）
- **打标时限引擎**：模块发送华为后 **7 日内**须打标回传——第 4~6 天 🟡 黄色预警，第 7 天起 🔴 红色逾期
- **交换记录**：OEM / 华为双侧评论，自动附加 `[dd/mm/yyyy, 姓名]` 前缀（符合 guideline 评论规范）
- **总览看板**：状态分布、HW/SW 占比、FO 负载 Top10、打标风险告警清单、需求条目统计（华为打标结果口径）
- **用户管理**：管理员 / 同事（Cariad）/ 华为供应商 / 只读 四级角色

## 权限矩阵

| 角色 | 查看 | 流转状态 | 改需求内容 | 交换记录 | 用户管理 |
| --- | --- | --- | --- | --- | --- |
| `admin` 管理员 | ✅ | ✅ | ✅ | ✅（可代记任一侧） | ✅ |
| `editor` 同事（Cariad） | ✅ | ✅ | — | — | — |
| `supplier` 华为供应商 | ✅ | ✅ | — | ✅（固定记 SUPPLIER 侧） | — |
| `viewer` 只读 | ✅ | — | — | — | — |

## 快速开始

```bash
# 后端
cd server && npm install && npm run import && npm run dev   # http://localhost:3002

# 前端（开发）
cd client && npm install && npm run dev                     # http://localhost:5174
```

默认账号（密码均为 `adas2026`）：`admin`（管理员）、`cariad01`（同事）、`huawei01`（华为供应商）、`pmo01`（只读）。

`npm run import` 会从 `server/scripts/seed-data.json`（源自 `20241121_Overall requirement list.xlsx` Meeting 页 67 个模块）导入数据，日期按导入日"复活"：50 个已锁定分布在近 100 天，17 个流转中分布在近 2 周（含 2 红 2 黄演示案例）。

## 测试与 CI

```bash
cd server && npm test        # 27 项：风险引擎 10 + 种子数据 5 + 接口冒烟 12（真实起服务走 HTTP 全链路）
cd client && npm run typecheck   # tsc --noEmit 严格类型检查
cd client && npm run build
```

`.github/workflows/test.yml` 在每次 push / PR 时并行执行两个 job：`server-test`（安装依赖 → 跑测试）与 `client-build`（类型检查 → 生产构建）。**类型检查与构建是分开的两步**——`vite build` 用 esbuild 转译，不做类型检查，类型错误只有 `tsc --noEmit` 才拦得住。

## 部署

当前线上方式：腾讯云轻量服务器（Ubuntu）+ systemd 常驻进程，Express 同时托管前端构建产物，单端口对外。

```
线上地址：http://82.156.158.253:3002
代码目录：/home/ubuntu/adas-req-platform（server/ 源码 + client/dist 构建产物）
数据目录：/home/ubuntu/adas-req-platform/data（独立 SQLite 文件 adas-req.db）
服务文件：deploy/adas-req-platform.service
```

更新流程：

```bash
# 1) 本地构建前端
cd client && npm run build
# 2) 上传服务端源码与构建产物，重启服务
scp -r server client/dist ubuntu@<host>:~/adas-req-platform/
ssh ubuntu@<host> "sudo systemctl restart adas-req-platform"
# 3) 验证
curl -s http://<host>:3002/api/health
```

> `Dockerfile` 与 `deploy/docker-compose.yml` 为可选的容器化部署方式（未在生产启用），生产环境以 systemd 为准。

## 数据隔离说明

本项目使用独立 SQLite 数据库文件 `adas-req.db`（`DATA_DIR` 环境变量控制，默认 `server/data`，生产环境 `/home/ubuntu/adas-req-platform/data`），与 xhs-platform 的 `app.db` 无任何交集。

## 版本

当前版本 **v1.0.0**（见 GitHub Releases）。生产环境部署 JWT 密钥等敏感配置一律通过环境变量注入，仓库内只保留占位符。
