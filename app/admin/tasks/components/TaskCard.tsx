import React from 'react'
import { ChevronRight, AlertCircle, Clock } from 'lucide-react'
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
}

const priorityBorder: Record<Priority, string> = {
  high: 'border-l-red-500',
  medium: 'border-l-yellow-500',
  low: 'border-l-gray-300',
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

export default function TaskCard({ task, onClick, activeSubsidies = {} }: TaskCardProps) {
  const assigneeText = task.assignees?.map(a => a.name).join(', ')
  const manufacturerText = task.manufacturer ? getManufacturerName(task.manufacturer) : null

  const delayBadge =
    task.delayStatus === 'delayed' || task.delayStatus === 'overdue' ? (
      <span className="flex items-center gap-0.5 text-[10px] text-red-600 font-medium shrink-0">
        <AlertCircle className="w-3 h-3" />
        {task.delayStatus === 'delayed' ? `${task.delayDays}일 지연` : '기한초과'}
      </span>
    ) : task.delayStatus === 'at_risk' ? (
      <span className="flex items-center gap-0.5 text-[10px] text-yellow-600 font-medium shrink-0">
        <Clock className="w-3 h-3" />
        위험
      </span>
    ) : null

  return (
    <div
      onClick={() => onClick(task)}
      className={`
        bg-white rounded-lg border-l-4 ${priorityBorder[task.priority]}
        border border-l-[4px] border-gray-100
        shadow-sm hover:shadow-md active:bg-gray-50 transition-all duration-150
        cursor-pointer px-3 py-2.5 flex items-center gap-2 min-h-[60px]
      `}
    >
      {/* 본문 */}
      <div className="flex-1 min-w-0">
        {/* 1행: 사업장명 + 타입 배지 */}
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="font-semibold text-sm text-gray-900 truncate flex-1 leading-snug">
            {task.businessName || task.title}
          </span>
          <span className={`flex-shrink-0 px-1.5 py-0.5 text-[10px] font-medium border rounded ${typeColors[task.type]}`}>
            {typeLabels[task.type]}
          </span>
        </div>

        {/* 2행: 메타 정보 */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {task._stepInfo && (
            <span className="text-[11px] text-blue-600 font-medium shrink-0">
              {task._stepInfo.label}
            </span>
          )}
          {assigneeText && (
            <span className="text-[11px] text-gray-500 truncate">
              · {assigneeText}
            </span>
          )}
          {manufacturerText && (
            <span className="text-[11px] text-gray-400 shrink-0">
              · {manufacturerText}
            </span>
          )}
          <SubsidyActiveBadge
            localGovernment={task.localGovernment}
            activeSubsidies={activeSubsidies}
            taskStatus={task.status}
            taskType={task.type}
          />
          {delayBadge}
        </div>
      </div>

      {/* 오른쪽 화살표 */}
      <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
    </div>
  )
}
