import React from 'react';
import { Tag, Tooltip } from 'antd';
import { STATUS_LABELS, STATUS_COLORS, RISK_LABELS, RISK_COLORS } from '../types';
import type { Status, Risk } from '../types';

export function StatusTag({ status }: { status: Status }) {
  return (
    <Tag color={STATUS_COLORS[status]} style={{ marginInlineEnd: 0 }}>
      {STATUS_LABELS[status]}
    </Tag>
  );
}

export function RiskTag({ risk, days }: { risk?: Risk; days?: number | null }) {
  if (!risk || risk === 'none') return <span style={{ color: '#bfbfbf' }}>—</span>;
  const label =
    risk === 'red' ? `已逾期 ${days != null ? Math.max(0, days - 7) + ' 天' : ''}`
    : risk === 'yellow' ? `剩余 ${Math.max(1, 7 - (days || 0))} 天`
    : `第 ${days} 天`;
  return (
    <Tooltip title={`7 日打标时限 · 当前第 ${days} 天`}>
      <Tag color={RISK_COLORS[risk]} style={{ marginInlineEnd: 0 }}>{label}</Tag>
    </Tooltip>
  );
}

export function HwSwTag({ hwsw }: { hwsw: 'HW' | 'SW' }) {
  return <Tag color={hwsw === 'HW' ? 'geekblue' : 'cyan'} style={{ marginInlineEnd: 0 }}>{hwsw}</Tag>;
}
