import React from 'react'
import { ChevronRight, AlertCircle, Clock, Users, Calendar, Flag } from 'lucide-react'
import SubsidyActiveBadge from '@/components/tasks/SubsidyActiveBadge'
import { getManufacturerName } from '@/constants/manufacturers'

interface SelectedAssignee {
  id: string
  name: string
  department?: string
  team?: string
}

type TaskType = 'self' | 'subsidy' | 'dealer' | 'outsourcing' | 'etc' | 'as'
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
  manufacturer?: string
  _stepInfo?: { status: TaskStatus; label: string; color: string }
}

interface TaskCardProps {
  task: Task
  onClick: (task: Task) => void
  onEdit?: (task: Task) => void
  onComplete?: (taskId: string) => Promise<void>
  activeSubsidies?: Record<string, any>
  /** 'list' = 목록 compact row / 'kanban' = 칸반 확장 카드 (기본값) */
  variant?: 'list' | 'kanban'
}

const priorityBorder: Record<Priority, string> = {
  high: 'border-l-red-500',
  medium: 'border-l-yellow-500',
  low: 'border-l-gray-300',
}

const priorityDot: Record<Priority, string> = {
  high: 'bg-red-500',
  medium: 'bg-yellow-500',
  low: 'bg-gray-300',
}

const priorityLabel: Record<Priority, string> = {
  high: '높음',
  medium: '중간',
  low: '낮음',
}

const typeColors: Record<TaskType, string> = {
  self: 'bg-blue-50 text-blue-700 border-blue-200',
  subsidy: 'bg-green-50 text-green-700 border-green-200',
  dealer: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  outsourcing: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  as: 'bg-orange-50 text-orange-700 border-orange-200',
  etc: 'bg-gray-50 text-gray-700 border-gray-200',
}

const typeLabels: Record<TaskType, string> = {
  self: '자비',
  subsidy: '보조금',
  dealer: '대리점',
  outsourcing: '외주',
  as: 'AS',
  etc: '기타',
}

function DelayBadge({ delayStatus, delayDays }: { delayStatus?: string; delayDays?: number }) {
  if (!delayStatus || delayStatus === 'on_time') return null
  if (delayStatus === 'delayed' || delayStatus === 'overdue') {
    return (
      <span className="flex items-center gap-0.5 text-[10px] text-red-600 font-medium">
        <AlertCircle className="w-3 h-3 flex-shrink-0" />
        {delayStatus === 'delayed' ? `${delayDays}일 지연` : '기한초과'}
      </span>
    )
  }
  return (
    <span className="flex items-center gap-0.5 text-[10px] text-yellow-600 font-medium">
      <Clock className="w-3 h-3 flex-shrink-0" />
      위험
    </span>
  )
}

// ── 목록 compact row ───────────────────────────────────────────
function ListVariant({ task, onClick, activeSubsidies }: { task: Task; onClick: () => void; activeSubsidies: Record<string, any> }) {
  const assigneeText = task.assignees?.map(a => a.name).join(', ')
  const manufacturerText = task.manufacturer ? getManufacturerName(task.manufacturer) : null

  return (
    <div
      onClick={onClick}
      className={`
        bg-white rounded-lg border-l-4 ${priorityBorder[task.priority]}
        border border-l-[4px] border-gray-100
        shadow-sm hover:shadow-md active:bg-gray-50 transition-all duration-150
        cursor-pointer px-3 py-2.5 flex items-center gap-2 min-h-[60px]
      `}
    >
      <div className="flex-1 min-w-0">
        {/* 1행: 사업장명 + 타입 */}
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="font-semibold text-sm text-gray-900 truncate flex-1 leading-snug">
            {task.businessName || task.title}
          </span>
          <span className={`flex-shrink-0 px-1.5 py-0.5 text-[10px] font-medium border rounded ${typeColors[task.type]}`}>
            {typeLabels[task.type]}
          </span>
        </div>
        {/* 2행: 메타 */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {task._stepInfo && (
            <span className="text-[11px] text-blue-600 font-medium shrink-0">{task._stepInfo.label}</span>
          )}
          {assigneeText && (
            <span className="text-[11px] text-gray-500 truncate">· {assigneeText}</span>
          )}
          {manufacturerText && (
            <span className="text-[11px] text-gray-400 shrink-0">· {manufacturerText}</span>
          )}
          <SubsidyActiveBadge
            localGovernment={task.localGovernment}
            activeSubsidies={activeSubsidies}
            taskStatus={task.status}
            taskType={task.type}
          />
          <DelayBadge delayStatus={task.delayStatus} delayDays={task.delayDays} />
        </div>
      </div>
      <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
    </div>
  )
}

// ── 칸반 확장 카드 ─────────────────────────────────────────────
function KanbanVariant({ task, onClick, activeSubsidies }: { task: Task; onClick: () => void; activeSubsidies: Record<string, any> }) {
  const assigneeText = task.assignees?.map(a => a.name).join(', ')
  const manufacturerText = task.manufacturer ? getManufacturerName(task.manufacturer) : null

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' })

  return (
    <div
      onClick={onClick}
      className={`
        bg-white rounded-lg border-l-4 ${priorityBorder[task.priority]}
        shadow-sm hover:shadow-md active:scale-[0.98] transition-all duration-150
        cursor-pointer p-3
      `}
    >
      {/* 헤더: 타입 배지 + 우선순위 */}
      <div className="flex items-center justify-between mb-2">
        <span className={`px-1.5 py-0.5 text-[10px] font-medium border rounded ${typeColors[task.type]}`}>
          {typeLabels[task.type]}
        </span>
        <span className="flex items-center gap-1 text-[10px] text-gray-500">
          <div className={`w-2 h-2 rounded-full ${priorityDot[task.priority]}`} />
          {priorityLabel[task.priority]}
        </span>
      </div>

      {/* 사업장명 */}
      <p className="font-semibold text-sm text-gray-900 leading-snug line-clamp-2 mb-1.5">
        {task.businessName || task.title}
      </p>

      {/* 제조사 + 보조금뱃지 */}
      {(manufacturerText || task.localGovernment) && (
        <div className="flex items-center gap-1.5 flex-wrap mb-2">
          {manufacturerText && (
            <span className="text-[10px] text-gray-400">{manufacturerText}</span>
          )}
          <SubsidyActiveBadge
            localGovernment={task.localGovernment}
            activeSubsidies={activeSubsidies}
            taskStatus={task.status}
            taskType={task.type}
          />
        </div>
      )}

      {/* 담당자 */}
      {assigneeText && (
        <div className="flex items-center gap-1 mb-2">
          <Users className="w-3 h-3 text-gray-400 flex-shrink-0" />
          <span className="text-[11px] text-gray-600 truncate">{assigneeText}</span>
        </div>
      )}

      {/* 기간 */}
      {task.startDate && task.dueDate && (
        <div className="flex items-center gap-1 mb-2">
          <Calendar className="w-3 h-3 text-gray-400 flex-shrink-0" />
          <span className="text-[11px] text-gray-500">
            {formatDate(task.startDate)} ~ {formatDate(task.dueDate)}
          </span>
        </div>
      )}

      {/* 진행률 */}
      {task.progressPercentage !== undefined && (
        <div className="mb-2">
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-[10px] text-gray-500">{task._stepInfo?.label || '진행 중'}</span>
            <span className="text-[10px] font-medium text-blue-600">{task.progressPercentage}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-1">
            <div
              className="bg-blue-500 h-1 rounded-full transition-all duration-300"
              style={{ width: `${task.progressPercentage}%` }}
            />
          </div>
        </div>
      )}

      {/* 지연 배지 */}
      <DelayBadge delayStatus={task.delayStatus} delayDays={task.delayDays} />
    </div>
  )
}

// ── 메인 컴포넌트 ──────────────────────────────────────────────
export default function TaskCard({ task, onClick, activeSubsidies = {}, variant = 'kanban' }: TaskCardProps) {
  if (variant === 'list') {
    return <ListVariant task={task} onClick={() => onClick(task)} activeSubsidies={activeSubsidies} />
  }
  return <KanbanVariant task={task} onClick={() => onClick(task)} activeSubsidies={activeSubsidies} />
}
