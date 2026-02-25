// components/ui/AdminLayout.tsx - Modern Admin Layout Component
'use client'

import { useState, useEffect, ReactNode } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import NotificationBell from '@/components/notifications/NotificationBell'
import {
  Home,
  Building2,
  FileText,
  History,
  Settings,
  Menu,
  X,
  ChevronRight,
  User,
  Clock,
  Activity,
  ClipboardList,
  TrendingUp,
  Sliders,
  DollarSign,
  Users,
  Package,
  Calendar,
  FileEdit
} from 'lucide-react'

interface AdminLayoutProps {
  children: ReactNode
  title?: string
  description?: string
  actions?: ReactNode
}

interface NavigationItem {
  name: string
  href: string
  icon: any
  description: string
  requiredLevel?: number
}

const navigationItems: NavigationItem[] = [
  {
    name: '대시보드',
    href: '/admin',
    icon: Activity,
    description: '관리자 종합 현황 대시보드',
    requiredLevel: 3
  },
  {
    name: '사업장 관리',
    href: '/admin/business',
    icon: Building2,
    description: '사업장 정보 및 등록 관리',
    requiredLevel: 1
  },
  {
    name: '대기필증 관리',
    href: '/admin/air-permit',
    icon: FileText,
    description: '대기배출시설 허가증 관리',
    requiredLevel: 1
  },
  {
    name: '실사관리',
    href: '/facility',
    icon: Home,
    description: '사업장 실사 및 파일 관리',
    requiredLevel: 1
  },
  {
    name: '업무 관리',
    href: '/admin/tasks',
    icon: ClipboardList,
    description: '업무 흐름 및 진행 상황 관리',
    requiredLevel: 1
  },
  {
    name: '보조금 공고',
    href: '/admin/subsidy',
    icon: FileText,
    description: '지자체 보조금 공고 모니터링',
    requiredLevel: 1
  },
  {
    name: '크롤링 모니터링',
    href: '/admin/subsidy/monitoring-dashboard',
    icon: Activity,
    description: '크롤링 실행, 지자체별 통계, URL 건강도 통합 모니터링',
    requiredLevel: 4
  },
  {
    name: '일정 관리',
    href: '/schedule',
    icon: Calendar,
    description: '업무 일정 및 파일 첨부 관리',
    requiredLevel: 1
  },
  {
    name: '회의록 관리',
    href: '/admin/meeting-minutes',
    icon: FileEdit,
    description: '회의록 작성 및 관리',
    requiredLevel: 1
  },
  {
    name: '발주 관리',
    href: '/admin/order-management',
    icon: Package,
    description: '제품 발주 진행 상황 및 단계 관리',
    requiredLevel: 1
  },
  {
    name: '매출 관리',
    href: '/admin/revenue',
    icon: DollarSign,
    description: '환경부 고시가 기준 매출 현황 및 분석',
    requiredLevel: 2
  },
  {
    name: '사용자 관리',
    href: '/admin/users',
    icon: User,
    description: '사용자 승인 및 권한 관리',
    requiredLevel: 3
  },
  {
    name: '주간 리포트',
    href: '/weekly-reports',
    icon: TrendingUp,
    description: '개인별 주간 업무 성과 분석',
    requiredLevel: 1
  },
  {
    name: '전체 리포트 관리',
    href: '/admin/weekly-reports/admin',
    icon: Users,
    description: '전체 사용자 주간 리포트 관리 (관리자 전용)',
    requiredLevel: 3
  },
  {
    name: '문서 자동화',
    href: '/admin/document-automation',
    icon: Settings,
    description: '문서 생성 및 자동화 설정',
    requiredLevel: 1
  },
  {
    name: '데이터 이력',
    href: '/admin/data-history',
    icon: History,
    description: '시스템 데이터 변경 이력',
    requiredLevel: 1
  },
  {
    name: '관리자 설정',
    href: '/admin/settings',
    icon: Sliders,
    description: '지연 기준, 알림 관리 등 시스템 설정',
    requiredLevel: 3
  },
]

function NavigationItems({ pathname, onItemClick }: { pathname: string, onItemClick: () => void }) {
  const router = useRouter()
  const { user, permissions } = useAuth()

  // 사용자 권한에 따라 네비게이션 아이템 필터링
  const filteredItems = navigationItems.filter(item => {
    if (!user) return false;
    return user.permission_level >= (item.requiredLevel || 1);
  });

  return (
    <>
      {filteredItems.map((item) => {
        const isActive = pathname === item.href
        const Icon = item.icon

        return (
          <div
            key={item.name}
            onClick={() => {
              router.push(item.href)
              onItemClick()
            }}
            className={`
              group flex items-center px-3 py-2 lg:px-3 lg:py-2 rounded-xl text-xs lg:text-sm font-medium transition-all duration-200 cursor-pointer
              ${isActive
                ? 'bg-gradient-to-r from-blue-50 to-indigo-50 lg:bg-gradient-to-br lg:from-blue-100 lg:to-indigo-100 text-blue-700 shadow-sm border border-blue-200'
                : 'text-gray-600 hover:bg-gray-50 lg:hover:bg-gray-100 hover:text-gray-900'
              }
            `}
          >
            <Icon className={`w-4 h-4 lg:w-4 lg:h-4 mr-2 lg:mr-2 ${isActive ? 'text-blue-600' : 'text-gray-400 group-hover:text-gray-600'}`} />
            <div className="flex-1 min-w-0">
              <div className={`font-medium text-xs lg:text-sm ${isActive ? 'text-blue-900' : ''}`}>
                {item.name}
              </div>
              <div className={`text-xs lg:text-xs mt-0.5 ${isActive ? 'text-blue-600' : 'text-gray-400'} truncate`}>
                {item.description}
              </div>
            </div>
            {isActive && (
              <ChevronRight className="w-3 h-3 lg:w-3 lg:h-3 text-blue-600" />
            )}
          </div>
        )
      })}
    </>
  )
}

export default function AdminLayout({ children, title, description, actions }: AdminLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [currentTime, setCurrentTime] = useState('')
  const [mounted, setMounted] = useState(false)
  // 초기 인증 확인이 완료될 때까지 리다이렉트를 지연시키기 위한 플래그
  const [authChecked, setAuthChecked] = useState(false)
  const pathname = usePathname()
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()

  // Mount and time initialization
  useEffect(() => {
    setMounted(true)
    setCurrentTime(new Date().toLocaleTimeString('ko-KR', {
      hour: '2-digit',
      minute: '2-digit'
    }))

    const interval = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString('ko-KR', {
        hour: '2-digit',
        minute: '2-digit'
      }))
    }, 60000)

    return () => clearInterval(interval)
  }, [])

  // authLoading이 false가 된 순간을 기록 (한번 false가 되면 authChecked = true 유지)
  useEffect(() => {
    if (!authLoading) {
      setAuthChecked(true)
    }
  }, [authLoading])

  // 인증 체크 및 리다이렉트 - authChecked가 true인 상태에서만 리다이렉트
  useEffect(() => {
    if (mounted && authChecked && !authLoading && !user) {
      console.log('🔒 [ADMIN-LAYOUT] 인증되지 않은 접근 - 로그인 페이지로 리다이렉트')
      router.push('/login?redirect=' + encodeURIComponent(pathname || '/admin'))
    }
  }, [mounted, authChecked, authLoading, user, router, pathname])

  // 마운트 전이거나 인증 로딩 중이면 로딩 화면 표시
  if (!mounted || authLoading || !authChecked) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">로딩 중...</p>
        </div>
      </div>
    )
  }

  // 인증 확인이 완료됐는데 user가 없으면 리다이렉트 대기 화면
  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">인증 확인 중...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-gray-100">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black bg-opacity-50 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Container with improved layout */}
      <div className="md:flex md:gap-4 md:p-4 md:h-screen">
        {/* Sidebar - Improved responsive design (20% reduced width) */}
        <div className={`
          fixed inset-y-0 left-0 z-50 w-80 md:w-52 xl:w-64 bg-white/95 md:bg-white backdrop-blur-md
          shadow-xl md:shadow-lg md:border md:border-gray-200 md:rounded-xl transform transition-all duration-300 ease-in-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          md:translate-x-0 md:static md:z-0 md:flex md:flex-col md:h-full md:min-w-0 md:flex-shrink-0
        `}>
          <div className="flex flex-col h-full lg:p-2">
            {/* Logo/Header - Integrated with main design */}
            <div className="flex items-center justify-between lg:h-20 h-16 px-6 lg:px-4 bg-gray-800 lg:bg-white/80 lg:backdrop-blur-sm lg:rounded-xl lg:border lg:border-gray-100/50 lg:mb-4">
              <Link
                href="/"
                className="flex items-center gap-3 hover:opacity-80 transition-opacity duration-200 cursor-pointer"
                onClick={() => setSidebarOpen(false)}
              >
                <div className="w-8 h-8 bg-white lg:bg-blue-100 rounded-lg flex items-center justify-center lg:shadow-sm">
                  <Building2 className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h1 className="text-lg font-bold text-white lg:text-gray-800">시설관리</h1>
                  <p className="text-xs text-blue-100 lg:text-gray-500">주식회사 블루온</p>
                </div>
              </Link>
              <button
                onClick={() => setSidebarOpen(false)}
                className="md:hidden text-white hover:bg-white hover:bg-opacity-20 rounded-lg p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Navigation */}
            <nav className="flex-1 px-3 lg:px-3 py-2 lg:py-3 space-y-1 lg:space-y-1 overflow-y-auto overscroll-contain">
              <NavigationItems pathname={pathname || ''} onItemClick={() => setSidebarOpen(false)} />
            </nav>

            {/* Footer */}
            <div className="border-t border-gray-200 lg:border-gray-300 p-3 lg:p-3 lg:bg-gradient-to-r lg:from-gray-50 lg:to-blue-50 lg:rounded-xl lg:border lg:m-2 lg:mt-0">
              <Link href="/profile" className="flex items-center gap-2 lg:gap-2 hover:bg-white/50 lg:hover:bg-blue-100/50 rounded-lg p-2 -m-2 transition-colors duration-200">
                <div className="w-7 h-7 lg:w-7 lg:h-7 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center shadow-sm">
                  <User className="w-3.5 h-3.5 lg:w-3.5 lg:h-3.5 text-white" />
                </div>
                <div className="flex-1">
                  <div className="text-xs lg:text-xs font-medium text-gray-900">
                    {user?.name || '관리자'}
                  </div>
                  <div className="text-xs lg:text-xs text-gray-500 lg:hidden">
                    {user?.email || '주식회사 블루온'}
                  </div>
                </div>
              </Link>
            </div>
          </div>
        </div>

        {/* Main content - Improved layout */}
        <div className="flex-1 md:flex md:flex-col md:min-h-0 md:min-w-0">
          <div className="md:bg-white md:shadow-lg md:border md:border-gray-200 md:rounded-xl md:flex md:flex-col md:h-full md:overflow-hidden">
            {/* Top bar - Mobile optimized with fixed positioning */}
            <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md lg:bg-transparent border-b border-gray-200 lg:border-gray-300 shadow-sm lg:shadow-none">
              <div className="px-4 py-3 lg:px-8 lg:py-6">
                {/* Mobile Layout (< 640px) - Minimal */}
                <div className="flex items-center justify-between sm:hidden">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <button
                      onClick={() => setSidebarOpen(true)}
                      className="flex-shrink-0 p-3 rounded-xl text-gray-600 hover:bg-gray-100 transition-colors duration-200 touch-manipulation"
                      aria-label="메뉴 열기"
                    >
                      <Menu className="w-6 h-6" />
                    </button>

                    <div className="min-w-0 flex-1">
                      {title && (
                        <h1 className="text-base font-semibold text-gray-900 truncate">{title}</h1>
                      )}
                      {/* Description hidden on very small screens */}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    {/* 매우 작은 모바일에서도 핵심 액션 표시 */}
                    {actions && (
                      <div className="flex items-center">
                        {actions}
                      </div>
                    )}

                    {/* 알림 버튼 */}
                    <NotificationBell />
                  </div>
                </div>

                {/* Small Mobile Layout (640px - 768px) - Add Description */}
                <div className="hidden sm:flex md:hidden items-center justify-between">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <button
                      onClick={() => setSidebarOpen(true)}
                      className="flex-shrink-0 p-2.5 rounded-xl text-gray-600 hover:bg-gray-100 transition-colors duration-200 touch-manipulation"
                      aria-label="메뉴 열기"
                    >
                      <Menu className="w-5 h-5" />
                    </button>

                    <div className="min-w-0 flex-1">
                      {title && (
                        <h1 className="text-lg font-semibold text-gray-900 truncate">{title}</h1>
                      )}
                      {description && (
                        <p className="text-sm text-gray-500 truncate">{description}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    {/* Compact actions on medium mobile */}
                    {actions && (
                      <div className="flex items-center">
                        {actions}
                      </div>
                    )}

                    {/* 알림 버튼 */}
                    <NotificationBell />
                  </div>
                </div>

                {/* Desktop Layout (≥ 768px) */}
                <div className="hidden md:flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div>
                      {title && (
                        <h1 className="text-xl lg:text-2xl font-semibold lg:font-bold text-gray-900">{title}</h1>
                      )}
                      {description && (
                        <p className="text-sm lg:text-base text-gray-500 lg:text-gray-600 lg:mt-1">{description}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-4 lg:gap-6">
                    {/* Desktop Actions */}
                    {actions && (
                      <div className="flex items-center gap-3">
                        {actions}
                      </div>
                    )}

                    {/* 시간 표시 */}
                    <div className="flex items-center gap-2 text-sm text-gray-600 bg-gray-50 px-3 py-2 rounded-lg border">
                      <Clock className="w-4 h-4" />
                      <span>{currentTime}</span>
                    </div>

                    {/* 알림 버튼 (데스크톱) - 제일 오른쪽 */}
                    <NotificationBell />
                  </div>
                </div>
              </div>
            </header>

            {/* Page content */}
            <main className="p-1 sm:p-2 md:p-4 lg:p-6 lg:flex-1 lg:overflow-y-auto bg-gray-50 lg:bg-transparent">
              <div className="lg:h-full">
                {children}
              </div>
            </main>
          </div>
        </div>
      </div>
    </div>
  )
}