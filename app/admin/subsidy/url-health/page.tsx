'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { isPathHiddenForAccount } from '@/lib/auth/special-accounts';

// ============================================================
// URL 건강도 모니터
// ============================================================
// 목적: URL별 크롤링 성공률 및 건강도 추적
// 경로: /admin/subsidy/url-health
// ============================================================

interface UrlHealthMetric {
  id: string;
  source_url: string;
  region_name: string | null;
  total_attempts: number;
  successful_crawls: number;
  failed_crawls: number;
  consecutive_failures: number;
  success_rate: number;
  total_announcements: number;
  relevant_announcements: number;
  relevance_rate: number;
  avg_response_time_ms: number | null;
  max_response_time_ms: number | null;
  min_response_time_ms: number | null;
  last_success_at: string | null;
  last_failure_at: string | null;
  last_checked_at: string | null;
  is_healthy: boolean;
}

interface UrlHealthData {
  metrics: UrlHealthMetric[];
  statistics: {
    total_urls: number;
    healthy_urls: number;
    unhealthy_urls: number;
    avg_success_rate: number;
    avg_response_time_ms: number;
  };
}

export default function UrlHealthMonitor() {
  const router = useRouter();
  const { user, permissions } = useAuth();
  const [data, setData] = useState<UrlHealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [unhealthyOnly, setUnhealthyOnly] = useState(false);

  useEffect(() => {
    if (user?.email && permissions?.isSpecialAccount && isPathHiddenForAccount(user.email, '/admin/subsidy/url-health')) {
      router.replace('/admin/business');
      return;
    }
    loadUrlHealth();
  }, [unhealthyOnly, user, permissions]);

  const loadUrlHealth = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/subsidy-crawler/url-health?unhealthy_only=${unhealthyOnly}`);
      const result = await response.json();
      if (result.success) {
        setData(result.data);
      } else {
        console.error('Failed to load URL health:', result.error);
      }
    } catch (error) {
      console.error('Error loading URL health:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">로딩 중...</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-gray-600">데이터를 불러올 수 없습니다.</p>
          <button
            onClick={loadUrlHealth}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            다시 시도
          </button>
        </div>
      </div>
    );
  }

  // 문제 URL 필터링 (연속 실패 >= 3 또는 건강하지 않음)
  const problemUrls = data.metrics.filter(
    m => !m.is_healthy || m.consecutive_failures >= 3
  );

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* 제목 */}
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">🏥 URL 건강도 모니터</h1>
        <button
          onClick={loadUrlHealth}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          🔄 새로고침
        </button>
      </div>

      {/* 요약 통계 */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <StatCard
          label="전체 URL"
          value={data.statistics.total_urls}
          icon="🔗"
        />
        <StatCard
          label="정상 URL"
          value={data.statistics.healthy_urls}
          icon="✅"
          color="green"
        />
        <StatCard
          label="위험 URL"
          value={data.statistics.unhealthy_urls}
          icon="⚠️"
          color="red"
        />
        <StatCard
          label="평균 성공률"
          value={`${data.statistics.avg_success_rate.toFixed(1)}%`}
          icon="📊"
          color="blue"
        />
        <StatCard
          label="평균 응답시간"
          value={`${data.statistics.avg_response_time_ms.toFixed(0)}ms`}
          icon="⚡"
        />
      </div>

      {/* 필터 토글 */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => setUnhealthyOnly(!unhealthyOnly)}
          className={`px-4 py-2 rounded-lg transition-colors ${
            unhealthyOnly
              ? 'bg-red-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          {unhealthyOnly ? '⚠️ 문제 URL만 표시 중' : '전체 표시'}
        </button>
        <span className="text-sm text-gray-600">
          ({data.metrics.length}개 URL 표시 중)
        </span>
      </div>

      {/* 문제 URL 알림 */}
      {problemUrls.length > 0 && (
        <div className="bg-red-50 border-l-4 border-red-400 p-4 rounded-r-lg">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">
                ⚠️ 주의가 필요한 URL ({problemUrls.length}개)
              </h3>
              <div className="mt-2 text-sm text-red-700">
                <ul className="list-disc pl-5 space-y-1">
                  {problemUrls.slice(0, 5).map(url => (
                    <li key={url.id}>
                      <strong>{url.region_name || 'Unknown'}</strong>: 성공률{' '}
                      {url.success_rate.toFixed(1)}% | 연속 실패 {url.consecutive_failures}회
                    </li>
                  ))}
                  {problemUrls.length > 5 && (
                    <li className="text-gray-600">외 {problemUrls.length - 5}개 URL...</li>
                  )}
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* URL 건강도 테이블 */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
          <h2 className="text-lg font-semibold text-gray-900">URL별 건강도 상세</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  URL / 지역
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  시도 (성공/실패)
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  성공률
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  연속 실패
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  공고 (전체/관련)
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  응답시간 (평균/최대)
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  최근 확인
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  상태
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {data.metrics.map(metric => (
                <UrlHealthRow key={metric.id} metric={metric} />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 안내 메시지 */}
      {data.metrics.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          <p>표시할 URL이 없습니다.</p>
        </div>
      )}
    </div>
  );
}

// 통계 카드 컴포넌트
function StatCard({ label, value, icon, color }: {
  label: string;
  value: string | number;
  icon: string;
  color?: 'green' | 'red' | 'blue';
}) {
  const bgColor = color === 'green' ? 'bg-green-50 border-green-200' :
                  color === 'red' ? 'bg-red-50 border-red-200' :
                  color === 'blue' ? 'bg-blue-50 border-blue-200' :
                  'bg-gray-50 border-gray-200';

  return (
    <div className={`${bgColor} border rounded-lg p-6 transition-shadow hover:shadow-md`}>
      <div className="text-4xl mb-2">{icon}</div>
      <div className="text-3xl font-bold text-gray-900">{value}</div>
      <div className="text-sm text-gray-600 mt-1">{label}</div>
    </div>
  );
}

// URL 건강도 행 컴포넌트
function UrlHealthRow({ metric }: { metric: UrlHealthMetric }) {
  const healthStatus = metric.is_healthy ? 'healthy' : 'unhealthy';
  const statusColor = healthStatus === 'healthy' ? 'text-green-600' : 'text-red-600';
  const statusIcon = healthStatus === 'healthy' ? '✅' : '⚠️';

  return (
    <tr className={`hover:bg-gray-50 transition-colors ${!metric.is_healthy ? 'bg-red-50' : ''}`}>
      <td className="px-6 py-4">
        <div className="text-sm font-medium text-gray-900 truncate max-w-xs">
          {metric.source_url}
        </div>
        {metric.region_name && (
          <div className="text-xs text-gray-500">{metric.region_name}</div>
        )}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm">
        <span className="text-green-600 font-medium">{metric.successful_crawls}</span> /
        <span className="text-red-600 font-medium ml-1">{metric.failed_crawls}</span>
        <div className="text-xs text-gray-500">총 {metric.total_attempts}회</div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="text-sm font-semibold text-gray-900">{metric.success_rate.toFixed(1)}%</div>
        <div className="w-20 bg-gray-200 rounded-full h-1.5 mt-1">
          <div
            className={`h-1.5 rounded-full ${
              metric.is_healthy ? 'bg-green-500' : 'bg-red-500'
            }`}
            style={{ width: `${metric.success_rate}%` }}
          />
        </div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        {metric.consecutive_failures >= 3 ? (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
            🚨 {metric.consecutive_failures}회
          </span>
        ) : metric.consecutive_failures > 0 ? (
          <span className="text-yellow-600 text-sm">{metric.consecutive_failures}회</span>
        ) : (
          <span className="text-green-600 text-sm">0회</span>
        )}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm">
        {metric.total_announcements} /
        <span className="text-blue-600 font-medium ml-1">{metric.relevant_announcements}</span>
        {metric.total_announcements > 0 && (
          <div className="text-xs text-gray-500">
            관련도 {metric.relevance_rate.toFixed(1)}%
          </div>
        )}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
        {metric.avg_response_time_ms ? (
          <div>
            <div>{metric.avg_response_time_ms}ms</div>
            {metric.max_response_time_ms && (
              <div className="text-xs text-gray-500">최대 {metric.max_response_time_ms}ms</div>
            )}
          </div>
        ) : (
          'N/A'
        )}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
        {metric.last_checked_at ? (
          <div>
            {new Date(metric.last_checked_at).toLocaleDateString('ko-KR')}
            <div className="text-xs">
              {new Date(metric.last_checked_at).toLocaleTimeString('ko-KR', {
                hour: '2-digit',
                minute: '2-digit'
              })}
            </div>
          </div>
        ) : (
          'N/A'
        )}
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <span className={`text-2xl ${statusColor}`}>{statusIcon}</span>
      </td>
    </tr>
  );
}
