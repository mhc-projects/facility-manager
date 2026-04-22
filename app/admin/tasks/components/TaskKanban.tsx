'use client'

import React from 'react'
import { Task, TaskStatus, StepInfo, getStepsByType, TaskType } from '../types'
import { getManufacturerName } from '@/constants/manufacturers'

interface TaskKanbanProps {
  tasks: Task[]
  selectedType: TaskType | 'all'
  isCompactMode: boolean
  onTaskClick?: (task: Task) => void
  onTaskDragStart?: (task: Task) => void
  onTaskDragEnd?: () => void
  onTaskDrop?: (status: TaskStatus) => void
  className?: string
}

/**
 * 칸반 보드 컴포넌트
 *
 * 주요 기능:
 * - 업무 타입별 워크플로우 단계 표시
 * - 각 단계별 업무 카드 목록
 * - 드래그 앤 드롭 지원 (핸들러 제공 시)
 * - 컴팩트/확장 모드 지원
 */
export default function TaskKanban({
  tasks,
  selectedType,
  isCompactMode,
  onTaskClick,
  onTaskDragStart,
  onTaskDragEnd,
  onTaskDrop,
  className = ''
}: TaskKanbanProps) {
  // 상태별 업무 그룹화
  const tasksByStatus = React.useMemo(() => {
    // 표시할 단계 결정
    const steps = selectedType === 'all'
      ? getAllUniqueSteps(tasks)
      : getStepsByType(selectedType)

    // 상태별로 업무 그룹화
    const grouped: Record<string, Task[]> = {}

    steps.forEach(step => {
      if (selectedType === 'all') {
        // 전체 보기: 모든 타입의 해당 상태 업무 포함
        grouped[step.status] = tasks.filter(task => task.status === step.status)
      } else {
        // 개별 타입: 해당 타입의 해당 상태 업무만
        grouped[step.status] = tasks.filter(
          task => task.type === selectedType && task.status === step.status
        )
      }
    })

    return { grouped, steps }
  }, [tasks, selectedType])

  return (
    <div className={`bg-white rounded-xl shadow-sm border border-gray-200 p-2 sm:p-3 md:p-4 ${className}`}>
      {/* 칸반 보드 헤더 */}
      <div className="flex items-center justify-between mb-2 sm:mb-3 md:mb-4">
        <h3 className="text-base sm:text-lg font-semibold text-gray-900">업무 흐름</h3>
        <div className="text-xs text-gray-500">
          {tasksByStatus.steps.length}개 단계
        </div>
      </div>

      {/* 칸반 열 */}
      <div className="flex gap-2 sm:gap-3 md:gap-4 overflow-x-auto pb-2 sm:pb-3 md:pb-4">
        {tasksByStatus.steps.map((step) => (
          <KanbanColumn
            key={step.status}
            step={step}
            tasks={tasksByStatus.grouped[step.status] || []}
            isCompactMode={isCompactMode}
            onTaskClick={onTaskClick}
            onTaskDragStart={onTaskDragStart}
            onTaskDragEnd={onTaskDragEnd}
            onDrop={() => onTaskDrop?.(step.status)}
          />
        ))}
      </div>

      {/* 빈 상태 */}
      {tasksByStatus.steps.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          <p>업무가 없습니다.</p>
          <p className="text-sm mt-2">새 업무를 추가해보세요.</p>
        </div>
      )}
    </div>
  )
}

// ==================== 하위 컴포넌트 ====================

interface KanbanColumnProps {
  step: StepInfo
  tasks: Task[]
  isCompactMode: boolean
  onTaskClick?: (task: Task) => void
  onTaskDragStart?: (task: Task) => void
  onTaskDragEnd?: () => void
  onDrop?: () => void
}

/**
 * 칸반 보드의 개별 열(컬럼) 컴포넌트
 */
function KanbanColumn({
  step,
  tasks,
  isCompactMode,
  onTaskClick,
  onTaskDragStart,
  onTaskDragEnd,
  onDrop
}: KanbanColumnProps) {
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  return (
    <div
      className="flex-shrink-0 w-48 sm:w-56 md:w-64 bg-gray-50 rounded-lg p-2 sm:p-3"
      onDragOver={handleDragOver}
      onDrop={onDrop}
    >
      {/* 열 헤더 */}
      <div className="flex items-center justify-between mb-2 sm:mb-3">
        <div className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded-full ${getColorClass(step.color)}`} />
          <h3 className="font-medium text-gray-900 text-xs sm:text-sm">{step.label}</h3>
        </div>
        <span className="text-xs text-gray-500 bg-white px-1.5 py-0.5 sm:px-2 sm:py-1 rounded">
          총 {tasks.length}개
        </span>
      </div>

      {/* 업무 카드들 */}
      <div className={`space-y-1.5 sm:space-y-2 ${
        isCompactMode
          ? 'min-h-[80px] sm:min-h-[100px]'
          : 'max-h-[300px] sm:max-h-[400px] overflow-y-auto'
      }`}>
        {tasks.length === 0 ? (
          <div className="text-center py-4 text-xs text-gray-400">
            업무 없음
          </div>
        ) : (
          tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              isCompact={isCompactMode}
              onClick={() => onTaskClick?.(task)}
              onDragStart={() => onTaskDragStart?.(task)}
              onDragEnd={onTaskDragEnd}
            />
          ))
        )}
      </div>
    </div>
  )
}

interface TaskCardProps {
  task: Task
  isCompact: boolean
  onClick?: () => void
  onDragStart?: () => void
  onDragEnd?: () => void
}

/**
 * 칸반 보드의 개별 업무 카드
 */
function TaskCard({ task, isCompact, onClick, onDragStart, onDragEnd }: TaskCardProps) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className="bg-white rounded-lg border border-gray-200 p-2 sm:p-3 cursor-pointer hover:shadow-md transition-shadow"
    >
      {/* 업무명 */}
      <div className="font-medium text-xs sm:text-sm text-gray-900 mb-1 line-clamp-2">
        {task.title}
      </div>

      {!isCompact && (
        <>
          {/* 사업장명 + 제조사 */}
          {(task.businessName || task.manufacturer) && (
            <div className="mb-2">
              {task.businessName && (
                <div className="text-xs text-gray-600 line-clamp-1">{task.businessName}</div>
              )}
              {task.manufacturer && (
                <div className="text-[10px] text-gray-400 line-clamp-1">{getManufacturerName(task.manufacturer)}</div>
              )}
            </div>
          )}

          {/* 메타 정보 */}
          <div className="flex items-center gap-2 text-xs">
            {/* 우선순위 뱃지 */}
            <span className={`px-1.5 py-0.5 rounded ${getPriorityColor(task.priority)}`}>
              {getPriorityLabel(task.priority)}
            </span>

            {/* 담당자 */}
            {task.assignees && task.assignees.length > 0 && (
              <span className="text-gray-600 truncate">
                {task.assignees[0].name}
                {task.assignees.length > 1 && ` +${task.assignees.length - 1}`}
              </span>
            )}
          </div>

          {/* 진행률 */}
          {task.progressPercentage !== undefined && (
            <div className="mt-2">
              <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
                <span>진행률</span>
                <span>{task.progressPercentage}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-1.5">
                <div
                  className="bg-blue-600 h-1.5 rounded-full transition-all"
                  style={{ width: `${task.progressPercentage}%` }}
                />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ==================== 유틸리티 함수 ====================

/**
 * 전체 보기에서 모든 고유한 단계 추출
 */
function getAllUniqueSteps(tasks: Task[]): StepInfo[] {
  const uniqueSteps = new Map<TaskStatus, StepInfo>()

  tasks.forEach(task => {
    if (!uniqueSteps.has(task.status) && task._stepInfo) {
      uniqueSteps.set(task.status, task._stepInfo)
    }
  })

  return Array.from(uniqueSteps.values())
}

/**
 * 색상 이름을 Tailwind 클래스로 변환
 */
function getColorClass(color: string): string {
  const colorMap: Record<string, string> = {
    blue: 'bg-blue-500',
    yellow: 'bg-yellow-500',
    orange: 'bg-orange-500',
    purple: 'bg-purple-500',
    indigo: 'bg-indigo-500',
    cyan: 'bg-cyan-500',
    emerald: 'bg-emerald-500',
    teal: 'bg-teal-500',
    green: 'bg-green-500',
    lime: 'bg-lime-500',
    sky: 'bg-sky-500',
    red: 'bg-red-500',
    pink: 'bg-pink-500',
    rose: 'bg-rose-500',
    fuchsia: 'bg-fuchsia-500',
    violet: 'bg-violet-500',
    slate: 'bg-slate-500',
    zinc: 'bg-zinc-500',
    stone: 'bg-stone-500',
    gray: 'bg-gray-500'
  }
  return colorMap[color] || 'bg-gray-500'
}

/**
 * 우선순위 색상 클래스
 */
function getPriorityColor(priority: string): string {
  switch (priority) {
    case 'high':
      return 'bg-red-100 text-red-800'
    case 'medium':
      return 'bg-yellow-100 text-yellow-800'
    case 'low':
      return 'bg-green-100 text-green-800'
    default:
      return 'bg-gray-100 text-gray-800'
  }
}

/**
 * 우선순위 라벨
 */
function getPriorityLabel(priority: string): string {
  switch (priority) {
    case 'high':
      return '높음'
    case 'medium':
      return '보통'
    case 'low':
      return '낮음'
    default:
      return priority
  }
}
