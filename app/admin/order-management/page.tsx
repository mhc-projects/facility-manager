'use client'

// app/admin/order-management/page.tsx
// 발주 관리 메인 페이지

import { useState, useEffect, lazy, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import AdminLayout from '@/components/ui/AdminLayout'
import { useAuth } from '@/contexts/AuthContext'
import { isPathHiddenForAccount } from '@/lib/auth/special-accounts'
import { Search, Filter, Calendar, TrendingUp, Package, AlertCircle } from 'lucide-react'
import type {
  OrderListItem,
  OrderListResponse,
  Manufacturer,
  OrderStatus
} from '@/types/order-management'
import { MANUFACTURERS } from '@/types/order-management'

// Lazy load heavy components for better initial load performance
const OrderDetailModal = lazy(() => import('./components/OrderDetailModal'))

export default function OrderManagementPage() {
  const router = useRouter()
  const { user, permissions } = useAuth()

  useEffect(() => {
    if (user?.email && permissions?.isSpecialAccount && isPathHiddenForAccount(user.email, '/admin/order-management')) {
      router.replace('/admin/business')
    }
  }, [user, permissions])

  // 상태 관리
  const [activeTab, setActiveTab] = useState<'in_progress' | 'not_started' | 'completed'>('in_progress')
  const [orders, setOrders] = useState<OrderListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [manufacturerFilter, setManufacturerFilter] = useState<
    Manufacturer | 'all'
  >('all')
  const [assigneeFilter, setAssigneeFilter] = useState<string>('all')
  const [sortBy, setSortBy] = useState<'latest' | 'name' | 'updated'>('latest')
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [summary, setSummary] = useState({
    total_orders: 0,
    in_progress: 0,
    not_started: 0,
    completed: 0,
    by_manufacturer: { ecosense: 0, gaia_cns: 0, cleanearth: 0, evs: 0 }
  })

  // 담당자 목록 (발주 필요 탭에서만 사용)
  const [assigneeList, setAssigneeList] = useState<string[]>([])

  // 모달 상태
  const [selectedBusinessId, setSelectedBusinessId] = useState<string | null>(
    null
  )
  const [isModalOpen, setIsModalOpen] = useState(false)

  // 검색어 debounce 처리
  useEffect(() => {
    const timer = setTimeout(() => {
      loadOrders()
    }, 300)

    return () => clearTimeout(timer)
  }, [searchTerm])

  // 필터, 탭, 정렬, 페이지 변경 시 즉시 로드
  useEffect(() => {
    loadOrders()
  }, [manufacturerFilter, activeTab, sortBy, currentPage])

  // 담당자 목록 자동 추출 (발주 필요 탭에서만)
  useEffect(() => {
    if (activeTab === 'in_progress' && orders.length > 0) {
      console.log('[ASSIGNEE-FILTER] 담당자 추출 시작:', {
        totalOrders: orders.length,
        ordersWithAssignee: orders.filter(o => o.assignee).length,
        assigneeValues: orders.map(o => ({
          businessName: o.business_name,
          assignee: o.assignee,
          assignees: o.assignees
        }))
      })

      const uniqueAssignees = Array.from(
        new Set(
          orders
            .filter(order => order.assignee)
            .map(order => order.assignee as string)
        )
      ).sort()

      console.log('[ASSIGNEE-FILTER] 추출된 담당자 목록:', uniqueAssignees)
      setAssigneeList(uniqueAssignees)
    } else {
      setAssigneeList([])
    }
  }, [orders, activeTab])

  const loadOrders = async () => {
    try {
      setLoading(true)

      const params = new URLSearchParams({
        search: searchTerm,
        manufacturer: manufacturerFilter,
        status: activeTab,
        sort: sortBy,
        page: currentPage.toString(),
        limit: '7'
      })

      const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null

      const response = await fetch(`/api/order-management?${params}`, {
        credentials: 'include',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          'Cache-Control': 'no-cache'
        },
        cache: 'no-store'
      })

      if (!response.ok) {
        throw new Error('Failed to load orders')
      }

      const result: OrderListResponse = await response.json()

      console.log('[ORDER-MANAGEMENT-PAGE] API 응답:', {
        success: result.success,
        ordersCount: result.data?.orders?.length || 0,
        orders: result.data?.orders?.map(o => ({
          id: o.id,
          business_name: o.business_name,
          business_id: o.business_id,
          assignee: o.assignee,
          assignees: o.assignees
        })) || [],
        summary: result.data?.summary
      })

      if (result.success && result.data) {
        setOrders(result.data.orders)
        setTotalPages(result.data.pagination.total_pages)
        setSummary(result.data.summary)

        console.log('[ORDER-MANAGEMENT-PAGE] State 업데이트:', {
          ordersLength: result.data.orders.length,
          totalPages: result.data.pagination.total_pages
        })
      }
    } catch (error) {
      console.error('발주 목록 로드 오류:', error)
      alert('발주 목록을 불러오는 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  // 모달 열기
  const handleOpenModal = (businessId: string) => {
    setSelectedBusinessId(businessId)
    setIsModalOpen(true)
  }

  // 모달 닫기 및 새로고침
  const handleCloseModal = (shouldRefresh: boolean = false) => {
    setIsModalOpen(false)
    setSelectedBusinessId(null)
    if (shouldRefresh) {
      loadOrders()
    }
  }

  // 검색 필터 리셋
  const handleResetFilters = () => {
    setSearchTerm('')
    setManufacturerFilter('all')
    setAssigneeFilter('all')
    setSortBy('latest')
    setCurrentPage(1)
  }

  // 탭 변경
  const handleTabChange = (tab: 'in_progress' | 'not_started' | 'completed') => {
    setActiveTab(tab)
    setCurrentPage(1)
  }

  return (
    <AdminLayout
      title="발주 관리"
      description="제품 발주 단계의 사업장 진행 상황을 관리합니다"
    >
      <div className="space-y-3 sm:space-y-6">
      {/* 통계 카드 */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 md:gap-4">
          <div className="bg-white rounded-md md:rounded-lg shadow p-2 sm:p-3 md:p-4">
            <div className="flex items-center justify-between mb-1 sm:mb-1.5 md:mb-2">
              <span className="text-[10px] sm:text-xs md:text-sm text-gray-600">전체</span>
              <TrendingUp className="w-3 h-3 sm:w-3.5 sm:h-3.5 md:w-4 md:h-4 text-gray-400" />
            </div>
            <div className="text-base sm:text-lg md:text-2xl font-bold text-gray-900">
              {summary.total_orders}
            </div>
          </div>

          <div className="bg-white rounded-md md:rounded-lg shadow p-2 sm:p-3 md:p-4">
            <div className="flex items-center justify-between mb-1 sm:mb-1.5 md:mb-2">
              <span className="text-[10px] sm:text-xs md:text-sm text-gray-600">진행중</span>
              <Calendar className="w-3 h-3 sm:w-3.5 sm:h-3.5 md:w-4 md:h-4 text-blue-400" />
            </div>
            <div className="text-base sm:text-lg md:text-2xl font-bold text-blue-600">
              {summary.in_progress}
            </div>
          </div>

          <div className="bg-white rounded-md md:rounded-lg shadow p-2 sm:p-3 md:p-4">
            <div className="flex items-center justify-between mb-1 sm:mb-1.5 md:mb-2">
              <span className="text-[10px] sm:text-xs md:text-sm text-gray-600">완료</span>
              <Package className="w-3 h-3 sm:w-3.5 sm:h-3.5 md:w-4 md:h-4 text-green-400" />
            </div>
            <div className="text-base sm:text-lg md:text-2xl font-bold text-green-600">
              {summary.completed}
            </div>
          </div>

          <div className="bg-white rounded-md md:rounded-lg shadow p-2 sm:p-3 md:p-4">
            <div className="text-[10px] sm:text-xs md:text-sm text-gray-600 mb-1 sm:mb-1.5 md:mb-2">제조사별</div>
            <div className="space-y-0.5 sm:space-y-1">
              {Object.entries(summary.by_manufacturer).map(
                ([key, value]) =>
                  value > 0 && (
                    <div
                      key={key}
                      className="flex items-center justify-between text-[9px] sm:text-[10px] md:text-xs"
                    >
                      <span className="text-gray-600">
                        {MANUFACTURERS[key as Manufacturer].name}
                      </span>
                      <span className="font-semibold">{value}</span>
                    </div>
                  )
              )}
            </div>
          </div>
        </div>

      {/* 탭 메뉴 */}
      <div className="bg-white rounded-md md:rounded-lg shadow overflow-hidden">
        <div className="flex border-b border-gray-200 overflow-x-auto">
          <button
            onClick={() => handleTabChange('in_progress')}
            className={`flex-1 min-w-[100px] px-2 sm:px-6 py-2 sm:py-3 text-[10px] sm:text-sm font-medium transition-colors ${
              activeTab === 'in_progress'
                ? 'text-green-600 border-b-2 border-green-600 bg-white'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }`}
          >
            <div className="flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-2">
              <Calendar className="w-3 h-3 sm:w-4 sm:h-4" />
              <span className="whitespace-nowrap">발주 필요 ({summary.in_progress})</span>
            </div>
          </button>
          <button
            onClick={() => handleTabChange('not_started')}
            className={`flex-1 min-w-[100px] px-2 sm:px-6 py-2 sm:py-3 text-[10px] sm:text-sm font-medium transition-colors ${
              activeTab === 'not_started'
                ? 'text-green-600 border-b-2 border-green-600 bg-white'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }`}
          >
            <div className="flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-2">
              <TrendingUp className="w-3 h-3 sm:w-4 sm:h-4" />
              <span className="whitespace-nowrap">진행 전 ({summary.not_started})</span>
            </div>
          </button>
          <button
            onClick={() => handleTabChange('completed')}
            className={`flex-1 min-w-[100px] px-2 sm:px-6 py-2 sm:py-3 text-[10px] sm:text-sm font-medium transition-colors ${
              activeTab === 'completed'
                ? 'text-green-600 border-b-2 border-green-600 bg-white'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }`}
          >
            <div className="flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-2">
              <Package className="w-3 h-3 sm:w-4 sm:h-4" />
              <span className="whitespace-nowrap">완료 ({summary.completed})</span>
            </div>
          </button>
        </div>
      </div>

      {/* 필터 및 검색 */}
      <div className="bg-white rounded-md md:rounded-lg shadow p-2 sm:p-3 md:p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-2 sm:gap-3 md:gap-4">
          {/* 검색 */}
          <div className="lg:col-span-2">
            <div className="relative">
              <Search className="absolute left-2 sm:left-3 top-1/2 transform -translate-y-1/2 w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-400" />
              <input
                type="text"
                placeholder="사업장명 검색..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value)
                  setCurrentPage(1)
                }}
                className="w-full pl-8 sm:pl-10 pr-3 sm:pr-4 py-1.5 sm:py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-xs sm:text-sm"
              />
            </div>
          </div>

          {/* 제조사 필터 */}
          <div>
            <select
              value={manufacturerFilter}
              onChange={(e) => {
                setManufacturerFilter(e.target.value as Manufacturer | 'all')
                setCurrentPage(1)
              }}
              className="w-full px-2 sm:px-3 py-1.5 sm:py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-xs sm:text-sm"
            >
              <option value="all">전체 제조사</option>
              {Object.entries(MANUFACTURERS).map(([key, info]) => (
                <option key={key} value={key}>
                  {info.name}
                </option>
              ))}
            </select>
          </div>

          {/* 담당자 필터 (발주 필요 탭에서만 표시) */}
          {activeTab === 'in_progress' && (
            <div>
              <select
                value={assigneeFilter}
                onChange={(e) => {
                  setAssigneeFilter(e.target.value)
                  setCurrentPage(1)
                }}
                className="w-full px-2 sm:px-3 py-1.5 sm:py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-xs sm:text-sm"
              >
                <option value="all">전체 담당자</option>
                {assigneeList.map((assignee) => (
                  <option key={assignee} value={assignee}>
                    {assignee}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* 정렬 */}
          <div className={`flex gap-1.5 sm:gap-2 ${activeTab !== 'in_progress' ? 'lg:col-start-4' : ''}`}>
            <select
              value={sortBy}
              onChange={(e) =>
                setSortBy(e.target.value as 'latest' | 'name' | 'updated')
              }
              className="flex-1 px-2 sm:px-3 py-1.5 sm:py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-xs sm:text-sm"
            >
              <option value="latest">최신순</option>
              <option value="name">사업장명순</option>
              <option value="updated">업데이트순</option>
            </select>

            <button
              onClick={handleResetFilters}
              className="px-2 sm:px-3 py-1.5 sm:py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              title="필터 초기화"
            >
              <Filter className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-600" />
            </button>
          </div>
        </div>
      </div>

      {/* 발주 목록 */}
      <div className="bg-white rounded-md md:rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="py-8 sm:py-10 md:py-12 text-center text-gray-500 text-xs sm:text-sm">
            로딩 중...
          </div>
        ) : orders.length === 0 ? (
          <div className="py-8 sm:py-10 md:py-12 text-center text-gray-500 text-xs sm:text-sm">
            발주 대상 사업장이 없습니다
          </div>
        ) : (() => {
          // 담당자 필터 적용
          const filteredOrders = orders.filter(order => {
            // 담당자 필터 (발주 필요 탭에서만 적용)
            if (activeTab === 'in_progress' && assigneeFilter !== 'all') {
              if (order.assignee !== assigneeFilter) {
                return false
              }
            }
            return true
          })

          return filteredOrders.length === 0 ? (
            <div className="py-8 sm:py-10 md:py-12 text-center text-gray-500 text-xs sm:text-sm">
              {assigneeFilter !== 'all'
                ? `담당자 "${assigneeFilter}"의 발주 대상 사업장이 없습니다`
                : '발주 대상 사업장이 없습니다'}
            </div>
          ) : (
            <>
              {/* 데스크톱: 테이블 뷰 */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left py-2 px-3 sm:py-2.5 sm:px-3.5 md:py-3 md:px-4 text-[10px] sm:text-xs md:text-sm font-semibold text-gray-700">
                        사업장명
                      </th>
                      <th className="text-left py-2 px-3 sm:py-2.5 sm:px-3.5 md:py-3 md:px-4 text-[10px] sm:text-xs md:text-sm font-semibold text-gray-700">
                        주소
                      </th>
                      <th className="text-left py-2 px-3 sm:py-2.5 sm:px-3.5 md:py-3 md:px-4 text-[10px] sm:text-xs md:text-sm font-semibold text-gray-700">
                        제조사
                      </th>
                      <th className="text-left py-2 px-3 sm:py-2.5 sm:px-3.5 md:py-3 md:px-4 text-[10px] sm:text-xs md:text-sm font-semibold text-gray-700">
                        진행률
                      </th>
                      <th className="text-left py-2 px-3 sm:py-2.5 sm:px-3.5 md:py-3 md:px-4 text-[10px] sm:text-xs md:text-sm font-semibold text-gray-700">
                        상태
                      </th>
                      <th className="text-left py-2 px-3 sm:py-2.5 sm:px-3.5 md:py-3 md:px-4 text-[10px] sm:text-xs md:text-sm font-semibold text-gray-700">
                        최종 업데이트
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {filteredOrders.map((order) => (
                    <tr
                      key={order.id}
                      onClick={() => {
                        if (order.business_id) {
                          handleOpenModal(order.business_id)
                        } else {
                          alert('이 항목은 사업장 정보가 없어 상세보기를 할 수 없습니다.')
                        }
                      }}
                      className={`hover:bg-gray-50 transition-colors ${order.business_id ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}
                    >
                      <td className="py-2 px-3 sm:py-2.5 sm:px-3.5 md:py-3 md:px-4 text-xs sm:text-sm font-medium text-gray-900">
                        {order.business_name}
                      </td>
                      <td className="py-2 px-3 sm:py-2.5 sm:px-3.5 md:py-3 md:px-4 text-xs sm:text-sm text-gray-600">
                        {order.address || '-'}
                      </td>
                      <td className="py-2 px-3 sm:py-2.5 sm:px-3.5 md:py-3 md:px-4 text-xs sm:text-sm">
                        {order.manufacturer && MANUFACTURERS[order.manufacturer] ? (
                          <span
                            className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium
                            ${
                              order.manufacturer === 'ecosense'
                                ? 'bg-blue-100 text-blue-700'
                                : order.manufacturer === 'gaia_cns'
                                  ? 'bg-green-100 text-green-700'
                                  : order.manufacturer === 'cleanearth'
                                    ? 'bg-purple-100 text-purple-700'
                                    : 'bg-orange-100 text-orange-700'
                            }`}
                          >
                            {MANUFACTURERS[order.manufacturer].name}
                          </span>
                        ) : (
                          <span className="text-gray-400 text-xs">-</span>
                        )}
                      </td>
                      <td className="py-2 px-3 sm:py-2.5 sm:px-3.5 md:py-3 md:px-4 text-xs sm:text-sm">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-gray-200 rounded-full h-2 max-w-[100px]">
                            <div
                              className="bg-green-500 h-2 rounded-full transition-all"
                              style={{
                                width: `${order.progress_percentage}%`
                              }}
                            />
                          </div>
                          <span className="text-xs font-medium text-gray-700">
                            {order.progress_percentage}%
                          </span>
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {order.steps_completed}/{order.steps_total} 단계
                        </div>
                      </td>
                      <td className="py-2 px-3 sm:py-2.5 sm:px-3.5 md:py-3 md:px-4 text-xs sm:text-sm">
                        {order.status === 'completed' ? (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                            완료
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                            진행중
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-3 sm:py-2.5 sm:px-3.5 md:py-3 md:px-4 text-xs sm:text-sm text-gray-600">
                        {new Date(order.last_updated).toLocaleDateString('ko-KR')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 모바일: 카드 뷰 */}
            <div className="md:hidden divide-y divide-gray-100">
              {filteredOrders.map((order) => (
                <button
                  key={order.id}
                  onClick={() => {
                    if (order.business_id) {
                      handleOpenModal(order.business_id)
                    } else {
                      alert('이 항목은 사업장 정보가 없어 상세보기를 할 수 없습니다.')
                    }
                  }}
                  className={`w-full px-3 py-3 text-left hover:bg-gray-50 transition-colors ${order.business_id ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}
                >
                  {/* 사업장명 + 상태 배지 */}
                  <div className="flex items-start justify-between gap-1.5 sm:gap-2 mb-1.5 sm:mb-2">
                    <h3 className="text-xs sm:text-sm font-semibold text-gray-900 flex-1">
                      {order.business_name}
                    </h3>
                    {order.status === 'completed' ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-100 text-green-700 flex-shrink-0">
                        완료
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-100 text-blue-700 flex-shrink-0">
                        진행중
                      </span>
                    )}
                  </div>

                  {/* 주소 */}
                  {order.address && (
                    <p className="text-[10px] sm:text-xs text-gray-500 mb-1.5 sm:mb-2 truncate">
                      {order.address}
                    </p>
                  )}

                  {/* 제조사 + 최종 업데이트 */}
                  <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 sm:mb-2 flex-wrap">
                    {order.manufacturer && MANUFACTURERS[order.manufacturer] && (
                      <span
                        className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium
                        ${
                          order.manufacturer === 'ecosense'
                            ? 'bg-blue-100 text-blue-700'
                            : order.manufacturer === 'gaia_cns'
                              ? 'bg-green-100 text-green-700'
                              : order.manufacturer === 'cleanearth'
                                ? 'bg-purple-100 text-purple-700'
                                : 'bg-orange-100 text-orange-700'
                        }`}
                      >
                        {MANUFACTURERS[order.manufacturer].name}
                      </span>
                    )}
                    <span className="text-[10px] text-gray-500">
                      {new Date(order.last_updated).toLocaleDateString('ko-KR')}
                    </span>
                  </div>

                  {/* 진행률 */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[9px] sm:text-[10px]">
                      <span className="text-gray-600">
                        {order.steps_completed}/{order.steps_total} 단계
                      </span>
                      <span className="font-medium text-gray-700">
                        {order.progress_percentage}%
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-1.5">
                      <div
                        className="bg-green-500 h-1.5 rounded-full transition-all"
                        style={{
                          width: `${order.progress_percentage}%`
                        }}
                      />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </>
          )
        })()}

        {/* 페이지네이션 */}
        {totalPages > 1 && (
          <div className="bg-gray-50 px-3 sm:px-4 py-2 sm:py-3 flex items-center justify-between border-t border-gray-200">
            <div className="text-[10px] sm:text-xs md:text-sm text-gray-600">
              페이지 {currentPage} / {totalPages}
            </div>
            <div className="flex gap-1 sm:gap-1.5 md:gap-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-2 sm:px-2.5 md:px-3 py-0.5 sm:py-1 md:py-1.5 border border-gray-300 rounded hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed text-[10px] sm:text-xs md:text-sm"
              >
                이전
              </button>
              <button
                onClick={() =>
                  setCurrentPage((p) => Math.min(totalPages, p + 1))
                }
                disabled={currentPage === totalPages}
                className="px-2 sm:px-2.5 md:px-3 py-0.5 sm:py-1 md:py-1.5 border border-gray-300 rounded hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed text-[10px] sm:text-xs md:text-sm"
              >
                다음
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 발주 상세 모달 - Lazy loaded */}
      {isModalOpen && selectedBusinessId && (
        <Suspense fallback={<div className="fixed inset-0 bg-black bg-opacity-50 z-50" />}>
          <OrderDetailModal
            businessId={selectedBusinessId}
            onClose={handleCloseModal}
            showPurchaseOrderButton={activeTab === 'in_progress'}
          />
        </Suspense>
      )}
      </div>
    </AdminLayout>
  )
}
