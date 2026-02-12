'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import AdminLayout from '@/components/ui/AdminLayout'
import OrganizationChart from '@/components/admin/OrganizationChart'
import RevenueChart from '@/components/dashboard/charts/RevenueChart'
import ReceivableChart from '@/components/dashboard/charts/ReceivableChart'
import InstallationChart from '@/components/dashboard/charts/InstallationChart'
import FilterPanel from '@/components/dashboard/FilterPanel'
import DashboardCustomizer from '@/components/dashboard/DashboardCustomizer'
import { DashboardFilters } from '@/types/dashboard'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { AuthGuard, AuthUser } from '@/lib/auth/AuthGuard'
import { AuthLevel, AUTH_LEVEL_DESCRIPTIONS } from '@/lib/auth/AuthLevels'

interface Widget {
  id: string;
  visible: boolean;
  order: number;
}

interface DashboardLayout {
  widgets: Widget[];
}

const DEFAULT_LAYOUT: DashboardLayout = {
  widgets: [
    { id: 'organization', visible: true, order: 1 },
    { id: 'revenue', visible: true, order: 2 },
    { id: 'receivable', visible: true, order: 3 },
    { id: 'installation', visible: true, order: 4 }
  ]
};

export default function AdminDashboard() {
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  const [filters, setFilters] = useState<DashboardFilters>({})
  const [layout, setLayout] = useState<DashboardLayout>(DEFAULT_LAYOUT)
  const [isOrgExpanded, setIsOrgExpanded] = useState(false)
  const [authChecking, setAuthChecking] = useState(true)
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null)

  // ✅ 병렬 API 호출을 위한 데이터 상태
  const [revenueData, setRevenueData] = useState<any>(null)
  const [receivableData, setReceivableData] = useState<any>(null)
  const [installationData, setInstallationData] = useState<any>(null)
  const [chartsLoading, setChartsLoading] = useState(true)

  // ✅ 권한 확인 (최우선)
  useEffect(() => {
    checkAuthAndPermission()
  }, [])

  // ✅ 최적화 1: 레이아웃 로딩을 백그라운드로 처리 (즉시 렌더링)
  useEffect(() => {
    if (mounted && !authChecking) {
      // 권한 확인 후에만 레이아웃 로드
      loadLayout()
    }
  }, [mounted, authChecking])

  // ✅ 최적화 2: 병렬 API 호출로 차트 데이터 로드
  useEffect(() => {
    if (mounted && !authChecking) {
      loadAllChartData()
    }
  }, [filters, mounted, authChecking])

  // 권한 확인 함수
  const checkAuthAndPermission = async () => {
    try {
      // ✅ localStorage 토큰을 헤더로 전달 (모바일 호환성)
      const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;

      // 사용자 정보 조회 (쿠키 + Authorization 헤더)
      const response = await fetch('/api/auth/me', {
        credentials: 'include',
        headers: token ? {
          'Authorization': `Bearer ${token}`
        } : {}
      })

      if (!response.ok) {
        // 로그인 안 됨 - 로그인 페이지로 리다이렉트
        router.push('/login?redirect=/admin')
        return
      }

      const userData = await response.json()

      if (!userData.success || !userData.user) {
        router.push('/login?redirect=/admin')
        return
      }

      const user: AuthUser = {
        id: userData.user.id,
        name: userData.user.name,
        email: userData.user.email,
        permission_level: userData.user.permission_level || 1
      }

      // 권한 확인 (ADMIN = 레벨 3 이상 필요)
      const authResult = AuthGuard.checkComponentAccess(AuthLevel.ADMIN, user)

      if (!authResult.allowed) {
        console.warn(`[ADMIN] Access denied - User level: ${authResult.userLevel}, Required: ${authResult.requiredLevel}`)

        // 권한 부족 메시지와 함께 메인 페이지로 리다이렉트
        alert(`관리자 대시보드는 슈퍼 관리자 권한(관리자) 이상이 필요합니다.\n현재 권한: ${AUTH_LEVEL_DESCRIPTIONS[authResult.userLevel as keyof typeof AUTH_LEVEL_DESCRIPTIONS]}`)
        router.push('/')
        return
      }

      // 권한 확인 완료
      setCurrentUser(user)
      setAuthChecking(false)
      setMounted(true)
    } catch (error) {
      console.error('[ADMIN] Auth check failed:', error)
      router.push('/login?redirect=/admin')
    }
  }

  const loadLayout = async () => {
    try {
      const response = await fetch('/api/dashboard/layout')
      const result = await response.json()

      if (result.success && result.data) {
        setLayout(result.data)
      }
    } catch (error) {
      console.error('Failed to load layout:', error)
      // 에러 발생 시 기본 레이아웃 유지
    }
  }

  // ✅ 병렬 API 호출: 3개 차트 데이터를 동시에 로드
  const loadAllChartData = async () => {
    try {
      setChartsLoading(true)

      // 기간 필터 파라미터 구성 (공통)
      const periodParams: Record<string, string> = {};

      if (filters?.startDate && filters?.endDate) {
        periodParams.startDate = filters.startDate;
        periodParams.endDate = filters.endDate;
      } else if (filters?.periodMode === 'custom') {
        if (filters.startDate) periodParams.startDate = filters.startDate;
        if (filters.endDate) periodParams.endDate = filters.endDate;
      } else if (filters?.periodMode === 'yearly') {
        periodParams.year = String(filters.year || new Date().getFullYear());
      } else {
        periodParams.months = String(filters?.months || 12);
      }

      const params = new URLSearchParams({
        ...periodParams,
        ...(filters?.office && { office: filters.office }),
        ...(filters?.manufacturer && { manufacturer: filters.manufacturer }),
        ...(filters?.salesOffice && { salesOffice: filters.salesOffice }),
        ...(filters?.progressStatus && { progressStatus: filters.progressStatus })
      });

      // ✅ Promise.all로 3개 API 동시 호출 (병렬 실행)
      const [revenueRes, receivableRes, installationRes] = await Promise.all([
        fetch(`/api/dashboard/revenue?${params}`),
        fetch(`/api/dashboard/receivables?${params}`),
        fetch(`/api/dashboard/installations?${params}`)
      ]);

      // 응답 데이터 파싱 (병렬)
      const [revenueResult, receivableResult, installationResult] = await Promise.all([
        revenueRes.json(),
        receivableRes.json(),
        installationRes.json()
      ]);

      // 상태 업데이트
      if (revenueResult.success) {
        setRevenueData(revenueResult);
      }
      if (receivableResult.success) {
        setReceivableData(receivableResult);
      }
      if (installationResult.success) {
        setInstallationData(installationResult);
      }

    } catch (error) {
      console.error('Failed to load chart data:', error);
    } finally {
      setChartsLoading(false);
    }
  };

  const handleFilterChange = (newFilters: DashboardFilters) => {
    setFilters(newFilters)
  }

  const handleSaveLayout = async (newLayout: DashboardLayout) => {
    try {
      const response = await fetch('/api/dashboard/layout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ layout_config: newLayout })
      })

      const result = await response.json()

      if (result.success) {
        setLayout(newLayout)
      } else {
        alert(`레이아웃 저장 실패: ${result.error}`)
      }
    } catch (error) {
      console.error('Failed to save layout:', error)
      alert('레이아웃 저장에 실패했습니다.')
    }
  }

  const handleResetLayout = async () => {
    try {
      const response = await fetch('/api/dashboard/layout', {
        method: 'DELETE'
      })

      const result = await response.json()

      if (result.success) {
        setLayout(result.data || DEFAULT_LAYOUT)
      } else {
        alert(`레이아웃 초기화 실패: ${result.error}`)
      }
    } catch (error) {
      console.error('Failed to reset layout:', error)
      alert('레이아웃 초기화에 실패했습니다.')
    }
  }

  // ✅ 위젯 렌더링 함수 (데이터를 props로 전달)
  const renderWidget = (widgetId: string) => {
    switch (widgetId) {
      case 'revenue':
        return (
          <div key={widgetId}>
            <RevenueChart
              filters={filters}
              initialData={revenueData}
              loading={chartsLoading}
            />
          </div>
        )
      case 'receivable':
        return (
          <ReceivableChart
            key={widgetId}
            filters={filters}
            initialData={receivableData}
            loading={chartsLoading}
          />
        )
      case 'installation':
        return (
          <InstallationChart
            key={widgetId}
            filters={filters}
            initialData={installationData}
            loading={chartsLoading}
          />
        )
      default:
        return null
    }
  }

  // ✅ 권한 확인 중 로딩 표시
  if (authChecking || !mounted) {
    return (
      <AdminLayout
        title="관리자 대시보드"
        description="전체 시스템 현황을 한눈에 확인하세요"
      >
        <div className="h-screen flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">
              {authChecking ? '권한 확인 중...' : '대시보드 초기화 중...'}
            </p>
          </div>
        </div>
      </AdminLayout>
    )
  }

  // 표시할 위젯 필터링 및 정렬
  const visibleWidgets = layout.widgets
    .filter(w => w.visible)
    .sort((a, b) => a.order - b.order)

  // 조직 위젯 표시 여부 확인
  const organizationWidget = layout.widgets.find(w => w.id === 'organization')
  const showOrganization = organizationWidget?.visible ?? true

  // 매출/미수금/설치 위젯만 필터링 (조직 제외)
  const chartWidgets = visibleWidgets.filter(w => w.id !== 'organization')
  const revenueWidget = chartWidgets.find(w => w.id === 'revenue')
  const otherCharts = chartWidgets.filter(w => ['receivable', 'installation'].includes(w.id))

  return (
    <AdminLayout
      title="관리자 대시보드"
      description="전체 시스템 현황을 한눈에 확인하세요"
    >
      <div className="max-w-[2000px] mx-auto pb-24">
        {/* 필터 패널 */}
        <FilterPanel onFilterChange={handleFilterChange} />

        {/* ✅ 차트 로딩 상태 표시 */}
        {chartsLoading && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
            <div className="flex items-center gap-2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
              <p className="text-sm text-blue-800 font-medium">대시보드 데이터를 불러오는 중...</p>
            </div>
          </div>
        )}

        {/* 차트 위젯 렌더링 (조직 제외) */}
        {revenueWidget && renderWidget(revenueWidget.id)}

        {/* 미수금과 설치는 2열 그리드로 렌더링 */}
        {otherCharts.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {otherCharts.map(widget => renderWidget(widget.id))}
          </div>
        )}

        {/* 차트 위젯이 모두 숨겨진 경우 */}
        {chartWidgets.length === 0 && !showOrganization && (
          <div className="text-center py-8">
            <p className="text-sm text-gray-500 mb-2">표시할 위젯이 없습니다.</p>
            <p className="text-xs text-gray-400">
              우측 하단의 설정 버튼을 클릭하여 위젯을 표시하세요.
            </p>
          </div>
        )}

        {/* 조직 현황 - 하단에 접이식으로 배치 */}
        {showOrganization && (
          <div className="mt-6">
            <button
              onClick={() => setIsOrgExpanded(!isOrgExpanded)}
              className="w-full flex items-center justify-between p-3 bg-white rounded-lg shadow hover:shadow-md transition-shadow border border-gray-200"
            >
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-gray-800">조직 현황</h2>
                <span className="text-xs text-gray-500">
                  {isOrgExpanded ? '클릭하여 접기' : '클릭하여 펼치기'}
                </span>
              </div>
              {isOrgExpanded ? (
                <ChevronUp className="w-5 h-5 text-gray-600" />
              ) : (
                <ChevronDown className="w-5 h-5 text-gray-600" />
              )}
            </button>

            {isOrgExpanded && (
              <div className="mt-3 bg-white p-3 md:p-4 rounded-lg shadow border border-gray-200">
                <OrganizationChart />
              </div>
            )}
          </div>
        )}

        {/* 푸터 정보 */}
        <div className="mt-6 text-center text-xs text-gray-500">
          <p>
            데이터는 최근 12개월 기준으로 표시됩니다.
            실시간 업데이트를 원하시면 각 차트의 새로고침 버튼을 클릭하세요.
          </p>
        </div>
      </div>

      {/* 커스터마이징 컴포넌트 */}
      <DashboardCustomizer
        layout={layout}
        onSave={handleSaveLayout}
        onReset={handleResetLayout}
      />
    </AdminLayout>
  )
}
