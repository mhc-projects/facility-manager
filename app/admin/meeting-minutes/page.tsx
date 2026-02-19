// ============================================
// 회의록 관리 메인 페이지
// ============================================
'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
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
  Archive,
  Trash2,
  ChevronDown,
  ChevronUp,
  Building2,
  X
} from 'lucide-react'
import {
  MeetingMinute,
  MeetingFilters,
  MeetingStatistics,
  Pagination
} from '@/types/meeting-minutes'

// useSearchParams를 사용하는 내부 컴포넌트
function MeetingMinutesContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const refreshTrigger = searchParams.get('refresh')  // 업데이트 트리거 감지
  const [mounted, setMounted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [viewType, setViewType] = useState<'card' | 'table'>('card')

  // 부서 관리 상태
  const [deptPanelOpen, setDeptPanelOpen] = useState(false)
  const [departments, setDepartments] = useState<string[]>([])
  const [newDeptInput, setNewDeptInput] = useState('')
  const newDeptInputRef = useRef<HTMLInputElement>(null)

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
    // localStorage에서 부서 목록 로드
    try {
      const saved = localStorage.getItem('meeting_departments')
      if (saved) setDepartments(JSON.parse(saved))
    } catch {}
  }, [refreshTrigger])  // refreshTrigger 변경 시 재실행

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

      // 캐시 우회를 위한 타임스탬프 추가
      const timestamp = Date.now()
      const response = await fetch(`/api/meeting-minutes?${params}&_t=${timestamp}`, {
        cache: 'no-store'  // 캐시 비활성화로 항상 최신 데이터 표시
      })
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

  const handleAddDepartment = () => {
    const trimmed = newDeptInput.trim()
    if (!trimmed || departments.includes(trimmed)) return
    const updated = [...departments, trimmed]
    setDepartments(updated)
    localStorage.setItem('meeting_departments', JSON.stringify(updated))
    setNewDeptInput('')
    newDeptInputRef.current?.focus()
  }

  const handleRemoveDepartment = (dept: string) => {
    const updated = departments.filter(d => d !== dept)
    setDepartments(updated)
    localStorage.setItem('meeting_departments', JSON.stringify(updated))
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
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 sm:gap-3 md:gap-4">
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

        {/* 부서 관리 패널 */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <button
            onClick={() => setDeptPanelOpen(prev => !prev)}
            className="w-full flex items-center justify-between px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-gray-400" />
              <span className="font-medium">부서 관리</span>
              {departments.length > 0 && (
                <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-medium">
                  {departments.length}개
                </span>
              )}
            </div>
            {deptPanelOpen ? (
              <ChevronUp className="w-4 h-4 text-gray-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-gray-400" />
            )}
          </button>

          {deptPanelOpen && (
            <div className="px-4 pb-3 border-t border-gray-100">
              {/* 부서 추가 입력 */}
              <div className="flex gap-2 mt-3">
                <input
                  ref={newDeptInputRef}
                  type="text"
                  value={newDeptInput}
                  onChange={(e) => setNewDeptInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && handleAddDepartment()}
                  placeholder="부서명 입력 후 Enter 또는 추가 클릭"
                  className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <button
                  onClick={handleAddDepartment}
                  disabled={!newDeptInput.trim() || departments.includes(newDeptInput.trim())}
                  className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-sm transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  추가
                </button>
              </div>

              {/* 등록된 부서 목록 */}
              {departments.length === 0 ? (
                <p className="mt-2 text-xs text-gray-400">등록된 부서가 없습니다. 부서를 추가하면 안건 작성 시 선택할 수 있습니다.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {departments.map(dept => (
                    <span
                      key={dept}
                      className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 bg-gray-100 text-gray-700 rounded-full text-xs font-medium"
                    >
                      {dept}
                      <button
                        onClick={() => handleRemoveDepartment(dept)}
                        className="w-4 h-4 flex items-center justify-center rounded-full hover:bg-gray-300 transition-colors text-gray-500 hover:text-gray-700"
                        title="삭제"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
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
        bg-gradient-to-br ${colors[color]} p-2 sm:p-3 md:p-4 rounded-md sm:rounded-lg shadow-sm border
        ${onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}
        ${active ? 'border-2' : 'border-gray-200'}
      `}
    >
      <div className="flex items-center justify-between mb-1 sm:mb-1.5 md:mb-2">
        <span className="text-[10px] sm:text-xs md:text-sm font-medium text-gray-700">{label}</span>
        <Icon className={`w-3 h-3 sm:w-4 sm:h-4 md:w-5 md:h-5 ${iconColors[color]}`} />
      </div>
      <div className="text-base sm:text-xl md:text-2xl font-bold text-gray-900">{value}</div>
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

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation() // 카드 클릭 이벤트 전파 방지

    if (!confirm(`"${minute.title}" 회의록을 삭제하시겠습니까?`)) {
      return
    }

    try {
      const response = await fetch(`/api/meeting-minutes/${minute.id}`, {
        method: 'DELETE'
      })
      const result = await response.json()

      if (result.success) {
        alert('회의록이 삭제되었습니다.')
        onRefresh() // 목록 새로고침
      } else {
        alert('회의록 삭제에 실패했습니다.')
      }
    } catch (error) {
      console.error('[MEETING-MINUTE] Delete error:', error)
      alert('회의록 삭제에 실패했습니다.')
    }
  }

  return (
    <div
      onClick={() => router.push(`/admin/meeting-minutes/${minute.id}`)}
      className="bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200 border border-gray-200 overflow-hidden cursor-pointer relative"
    >
      {/* 상태 배지 */}
      <div className="flex items-center justify-between p-4 pr-12 border-b border-gray-100">
        <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusColors[minute.status]}`}>
          {statusLabels[minute.status]}
        </span>
        <span className="text-xs text-gray-500">{minute.meeting_type}</span>
      </div>

      {/* 삭제 버튼 */}
      <button
        onClick={handleDelete}
        className="absolute top-4 right-4 p-1.5 bg-white rounded-full shadow-md hover:bg-red-50 transition-colors z-10 border border-gray-200"
        title="삭제"
      >
        <Trash2 className="w-4 h-4 text-red-600" />
      </button>

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

  const handleDelete = async (e: React.MouseEvent, minute: MeetingMinute) => {
    e.stopPropagation() // 행 클릭 이벤트 전파 방지

    if (!confirm(`"${minute.title}" 회의록을 삭제하시겠습니까?`)) {
      return
    }

    try {
      const response = await fetch(`/api/meeting-minutes/${minute.id}`, {
        method: 'DELETE'
      })
      const result = await response.json()

      if (result.success) {
        alert('회의록이 삭제되었습니다.')
        onRefresh() // 목록 새로고침
      } else {
        alert('회의록 삭제에 실패했습니다.')
      }
    } catch (error) {
      console.error('[MEETING-MINUTE] Delete error:', error)
      alert('회의록 삭제에 실패했습니다.')
    }
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
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                작업
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
                <td className="px-6 py-4 text-center">
                  <button
                    onClick={(e) => handleDelete(e, minute)}
                    className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                    title="삭제"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// Suspense로 래핑된 메인 컴포넌트
export default function MeetingMinutesPage() {
  return (
    <Suspense fallback={
      <AdminLayout title="회의록 관리">
        <div className="h-screen flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">로딩 중...</p>
          </div>
        </div>
      </AdminLayout>
    }>
      <MeetingMinutesContent />
    </Suspense>
  )
}
