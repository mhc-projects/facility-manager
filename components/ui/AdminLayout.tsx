// components/ui/AdminLayout.tsx - Modern Admin Layout Component
'use client'

import { useState, useEffect, ReactNode } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { isPathHiddenForAccount } from '@/lib/auth/special-accounts'
import { TokenManager } from '@/lib/api-client'
import NotificationBell from '@/components/notifications/NotificationBell'
import ApprovalPendingBanner from '@/components/approvals/ApprovalPendingBanner'
import {
  Home,
  Building2,
  FileText,
  History,
  Menu,
  X,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  User,
  Clock,
  LayoutDashboard,
  ClipboardList,
  TrendingUp,
  Sliders,
  DollarSign,
  Users,
  Package,
  Calendar,
  FileEdit,
  Wrench,
  FileCheck,
  Code2,
  Calculator,
  Megaphone,
  Radar,
  FileOutput,
  Truck,
  BookOpen
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
  departmentOnly?: string  // 특정 부서명 포함 시에만 표시 (예: '개발')
  children?: NavigationItem[]  // 하위 메뉴
}

interface NavigationEntry {
  type: 'item' | 'group'
  item?: NavigationItem
  group?: {
    label: string
    items: NavigationItem[]
  }
}

const navigationConfig: NavigationEntry[] = [
  // 대시보드 (단독)
  {
    type: 'item',
    item: {
      name: '대시보드',
      href: '/admin',
      icon: LayoutDashboard,
      description: '관리자 종합 현황 대시보드',
      requiredLevel: 3
    }
  },
  // 업무지침 (단독)
  {
    type: 'item',
    item: {
      name: '업무지침',
      href: '/wiki',
      icon: BookOpen,
      description: 'DPF·IoT 방지시설 업무처리지침 Wiki 및 AI Q&A',
      requiredLevel: 1
    }
  },
  // IoT업무 그룹
  {
    type: 'group',
    group: {
      label: 'IoT업무',
      items: [
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
          icon: Megaphone,
          description: '지자체 보조금 공고 모니터링',
          requiredLevel: 1
        },
        {
          name: '크롤링 모니터링',
          href: '/admin/subsidy/monitoring-dashboard',
          icon: Radar,
          description: '크롤링 실행, 지자체별 통계, URL 건강도 통합 모니터링',
          requiredLevel: 4
        },
        {
          name: '발주 관리',
          href: '/admin/order-management',
          icon: Package,
          description: '제품 발주 진행 상황 및 단계 관리',
          requiredLevel: 1
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
          icon: FileOutput,
          description: '문서 생성 및 자동화 설정',
          requiredLevel: 1
        },
        {
          name: 'AS 관리',
          href: '/admin/as-management',
          icon: Wrench,
          description: 'AS 접수, 진행 현황 및 단가표 관리',
          requiredLevel: 1
        },
      ]
    }
  },
  // DPF 관리 그룹
  {
    type: 'group',
    group: {
      label: 'DPF업무',
      items: [
        {
          name: '차량 관리',
          href: '/dpf',
          icon: Truck,
          description: '매연저감장치 부착 차량 조회 및 서식 출력',
          requiredLevel: 1
        },
        {
          name: '데이터 임포트',
          href: '/dpf/import',
          icon: Package,
          description: '후지노 차량정보 엑셀 일괄 임포트 (관리자)',
          requiredLevel: 3
        },
      ]
    }
  },
  // 공통업무 그룹
  {
    type: 'group',
    group: {
      label: '공통업무',
      items: [
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
          name: '전자결재',
          href: '/admin/approvals',
          icon: FileCheck,
          description: '결재 문서 작성 및 결재 처리',
          requiredLevel: 1
        },
        {
          name: '매출 관리',
          href: '/admin/revenue',
          icon: DollarSign,
          description: '환경부 고시가 기준 매출 현황 및 분석',
          requiredLevel: 2,
          children: [
            {
              name: '설치비 마감',
              href: '/admin/revenue/installation-closing',
              icon: Calculator,
              description: '예측마감/본마감 처리 및 은결 정산',
              requiredLevel: 3
            }
          ]
        },
        {
          name: '데이터 이력',
          href: '/admin/data-history',
          icon: History,
          description: '시스템 데이터 변경 이력',
          requiredLevel: 1
        },
        {
          name: '사용자 관리',
          href: '/admin/users',
          icon: User,
          description: '사용자 승인 및 권한 관리',
          requiredLevel: 3
        },
        {
          name: '관리자 설정',
          href: '/admin/settings',
          icon: Sliders,
          description: '지연 기준, 알림 관리 등 시스템 설정',
          requiredLevel: 3
        },
        {
          name: '개발 업무 일지',
          href: '/admin/dev-work-log',
          icon: Code2,
          description: '개발팀 업무 접수 및 일지 관리',
          requiredLevel: 1,
          departmentOnly: '개발',
        },
      ]
    }
  },
]

// 모든 아이템을 플랫하게 추출 (부서명 로드 체크용)
function getAllItems(config: NavigationEntry[]): NavigationItem[] {
  const items: NavigationItem[] = []
  for (const entry of config) {
    if (entry.type === 'item' && entry.item) {
      items.push(entry.item)
      if (entry.item.children) items.push(...entry.item.children)
    }
    if (entry.type === 'group' && entry.group) {
      for (const item of entry.group.items) {
        items.push(item)
        if (item.children) items.push(...item.children)
      }
    }
  }
  return items
}

function NavigationItems({ pathname, onItemClick, collapsed }: { pathname: string, onItemClick: () => void, collapsed: boolean }) {
  const router = useRouter()
  const { user, permissions } = useAuth()
  const [userDeptName, setUserDeptName] = useState<string | null>(null)
  const [expandedMenus, setExpandedMenus] = useState<Set<string>>(new Set(['/admin/revenue']))

  // 부서명 비동기 로드 (departmentOnly 항목이 있을 때만)
  useEffect(() => {
    const allItems = getAllItems(navigationConfig)
    const hasDeptOnlyItem = allItems.some(i => i.departmentOnly)
    if (!user || !hasDeptOnlyItem) return
    const token = TokenManager.getToken()
    if (!token) return
    fetch('/api/employees/me/department-info', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        setUserDeptName(data?.data?.department_name || data?.department?.name || '')
      })
      .catch(() => setUserDeptName(''))
  }, [user])

  // 현재 경로에 해당하는 부모 메뉴 자동 펼침
  useEffect(() => {
    const allItems = getAllItems(navigationConfig)
    for (const item of allItems) {
      if (item.children?.some(child => pathname.startsWith(child.href))) {
        setExpandedMenus(prev => new Set(prev).add(item.href))
      }
    }
  }, [pathname])

  // 권한 필터링 함수
  const isItemVisible = (item: NavigationItem): boolean => {
    if (!user) return false
    if (permissions?.isSpecialAccount && user.email && isPathHiddenForAccount(user.email, item.href)) return false
    const permLevel = (user as any).permission_level ?? (user as any).role ?? 1
    if (permLevel < (item.requiredLevel || 1)) return false
    if (item.departmentOnly) {
      if (userDeptName === null) return false
      if (permLevel >= 4) return true
      return userDeptName.includes(item.departmentOnly)
    }
    return true
  }

  const toggleSubmenu = (href: string) => {
    setExpandedMenus(prev => {
      const next = new Set(prev)
      if (next.has(href)) next.delete(href)
      else next.add(href)
      return next
    })
  }

  // 단일 메뉴 아이템 렌더링
  const renderItem = (item: NavigationItem, isChild = false) => {
    if (!isItemVisible(item)) return null
    const hasMoreSpecificMatch = getAllItems(navigationConfig).some(
      other => other.href !== item.href &&
               other.href.startsWith(item.href + '/') &&
               (pathname === other.href || pathname.startsWith(other.href + '/'))
    )
    const isActive = pathname === item.href || (
      item.href !== '/admin' &&
      pathname.startsWith(item.href + '/') &&
      !item.children &&
      !hasMoreSpecificMatch
    )
    const hasChildren = item.children && item.children.some(isItemVisible)
    const isExpanded = expandedMenus.has(item.href)
    const Icon = item.icon

    return (
      <div key={item.href}>
        <div
          title={collapsed ? item.name : undefined}
          className={`
            relative group flex items-center rounded-xl text-xs lg:text-sm font-medium transition-all duration-200 cursor-pointer
            ${collapsed ? 'justify-center px-2 py-2' : isChild ? 'pl-8 pr-3 py-1.5 lg:pl-9 lg:py-1.5' : 'px-3 py-2 lg:px-3 lg:py-2'}
            ${isActive
              ? 'bg-gradient-to-r from-blue-50 to-indigo-50 lg:bg-gradient-to-br lg:from-blue-100 lg:to-indigo-100 text-blue-700 shadow-sm border border-blue-200'
              : 'text-gray-600 hover:bg-gray-50 lg:hover:bg-gray-100 hover:text-gray-900'
            }
          `}
          onClick={() => {
            router.push(item.href)
            onItemClick()
          }}
        >
          <Icon className={`${isChild ? 'w-3.5 h-3.5' : 'w-4 h-4'} flex-shrink-0 ${collapsed ? '' : 'mr-2 lg:mr-2'} ${isActive ? 'text-blue-600' : 'text-gray-400 group-hover:text-gray-600'}`} />
          {!collapsed && (
            <>
              <div className="flex-1 min-w-0">
                <div className={`font-medium ${isChild ? 'text-xs' : 'text-xs lg:text-sm'} ${isActive ? 'text-blue-900' : ''} truncate`}>
                  {item.name}
                </div>
              </div>
              {hasChildren && (
                <div
                  className="ml-1 p-1 -mr-1 rounded hover:bg-gray-200 transition-colors"
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleSubmenu(item.href)
                  }}
                >
                  {isExpanded
                    ? <ChevronDown className="w-3 h-3 text-gray-400" />
                    : <ChevronRight className="w-3 h-3 text-gray-400" />
                  }
                </div>
              )}
              {!hasChildren && isActive && (
                <ChevronRight className="w-3 h-3 lg:w-3 lg:h-3 text-blue-600" />
              )}
            </>
          )}
          {/* Collapsed 상태 tooltip */}
          {collapsed && (
            <div className="absolute left-full ml-2 px-2.5 py-1.5 bg-gray-800 text-white text-xs rounded-lg whitespace-nowrap hidden group-hover:block pointer-events-none z-50 shadow-lg">
              {item.name}
            </div>
          )}
        </div>
        {/* 하위 메뉴 */}
        {hasChildren && isExpanded && !collapsed && (
          <div className="mt-0.5 space-y-0.5">
            {item.children!.map(child => renderItem(child, true))}
          </div>
        )}
      </div>
    )
  }

  return (
    <>
      {navigationConfig.map((entry, idx) => {
        if (entry.type === 'item' && entry.item) {
          return renderItem(entry.item)
        }
        if (entry.type === 'group' && entry.group) {
          const visibleItems = entry.group.items.filter(item => isItemVisible(item) || (item.children && item.children.some(isItemVisible)))
          if (visibleItems.length === 0) return null
          return (
            <div key={entry.group.label} className={idx > 0 ? 'mt-3' : ''}>
              {/* 그룹 헤더 */}
              {collapsed ? (
                <div className="my-2 mx-2 border-t border-gray-200" />
              ) : (
                <div className="px-3 py-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                  {entry.group.label}
                </div>
              )}
              {/* 그룹 아이템 */}
              <div className="space-y-0.5">
                {entry.group.items.map(item => renderItem(item))}
              </div>
            </div>
          )
        }
        return null
      })}
    </>
  )
}

export default function AdminLayout({ children, title, description, actions }: AdminLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('admin-sidebar-collapsed') === 'true'
    }
    return false
  })
  const [currentTime, setCurrentTime] = useState('')
  const [mounted, setMounted] = useState(false)
  // 초기 인증 확인이 완료될 때까지 리다이렉트를 지연시키기 위한 플래그
  const [authChecked, setAuthChecked] = useState(false)

  const toggleSidebar = () => {
    const next = !sidebarCollapsed
    setSidebarCollapsed(next)
    localStorage.setItem('admin-sidebar-collapsed', String(next))
  }
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
        {/* Sidebar */}
        <div className={`
          fixed inset-y-0 left-0 z-50 bg-white/95 md:bg-white backdrop-blur-md
          shadow-xl md:shadow-lg md:border md:border-gray-200 md:rounded-xl transform transition-all duration-300 ease-in-out
          ${sidebarOpen ? 'translate-x-0 w-80' : '-translate-x-full w-80'}
          md:translate-x-0 md:static md:z-0 md:flex md:flex-col md:h-full md:min-w-0 md:flex-shrink-0
          ${sidebarCollapsed ? 'md:w-16' : 'md:w-44 xl:w-48'}
        `}>
          <div className="flex flex-col h-full lg:p-2">
            {/* Logo/Header */}
            <div className={`flex items-center lg:h-20 h-16 bg-gray-800 lg:bg-white/80 lg:backdrop-blur-sm lg:rounded-xl lg:border lg:border-gray-100/50 lg:mb-4 transition-all duration-300 ${sidebarCollapsed ? 'lg:justify-center lg:px-2' : 'justify-between px-6 lg:px-4'}`}>
              {/* 모바일: 항상 로고+텍스트 / 데스크톱 collapsed: 토글버튼만 */}
              {sidebarCollapsed ? (
                <>
                  {/* 모바일에서는 collapsed 상태에서도 로고 표시 */}
                  <Link href="/" className="flex items-center gap-3 md:hidden" onClick={() => setSidebarOpen(false)}>
                    <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
                      <Building2 className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <h1 className="text-lg font-bold text-white">블루온</h1>
                    </div>
                  </Link>
                  {/* 데스크톱 collapsed: 토글 버튼만 */}
                  <button
                    onClick={toggleSidebar}
                    className="hidden md:flex items-center justify-center w-8 h-8 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
                    title="메뉴 펼치기"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                  {/* 모바일 닫기 버튼 */}
                  <button onClick={() => setSidebarOpen(false)} className="md:hidden text-white hover:bg-white hover:bg-opacity-20 rounded-lg p-1">
                    <X className="w-5 h-5" />
                  </button>
                </>
              ) : (
                <>
                  <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity duration-200 cursor-pointer" onClick={() => setSidebarOpen(false)}>
                    <div className="w-8 h-8 bg-white lg:bg-blue-100 rounded-lg flex items-center justify-center lg:shadow-sm">
                      <Building2 className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <h1 className="text-lg font-bold text-white lg:text-gray-800">블루온</h1>
                    </div>
                  </Link>
                  {/* 데스크톱 토글 버튼 */}
                  <button
                    onClick={toggleSidebar}
                    className="hidden md:flex items-center justify-center w-8 h-8 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors flex-shrink-0"
                    title="메뉴 접기"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  {/* 모바일 닫기 버튼 */}
                  <button onClick={() => setSidebarOpen(false)} className="md:hidden text-white hover:bg-white hover:bg-opacity-20 rounded-lg p-1">
                    <X className="w-5 h-5" />
                  </button>
                </>
              )}
            </div>

            {/* Navigation */}
            <nav className="flex-1 px-2 py-2 lg:py-3 space-y-1 overflow-y-auto overscroll-contain">
              <NavigationItems pathname={pathname || ''} onItemClick={() => setSidebarOpen(false)} collapsed={sidebarCollapsed} />
            </nav>

            {/* Footer */}
            <div className={`border-t border-gray-200 lg:border-gray-300 p-3 lg:bg-gradient-to-r lg:from-gray-50 lg:to-blue-50 lg:rounded-xl lg:border lg:m-2 lg:mt-0 ${sidebarCollapsed ? 'lg:flex lg:justify-center lg:p-2' : ''}`}>
              <Link href="/profile" className={`flex items-center hover:bg-white/50 lg:hover:bg-blue-100/50 rounded-lg p-2 transition-colors duration-200 ${sidebarCollapsed ? 'justify-center' : 'gap-2 -m-2'}`}>
                <div className="w-7 h-7 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center shadow-sm flex-shrink-0">
                  <User className="w-3.5 h-3.5 text-white" />
                </div>
                {!sidebarCollapsed && (
                  <div className="flex-1">
                    <div className="text-xs font-medium text-gray-900">
                      {user?.name || '관리자'}
                    </div>
                    <div className="text-xs text-gray-500 lg:hidden">
                      {user?.email || '블루온'}
                    </div>
                  </div>
                )}
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
            <main className="p-1 sm:p-2 md:p-4 lg:p-6 md:flex-1 md:overflow-y-auto bg-gray-50 lg:bg-transparent">
              <div className="lg:h-full">
                {children}
              </div>
            </main>
          </div>
        </div>
      </div>
      <ApprovalPendingBanner />
    </div>
  )
}