import React, { useState } from 'react'
import {
  Flag,
  Users,
  MapPin,
  Calendar,
  AlertCircle,
  Clock,
  CheckCircle,
  Edit,
  ChevronRight,
  User,
  ArrowRight,
  Loader2,
  FileText
} from 'lucide-react'
import SubsidyActiveBadge from '@/components/tasks/SubsidyActiveBadge'

// Task 타입 (부모에서 import할 예정)
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
  _stepInfo?: { status: TaskStatus; label: string; color: string }
}

interface TaskCardProps {
  task: Task
  onClick: (task: Task) => void
  onEdit?: (task: Task) => void
  onComplete?: (taskId: string) => Promise<void>
  activeSubsidies?: Record<string, any>
}

export default function TaskCard({ task, onClick, onEdit, onComplete, activeSubsidies = {} }: TaskCardProps) {
  const [isCompleting, setIsCompleting] = useState(false)

  // 우선순위 색상 설정
  const priorityColors = {
    high: {
      border: 'border-l-red-500',
      bg: 'bg-red-50',
      text: 'text-red-600',
      icon: 'text-red-500'
    },
    medium: {
      border: 'border-l-yellow-500',
      bg: 'bg-yellow-50',
      text: 'text-yellow-600',
      icon: 'text-yellow-500'
    },
    low: {
      border: 'border-l-gray-400',
      bg: 'bg-gray-50',
      text: 'text-gray-600',
      icon: 'text-gray-500'
    }
  }

  // 업무 타입 색상
  const typeColors = {
    self: 'bg-blue-50 text-blue-700 border-blue-200',
    subsidy: 'bg-green-50 text-green-700 border-green-200',
    dealer: 'bg-cyan-50 text-cyan-700 border-cyan-200',
    outsourcing: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    as: 'bg-orange-50 text-orange-700 border-orange-200',
    etc: 'bg-gray-50 text-gray-700 border-gray-200'
  }

  // 지연 상태 설정
  const delayStatusConfig = {
    delayed: {
      bg: 'bg-red-50',
      text: 'text-red-600',
      icon: <AlertCircle className="w-3 h-3" />,
      label: `${task.delayDays}일 지연`
    },
    at_risk: {
      bg: 'bg-yellow-50',
      text: 'text-yellow-600',
      icon: <Clock className="w-3 h-3" />,
      label: '위험'
    },
    on_time: {
      bg: 'bg-green-50',
      text: 'text-green-600',
      icon: <CheckCircle className="w-3 h-3" />,
      label: '정상'
    },
    overdue: {
      bg: 'bg-red-100',
      text: 'text-red-700',
      icon: <AlertCircle className="w-3 h-3" />,
      label: '기한 초과'
    }
  }

  const priorityColor = priorityColors[task.priority]
  const delayConfig = task.delayStatus ? delayStatusConfig[task.delayStatus] : null

  // 업무 타입 레이블
  const typeLabels = {
    self: '자비 설치',
    subsidy: '보조금',
    dealer: '대리점',
    outsourcing: '외주설치',
    as: 'AS',
    etc: '기타'
  }

  // 우선순위 레이블
  const priorityLabels = {
    high: '높음',
    medium: '중간',
    low: '낮음'
  }

  return (
    <div
      onClick={() => onClick(task)}
      className={`
        bg-white rounded-lg border-l-4 ${priorityColor.border}
        shadow-sm hover:shadow-md transition-all duration-200
        active:scale-[0.98] cursor-pointer
        p-2 sm:p-3
      `}
    >
      {/* 헤더: 우선순위 + 업무 타입 */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1">
          <Flag className={`w-3 h-3 ${priorityColor.icon}`} />
          <span className={`text-[10px] sm:text-xs font-medium ${priorityColor.text}`}>
            {priorityLabels[task.priority]}
          </span>
        </div>
        <span className={`px-1.5 py-0.5 text-[9px] sm:text-[10px] font-medium border rounded ${typeColors[task.type]}`}>
          {typeLabels[task.type]}
        </span>
      </div>

      {/* 사업장명 */}
      <div className="mb-2">
        <div className="flex items-center gap-1">
          <h3 className="font-semibold text-xs sm:text-sm text-gray-900 line-clamp-2 leading-tight">
            {task.businessName || task.title}
          </h3>
          <SubsidyActiveBadge
            localGovernment={task.localGovernment}
            activeSubsidies={activeSubsidies}
            taskStatus={task.status}
            taskType={task.type}
          />
        </div>
      </div>

      {/* 정보 그리드 */}
      <div className="space-y-1.5">
        {/* 담당자 */}
        {task.assignees && task.assignees.length > 0 && (
          <div className="flex items-center gap-1.5 text-[10px] sm:text-xs text-gray-600">
            <Users className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">
              {task.assignees.map(a => a.name).join(', ')}
            </span>
          </div>
        )}

        {/* 업무 설명 */}
        {task.description && (
          <div className="flex items-center gap-1.5 text-[10px] sm:text-xs text-gray-600">
            <FileText className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">{task.description}</span>
          </div>
        )}

        {/* 기간 */}
        {task.startDate && task.dueDate && (
          <div className="flex items-center gap-1.5 text-[10px] sm:text-xs text-gray-600">
            <Calendar className="w-3 h-3 flex-shrink-0" />
            <span>
              {new Date(task.startDate).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' })}
              {' ~ '}
              {new Date(task.dueDate).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' })}
            </span>
          </div>
        )}
      </div>

      {/* 진행률 바 */}
      {task.progressPercentage !== undefined && (
        <div className="mt-2">
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-[9px] sm:text-[10px] text-gray-600">
              {task._stepInfo?.label || '진행 중'}
            </span>
            <span className="text-[9px] sm:text-[10px] font-medium text-blue-600">
              {task.progressPercentage}%
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-1">
            <div
              className="bg-blue-600 h-1 rounded-full transition-all duration-300"
              style={{ width: `${task.progressPercentage}%` }}
            />
          </div>
        </div>
      )}

      {/* 지연 상태 배지 */}
      {delayConfig && task.delayStatus !== 'on_time' && (
        <div
          className={`mt-2 flex items-center gap-1 text-[9px] sm:text-[10px] ${delayConfig.text} ${delayConfig.bg} px-1.5 py-1 rounded`}
        >
          {delayConfig.icon}
          <span className="font-medium">{delayConfig.label}</span>
        </div>
      )}

      {/* 액션 버튼 영역 */}
      <div className="mt-2 pt-2 border-t border-gray-100 flex items-center justify-between">
        <button
          onClick={(e) => {
            e.stopPropagation()
            onClick(task)
          }}
          className="flex items-center gap-0.5 text-[10px] sm:text-xs text-blue-600 font-medium hover:text-blue-700"
        >
          상세보기
          <ChevronRight className="w-3 h-3" />
        </button>

        <div className="flex items-center gap-1.5">
          {onComplete && (
            <button
              onClick={async (e) => {
                e.stopPropagation()
                setIsCompleting(true)
                try {
                  await onComplete(task.id)
                } finally {
                  setIsCompleting(false)
                }
              }}
              disabled={isCompleting}
              className="flex items-center gap-0.5 px-2 py-1 text-[10px] sm:text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isCompleting ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <ArrowRight className="w-3 h-3" />
              )}
              완료
            </button>
          )}

          {onEdit && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onEdit(task)
              }}
              className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
              aria-label="수정"
            >
              <Edit className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
