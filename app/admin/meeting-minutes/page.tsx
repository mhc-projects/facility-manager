// ============================================
// 회의록 관리 메인 페이지
// ============================================
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import AdminLayout from '@/components/ui/AdminLayout'
import {
  Plus,
  Search,
  Filter,
  Grid,
  List,
  Calendar,
  FileText,
  CheckCircle2,
  Clock,
  Archive
} from 'lucide-react'
import {
  MeetingMinute,
  MeetingFilters,
  MeetingStatistics,
  Pagination
} from '@/types/meeting-minutes'

export default function MeetingMinutesPage() {
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [viewType, setViewType] = useState<'card' | 'table'>('card')

  // 데이터 상태
  const [minutes, setMinutes] = useState<MeetingMinute[]>([])
  const [statistics, setStatistics] = useState<MeetingStatistics>({
    total: 0,
    draft: 0,
    completed: 0,
    archived: 0,
    thisMonth: 0
  })
  const [pagination, setPagination] = useState<Pagination>({
    total: 0,
    page: 1,
    limit: 20,
    totalPages: 0
  })

  // 필터 상태
  const [filters, setFilters] = useState<MeetingFilters>({
    status: 'all',
    search: ''
  })

  useEffect(() => {
    setMounted(true)
    loadMeetingMinutes()
  }, [])

  useEffect(() => {
    if (mounted) {
      loadMeetingMinutes()
    }
  }, [filters, pagination.page])

  const loadMeetingMinutes = async () => {
    try {
      setLoading(true)

      // 쿼리 파라미터 구성
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString()
      })

      if (filters.status && filters.status !== 'all') {
        params.append('status', filters.status)
      }
      if (filters.meeting_type) {
        params.append('meeting_type', filters.meeting_type)
      }
      if (filters.search) {
        params.append('search', filters.search)
      }

      // API 호출 (쿠키 기반 인증 사용)
      const response = await fetch(`/api/meeting-minutes?${params}`)
      const result = await response.json()

      if (result.success) {
        setMinutes(result.data.items)
        setPagination(result.data.pagination)
        setStatistics(result.data.statistics)
      } else {
        console.error('[MEETING-MINUTES] Load failed:', result.error)
      }
    } catch (error) {
      console.error('[MEETING-MINUTES] Load error:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateNew = () => {
    router.push('/admin/meeting-minutes/create')
  }

  const handleSearch = (value: string) => {
    setFilters({ ...filters, search: value })
    setPagination({ ...pagination, page: 1 })
  }

  const handleStatusFilter = (status: typeof filters.status) => {
    setFilters({ ...filters, status })
    setPagination({ ...pagination, page: 1 })
  }

  if (!mounted) {
    return (
      <AdminLayout title="회의록 관리">
        <div className="h-screen flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">로딩 중...</p>
          </div>
        </div>
      </AdminLayout>
    )
  }

  return (
    <AdminLayout
      title="회의록 관리"
      description="회의록 작성 및 관리"
      actions={
        <button
          onClick={handleCreateNew}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">새 회의록</span>
        </button>
      }
    >
      <div className="max-w-7xl mx-auto space-y-6">
        {/* 통계 카드 */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatCard
            label="전체"
            value={statistics.total}
            icon={FileText}
            color="blue"
            active={filters.status === 'all'}
            onClick={() => handleStatusFilter('all')}
          />
          <StatCard
            label="작성중"
            value={statistics.draft}
            icon={Clock}
            color="amber"
            active={filters.status === 'draft'}
            onClick={() => handleStatusFilter('draft')}
          />
          <StatCard
            label="완료"
            value={statistics.completed}
            icon={CheckCircle2}
            color="green"
            active={filters.status === 'completed'}
            onClick={() => handleStatusFilter('completed')}
          />
          <StatCard
            label="보관"
            value={statistics.archived}
            icon={Archive}
            color="gray"
            active={filters.status === 'archived'}
            onClick={() => handleStatusFilter('archived')}
          />
          <StatCard
            label="이번 달"
            value={statistics.thisMonth}
            icon={Calendar}
            color="indigo"
          />
        </div>

        {/* 검색 및 필터 */}
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="flex flex-col sm:flex-row gap-3">
            {/* 검색 */}
            <div className="flex-1 relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="회의록 제목 또는 내용 검색..."
                value={filters.search || ''}
                onChange={(e) => handleSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* 뷰 전환 */}
            <div className="flex gap-2">
              <button
                onClick={() => setViewType('card')}
                className={`p-2 rounded-lg border ${
                  viewType === 'card'
                    ? 'bg-blue-50 border-blue-600 text-blue-600'
                    : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
                }`}
              >
                <Grid className="w-5 h-5" />
              </button>
              <button
                onClick={() => setViewType('table')}
                className={`p-2 rounded-lg border ${
                  viewType === 'table'
                    ? 'bg-blue-50 border-blue-600 text-blue-600'
                    : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
                }`}
              >
                <List className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* 회의록 리스트 */}
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">회의록을 불러오는 중...</p>
          </div>
        ) : minutes.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
            <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">회의록이 없습니다</h3>
            <p className="text-gray-600 mb-4">첫 회의록을 작성해보세요!</p>
            <button
              onClick={handleCreateNew}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              회의록 작성하기
            </button>
          </div>
        ) : viewType === 'card' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {minutes.map((minute) => (
              <MeetingMinuteCard key={minute.id} minute={minute} onRefresh={loadMeetingMinutes} />
            ))}
          </div>
        ) : (
          <MeetingMinutesTable minutes={minutes} onRefresh={loadMeetingMinutes} />
        )}

        {/* 페이지네이션 */}
        {pagination.totalPages > 1 && (
          <div className="flex justify-center gap-2 pt-4">
            <button
              onClick={() => setPagination({ ...pagination, page: Math.max(1, pagination.page - 1) })}
              disabled={pagination.page === 1}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              이전
            </button>
            <span className="px-4 py-2 border border-gray-300 rounded-lg bg-gray-50">
              {pagination.page} / {pagination.totalPages}
            </span>
            <button
              onClick={() => setPagination({ ...pagination, page: Math.min(pagination.totalPages, pagination.page + 1) })}
              disabled={pagination.page === pagination.totalPages}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              다음
            </button>
          </div>
        )}
      </div>
    </AdminLayout>
  )
}

// ============================================
// 통계 카드 컴포넌트
// ============================================
interface StatCardProps {
  label: string
  value: number
  icon: any
  color: 'blue' | 'amber' | 'green' | 'gray' | 'indigo'
  active?: boolean
  onClick?: () => void
}

function StatCard({ label, value, icon: Icon, color, active, onClick }: StatCardProps) {
  const colors = {
    blue: active ? 'from-blue-50 to-blue-100 border-blue-300' : 'from-blue-50 to-indigo-50',
    amber: active ? 'from-amber-50 to-amber-100 border-amber-300' : 'from-amber-50 to-orange-50',
    green: active ? 'from-green-50 to-green-100 border-green-300' : 'from-green-50 to-emerald-50',
    gray: active ? 'from-gray-50 to-gray-100 border-gray-300' : 'from-gray-50 to-slate-50',
    indigo: active ? 'from-indigo-50 to-indigo-100 border-indigo-300' : 'from-indigo-50 to-purple-50'
  }

  const iconColors = {
    blue: 'text-blue-600',
    amber: 'text-amber-600',
    green: 'text-green-600',
    gray: 'text-gray-600',
    indigo: 'text-indigo-600'
  }

  return (
    <div
      onClick={onClick}
      className={`
        bg-gradient-to-br ${colors[color]} p-4 rounded-lg shadow-sm border
        ${onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}
        ${active ? 'border-2' : 'border-gray-200'}
      `}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        <Icon className={`w-5 h-5 ${iconColors[color]}`} />
      </div>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
    </div>
  )
}

// ============================================
// 회의록 카드 컴포넌트
// ============================================
interface MeetingMinuteCardProps {
  minute: MeetingMinute
  onRefresh: () => void
}

function MeetingMinuteCard({ minute, onRefresh }: MeetingMinuteCardProps) {
  const router = useRouter()

  const statusColors = {
    draft: 'bg-amber-100 text-amber-800',
    completed: 'bg-green-100 text-green-800',
    archived: 'bg-gray-100 text-gray-800'
  }

  const statusLabels = {
    draft: '작성중',
    completed: '완료',
    archived: '보관'
  }

  return (
    <div
      onClick={() => router.push(`/admin/meeting-minutes/${minute.id}`)}
      className="bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200 border border-gray-200 overflow-hidden cursor-pointer"
    >
      {/* 상태 배지 */}
      <div className="flex items-center justify-between p-4 border-b border-gray-100">
        <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusColors[minute.status]}`}>
          {statusLabels[minute.status]}
        </span>
        <span className="text-xs text-gray-500">{minute.meeting_type}</span>
      </div>

      {/* 메인 내용 */}
      <div className="p-4 space-y-3">
        <h3 className="text-base font-semibold text-gray-900 line-clamp-2">
          {minute.title}
        </h3>

        <div className="space-y-2 text-sm text-gray-600">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            <span>{new Date(minute.meeting_date).toLocaleDateString('ko-KR', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              weekday: 'short'
            })}</span>
          </div>
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4" />
            <span className="truncate">{minute.location}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>참석자 {minute.participants.length}명</span>
            {minute.content.action_items && minute.content.action_items.length > 0 && (
              <span className="text-blue-600">액션 아이템 {minute.content.action_items.length}개</span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================
// 회의록 테이블 컴포넌트
// ============================================
interface MeetingMinutesTableProps {
  minutes: MeetingMinute[]
  onRefresh: () => void
}

function MeetingMinutesTable({ minutes, onRefresh }: MeetingMinutesTableProps) {
  const router = useRouter()

  const statusLabels = {
    draft: '작성중',
    completed: '완료',
    archived: '보관'
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                제목
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                유형
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                날짜
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                참석자
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                상태
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {minutes.map((minute) => (
              <tr
                key={minute.id}
                onClick={() => router.push(`/admin/meeting-minutes/${minute.id}`)}
                className="hover:bg-gray-50 cursor-pointer transition-colors"
              >
                <td className="px-6 py-4">
                  <div className="text-sm font-medium text-gray-900">{minute.title}</div>
                  <div className="text-xs text-gray-500">{minute.location}</div>
                </td>
                <td className="px-6 py-4 text-sm text-gray-600">{minute.meeting_type}</td>
                <td className="px-6 py-4 text-sm text-gray-600">
                  {new Date(minute.meeting_date).toLocaleDateString('ko-KR')}
                </td>
                <td className="px-6 py-4 text-sm text-gray-600">
                  {minute.participants.length}명
                </td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    minute.status === 'draft' ? 'bg-amber-100 text-amber-800' :
                    minute.status === 'completed' ? 'bg-green-100 text-green-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {statusLabels[minute.status]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
