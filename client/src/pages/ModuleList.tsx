import React from 'react';
import { Table, Input, Select, Space, Card } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import { useLinkage } from '../store';
import { StatusTag, RiskTag, HwSwTag } from '../components/Tags';
import { STATUS_ORDER, STATUS_LABELS, RISK_LABELS } from '../types';
import type { Module, Status, Risk } from '../types';

export default function ModuleList() {
  const { filters, setFilters, selectedId, select } = useLinkage();
  const { data } = useQuery({
    queryKey: ['modules', filters],
    queryFn: () => api.get('/modules', { params: filters }).then((r) => r.data.modules as Module[]),
  });

  const modules = data || [];

  return (
    <Card
      title="需求模块列表"
      extra={
        <Space wrap>
          <Input.Search
            placeholder="搜索模块名 / FO"
            allowClear
            style={{ width: 200 }}
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          />
          <Select
            placeholder="状态" allowClear style={{ width: 140 }}
            value={filters.status}
            onChange={(v) => setFilters({ ...filters, status: v })}
            options={STATUS_ORDER.map((s) => ({ value: s, label: STATUS_LABELS[s] }))}
          />
          <Select
            placeholder="HW/SW" allowClear style={{ width: 90 }}
            value={filters.hwsw}
            onChange={(v) => setFilters({ ...filters, hwsw: v })}
            options={[{ value: 'HW', label: 'HW' }, { value: 'SW', label: 'SW' }]}
          />
          <Select
            placeholder="打标风险" allowClear style={{ width: 120 }}
            value={filters.risk}
            onChange={(v) => setFilters({ ...filters, risk: v })}
            options={(['red', 'yellow', 'green'] as Risk[]).map((r) => ({ value: r, label: RISK_LABELS[r] }))}
          />
        </Space>
      }
    >
      <Table<Module>
        rowKey="id"
        dataSource={modules}
        loading={!data}
        size="small"
        pagination={{ pageSize: 20, showTotal: (t) => `共 ${t} 个模块` }}
        rowClassName={(r) => (r.id === selectedId ? 'ant-table-row-selected' : '')}
        onRow={(r) => ({ onClick: () => select(r.id), style: { cursor: 'pointer' } })}
        columns={[
          { title: '#', dataIndex: 'seq', width: 45 },
          {
            title: '模块名称', dataIndex: 'module_name', ellipsis: { showTitle: false },
            render: (v: string) => (
              <span style={{ fontSize: 13 }} title={v}>{v}</span>
            ),
          },
          { title: 'HW/SW', dataIndex: 'hwsw', width: 75, render: (v) => <HwSwTag hwsw={v} />, filters: [{ text: 'HW', value: 'HW' }, { text: 'SW', value: 'SW' }], onFilter: (v, r) => r.hwsw === v },
          { title: 'FO', dataIndex: 'fo_name', width: 110, ellipsis: true },
          { title: '状态', dataIndex: 'status', width: 105, render: (v: Status) => <StatusTag status={v} /> },
          { title: '华为侧', dataIndex: 'supplier_status', width: 85, render: (v: string) => v || '—' },
          { title: '发送日期', dataIndex: 'sent_at', width: 100, render: (v) => v || '—' },
          { title: '打标截止', dataIndex: 'deadline_at', width: 100, render: (v) => v || '—' },
          {
            title: '打标风险', key: 'risk', width: 110,
            render: (_, r) => <RiskTag risk={r.risk} days={r.days_elapsed} />,
            sorter: (a, b) => (['red', 'yellow', 'green', 'none'].indexOf(a.risk || 'none') - ['red', 'yellow', 'green', 'none'].indexOf(b.risk || 'none')),
          },
          { title: '需求数', dataIndex: 'total_reqs', width: 80, sorter: (a, b) => a.total_reqs - b.total_reqs },
          { title: '接受', dataIndex: 'accepted_reqs', width: 60 },
        ]}
      />
    </Card>
  );
}
