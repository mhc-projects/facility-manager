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
  task_type: string; // 'self' | 'subsidy' | 'as' | 'dealer' | 'outsourcing' | 'etc'
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
  is_forecast_target: boolean;
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
  getStageColorClass: (stageKey: string) => string;
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
      const res = await fetch('/api/settings/task-stages', { cache: 'no-store' });
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

  // 색상 이름 → Tailwind 뱃지 클래스
  const COLOR_TO_BADGE: Record<string, string> = {
    blue: 'bg-blue-100 text-blue-800',
    yellow: 'bg-yellow-100 text-yellow-800',
    orange: 'bg-orange-100 text-orange-800',
    rose: 'bg-rose-100 text-rose-800',
    purple: 'bg-purple-100 text-purple-800',
    indigo: 'bg-indigo-100 text-indigo-800',
    cyan: 'bg-cyan-100 text-cyan-800',
    emerald: 'bg-emerald-100 text-emerald-800',
    teal: 'bg-teal-100 text-teal-800',
    green: 'bg-green-100 text-green-800',
    amber: 'bg-amber-100 text-amber-800',
    lime: 'bg-lime-100 text-lime-800',
    red: 'bg-red-100 text-red-800',
    pink: 'bg-pink-100 text-pink-800',
    sky: 'bg-sky-100 text-sky-800',
    violet: 'bg-violet-100 text-violet-800',
  };

  // stage_key → Tailwind 뱃지 클래스: 카테고리 내 sort_order 기반 색상 사이클
  const getStageColorClass = useCallback((stageKey: string): string => {
    const stage = taskStages.find(s => s.stage_key === stageKey && s.is_active);
    if (!stage) return 'bg-gray-100 text-gray-600';
    const siblings = taskStages
      .filter(s => s.progress_category_id === stage.progress_category_id && s.is_active)
      .sort((a, b) => a.sort_order - b.sort_order);
    const idx = siblings.findIndex(s => s.id === stage.id);
    const colorName = STEP_COLORS[(idx >= 0 ? idx : 0) % STEP_COLORS.length];
    return COLOR_TO_BADGE[colorName] || 'bg-gray-100 text-gray-600';
  }, [taskStages]);

  // 이름 기반 task_type 추론 — DB의 task_type 컬럼이 없을 때 폴백용
  const inferTaskTypeFromName = (name: string): string => {
    if (name.includes('보조금')) return 'subsidy';
    if (name.includes('자비'))   return 'self';
    if (name === 'AS')           return 'as';
    if (name.includes('외주'))   return 'outsourcing';
    if (name.includes('대리점')) return 'dealer';
    return 'etc';
  };

  const getStagesByTaskType = useCallback((taskType: string): TaskStepCompat[] => {
    // sort_order 기준 최우선 카테고리만 사용 — 변형 카테고리(5년경과, 동시진행 등)의 오래된 단계가
    // 메인 카테고리 설정과 혼재되는 문제를 방지한다
    const primaryCat = progressCategories
      .filter(c => c.is_active && (c.task_type ?? inferTaskTypeFromName(c.name)) === taskType)
      .sort((a, b) => a.sort_order - b.sort_order)[0];

    if (!primaryCat) return [];

    const seen = new Map<string, TaskStepCompat>();
    taskStages
      .filter(s => s.progress_category_id === primaryCat.id && s.is_active)
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
  }, [taskStages, progressCategories]);

  return (
    <AdminDataContext.Provider value={{
      manufacturers,
      progressCategories,
      taskStages,
      isLoading,
      getStageLabel,
      getStageColorClass,
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
