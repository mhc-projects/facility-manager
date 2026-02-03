'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNotification } from '@/contexts/NotificationContext';
import { TokenManager } from '@/lib/api-client';
import { Clock, User, Calendar, ChevronDown, ChevronUp } from 'lucide-react';
// 🔄 공유 모듈에서 단계 정의 및 헬퍼 함수 import
import {
  TaskType,
  TaskStatus,
  TaskStep,
  selfSteps,
  subsidySteps,
  etcSteps,
  asSteps,
  dealerSteps,
  outsourcingSteps,
  getStepsForType
} from '@/lib/task-steps';

interface TaskAssignee {
  id: string;
  name: string;
  email: string;
}

// 🔄 TaskType과 TaskStatus는 공유 모듈에서 import

interface FacilityTask {
  id: string;
  title: string;
  business_name: string;
  description?: string;
  task_type: TaskType;
  status: TaskStatus;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  assignee?: string;
  assignees?: TaskAssignee[];
  due_date?: string;
  estimated_hours?: number;
  created_at: string;
  updated_at: string;
}

interface TaskProgressMiniBoardProps {
  businessName: string;
  onStatusChange?: (taskId: string, newStatus: string) => void;
}

// 🔄 단계 정의는 공유 모듈에서 import (lib/task-steps.ts)

// 색상 매핑을 Tailwind CSS 클래스로 변환
const getColorClasses = (color: string) => {
  const colorMap: {[key: string]: {color: string, bgColor: string}} = {
    blue: { color: 'bg-blue-100 text-blue-700 border-blue-200', bgColor: 'bg-blue-50' },
    yellow: { color: 'bg-yellow-100 text-yellow-700 border-yellow-200', bgColor: 'bg-yellow-50' },
    orange: { color: 'bg-orange-100 text-orange-700 border-orange-200', bgColor: 'bg-orange-50' },
    amber: { color: 'bg-amber-100 text-amber-700 border-amber-200', bgColor: 'bg-amber-50' },
    purple: { color: 'bg-purple-100 text-purple-700 border-purple-200', bgColor: 'bg-purple-50' },
    sky: { color: 'bg-sky-100 text-sky-700 border-sky-200', bgColor: 'bg-sky-50' },
    indigo: { color: 'bg-indigo-100 text-indigo-700 border-indigo-200', bgColor: 'bg-indigo-50' },
    cyan: { color: 'bg-cyan-100 text-cyan-700 border-cyan-200', bgColor: 'bg-cyan-50' },
    emerald: { color: 'bg-emerald-100 text-emerald-700 border-emerald-200', bgColor: 'bg-emerald-50' },
    teal: { color: 'bg-teal-100 text-teal-700 border-teal-200', bgColor: 'bg-teal-50' },
    green: { color: 'bg-green-100 text-green-700 border-green-200', bgColor: 'bg-green-50' },
    lime: { color: 'bg-lime-100 text-lime-700 border-lime-200', bgColor: 'bg-lime-50' },
    red: { color: 'bg-red-100 text-red-700 border-red-200', bgColor: 'bg-red-50' },
    pink: { color: 'bg-pink-100 text-pink-700 border-pink-200', bgColor: 'bg-pink-50' },
    violet: { color: 'bg-violet-100 text-violet-700 border-violet-200', bgColor: 'bg-violet-50' },
    fuchsia: { color: 'bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200', bgColor: 'bg-fuchsia-50' },
    rose: { color: 'bg-rose-100 text-rose-700 border-rose-200', bgColor: 'bg-rose-50' },
    slate: { color: 'bg-slate-100 text-slate-700 border-slate-200', bgColor: 'bg-slate-50' },
    zinc: { color: 'bg-zinc-100 text-zinc-700 border-zinc-200', bgColor: 'bg-zinc-50' },
    stone: { color: 'bg-stone-100 text-stone-700 border-stone-200', bgColor: 'bg-stone-50' },
    gray: { color: 'bg-gray-100 text-gray-700 border-gray-200', bgColor: 'bg-gray-50' }
  }
  return colorMap[color] || colorMap.gray
}

// 🔄 getStepsForType 함수는 공유 모듈에서 import (lib/task-steps.ts)

export default function TaskProgressMiniBoard({
  businessName,
  onStatusChange
}: TaskProgressMiniBoardProps) {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<FacilityTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedStatus, setExpandedStatus] = useState<string | null>(null);

  // 실시간 알림 훅
  const { lastEventTime } = useNotification();
  const lastProcessedEventTime = React.useRef<number | null>(null);

  // loadTasks 함수를 먼저 정의 (useEffect에서 참조하기 전에)
  const loadTasks = useCallback(async () => {
    if (!businessName || !user) return;

    try {
      setLoading(true);
      setError(null);

      const token = TokenManager.getToken();
      console.log('🔍 [MINI-KANBAN] API 호출:', {
        businessName,
        token: token ? 'EXISTS' : 'NULL',
        tokenLength: token ? token.length : 0,
        user: user ? user.name : 'NO_USER'
      });

      // 토큰이 없으면 에러 처리
      if (!token) {
        console.error('❌ [MINI-KANBAN] 인증 토큰이 없습니다');
        setError('로그인이 필요합니다');
        return;
      }

      const response = await fetch(`/api/facility-tasks?businessName=${encodeURIComponent(businessName)}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('❌ [MINI-KANBAN] API 응답 오류:', {
          status: response.status,
          statusText: response.statusText,
          errorData
        });
        throw new Error(errorData.message || `API 응답 오류: ${response.status}`);
      }

      const data = await response.json();

      console.log('🔍 [MINI-KANBAN] API 응답 데이터:', {
        success: data.success,
        dataType: typeof data.data,
        dataLength: Array.isArray(data.data) ? data.data.length : 'NOT_ARRAY',
        rawData: data.data
      });

      if (data.success) {
        // API가 { tasks: [...], count: n, user: {...} } 형태로 응답
        let tasksArray = Array.isArray(data.data?.tasks) ? data.data.tasks
                        : Array.isArray(data.data) ? data.data
                        : [];

        // 데이터베이스 형식을 UI 형식으로 변환
        tasksArray = tasksArray.map((task: any) => ({
          ...task,
          task_type: task.task_type || 'etc', // task_type 필드 확인
          status: task.status || 'etc_status'
        }));

        setTasks(tasksArray);
        console.log('✅ [MINI-KANBAN] 업무 데이터 설정 완료:', {
          taskCount: tasksArray.length,
          tasks: tasksArray,
          fullResponse: data.data,
          taskTypes: tasksArray.map((t: any) => `${t.title}(${t.task_type}:${t.status})`).join(', ')
        });
      } else {
        console.log('❌ [MINI-KANBAN] API 실패:', data.message);
        setError(data.message || '업무 데이터를 불러올 수 없습니다.');
        setTasks([]); // 실패 시에도 빈 배열로 설정
      }
    } catch (err) {
      console.error('업무 데이터 로딩 오류:', err);
      setError(err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.');
      setTasks([]); // 오류 시 빈 배열로 설정
    } finally {
      setLoading(false);
    }
  }, [businessName, user]);

  // API에서 해당 사업장의 업무들 불러오기
  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  // 실시간 알림 연동 - 업무 상태 변경 시 자동 새로고침 (debounce 적용)
  useEffect(() => {
    // lastEventTime이 변경되지 않았거나 이미 처리한 이벤트면 스킵
    if (!lastEventTime || !businessName || lastProcessedEventTime.current === lastEventTime) {
      return;
    }

    // 이미 처리한 이벤트로 마킹
    lastProcessedEventTime.current = lastEventTime;

    // 1초 후 데이터 새로고침 (실시간 반영, debounced)
    const timer = setTimeout(() => {
      console.log('🔄 [MINI-KANBAN] 실시간 알림으로 인한 업무 새로고침:', businessName);
      loadTasks();
    }, 1000);

    return () => clearTimeout(timer);
  }, [lastEventTime, businessName, loadTasks]);

  // 업무 타입별로 그룹화된 단계별 업무 개수 계산
  const getTasksByTypeAndStatus = () => {
    const tasksByType: {[key: string]: {tasks: FacilityTask[], steps: any[]}} = {
      self: { tasks: [], steps: selfSteps },
      subsidy: { tasks: [], steps: subsidySteps },
      dealer: { tasks: [], steps: dealerSteps }, // 🔄 추가
      outsourcing: { tasks: [], steps: outsourcingSteps }, // 🔄 추가
      as: { tasks: [], steps: asSteps },
      etc: { tasks: [], steps: etcSteps }
    };

    tasks.forEach(task => {
      const taskType = task.task_type || 'etc';
      if (tasksByType[taskType]) {
        tasksByType[taskType].tasks.push(task);
      } else {
        tasksByType.etc.tasks.push(task);
      }
    });

    return tasksByType;
  };

  // 특정 상태의 업무 개수 계산 (모든 타입 통합)
  const getTasksByStatus = (status: string) => {
    return tasks.filter(task => task.status === status);
  };

  // 상태 변경 처리
  const handleStatusChange = async (taskId: string, newStatus: string) => {
    if (!user) return;

    try {
      const token = TokenManager.getToken();
      const response = await fetch(`/api/facility-tasks`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          id: taskId,
          status: newStatus,
          updated_by: user.id
        })
      });

      if (response.ok) {
        // 로컬 상태 업데이트
        setTasks(prev => prev.map(task =>
          task.id === taskId ? { ...task, status: newStatus as any } : task
        ));

        // 부모 컴포넌트에 알림
        onStatusChange?.(taskId, newStatus);
      }
    } catch (error) {
      console.error('상태 변경 오류:', error);
    }
  };

  // 날짜 포맷팅
  const formatDueDate = (dateString?: string) => {
    if (!dateString) return null;

    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return `D+${Math.abs(diffDays)}`;
    } else if (diffDays === 0) {
      return 'D-Day';
    } else {
      return `D-${diffDays}`;
    }
  };

  // 담당자 이름 추출
  const getAssigneeName = (task: FacilityTask) => {
    if (task.assignees && task.assignees.length > 0) {
      return task.assignees[0].name;
    }
    return task.assignee || '미배정';
  };

  console.log('🎨 [MINI-KANBAN] 렌더링 상태 체크:', {
    loading,
    error,
    taskCount: tasks.length,
    businessName,
    user: user?.name
  });

  if (loading) {
    console.log('⏳ [MINI-KANBAN] 로딩 상태 렌더링');
    return (
      <div className="bg-white rounded-lg p-4 shadow-sm">
        <div className="flex items-center text-sm text-gray-600 mb-2">
          <Clock className="w-4 h-4 mr-2 text-orange-500" />
          업무 진행 단계
        </div>
        <div className="flex items-center justify-center py-4">
          <div className="w-4 h-4 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mr-2"></div>
          <span className="text-sm text-gray-600">업무 현황 로딩중...</span>
        </div>
      </div>
    );
  }

  if (error) {
    console.log('❌ [MINI-KANBAN] 에러 상태 렌더링:', error);
    return (
      <div className="bg-white rounded-lg p-4 shadow-sm">
        <div className="flex items-center text-sm text-gray-600 mb-2">
          <Clock className="w-4 h-4 mr-2 text-orange-500" />
          업무 진행 단계
        </div>
        <div className="text-sm text-gray-500">
          업무 현황을 불러올 수 없습니다. ({error})
        </div>
      </div>
    );
  }

  if (tasks.length === 0) {
    console.log('📭 [MINI-KANBAN] 빈 업무 목록 렌더링');
    return (
      <div className="bg-white rounded-lg p-4 shadow-sm">
        <div className="flex items-center text-sm text-gray-600 mb-2">
          <Clock className="w-4 h-4 mr-2 text-orange-500" />
          업무 진행 단계
        </div>
        <div className="text-sm text-gray-500">
          등록된 업무가 없습니다.
        </div>
      </div>
    );
  }

  // 업무 타입별로 그룹화
  const tasksByType = getTasksByTypeAndStatus();

  console.log('✅ [MINI-KANBAN] 정상 칸반보드 렌더링:', tasks.length, '개 업무', {
    tasksByType: Object.keys(tasksByType).map(type => `${type}:${tasksByType[type].tasks.length}`).join(', ')
  });

  return (
    <div className="bg-white rounded-lg p-4 shadow-sm">
      <div className="flex items-center text-sm text-gray-600 mb-3">
        <Clock className="w-4 h-4 mr-2 text-orange-500" />
        업무 진행 단계
      </div>

      {/* 업무 타입별 미니 칸반보드 */}
      {Object.entries(tasksByType).map(([taskType, typeData]) => {
        if (typeData.tasks.length === 0) return null;

        const typeLabels: {[key: string]: string} = {
          self: '자비',
          subsidy: '보조금',
          dealer: '대리점', // 🔄 추가
          outsourcing: '외주설치', // 🔄 추가
          as: 'AS',
          etc: '기타'
        };

        return (
          <div key={taskType} className="mb-4">
            <div className="text-xs font-medium text-gray-700 mb-2 px-1">
              {typeLabels[taskType] || taskType} ({typeData.tasks.length}개)
            </div>

            {/* 해당 타입의 단계별 버튼 */}
            <div className="flex gap-1 mb-2 overflow-x-auto">
              {typeData.steps.map((step) => {
                const stepTasks = typeData.tasks.filter(task => task.status === step.status);
                const isExpanded = expandedStatus === `${taskType}-${step.status}`;
                const colorClasses = getColorClasses(step.color);

                return (
                  <div key={`${taskType}-${step.status}`} className="flex-shrink-0">
                    <button
                      onClick={() => setExpandedStatus(isExpanded ? null : `${taskType}-${step.status}`)}
                      className={`
                        ${stepTasks.length > 0
                          ? 'text-sm px-3 py-2 font-medium shadow-sm border-2'
                          : 'text-xs px-2 py-1 font-normal border opacity-60'
                        }
                        rounded transition-all duration-200 hover:opacity-80 whitespace-nowrap
                        ${colorClasses.color}
                        ${stepTasks.length > 0 ? 'hover:scale-105' : ''}
                      `}
                    >
                      <div className="flex items-center gap-1">
                        <span>{step.label}</span>
                        <span className={`font-bold ${stepTasks.length > 0 ? 'text-base' : 'text-xs'}`}>
                          {stepTasks.length}
                        </span>
                        {stepTasks.length > 0 && (
                          isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                        )}
                      </div>
                    </button>
                  </div>
                );
              })}
            </div>

            {/* 확장된 업무 목록 */}
            {expandedStatus && expandedStatus.startsWith(`${taskType}-`) && (
              <div className={`mt-2 p-2 rounded-lg border ${getColorClasses(typeData.steps.find(s => expandedStatus === `${taskType}-${s.status}`)?.color || 'gray').bgColor}`}>
                <div className="space-y-2">
                  {typeData.tasks.filter(task => expandedStatus === `${taskType}-${task.status}`).map((task) => (
                    <div key={task.id} className="bg-white p-2 rounded border text-xs">
                      <div className="flex items-center justify-between text-gray-600">
                        <div className="flex items-center gap-2">
                          <User className="w-3 h-3" />
                          <span>{getAssigneeName(task)}</span>
                        </div>
                        {task.due_date && (
                          <div className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            <span className={formatDueDate(task.due_date)?.startsWith('D+') ? 'text-red-600' : ''}>
                              {formatDueDate(task.due_date)}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* 상태 변경 드롭다운 - 해당 타입의 단계만 표시 */}
                      <div className="mt-2">
                        <select
                          value={task.status}
                          onChange={(e) => handleStatusChange(task.id, e.target.value)}
                          className="w-full text-xs border rounded px-2 py-1 bg-gray-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-orange-500"
                        >
                          {typeData.steps.map((step) => (
                            <option key={step.status} value={step.status}>
                              {step.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* 업무가 없을 경우 메시지 */}
      {Object.values(tasksByType).every(typeData => typeData.tasks.length === 0) && (
        <div className="text-sm text-gray-500 text-center py-2">
          등록된 업무가 없습니다.
        </div>
      )}
    </div>
  );
}