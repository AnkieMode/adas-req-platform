# ADAS 软硬件项目需求管理平台

大众 × 华为 LAH 需求交换场景的需求管理平台：67 个需求模块（HW/SW 分类、FO 责任人）、需求流转状态机、华为打标 7 日时限跟踪（黄/红预警）、列表/看板/甘特三版联动。

> 底座复用 xhs-platform 的技术栈与组件（React 18 + TS + AntD 5 + ECharts + dnd-kit / Express + better-sqlite3 + JWT），按需求管理场景重新建模。

## 功能

- **三版联动**：需求列表 / 状态看板 / 打标时间线，选中同一模块三视图联动高亮，共享筛选条件
- **状态机**（依据 Requirement Exchange Guideline）：
  `草稿 → 新建 → 已发送华为 → 华为打标中 / 待澄清 / 拒绝待澄清 → 已锁定 / 已取消`（终态不可流转）
- **打标时限引擎**：模块发送华为后 **7 日内**须打标回传——第 4~6 天 🟡 黄色预警，第 7 天起 🔴 红色逾期
- **交换记录**：OEM / 华为双侧评论，自动附加 `[dd/mm/yyyy, 姓名]` 前缀（符合 guideline 评论规范）
- **总览看板**：状态分布、HW/SW 占比、FO 负载 Top10、风险告警清单
- **用户管理**：管理员 / 编辑 / 只读 三级角色

## 快速开始

```bash
# 后端
cd server && npm install && npm run import && npm run dev   # http://localhost:3002

# 前端（开发）
cd client && npm install && npm run dev                     # http://localhost:5174
```

默认账号：`admin / adas2026`（管理员）、`pmo01 / adas2026`（只读）。

`npm run import` 会从 `server/scripts/seed-data.json`（源自 20241121_Overall requirement list.xlsx Meeting 页 67 个模块）导入数据，日期按导入日"复活"：50 个已锁定分布在近 100 天，17 个流转中分布在近 2 周（含 2 红 2 黄演示案例）。

## 测试

```bash
cd server && npm test   # 12 个用例：逾期引擎 / 状态流转 / 种子数据完整性
```

## 部署

```bash
docker build -t adas-req-platform .
# 服务器上（数据挂载 /opt/adas-req/data，与 xhs-platform 完全隔离）：
# docker compose -f deploy/docker-compose.yml up -d   # 端口 3002
```

## 数据隔离说明

本项目使用独立 SQLite 数据库文件 `adas-req.db`（`DATA_DIR` 环境变量控制，默认 `server/data`，生产环境 `/opt/adas-req/data`），与 xhs-platform 的 `app.db` 无任何交集。
