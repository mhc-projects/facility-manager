import React, { useEffect, useState } from 'react'
import {
  X,
  Calendar,
  Users,
  MapPin,
  Phone,
  Flag,
  Clock,
  Edit,
  Trash2,
  User,
  AlertCircle,
  CheckCircle,
  History
} from 'lucide-react'
import TaskHistoryTimeline from '@/components/TaskHistoryTimeline'
import SubsidyActiveBadge from '@/components/tasks/SubsidyActiveBadge'

// Task 타입
interface SelectedAssignee {
  id: string
  name: string
  department?: string
  team?: string
}

type TaskType = 'self' | 'subsidy' | 'etc' | 'as'
type TaskStatus = string
type Priority = 'high' | 'medium' | 'low'

interface Task {
  id: string
  title: string
  businessName?: string
  localGovernment?: string
  businessInfo?: {
    address: string
    contact: string
    manager: string
  }
  type: TaskType
  status: TaskStatus
  priority: Priority
  assignee?: string
  assignees?: SelectedAssignee[]
  startDate?: string
  dueDate?: string
  progressPercentage?: number
  delayStatus?: 'on_time' | 'at_risk' | 'delayed' | 'overdue'
  delayDays?: number
  createdAt: string
  description?: string
  notes?: string
  _stepInfo?: { status: TaskStatus; label: string; color: string }
}

interface TaskMobileModalProps {
  task: Task | null
  isOpen: boolean
  onClose: () => void
  onEdit?: (task: Task) => void
  onDelete?: (task: Task) => void
  activeSubsidies?: Record<string, any>
}

export default function TaskMobileModal({
  task,
  isOpen,
  onClose,
  onEdit,
  onDelete,
  activeSubsidies = {}
}: TaskMobileModalProps) {
  const [showHistory, setShowHistory] = useState(false)

  // 스크롤 방지
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isOpen])

  if (!task) return null

  // 우선순위 설정
  const priorityConfig = {
    high: {
      label: '높음',
      color: 'text-red-600',
      bg: 'bg-red-50',
      border: 'border-red-200'
    },
    medium: {
      label: '중간',
      color: 'text-yellow-600',
      bg: 'bg-yellow-50',
      border: 'border-yellow-200'
    },
    low: {
      label: '낮음',
      color: 'text-gray-600',
      bg: 'bg-gray-50',
      border: 'border-gray-200'
    }
  }

  // 업무 타입 레이블
  const typeLabels = {
    self: '자비 설치',
    subsidy: '보조금',
    as: 'AS',
    dealer: '대리점',
    outsourcing: '외주설치',
    etc: '기타'
  }

  const priority = priorityConfig[task.priority]

  return (
    <>
      {/* 백드롭 */}
      <div
        className={`
          fixed inset-0 bg-black transition-opacity duration-300 z-40
          ${isOpen ? 'opacity-50' : 'opacity-0 pointer-events-none'}
        `}
        onClick={onClose}
      />

      {/* 모달 */}
      <div
        className={`
          fixed inset-x-0 bottom-0 md:inset-0 md:flex md:items-center md:justify-center
          z-50 transition-transform duration-300 ease-out
          ${
            isOpen
              ? 'translate-y-0'
              : 'translate-y-full md:translate-y-0 md:scale-95 md:opacity-0'
          }
        `}
      >
        <div className="bg-white w-full h-[90vh] md:h-auto md:max-h-[85vh] md:max-w-3xl md:rounded-2xl shadow-2xl flex flex-col overflow-hidden">
          {/* 헤더 */}
          <div className="flex-shrink-0 px-5 py-4 sm:px-7 sm:py-5 border-b border-gray-200 bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-700">
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-white/20 backdrop-blur-sm text-white border border-white/30`}
                  >
                    <Flag className="w-3.5 h-3.5" />
                    {priority.label}
                  </span>
                  <span className="px-2.5 py-1 bg-white/90 text-blue-700 text-xs font-semibold rounded-lg shadow-sm">
                    {typeLabels[task.type]}
                  </span>
                </div>
                <h2 className="text-xl sm:text-2xl font-bold text-white pr-8 leading-tight">
                  {task.title}
                </h2>
              </div>
              <button
                onClick={onClose}
                className="flex-shrink-0 p-2 text-white/80 hover:text-white hover:bg-white/20 rounded-full transition-colors"
                aria-label="닫기"
              >
                <X className="w-5 h-5 sm:w-6 sm:h-6" />
              </button>
            </div>
          </div>

          {/* 스크롤 가능한 본문 */}
          <div className="flex-1 overflow-y-auto bg-gray-50">
            <div className="p-5 sm:p-7 space-y-6">
              {/* 진행 상태 */}
              {task.progressPercentage !== undefined && (
                <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <p className="text-xs text-gray-500 mb-1">현재 진행 단계</p>
                      <p className="text-base font-bold text-gray-900">
                        {task._stepInfo?.label || '진행 상태'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-500 mb-1">완료율</p>
                      <p className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                        {task.progressPercentage}%
                      </p>
                    </div>
                  </div>
                  <div className="relative w-full bg-gray-100 rounded-full h-3 overflow-hidden">
                    <div
                      className="absolute top-0 left-0 h-full bg-gradient-to-r from-blue-500 via-blue-600 to-indigo-600 rounded-full transition-all duration-500 shadow-sm"
                      style={{ width: `${task.progressPercentage}%` }}
                    />
                  </div>
                </div>
              )}

              {/* 기본 정보 */}
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                <h3 className="text-base font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <div className="w-1 h-5 bg-gradient-to-b from-blue-600 to-indigo-600 rounded-full"></div>
                  기본 정보
                </h3>

                <dl className="space-y-4">
                  {/* 담당자 */}
                  {task.assignees && task.assignees.length > 0 && (
                    <div className="flex items-start gap-4 py-3 border-b border-gray-100 last:border-0">
                      <dt className="flex items-center gap-2 text-sm font-medium text-gray-500 min-w-[80px]">
                        <Users className="w-4 h-4 text-blue-600" />
                        담당자
                      </dt>
                      <dd className="text-sm font-medium text-gray-900 flex-1">
                        <div className="flex flex-wrap gap-2">
                          {task.assignees.map((assignee, idx) => (
                            <span
                              key={idx}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-700 rounded-lg text-xs font-semibold border border-blue-100"
                            >
                              <User className="w-3.5 h-3.5" />
                              {assignee.name}
                            </span>
                          ))}
                        </div>
                      </dd>
                    </div>
                  )}

                  {/* 사업장 */}
                  {task.businessName && (
                    <div className="flex items-start gap-4 py-3 border-b border-gray-100 last:border-0">
                      <dt className="flex items-center gap-2 text-sm font-medium text-gray-500 min-w-[80px]">
                        <MapPin className="w-4 h-4 text-blue-600" />
                        사업장
                      </dt>
                      <dd className="text-sm font-semibold text-gray-900 flex-1">
                        <div className="flex items-center gap-1">
                          {task.businessName}
                          <SubsidyActiveBadge
                            localGovernment={task.localGovernment}
                            activeSubsidies={activeSubsidies}
                            taskStatus={task.status}
                            taskType={task.type}
                          />
                        </div>
                      </dd>
                    </div>
                  )}

                  {/* 주소 */}
                  {task.businessInfo?.address && (
                    <div className="flex items-start gap-4 py-3 border-b border-gray-100 last:border-0">
                      <dt className="text-sm font-medium text-gray-500 min-w-[80px] pl-6">
                        주소
                      </dt>
                      <dd className="text-sm text-gray-700 flex-1 leading-relaxed">
                        {task.businessInfo.address}
                      </dd>
                    </div>
                  )}

                  {/* 연락처 */}
                  {task.businessInfo?.contact && (
                    <div className="flex items-start gap-4 py-3 border-b border-gray-100 last:border-0">
                      <dt className="flex items-center gap-2 text-sm font-medium text-gray-500 min-w-[80px]">
                        <Phone className="w-4 h-4 text-blue-600" />
                        연락처
                      </dt>
                      <dd className="text-sm text-gray-700 flex-1">
                        <a
                          href={`tel:${task.businessInfo.contact}`}
                          className="text-blue-600 hover:text-blue-700 font-medium hover:underline"
                        >
                          {task.businessInfo.contact}
                        </a>
                      </dd>
                    </div>
                  )}

                  {/* 기간 */}
                  {task.startDate && task.dueDate && (
                    <div className="flex items-start gap-4 py-3 border-b border-gray-100 last:border-0">
                      <dt className="flex items-center gap-2 text-sm font-medium text-gray-500 min-w-[80px]">
                        <Calendar className="w-4 h-4 text-blue-600" />
                        기간
                      </dt>
                      <dd className="text-sm font-medium text-gray-900 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-1 bg-gray-100 rounded-lg">
                            {new Date(task.startDate).toLocaleDateString('ko-KR')}
                          </span>
                          <span className="text-gray-400">→</span>
                          <span className="px-2 py-1 bg-gray-100 rounded-lg">
                            {new Date(task.dueDate).toLocaleDateString('ko-KR')}
                          </span>
                        </div>
                      </dd>
                    </div>
                  )}

                  {/* 지연 상태 */}
                  {task.delayStatus && task.delayStatus !== 'on_time' && (
                    <div className="flex items-start gap-4 py-3 border-b border-gray-100 last:border-0">
                      <dt className="flex items-center gap-2 text-sm font-medium text-gray-500 min-w-[80px]">
                        <Clock className="w-4 h-4 text-blue-600" />
                        상태
                      </dt>
                      <dd className="text-sm flex-1">
                        <span
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm ${
                            task.delayStatus === 'delayed' ||
                            task.delayStatus === 'overdue'
                              ? 'bg-red-50 text-red-700 border border-red-200'
                              : task.delayStatus === 'at_risk'
                              ? 'bg-yellow-50 text-yellow-700 border border-yellow-200'
                              : 'bg-green-50 text-green-700 border border-green-200'
                          }`}
                        >
                          {task.delayStatus === 'delayed' &&
                            task.delayDays && (
                              <>
                                <AlertCircle className="w-3.5 h-3.5" />
                                {`${task.delayDays}일 지연`}
                              </>
                            )}
                          {task.delayStatus === 'at_risk' && (
                            <>
                              <Clock className="w-3.5 h-3.5" />
                              위험
                            </>
                          )}
                          {task.delayStatus === 'overdue' && (
                            <>
                              <AlertCircle className="w-3.5 h-3.5" />
                              기한 초과
                            </>
                          )}
                        </span>
                      </dd>
                    </div>
                  )}
                </dl>
              </div>

              {/* 설명 */}
              {task.description && (
                <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                  <h3 className="text-base font-bold text-gray-900 mb-3 flex items-center gap-2">
                    <div className="w-1 h-5 bg-gradient-to-b from-blue-600 to-indigo-600 rounded-full"></div>
                    설명
                  </h3>
                  <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                    {task.description}
                  </p>
                </div>
              )}

              {/* 메모 */}
              {task.notes && (
                <div className="bg-gradient-to-br from-amber-50 to-yellow-50 rounded-2xl p-5 shadow-sm border border-amber-200">
                  <h3 className="text-base font-bold text-gray-900 mb-3 flex items-center gap-2">
                    <div className="w-1 h-5 bg-gradient-to-b from-amber-500 to-yellow-600 rounded-full"></div>
                    메모
                  </h3>
                  <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">
                    {task.notes}
                  </p>
                </div>
              )}

              {/* 🆕 단계 이력 섹션 */}
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                <button
                  onClick={() => setShowHistory(!showHistory)}
                  className="w-full flex items-center justify-between mb-3 group"
                >
                  <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                    <div className="w-1 h-5 bg-gradient-to-b from-purple-600 to-indigo-600 rounded-full"></div>
                    <History className="w-4 h-4 text-purple-600" />
                    단계 이력
                  </h3>
                  <span className="text-xs text-gray-500 group-hover:text-gray-700">
                    {showHistory ? '접기' : '펼치기'}
                  </span>
                </button>
                {showHistory && (
                  <div className="mt-4">
                    <TaskHistoryTimeline taskId={task.id} />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 하단 액션 버튼 */}
          <div className="flex-shrink-0 p-5 sm:p-6 border-t border-gray-200 bg-white">
            <div className="flex gap-3">
              {onEdit && (
                <button
                  onClick={() => {
                    onEdit(task)
                    onClose()
                  }}
                  className="flex-1 flex items-center justify-center gap-2 px-5 py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold rounded-xl hover:from-blue-700 hover:to-indigo-700 active:scale-95 transition-all shadow-md hover:shadow-lg"
                >
                  <Edit className="w-4 h-4" />
                  수정하기
                </button>
              )}
              {onDelete && (
                <button
                  onClick={() => {
                    // confirm과 모달 닫기는 handleDeleteTask에서 처리
                    onDelete(task)
                  }}
                  className="flex items-center justify-center gap-2 px-5 py-3.5 border-2 border-gray-300 text-gray-700 font-bold rounded-xl hover:bg-gray-50 hover:border-gray-400 active:scale-95 transition-all"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
