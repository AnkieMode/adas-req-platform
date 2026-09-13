// 类型与常量（与后端 risk.js 保持一致）
export type Status =
  | 'transmitted' | 'changed' | 'in_review'
  | 'to_be_clarified' | 'rejection_tbc' | 'accepted' | 'cancelled';

export type Risk = 'red' | 'yellow' | 'green' | 'none';

export interface Module {
  id: number;
  seq: number | null;
  module_name: string;
  hwsw: 'HW' | 'SW';
  fo_name: string | null;
  fo_email: string | null;
  subdomain: string | null;
  spdt: string | null;
  status: Status;
  supplier_status: string | null;
  sent_at: string | null;
  labeled_at: string | null;
  locked_at: string | null;
  deadline_at?: string | null;
  risk?: Risk;
  days_elapsed?: number | null;
  total_reqs: number;
  accepted_reqs: number;
  rejected_reqs: number;
  na_reqs: number;
  tbc_reqs: number;
  outstanding_reqs: number;
  remark: string | null;
}

export interface Comment {
  id: number;
  module_id: number;
  side: 'OEM' | 'SUPPLIER';
  author: string;
  body: string;
  created_at: string;
}

export interface UserInfo {
  id: number;
  username: string;
  display_name: string;
  role: 'admin' | 'editor' | 'viewer';
  fo_name?: string | null;
}

export const STATUS_ORDER: Status[] = [
  'transmitted', 'changed', 'in_review',
  'to_be_clarified', 'rejection_tbc', 'accepted', 'cancelled',
];

export const STATUS_LABELS: Record<Status, string> = {
  transmitted: '已发送华为',
  changed: '已变更',
  in_review: '华为打标中',
  to_be_clarified: '待澄清',
  rejection_tbc: '拒绝待澄清',
  accepted: '已锁定',
  cancelled: '已取消',
};

export const STATUS_COLORS: Record<Status, string> = {
  transmitted: '#1677ff',
  changed: '#faad14',
  in_review: '#722ed1',
  to_be_clarified: '#fa8c16',
  rejection_tbc: '#eb2f96',
  accepted: '#52c41a',
  cancelled: '#bfbfbf',
};

export const SUPPLIER_LABELS: Record<string, string> = {
  TO_BE_CLARIFIED: '待澄清',
  IN_REVIEW: '评审中',
  ACCEPTED: '已接受',
  REJECTED: '已拒绝',
  'N/A': '不涉及',
};

export const RISK_LABELS: Record<Risk, string> = {
  red: '已逾期',
  yellow: '临期预警',
  green: '打标计时中',
  none: '—',
};

export const RISK_COLORS: Record<Risk, string> = {
  red: '#f5222d',
  yellow: '#fa8c16',
  green: '#52c41a',
  none: '#d9d9d9',
};

export const TRANSITIONS: Record<Status, Status[]> = {
  transmitted: ['in_review', 'to_be_clarified', 'changed', 'cancelled'],
  changed: ['transmitted', 'cancelled'],
  in_review: ['accepted', 'to_be_clarified', 'rejection_tbc', 'cancelled'],
  to_be_clarified: ['transmitted', 'accepted', 'cancelled'],
  rejection_tbc: ['transmitted', 'accepted', 'cancelled'],
  accepted: [],
  cancelled: [],
};
