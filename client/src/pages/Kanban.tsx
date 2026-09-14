import React, { useState, useEffect, useRef } from 'react';
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
import { currentUser } from '../App';

function CardItem({ m, onClick, dragging }: { m: Module; onClick: () => void; dragging?: boolean }) {
  return (
    <div className={`kanban-card${dragging ? ' dragging' : ''}`} onClick={onClick}>
      <div style={{ fontSize: 12, marginBottom: 4, wordBreak: 'break-all', lineHeight: 1.4 }}>
        {m.module_name}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: '#8c8c8c' }}>
        <span><HwSwTag hwsw={m.hwsw} /> {m.fo_name || '—'}</span>
        <RiskTag risk={m.risk} days={m.days_elapsed} />
      </div>
    </div>
  );
}

function DraggableCard({ m, canDrag }: { m: Module; canDrag: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: m.id, disabled: !canDrag, data: { module: m } });
  const { selectedId, select } = useLinkage();
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} style={{ cursor: canDrag ? 'grab' : 'pointer' }}>
      <div className={`kanban-card${m.id === selectedId ? ' selected' : ''}${isDragging ? ' dragging' : ''}`} onClick={() => select(m.id)}>
        <div style={{ fontSize: 12, marginBottom: 4, wordBreak: 'break-all', lineHeight: 1.4 }}>
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

function Column({ status, modules, canDrag }: { status: Status; modules: Module[]; canDrag: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: `col-${status}` });
  return (
    <div className={`kanban-col${isOver ? ' drag-over' : ''}`} ref={setNodeRef}>
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 6px 8px', fontWeight: 600, fontSize: 13 }}>
        <span style={{ color: STATUS_COLORS[status] }}>● {STATUS_LABELS[status]}</span>
        <span style={{ color: '#8c8c8c' }}>{modules.length}</span>
      </div>
      {modules.map((m) => <DraggableCard key={m.id} m={m} canDrag={canDrag} />)}
    </div>
  );
}

export default function Kanban() {
  const { filters, select } = useLinkage();
  const queryClient = useQueryClient();
  const { message } = AntApp.useApp();
  const [activeId, setActiveId] = useState<number | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const user = currentUser();
  const canDrag = !!user && ['admin', 'editor', 'supplier'].includes(user.role);

  // 横向拖动平移：按住空白处左右拖拽；滚轮纵向滚动转为横向切换
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let down = false, startX = 0, startLeft = 0, moved = false;
    const onDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      if ((e.target as HTMLElement).closest('.kanban-card')) return; // 卡片拖拽不受影响
      down = true; moved = false;
      startX = e.pageX; startLeft = el.scrollLeft;
      el.classList.add('panning');
    };
    const onMove = (e: MouseEvent) => {
      if (!down) return;
      const dx = e.pageX - startX;
      if (Math.abs(dx) > 3) moved = true;
      el.scrollLeft = startLeft - dx;
    };
    const onUp = () => { down = false; el.classList.remove('panning'); };
    const onClick = (e: MouseEvent) => {
      if (moved && !(e.target as HTMLElement).closest('.kanban-card')) {
        e.stopPropagation(); e.preventDefault();
      }
    };
    const onWheel = (e: WheelEvent) => {
      // 鼠标滚轮：优先横向切换状态列；按住 Shift 时不拦截
      if (e.deltaY !== 0 && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        el.scrollLeft += e.deltaY + e.deltaX;
      }
    };
    el.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    el.addEventListener('click', onClick, true);
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('mousedown', onDown);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      el.removeEventListener('click', onClick, true);
      el.removeEventListener('wheel', onWheel);
    };
  }, []);

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
      <div style={{ marginBottom: 8, color: '#8c8c8c', fontSize: 12 }}>
        🖱️ 按住空白处左右拖动，或滚动鼠标滚轮切换查看状态列{canDrag ? ' · 拖拽卡片可流转状态' : ' · 当前账号只可查看'}
      </div>
      <div className="kanban-scroll" ref={scrollRef}>
        {STATUS_ORDER.map((s) => <Column key={s} status={s} modules={byStatus(s)} canDrag={canDrag} />)}
      </div>
      <DragOverlay>
        {activeModule ? (
          <div style={{ width: 240 }}><CardItem m={activeModule} onClick={() => {}} dragging /></div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
