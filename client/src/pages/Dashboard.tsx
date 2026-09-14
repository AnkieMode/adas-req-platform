import React from 'react';
import { Card, Col, Row, Statistic, List } from 'antd';
import { useQuery } from '@tanstack/react-query';
import ReactECharts from 'echarts-for-react';
import { api } from '../api';
import { useLinkage } from '../store';
import { STATUS_LABELS, STATUS_COLORS, RISK_LABELS, RISK_COLORS } from '../types';
import type { Status, Risk } from '../types';
import { StatusTag, RiskTag } from '../components/Tags';

interface Stats {
  total: number;
  by_status: Record<string, number>;
  by_hwsw: Record<string, number>;
  by_risk: Record<string, number>;
  risk_modules: any[];
  fo_stats: { fo: string; count: number; open: number }[];
  req_total: number;
  req_accepted: number;
  req_rejected: number;
  req_na: number;
  req_tbc: number;
  req_outstanding: number;
}

export default function Dashboard() {
  const { data: s } = useQuery({ queryKey: ['stats'], queryFn: () => api.get('/stats').then((r) => r.data as Stats) });
  const { select } = useLinkage();
  if (!s) return null;

  const inFlow = s.total - (s.by_status['accepted'] || 0) - (s.by_status['cancelled'] || 0);

  const statusOption = {
    title: { text: '模块状态分布', left: 'center', textStyle: { fontSize: 14 } },
    tooltip: { trigger: 'item' },
    series: [{
      type: 'pie', radius: ['38%', '66%'], center: ['50%', '56%'],
      label: { formatter: '{b}\n{c}' },
      data: Object.entries(s.by_status).map(([k, v]) => ({
        name: STATUS_LABELS[k as Status] || k, value: v,
        itemStyle: { color: STATUS_COLORS[k as Status] },
      })),
    }],
  };

  const hwswOption = {
    title: { text: 'HW / SW 分类', left: 'center', textStyle: { fontSize: 14 } },
    tooltip: { trigger: 'item' },
    series: [{
      type: 'pie', radius: ['38%', '66%'], center: ['50%', '56%'],
      data: [
        { name: 'SW 软件', value: s.by_hwsw['SW'] || 0, itemStyle: { color: '#13c2c2' } },
        { name: 'HW 硬件', value: s.by_hwsw['HW'] || 0, itemStyle: { color: '#2f54eb' } },
      ],
    }],
  };

  const foOption = {
    title: { text: 'FO 负责模块数 Top10', left: 'center', textStyle: { fontSize: 14 } },
    tooltip: { trigger: 'axis' },
    grid: { left: 110, right: 30, top: 40, bottom: 24 },
    xAxis: { type: 'value' },
    yAxis: { type: 'category', data: s.fo_stats.slice(0, 10).map((f) => f.fo).reverse(), axisLabel: { fontSize: 11 } },
    series: [{
      type: 'bar', barMaxWidth: 16,
      data: s.fo_stats.slice(0, 10).map((f) => f.count).reverse(),
      itemStyle: { color: '#1677ff' },
    }],
  };

  // 需求条目统计图（华为打标结果口径）
  const reqOption = {
    title: {
      text: '需求条目统计（华为打标结果）',
      subtext: '数据口径：2026年6月',
      left: 'center', textStyle: { fontSize: 14 }, subtextStyle: { fontSize: 11, color: '#8c8c8c' },
    },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 90, right: 60, top: 56, bottom: 24 },
    xAxis: { type: 'value' },
    yAxis: {
      type: 'category',
      data: ['未完成', '待澄清', '华为已拒绝', '华为已接受', '需求总条目'],
      axisLabel: { fontSize: 12 },
    },
    series: [{
      type: 'bar', barMaxWidth: 18,
      label: { show: true, position: 'right', fontSize: 12 },
      data: [
        { value: s.req_outstanding, itemStyle: { color: '#8c8c8c' } },
        { value: s.req_tbc, itemStyle: { color: '#fa8c16' } },
        { value: s.req_rejected, itemStyle: { color: '#f5222d' } },
        { value: s.req_accepted, itemStyle: { color: '#52c41a' } },
        { value: s.req_total, itemStyle: { color: '#1677ff' } },
      ],
    }],
  };

  return (
    <div>
      <Row gutter={16}>
        <Col span={6}><Card><Statistic title="需求模块总数" value={s.total} suffix="个" /></Card></Col>
        <Col span={6}><Card><Statistic title="已锁定" value={s.by_status['accepted'] || 0} suffix="个" valueStyle={{ color: '#52c41a' }} /></Card></Col>
        <Col span={6}><Card><Statistic title="流转中" value={inFlow} suffix="个" valueStyle={{ color: '#1677ff' }} /></Card></Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="打标风险（黄/红）" value={(s.by_risk['yellow'] || 0) + (s.by_risk['red'] || 0)}
              suffix={`/ ${s.by_risk['green'] || 0} 计时中`}
              valueStyle={{ color: (s.by_risk['red'] || 0) > 0 ? '#f5222d' : '#fa8c16' }}
            />
          </Card>
        </Col>
      </Row>

      {(s.by_risk['red'] || 0) + (s.by_risk['yellow'] || 0) > 0 && (
        <Card size="small" style={{ marginTop: 16 }} title={
          <span>⚠️ 打标时限告警（发送华为后 7 日内须打标回传 · 提前 3 天黄色预警）</span>
        }>
          <List
            size="small"
            dataSource={s.risk_modules}
            renderItem={(m: any) => (
              <List.Item
                style={{ cursor: 'pointer' }}
                onClick={() => { select(m.id); }}
                actions={[<RiskTag key="r" risk={m.risk} days={m.days_elapsed} />, <StatusTag key="s" status={m.status} />]}
              >
                <span style={{ fontSize: 13 }}>{m.module_name}</span>
                <span style={{ color: '#8c8c8c', fontSize: 12 }}>发送 {m.sent_at} · 截止 {m.deadline_at} · FO {m.fo_name}</span>
              </List.Item>
            )}
          />
        </Card>
      )}

      <Row gutter={16} style={{ marginTop: 16 }}>
        <Col span={8}><Card><ReactECharts option={statusOption} style={{ height: 280 }} /></Card></Col>
        <Col span={8}><Card><ReactECharts option={hwswOption} style={{ height: 280 }} /></Card></Col>
        <Col span={8}><Card><ReactECharts option={foOption} style={{ height: 280 }} /></Card></Col>
      </Row>

      <Card size="small" style={{ marginTop: 16 }}>
        <ReactECharts option={reqOption} style={{ height: 240 }} />
      </Card>
    </div>
  );
}
