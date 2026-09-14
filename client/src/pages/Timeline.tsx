import React, { useMemo } from 'react';
import { Card, Switch, Space, Tooltip, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { api } from '../api';
import { useLinkage } from '../store';
import { STATUS_LABELS, STATUS_COLORS } from '../types';
import type { Module } from '../types';

const DAY_W = 26; // 每天像素宽
const NAME_W = 240;

// 自研甘特：CSS Grid 时间线，展示发送 → 打标 → 锁定全过程与 7 日打标窗口
export default function Timeline() {
  const { filters, selectedId, select } = useLinkage();
  const [showAll, setShowAll] = React.useState(false);
  const { data } = useQuery({
    queryKey: ['modules', filters],
    queryFn: () => api.get('/modules', { params: filters }).then((r) => r.data.modules as Module[]),
  });
  const modules = data || [];

  // 时间范围：最早发送日 -2 天 ~ 今天 +10 天
  const { start, days } = useMemo(() => {
    const today = dayjs();
    const sentDates = modules.filter((m) => m.sent_at).map((m) => dayjs(m.sent_at));
    const min = showAll && sentDates.length
      ? dayjs.min([today.subtract(2, 'day'), ...sentDates.map((d) => (d.isBefore(today.subtract(120, 'day')) ? d : d))])
      : today.subtract(16, 'day');
    const s = min.startOf('day');
    return { start: s, days: today.add(10, 'day').diff(s, 'day') + 1 };
  }, [modules, showAll]);

  const shown = showAll ? modules : modules.filter((m) => ['transmitted', 'in_review'].includes(m.status) || (m.sent_at && dayjs(m.sent_at).isAfter(dayjs().subtract(30, 'day'))));

  const idx = (dateStr: string) => dayjs(dateStr).diff(start, 'day');

  return (
    <Card
      title="打标时间线（甘特）"
      extra={
        <Space>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            🔴 逾期 · 🟡 临期 · 🟢 计时中 · ⬛ 已锁定 · | 今天
          </Typography.Text>
          <Switch checkedChildren="全部模块" unCheckedChildren="流转中" checked={showAll} onChange={setShowAll} />
        </Space>
      }
    >
      <div className="gantt-wrap" style={{ maxHeight: 'calc(100vh - 220px)', overflowY: 'auto' }}>
        {/* 表头 */}
        <div className="gantt-header">
          <div style={{ width: NAME_W, minWidth: NAME_W, padding: '0 12px', fontWeight: 600, fontSize: 12 }}>模块 / FO</div>
          <div style={{ position: 'relative', flex: 1, height: '100%' }}>
            {Array.from({ length: days }).map((_, i) => {
              const d = start.add(i, 'day');
              const weekend = d.day() === 0 || d.day() === 6;
              return (
                <div key={i} style={{
                  position: 'absolute', left: i * DAY_W, width: DAY_W, top: 0, bottom: 0,
                  background: weekend ? '#fafafa' : undefined, borderLeft: i % 7 === 0 ? '1px solid #f0f0f0' : undefined,
                }}>
                  <div className="gantt-day-label" style={{ paddingTop: 4 }}>{d.format('M/D')}</div>
                  <div className="gantt-day-label" style={{ color: d.isSame(dayjs(), 'day') ? '#1677ff' : undefined, fontWeight: d.isSame(dayjs(), 'day') ? 700 : 400 }}>
                    {'日一二三四五六'[d.day()]}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 行 */}
        {shown.map((m) => {
          const sentIdx = m.sent_at ? idx(m.sent_at) : null;
          const todayIdx = dayjs().diff(start, 'day');
          const deadlineIdx = m.deadline_at ? idx(m.deadline_at) : null;
          const endIdx = m.labeled_at ? idx(m.labeled_at) : Math.min(todayIdx, days - 1);
          const lockedIdx = m.locked_at ? idx(m.locked_at) : null;

          const barColor =
            m.risk === 'red' ? '#f5222d' :
            m.risk === 'yellow' ? '#fa8c16' :
            m.risk === 'green' ? '#52c41a' :
            m.status === 'accepted' ? '#52c41a' : STATUS_COLORS[m.status];

          const barLeft = sentIdx != null ? Math.max(0, sentIdx) * DAY_W : null;
          const barWidth = sentIdx != null ? (endIdx - sentIdx + 1) * DAY_W : null;

          return (
            <div key={m.id} className={`gantt-row${m.id === selectedId ? ' selected' : ''}`}>
              <Tooltip title={`${m.module_name} · FO ${m.fo_name || '—'} · ${STATUS_LABELS[m.status]}`}>
                <div className="gantt-name" onClick={() => select(m.id)}>
                  <span style={{ fontSize: 13 }}>{m.module_name}</span>
                  <div style={{ color: '#8c8c8c', fontSize: 11 }}>{m.fo_name || '—'} · {STATUS_LABELS[m.status]}</div>
                </div>
              </Tooltip>
              <div className="gantt-track" style={{ width: days * DAY_W, minWidth: days * DAY_W }}>
                {m.sent_at && (
                  <div className="gantt-today" style={{ left: todayIdx * DAY_W }} />
                )}
                {/* 7 日打标窗口 */}
                {sentIdx != null && deadlineIdx != null && !m.labeled_at && (
                  <div style={{
                    position: 'absolute', left: sentIdx * DAY_W, width: 8 * DAY_W, top: 6, height: 28,
                    border: '1px dashed #d9d9d9', borderRadius: 4, background: '#fafafa',
                  }} />
                )}
                {/* 主条：发送 → 打标/今天 */}
                {barLeft != null && barWidth != null && barWidth > 0 && (
                  <Tooltip title={`${m.module_name}：${m.sent_at} 发送${m.labeled_at ? `，${m.labeled_at} 打标回传` : m.deadline_at ? `，截止 ${m.deadline_at}` : ''}`}>
                    <div className="gantt-bar" style={{ left: barLeft, width: barWidth, background: barColor, opacity: m.status === 'accepted' ? 0.55 : 1 }}
                      onClick={() => select(m.id)}>
                      {m.labeled_at ? '✓' : m.risk === 'red' ? '逾期' : ''}
                    </div>
                  </Tooltip>
                )}
                {/* 锁定点 */}
                {lockedIdx != null && lockedIdx >= 0 && lockedIdx < days && (
                  <Tooltip title={`${m.locked_at} 锁定`}>
                    <div style={{
                      position: 'absolute', left: lockedIdx * DAY_W + DAY_W / 2 - 5, top: 12,
                      width: 10, height: 10, borderRadius: '50%', background: '#237804', border: '2px solid #fff', boxShadow: '0 0 2px rgba(0,0,0,0.3)',
                    }} />
                  </Tooltip>
                )}
              </div>
            </div>
          );
        })}
        {shown.length === 0 && <div style={{ padding: 40, textAlign: 'center', color: '#8c8c8c' }}>当前筛选下暂无模块</div>}
      </div>
    </Card>
  );
}
