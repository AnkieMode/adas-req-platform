import React, { useState, useEffect, useRef } from 'react';
import { App as AntApp } from 'antd';
import {
  DndContext, PointerSensor, useSensor, useSensors, useDraggable, useDroppable,
  DragOverlay, closestCorners,
} from '@dnd-kit/core';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { api, errMsg } from '../api';
import { useLinkage } from '../store';
import { STATUS_ORDER, STATUS_LABELS, STATUS_COLORS, TRANSITIONS } from '../types';
import type { Module, Status } from '../types';
import { HwSwTag, RiskTag } from '../components/Tags';
import { currentUser } from '../App';

function CardBody({ m }: { m: Module }) {
  return (
    <>
      <div style={{ fontSize: 12, marginBottom: 4, wordBreak: 'break-all', lineHeight: 1.4 }}>
        {m.module_name}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: '#8c8c8c' }}>
        <span><HwSwTag hwsw={m.hwsw} /> {m.fo_name || '—'}</span>
        <RiskTag risk={m.risk} days={m.days_elapsed} />
      </div>
    </>
  );
}

function CardItem({ m, onClick, dragging }: { m: Module; onClick?: () => void; dragging?: boolean }) {
  return (
    <div className={`kanban-card${dragging ? ' dragging' : ''}`} onClick={onClick}>
      <CardBody m={m} />
    </div>
  );
}

function DraggableCard({ m, canDrag }: { m: Module; canDrag: boolean }) {
  // 终态（已锁定 / 已取消）无可流转方向，直接禁止拖拽，避免“拖了没反应”
  const movable = canDrag && (TRANSITIONS[m.status] || []).length > 0;
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: m.id,
    disabled: !movable,
    data: { module: m },
  });
  const { selectedId, select } = useLinkage();
  const tip = movable
    ? '按住拖动可流转状态'
    : canDrag
      ? `${STATUS_LABELS[m.status]}为终态，不可再流转`
      : '当前账号只读，不可流转状态';
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      title={tip}
      style={{ cursor: movable ? 'grab' : 'default' }}
    >
      <div
        className={`kanban-card${movable ? '' : ' static'}${m.id === selectedId ? ' selected' : ''}${isDragging ? ' dragging' : ''}`}
        onClick={() => select(m.id)}
      >
        <CardBody m={m} />
      </div>
    </div>
  );
}

function Column({
  status, modules, allowed, holding, canDrag,
}: {
  status: Status;
  modules: Module[];
  allowed: boolean;
  holding: boolean; // 是否正在拖拽（用于高亮可放/禁放）
  canDrag: boolean; // 角色是否有流转权限
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `col-${status}`, disabled: !allowed });
  const cls = ['kanban-col'];
  if (isOver) cls.push('drag-over');
  if (holding) cls.push(allowed ? 'target-allowed' : 'target-forbidden');
  const hint = holding ? (allowed ? '可放置' : '不可放置') : String(modules.length);
  return (
    <div className={cls.join(' ')} ref={setNodeRef}>
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 6px 8px', fontWeight: 600, fontSize: 13 }}>
        <span style={{ color: STATUS_COLORS[status] }}>● {STATUS_LABELS[status]}</span>
        <span style={{ color: holding ? (allowed ? '#1677ff' : '#bfbfbf') : '#8c8c8c', fontSize: holding ? 11 : 13 }}>
          {hint}
        </span>
      </div>
      {modules.map((m) => <DraggableCard key={m.id} m={m} canDrag={canDrag} />)}
    </div>
  );
}

export default function Kanban() {
  const { filters } = useLinkage();
  const queryClient = useQueryClient();
  const { message } = AntApp.useApp();
  const [activeId, setActiveId] = useState<number | null>(null);
  const [dragFrom, setDragFrom] = useState<Status | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const user = currentUser();
  const canDrag = !!user && ['admin', 'editor', 'supplier'].includes(user.role);
  const holding = dragFrom !== null;

  const scrollRef = useRef<HTMLDivElement>(null);
  const holdingRef = useRef(false);
  holdingRef.current = holding;

  // 横向平移：按住空白处左右拖动；滚轮纵向滚动转为横向切换
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let down = false, startX = 0, startLeft = 0, moved = false;
    const onDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      if (holdingRef.current) return; // 拖拽卡片时不平移
      if ((e.target as HTMLElement).closest('.kanban-card')) return; // 卡片拖拽不受影响
      down = true; moved = false;
      startX = e.pageX; startLeft = el.scrollLeft;
      el.classList.add('panning');
      e.preventDefault(); // 避免拖拽时选中文字
    };
    const onMove = (e: MouseEvent) => {
      if (!down) return;
      const dx = e.pageX - startX;
      if (Math.abs(dx) > 3) moved = true;
      el.scrollLeft = startLeft - dx;
    };
    const onUp = () => {
      if (!down) return;
      down = false;
      el.classList.remove('panning');
    };
    const onClick = (e: MouseEvent) => {
      if (moved && !(e.target as HTMLElement).closest('.kanban-card')) {
        e.stopPropagation(); e.preventDefault();
      }
    };
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY !== 0 && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        el.scrollLeft += e.deltaY + e.deltaX;
      }
    };
    el.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('blur', onUp); // 在窗口外松手时兜底，防止 panning 类残留
    el.addEventListener('click', onClick, true);
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('mousedown', onDown);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('blur', onUp);
      el.removeEventListener('click', onClick, true);
      el.removeEventListener('wheel', onWheel);
    };
  }, []);

  // 拖拽过程中：滚轮也能横向滚动看板（浮层挂在 body 上，容器收不到滚轮事件）
  useEffect(() => {
    if (!holding) return;
    const onWheel = (e: WheelEvent) => {
      const el = scrollRef.current;
      if (!el) return;
      if (e.deltaY !== 0 && !e.shiftKey) {
        e.preventDefault();
        el.scrollLeft += e.deltaY + e.deltaX;
      }
    };
    window.addEventListener('wheel', onWheel, { passive: false });
    return () => window.removeEventListener('wheel', onWheel);
  }, [holding]);

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
  const resetDrag = () => { setActiveId(null); setDragFrom(null); };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={({ active }) => {
        const m = modules.find((x) => x.id === Number(active.id));
        setActiveId(Number(active.id));
        setDragFrom(m ? m.status : null);
      }}
      onDragCancel={resetDrag}
      onDragEnd={({ active, over }) => {
        resetDrag();
        if (!over) {
          message.warning('没有放到任何状态列上，已取消（可按住空白处左右拖动查看更多列）');
          return;
        }
        const to = String(over.id).replace('col-', '') as Status;
        const m = modules.find((x) => x.id === Number(active.id));
        if (!m || m.status === to) return;
        if (!(TRANSITIONS[m.status] || []).includes(to)) {
          const options = (TRANSITIONS[m.status] || []).map((s) => STATUS_LABELS[s]).join(' / ');
          message.error(
            options
              ? `不允许的流转：${STATUS_LABELS[m.status]} → ${STATUS_LABELS[to]}，可流转到：${options}`
              : `${STATUS_LABELS[m.status]}为终态，不可再流转`,
          );
          return;
        }
        moveMutation.mutate({ id: m.id, to });
      }}
    >
      <div style={{ marginBottom: 8, color: '#8c8c8c', fontSize: 12 }}>
        🖱️ 按住空白处左右拖动，或滚动鼠标滚轮切换查看状态列
        {canDrag ? ' · 拖拽卡片可流转状态（灰色列＝当前卡片不可流转到）' : ' · 当前账号只可查看'}
      </div>
      <div className="kanban-scroll" ref={scrollRef}>
        {STATUS_ORDER.map((s) => (
          <Column
            key={s}
            status={s}
            modules={byStatus(s)}
            canDrag={canDrag}
            allowed={!holding || !dragFrom || (TRANSITIONS[dragFrom] || []).includes(s)}
            holding={holding}
          />
        ))}
      </div>
      <DragOverlay dropAnimation={null}>
        {activeModule ? (
          <div style={{ width: 240 }}><CardItem m={activeModule} dragging /></div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
