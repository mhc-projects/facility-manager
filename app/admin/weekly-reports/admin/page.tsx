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
  TrendingUp,
  CheckCircle,
  AlertTriangle,
  BarChart3,
  Clock,
  RefreshCw,
  Eye,
  Search,
  X,
  Filter,
  ChevronLeft,
  ChevronRight
} from 'lucide-react'

interface TaskDetail {
  id: string
  title: string
  business_name: string
  task_type: 'self' | 'subsidy' | 'etc' | 'as'
  status: string
  status_label: string
  status_color: string
  priority: string
  due_date?: string
  completed_at?: string
  created_at: string
  is_completed: boolean
  is_overdue: boolean
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

  // 이번 주 날짜 계산
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
        console.log('✅ 실시간 리포트 조회 성공:', data.data.reports.length, '건')
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

  // 주간 변경 함수
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

  const getPerformanceColor = (rate: number) => {
    if (rate >= 80) return 'text-green-600 bg-green-100'
    if (rate >= 60) return 'text-yellow-600 bg-yellow-100'
    return 'text-red-600 bg-red-100'
  }

  const getStatusBadgeColor = (color: string) => {
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

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('ko-KR', {
      month: 'short',
      day: 'numeric'
    })
  }

  return (
    <AdminLayout
      title="실시간 주간 리포트"
      description="담당자별 주간 업무 현황 실시간 조회"
    >
      <div className="space-y-6">
        {/* 컨트롤 영역 */}
        <div className="bg-white rounded-md md:rounded-lg shadow-sm border border-gray-200 p-2 sm:p-3 md:p-4">
          <div className="space-y-2 sm:space-y-3 md:space-y-4">
            {/* 주간 선택 */}
            <div className="flex items-center gap-2 sm:gap-2.5 md:gap-3">
              <button
                onClick={() => changeWeek('prev')}
                className="p-1.5 sm:p-2 hover:bg-gray-100 rounded-md transition-colors"
              >
                <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
              <div className="flex items-center gap-1.5 sm:gap-2 flex-1">
                <Calendar className="w-4 h-4 sm:w-5 sm:h-5 text-gray-500" />
                <input
                  type="date"
                  value={selectedWeek}
                  onChange={(e) => setSelectedWeek(e.target.value)}
                  className="flex-1 px-2 sm:px-3 py-1.5 sm:py-2 border border-gray-300 rounded-md text-xs sm:text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                {weekPeriod && (
                  <div className="text-xs sm:text-sm text-gray-600 hidden md:block">
                    {weekPeriod.display}
                  </div>
                )}
              </div>
              <button
                onClick={() => changeWeek('next')}
                className="p-1.5 sm:p-2 hover:bg-gray-100 rounded-md transition-colors"
              >
                <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            </div>

            {/* 검색 및 필터 */}
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-2.5 md:gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-2 sm:left-3 top-1/2 -translate-y-1/2 w-3 h-3 sm:w-4 sm:h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="업무명, 사업장명 검색..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && fetchRealtimeReports()}
                  className="w-full pl-8 sm:pl-10 pr-8 sm:pr-10 py-1.5 sm:py-2 border border-gray-300 rounded-md text-xs sm:text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                {searchQuery && (
                  <button
                    onClick={() => {
                      setSearchQuery('')
                      setTimeout(fetchRealtimeReports, 0)
                    }}
                    className="absolute right-2 sm:right-3 top-1/2 -translate-y-1/2"
                  >
                    <X className="w-3 h-3 sm:w-4 sm:h-4 text-gray-400 hover:text-gray-600" />
                  </button>
                )}
              </div>

              <div className="relative flex-1 sm:flex-initial sm:w-48">
                <Filter className="absolute left-2 sm:left-3 top-1/2 -translate-y-1/2 w-3 h-3 sm:w-4 sm:h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="담당자 필터..."
                  value={assigneeFilter}
                  onChange={(e) => setAssigneeFilter(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && fetchRealtimeReports()}
                  className="w-full pl-8 sm:pl-10 pr-8 sm:pr-10 py-1.5 sm:py-2 border border-gray-300 rounded-md text-xs sm:text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                {assigneeFilter && (
                  <button
                    onClick={() => {
                      setAssigneeFilter('')
                      setTimeout(fetchRealtimeReports, 0)
                    }}
                    className="absolute right-2 sm:right-3 top-1/2 -translate-y-1/2"
                  >
                    <X className="w-3 h-3 sm:w-4 sm:h-4 text-gray-400 hover:text-gray-600" />
                  </button>
                )}
              </div>

              <button
                onClick={fetchRealtimeReports}
                disabled={loading}
                className="flex items-center justify-center gap-1.5 sm:gap-2 px-2 sm:px-3 md:px-4 py-1.5 sm:py-2 text-xs sm:text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                <RefreshCw className={`w-3 h-3 sm:w-4 sm:h-4 ${loading ? 'animate-spin' : ''}`} />
                {loading ? '조회중...' : '조회'}
              </button>
            </div>
          </div>
        </div>

        {/* 전체 통계 카드 */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-2 sm:gap-3 md:gap-4">
            <StatCard icon={Users} label="사용자" value={summary.total_users} color="blue" />
            <StatCard icon={BarChart3} label="총 업무" value={summary.total_tasks} color="purple" />
            <StatCard icon={CheckCircle} label="완료" value={summary.total_completed} color="green" />
            <StatCard icon={Clock} label="진행중" value={summary.total_in_progress} color="blue" />
            <StatCard icon={Clock} label="대기" value={summary.total_pending} color="gray" />
            <StatCard icon={TrendingUp} label="평균율" value={`${summary.average_completion_rate}%`} color="indigo" />
            <StatCard icon={AlertTriangle} label="연체" value={summary.total_overdue} color="red" />
          </div>
        )}

        {/* 사용자별 리포트 목록 */}
        <div className="bg-white rounded-md md:rounded-lg shadow-sm border border-gray-200">
          <div className="p-2 sm:p-3 md:p-4 border-b border-gray-200">
            <h3 className="text-sm sm:text-base md:text-lg font-semibold text-gray-900">담당자별 주간 업무</h3>
            <p className="text-[10px] sm:text-xs md:text-sm text-gray-600 mt-0.5 sm:mt-1">
              {reports.length}명의 담당자 • 실시간 업데이트
            </p>
          </div>

          <div className="divide-y divide-gray-200">
            {reports.map((report) => (
              <ReportCard
                key={report.id}
                report={report}
                isExpanded={expandedReports.has(report.id)}
                onToggleExpand={() => toggleReportExpansion(report.id)}
                getPerformanceColor={getPerformanceColor}
                getStatusBadgeColor={getStatusBadgeColor}
                formatDate={formatDate}
              />
            ))}

            {reports.length === 0 && !loading && (
              <div className="p-6 sm:p-8 md:p-12 text-center">
                <Calendar className="w-10 h-10 sm:w-12 sm:h-12 md:w-16 md:h-16 text-gray-300 mx-auto mb-2 sm:mb-3 md:mb-4" />
                <p className="text-xs sm:text-sm md:text-base text-gray-500">해당 주간의 업무가 없습니다</p>
                <p className="text-[10px] sm:text-xs md:text-sm text-gray-400 mt-1 sm:mt-2">
                  다른 주간을 선택하거나 검색 조건을 변경해보세요
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  )
}

// 통계 카드 컴포넌트
function StatCard({ icon: Icon, label, value, color }: any) {
  const colorClasses: Record<string, string> = {
    blue: 'bg-blue-100 text-blue-600',
    purple: 'bg-purple-100 text-purple-600',
    green: 'bg-green-100 text-green-600',
    indigo: 'bg-indigo-100 text-indigo-600',
    red: 'bg-red-100 text-red-600',
    gray: 'bg-gray-100 text-gray-600'
  }

  return (
    <div className="bg-white rounded-md md:rounded-lg shadow-sm border border-gray-200 p-2 sm:p-3 md:p-4">
      <div className="flex items-center gap-1.5 sm:gap-2 md:gap-3">
        <div className={`w-7 h-7 sm:w-8 sm:h-8 md:w-10 md:h-10 ${colorClasses[color]} rounded-md flex items-center justify-center flex-shrink-0`}>
          <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-6 md:h-6" />
        </div>
        <div>
          <div className="text-sm sm:text-base md:text-xl font-bold text-gray-900">{value}</div>
          <div className="text-[10px] sm:text-xs text-gray-600">{label}</div>
        </div>
      </div>
    </div>
  )
}

// 리포트 카드 컴포넌트
function ReportCard({ report, isExpanded, onToggleExpand, getPerformanceColor, getStatusBadgeColor, formatDate }: any) {
  return (
    <div
      className="p-2 sm:p-3 md:p-4 hover:bg-gray-50 transition-colors cursor-pointer"
      onClick={onToggleExpand}
    >
      <div className="space-y-2 sm:space-y-2.5 md:space-y-3">
        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-2.5 md:gap-3">
            <h4 className="text-sm sm:text-base md:text-lg font-semibold text-gray-900">{report.user_name}</h4>
            <span className={`px-2 sm:px-2.5 md:px-3 py-0.5 sm:py-1 rounded-full text-xs sm:text-sm font-medium ${getPerformanceColor(report.completion_rate)}`}>
              {report.completion_rate}%
            </span>
          </div>
          <div className="text-xs sm:text-sm text-blue-600 font-medium flex items-center gap-1">
            {isExpanded ? (
              <>
                <Eye className="w-3 h-3 sm:w-4 sm:h-4" />
                <span>접기</span>
              </>
            ) : (
              <>
                <Eye className="w-3 h-3 sm:w-4 sm:h-4" />
                <span>상세보기</span>
              </>
            )}
          </div>
        </div>

        {/* 통계 */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 sm:gap-2.5 md:gap-3 text-sm">
          <div>
            <div className="text-[10px] sm:text-xs text-gray-500">총 업무</div>
            <div className="text-base sm:text-lg md:text-xl font-bold text-gray-900">{report.total_tasks}</div>
          </div>
          <div>
            <div className="text-[10px] sm:text-xs text-gray-500">완료</div>
            <div className="text-base sm:text-lg md:text-xl font-bold text-green-600">{report.completed_tasks}</div>
          </div>
          <div>
            <div className="text-[10px] sm:text-xs text-gray-500">진행중</div>
            <div className="text-base sm:text-lg md:text-xl font-bold text-blue-600">{report.in_progress_tasks}</div>
          </div>
          <div>
            <div className="text-[10px] sm:text-xs text-gray-500">대기</div>
            <div className="text-base sm:text-lg md:text-xl font-bold text-gray-600">{report.pending_tasks}</div>
          </div>
          <div>
            <div className="text-[10px] sm:text-xs text-gray-500">연체</div>
            <div className={`text-base sm:text-lg md:text-xl font-bold ${report.overdue_tasks > 0 ? 'text-red-600' : 'text-gray-400'}`}>
              {report.overdue_tasks}
            </div>
          </div>
          <div>
            <div className="text-[10px] sm:text-xs text-gray-500">평균시간</div>
            <div className="text-base sm:text-lg md:text-xl font-bold text-gray-900">{report.average_completion_time_days}일</div>
          </div>
        </div>

        {/* 상세 업무 목록 */}
        {isExpanded && (
          <div className="mt-2 sm:mt-3 md:mt-4 space-y-2 sm:space-y-3 md:space-y-4 border-t pt-2 sm:pt-3 md:pt-4">
            {report.all_task_details.length > 0 ? (
              <div className="space-y-1.5 sm:space-y-2">
                {report.all_task_details.map((task: TaskDetail) => (
                  <div
                    key={task.id}
                    className="flex items-center justify-between p-2 sm:p-2.5 md:p-3 bg-gray-50 rounded-md text-sm"
                  >
                    <div className="flex-1">
                      <div className="text-xs sm:text-sm font-medium text-gray-900">{task.title}</div>
                      <div className="text-[10px] sm:text-xs text-gray-500 mt-0.5 sm:mt-1">
                        {task.business_name} • {formatDate(task.created_at)}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      <span className={`px-1.5 sm:px-2 py-0.5 sm:py-1 rounded text-[10px] sm:text-xs ${getStatusBadgeColor(task.status_color)}`}>
                        {task.status_label}
                      </span>
                      {task.is_overdue && (
                        <span className="px-1.5 sm:px-2 py-0.5 sm:py-1 rounded text-[10px] sm:text-xs bg-red-100 text-red-800">
                          연체
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs sm:text-sm text-gray-500 text-center py-2 sm:py-3 md:py-4">
                업무가 없습니다
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default withAuth(AdminWeeklyReportsPageV2, undefined, 3)
