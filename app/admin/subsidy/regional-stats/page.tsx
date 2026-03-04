'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { isPathHiddenForAccount } from '@/lib/auth/special-accounts';

// ============================================================
// 지자체별 크롤링 통계 페이지
// ============================================================
// 목적: 지역별 성공/실패 한눈에 파악
// 경로: /admin/subsidy/regional-stats
// ============================================================

interface RegionalStats {
  region_name: string;
  region_code: string | null;
  total_urls: number;
  successful_crawls: number;
  failed_crawls: number;
  success_rate: number;
  total_announcements: number;
  relevant_announcements: number;
  ai_verified_announcements: number;
  avg_response_time_ms: number | null;
  last_crawled_at: string | null;
  health_status: 'healthy' | 'warning' | 'critical';
}

interface RegionalStatsData {
  regions: RegionalStats[];
  summary: {
    total_regions: number;
    healthy_regions: number;
    warning_regions: number;
    critical_regions: number;
    total_urls: number;
    total_successful: number;
    total_failed: number;
    overall_success_rate: number;
  };
  period_days: number;
}

export default function RegionalStatsPage() {
  const router = useRouter();
  const { user, permissions } = useAuth();
  const [data, setData] = useState<RegionalStatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState(30);

  useEffect(() => {
    if (user?.email && permissions?.isSpecialAccount && isPathHiddenForAccount(user.email, '/admin/subsidy/regional-stats')) {
      router.replace('/admin/business');
      return;
    }
    loadStats();
  }, [period, user, permissions]);

  const loadStats = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/subsidy-crawler/stats/by-region?period=${period}`);
      const result = await response.json();
      if (result.success) {
        setData(result.data);
      } else {
        console.error('Failed to load stats:', result.error);
      }
    } catch (error) {
      console.error('Error loading stats:', error);
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
            onClick={loadStats}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            다시 시도
          </button>
        </div>
      </div>
    );
  }

  // 문제 지역 필터링
  const problemRegions = data.regions.filter(
    r => r.health_status === 'warning' || r.health_status === 'critical'
  );

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* 제목 */}
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">📊 지자체별 크롤링 통계</h1>
        <button
          onClick={loadStats}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          🔄 새로고침
        </button>
      </div>

      {/* 기간 선택 */}
      <div className="flex gap-2">
        <button
          onClick={() => setPeriod(7)}
          className={`px-4 py-2 rounded-lg transition-colors ${
            period === 7
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          최근 7일
        </button>
        <button
          onClick={() => setPeriod(30)}
          className={`px-4 py-2 rounded-lg transition-colors ${
            period === 30
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          최근 30일
        </button>
        <button
          onClick={() => setPeriod(90)}
          className={`px-4 py-2 rounded-lg transition-colors ${
            period === 90
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          최근 90일
        </button>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <SummaryCard
          label="전체 지역"
          value={data.summary.total_regions}
          icon="🗺️"
        />
        <SummaryCard
          label="정상 지역"
          value={data.summary.healthy_regions}
          icon="✅"
          color="green"
        />
        <SummaryCard
          label="주의 지역"
          value={data.summary.warning_regions}
          icon="⚠️"
          color="yellow"
        />
        <SummaryCard
          label="위험 지역"
          value={data.summary.critical_regions}
          icon="🚨"
          color="red"
        />
      </div>

      {/* 문제 지역 알림 */}
      {problemRegions.length > 0 && (
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded-r-lg">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-yellow-800">
                ⚠️ 주의가 필요한 지역 ({problemRegions.length}개)
              </h3>
              <div className="mt-2 text-sm text-yellow-700">
                <ul className="list-disc pl-5 space-y-1">
                  {problemRegions.slice(0, 5).map(region => (
                    <li key={region.region_name}>
                      {region.health_status === 'critical' ? '🚨' : '⚠️'}{' '}
                      <strong>{region.region_name}</strong>: 성공률{' '}
                      {region.success_rate.toFixed(1)}% ({region.successful_crawls}/
                      {region.successful_crawls + region.failed_crawls})
                    </li>
                  ))}
                  {problemRegions.length > 5 && (
                    <li className="text-gray-600">외 {problemRegions.length - 5}개 지역...</li>
                  )}
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 지역별 통계 테이블 */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
          <h2 className="text-lg font-semibold text-gray-900">지역별 상세 통계</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  지역명
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  URL 수
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  성공/실패
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  성공률
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  공고 (전체/관련/AI)
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  평균 응답시간
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  상태
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {data.regions.map(region => (
                <RegionalStatsRow key={region.region_name} region={region} />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 성공률 시각화 */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">지역별 성공률</h3>
        <div className="space-y-3">
          {data.regions.map(region => (
            <div key={region.region_name}>
              <div className="flex justify-between text-sm mb-1">
                <span className="font-medium text-gray-700">{region.region_name}</span>
                <span className="font-semibold text-gray-900">{region.success_rate.toFixed(1)}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all ${
                    region.health_status === 'healthy'
                      ? 'bg-green-500'
                      : region.health_status === 'warning'
                      ? 'bg-yellow-500'
                      : 'bg-red-500'
                  }`}
                  style={{ width: `${region.success_rate}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// 하위 컴포넌트들
function SummaryCard({ label, value, icon, color }: {
  label: string;
  value: number;
  icon: string;
  color?: 'green' | 'yellow' | 'red';
}) {
  const bgColor = color === 'green' ? 'bg-green-50 border-green-200' :
                  color === 'yellow' ? 'bg-yellow-50 border-yellow-200' :
                  color === 'red' ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200';

  return (
    <div className={`${bgColor} border rounded-lg p-6 transition-shadow hover:shadow-md`}>
      <div className="text-4xl mb-2">{icon}</div>
      <div className="text-3xl font-bold text-gray-900">{value}</div>
      <div className="text-sm text-gray-600 mt-1">{label}</div>
    </div>
  );
}

function RegionalStatsRow({ region }: { region: RegionalStats }) {
  const statusIcon = region.health_status === 'healthy' ? '✅' :
                     region.health_status === 'warning' ? '⚠️' : '🚨';

  const statusColor = region.health_status === 'healthy' ? 'text-green-600' :
                      region.health_status === 'warning' ? 'text-yellow-600' : 'text-red-600';

  return (
    <tr className="hover:bg-gray-50 transition-colors">
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="font-medium text-gray-900">{region.region_name}</div>
        {region.region_code && (
          <div className="text-xs text-gray-500">{region.region_code}</div>
        )}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
        {region.total_urls}개
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm">
        <span className="text-green-600 font-medium">{region.successful_crawls}</span> /{' '}
        <span className="text-red-600 font-medium">{region.failed_crawls}</span>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="text-sm font-semibold text-gray-900">{region.success_rate.toFixed(1)}%</div>
        <div className="w-20 bg-gray-200 rounded-full h-1.5 mt-1">
          <div
            className={`h-1.5 rounded-full ${
              region.health_status === 'healthy' ? 'bg-green-500' :
              region.health_status === 'warning' ? 'bg-yellow-500' : 'bg-red-500'
            }`}
            style={{ width: `${region.success_rate}%` }}
          />
        </div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
        <div>{region.total_announcements} /{' '}
        <span className="text-blue-600 font-medium">{region.relevant_announcements}</span> /{' '}
        <span className="text-purple-600 font-medium">{region.ai_verified_announcements}</span></div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
        {region.avg_response_time_ms ? `${region.avg_response_time_ms}ms` : 'N/A'}
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <span className={`text-2xl ${statusColor}`}>{statusIcon}</span>
      </td>
    </tr>
  );
}
