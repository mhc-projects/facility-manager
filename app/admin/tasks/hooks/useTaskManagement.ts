import { useState, useCallback } from 'react'
import { Task, TaskType, CreateTaskForm, calculateProgressPercentage } from '../types'
import { TokenManager } from '@/lib/api-client'

interface DelayCriteria {
  self: { delayed: number; risky: number }
  subsidy: { delayed: number; risky: number }
  as: { delayed: number; risky: number }
  etc: { delayed: number; risky: number }
}

const DEFAULT_CRITERIA: DelayCriteria = {
  self: { delayed: 7, risky: 14 },
  subsidy: { delayed: 14, risky: 20 },
  as: { delayed: 3, risky: 7 },
  etc: { delayed: 7, risky: 10 }
}

/**
 * 지연 기준을 서버에서 가져옴
 */
async function fetchDelayCriteria(): Promise<DelayCriteria> {
  try {
    const response = await fetch('/api/settings/delay-criteria')
    if (!response.ok) return DEFAULT_CRITERIA
    const result = await response.json()
    return result.data || DEFAULT_CRITERIA
  } catch {
    return DEFAULT_CRITERIA
  }
}

/**
 * 업무 유형에 맞는 기준 키 반환
 * TaskType에 dealer가 있지만 DelayCriteria에는 없으므로 etc로 처리
 */
function getCriteriaKey(type: TaskType): keyof DelayCriteria {
  if (type === 'self' || type === 'subsidy' || type === 'as' || type === 'etc') {
    return type
  }
  return 'etc'
}

/**
 * startDate 기준으로 지연 상태 계산
 */
function calcDelayStatus(
  startDate: string | undefined,
  taskType: TaskType,
  status: string,
  criteria: DelayCriteria
): { delayStatus: Task['delayStatus']; delayDays: number } {
  // 완료 상태는 on_time
  const completedStatuses = [
    'document_complete', 'subsidy_payment', 'as_completed',
    'dealer_payment_confirmed', 'etc_status', 'balance_payment'
  ]
  if (completedStatuses.includes(status)) {
    return { delayStatus: 'on_time', delayDays: 0 }
  }

  if (!startDate) return { delayStatus: 'on_time', delayDays: 0 }

  const start = new Date(startDate)
  const now = new Date()
  const elapsed = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))

  if (elapsed < 0) return { delayStatus: 'on_time', delayDays: 0 }

  const key = getCriteriaKey(taskType)
  const { delayed, risky } = criteria[key]

  if (elapsed >= delayed) {
    return { delayStatus: 'delayed', delayDays: elapsed - delayed }
  } else if (elapsed >= risky) {
    return { delayStatus: 'at_risk', delayDays: 0 }
  }
  return { delayStatus: 'on_time', delayDays: 0 }
}

interface UseTaskManagementReturn {
  tasks: Task[]
  isLoading: boolean
  isRefreshing: boolean
  lastRefresh: Date
  loadTasks: () => Promise<void>
  createTask: (form: CreateTaskForm, businessSearchTerm: string) => Promise<void>
  updateTask: (taskId: string, updates: Partial<Task>) => Promise<void>
  deleteTask: (taskId: string) => Promise<void>
  refreshTasks: () => Promise<void>
}

/**
 * 업무 관리 커스텀 훅
 *
 * 업무 CRUD 및 상태 관리를 담당하는 훅
 *
 * @example
 * ```tsx
 * const {
 *   tasks,
 *   isLoading,
 *   loadTasks,
 *   createTask,
 *   updateTask,
 *   deleteTask
 * } = useTaskManagement()
 * ```
 */
export function useTaskManagement(): UseTaskManagementReturn {
  const [tasks, setTasks] = useState<Task[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())

  /**
   * 업무 목록 로딩
   */
  const loadTasks = useCallback(async () => {
    try {
      setIsLoading(true)

      const token = TokenManager.getToken()
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      }

      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }

      // 업무 목록과 지연 기준을 병렬로 가져옴
      const [response, criteria] = await Promise.all([
        fetch('/api/facility-tasks', { method: 'GET', headers }),
        fetchDelayCriteria()
      ])

      if (!response.ok) {
        throw new Error('업무 목록을 불러오는데 실패했습니다.')
      }

      const result = await response.json()

      if (result.success && result.data?.tasks) {
        // 데이터베이스 형식을 UI 형식으로 변환
        const convertedTasks: Task[] = result.data.tasks.map((dbTask: any) => {
          const { delayStatus, delayDays } = calcDelayStatus(
            dbTask.start_date,
            dbTask.task_type,
            dbTask.status,
            criteria
          )
          return {
            id: dbTask.id,
            title: dbTask.title,
            businessName: dbTask.business_name,
            type: dbTask.task_type,
            status: dbTask.status,
            priority: dbTask.priority,
            assignee: dbTask.assignee || undefined,
            assignees: dbTask.assignees || [],
            startDate: dbTask.start_date || undefined,
            dueDate: dbTask.due_date || undefined,
            progressPercentage: calculateProgressPercentage(dbTask.task_type, dbTask.status),
            delayStatus,
            delayDays,
            createdAt: dbTask.created_at,
            description: dbTask.description || undefined,
            notes: dbTask.notes || undefined
          }
        })

        setTasks(convertedTasks)
        setLastRefresh(new Date())
      }
    } catch (error) {
      throw error
    } finally {
      setIsLoading(false)
    }
  }, [])

  /**
   * 업무 생성
   */
  const createTask = useCallback(async (form: CreateTaskForm, businessSearchTerm: string) => {
    try {
      // 필수 필드 검증
      if (form.type !== 'etc' && !businessSearchTerm.trim()) {
        throw new Error('사업장을 선택해주세요.')
      }
      if (!form.title.trim()) {
        throw new Error('업무명을 입력해주세요.')
      }

      // API 요청 데이터 준비
      const requestData = {
        title: form.title,
        business_name: businessSearchTerm || '기타',
        task_type: form.type,
        status: form.status,
        priority: form.priority,
        assignees: form.assignees,
        due_date: form.dueDate || null,
        description: form.description || null,
        notes: form.notes || null
      }

      const token = TokenManager.getToken()
      const response = await fetch('/api/facility-tasks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(requestData)
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || '업무 생성에 실패했습니다.')
      }

      const result = await response.json()

      // 지연 기준 가져와서 신규 업무 상태 계산
      const criteria = await fetchDelayCriteria()
      const { delayStatus, delayDays } = calcDelayStatus(
        form.startDate || undefined,
        result.data.task.task_type,
        result.data.task.status,
        criteria
      )

      // 로컬 상태 업데이트
      const newTask: Task = {
        id: result.data.task.id,
        title: result.data.task.title,
        businessName: result.data.task.business_name,
        type: result.data.task.task_type,
        status: result.data.task.status,
        priority: result.data.task.priority,
        assignee: result.data.task.assignee || undefined,
        assignees: result.data.task.assignees || [],
        startDate: form.startDate || undefined,
        dueDate: result.data.task.due_date || undefined,
        progressPercentage: calculateProgressPercentage(result.data.task.task_type, result.data.task.status),
        delayStatus,
        delayDays,
        createdAt: result.data.task.created_at,
        description: result.data.task.description || undefined,
        notes: result.data.task.notes || undefined
      }

      setTasks(prev => [newTask, ...prev])
    } catch (error) {
      throw error
    }
  }, [])

  /**
   * 업무 수정
   */
  const updateTask = useCallback(async (taskId: string, updates: Partial<Task>) => {
    try {
      // API 요청 데이터 준비
      const requestData = {
        id: taskId,
        title: updates.title,
        business_name: updates.businessName || '기타',
        task_type: updates.type,
        status: updates.status,
        priority: updates.priority,
        assignees: updates.assignees || [],
        start_date: updates.startDate || null,
        due_date: updates.dueDate || null,
        description: updates.description || null,
        notes: updates.notes || null
      }

      const token = TokenManager.getToken()
      const response = await fetch('/api/facility-tasks', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(requestData)
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || '업무 수정에 실패했습니다.')
      }

      const result = await response.json()

      // 지연 기준 가져와서 업데이트된 업무 상태 계산
      const criteria = await fetchDelayCriteria()

      // 로컬 상태 업데이트
      setTasks(prev => prev.map(task => {
        if (task.id !== taskId) return task
        const updatedTask = { ...task, ...updates }
        const { delayStatus, delayDays } = calcDelayStatus(
          updatedTask.startDate,
          updatedTask.type,
          updatedTask.status,
          criteria
        )
        return {
          ...updatedTask,
          createdAt: result.data.task.created_at,
          assignee: updates.assignees && updates.assignees.length > 0
            ? updates.assignees[0].name
            : undefined,
          delayStatus,
          delayDays
        }
      }))
    } catch (error) {
      throw error
    }
  }, [])

  /**
   * 업무 삭제
   */
  const deleteTask = useCallback(async (taskId: string) => {
    try {
      const token = TokenManager.getToken()
      const response = await fetch(`/api/facility-tasks?id=${taskId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        }
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || '업무 삭제에 실패했습니다.')
      }

      // 로컬 상태에서 제거
      setTasks(prev => prev.filter(t => t.id !== taskId))
    } catch (error) {
      throw error
    }
  }, [])

  /**
   * 업무 목록 새로고침
   */
  const refreshTasks = useCallback(async () => {
    setIsRefreshing(true)
    try {
      await loadTasks()
    } finally {
      setIsRefreshing(false)
    }
  }, [loadTasks])

  return {
    tasks,
    isLoading,
    isRefreshing,
    lastRefresh,
    loadTasks,
    createTask,
    updateTask,
    deleteTask,
    refreshTasks
  }
}
