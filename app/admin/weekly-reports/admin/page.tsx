'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import AdminLayout from '@/components/ui/AdminLayout'
import { withAuth, useAuth } from '@/contexts/AuthContext'
import { isPathHiddenForAccount } from '@/lib/auth/special-accounts'
import { TokenManager } from '@/lib/api-client'
import {
  Calendar,
  Users,
  AlertTriangle,
  BarChart3,
  Clock,
  RefreshCw,
  Search,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp
} from 'lucide-react'

interface StatusTransition {
  status: string
  label: string
  color: string
  started_at: string
  completed_at: string | null
  is_completed: boolean
}

interface TaskDetail {
  id: string
  title: string
  business_name: string
  task_type: 'self' | 'subsidy' | 'etc' | 'as' | 'dealer' | 'outsourcing'
  status: string
  status_label: string
  status_color: string
  priority: string
  due_date?: string
  completed_at?: string
  created_at: string
  is_completed: boolean
  is_overdue: boolean
  status_transitions?: StatusTransition[]
}

interface WeeklyReport {
  id: string
  user_id: string
  user_name: string
  week_start: string
  week_end: string
  total_tasks: number
  completed_tasks: number
  in_progress_tasks: number
  pending_tasks: number
  completion_rate: number
  self_tasks: number
  subsidy_tasks: number
  overdue_tasks: number
  average_completion_time_days: number
  generated_at: string
  is_auto_generated: boolean
  completed_task_details: TaskDetail[]
  in_progress_task_details: TaskDetail[]
  pending_task_details: TaskDetail[]
  all_task_details: TaskDetail[]
}

interface AdminSummary {
  total_users: number
  total_tasks: number
  total_completed: number
  average_completion_rate: number
  total_overdue: number
  total_in_progress: number
  total_pending: number
}

// 업무 타입 한글 매핑
const taskTypeConfig: Record<string, { label: string; color: string }> = {
  self: { label: '자비', color: 'bg-blue-100 text-blue-700' },
  subsidy: { label: '보조금', color: 'bg-green-100 text-green-700' },
  as: { label: 'AS', color: 'bg-orange-100 text-orange-700' },
  dealer: { label: '대리점', color: 'bg-purple-100 text-purple-700' },
  etc: { label: '기타', color: 'bg-gray-100 text-gray-600' },
  outsourcing: { label: '외주', color: 'bg-pink-100 text-pink-700' },
}


function getStatusBadgeColor(color: string): string {
  const colors: Record<string, string> = {
    blue: 'bg-blue-100 text-blue-800',
    yellow: 'bg-yellow-100 text-yellow-800',
    orange: 'bg-orange-100 text-orange-800',
    purple: 'bg-purple-100 text-purple-800',
    indigo: 'bg-indigo-100 text-indigo-800',
    cyan: 'bg-cyan-100 text-cyan-800',
    emerald: 'bg-emerald-100 text-emerald-800',
    teal: 'bg-teal-100 text-teal-800',
    green: 'bg-green-100 text-green-800',
    lime: 'bg-lime-100 text-lime-800',
    red: 'bg-red-100 text-red-800',
    pink: 'bg-pink-100 text-pink-800',
    gray: 'bg-gray-100 text-gray-800'
  }
  return colors[color] || 'bg-gray-100 text-gray-800'
}

function getPerformanceColor(rate: number): string {
  if (rate >= 80) return 'text-green-700 bg-green-100'
  if (rate >= 60) return 'text-yellow-700 bg-yellow-100'
  return 'text-red-700 bg-red-100'
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('ko-KR', {
    month: 'short',
    day: 'numeric'
  })
}

function AdminWeeklyReportsPageV2() {
  const { user, permissions } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (user?.email && permissions?.isSpecialAccount && isPathHiddenForAccount(user.email, '/admin/weekly-reports')) {
      router.replace('/admin/business')
    }
  }, [user, permissions])

  const [reports, setReports] = useState<WeeklyReport[]>([])
  const [summary, setSummary] = useState<AdminSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [selectedWeek, setSelectedWeek] = useState('')
  const [weekPeriod, setWeekPeriod] = useState<{ start: string; end: string; display: string } | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [assigneeFilter, setAssigneeFilter] = useState('')
  const [expandedReports, setExpandedReports] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search)
      const weekDateParam = urlParams.get('weekDate')

      if (weekDateParam) {
        setSelectedWeek(weekDateParam)
      } else {
        const today = new Date()
        const day = today.getDay()
        const diff = today.getDate() - day
        const monday = new Date(today.setDate(diff))
        setSelectedWeek(monday.toISOString().split('T')[0])
      }
    }
  }, [])

  const fetchRealtimeReports = async () => {
    if (!selectedWeek) return

    setLoading(true)
    try {
      const token = TokenManager.getToken()
      const params = new URLSearchParams({
        weekDate: selectedWeek
      })

      if (searchQuery) params.append('search', searchQuery)
      if (assigneeFilter) params.append('assignee', assigneeFilter)

      const response = await fetch(
        `/api/weekly-reports/realtime?${params.toString()}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      )

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`HTTP ${response.status}: ${errorText}`)
      }

      const data = await response.json()

      if (data.success) {
        setReports(data.data.reports)
        setSummary(data.data.summary)
        setWeekPeriod(data.data.week_period)
        // 기본으로 모든 담당자 펼침
        setExpandedReports(new Set(data.data.reports.map((r: WeeklyReport) => r.id)))
      } else {
        alert(data.message || '리포트 조회에 실패했습니다')
      }
    } catch (error: any) {
      console.error('리포트 조회 오류:', error)
      alert(`리포트 조회 중 오류가 발생했습니다: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (selectedWeek) {
      fetchRealtimeReports()
    }
  }, [selectedWeek])

  const changeWeek = (direction: 'prev' | 'next') => {
    if (!selectedWeek) return
    const currentDate = new Date(selectedWeek)
    const newDate = new Date(currentDate)
    newDate.setDate(currentDate.getDate() + (direction === 'next' ? 7 : -7))
    setSelectedWeek(newDate.toISOString().split('T')[0])
  }

  const toggleReportExpansion = (reportId: string) => {
    setExpandedReports(prev => {
      const newSet = new Set(prev)
      if (newSet.has(reportId)) {
        newSet.delete(reportId)
      } else {
        newSet.add(reportId)
      }
      return newSet
    })
  }

  return (
    <AdminLayout
      title="실시간 주간 리포트"
      description="담당자별 주간 업무 현황 실시간 조회"
    >
      <div className="space-y-4 md:space-y-6">

        {/* 컨트롤 영역 — 한 줄 */}
        <div className="bg-white rounded-md md:rounded-lg shadow-sm border border-gray-200 px-3 py-2">
          <div className="flex items-center gap-2">
            {/* 주간 날짜 선택 (최소 너비) */}
            <button onClick={() => changeWeek('prev')} className="p-1 hover:bg-gray-100 rounded transition-colors flex-shrink-0">
              <ChevronLeft className="w-4 h-4 text-gray-500" />
            </button>
            <input
              type="date"
              value={selectedWeek}
              onChange={(e) => setSelectedWeek(e.target.value)}
              className="w-36 px-2 py-1.5 border border-gray-300 rounded-md text-xs focus:ring-2 focus:ring-blue-500 focus:border-transparent flex-shrink-0"
            />
            {weekPeriod && (
              <span className="text-xs text-gray-400 hidden sm:block whitespace-nowrap flex-shrink-0">
                {weekPeriod.display}
              </span>
            )}
            <button onClick={() => changeWeek('next')} className="p-1 hover:bg-gray-100 rounded transition-colors flex-shrink-0">
              <ChevronRight className="w-4 h-4 text-gray-500" />
            </button>

            <div className="w-px h-5 bg-gray-200 flex-shrink-0" />

            {/* 업무/사업장 검색 */}
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input
                type="text"
                placeholder="업무명, 사업장명 검색..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && fetchRealtimeReports()}
                className="w-full pl-9 pr-7 py-1.5 border border-gray-300 rounded-md text-xs focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              {searchQuery && (
                <button onClick={() => { setSearchQuery(''); setTimeout(fetchRealtimeReports, 0) }} className="absolute right-2 top-1/2 -translate-y-1/2">
                  <X className="w-3 h-3 text-gray-400 hover:text-gray-600" />
                </button>
              )}
            </div>

            {/* 담당자 검색 */}
            <div className="relative w-32 sm:w-40 flex-shrink-0">
              <Users className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input
                type="text"
                placeholder="담당자 검색"
                value={assigneeFilter}
                onChange={(e) => setAssigneeFilter(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && fetchRealtimeReports()}
                className="w-full pl-8 pr-7 py-1.5 border border-gray-300 rounded-md text-xs focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              {assigneeFilter && (
                <button onClick={() => { setAssigneeFilter(''); setTimeout(fetchRealtimeReports, 0) }} className="absolute right-2 top-1/2 -translate-y-1/2">
                  <X className="w-3 h-3 text-gray-400 hover:text-gray-600" />
                </button>
              )}
            </div>

            <button
              onClick={fetchRealtimeReports}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors flex-shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              {loading ? '조회중' : '조회'}
            </button>
          </div>
        </div>

        {/* 전체 통계 카드 */}
        {summary && (
          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            <StatCard icon={Users} label="담당자" value={summary.total_users} color="blue" />
            <StatCard icon={BarChart3} label="총 업무" value={summary.total_tasks} color="purple" />
          </div>
        )}

        {/* 담당자별 리포트 */}
        <div className="space-y-3 md:space-y-4">
          {reports.length === 0 && !loading ? (
            <div className="bg-white rounded-md md:rounded-lg shadow-sm border border-gray-200 p-10 text-center">
              <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-500">해당 주간의 업무가 없습니다</p>
              <p className="text-xs text-gray-400 mt-1">다른 주간을 선택하거나 검색 조건을 변경해보세요</p>
            </div>
          ) : (
            reports.map((report) => (
              <AssigneeCard
                key={report.id}
                report={report}
                isExpanded={expandedReports.has(report.id)}
                onToggle={() => toggleReportExpansion(report.id)}
              />
            ))
          )}
        </div>

      </div>
    </AdminLayout>
  )
}

// 통계 카드
function StatCard({ icon: Icon, label, value, color }: {
  icon: any
  label: string
  value: number | string
  color: string
}) {
  const colorMap: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600',
    purple: 'bg-purple-50 text-purple-600',
    green: 'bg-green-50 text-green-600',
    indigo: 'bg-indigo-50 text-indigo-600',
    red: 'bg-red-50 text-red-600',
    gray: 'bg-gray-50 text-gray-500'
  }
  return (
    <div className="bg-white rounded-md md:rounded-lg shadow-sm border border-gray-200 p-2.5 sm:p-3 md:p-4">
      <div className="flex items-center gap-2 md:gap-3">
        <div className={`w-8 h-8 md:w-10 md:h-10 ${colorMap[color] || 'bg-gray-50 text-gray-500'} rounded-md flex items-center justify-center flex-shrink-0`}>
          <Icon className="w-4 h-4 md:w-5 md:h-5" />
        </div>
        <div className="min-w-0">
          <div className="text-base sm:text-lg md:text-xl font-bold text-gray-900 leading-none">{value}</div>
          <div className="text-[10px] sm:text-xs text-gray-500 mt-0.5 truncate">{label}</div>
        </div>
      </div>
    </div>
  )
}

// 담당자 카드
function AssigneeCard({ report, isExpanded, onToggle }: {
  report: WeeklyReport
  isExpanded: boolean
  onToggle: () => void
}) {
  return (
    <div className="bg-white rounded-md md:rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      {/* 헤더 */}
      <div
        className="flex items-center justify-between px-3 sm:px-4 py-2.5 sm:py-3 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={onToggle}
      >
        {/* 이름 */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center flex-shrink-0 text-xs sm:text-sm font-bold">
            {report.user_name.charAt(0)}
          </div>
          <span className="text-sm sm:text-base font-semibold text-gray-900 truncate">{report.user_name}</span>
        </div>

        {/* 총 업무 건수 + 연체 + 토글 */}
        <div className="flex items-center gap-3 sm:gap-4 flex-shrink-0 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <span className="font-medium text-gray-700">{report.total_tasks}</span>건
          </span>
          {report.overdue_tasks > 0 && (
            <span className="flex items-center gap-1 text-red-600">
              <AlertTriangle className="w-3 h-3" />
              <span className="font-medium">{report.overdue_tasks}</span>
            </span>
          )}
          {isExpanded
            ? <ChevronUp className="w-4 h-4 text-gray-400" />
            : <ChevronDown className="w-4 h-4 text-gray-400" />
          }
        </div>
      </div>

      {/* 업무 목록 */}
      {isExpanded && (
        <div className="border-t border-gray-200">
          {report.all_task_details.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-6">업무가 없습니다</p>
          ) : (
            <>
              {/* 데스크탑: 테이블 */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full table-fixed text-xs sm:text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 w-20">유형</th>
                      <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 w-[28%]">사업장</th>
                      <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">이번 주 단계</th>
                      <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 w-28">날짜</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {report.all_task_details.map((task) => {
                      const typeInfo = taskTypeConfig[task.task_type] || taskTypeConfig.etc
                      return (
                        <tr key={task.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-2.5">
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium ${typeInfo.color}`}>
                              {typeInfo.label}
                            </span>
                          </td>
                          <td className="px-4 py-2.5">
                            <span className="font-medium text-gray-900 text-sm">{task.business_name}</span>
                          </td>
                          <td className="px-4 py-2.5">
                            {task.status_transitions && task.status_transitions.length > 1 ? (
                              // 이번 주 단계 이동 이력이 2개 이상일 때 화살표로 표시
                              <div className="flex flex-wrap items-center gap-1">
                                {task.status_transitions.map((t, i) => (
                                  <span key={i} className="flex items-center gap-1">
                                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                      t.is_completed ? 'bg-gray-100 text-gray-500 line-through' : getStatusBadgeColor(t.color)
                                    }`}>
                                      {t.label}
                                    </span>
                                    {i < task.status_transitions!.length - 1 && (
                                      <span className="text-gray-300 text-[10px]">→</span>
                                    )}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              // 이력 없거나 1개 — 현재 단계만 표시
                              <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium ${getStatusBadgeColor(task.status_color)}`}>
                                {task.status_label}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-gray-400 text-xs whitespace-nowrap">
                            {formatDate(task.completed_at || task.due_date || task.created_at)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* 모바일: 카드 목록 */}
              <div className="md:hidden divide-y divide-gray-100">
                {report.all_task_details.map((task) => {
                  const typeInfo = taskTypeConfig[task.task_type] || taskTypeConfig.etc
                  return (
                    <div key={task.id} className="px-3 py-2.5 flex items-start gap-2.5">
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium flex-shrink-0 mt-0.5 ${typeInfo.color}`}>
                        {typeInfo.label}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <span className="text-xs font-medium text-gray-900 block truncate">{task.business_name}</span>
                          </div>
                        </div>
                        {/* 이번 주 단계 이동 */}
                        <div className="flex flex-wrap items-center gap-1 mt-1">
                          {task.status_transitions && task.status_transitions.length > 1 ? (
                            task.status_transitions.map((t, i) => (
                              <span key={i} className="flex items-center gap-0.5">
                                <span className={`inline-flex items-center px-1 py-0.5 rounded text-[10px] font-medium ${
                                  t.is_completed ? 'bg-gray-100 text-gray-400 line-through' : getStatusBadgeColor(t.color)
                                }`}>{t.label}</span>
                                {i < task.status_transitions!.length - 1 && (
                                  <span className="text-gray-300 text-[9px]">→</span>
                                )}
                              </span>
                            ))
                          ) : (
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${getStatusBadgeColor(task.status_color)}`}>
                              {task.status_label}
                            </span>
                          )}
                          {task.is_overdue && (
                            <span className="inline-flex items-center px-1 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-700">연체</span>
                          )}
                        </div>
                        <div className="text-[10px] text-gray-400 mt-0.5">
                          {formatDate(task.completed_at || task.due_date || task.created_at)}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default withAuth(AdminWeeklyReportsPageV2, undefined, 3)
