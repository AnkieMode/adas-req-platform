import React, { useState } from 'react';
import { Drawer, Descriptions, Tag, Timeline as AntTimeline, Input, Select, Button, App as AntApp, Divider } from 'antd';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { api, errMsg } from '../api';
import { useLinkage } from '../store';
import { StatusTag, RiskTag, HwSwTag } from './Tags';
import { STATUS_LABELS, SUPPLIER_LABELS, TRANSITIONS } from '../types';
import type { Module, Comment, Status } from '../types';
import { currentUser } from '../App';

export default function ModuleDetail() {
  const { selectedId, select } = useLinkage();
  const queryClient = useQueryClient();
  const { message } = AntApp.useApp();
  const user = currentUser();
  // 管理员/同事(Cariad)/华为供应商 可流转状态；交换记录仅管理员
  const canTransition = !!user && ['admin', 'editor', 'supplier'].includes(user.role);
  const canComment = user?.role === 'admin';
  const [comment, setComment] = useState('');
  const [side, setSide] = useState<'OEM' | 'SUPPLIER'>('OEM');

  const { data } = useQuery({
    queryKey: ['module', selectedId],
    queryFn: () => api.get(`/modules/${selectedId}`).then((r) => r.data),
    enabled: selectedId != null,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['modules'] });
    queryClient.invalidateQueries({ queryKey: ['module', selectedId] });
    queryClient.invalidateQueries({ queryKey: ['stats'] });
  };

  const statusMutation = useMutation({
    mutationFn: (to: Status) => api.put(`/modules/${selectedId}`, { status: to }),
    onSuccess: () => { message.success('状态已更新'); invalidate(); },
    onError: (e) => message.error(errMsg(e)),
  });

  const commentMutation = useMutation({
    mutationFn: () => api.post(`/modules/${selectedId}/comments`, { side, body: comment }),
    onSuccess: () => { message.success('评论已添加'); setComment(''); invalidate(); },
    onError: (e) => message.error(errMsg(e)),
  });

  const m: Module | undefined = data?.module;
  const comments: Comment[] = data?.comments || [];
  const nextStatuses: Status[] = m ? TRANSITIONS[m.status] || [] : [];

  return (
    <Drawer
      open={selectedId != null}
      onClose={() => select(null)}
      width={560}
      title={m ? (
        <span>
          <span style={{ fontSize: 13 }}>{m.module_name}</span>
          <span style={{ marginLeft: 8 }}><HwSwTag hwsw={m.hwsw} /><StatusTag status={m.status} /></span>
        </span>
      ) : '模块详情'}
    >
      {m && (
        <>
          {canTransition && nextStatuses.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <Divider style={{ margin: '0 0 8px' }} orientation="left" plain>流转到下一状态</Divider>
              {nextStatuses.map((s) => (
                <Button key={s} size="small" style={{ marginRight: 8 }} onClick={() => statusMutation.mutate(s)}>
                  → {STATUS_LABELS[s]}
                </Button>
              ))}
            </div>
          )}
          <Descriptions column={2} size="small" bordered>
            <Descriptions.Item label="状态"><StatusTag status={m.status} /></Descriptions.Item>
            <Descriptions.Item label="华为侧">{m.supplier_status ? SUPPLIER_LABELS[m.supplier_status] || m.supplier_status : '—'}</Descriptions.Item>
            <Descriptions.Item label="FO" span={2}>{m.fo_name}{m.fo_email ? ` · ${m.fo_email}` : ''}</Descriptions.Item>
            <Descriptions.Item label="子领域">{m.subdomain || '—'}</Descriptions.Item>
            <Descriptions.Item label="SPDT">{m.spdt || '—'}</Descriptions.Item>
            <Descriptions.Item label="发送日期">{m.sent_at || '—'}</Descriptions.Item>
            <Descriptions.Item label="打标截止">{m.deadline_at || '—'}</Descriptions.Item>
            <Descriptions.Item label="打标风险">
              <RiskTag risk={m.risk} days={m.days_elapsed} />
            </Descriptions.Item>
            <Descriptions.Item label="打标回传">{m.labeled_at || '—'}</Descriptions.Item>
            <Descriptions.Item label="锁定日期">{m.locked_at || '—'}</Descriptions.Item>
            <Descriptions.Item label="需求数">{m.total_reqs}</Descriptions.Item>
            <Descriptions.Item label="接受/拒绝">{m.accepted_reqs} / {m.rejected_reqs}</Descriptions.Item>
            <Descriptions.Item label="待澄清/不涉及">{m.tbc_reqs} / {m.na_reqs}</Descriptions.Item>
            <Descriptions.Item label="未完成">{m.outstanding_reqs}</Descriptions.Item>
          </Descriptions>

          <Divider orientation="left" plain>交换记录（格式 [dd/mm/yyyy, 姓名]）</Divider>
          <AntTimeline
            items={comments.map((c) => ({
              color: c.side === 'OEM' ? 'blue' : 'red',
              children: (
                <div>
                  <div style={{ fontSize: 12, color: '#8c8c8c' }}>
                    {c.side === 'OEM' ? 'VWG (OEM)' : '华为 (Supplier)'} · {c.author} · {dayjs(c.created_at).format('YYYY-MM-DD HH:mm')}
                  </div>
                  <div style={{ fontSize: 13 }}>{c.body}</div>
                </div>
              ),
            }))}
          />
          {canComment && (
            <div style={{ display: 'flex', gap: 8 }}>
              <Select value={side} onChange={setSide} style={{ width: 130 }}
                options={[{ value: 'OEM', label: 'VWG (OEM)' }, { value: 'SUPPLIER', label: '华为 (Supplier)' }]} />
              <Input value={comment} onChange={(e) => setComment(e.target.value)}
                placeholder="交换评论（自动附加日期与姓名）" onPressEnter={() => comment.trim() && commentMutation.mutate()} />
              <Button type="primary" disabled={!comment.trim()} onClick={() => commentMutation.mutate()}>添加</Button>
            </div>
          )}
        </>
      )}
    </Drawer>
  );
}
