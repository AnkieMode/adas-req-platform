import React, { useState } from 'react';
import { App as AntApp } from 'antd';
import {
  DndContext, PointerSensor, useSensor, useSensors, useDraggable, useDroppable,
  DragOverlay,
} from '@dnd-kit/core';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { api, errMsg } from '../api';
import { useLinkage } from '../store';
import { STATUS_ORDER, STATUS_LABELS, STATUS_COLORS, TRANSITIONS } from '../types';
import type { Module, Status } from '../types';
import { HwSwTag, RiskTag } from '../components/Tags';

function CardItem({ m, onClick, dragging }: { m: Module; onClick: () => void; dragging?: boolean }) {
  return (
    <div className={`kanban-card${dragging ? ' dragging' : ''}`} onClick={onClick}>
      <div style={{ fontFamily: 'monospace', fontSize: 11, marginBottom: 4, wordBreak: 'break-all' }}>
        {m.module_name}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: '#8c8c8c' }}>
        <span><HwSwTag hwsw={m.hwsw} /> {m.fo_name || '—'}</span>
        <RiskTag risk={m.risk} days={m.days_elapsed} />
      </div>
    </div>
  );
}

function DraggableCard({ m }: { m: Module }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: m.id, data: { module: m } });
  const { selectedId, select } = useLinkage();
  return (
    <div ref={setNodeRef} {...listeners} {...attributes}>
      <div className={`kanban-card${m.id === selectedId ? ' selected' : ''}${isDragging ? ' dragging' : ''}`} onClick={() => select(m.id)}>
        <div style={{ fontFamily: 'monospace', fontSize: 11, marginBottom: 4, wordBreak: 'break-all' }}>
          {m.module_name}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: '#8c8c8c' }}>
          <span><HwSwTag hwsw={m.hwsw} /> {m.fo_name || '—'}</span>
          <RiskTag risk={m.risk} days={m.days_elapsed} />
        </div>
      </div>
    </div>
  );
}

function Column({ status, modules }: { status: Status; modules: Module[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: `col-${status}` });
  return (
    <div className={`kanban-col${isOver ? ' drag-over' : ''}`} ref={setNodeRef}>
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 6px 8px', fontWeight: 600, fontSize: 13 }}>
        <span style={{ color: STATUS_COLORS[status] }}>● {STATUS_LABELS[status]}</span>
        <span style={{ color: '#8c8c8c' }}>{modules.length}</span>
      </div>
      {modules.map((m) => <DraggableCard key={m.id} m={m} />)}
    </div>
  );
}

export default function Kanban() {
  const { filters, select } = useLinkage();
  const queryClient = useQueryClient();
  const { message } = AntApp.useApp();
  const [activeId, setActiveId] = useState<number | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const { data } = useQuery({
    queryKey: ['modules', filters],
    queryFn: () => api.get('/modules', { params: filters }).then((r) => r.data.modules as Module[]),
  });
  const modules = data || [];

  const moveMutation = useMutation({
    mutationFn: ({ id, to }: { id: number; to: Status }) => api.put(`/modules/${id}`, { status: to }),
    onSuccess: () => {
      message.success('状态已流转');
      queryClient.invalidateQueries({ queryKey: ['modules'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    },
    onError: (e) => {
      message.error(errMsg(e));
      queryClient.invalidateQueries({ queryKey: ['modules'] });
    },
  });

  const byStatus = (s: Status) => modules.filter((m) => m.status === s);
  const activeModule = modules.find((m) => m.id === activeId);

  return (
    <DndContext
      sensors={sensors}
      onDragStart={({ active }) => setActiveId(Number(active.id))}
      onDragEnd={({ active, over }) => {
        setActiveId(null);
        if (!over) return;
        const to = String(over.id).replace('col-', '') as Status;
        const m = modules.find((x) => x.id === Number(active.id));
        if (!m || m.status === to) return;
        if (!(TRANSITIONS[m.status] || []).includes(to)) {
          message.error(`不允许的流转：${STATUS_LABELS[m.status]} → ${STATUS_LABELS[to]}`);
          return;
        }
        moveMutation.mutate({ id: m.id, to });
      }}
    >
      <div className="kanban-scroll">
        {STATUS_ORDER.map((s) => <Column key={s} status={s} modules={byStatus(s)} />)}
      </div>
      <DragOverlay>
        {activeModule ? (
          <div style={{ width: 240 }}><CardItem m={activeModule} onClick={() => {}} dragging /></div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
