import React, { createContext, useContext, useState, useCallback } from 'react';
import type { Status, Risk } from './types';

// 三版联动全局状态：选中的模块 + 共享筛选条件（列表/看板/甘特三视图共用）
export interface Filters {
  status?: Status;
  hwsw?: '' | 'HW' | 'SW';
  fo?: string;
  risk?: '' | Risk;
  search?: string;
}

interface LinkageState {
  selectedId: number | null;
  select: (id: number | null) => void;
  filters: Filters;
  setFilters: (f: Filters) => void;
}

const Ctx = createContext<LinkageState>(null as any);

export function LinkageProvider({ children }: { children: React.ReactNode }) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [filters, setFilters] = useState<Filters>({});

  const select = useCallback((id: number | null) => setSelectedId(id), []);

  return (
    <Ctx.Provider value={{ selectedId, select, filters, setFilters }}>
      {children}
    </Ctx.Provider>
  );
}

export function useLinkage() {
  return useContext(Ctx);
}
