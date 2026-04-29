'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { TASK_STATUS_KR } from '@/lib/task-status-utils';

export interface Manufacturer {
  id: number;
  name: string;
  sort_order: number;
  is_active: boolean;
}

export interface ProgressCategory {
  id: number;
  name: string;
  sort_order: number;
  is_active: boolean;
}

export interface TaskStage {
  id: string;
  progress_category_id: number;
  stage_key: string;
  stage_label: string;
  sort_order: number;
  is_active: boolean;
}

// 칸반/단계 드롭다운용 타입 (lib/task-steps.ts의 TaskStep과 호환)
export interface TaskStepCompat {
  status: string;
  label: string;
  color: string;
}

interface AdminDataContextType {
  manufacturers: Manufacturer[];
  progressCategories: ProgressCategory[];
  taskStages: TaskStage[];
  isLoading: boolean;
  getStageLabel: (statusOrStageKey: string) => string;
  getStagesByCategory: (categoryId: number) => TaskStage[];
  getStagesByTaskType: (taskType: string) => TaskStepCompat[];
  refreshManufacturers: () => Promise<void>;
  refreshProgressCategories: () => Promise<void>;
  refreshTaskStages: () => Promise<void>;
}

const AdminDataContext = createContext<AdminDataContextType | null>(null);

export function useAdminData() {
  const ctx = useContext(AdminDataContext);
  if (!ctx) throw new Error('useAdminData must be used within AdminDataProvider');
  return ctx;
}

export function AdminDataProvider({ children }: { children: React.ReactNode }) {
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [progressCategories, setProgressCategories] = useState<ProgressCategory[]>([]);
  const [taskStages, setTaskStages] = useState<TaskStage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const fetchManufacturers = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/manufacturers');
      const data = await res.json();
      if (data.success) setManufacturers(data.data);
    } catch { /* 무시 */ }
  }, []);

  const fetchProgressCategories = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/progress-categories');
      const data = await res.json();
      if (data.success) setProgressCategories(data.data);
    } catch { /* 무시 */ }
  }, []);

  const fetchTaskStages = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/task-stages');
      const data = await res.json();
      if (data.success) setTaskStages(data.data);
    } catch { /* 무시 */ }
  }, []);

  // 초기 로드
  useEffect(() => {
    Promise.all([fetchManufacturers(), fetchProgressCategories(), fetchTaskStages()])
      .finally(() => setIsLoading(false));
  }, []);

  // Supabase Realtime 구독
  useEffect(() => {
    if (channelRef.current) return;

    channelRef.current = supabase
      .channel('admin-data-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'manufacturers' }, fetchManufacturers)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'progress_categories' }, fetchProgressCategories)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_stages' }, fetchTaskStages)
      .subscribe();

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [fetchManufacturers, fetchProgressCategories, fetchTaskStages]);

  // status 코드로 라벨 조회: DB 우선 → TASK_STATUS_KR 폴백
  const getStageLabel = useCallback((statusOrStageKey: string): string => {
    const found = taskStages.find(s => s.stage_key === statusOrStageKey);
    if (found) return found.stage_label;
    return TASK_STATUS_KR[statusOrStageKey] || statusOrStageKey;
  }, [taskStages]);

  const getStagesByCategory = useCallback((categoryId: number): TaskStage[] => {
    return taskStages
      .filter(s => s.progress_category_id === categoryId && s.is_active)
      .sort((a, b) => a.sort_order - b.sort_order);
  }, [taskStages]);

  // 칸반/드롭다운용: taskType prefix로 필터 → sort_order 순 정렬 → 중복 제거 → TaskStepCompat 변환
  const STEP_COLORS = ['blue', 'yellow', 'orange', 'rose', 'purple', 'indigo', 'cyan', 'emerald', 'teal', 'green', 'amber', 'lime', 'red', 'pink', 'sky', 'violet'];

  const getStagesByTaskType = useCallback((taskType: string): TaskStepCompat[] => {
    const prefix = taskType + '_';
    const seen = new Map<string, TaskStepCompat>();

    taskStages
      .filter(s => s.stage_key.startsWith(prefix) && s.is_active)
      .sort((a, b) => a.sort_order - b.sort_order)
      .forEach((s, idx) => {
        if (!seen.has(s.stage_key)) {
          seen.set(s.stage_key, {
            status: s.stage_key,
            label: s.stage_label,
            color: STEP_COLORS[idx % STEP_COLORS.length],
          });
        }
      });

    return Array.from(seen.values());
  }, [taskStages]);

  return (
    <AdminDataContext.Provider value={{
      manufacturers,
      progressCategories,
      taskStages,
      isLoading,
      getStageLabel,
      getStagesByCategory,
      getStagesByTaskType,
      refreshManufacturers: fetchManufacturers,
      refreshProgressCategories: fetchProgressCategories,
      refreshTaskStages: fetchTaskStages,
    }}>
      {children}
    </AdminDataContext.Provider>
  );
}
