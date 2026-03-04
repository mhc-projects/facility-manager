'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AdminLayout from '@/components/ui/AdminLayout';
import { useAuth } from '@/contexts/AuthContext';
import { isPathHiddenForAccount } from '@/lib/auth/special-accounts';

// ============================================================
// 통합 크롤링 모니터링 대시보드
// ============================================================
// 목적: 크롤링 실행, 지자체별 통계, URL 건강도를 한 페이지에서 관리
// 경로: /admin/subsidy/monitoring-dashboard
// ============================================================

type TabType = 'runs' | 'regional' | 'urlHealth';

// 크롤링 실행 관련 타입
interface CrawlRun {
  id: string;
  run_id: string;
  trigger_type: 'scheduled' | 'manual';
  status: 'running' | 'completed' | 'failed' | 'partial';
  started_at: string;
  completed_at: string | null;
  total_batches: number;
  completed_batches: number;
  total_urls_crawled: number;
  successful_urls: number;
  failed_urls: number;
  total_announcements: number;
  new_announcements: number;
  relevant_announcements: number;
  ai_verified_announcements: number;
}

interface RunsData {
  runs: CrawlRun[];
  statistics: {
    total_runs: number;
    avg_success_rate: number;
    avg_relevance_rate: number;
    avg_ai_verification_rate: number;
  };
}

// 지자체별 통계 타입
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

// URL 건강도 타입
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

export default function MonitoringDashboard() {
  const router = useRouter();
  const { user, permissions } = useAuth();

  useEffect(() => {
    if (user?.email && permissions?.isSpecialAccount && isPathHiddenForAccount(user.email, '/admin/subsidy/monitoring-dashboard')) {
      router.replace('/admin/business');
    }
  }, [user, permissions]);

  const [activeTab, setActiveTab] = useState<TabType>('runs');
  const [loading, setLoading] = useState(false);
  const [crawling, setCrawling] = useState(false);
  const [crawlError, setCrawlError] = useState<string | null>(null);

  // 크롤링 실행 데이터
  const [runsData, setRunsData] = useState<RunsData | null>(null);
  const [runsLimit, setRunsLimit] = useState(20);

  // 지자체별 통계 데이터
  const [regionalData, setRegionalData] = useState<RegionalStatsData | null>(null);
  const [regionalPeriod, setRegionalPeriod] = useState(30);
  const [regionalPage, setRegionalPage] = useState(1);
  const REGIONS_PER_PAGE = 20;

  // URL 건강도 데이터
  const [urlHealthData, setUrlHealthData] = useState<UrlHealthData | null>(null);
  const [unhealthyOnly, setUnhealthyOnly] = useState(false);

  // 탭 변경 시 데이터 로드
  useEffect(() => {
    loadActiveTabData();
  }, [activeTab, runsLimit, regionalPeriod, unhealthyOnly]);

  // 기간 변경 시 페이지를 1로 리셋
  useEffect(() => {
    setRegionalPage(1);
  }, [regionalPeriod]);

  const loadActiveTabData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'runs') {
        await loadRuns();
      } else if (activeTab === 'regional') {
        await loadRegionalStats();
      } else if (activeTab === 'urlHealth') {
        await loadUrlHealth();
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadRuns = async () => {
    try {
      const response = await fetch(`/api/subsidy-crawler/runs?limit=${runsLimit}&offset=0`);
      const result = await response.json();
      if (result.success) {
        setRunsData(result.data);
      }
    } catch (error) {
      console.error('Failed to load runs:', error);
    }
  };

  const loadRegionalStats = async () => {
    try {
      const response = await fetch(`/api/subsidy-crawler/stats/by-region?period=${regionalPeriod}`);
      const result = await response.json();
      if (result.success) {
        setRegionalData(result.data);
      }
    } catch (error) {
      console.error('Failed to load regional stats:', error);
    }
  };

  const loadUrlHealth = async () => {
    try {
      const response = await fetch(`/api/subsidy-crawler/url-health?unhealthy_only=${unhealthyOnly}`);
      const result = await response.json();
      if (result.success) {
        setUrlHealthData(result.data);
      }
    } catch (error) {
      console.error('Failed to load URL health:', error);
    }
  };

  const handleManualCrawl = async () => {
    if (crawling) return;

    setCrawling(true);
    setCrawlError(null);

    try {
      const response = await fetch('/api/subsidy-crawler/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enable_phase2: true,
          force: false,
        }),
      });

      const result = await response.json();

      if (result.success) {
        const workflowList = result.workflows_triggered?.join('\n- ') || '알 수 없음';
        alert(
          `크롤링이 시작되었습니다!\n\n실행된 워크플로우:\n- ${workflowList}\n\n완료까지 최대 5분 소요될 수 있습니다.`
        );
        // 5초 후 자동으로 데이터 새로고침
        setTimeout(() => {
          if (activeTab === 'runs') {
            loadRuns();
          }
        }, 5000);
      } else {
        setCrawlError(result.error || result.message || '크롤링 시작에 실패했습니다.');
        alert(`오류: ${result.error || result.message || '크롤링 시작에 실패했습니다.'}`);
      }
    } catch (error) {
      console.error('Manual crawl error:', error);
      const errorMsg = error instanceof Error ? error.message : '알 수 없는 오류';
      setCrawlError(errorMsg);
      alert(`오류: ${errorMsg}`);
    } finally {
      setCrawling(false);
    }
  };

  return (
    <AdminLayout
      title="📊 크롤링 통합 모니터링"
      actions={
        <>
          <button
            onClick={handleManualCrawl}
            disabled={crawling}
            className={`px-4 py-2 text-white rounded-lg transition-colors ${
              crawling
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-green-600 hover:bg-green-700'
            }`}
          >
            {crawling ? (
              <>
                <span className="inline-block animate-spin mr-2">⏳</span>
                크롤링 실행 중...
              </>
            ) : (
              <>▶️ 크롤링 시작</>
            )}
          </button>
          <button
            onClick={loadActiveTabData}
            disabled={crawling}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            🔄 새로고침
          </button>
        </>
      }
    >
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* 탭 네비게이션 */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <TabButton
            active={activeTab === 'runs'}
            onClick={() => setActiveTab('runs')}
            icon="📈"
            label="크롤링 실행"
          />
          <TabButton
            active={activeTab === 'regional'}
            onClick={() => setActiveTab('regional')}
            icon="🗺️"
            label="지자체별 통계"
          />
          <TabButton
            active={activeTab === 'urlHealth'}
            onClick={() => setActiveTab('urlHealth')}
            icon="🏥"
            label="URL 건강도"
          />
        </nav>
      </div>

      {/* 로딩 상태 */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">로딩 중...</p>
          </div>
        </div>
      )}

      {/* 탭 콘텐츠 */}
      {!loading && (
        <>
          {activeTab === 'runs' && runsData && (
            <RunsTabContent
              data={runsData}
              limit={runsLimit}
              setLimit={setRunsLimit}
              router={router}
            />
          )}
          {activeTab === 'regional' && regionalData && (
            <RegionalTabContent
              data={regionalData}
              period={regionalPeriod}
              setPeriod={setRegionalPeriod}
              currentPage={regionalPage}
              setCurrentPage={setRegionalPage}
              itemsPerPage={REGIONS_PER_PAGE}
            />
          )}
          {activeTab === 'urlHealth' && urlHealthData && (
            <UrlHealthTabContent
              data={urlHealthData}
              unhealthyOnly={unhealthyOnly}
              setUnhealthyOnly={setUnhealthyOnly}
            />
          )}
        </>
      )}
      </div>
    </AdminLayout>
  );
}

// ============================================================
// 탭 버튼 컴포넌트
// ============================================================
function TabButton({ active, onClick, icon, label }: {
  active: boolean;
  onClick: () => void;
  icon: string;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`
        whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors
        ${active
          ? 'border-blue-500 text-blue-600'
          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
        }
      `}
    >
      {icon} {label}
    </button>
  );
}

// ============================================================
// 크롤링 실행 탭 콘텐츠
// ============================================================
function RunsTabContent({ data, limit, setLimit, router }: {
  data: RunsData;
  limit: number;
  setLimit: (limit: number) => void;
  router: any;
}) {
  return (
    <div className="space-y-6">
      {/* 요약 통계 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard label="전체 실행" value={data.statistics.total_runs} icon="📈" />
        <StatCard label="평균 성공률" value={`${(data.statistics.avg_success_rate || 0).toFixed(1)}%`} icon="✅" color="green" />
        <StatCard label="평균 관련도" value={`${(data.statistics.avg_relevance_rate || 0).toFixed(1)}%`} icon="🎯" color="blue" />
        <StatCard label="AI 검증률" value={`${(data.statistics.avg_ai_verification_rate || 0).toFixed(1)}%`} icon="🤖" color="purple" />
      </div>

      {/* 표시 개수 선택 */}
      <div className="flex items-center gap-2">
        <label className="text-sm text-gray-600">표시 개수:</label>
        <select
          value={limit}
          onChange={(e) => setLimit(Number(e.target.value))}
          className="px-3 py-1 border border-gray-300 rounded-lg"
        >
          <option value={10}>10개</option>
          <option value={20}>20개</option>
          <option value={50}>50개</option>
        </select>
      </div>

      {/* 실행 목록 테이블 */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
          <h2 className="text-lg font-semibold text-gray-900">크롤링 실행 이력</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">실행 ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">실행 시간</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">상태</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">배치</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">URL</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">공고</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">성공률</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {data.runs.map(run => (
                <RunRow key={run.id} run={run} router={router} />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {data.runs.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          <p>아직 크롤링 실행 기록이 없습니다.</p>
        </div>
      )}
    </div>
  );
}

// ============================================================
// 지자체별 통계 탭 콘텐츠
// ============================================================
function RegionalTabContent({
  data,
  period,
  setPeriod,
  currentPage,
  setCurrentPage,
  itemsPerPage
}: {
  data: RegionalStatsData;
  period: number;
  setPeriod: (period: number) => void;
  currentPage: number;
  setCurrentPage: (page: number) => void;
  itemsPerPage: number;
}) {
  const problemRegions = data.regions.filter(
    r => r.health_status === 'warning' || r.health_status === 'critical'
  );

  // 페이지네이션 계산
  const totalPages = Math.ceil(data.regions.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedRegions = data.regions.slice(startIndex, endIndex);

  return (
    <div className="space-y-6">
      {/* 기간 선택 */}
      <div className="flex gap-2">
        {[7, 30, 90].map(days => (
          <button
            key={days}
            onClick={() => setPeriod(days)}
            className={`px-4 py-2 rounded-lg transition-colors ${
              period === days
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            최근 {days}일
          </button>
        ))}
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard label="전체 지역" value={data.summary.total_regions} icon="🗺️" />
        <StatCard label="정상 지역" value={data.summary.healthy_regions} icon="✅" color="green" />
        <StatCard label="주의 지역" value={data.summary.warning_regions} icon="⚠️" color="yellow" />
        <StatCard label="위험 지역" value={data.summary.critical_regions} icon="🚨" color="red" />
      </div>

      {/* 문제 지역 알림 */}
      {problemRegions.length > 0 && (
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded-r-lg">
          <div className="flex">
            <div className="ml-3">
              <h3 className="text-sm font-medium text-yellow-800">
                ⚠️ 주의가 필요한 지역 ({problemRegions.length}개)
              </h3>
              <div className="mt-2 text-sm text-yellow-700">
                <ul className="list-disc pl-5 space-y-1">
                  {problemRegions.slice(0, 5).map(region => (
                    <li key={region.region_name}>
                      {region.health_status === 'critical' ? '🚨' : '⚠️'}{' '}
                      <strong>{region.region_name}</strong>: 성공률 {(region.success_rate || 0).toFixed(1)}%
                    </li>
                  ))}
                  {problemRegions.length > 5 && (
                    <li>외 {problemRegions.length - 5}개 지역...</li>
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
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">지역명</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">URL 수</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">성공/실패</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">성공률</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">공고</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">상태</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {paginatedRegions.map(region => (
                <RegionalStatsRow key={region.region_name} region={region} />
              ))}
            </tbody>
          </table>
        </div>

        {/* 페이지네이션 컨트롤 */}
        {totalPages > 1 && (
          <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-700">
                총 <span className="font-medium">{data.regions.length}</span>개 지역 중{' '}
                <span className="font-medium">{startIndex + 1}</span>-
                <span className="font-medium">{Math.min(endIndex, data.regions.length)}</span> 표시
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1 rounded border border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
                >
                  이전
                </button>
                <div className="flex gap-1">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                    <button
                      key={page}
                      onClick={() => setCurrentPage(page)}
                      className={`px-3 py-1 rounded ${
                        currentPage === page
                          ? 'bg-blue-600 text-white'
                          : 'border border-gray-300 hover:bg-gray-100'
                      }`}
                    >
                      {page}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1 rounded border border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
                >
                  다음
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// URL 건강도 탭 콘텐츠
// ============================================================
function UrlHealthTabContent({ data, unhealthyOnly, setUnhealthyOnly }: {
  data: UrlHealthData;
  unhealthyOnly: boolean;
  setUnhealthyOnly: (value: boolean) => void;
}) {
  const problemUrls = data.metrics.filter(
    m => !m.is_healthy || m.consecutive_failures >= 3
  );

  return (
    <div className="space-y-6">
      {/* 요약 통계 */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <StatCard label="전체 URL" value={data.statistics.total_urls} icon="🔗" />
        <StatCard label="정상 URL" value={data.statistics.healthy_urls} icon="✅" color="green" />
        <StatCard label="위험 URL" value={data.statistics.unhealthy_urls} icon="⚠️" color="red" />
        <StatCard label="평균 성공률" value={`${(data.statistics.avg_success_rate || 0).toFixed(1)}%`} icon="📊" color="blue" />
        <StatCard label="평균 응답시간" value={data.statistics.avg_response_time_ms ? `${data.statistics.avg_response_time_ms.toFixed(0)}ms` : 'N/A'} icon="⚡" />
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
        <span className="text-sm text-gray-600">({data.metrics.length}개 URL)</span>
      </div>

      {/* 문제 URL 알림 */}
      {problemUrls.length > 0 && (
        <div className="bg-red-50 border-l-4 border-red-400 p-4 rounded-r-lg">
          <h3 className="text-sm font-medium text-red-800">
            ⚠️ 주의가 필요한 URL ({problemUrls.length}개)
          </h3>
          <div className="mt-2 text-sm text-red-700">
            <ul className="list-disc pl-5 space-y-1">
              {problemUrls.slice(0, 5).map(url => (
                <li key={url.id}>
                  <strong>{url.region_name || 'Unknown'}</strong>: 성공률 {(url.success_rate || 0).toFixed(1)}% | 연속 실패 {url.consecutive_failures}회
                </li>
              ))}
              {problemUrls.length > 5 && (
                <li>외 {problemUrls.length - 5}개 URL...</li>
              )}
            </ul>
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
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">URL / 지역</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">시도</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">성공률</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">연속 실패</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">공고</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">상태</th>
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
    </div>
  );
}

// ============================================================
// 공통 컴포넌트
// ============================================================
function StatCard({ label, value, icon, color }: {
  label: string;
  value: string | number;
  icon: string;
  color?: 'green' | 'yellow' | 'red' | 'blue' | 'purple';
}) {
  const bgColor = color === 'green' ? 'bg-green-50 border-green-200' :
                  color === 'yellow' ? 'bg-yellow-50 border-yellow-200' :
                  color === 'red' ? 'bg-red-50 border-red-200' :
                  color === 'blue' ? 'bg-blue-50 border-blue-200' :
                  color === 'purple' ? 'bg-purple-50 border-purple-200' :
                  'bg-gray-50 border-gray-200';

  return (
    <div className={`${bgColor} border rounded-lg p-6 transition-shadow hover:shadow-md`}>
      <div className="text-4xl mb-2">{icon}</div>
      <div className="text-3xl font-bold text-gray-900">{value}</div>
      <div className="text-sm text-gray-600 mt-1">{label}</div>
    </div>
  );
}

function RunRow({ run, router }: { run: CrawlRun; router: any }) {
  const statusColor = run.status === 'completed' ? 'text-green-600 bg-green-50' :
                      run.status === 'running' ? 'text-blue-600 bg-blue-50' :
                      run.status === 'failed' ? 'text-red-600 bg-red-50' :
                      'text-yellow-600 bg-yellow-50';

  const statusIcon = run.status === 'completed' ? '✅' :
                     run.status === 'running' ? '🔄' :
                     run.status === 'failed' ? '❌' : '⚠️';

  const successRate = run.total_urls_crawled > 0
    ? ((run.successful_urls / run.total_urls_crawled) * 100).toFixed(1)
    : '0.0';

  return (
    <tr
      className="hover:bg-gray-50 transition-colors cursor-pointer"
      onClick={() => router.push(`/admin/subsidy/monitoring/${run.run_id}`)}
    >
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="text-sm font-medium text-gray-900">{run.run_id}</div>
        <div className="text-xs text-gray-500">
          {run.trigger_type === 'scheduled' ? '⏰ 예약' : '▶️ 수동'}
        </div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
        {new Date(run.started_at).toLocaleString('ko-KR')}
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColor}`}>
          {statusIcon} {run.status}
        </span>
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm">
        {run.completed_batches} / {run.total_batches}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm">
        <span className="text-green-600 font-medium">{run.successful_urls}</span> /
        <span className="text-gray-900 ml-1">{run.total_urls_crawled}</span>
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm">
        {run.total_announcements} /
        <span className="text-blue-600 font-medium ml-1">{run.relevant_announcements}</span> /
        <span className="text-purple-600 font-medium ml-1">{run.ai_verified_announcements}</span>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="flex items-center">
          <span className="text-sm font-semibold mr-2">{successRate}%</span>
          <div className="w-16 bg-gray-200 rounded-full h-2">
            <div className="bg-green-500 h-2 rounded-full" style={{ width: `${successRate}%` }} />
          </div>
        </div>
      </td>
    </tr>
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
        {region.region_code && <div className="text-xs text-gray-500">{region.region_code}</div>}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm">{region.total_urls}개</td>
      <td className="px-6 py-4 whitespace-nowrap text-sm">
        <span className="text-green-600 font-medium">{region.successful_crawls}</span> /
        <span className="text-red-600 font-medium ml-1">{region.failed_crawls}</span>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="text-sm font-semibold">{(region.success_rate || 0).toFixed(1)}%</div>
        <div className="w-20 bg-gray-200 rounded-full h-1.5 mt-1">
          <div
            className={`h-1.5 rounded-full ${
              region.health_status === 'healthy' ? 'bg-green-500' :
              region.health_status === 'warning' ? 'bg-yellow-500' : 'bg-red-500'
            }`}
            style={{ width: `${region.success_rate || 0}%` }}
          />
        </div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm">
        {region.total_announcements} /
        <span className="text-blue-600 font-medium ml-1">{region.relevant_announcements}</span> /
        <span className="text-purple-600 font-medium ml-1">{region.ai_verified_announcements}</span>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <span className={`text-2xl ${statusColor}`}>{statusIcon}</span>
      </td>
    </tr>
  );
}

function UrlHealthRow({ metric }: { metric: UrlHealthMetric }) {
  const statusColor = metric.is_healthy ? 'text-green-600' : 'text-red-600';
  const statusIcon = metric.is_healthy ? '✅' : '⚠️';

  return (
    <tr className={`hover:bg-gray-50 transition-colors ${!metric.is_healthy ? 'bg-red-50' : ''}`}>
      <td className="px-6 py-4">
        <div className="text-sm font-medium text-gray-900 truncate max-w-xs">{metric.source_url}</div>
        {metric.region_name && <div className="text-xs text-gray-500">{metric.region_name}</div>}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm">
        <span className="text-green-600 font-medium">{metric.successful_crawls}</span> /
        <span className="text-red-600 font-medium ml-1">{metric.failed_crawls}</span>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="text-sm font-semibold">{(metric.success_rate || 0).toFixed(1)}%</div>
        <div className="w-20 bg-gray-200 rounded-full h-1.5 mt-1">
          <div
            className={metric.is_healthy ? 'bg-green-500 h-1.5 rounded-full' : 'bg-red-500 h-1.5 rounded-full'}
            style={{ width: `${metric.success_rate || 0}%` }}
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
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <span className={`text-2xl ${statusColor}`}>{statusIcon}</span>
      </td>
    </tr>
  );
}
