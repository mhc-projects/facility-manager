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
  History,
  ArrowRight,
} from 'lucide-react'
import TaskHistoryTimeline from '@/components/TaskHistoryTimeline'
import SubsidyActiveBadge from '@/components/tasks/SubsidyActiveBadge'

interface SelectedAssignee {
  id: string
  name: string
  department?: string
  team?: string
}

interface StepInfo {
  status: string
  label: string
  color: string
}

type TaskType = 'self' | 'subsidy' | 'etc' | 'as' | 'dealer' | 'outsourcing'
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
  availableSteps?: StepInfo[]
  onMoveStage?: (taskId: string, newStatus: string) => Promise<void>
}

const typeLabels: Record<string, string> = {
  self: '자비 설치',
  subsidy: '보조금',
  as: 'AS',
  dealer: '대리점',
  outsourcing: '외주설치',
  etc: '기타',
}

const priorityConfig: Record<Priority, { label: string; color: string; bg: string; border: string }> = {
  high: { label: '높음', color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200' },
  medium: { label: '중간', color: 'text-yellow-600', bg: 'bg-yellow-50', border: 'border-yellow-200' },
  low: { label: '낮음', color: 'text-gray-600', bg: 'bg-gray-50', border: 'border-gray-200' },
}

export default function TaskMobileModal({
  task,
  isOpen,
  onClose,
  onEdit,
  onDelete,
  activeSubsidies = {},
  availableSteps,
  onMoveStage,
}: TaskMobileModalProps) {
  const [showHistory, setShowHistory] = useState(false)
  const [isMoving, setIsMoving] = useState(false)

  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : 'unset'
    return () => { document.body.style.overflow = 'unset' }
  }, [isOpen])

  if (!task) return null

  const priority = priorityConfig[task.priority]

  const handleMoveStage = async (newStatus: string) => {
    if (!onMoveStage || isMoving) return
    setIsMoving(true)
    try {
      await onMoveStage(task.id, newStatus)
      onClose()
    } finally {
      setIsMoving(false)
    }
  }

  return (
    <>
      {/* 백드롭 */}
      <div
        className={`fixed inset-0 bg-black transition-opacity duration-300 z-40 ${isOpen ? 'opacity-50' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />

      {/* 모달 */}
      <div
        className={`
          fixed inset-x-0 bottom-0 md:inset-0 md:flex md:items-center md:justify-center
          z-50 transition-transform duration-300 ease-out
          ${isOpen ? 'translate-y-0' : 'translate-y-full md:translate-y-0 md:scale-95 md:opacity-0'}
        `}
      >
        <div className="bg-white w-full h-[90vh] md:h-auto md:max-h-[85vh] md:max-w-3xl md:rounded-2xl shadow-2xl flex flex-col overflow-hidden">

          {/* 헤더 */}
          <div className="flex-shrink-0 px-4 py-3 sm:px-6 sm:py-4 border-b border-gray-200 bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-700">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                {/* 배지 행 */}
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-semibold bg-white/20 text-white border border-white/30">
                    <Flag className="w-3 h-3" />
                    {priority.label}
                  </span>
                  <span className="px-2 py-0.5 bg-white/90 text-blue-700 text-xs font-semibold rounded-lg">
                    {typeLabels[task.type] ?? task.type}
                  </span>
                </div>
                {/* 사업장명 (주 제목) */}
                <h2 className="text-lg sm:text-xl font-bold text-white leading-tight truncate">
                  {task.businessName || task.title}
                </h2>
                {/* 업무 설명 (부 제목) */}
                {task.businessName && task.title !== task.businessName && (
                  <p className="text-xs text-white/70 mt-0.5 line-clamp-1">{task.title}</p>
                )}
              </div>
              <button
                onClick={onClose}
                className="flex-shrink-0 p-1.5 text-white/80 hover:text-white hover:bg-white/20 rounded-full transition-colors"
                aria-label="닫기"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* 스크롤 본문 */}
          <div className="flex-1 overflow-y-auto bg-gray-50">
            <div className="p-4 sm:p-6 space-y-4">

              {/* 진행 상태 */}
              {task.progressPercentage !== undefined && (
                <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="text-xs text-gray-500 mb-0.5">현재 단계</p>
                      <p className="text-sm font-bold text-gray-900">{task._stepInfo?.label || '진행 중'}</p>
                    </div>
                    <p className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                      {task.progressPercentage}%
                    </p>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full transition-all duration-500"
                      style={{ width: `${task.progressPercentage}%` }}
                    />
                  </div>
                </div>
              )}

              {/* 기본 정보 */}
              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
                  <div className="w-1 h-4 bg-gradient-to-b from-blue-600 to-indigo-600 rounded-full" />
                  기본 정보
                </h3>
                <dl className="space-y-3">
                  {task.assignees && task.assignees.length > 0 && (
                    <div className="flex items-start gap-3">
                      <dt className="flex items-center gap-1.5 text-xs font-medium text-gray-500 min-w-[64px] pt-0.5">
                        <Users className="w-3.5 h-3.5 text-blue-600" />담당자
                      </dt>
                      <dd className="flex flex-wrap gap-1.5 flex-1">
                        {task.assignees.map((a, i) => (
                          <span key={i} className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 rounded-lg text-xs font-medium border border-blue-100">
                            <User className="w-3 h-3" />{a.name}
                          </span>
                        ))}
                      </dd>
                    </div>
                  )}

                  {task.businessName && (
                    <div className="flex items-start gap-3">
                      <dt className="flex items-center gap-1.5 text-xs font-medium text-gray-500 min-w-[64px] pt-0.5">
                        <MapPin className="w-3.5 h-3.5 text-blue-600" />사업장
                      </dt>
                      <dd className="text-sm font-semibold text-gray-900 flex-1 flex items-center gap-1 flex-wrap">
                        {task.businessName}
                        <SubsidyActiveBadge
                          localGovernment={task.localGovernment}
                          activeSubsidies={activeSubsidies}
                          taskStatus={task.status}
                          taskType={task.type}
                        />
                      </dd>
                    </div>
                  )}

                  {task.businessInfo?.address && (
                    <div className="flex items-start gap-3">
                      <dt className="text-xs font-medium text-gray-500 min-w-[64px] pl-5 pt-0.5">주소</dt>
                      <dd className="text-xs text-gray-700 flex-1 leading-relaxed">{task.businessInfo.address}</dd>
                    </div>
                  )}

                  {task.businessInfo?.contact && (
                    <div className="flex items-start gap-3">
                      <dt className="flex items-center gap-1.5 text-xs font-medium text-gray-500 min-w-[64px] pt-0.5">
                        <Phone className="w-3.5 h-3.5 text-blue-600" />연락처
                      </dt>
                      <dd className="flex-1">
                        <a href={`tel:${task.businessInfo.contact}`} className="text-sm text-blue-600 font-medium hover:underline">
                          {task.businessInfo.contact}
                        </a>
                      </dd>
                    </div>
                  )}

                  {task.startDate && task.dueDate && (
                    <div className="flex items-start gap-3">
                      <dt className="flex items-center gap-1.5 text-xs font-medium text-gray-500 min-w-[64px] pt-0.5">
                        <Calendar className="w-3.5 h-3.5 text-blue-600" />기간
                      </dt>
                      <dd className="text-xs font-medium text-gray-900 flex-1 flex items-center gap-2">
                        <span className="px-2 py-1 bg-gray-100 rounded-md">
                          {new Date(task.startDate).toLocaleDateString('ko-KR')}
                        </span>
                        <span className="text-gray-400">→</span>
                        <span className="px-2 py-1 bg-gray-100 rounded-md">
                          {new Date(task.dueDate).toLocaleDateString('ko-KR')}
                        </span>
                      </dd>
                    </div>
                  )}

                  {task.delayStatus && task.delayStatus !== 'on_time' && (
                    <div className="flex items-start gap-3">
                      <dt className="flex items-center gap-1.5 text-xs font-medium text-gray-500 min-w-[64px] pt-0.5">
                        <Clock className="w-3.5 h-3.5 text-blue-600" />상태
                      </dt>
                      <dd className="flex-1">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold ${
                          task.delayStatus === 'delayed' || task.delayStatus === 'overdue'
                            ? 'bg-red-50 text-red-700 border border-red-200'
                            : 'bg-yellow-50 text-yellow-700 border border-yellow-200'
                        }`}>
                          <AlertCircle className="w-3 h-3" />
                          {task.delayStatus === 'delayed' ? `${task.delayDays}일 지연`
                            : task.delayStatus === 'overdue' ? '기한 초과'
                            : '위험'}
                        </span>
                      </dd>
                    </div>
                  )}
                </dl>
              </div>

              {/* 설명 */}
              {task.description && (
                <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                  <h3 className="text-sm font-bold text-gray-900 mb-2 flex items-center gap-2">
                    <div className="w-1 h-4 bg-gradient-to-b from-blue-600 to-indigo-600 rounded-full" />
                    설명
                  </h3>
                  <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{task.description}</p>
                </div>
              )}

              {/* 메모 */}
              {task.notes && (
                <div className="bg-amber-50 rounded-xl p-4 shadow-sm border border-amber-200">
                  <h3 className="text-sm font-bold text-gray-900 mb-2 flex items-center gap-2">
                    <div className="w-1 h-4 bg-gradient-to-b from-amber-500 to-yellow-600 rounded-full" />
                    메모
                  </h3>
                  <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">{task.notes}</p>
                </div>
              )}

              {/* 단계 이동 */}
              {availableSteps && availableSteps.length > 0 && onMoveStage && (
                <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                  <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
                    <div className="w-1 h-4 bg-gradient-to-b from-indigo-500 to-purple-600 rounded-full" />
                    <ArrowRight className="w-3.5 h-3.5 text-indigo-600" />
                    단계 이동
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {availableSteps.map(step => (
                      <button
                        key={step.status}
                        onClick={() => handleMoveStage(step.status)}
                        disabled={isMoving}
                        className={`px-3 py-1.5 text-xs rounded-lg border transition-colors disabled:opacity-50 ${
                          task.status === step.status
                            ? 'bg-blue-600 text-white border-blue-600 font-semibold'
                            : 'bg-white text-gray-700 border-gray-200 hover:border-blue-400 hover:text-blue-600 active:bg-blue-50'
                        }`}
                      >
                        {step.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 단계 이력 */}
              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <button
                  onClick={() => setShowHistory(!showHistory)}
                  className="w-full flex items-center justify-between group"
                >
                  <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                    <div className="w-1 h-4 bg-gradient-to-b from-purple-600 to-indigo-600 rounded-full" />
                    <History className="w-3.5 h-3.5 text-purple-600" />
                    단계 이력
                  </h3>
                  <span className="text-xs text-gray-500 group-hover:text-gray-700">
                    {showHistory ? '접기' : '펼치기'}
                  </span>
                </button>
                {showHistory && (
                  <div className="mt-3">
                    <TaskHistoryTimeline taskId={task.id} />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 하단 액션 버튼 */}
          <div className="flex-shrink-0 px-4 py-3 sm:px-6 border-t border-gray-200 bg-white">
            <div className="flex gap-2">
              {task.businessInfo?.contact && (
                <a
                  href={`tel:${task.businessInfo.contact}`}
                  className="flex items-center justify-center gap-1.5 px-4 py-3 border-2 border-green-300 text-green-700 font-semibold rounded-xl hover:bg-green-50 active:scale-95 transition-all"
                >
                  <Phone className="w-4 h-4" />
                </a>
              )}
              {onEdit && (
                <button
                  onClick={() => { onEdit(task); onClose() }}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold rounded-xl hover:from-blue-700 hover:to-indigo-700 active:scale-95 transition-all shadow-md"
                >
                  <Edit className="w-4 h-4" />
                  수정하기
                </button>
              )}
              {onDelete && (
                <button
                  onClick={() => onDelete(task)}
                  className="flex items-center justify-center gap-1.5 px-4 py-3 border-2 border-gray-300 text-gray-700 font-bold rounded-xl hover:bg-gray-50 hover:border-gray-400 active:scale-95 transition-all"
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
