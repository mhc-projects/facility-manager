import React from 'react'
import TaskCard from './TaskCard'

// Task 타입 (TaskCard와 동일)
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

interface TaskCardListProps {
  tasks: Task[]
  onTaskClick: (task: Task) => void
  onTaskEdit?: (task: Task) => void
  onComplete?: (taskId: string) => Promise<void>
  isLoading?: boolean
  activeSubsidies?: Record<string, any>
}

export default function TaskCardList({
  tasks,
  onTaskClick,
  onTaskEdit,
  onComplete,
  isLoading,
  activeSubsidies = {}
}: TaskCardListProps) {
  // 로딩 스켈레톤
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="bg-white rounded-lg border-l-4 border-gray-200 p-4 animate-pulse"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="h-4 bg-gray-200 rounded w-16"></div>
              <div className="h-6 bg-gray-200 rounded w-20"></div>
            </div>
            <div className="h-5 bg-gray-200 rounded w-3/4 mb-3"></div>
            <div className="space-y-2">
              <div className="h-4 bg-gray-200 rounded w-2/3"></div>
              <div className="h-4 bg-gray-200 rounded w-1/2"></div>
              <div className="h-4 bg-gray-200 rounded w-3/5"></div>
            </div>
            <div className="mt-3 pt-3 border-t border-gray-100">
              <div className="h-2 bg-gray-200 rounded-full w-full"></div>
            </div>
          </div>
        ))}
      </div>
    )
  }

  // 빈 상태
  if (tasks.length === 0) {
    return (
      <div className="text-center py-12 px-4">
        <div className="text-gray-400 mb-3">
          <svg
            className="w-16 h-16 sm:w-20 sm:h-20 mx-auto"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
            />
          </svg>
        </div>
        <p className="text-gray-600 font-medium text-sm sm:text-base">
          업무가 없습니다
        </p>
        <p className="text-gray-500 text-xs sm:text-sm mt-1">
          새로운 업무를 등록해보세요
        </p>
      </div>
    )
  }

  // 업무 카드 리스트
  return (
    <div className="space-y-3">
      {tasks.map((task) => (
        <TaskCard
          key={task.id}
          task={task}
          onClick={onTaskClick}
          onEdit={onTaskEdit}
          onComplete={onComplete}
          activeSubsidies={activeSubsidies}
        />
      ))}
    </div>
  )
}
