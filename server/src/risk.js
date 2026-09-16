// 状态机与逾期风险引擎
// 状态定义参考《Requirement_exchange_guideline.pptx》LAH exchange process flow
// OEM 侧: DRAFT -> NEW -> TRANSMITTED -> (华为反馈) -> ACCEPTED / REJECTION_TO_BE_CLARIFIED / CANCELLED（终态）
// 华为侧反馈: TO_BE_CLARIFIED / IN_REVIEW / ACCEPTED / REJECTED / N/A

const STATUSES = [
  'transmitted',      // 已发送华为：正式发出，计时开始（7 日内须打标回传）
  'changed',          // 已变更：需求内容变更，待重新发送
  'in_review',        // 华为打标中：依赖 MDC 内其他需求暂无法定案
  'to_be_clarified',  // 待澄清：华为已打标，依赖其他系统部件需求，需 VWG 对齐
  'rejection_tbc',    // 拒绝待澄清：华为拒绝，OEM 未接受
  'accepted',         // 已锁定：华为接受/打标完成，终态
  'cancelled',        // 已取消：需求不再有效，终态
];

const STATUS_LABELS = {
  transmitted: '已发送华为',
  changed: '已变更',
  in_review: '华为打标中',
  to_be_clarified: '待澄清',
  rejection_tbc: '拒绝待澄清',
  accepted: '已锁定',
  cancelled: '已取消',
};

// 允许的状态流转（看板拖拽 / 编辑校验）
const TRANSITIONS = {
  transmitted: ['in_review', 'to_be_clarified', 'changed', 'cancelled'],
  changed: ['transmitted', 'cancelled'],
  in_review: ['accepted', 'to_be_clarified', 'rejection_tbc', 'cancelled'],
  to_be_clarified: ['transmitted', 'accepted', 'cancelled'],
  rejection_tbc: ['transmitted', 'accepted', 'cancelled'],
  accepted: [],        // 终态
  cancelled: [],       // 终态
};

const SUPPLIER_STATUS = ['TO_BE_CLARIFIED', 'IN_REVIEW', 'ACCEPTED', 'REJECTED', 'N/A'];
const SUPPLIER_LABELS = {
  TO_BE_CLARIFIED: '待澄清',
  IN_REVIEW: '评审中',
  ACCEPTED: '已接受',
  REJECTED: '已拒绝',
  'N/A': '不涉及',
};

const RISK_LABELS = { red: '已逾期', yellow: '临期预警', green: '打标中', none: '—' };
const RISK_COLORS = { red: '#f5222d', yellow: '#fa8c16', green: '#52c41a', none: '#d9d9d9' };

// 逾期规则：需求发送华为后 7 日内必须打标回传。
// 第 4~6 天（剩余<=3天）黄色预警；第 7 天起红色逾期。已打标（labeled_at 有值）或非计时状态不参与。
function riskLevel(mod, now = new Date()) {
  if (!mod.sent_at || mod.labeled_at) return 'none';
  if (mod.status !== 'transmitted') return 'none';
  const sent = new Date(mod.sent_at + 'T00:00:00');
  if (Number.isNaN(sent.getTime())) return 'none';
  const dayMs = 24 * 60 * 60 * 1000;
  const startOf = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.floor((startOf(now) - startOf(sent)) / dayMs);
  if (days >= 7) return 'red';
  if (days >= 4) return 'yellow';
  return 'green';
}

// 日期一律按本地时区格式化。
// 不用 toISOString().slice(0,10)：它取的是 UTC 日期，北京时间 08:00 前会算成前一天，
// 导致 7 日打标计时整体偏差 1 天（状态流转、数据导入都依赖这里）。
function fmtLocal(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function todayLocal(now = new Date()) {
  return fmtLocal(now);
}
function deadlineOf(sentAt) {
  if (!sentAt) return null;
  const d = new Date(sentAt + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + 7);
  return fmtLocal(d);
}

function decorate(mod, now = new Date()) {
  // sent_at 异常（非法日期）时不该输出 NaN，统一回落为 null
  let daysElapsed = null;
  if (mod.sent_at) {
    const sent = new Date(mod.sent_at + 'T00:00:00');
    if (!Number.isNaN(sent.getTime())) {
      daysElapsed = Math.max(0, Math.floor((startOfDay(now) - startOfDay(sent)) / 86400000));
    }
  }
  return {
    ...mod,
    deadline_at: deadlineOf(mod.sent_at),
    risk: riskLevel(mod, now),
    days_elapsed: daysElapsed,
  };
}

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function canTransition(from, to) {
  if (from === to) return false;
  return (TRANSITIONS[from] || []).includes(to);
}

module.exports = {
  STATUSES, STATUS_LABELS, TRANSITIONS,
  SUPPLIER_STATUS, SUPPLIER_LABELS,
  RISK_LABELS, RISK_COLORS,
  riskLevel, deadlineOf, decorate, canTransition,
  fmtLocal, todayLocal,
};
