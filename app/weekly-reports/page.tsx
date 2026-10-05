'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import AdminLayout from '@/components/ui/AdminLayout'
import { withAuth, useAuth } from '@/contexts/AuthContext'
import { TokenManager } from '@/lib/api-client'
import {
  Calendar,
  TrendingUp,
  Clock,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  FileText,
  Target,
  Activity
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

function MyWeeklyReportPage() {
  const { user } = useAuth()
  const router = useRouter()
  const [report, setReport] = useState<WeeklyReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [selectedWeek, setSelectedWeek] = useState('')
  const [weekPeriod, setWeekPeriod] = useState<{ start: string; end: string; display: string } | null>(null)
  const [activeTab, setActiveTab] = useState<'all' | 'completed' | 'in_progress' | 'pending'>('all')

  // 이번 주 날짜 계산
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const today = new Date()
      const day = today.getDay()
      const diff = today.getDate() - day
      const monday = new Date(today.setDate(diff))
      setSelectedWeek(monday.toISOString().split('T')[0])
    }
  }, [])

  const fetchMyReport = async () => {
    if (!selectedWeek || !user?.id) return

    setLoading(true)
    try {
      const token = TokenManager.getToken()
      const response = await fetch(
        `/api/weekly-reports/realtime?weekDate=${selectedWeek}`,
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

      if (data.success && data.data.reports.length > 0) {
        // 본인 리포트만 추출
        const myReport = data.data.reports.find((r: WeeklyReport) => r.user_id === user.id)
        setReport(myReport || null)
        setWeekPeriod(data.data.week_period)
      } else {
        setReport(null)
      }
    } catch (error: any) {
      console.error('리포트 조회 오류:', error)
      alert(`리포트 조회 중 오류가 발생했습니다: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (selectedWeek && user?.id) {
      fetchMyReport()
    }
  }, [selectedWeek, user?.id])

  // 주간 변경
  const changeWeek = (direction: 'prev' | 'next') => {
    if (!selectedWeek) return
    const currentDate = new Date(selectedWeek)
    const newDate = new Date(currentDate)
    newDate.setDate(currentDate.getDate() + (direction === 'next' ? 7 : -7))
    setSelectedWeek(newDate.toISOString().split('T')[0])
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

  const getPriorityColor = (priority: string) => {
    const colors: Record<string, string> = {
      high: 'text-red-600 bg-red-50',
      medium: 'text-yellow-600 bg-yellow-50',
      low: 'text-gray-600 bg-gray-50'
    }
    return colors[priority] || 'text-gray-600 bg-gray-50'
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('ko-KR', {
      month: 'short',
      day: 'numeric',
      weekday: 'short'
    })
  }

  const getTaskList = () => {
    if (!report) return []
    switch (activeTab) {
      case 'completed':
        return report.completed_task_details
      case 'in_progress':
        return report.in_progress_task_details
      case 'pending':
        return report.pending_task_details
      default:
        return report.all_task_details
    }
  }

  return (
    <AdminLayout
      title="내 주간 리포트"
      description="나에게 할당된 주간 업무 현황"
    >
      <div className="space-y-6">
        {/* 주간 선택 */}
        <div className="bg-white rounded-md md:rounded-lg shadow-sm border border-gray-200 p-2 sm:p-3 md:p-4">
          <div className="flex items-center gap-2 sm:gap-2.5 md:gap-3">
            <button
              onClick={() => changeWeek('prev')}
              aria-label="이전 주"
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
              aria-label="다음 주"
              className="p-1.5 sm:p-2 hover:bg-gray-100 rounded-md transition-colors"
            >
              <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
            <button
              onClick={fetchMyReport}
              disabled={loading}
              className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 md:px-4 py-1.5 sm:py-2 text-xs sm:text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={`w-3 h-3 sm:w-4 sm:h-4 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">{loading ? '조회중...' : '새로고침'}</span>
            </button>
          </div>
        </div>

        {report ? (
          <>
            {/* 통계 카드 */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 md:gap-4">
              <StatCard
                icon={BarChart3}
                label="총 업무"
                value={report.total_tasks}
                color="purple"
              />
              <StatCard
                icon={CheckCircle}
                label="완료"
                value={report.completed_tasks}
                subValue={`${report.completion_rate}%`}
                color="green"
              />
              <StatCard
                icon={Clock}
                label="진행중"
                value={report.in_progress_tasks}
                color="blue"
              />
              <StatCard
                icon={AlertTriangle}
                label="연체"
                value={report.overdue_tasks}
                color="red"
              />
            </div>

            {/* 업무 타입별 통계 */}
            <div className="bg-white rounded-md md:rounded-lg shadow-sm border border-gray-200 p-2 sm:p-3 md:p-4">
              <h3 className="text-sm sm:text-base md:text-lg font-semibold text-gray-900 mb-2 sm:mb-3 md:mb-4">업무 분류</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 sm:gap-3 md:gap-4">
                <div className="p-2 sm:p-3 md:p-4 bg-blue-50 rounded-md">
                  <div className="text-[10px] sm:text-xs md:text-sm text-gray-600">자비 업무</div>
                  <div className="text-base sm:text-xl md:text-2xl font-bold text-blue-600">{report.self_tasks}개</div>
                </div>
                <div className="p-2 sm:p-3 md:p-4 bg-green-50 rounded-md">
                  <div className="text-[10px] sm:text-xs md:text-sm text-gray-600">보조금 업무</div>
                  <div className="text-base sm:text-xl md:text-2xl font-bold text-green-600">{report.subsidy_tasks}개</div>
                </div>
                <div className="p-2 sm:p-3 md:p-4 bg-gray-50 rounded-md">
                  <div className="text-[10px] sm:text-xs md:text-sm text-gray-600">평균 완료 시간</div>
                  <div className="text-base sm:text-xl md:text-2xl font-bold text-gray-900">{report.average_completion_time_days}일</div>
                </div>
              </div>
            </div>

            {/* 업무 목록 */}
            <div className="bg-white rounded-md md:rounded-lg shadow-sm border border-gray-200">
              <div className="p-2 sm:p-3 md:p-4 border-b border-gray-200">
                <h3 className="text-sm sm:text-base md:text-lg font-semibold text-gray-900 mb-2 sm:mb-3 md:mb-4">업무 상세</h3>

                {/* 탭 */}
                <div className="flex gap-1.5 sm:gap-2 flex-wrap">
                  <TabButton
                    active={activeTab === 'all'}
                    onClick={() => setActiveTab('all')}
                    count={report.all_task_details.length}
                  >
                    전체
                  </TabButton>
                  <TabButton
                    active={activeTab === 'completed'}
                    onClick={() => setActiveTab('completed')}
                    count={report.completed_task_details.length}
                  >
                    완료
                  </TabButton>
                  <TabButton
                    active={activeTab === 'in_progress'}
                    onClick={() => setActiveTab('in_progress')}
                    count={report.in_progress_task_details.length}
                  >
                    진행중
                  </TabButton>
                  <TabButton
                    active={activeTab === 'pending'}
                    onClick={() => setActiveTab('pending')}
                    count={report.pending_task_details.length}
                  >
                    대기
                  </TabButton>
                </div>
              </div>

              {/* 업무 리스트 */}
              <div className="divide-y divide-gray-200">
                {getTaskList().length > 0 ? (
                  getTaskList().map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      getStatusBadgeColor={getStatusBadgeColor}
                      getPriorityColor={getPriorityColor}
                      formatDate={formatDate}
                    />
                  ))
                ) : (
                  <div className="p-6 sm:p-8 md:p-12 text-center">
                    <FileText className="w-10 h-10 sm:w-12 sm:h-12 md:w-16 md:h-16 text-gray-300 mx-auto mb-2 sm:mb-3 md:mb-4" />
                    <p className="text-xs sm:text-sm md:text-base text-gray-500">해당하는 업무가 없습니다</p>
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="bg-white rounded-md md:rounded-lg shadow-sm border border-gray-200 p-6 sm:p-8 md:p-12 text-center">
            {loading ? (
              <>
                <RefreshCw className="w-10 h-10 sm:w-12 sm:h-12 md:w-16 md:h-16 text-gray-300 mx-auto mb-2 sm:mb-3 md:mb-4 animate-spin" />
                <p className="text-xs sm:text-sm md:text-base text-gray-500">리포트를 불러오는 중...</p>
              </>
            ) : (
              <>
                <Calendar className="w-10 h-10 sm:w-12 sm:h-12 md:w-16 md:h-16 text-gray-300 mx-auto mb-2 sm:mb-3 md:mb-4" />
                <p className="text-xs sm:text-sm md:text-base text-gray-500">해당 주간의 업무가 없습니다</p>
                <p className="text-[10px] sm:text-xs md:text-sm text-gray-400 mt-1 sm:mt-2">
                  다른 주간을 선택해보세요
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </AdminLayout>
  )
}

// 통계 카드 컴포넌트
function StatCard({ icon: Icon, label, value, subValue, color }: any) {
  const colorClasses: Record<string, string> = {
    blue: 'bg-blue-100 text-blue-600',
    purple: 'bg-purple-100 text-purple-600',
    green: 'bg-green-100 text-green-600',
    red: 'bg-red-100 text-red-600'
  }

  return (
    <div className="bg-white rounded-md md:rounded-lg shadow-sm border border-gray-200 p-2 sm:p-3 md:p-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[10px] sm:text-xs md:text-sm text-gray-600 mb-0.5 sm:mb-1">{label}</div>
          <div className="text-base sm:text-xl md:text-2xl font-bold text-gray-900">{value}</div>
          {subValue && (
            <div className="text-[10px] sm:text-xs md:text-sm text-gray-500 mt-0.5 sm:mt-1">{subValue}</div>
          )}
        </div>
        <div className={`w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 ${colorClasses[color]} rounded-md flex items-center justify-center flex-shrink-0`}>
          <Icon className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6" />
        </div>
      </div>
    </div>
  )
}

// 탭 버튼 컴포넌트
function TabButton({ active, onClick, count, children }: any) {
  return (
    <button
      onClick={onClick}
      className={`px-2 sm:px-3 md:px-4 py-1.5 sm:py-2 rounded-md text-xs sm:text-sm font-medium transition-colors ${
        active
          ? 'bg-blue-600 text-white'
          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
      }`}
    >
      {children} ({count})
    </button>
  )
}

// 업무 카드 컴포넌트
function TaskCard({ task, getStatusBadgeColor, getPriorityColor, formatDate }: any) {
  const typeLabels: Record<string, string> = {
    self: '자비',
    subsidy: '보조금',
    etc: '기타',
    as: 'AS'
  }

  const priorityLabels: Record<string, string> = {
    high: '높음',
    medium: '보통',
    low: '낮음'
  }

  return (
    <div className="p-2 sm:p-3 md:p-4 hover:bg-gray-50 transition-colors">
      <div className="space-y-2 sm:space-y-2.5 md:space-y-3">
        {/* 업무 제목 */}
        <div className="flex items-start justify-between gap-2 sm:gap-2.5 md:gap-3">
          <div className="flex-1">
            <h4 className="text-xs sm:text-sm md:text-base font-semibold text-gray-900 mb-0.5 sm:mb-1">{task.title}</h4>
            <p className="text-[10px] sm:text-xs md:text-sm text-gray-600">{task.business_name}</p>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
            {task.is_overdue && (
              <span className="px-1.5 sm:px-2 py-0.5 sm:py-1 rounded text-[10px] sm:text-xs bg-red-100 text-red-800 font-medium">
                연체
              </span>
            )}
            {task.is_completed && (
              <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 text-green-600" />
            )}
          </div>
        </div>

        {/* 업무 정보 */}
        <div className="flex flex-wrap gap-1.5 sm:gap-2">
          <span className={`px-1.5 sm:px-2 py-0.5 sm:py-1 rounded text-[10px] sm:text-xs font-medium ${getStatusBadgeColor(task.status_color)}`}>
            {task.status_label}
          </span>
          <span className={`px-1.5 sm:px-2 py-0.5 sm:py-1 rounded text-[10px] sm:text-xs font-medium ${getPriorityColor(task.priority)}`}>
            우선순위: {priorityLabels[task.priority] || task.priority}
          </span>
          <span className="px-1.5 sm:px-2 py-0.5 sm:py-1 rounded text-[10px] sm:text-xs bg-gray-100 text-gray-800 font-medium">
            {typeLabels[task.task_type] || task.task_type}
          </span>
        </div>

        {/* 날짜 정보 */}
        <div className="flex items-center gap-2 sm:gap-3 md:gap-4 text-[10px] sm:text-xs text-gray-500">
          <div className="flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            <span>생성: {formatDate(task.created_at)}</span>
          </div>
          {task.due_date && (
            <div className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              <span>마감: {formatDate(task.due_date)}</span>
            </div>
          )}
          {task.completed_at && (
            <div className="flex items-center gap-1">
              <CheckCircle className="w-3 h-3" />
              <span>완료: {formatDate(task.completed_at)}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default withAuth(MyWeeklyReportPage)
