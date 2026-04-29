'use client';

import { useEffect, useState } from 'react';
import { useAdminData } from '@/contexts/AdminDataContext';

interface StatusHistoryEntry {
  id: string;
  created_at: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  duration_days: number | null;
  assignee_name: string | null;
  notes: string | null;
  created_by_name: string | null;
}

interface TaskHistoryTimelineProps {
  taskId: string;
  className?: string;
}

export default function TaskHistoryTimeline({ taskId, className = '' }: TaskHistoryTimelineProps) {
  const { getStageLabel } = useAdminData();
  const [history, setHistory] = useState<StatusHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadHistory();
  }, [taskId]);

  async function loadHistory() {
    try {
      setLoading(true);
      const response = await fetch(`/api/facility-tasks/${taskId}/history`);
      const data = await response.json();

      if (data.success) {
        setHistory(data.data);
      } else {
        setError(data.error || '이력 조회 실패');
      }
    } catch (err) {
      console.error('이력 조회 오류:', err);
      setError('이력을 불러오는 중 오류가 발생했습니다');
    } finally {
      setLoading(false);
    }
  }

  function formatDate(dateString: string) {
    const date = new Date(dateString);
    return date.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'Asia/Seoul'
    });
  }

  function formatDateTime(dateString: string) {
    const date = new Date(dateString);
    return date.toLocaleString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Seoul'
    });
  }

  if (loading) {
    return (
      <div className={`animate-pulse ${className}`}>
        <div className="h-6 bg-gray-200 rounded mb-4 w-1/3"></div>
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="flex gap-4">
              <div className="w-10 h-10 bg-gray-200 rounded-full"></div>
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-gray-200 rounded w-1/4"></div>
                <div className="h-3 bg-gray-200 rounded w-1/2"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`bg-red-50 border border-red-200 rounded-lg p-4 ${className}`}>
        <p className="text-red-700 text-sm">{error}</p>
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className={`bg-gray-50 border border-gray-200 rounded-lg p-6 text-center ${className}`}>
        <p className="text-gray-500">아직 단계 이력이 없습니다</p>
      </div>
    );
  }

  return (
    <div className={className}>
      <h3 className="text-lg font-semibold text-gray-900 mb-4">
        📅 단계 이력
      </h3>

      <div className="relative">
        {/* 세로 타임라인 선 */}
        <div className="absolute left-5 top-5 bottom-5 w-0.5 bg-gray-300"></div>

        {/* 이력 항목들 */}
        <div className="space-y-6">
          {history.map((entry, index) => {
            const isCompleted = entry.completed_at !== null;
            const isLast = index === history.length - 1;
            const isCurrent = !isCompleted && isLast;

            return (
              <div key={entry.id} className="relative flex gap-4">
                {/* 타임라인 점 */}
                <div className={`
                  relative z-10 w-10 h-10 rounded-full flex items-center justify-center
                  ${isCurrent ? 'bg-blue-500 ring-4 ring-blue-100' :
                    isCompleted ? 'bg-green-500' : 'bg-gray-300'}
                `}>
                  {isCompleted && (
                    <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                  {isCurrent && (
                    <div className="w-3 h-3 bg-white rounded-full animate-pulse"></div>
                  )}
                </div>

                {/* 내용 */}
                <div className="flex-1 pb-6">
                  <div className={`
                    bg-white border rounded-lg p-4 shadow-sm
                    ${isCurrent ? 'border-blue-300 shadow-blue-100' : 'border-gray-200'}
                  `}>
                    {/* 헤더 */}
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h4 className="font-semibold text-gray-900">
                          {getStageLabel(entry.status)}
                        </h4>
                        {entry.assignee_name && (
                          <p className="text-sm text-gray-600 mt-1">
                            담당자: {entry.assignee_name}
                          </p>
                        )}
                      </div>
                      {isCurrent && (
                        <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded">
                          진행 중
                        </span>
                      )}
                      {isCompleted && entry.duration_days !== null && (
                        <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs font-medium rounded">
                          {entry.duration_days}일 소요
                        </span>
                      )}
                    </div>

                    {/* 날짜 정보 */}
                    <div className="space-y-1 text-sm">
                      <div className="flex items-center gap-2 text-gray-600">
                        <span className="font-medium">시작:</span>
                        <span>{formatDateTime(entry.started_at)}</span>
                      </div>
                      {entry.completed_at && (
                        <div className="flex items-center gap-2 text-gray-600">
                          <span className="font-medium">완료:</span>
                          <span>{formatDateTime(entry.completed_at)}</span>
                        </div>
                      )}
                    </div>

                    {/* 메모 */}
                    {entry.notes && (
                      <div className="mt-3 pt-3 border-t border-gray-100">
                        <p className="text-sm text-gray-700">{entry.notes}</p>
                      </div>
                    )}

                    {/* 생성자 */}
                    {entry.created_by_name && (
                      <div className="mt-2 text-xs text-gray-500">
                        기록: {entry.created_by_name}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 통계 요약 */}
      <div className="mt-6 pt-6 border-t border-gray-200">
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-blue-50 rounded-lg p-4">
            <p className="text-sm text-gray-600 mb-1">완료된 단계</p>
            <p className="text-2xl font-bold text-blue-600">
              {history.filter(h => h.completed_at).length}개
            </p>
          </div>
          <div className="bg-green-50 rounded-lg p-4">
            <p className="text-sm text-gray-600 mb-1">총 소요 시간</p>
            <p className="text-2xl font-bold text-green-600">
              {history
                .filter(h => h.duration_days !== null)
                .reduce((sum, h) => sum + (h.duration_days || 0), 0)}일
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
