'use client'

import { useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import AdminLayout from '@/components/ui/AdminLayout'
import { withAuth, useAuth } from '@/contexts/AuthContext'
import { TokenManager } from '@/lib/api-client'
import MultiAssigneeSelector, { SelectedAssignee } from '@/components/ui/MultiAssigneeSelector'
import TaskCardList from './components/TaskCardList'
import TaskCard from './components/TaskCard'
import TaskMobileModal from './components/TaskMobileModal'
import TaskHistoryTimeline from '@/components/TaskHistoryTimeline'
import BusinessInfoPanel from '@/components/tasks/BusinessInfoPanel'
import SubsidyActiveBadge from '@/components/tasks/SubsidyActiveBadge'
import BulkUploadModal from '@/components/tasks/BulkUploadModal'
import DuplicateTasksModal from '@/components/admin/DuplicateTasksModal'
import { useTaskNotesRealtime } from '@/hooks/useTaskNotesRealtime'
import { useBusinessInfoRealtime } from '@/hooks/useBusinessInfoRealtime'
// 🔄 공유 모듈에서 단계 정의 및 헬퍼 함수 import
import {
  TaskType,
  TaskStatus,
  TaskStep,
  selfSteps,
  subsidySteps,
  etcSteps,
  asSteps,
  dealerSteps,
  outsourcingSteps,
  getStepsForType,
  calculateProgressPercentage,
  getStatusLabel,
  getStatusColorClass
} from '@/lib/task-steps'
import {
  Plus,
  Search,
  Filter,
  MoreHorizontal,
  Calendar,
  User,
  Building2,
  AlertCircle,
  Clock,
  CheckCircle,
  PlayCircle,
  PauseCircle,
  Flag,
  ArrowRight,
  Edit,
  Trash2,
  Eye,
  FileX,
  X,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Phone,
  Check,
  Loader2,
  RefreshCw,
  RotateCcw,
  Users,
  Target,
  TrendingUp,
  FileText,
  History,
  Upload
} from 'lucide-react'

// 🔄 TaskType과 TaskStatus는 공유 모듈에서 import
type Priority = 'high' | 'medium' | 'low'

export interface Task {
  id: string
  title: string
  businessName?: string
  businessId?: string // 사업장 ID 추가
  localGovernment?: string // 지자체
  constructionReportDate?: string // 착공신고서 제출일
  businessInfo?: {
    address: string
    contact: string
    manager: string
  }
  type: TaskType
  status: TaskStatus
  priority: Priority
  assignee?: string // 기존 호환성
  assignees?: SelectedAssignee[] // 새로운 다중 담당자
  startDate?: string
  dueDate?: string
  progressPercentage?: number
  delayStatus?: 'on_time' | 'at_risk' | 'delayed' | 'overdue'
  delayDays?: number
  createdAt: string
  description?: string
  notes?: string
  // 보완 관련 필드
  supplementReason?: string
  supplementEvidence?: string
  supplementCompletedAt?: string
  stepStartedAt?: string
  _stepInfo?: {status: TaskStatus, label: string, color: string} // 전체 보기에서 올바른 단계 정보
  // 사업장 정보 연동 필드 (설치완료/부착통보/그린링크/미수금 컬럼용)
  progressStatus?: string
  installationDate?: string
  orderDate?: string
  attachmentCompletionSubmittedAt?: string
  greenlinkConfirmationSubmittedAt?: string
}

interface CreateTaskForm {
  title: string
  businessName: string
  type: TaskType
  status: TaskStatus
  priority: Priority
  assignee: string // 기존 호환성
  assignees: SelectedAssignee[] // 새로운 다중 담당자
  startDate: string
  dueDate: string
  description: string
  notes: string
}

interface BusinessOption {
  id: string
  name: string
  address: string
}

// 🔄 단계 정의 및 헬퍼 함수는 공유 모듈에서 import (lib/task-steps.ts)

function TaskManagementPage() {
  const { user } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [tasks, setTasks] = useState<Task[]>([])
  const [selectedType, setSelectedType] = useState<TaskType | 'all'>('all')
  const [selectedProgressStatus, setSelectedProgressStatus] = useState<string | 'all'>('all') // 진행구분 필터 (설정 연동)
  const [progressCategoryOrder, setProgressCategoryOrder] = useState<string[]>([]) // 설정 API 순서 (활성 항목만)
  const [searchTerm, setSearchTerm] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [selectedPriority, setSelectedPriority] = useState<Priority | 'all'>('all')
  const [selectedAssignee, setSelectedAssignee] = useState<string | 'all'>('all')
  const [selectedStatus, setSelectedStatus] = useState<TaskStatus | 'all'>('all') // 업무단계 필터
  const [selectedLocalGov, setSelectedLocalGov] = useState<string | 'all'>('all') // 지자체 필터
  const [showOnlyNoConstructionReport, setShowOnlyNoConstructionReport] = useState(false) // 착공신고서 미제출 필터
  const [assigneeFilterInitialized, setAssigneeFilterInitialized] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())
  const [taskReceivables, setTaskReceivables] = useState<Record<string, number>>({})
  const [isCompactMode, setIsCompactMode] = useState(false)
  const [showCompletedTasks, setShowCompletedTasks] = useState(false) // 🆕 완료된 업무 표시 여부
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createProgressStatus, setCreateProgressStatus] = useState('') // 등록 모달 진행구분 표시용
  const [showEditModal, setShowEditModal] = useState(false)
  const [showEditHistory, setShowEditHistory] = useState(false)
  const [showBulkUploadModal, setShowBulkUploadModal] = useState(false)
  const [showDuplicateModal, setShowDuplicateModal] = useState(false)
  const [duplicateGroups, setDuplicateGroups] = useState<any[]>([])
  const [duplicateSummary, setDuplicateSummary] = useState({ totalGroups: 0, totalDuplicates: 0, toDelete: 0 })
  const [isDuplicateLoading, setIsDuplicateLoading] = useState(false)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [memoInput, setMemoInput] = useState('')
  const [isMemoSubmitting, setIsMemoSubmitting] = useState(false)
  const [pendingMemo, setPendingMemo] = useState<{ content: string; author: string; createdAt: string } | null>(null)
  const [draggedTask, setDraggedTask] = useState<Task | null>(null)
  const [mobileModalOpen, setMobileModalOpen] = useState(false)
  const [mobileSelectedTask, setMobileSelectedTask] = useState<Task | null>(null)
  const [createTaskForm, setCreateTaskForm] = useState<CreateTaskForm>({
    title: '',
    businessName: '',
    type: 'etc',
    status: 'etc_status',
    priority: 'medium',
    assignee: '',
    assignees: [],
    startDate: '',
    dueDate: '',
    description: '',
    notes: ''
  })
  const [availableBusinesses, setAvailableBusinesses] = useState<BusinessOption[]>([])
  const [businessSearchTerm, setBusinessSearchTerm] = useState('')
  const [showBusinessDropdown, setShowBusinessDropdown] = useState(false)
  const [editBusinessSearchTerm, setEditBusinessSearchTerm] = useState('')
  const [showEditBusinessDropdown, setShowEditBusinessDropdown] = useState(false)
  const [selectedBusinessIndex, setSelectedBusinessIndex] = useState(-1)
  const [editSelectedBusinessIndex, setEditSelectedBusinessIndex] = useState(-1)

  // 🆕 활성 보조금 공고 상태
  const [activeSubsidies, setActiveSubsidies] = useState<Record<string, any>>({})

  // 페이지네이션 상태
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage] = useState(10) // 업무 목록 페이지당 10개

  const searchTimeoutRef = useRef<NodeJS.Timeout>()
  const refreshIntervalRef = useRef<NodeJS.Timeout>()
  const businessSearchTimeoutRef = useRef<NodeJS.Timeout>()

  // Textarea refs for auto-resize
  const editDescriptionRef = useRef<HTMLTextAreaElement>(null)
  const editNotesRef = useRef<HTMLTextAreaElement>(null)
  const createDescriptionRef = useRef<HTMLTextAreaElement>(null)
  const createNotesRef = useRef<HTMLTextAreaElement>(null)

  // 실제 업무 데이터 로딩
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

      const response = await fetch('/api/facility-tasks', {
        method: 'GET',
        headers
      })

      if (!response.ok) {
        throw new Error('업무 목록을 불러오는데 실패했습니다.')
      }

      const result = await response.json()
      console.log('✅ [API] 업무 목록 로딩 성공:', result.data?.tasks?.length || 0, '개')
      console.log('✅ [API] Response success:', result.success, 'has tasks:', !!result.data?.tasks)

      if (result.success && result.data?.tasks) {
        // 🔍 업무 타입별 분포 디버깅
        const typeDistribution = result.data.tasks.reduce((acc: any, t: any) => {
          acc[t.task_type] = (acc[t.task_type] || 0) + 1
          return acc
        }, {})
        console.log('📊 [DATA LOAD] 타입별 분포:', typeDistribution)

        // 자비 업무 상세 확인
        const selfTasks = result.data.tasks.filter((t: any) => t.task_type === 'self')
        console.log('📋 [DATA LOAD] 자비 업무 개수:', selfTasks.length)
        if (selfTasks.length > 0) {
          console.log('📋 [DATA LOAD] 자비 업무 샘플 (최대 5개):', selfTasks.slice(0, 5).map((t: any) => ({
            id: t.id.slice(0, 8),
            business: t.business_name,
            type: t.task_type,
            status: t.status
          })))
        }

        // 데이터베이스 형식을 UI 형식으로 변환
        const convertedTasks: Task[] = result.data.tasks.map((dbTask: any) => ({
          id: dbTask.id,
          title: dbTask.title,
          businessName: dbTask.business_name,
          businessId: dbTask.business_id, // businessId 매핑 추가
          localGovernment: dbTask.local_government,
          manufacturer: dbTask.manufacturer || undefined,
          constructionReportDate: dbTask.construction_report_date, // 착공신고서 제출일 매핑 추가
          type: dbTask.task_type,
          status: dbTask.status,
          priority: dbTask.priority,
          assignee: dbTask.assignee || undefined,
          assignees: dbTask.assignees || [],
          startDate: dbTask.start_date || undefined,
          dueDate: dbTask.due_date || undefined,
          progressPercentage: calculateProgressPercentage(dbTask.task_type, dbTask.status),
          delayStatus: 'on_time',
          delayDays: 0,
          createdAt: dbTask.created_at,
          description: dbTask.description || undefined,
          notes: dbTask.notes || undefined,
          // 사업장 정보 연동 필드
          progressStatus: dbTask.progress_status || undefined,
          installationDate: dbTask.installation_date || undefined,
          orderDate: dbTask.order_date || undefined,
          attachmentCompletionSubmittedAt: dbTask.attachment_completion_submitted_at || undefined,
          greenlinkConfirmationSubmittedAt: dbTask.greenlink_confirmation_submitted_at || undefined,
        }))

        console.log('✅ [STATE] setTasks 호출:', convertedTasks.length, '개')
        console.log('✅ [STATE] 타입별 분포:', convertedTasks.reduce((acc: any, t) => {
          acc[t.type] = (acc[t.type] || 0) + 1
          return acc
        }, {}))

        setTasks(convertedTasks)
        setLastRefresh(new Date())
      }
    } catch (error) {
      console.error('❌ 업무 목록 로딩 실패:', error)
      alert('업무 목록을 불러오는 중 오류가 발생했습니다.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  // 중복 업무 조회
  const fetchDuplicates = async () => {
    setIsDuplicateLoading(true)
    try {
      const token = TokenManager.getToken()
      const response = await fetch('/api/admin/tasks/duplicates', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await response.json()
      setDuplicateGroups(data.duplicates)
      setDuplicateSummary(data.summary)
      return data
    } catch (error) {
      console.error('중복 업무 조회 실패:', error)
      alert('중복 업무를 불러오는 중 오류가 발생했습니다.')
      return { duplicates: [], summary: { totalGroups: 0, totalDuplicates: 0, toDelete: 0 } }
    } finally {
      setIsDuplicateLoading(false)
    }
  }

  // 중복 업무 삭제
  const deleteDuplicates = async (taskIds: string[]) => {
    try {
      const token = TokenManager.getToken()
      const response = await fetch('/api/admin/tasks/duplicates', {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ taskIds })
      })
      const result = await response.json()
      if (result.success > 0) {
        await fetchTasks() // 업무 목록 새로고침
      }
      return result
    } catch (error) {
      console.error('중복 업무 삭제 실패:', error)
      return { success: 0, failed: taskIds.length }
    }
  }

  // 중복 관리 모달 열기
  const handleOpenDuplicateModal = useCallback(async () => {
    const { summary } = await fetchDuplicates()
    if (summary.totalGroups === 0) {
      alert('중복된 업무가 없습니다.')
      return
    }
    setShowDuplicateModal(true)
  }, [])

  // 🆕 활성 보조금 공고 로딩
  const loadActiveSubsidies = useCallback(async () => {
    try {
      console.log('🔍 [TASKS] 활성 보조금 공고 로딩 시작')
      const response = await fetch('/api/active-subsidies')
      const data = await response.json()

      if (data.success && data.data?.activeRegions) {
        // 지자체명을 키로 하는 Map 생성
        const subsidiesMap = data.data.activeRegions.reduce((acc: any, subsidy: any) => {
          acc[subsidy.region_name] = subsidy
          return acc
        }, {})

        setActiveSubsidies(subsidiesMap)
        console.log(`✅ [TASKS] ${data.data.activeRegions.length}개 지자체 활성 공고 로딩 완료`)
      }
    } catch (error) {
      console.error('❌ [TASKS] 활성 보조금 공고 로딩 실패:', error)
    }
  }, [])

  // 페이지 로드 시 데이터 로딩
  useEffect(() => {
    loadTasks()
    loadActiveSubsidies()
    // 진행구분 순서 로드 (설정 페이지와 동기화)
    fetch('/api/settings/progress-categories', { cache: 'no-store' })
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          setProgressCategoryOrder(
            (data.data as { name: string; is_active: boolean; sort_order: number }[])
              .filter(c => c.is_active)
              .sort((a, b) => a.sort_order - b.sort_order)
              .map(c => c.name)
          )
        }
      })
      .catch(() => {})
  }, [loadTasks, loadActiveSubsidies])

  // 미수금 batch API 호출 (tasks 로드 완료 후)
  useEffect(() => {
    if (isLoading || !tasks.length) return
    const businessIds = [...new Set(tasks.map(t => t.businessId).filter(Boolean))] as string[]
    if (!businessIds.length) return

    const fetchReceivables = async () => {
      try {
        const response = await fetch('/api/business-invoices/batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: businessIds }),
        })
        const result = await response.json()
        if (result.success && result.data) {
          setTaskReceivables(result.data)
        }
      } catch (error) {
        console.error('❌ [TASKS] 미수금 batch 로딩 실패:', error)
      }
    }
    fetchReceivables()
  }, [isLoading, tasks])

  // ⚡ facility_tasks Realtime 구독: 다른 페이지/사용자의 메모 수정을 즉시 반영
  useTaskNotesRealtime({
    enabled: true,
    onUpdate: (updatedTask) => {
      // tasks 목록 상태 업데이트
      setTasks(prev => prev.map(t =>
        t.id === updatedTask.id
          ? { ...t, notes: updatedTask.notes ?? undefined }
          : t
      ))
      // 모바일 상세모달이 해당 업무를 보고 있다면 함께 갱신
      setMobileSelectedTask(prev =>
        prev?.id === updatedTask.id
          ? { ...prev, notes: updatedTask.notes ?? undefined }
          : prev
      )
    }
  })

  // 🆕 5분마다 활성 보조금 공고 자동 갱신
  useEffect(() => {
    const interval = setInterval(() => {
      loadActiveSubsidies()
    }, 5 * 60 * 1000) // 5분

    return () => clearInterval(interval)
  }, [loadActiveSubsidies])

  // ⚡ openModal 파라미터 처리 (최적화: useLayoutEffect로 즉시 실행)
  useLayoutEffect(() => {
    const openModalId = searchParams.get('openModal')

    if (openModalId && tasks.length > 0) {
      // 해당 업무 찾기
      const task = tasks.find(t => t.id === openModalId)
      if (task) {
        // ⚡ 상태 업데이트를 한 번에 배치 처리
        setEditingTask(task)
        setShowEditModal(true)
        // ✅ 사업장명 검색어도 함께 설정 (입력 필드 표시용)
        setEditBusinessSearchTerm(task.businessName || '')
      }

      // URL 정리 (비동기로 처리하여 렌더링 블로킹 방지)
      requestAnimationFrame(() => {
        router.replace('/admin/tasks', { scroll: false })
      })
    }
  }, [searchParams, tasks, router])


  // 필터 초기화는 사용자가 직접 선택하도록 변경 - 기본은 "전체"로 유지
  // useEffect(() => {
  //   if (user && user.name && !assigneeFilterInitialized) {
  //     setSelectedAssignee(user.name)
  //     setAssigneeFilterInitialized(true)
  //   }
  // }, [user, assigneeFilterInitialized])

  // 사업장 목록 로딩
  const loadBusinesses = useCallback(async () => {
    try {
      const response = await fetch('/api/business-info-direct?includeFileStats=true')
      if (!response.ok) {
        throw new Error('사업장 데이터를 불러오는데 실패했습니다.')
      }
      const data = await response.json()

      if (data.success && data.data && Array.isArray(data.data)) {
        const businessOptions = data.data.map((business: any) => ({
          id: business.id,
          name: business.business_name,
          address: business.address || '',
          progress_status: business.progress_status || '' // 진행구분 추가
        }))
        setAvailableBusinesses(businessOptions)
        console.log(`✅ ${businessOptions.length}개 사업장 정보 로딩 완료`)
      }
    } catch (error) {
      console.error('Failed to load businesses:', error)
    }
  }, [])

  // 초기 로딩
  useEffect(() => {
    loadBusinesses()

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current)
      }
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }
      if (businessSearchTimeoutRef.current) {
        clearTimeout(businessSearchTimeoutRef.current)
      }
    }
  }, [loadBusinesses])

  // Auto-resize textareas when modals open with existing content
  useEffect(() => {
    const resizeTextarea = (textarea: HTMLTextAreaElement | null) => {
      if (textarea && textarea.value) {
        textarea.style.height = 'auto'
        textarea.style.height = Math.min(textarea.scrollHeight, window.innerHeight * 0.5) + 'px'
      }
    }

    if (showEditModal && editingTask) {
      // Delay to ensure DOM is ready
      setTimeout(() => {
        // 업무 설명: 저장된 높이가 있으면 복원, 없으면 내용에 맞춰 자동 조정
        const descTextarea = editDescriptionRef.current
        if (descTextarea) {
          let savedHeight: string | null = null
          try {
            savedHeight = localStorage.getItem(`task-desc-height-${editingTask.id}`)
          } catch {}
          if (savedHeight) {
            descTextarea.style.height = savedHeight
          } else {
            resizeTextarea(descTextarea)
          }
        }
        resizeTextarea(editNotesRef.current)
      }, 0)
    }

    if (showCreateModal) {
      setTimeout(() => {
        resizeTextarea(createDescriptionRef.current)
        resizeTextarea(createNotesRef.current)
      }, 0)
    }
  }, [showEditModal, editingTask, showCreateModal])

  // 수동 새로고침 (데이터 다시 로딩)
  const refreshTasks = useCallback(async () => {
    setIsRefreshing(true)
    try {
      await loadTasks()
    } catch (error) {
      console.error('새로고침 실패:', error)
    } finally {
      setIsRefreshing(false)
    }
  }, [loadTasks])

  // 사업장 정보 변경 시 업무 목록 자동 갱신 (사업장관리에서 이름·주소 등 수정 즉시 반영)
  useBusinessInfoRealtime({ onUpdate: refreshTasks })

  // 업무 삭제 핸들러
  const handleDeleteTask = useCallback(async (taskId: string) => {
    if (!confirm('이 업무를 삭제하시겠습니까?')) {
      return false // 취소 시 false 반환
    }

    try {
      console.log('🗑️ 업무 삭제 요청:', taskId)

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

      const result = await response.json()
      console.log('✅ 업무 삭제 성공:', result)

      // 삭제된 업무의 사업장명 저장 (이벤트 발송용)
      const deletedTask = tasks.find(t => t.id === taskId)
      const deletedBusinessName = deletedTask?.businessName

      // 로컬 상태에서 제거
      setTasks(prev => prev.filter(t => t.id !== taskId))

      // 📡 이벤트 발송: 업무 삭제 알림 (사업장 모달 실시간 동기화)
      if (deletedBusinessName) {
        const taskUpdateEvent = new CustomEvent('task-updated', {
          detail: {
            businessName: deletedBusinessName,
            taskId: taskId,
            action: 'deleted'
          }
        })
        window.dispatchEvent(taskUpdateEvent)
        console.log('📡 [EVENT] 업무 삭제 이벤트 발송:', deletedBusinessName)
      }

      // 수정 모달이 열려있다면 닫기
      if (editingTask?.id === taskId) {
        setShowEditModal(false)
        setEditingTask(null)
        setEditBusinessSearchTerm('')
        setShowEditBusinessDropdown(false)
      }

      // 상세 모달이 열려있다면 닫기
      if (mobileSelectedTask?.id === taskId) {
        setMobileModalOpen(false)
        setMobileSelectedTask(null)
      }

      alert('업무가 삭제되었습니다.')
      return true // 성공 시 true 반환
    } catch (error) {
      console.error('Failed to delete task:', error)
      alert(`업무 삭제 중 오류가 발생했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`)
      return false // 실패 시 false 반환
    }
  }, [mobileSelectedTask])

  // 필터 초기화 함수
  const handleResetFilters = useCallback(() => {
    setSelectedProgressStatus('all')
    setSelectedType('all')
    setSelectedPriority('all')
    setSelectedAssignee('all')
    setSelectedStatus('all')
    setSelectedLocalGov('all')
    setShowOnlyNoConstructionReport(false)
    setShowCompletedTasks(false)
    setSearchTerm('')
  }, [])

  // 업무 완료 핸들러 (다음 단계로 자동 이동)
  const handleCompleteTask = useCallback(async (taskId: string) => {
    try {
      console.log('✅ 업무 완료 요청:', taskId)

      const token = TokenManager.getToken()
      const response = await fetch('/api/facility-tasks/advance', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ taskId })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || '다음 단계로 이동하는 데 실패했습니다.')
      }

      const result = await response.json()
      console.log('✅ 다음 단계로 이동 성공:', result)

      // 업무 목록 새로고침
      await refreshTasks()

      alert(`${result.message}\n새 단계: ${result.newStatus}`)
    } catch (error) {
      console.error('Failed to complete task:', error)
      alert(`업무 완료 처리 중 오류가 발생했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`)
    }
  }, [refreshTasks])

  // 디바운스된 검색
  const debouncedSearch = useCallback((term: string) => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }
    searchTimeoutRef.current = setTimeout(() => {
      setSearchTerm(term)
    }, 300)
  }, [])

  // 사업장 자동완성 검색
  const handleBusinessSearch = useCallback((term: string, isEdit = false) => {
    if (isEdit) {
      setEditBusinessSearchTerm(term)
      setShowEditBusinessDropdown(term.length >= 2)
      setEditSelectedBusinessIndex(-1)
    } else {
      setBusinessSearchTerm(term)
      setShowBusinessDropdown(term.length >= 2)
      setSelectedBusinessIndex(-1)
    }
  }, [])

  // 필터링된 사업장 목록
  const filteredBusinesses = useMemo(() => {
    return availableBusinesses.filter(business =>
      business.name?.toLowerCase().includes(businessSearchTerm.toLowerCase()) ||
      business.address?.toLowerCase().includes(businessSearchTerm.toLowerCase())
    ).slice(0, 10) // 최대 10개만 표시
  }, [availableBusinesses, businessSearchTerm])

  // 수정용 필터링된 사업장 목록
  const filteredEditBusinesses = useMemo(() => {
    return availableBusinesses.filter(business =>
      business.name?.toLowerCase().includes(editBusinessSearchTerm.toLowerCase()) ||
      business.address?.toLowerCase().includes(editBusinessSearchTerm.toLowerCase())
    ).slice(0, 10)
  }, [availableBusinesses, editBusinessSearchTerm])

  // 키보드 네비게이션 핸들러
  const handleBusinessKeyDown = useCallback((e: React.KeyboardEvent, isEdit = false) => {
    const businesses = isEdit ? filteredEditBusinesses : filteredBusinesses
    const selectedIndex = isEdit ? editSelectedBusinessIndex : selectedBusinessIndex
    const setSelectedIndex = isEdit ? setEditSelectedBusinessIndex : setSelectedBusinessIndex

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const newIndex = selectedIndex < businesses.length - 1 ? selectedIndex + 1 : 0
      setSelectedIndex(newIndex)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      const newIndex = selectedIndex > 0 ? selectedIndex - 1 : businesses.length - 1
      setSelectedIndex(newIndex)
    } else if ((e.key === 'Enter' || e.key === 'Tab') && selectedIndex >= 0) {
      e.preventDefault()
      const selectedBusiness = businesses[selectedIndex]
      handleBusinessSelect(selectedBusiness, isEdit)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      if (isEdit) {
        setShowEditBusinessDropdown(false)
        setEditSelectedBusinessIndex(-1)
      } else {
        setShowBusinessDropdown(false)
        setSelectedBusinessIndex(-1)
      }
    }
  }, [filteredBusinesses, filteredEditBusinesses, selectedBusinessIndex, editSelectedBusinessIndex])

  // 사업장 선택
  // task_type은 서버 View(facility_tasks_with_business)에서 progress_status 기반으로 자동 파생됨
  // 프론트엔드에서는 UI 단계 표시 목적으로만 type을 유지
  const handleBusinessSelect = useCallback((business: BusinessOption, isEdit = false) => {
    // UI 표시용 type 파생 (단계 목록 렌더링에만 사용, API 전송 안 함)
    // 사업장관리 진행구분 → 업무타입 매핑 (Migration SQL의 View 로직과 동일하게 유지)
    const deriveTypeForUI = (progressStatus?: string): TaskType => {
      if (!progressStatus) return 'etc'
      if (progressStatus.includes('보조금')) return 'subsidy'  // 보조금, 보조금 동시진행, 보조금 추가승인
      if (progressStatus.includes('자비')) return 'self'
      if (progressStatus === 'AS') return 'as'
      if (progressStatus.includes('외주')) return 'outsourcing' // 외주설치
      if (progressStatus.includes('대리점')) return 'dealer'
      // 진행불가, 확인필요 → etc
      return 'etc'
    }

    const uiType = deriveTypeForUI(business.progress_status)

    if (isEdit && editingTask) {
      setEditingTask(prev => prev ? {
        ...prev,
        businessName: business.name,
        businessId: business.id,
        type: uiType
      } : null)
      setEditBusinessSearchTerm(business.name)
      setShowEditBusinessDropdown(false)
      setEditSelectedBusinessIndex(-1)
    } else {
      setCreateProgressStatus(business.progress_status || '') // 사업장 진행구분 자동 표시
      setCreateTaskForm(prev => ({
        ...prev,
        businessName: business.name,
        businessId: business.id,
        type: uiType,
        // 타입에 맞게 초기 단계도 재설정
        status: uiType === 'self' ? 'customer_contact' :
                uiType === 'subsidy' ? 'customer_contact' :
                uiType === 'dealer' ? 'dealer_order_received' :
                uiType === 'as' ? 'as_customer_contact' : 'etc_status'
      }))
      setBusinessSearchTerm(business.name)
      setShowBusinessDropdown(false)
      setSelectedBusinessIndex(-1)
    }
  }, [editingTask])

  // 컴팩트 모드에서 표시할 카드들 계산
  const getDisplayTasks = useCallback((tasks: Task[]) => {
    if (isCompactMode) {
      return tasks.slice(0, 2) // 컴팩트 모드: 최대 2개
    } else {
      return tasks.slice(0, 10) // 펼침 모드: 최대 10개
    }
  }, [isCompactMode])

  // 지연 상태 계산 함수
  const calculateDelayStatus = useCallback((task: Task): { delayStatus: string, delayDays: number } => {
    if (!task.startDate) {
      return { delayStatus: 'on_time', delayDays: 0 }
    }

    const startDate = new Date(task.startDate)
    const currentDate = new Date()

    // 날짜 유효성 검증
    if (isNaN(startDate.getTime())) {
      return { delayStatus: 'on_time', delayDays: 0 }
    }

    const daysSinceStart = Math.floor((currentDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))

    // 업무 타입별 임계값 설정
    const thresholds = {
      self: { warning: 7, critical: 14, overdue: 21 },
      subsidy: { warning: 10, critical: 20, overdue: 30 },
      dealer: { warning: 7, critical: 14, overdue: 21 },
      etc: { warning: 5, critical: 10, overdue: 15 },
      as: { warning: 3, critical: 7, overdue: 10 }
    }

    const threshold = thresholds[task.type] || thresholds.etc

    // 마감일 체크
    if (task.dueDate) {
      const dueDate = new Date(task.dueDate)

      // 마감일 유효성 검증
      if (!isNaN(dueDate.getTime())) {
        const daysUntilDue = Math.floor((dueDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24))

        if (daysUntilDue < 0) {
          return { delayStatus: 'overdue', delayDays: Math.abs(daysUntilDue) }
        }
      }
    }

    // 시작일 기준 지연 계산
    if (daysSinceStart >= threshold.overdue) {
      return { delayStatus: 'overdue', delayDays: daysSinceStart - threshold.overdue }
    } else if (daysSinceStart >= threshold.critical) {
      return { delayStatus: 'delayed', delayDays: daysSinceStart - threshold.critical }
    } else if (daysSinceStart >= threshold.warning) {
      return { delayStatus: 'at_risk', delayDays: 0 }
    }

    return { delayStatus: 'on_time', delayDays: 0 }
  }, [])

  // 업무 목록 실시간 지연 상태 업데이트
  const tasksWithDelayStatus = useMemo((): Task[] => {
    console.log('🔄 [MEMO] tasksWithDelayStatus 계산 중... tasks.length:', tasks.length)
    const result: Task[] = tasks.map(task => {
      const { delayStatus, delayDays } = calculateDelayStatus(task)
      return {
        ...task,
        delayStatus: delayStatus as Task['delayStatus'],
        delayDays
      }
    })
    console.log('🔄 [MEMO] tasksWithDelayStatus 완료:', result.length, '개')
    return result
  }, [tasks, calculateDelayStatus])

  // 진행구분 필터 옵션: 설정 API 활성 항목 전체 표시 (순서 유지)
  // 설정에 없는 레거시 값은 실제 업무에 있을 경우에만 뒤에 추가
  const progressStatusOptions = useMemo(() => {
    if (progressCategoryOrder.length > 0) {
      const fromTasks = new Set(tasks.map(t => t.progressStatus || '').filter(Boolean))
      const result = [...progressCategoryOrder] // 설정 활성 항목 전체
      fromTasks.forEach(v => { if (!progressCategoryOrder.includes(v)) result.push(v) }) // 레거시 값 추가
      return result
    }
    // 설정 미로드 시 실제 업무 값만
    return [...new Set(tasks.map(t => t.progressStatus || '').filter(Boolean))]
  }, [tasks, progressCategoryOrder])

  // 새 업무 등록 모달 진행구분 변경 핸들러
  const handleCreateProgressStatusChange = useCallback((value: string) => {
    const deriveType = (ps: string): TaskType => {
      if (ps.includes('보조금')) return 'subsidy'
      if (ps.includes('자비')) return 'self'
      if (ps === 'AS') return 'as'
      if (ps.includes('외주')) return 'outsourcing'
      if (ps.includes('대리점')) return 'dealer'
      return 'etc'
    }
    const derivedType = deriveType(value)
    setCreateProgressStatus(value)
    setCreateTaskForm(prev => ({
      ...prev,
      type: derivedType,
      status: derivedType === 'self' ? 'customer_contact' :
              derivedType === 'subsidy' ? 'customer_contact' :
              derivedType === 'dealer' ? 'dealer_order_received' :
              derivedType === 'as' ? 'as_customer_contact' :
              'etc_status'
    }))
    // 진행구분 변경 시 사업장 검색어 초기화 (기타 선택 시 사업장 불필요)
    if (derivedType === 'etc') {
      setBusinessSearchTerm('')
    }
  }, [])

  // 진행구분 변경 핸들러 — selectedType도 함께 파생
  const handleProgressStatusChange = useCallback((value: string) => {
    setSelectedProgressStatus(value)
    if (value === 'all') {
      setSelectedType('all')
    } else {
      const deriveType = (ps: string): TaskType => {
        if (ps.includes('보조금')) return 'subsidy'
        if (ps.includes('자비')) return 'self'
        if (ps === 'AS') return 'as'
        if (ps.includes('외주')) return 'outsourcing'
        if (ps.includes('대리점')) return 'dealer'
        return 'etc'
      }
      setSelectedType(deriveType(value))
    }
    setSelectedStatus('all')
  }, [])

  // 필터링된 업무 목록
  const filteredTasks = useMemo(() => {
    console.log('🔍 [FILTER] 필터링 시작... tasksWithDelayStatus.length:', tasksWithDelayStatus.length)
    console.log('🔍 [FILTER] 필터 조건:', {
      selectedType,
      selectedPriority,
      selectedAssignee,
      selectedStatus,
      selectedLocalGov,
      showCompletedTasks,
      showOnlyNoConstructionReport
    })

    // 일반 필터링 (완료업무 필터에 따라 완료/미완료 업무 표시)
    const result = tasksWithDelayStatus.filter(task => {
      // 완료 업무 필터: true면 완료된 업무만, false면 미완료 업무만
      if (showCompletedTasks) {
        if (task.progressPercentage !== 100) return false
      } else {
        if (task.progressPercentage === 100) return false
      }

      const matchesSearch = searchTerm === '' ||
        task.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        task.businessName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        task.assignee?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        task.localGovernment?.toLowerCase().includes(searchTerm.toLowerCase())

      // 진행구분 필터: progressStatus 직접 비교 (설정 연동)
      const matchesType = selectedProgressStatus === 'all' || task.progressStatus === selectedProgressStatus
      const matchesPriority = selectedPriority === 'all' || task.priority === selectedPriority
      // 다중 담당자 지원: assignees 배열과 기존 assignee 필드 모두 확인
      const matchesAssignee = selectedAssignee === 'all' ||
        task.assignee === selectedAssignee ||
        (task.assignees && Array.isArray(task.assignees) &&
         task.assignees.some((assignee: any) => assignee.name === selectedAssignee))

      // 업무단계 필터
      const matchesStatus = selectedStatus === 'all' || task.status === selectedStatus

      // 지자체 필터
      const matchesLocalGov = selectedLocalGov === 'all' || task.localGovernment === selectedLocalGov

      // 착공신고서 미제출 필터
      const matchesConstructionReport = !showOnlyNoConstructionReport || !task.constructionReportDate

      const passed = matchesSearch && matchesType && matchesPriority && matchesAssignee &&
                     matchesStatus && matchesLocalGov && matchesConstructionReport

      // 디버깅: 자비 타입이고 필터링에 실패한 경우 로그
      if (task.type === 'self' && !passed) {
        console.log('❌ [FILTER] 자비 업무 필터링 실패:', {
          id: task.id.slice(0, 8),
          business: task.businessName,
          progress: task.progressPercentage,
          matchesType,
          matchesPriority,
          matchesAssignee,
          matchesStatus,
          matchesLocalGov,
          matchesConstructionReport
        })
      }

      return passed
    })

    console.log('🔍 [FILTER] 필터링 완료:', result.length, '개')
    return result
  }, [tasksWithDelayStatus, searchTerm, selectedProgressStatus, selectedType, selectedPriority, selectedAssignee,
      showCompletedTasks, selectedStatus, selectedLocalGov, showOnlyNoConstructionReport])

  // 칸반 보드용 필터링 (완료 업무도 항상 포함)
  const kanbanTasks = useMemo(() => {
    return tasksWithDelayStatus.filter(task => {
      const matchesSearch = searchTerm === '' ||
        task.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        task.businessName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        task.assignee?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        task.localGovernment?.toLowerCase().includes(searchTerm.toLowerCase())

      // 진행구분 필터: progressStatus 직접 비교 (설정 연동)
      const matchesType = selectedProgressStatus === 'all' || task.progressStatus === selectedProgressStatus
      const matchesPriority = selectedPriority === 'all' || task.priority === selectedPriority
      const matchesAssignee = selectedAssignee === 'all' ||
        task.assignee === selectedAssignee ||
        (task.assignees && Array.isArray(task.assignees) &&
         task.assignees.some((assignee: any) => assignee.name === selectedAssignee))
      const matchesStatus = selectedStatus === 'all' || task.status === selectedStatus
      const matchesLocalGov = selectedLocalGov === 'all' || task.localGovernment === selectedLocalGov
      const matchesConstructionReport = !showOnlyNoConstructionReport || !task.constructionReportDate

      return matchesSearch && matchesType && matchesPriority && matchesAssignee &&
             matchesStatus && matchesLocalGov && matchesConstructionReport
    })
  }, [tasksWithDelayStatus, searchTerm, selectedProgressStatus, selectedType, selectedPriority, selectedAssignee,
      selectedStatus, selectedLocalGov, showOnlyNoConstructionReport])

  // 페이지네이션을 위한 현재 페이지 업무 목록
  const paginatedTasks = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage
    const endIndex = startIndex + itemsPerPage
    return filteredTasks.slice(startIndex, endIndex)
  }, [filteredTasks, currentPage, itemsPerPage])

  // 전체 페이지 수 계산
  const totalPages = Math.ceil(filteredTasks.length / itemsPerPage)

  // 검색/필터 변경 시 첫 페이지로 이동
  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, selectedProgressStatus, selectedType, selectedPriority, selectedAssignee,
      selectedStatus, selectedLocalGov, showOnlyNoConstructionReport])

  // 상태별 업무 그룹화 (칸반용: 완료 업무 포함)
  const tasksByStatus = useMemo(() => {
    console.log('🔍 [FILTER DEBUG] ==================')
    console.log('🎯 selectedType:', selectedType)
    console.log('📊 kanbanTasks count:', kanbanTasks.length)
    console.log('📦 kanbanTasks types distribution:',
      kanbanTasks.reduce((acc: any, t) => {
        acc[t.type] = (acc[t.type] || 0) + 1
        return acc
      }, {})
    )
    if (kanbanTasks.length > 0) {
      console.log('📋 Sample tasks:', kanbanTasks.slice(0, 3).map(t => ({
        id: t.id.slice(0, 8),
        type: t.type,
        status: t.status,
        business: t.businessName
      })))
    }
    console.log('==================')

    // 완료업무 필터 활성화 시: 완료 업무만 표시, 기본: 전체 표시 (완료 포함)
    const activeTasks = showCompletedTasks
      ? kanbanTasks.filter(task => task.progressPercentage === 100)
      : kanbanTasks

    const allTypeSteps = selectedType === 'all' ? [...selfSteps, ...subsidySteps, ...dealerSteps, ...etcSteps] :
                  selectedType === 'self' ? selfSteps :
                  selectedType === 'subsidy' ? subsidySteps :
                  selectedType === 'dealer' ? dealerSteps :
                  selectedType === 'etc' ? etcSteps : selfSteps

    // 완료업무 필터 시: 각 타입의 마지막 단계만 표시
    const steps = showCompletedTasks ? (() => {
      if (selectedType === 'all') {
        // 전체 보기: 각 타입의 마지막 단계 수집
        return [
          selfSteps[selfSteps.length - 1],
          subsidySteps[subsidySteps.length - 1],
          dealerSteps[dealerSteps.length - 1],
          etcSteps[etcSteps.length - 1],
          asSteps[asSteps.length - 1],
        ]
      } else {
        // 개별 타입: 해당 타입의 마지막 단계만
        return [allTypeSteps[allTypeSteps.length - 1]]
      }
    })() : allTypeSteps

    // 전체 보기일 때 중복 단계 제거
    const uniqueSteps = selectedType === 'all' && !showCompletedTasks ? (() => {
      const stepMap = new Map<string, typeof steps[0]>()
      steps.forEach(step => {
        if (!stepMap.has(step.label)) {
          stepMap.set(step.label, step)
        }
      })
      return Array.from(stepMap.values())
    })() : steps

    const grouped = {} as Record<TaskStatus, Task[]>

    if (selectedType === 'all') {
      // 전체 보기일 때: type+status를 모두 고려하여 올바른 단계에 배치
      uniqueSteps.forEach(uniqueStep => {
        const tasksForThisStep: Task[] = []

        activeTasks.forEach(task => {
          // 업무의 실제 타입에 맞는 단계 정보를 찾기
          const correctSteps = task.type === 'self' ? selfSteps :
                             task.type === 'subsidy' ? subsidySteps :
                             task.type === 'dealer' ? dealerSteps :
                             task.type === 'etc' ? etcSteps : asSteps

          // 해당 타입의 단계 중에서 현재 상태와 일치하는 단계 찾기
          const correctStep = correctSteps.find(s => s.status === task.status)

          // 올바른 단계가 있고, 그 단계의 label이 현재 처리 중인 uniqueStep의 label과 같다면 포함
          if (correctStep && correctStep.label === uniqueStep.label) {
            // 업무에 올바른 단계 정보 첨부
            const taskWithCorrectStep = {
              ...task,
              _stepInfo: correctStep
            }
            tasksForThisStep.push(taskWithCorrectStep)
          }
        })

        // 업무 ID 기준 중복 제거 및 등록 순서로 정렬
        const uniqueTasksMap = new Map<string, Task>()
        tasksForThisStep.forEach(task => {
          if (!uniqueTasksMap.has(task.id)) {
            uniqueTasksMap.set(task.id, task)
          }
        })

        const uniqueTasksArray = Array.from(uniqueTasksMap.values())
        uniqueTasksArray.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
        grouped[uniqueStep.status] = uniqueTasksArray
      })
    } else {
      // 개별 카테고리 보기일 때: 기존 로직 유지
      uniqueSteps.forEach(step => {
        grouped[step.status] = activeTasks.filter(task => task.status === step.status)
      })
    }

    // 🐛 DEBUG: Kanban board debugging for dealer filter
    if (selectedType === 'dealer') {
      console.log('🐛 [KANBAN DEBUG] ==================');
      console.log('🎯 Selected Type:', selectedType);
      console.log('📋 Dealer Steps Definition:', dealerSteps);
      console.log('📊 uniqueSteps (should equal dealerSteps):', uniqueSteps);
      console.log('🔢 uniqueSteps.length:', uniqueSteps.length);
      console.log('🔢 Expected: 4, Actual:', uniqueSteps.length);

      const dealerTasks = activeTasks.filter((t: any) => t.type === 'dealer');
      const uniqueStatuses = new Set(dealerTasks.map((t: any) => t.status));
      console.log('🏷️ Unique Statuses in Dealer Tasks:', Array.from(uniqueStatuses));
      console.log('📦 Dealer Tasks Detail:', dealerTasks.map((t: any) => ({
        id: t.id,
        business: t.businessName,
        type: t.type,
        status: t.status,
        title: t.title
      })));

      console.log('🗂️ Grouped Keys:', Object.keys(grouped));
      console.log('==================');
    }

    return { grouped, steps: uniqueSteps }
  }, [kanbanTasks, selectedType, showCompletedTasks])

  // 동적 통계 계산
  const dynamicStats = useMemo(() => {
    const stepsWithTasks = tasksByStatus.steps.filter(step =>
      tasksByStatus.grouped[step.status]?.length > 0
    )
    const highPriorityCount = filteredTasks.filter(task => task.priority === 'high').length
    const delayedCount = filteredTasks.filter(task =>
      task.delayStatus === 'delayed' || task.delayStatus === 'overdue'
    ).length
    const atRiskCount = filteredTasks.filter(task => task.delayStatus === 'at_risk').length

    return {
      totalTasks: filteredTasks.length,
      stepsWithTasks: stepsWithTasks.length,
      highPriorityTasks: highPriorityCount,
      delayedTasks: delayedCount,
      atRiskTasks: atRiskCount,
      activeSteps: stepsWithTasks
    }
  }, [filteredTasks, tasksByStatus])

  // 담당자 목록
  const assignees = useMemo(() => {
    const assigneeSet = new Set<string>()

    tasks.forEach(task => {
      // 기존 assignee 필드
      if (task.assignee) {
        assigneeSet.add(task.assignee)
      }

      // 새로운 assignees 배열
      if (task.assignees && Array.isArray(task.assignees)) {
        task.assignees.forEach((assignee: any) => {
          if (assignee.name) {
            assigneeSet.add(assignee.name)
          }
        })
      }
    })

    return Array.from(assigneeSet).sort()
  }, [tasks])

  // 지자체 목록
  const localGovList = useMemo(() => {
    const localGovSet = new Set<string>()
    tasks.forEach(task => {
      if (task.localGovernment) {
        localGovSet.add(task.localGovernment)
      }
    })
    return Array.from(localGovSet).sort()
  }, [tasks])

  // 현재 선택된 타입의 업무단계 목록
  const currentSteps = useMemo(() => {
    if (selectedType === 'all') {
      // 전체 타입일 때는 실제 등록된 업무들의 단계만 표시
      const statusSet = new Set<TaskStatus>()
      tasks.forEach(task => {
        statusSet.add(task.status)
      })

      // 모든 단계 정의에서 라벨 가져오기
      const allSteps = [...selfSteps, ...subsidySteps, ...dealerSteps, ...etcSteps, ...asSteps]
      const uniqueSteps = Array.from(statusSet).map(status => {
        const step = allSteps.find(s => s.status === status)
        return step || { status, label: status }
      }).sort((a, b) => a.label.localeCompare(b.label))

      return uniqueSteps
    }
    return selectedType === 'self' ? selfSteps :
           selectedType === 'subsidy' ? subsidySteps :
           selectedType === 'dealer' ? dealerSteps :
           selectedType === 'etc' ? etcSteps : asSteps
  }, [selectedType, tasks])

  // 드래그 앤 드롭 핸들러
  const handleDragStart = useCallback((task: Task) => {
    setDraggedTask(task)
  }, [])

  const handleDragEnd = useCallback(() => {
    setDraggedTask(null)
  }, [])

  const handleDrop = useCallback(async (status: TaskStatus) => {
    if (!draggedTask) return

    try {
      // API 호출로 실제 상태 업데이트
      const token = TokenManager.getToken()
      const response = await fetch('/api/facility-tasks', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          id: draggedTask.id,
          status: status
        })
      })

      if (!response.ok) {
        throw new Error('업무 상태 업데이트에 실패했습니다.')
      }

      // 로컬 상태 업데이트
      setTasks(prev => prev.map(task =>
        task.id === draggedTask.id
          ? { ...task, status }
          : task
      ))

      console.log(`업무 "${draggedTask.title}"이(가) ${status} 상태로 이동되었습니다.`)
    } catch (error) {
      console.error('Failed to update task status:', error)
      alert('업무 상태 업데이트에 실패했습니다. 다시 시도해주세요.')
    }
  }, [draggedTask])

  const handleMoveStage = useCallback(async (taskId: string, newStatus: string) => {
    try {
      const token = TokenManager.getToken()
      const response = await fetch('/api/facility-tasks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ id: taskId, status: newStatus })
      })
      if (!response.ok) throw new Error('업무 상태 업데이트에 실패했습니다.')
      setTasks(prev => prev.map(task => task.id === taskId ? { ...task, status: newStatus as TaskStatus } : task))
      setMobileSelectedTask(prev => prev?.id === taskId ? { ...prev, status: newStatus as TaskStatus } : prev)
    } catch (error) {
      console.error('Failed to update task status:', error)
      alert('업무 상태 업데이트에 실패했습니다. 다시 시도해주세요.')
    }
  }, [])

  const mobileTaskSteps = useMemo(() => {
    if (!mobileSelectedTask) return []
    return getStepsForType(mobileSelectedTask.type as TaskType)
  }, [mobileSelectedTask])

  // 헬퍼 함수들
  const getColorClasses = useCallback((color: string) => {
    const colorMap = {
      blue: 'bg-blue-100 text-blue-800 border-blue-200',
      sky: 'bg-sky-100 text-sky-800 border-sky-200',
      yellow: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      orange: 'bg-orange-100 text-orange-800 border-orange-200',
      amber: 'bg-amber-100 text-amber-800 border-amber-200',
      purple: 'bg-purple-100 text-purple-800 border-purple-200',
      indigo: 'bg-indigo-100 text-indigo-800 border-indigo-200',
      cyan: 'bg-cyan-100 text-cyan-800 border-cyan-200',
      emerald: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      teal: 'bg-teal-100 text-teal-800 border-teal-200',
      green: 'bg-green-100 text-green-800 border-green-200',
      lime: 'bg-lime-100 text-lime-800 border-lime-200',
      red: 'bg-red-100 text-red-800 border-red-200',
      pink: 'bg-pink-100 text-pink-800 border-pink-200',
      violet: 'bg-violet-100 text-violet-800 border-violet-200',
      fuchsia: 'bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200',
      rose: 'bg-rose-100 text-rose-800 border-rose-200',
      slate: 'bg-slate-100 text-slate-800 border-slate-200',
      zinc: 'bg-zinc-100 text-zinc-800 border-zinc-200',
      stone: 'bg-stone-100 text-stone-800 border-stone-200',
      gray: 'bg-gray-100 text-gray-800 border-gray-200'
    }
    return colorMap[color as keyof typeof colorMap] || 'bg-gray-100 text-gray-800 border-gray-200'
  }, [])

  const getDotColor = useCallback((color: string) => {
    const dotColorMap = {
      blue: 'bg-blue-500',
      sky: 'bg-sky-500',
      yellow: 'bg-yellow-500',
      orange: 'bg-orange-500',
      amber: 'bg-amber-500',
      purple: 'bg-purple-500',
      indigo: 'bg-indigo-500',
      cyan: 'bg-cyan-500',
      emerald: 'bg-emerald-500',
      teal: 'bg-teal-500',
      green: 'bg-green-500',
      lime: 'bg-lime-500',
      red: 'bg-red-500',
      pink: 'bg-pink-500',
      violet: 'bg-violet-500',
      fuchsia: 'bg-fuchsia-500',
      rose: 'bg-rose-500',
      slate: 'bg-slate-500',
      zinc: 'bg-zinc-500',
      stone: 'bg-stone-500',
      gray: 'bg-gray-500'
    }
    return dotColorMap[color as keyof typeof dotColorMap] || 'bg-gray-500'
  }, [])

  const getPriorityIcon = useCallback((priority: Priority) => {
    switch (priority) {
      case 'high': return <Flag className="w-4 h-4 text-red-500" />
      case 'medium': return <Flag className="w-4 h-4 text-yellow-500" />
      case 'low': return <Flag className="w-4 h-4 text-green-500" />
    }
  }, [])

  const formatDate = useCallback((dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }, [])

  // 업무 타입 뱃지 정보
  const getTaskTypeBadge = useCallback((taskType: string) => {
    const badgeMap = {
      self: { label: '자비', color: 'bg-blue-100 text-blue-800 border-blue-200' },
      subsidy: { label: '보조금', color: 'bg-green-100 text-green-800 border-green-200' },
      dealer: { label: '대리점', color: 'bg-orange-100 text-orange-800 border-orange-200' },
      outsourcing: { label: '외주설치', color: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
      as: { label: 'AS', color: 'bg-purple-100 text-purple-800 border-purple-200' },
      etc: { label: '기타', color: 'bg-gray-100 text-gray-800 border-gray-200' }
    }
    return badgeMap[taskType as keyof typeof badgeMap] || badgeMap.etc
  }, [])

  // 새 업무 생성 핸들러
  const handleCreateTask = useCallback(async () => {
    try {
      // 필수 필드 검증
      if (!createProgressStatus) {
        alert('진행구분을 선택해주세요.')
        return
      }
      // 기타 타입 외에는 사업장 선택 필요
      if (createTaskForm.type !== 'etc' && !businessSearchTerm.trim()) {
        alert('사업장을 선택해주세요.')
        return
      }
      if (!createTaskForm.status) {
        alert('현재 단계를 선택해주세요.')
        return
      }

      // 프론트엔드 중복 체크: 같은 사업장의 같은 단계 업무가 이미 있는지 확인
      const duplicateTask = tasks.find(task =>
        task.businessName === businessSearchTerm &&
        task.status === createTaskForm.status &&
        task.type === createTaskForm.type
      );

      if (duplicateTask) {
        const steps = createTaskForm.type === 'self' ? selfSteps :
                     createTaskForm.type === 'subsidy' ? subsidySteps :
                     createTaskForm.type === 'dealer' ? dealerSteps :
                     createTaskForm.type === 'as' ? asSteps : etcSteps;
        const statusInfo = steps.find(s => s.status === createTaskForm.status);
        const statusLabel = statusInfo?.label || createTaskForm.status;

        const confirmMessage =
          `⚠️ 중복 업무 경고\n\n` +
          `이미 "${businessSearchTerm}" 사업장에 "${statusLabel}" 단계의 업무가 있습니다.\n\n` +
          `기존 업무: ${duplicateTask.description || '설명 없음'}\n\n` +
          `같은 단계의 중복 업무는 업무 관리를 복잡하게 만들 수 있습니다.\n` +
          `그래도 등록하시겠습니까?`;

        if (!confirm(confirmMessage)) {
          return;
        }
      }

      // API 요청 데이터 준비
      // 현재 단계명을 title로 자동 설정
      const steps = createTaskForm.type === 'self' ? selfSteps :
                   createTaskForm.type === 'subsidy' ? subsidySteps :
                   createTaskForm.type === 'dealer' ? dealerSteps :
                   createTaskForm.type === 'as' ? asSteps : etcSteps;
      const currentStep = steps.find(s => s.status === createTaskForm.status);
      const autoTitle = currentStep?.label || createTaskForm.status;

      const requestData = {
        title: autoTitle,
        business_name: businessSearchTerm || '기타',
        business_id: createTaskForm.businessId || null,
        // task_type 제거 - 서버 View에서 progress_status 기반으로 자동 파생됨
        status: createTaskForm.status,
        priority: createTaskForm.priority,
        assignees: createTaskForm.assignees,
        start_date: createTaskForm.startDate || null,
        due_date: createTaskForm.dueDate || null,
        description: createTaskForm.description || null,
        notes: createTaskForm.notes || null
      }

      console.log('📝 새 업무 생성 요청:', requestData)

      // 실제 데이터베이스에 저장
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

        // 409 Conflict: 중복 업무 에러를 사용자 친화적으로 표시
        if (response.status === 409) {
          alert(`❌ ${errorData.message || '중복된 업무가 있습니다.'}`)
          return
        }

        throw new Error(errorData.message || '업무 생성에 실패했습니다.')
      }

      const result = await response.json()
      console.log('✅ 업무 생성 성공:', result)

      // 로컬 상태 업데이트 (임시 - SSE를 통해 자동 업데이트될 예정)
      const newTask: Task = {
        id: result.data.task.id,
        title: result.data.task.title,
        businessName: result.data.task.business_name,
        businessId: result.data.task.business_id, // businessId 매핑 추가
        type: result.data.task.task_type,
        status: result.data.task.status,
        priority: result.data.task.priority,
        assignee: result.data.task.assignee || undefined,
        assignees: result.data.task.assignees || [],
        startDate: result.data.task.start_date || undefined,
        dueDate: result.data.task.due_date || undefined,
        progressPercentage: calculateProgressPercentage(result.data.task.task_type, result.data.task.status),
        delayStatus: 'on_time',
        delayDays: 0,
        createdAt: result.data.task.created_at,
        description: result.data.task.description || undefined,
        notes: result.data.task.notes || undefined
      }

      setTasks(prev => [newTask, ...prev])

      // 📡 이벤트 발송: 업무 생성 알림 (사업장 모달 실시간 동기화)
      const taskUpdateEvent = new CustomEvent('task-updated', {
        detail: {
          businessName: result.data.task.business_name,
          taskId: result.data.task.id,
          status: result.data.task.status
        }
      })
      window.dispatchEvent(taskUpdateEvent)
      console.log('📡 [EVENT] 업무 생성 이벤트 발송:', result.data.task.business_name)

      // 폼 초기화
      setCreateProgressStatus('')
      setCreateTaskForm({
        title: '',
        businessName: '',
        type: 'etc',
        status: 'etc_status',
        priority: 'medium',
        assignee: '',
        assignees: [],
        startDate: '',
        dueDate: '',
            description: '',
        notes: ''
      })

      // 모달 닫기
      setShowCreateModal(false)
      setBusinessSearchTerm('')
      setShowBusinessDropdown(false)

      alert('새 업무가 성공적으로 등록되었습니다.')
    } catch (error) {
      console.error('Failed to create task:', error)
      alert(`업무 등록 중 오류가 발생했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`)
    }
  }, [createTaskForm, businessSearchTerm])

  // ESC 키 핸들러
  useEffect(() => {
    const handleEscKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (showCreateModal) {
          setShowCreateModal(false)
          setBusinessSearchTerm('')
          setShowBusinessDropdown(false)
        }
        if (showEditModal) {
          setShowEditModal(false)
          setEditingTask(null)
          setEditBusinessSearchTerm('')
          setShowEditBusinessDropdown(false)
        }
      }
    }

    if (showCreateModal || showEditModal) {
      document.addEventListener('keydown', handleEscKey)
      return () => document.removeEventListener('keydown', handleEscKey)
    }
  }, [showCreateModal, showEditModal])

  // 모달 열기 핸들러
  const handleOpenCreateModal = useCallback(() => {
    const today = new Date().toISOString().split('T')[0]
    setCreateProgressStatus('') // 진행구분 초기화 (미선택 상태)
    setCreateTaskForm({
      title: '',
      businessName: '',
      type: 'etc', // 진행구분 미선택 시 기본값
      status: 'etc_status',
      priority: 'medium',
      assignee: '',
      assignees: [],
      startDate: today,
      dueDate: '',
        description: '',
      notes: ''
    })
    setBusinessSearchTerm('')
    setShowBusinessDropdown(false)
    setShowCreateModal(true)
  }, [])

  // 수정 모달 열기 핸들러 (권한 체크 포함)
  const handleOpenEditModal = useCallback((task: Task) => {
    // 권한 체크: 담당자나 관리자만 수정 가능
    const currentUser = '관리자' // TODO: 실제 로그인 사용자 정보로 교체 필요
    const isAssignee = task.assignee === currentUser
    const isAdmin = true // TODO: 실제 사용자 권한 체크로 교체 필요

    if (!isAssignee && !isAdmin) {
      alert('이 업무를 수정할 권한이 없습니다. 담당자나 관리자만 수정할 수 있습니다.')
      return
    }


    setEditingTask(task)
    setPendingMemo(null)
    setEditBusinessSearchTerm(task.businessName || '')
    setShowEditBusinessDropdown(false)
    setShowEditModal(true)
  }, [])

  // 모바일 카드 클릭 핸들러
  const handleTaskClick = useCallback((task: Task) => {
    setMobileSelectedTask(task)
    setMobileModalOpen(true)
  }, [])

  // 업무 수정 핸들러
  const handleUpdateTask = useCallback(async () => {
    if (!editingTask) return

    try {
      // 프론트엔드 중복 체크: 다른 업무 중에 같은 사업장의 같은 단계 업무가 있는지 확인
      // task_type은 View에서 파생되므로 중복 체크에서 제외
      const duplicateTask = tasks.find(task =>
        task.id !== editingTask.id && // 자기 자신은 제외
        task.businessName === editingTask.businessName &&
        task.status === editingTask.status
      );

      if (duplicateTask) {
        const steps = editingTask.type === 'self' ? selfSteps :
                     editingTask.type === 'subsidy' ? subsidySteps :
                     editingTask.type === 'dealer' ? dealerSteps :
                     editingTask.type === 'as' ? asSteps : etcSteps;
        const statusInfo = steps.find(s => s.status === editingTask.status);
        const statusLabel = statusInfo?.label || editingTask.status;

        const confirmMessage =
          `⚠️ 중복 업무 경고\n\n` +
          `이미 "${editingTask.businessName}" 사업장에 "${statusLabel}" 단계의 업무가 있습니다.\n\n` +
          `기존 업무: ${duplicateTask.title}\n\n` +
          `같은 단계의 중복 업무는 업무 관리를 복잡하게 만들 수 있습니다.\n` +
          `그래도 수정하시겠습니까?`;

        if (!confirm(confirmMessage)) {
          return;
        }
      }

      // API 요청 데이터 준비
      // task_type: 업무타입 변경 시 business_info.progress_status도 함께 업데이트됨
      const requestData = {
        id: editingTask.id,
        title: editingTask.title,
        business_name: editingTask.businessName || '기타',
        task_type: editingTask.type,
        status: editingTask.status,
        priority: editingTask.priority,
        assignees: editingTask.assignees || [],
        start_date: editingTask.startDate || null,
        due_date: editingTask.dueDate || null,
        description: editingTask.description || null,
        notes: editingTask.notes || null
      }

      console.log('📝 업무 수정 요청:', requestData)

      // 실제 데이터베이스에 저장
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

        // 409 Conflict: 중복 업무 에러를 사용자 친화적으로 표시
        if (response.status === 409) {
          alert(`❌ ${errorData.message || '중복된 업무가 있습니다.'}`)
          return
        }

        throw new Error(errorData.message || '업무 수정에 실패했습니다.')
      }

      const result = await response.json()
      console.log('✅ 업무 수정 성공:', result)

      // 로컬 상태 업데이트
      setTasks(prev => prev.map(task =>
        task.id === editingTask.id
          ? {
              ...editingTask,
              createdAt: result.data.task.created_at,
              assignee: editingTask.assignees && editingTask.assignees.length > 0
                ? editingTask.assignees[0].name
                : undefined
            }
          : task
      ))

      // 📡 이벤트 발송: 업무 업데이트 알림 (사업장 모달 실시간 동기화)
      const taskUpdateEvent = new CustomEvent('task-updated', {
        detail: {
          businessName: editingTask.businessName,
          taskId: editingTask.id,
          status: editingTask.status
        }
      })
      window.dispatchEvent(taskUpdateEvent)
      console.log('📡 [EVENT] 업무 업데이트 이벤트 발송:', editingTask.businessName)

      // 모달 닫기
      setShowEditModal(false)
      setEditingTask(null)
      setMemoInput('')
      setPendingMemo(null)
      setEditBusinessSearchTerm('')
      setShowEditBusinessDropdown(false)

      alert('업무가 성공적으로 수정되었습니다.')
    } catch (error) {
      console.error('Failed to update task:', error)
      alert(`업무 수정 중 오류가 발생했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`)
    }
  }, [editingTask])

  // 메모만 별도로 업무진행현황에 기록하는 핸들러
  const handleAddMemo = useCallback(async () => {
    if (!editingTask || !memoInput.trim()) return

    setIsMemoSubmitting(true)
    try {
      const token = TokenManager.getToken()
      const response = await fetch('/api/facility-tasks', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          id: editingTask.id,
          title: editingTask.title,
          business_name: editingTask.businessName || '기타',
          // task_type 제거 - 서버 View에서 progress_status 기반으로 자동 파생됨
          status: editingTask.status,
          priority: editingTask.priority,
          assignees: editingTask.assignees || [],
          start_date: editingTask.startDate || null,
          due_date: editingTask.dueDate || null,
          description: editingTask.description || null,
          notes: memoInput.trim()
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || '메모 기록에 실패했습니다.')
      }

      // 입력창 초기화 후 즉시 메모 표시 (Realtime publication 미설정 환경 대비 fallback)
      const content = memoInput.trim()
      setMemoInput('')
      setPendingMemo({ content, author: user?.name || '나', createdAt: new Date().toISOString() })
    } catch (error) {
      console.error('Failed to add memo:', error)
      alert(`메모 기록 중 오류가 발생했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`)
    } finally {
      setIsMemoSubmitting(false)
    }
  }, [editingTask, memoInput])

  return (
    <AdminLayout
      title="업무 관리"
      description="시설 설치 업무 흐름을 체계적으로 관리합니다"
      actions={
        <div className="flex items-center gap-2 md:gap-2">
          {/* 데스크탑에서만 표시 */}
          <button
            onClick={refreshTasks}
            disabled={isRefreshing}
            className="hidden md:flex items-center gap-2 bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50 text-sm"
          >
            {isRefreshing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            새로고침
          </button>
          <div className="hidden md:block text-xs text-gray-500">
            마지막 업데이트: {lastRefresh.toLocaleTimeString('ko-KR')}
          </div>

          {/* 핵심 액션 - 모든 화면에서 표시 */}
          <div className="flex items-center gap-2">
            {user?.permission_level === 4 && (
              <>
                <button
                  onClick={handleOpenDuplicateModal}
                  className="flex items-center gap-2 bg-orange-600 text-white px-3 py-1.5 md:px-3 rounded-lg hover:bg-orange-700 transition-colors text-sm"
                  title="중복 업무 조회 및 삭제"
                >
                  <FileX className="w-4 h-4" />
                  <span className="hidden md:inline">중복 관리</span>
                </button>
                <button
                  onClick={() => setShowBulkUploadModal(true)}
                  className="flex items-center gap-2 bg-green-600 text-white px-3 py-1.5 md:px-3 rounded-lg hover:bg-green-700 transition-colors text-sm"
                >
                  <Upload className="w-4 h-4" />
                  <span className="hidden md:inline">엑셀 일괄 등록</span>
                </button>
              </>
            )}
            <button
              onClick={handleOpenCreateModal}
              className="flex items-center gap-2 bg-blue-600 text-white px-3 py-1.5 md:px-3 rounded-lg hover:bg-blue-700 transition-colors text-sm"
            >
              <Plus className="w-4 h-4" />
              <span className="sm:hidden">추가</span>
              <span className="hidden sm:inline">새 업무</span>
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-3 md:space-y-4">
        {/* 동적 통계 요약 */}
        <div className="grid grid-cols-3 md:grid-cols-5 gap-2 md:gap-3">
          <div className="bg-white rounded-md md:rounded-lg border border-gray-200 p-2 md:p-2.5 cursor-help relative group">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-xs md:text-xs text-gray-600">전체 업무</p>
                <p className="text-sm sm:text-sm md:text-base font-semibold text-gray-900">{dynamicStats.totalTasks}</p>
              </div>
              <Target className="w-4 h-4 md:w-5 md:h-5 text-blue-500" />
            </div>

            {/* 호버 툴팁 */}
            <div className="hidden md:block absolute left-0 top-full mt-2 w-48 p-3 bg-gray-900 text-white text-xs rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-50">
              <div className="font-semibold mb-2">📊 전체 업무</div>
              <div className="space-y-1">
                <div>• 시스템에 등록된 모든 업무</div>
                <div>• 삭제되지 않은 활성 상태 업무</div>
                <div>• 모든 단계와 우선순위 포함</div>
              </div>
              <div className="absolute bottom-full left-4 w-0 h-0 border-l-4 border-r-4 border-b-4 border-transparent border-b-gray-900"></div>
            </div>
          </div>
          <div className="bg-white rounded-md md:rounded-lg border border-gray-200 p-2 md:p-2.5 cursor-help relative group">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-xs md:text-xs text-gray-600">활성 단계</p>
                <p className="text-sm sm:text-sm md:text-base font-semibold text-orange-600">{dynamicStats.stepsWithTasks}</p>
              </div>
              <TrendingUp className="w-4 h-4 md:w-5 md:h-5 text-orange-500" />
            </div>

            {/* 호버 툴팁 */}
            <div className="hidden md:block absolute left-0 top-full mt-2 w-52 p-3 bg-gray-900 text-white text-xs rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-50">
              <div className="font-semibold mb-2">🔄 활성 단계</div>
              <div className="space-y-1">
                <div>• 업무가 있는 워크플로우 단계 수</div>
                <div>• 총 7단계 중 업무가 진행 중인 단계</div>
                <div>• 비어있는 단계는 제외</div>
              </div>
              <div className="absolute bottom-full left-4 w-0 h-0 border-l-4 border-r-4 border-b-4 border-transparent border-b-gray-900"></div>
            </div>
          </div>
          <div className="bg-white rounded-md md:rounded-lg border border-gray-200 p-2 md:p-2.5 cursor-help relative group">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-xs md:text-xs text-gray-600">높은 우선순위</p>
                <p className="text-sm sm:text-sm md:text-base font-semibold text-red-600">{dynamicStats.highPriorityTasks}</p>
              </div>
              <AlertCircle className="w-4 h-4 md:w-5 md:h-5 text-red-500" />
            </div>

            {/* 호버 툴팁 */}
            <div className="hidden md:block absolute left-0 top-full mt-2 w-48 p-3 bg-gray-900 text-white text-xs rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-50">
              <div className="font-semibold mb-2">🔴 높은 우선순위</div>
              <div className="space-y-1">
                <div>• 우선순위가 '높음'으로 설정된 업무</div>
                <div>• 즉시 처리가 필요한 긴급 업무</div>
                <div>• 빠른 대응이 요구되는 업무</div>
              </div>
              <div className="absolute bottom-full left-4 w-0 h-0 border-l-4 border-r-4 border-b-4 border-transparent border-b-gray-900"></div>
            </div>
          </div>
          <div
            className="bg-white rounded-md md:rounded-lg border border-red-200 p-2 md:p-2.5 bg-red-50 cursor-help relative group"
            title="업무 타입별 지연 기준: 자비설치(21일), 보조금(30일), AS(10일), 기타(15일)"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-xs md:text-xs text-red-600">지연 업무</p>
                <p className="text-sm sm:text-sm md:text-base font-semibold text-red-700">{dynamicStats.delayedTasks}</p>
              </div>
              <Clock className="w-4 h-4 md:w-5 md:h-5 text-red-500" />
            </div>
            {/* 호버 도움말 */}
            <div className="hidden md:block absolute left-0 top-full mt-2 w-64 p-3 bg-gray-900 text-white text-xs rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-50">
              <div className="font-semibold mb-2">📅 지연 업무 기준</div>
              <div className="space-y-1">
                <div>• 자비 설치: 시작 후 21일</div>
                <div>• 보조금: 시작 후 30일</div>
                <div>• AS: 시작 후 10일</div>
                <div>• 기타: 시작 후 15일</div>
              </div>
              <div className="absolute bottom-full left-4 w-0 h-0 border-l-4 border-r-4 border-b-4 border-transparent border-b-gray-900"></div>
            </div>
          </div>
          <div
            className="bg-white rounded-md md:rounded-lg border border-yellow-200 p-2 md:p-2.5 bg-yellow-50 cursor-help relative group"
            title="업무 타입별 위험 기준: 자비설치(14일), 보조금(20일), AS(7일), 기타(10일)"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-xs md:text-xs text-yellow-600">위험 업무</p>
                <p className="text-sm sm:text-sm md:text-base font-semibold text-yellow-700">{dynamicStats.atRiskTasks}</p>
              </div>
              <AlertCircle className="w-4 h-4 md:w-5 md:h-5 text-yellow-500" />
            </div>
            {/* 호버 도움말 */}
            <div className="hidden md:block absolute left-0 top-full mt-2 w-64 p-3 bg-gray-900 text-white text-xs rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-50">
              <div className="font-semibold mb-2">⚠️ 위험 업무 기준</div>
              <div className="space-y-1">
                <div>• 자비 설치: 시작 후 14일</div>
                <div>• 보조금: 시작 후 20일</div>
                <div>• AS: 시작 후 7일</div>
                <div>• 기타: 시작 후 10일</div>
              </div>
              <div className="absolute bottom-full left-4 w-0 h-0 border-l-4 border-r-4 border-b-4 border-transparent border-b-gray-900"></div>
            </div>
          </div>
        </div>

        {/* 필터 및 검색 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-2 sm:p-3 md:p-3">
          <div className="flex flex-col lg:flex-row gap-2 sm:gap-3 md:gap-3">
            {/* 필터 옵션들 */}
            <div className="flex flex-wrap gap-2 sm:gap-2">
              {/* 진행구분 (설정 연동 동적 목록) */}
              <select
                value={selectedProgressStatus}
                onChange={(e) => handleProgressStatusChange(e.target.value)}
                className="px-2 py-1.5 sm:px-3 sm:py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm sm:text-sm"
              >
                <option value="all">진행구분</option>
                {progressStatusOptions.map(ps => (
                  <option key={ps} value={ps}>{ps}</option>
                ))}
              </select>

              {/* 우선순위 */}
              <select
                value={selectedPriority}
                onChange={(e) => setSelectedPriority(e.target.value as Priority | 'all')}
                className="px-2 py-1.5 sm:px-3 sm:py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm sm:text-sm"
              >
                <option value="all">우선순위</option>
                <option value="high">높음</option>
                <option value="medium">보통</option>
                <option value="low">낮음</option>
              </select>

              {/* 담당자 */}
              <select
                value={selectedAssignee}
                onChange={(e) => setSelectedAssignee(e.target.value)}
                className="px-2 py-1.5 sm:px-3 sm:py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm sm:text-sm"
              >
                <option value="all">담당자</option>
                {assignees.map(assignee => (
                  <option key={assignee} value={assignee}>{assignee}</option>
                ))}
              </select>

              {/* 업무단계 */}
              <select
                value={selectedStatus}
                onChange={(e) => {
                  setSelectedStatus(e.target.value as TaskStatus | 'all')
                }}
                className="px-2 py-1.5 sm:px-3 sm:py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm sm:text-sm"
              >
                <option value="all">단계</option>
                {currentSteps.map(step => (
                  <option key={step.status} value={step.status}>{step.label}</option>
                ))}
              </select>

              {/* 지자체 */}
              <select
                value={selectedLocalGov}
                onChange={(e) => setSelectedLocalGov(e.target.value)}
                className="px-2 py-1.5 sm:px-3 sm:py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm sm:text-sm"
              >
                <option value="all">지자체</option>
                {localGovList.map(localGov => (
                  <option key={localGov} value={localGov}>{localGov}</option>
                ))}
              </select>

              {/* 착공신고서 미제출 필터 버튼 */}
              <button
                onClick={() => setShowOnlyNoConstructionReport(!showOnlyNoConstructionReport)}
                className={`
                  px-2 py-1.5 sm:px-3 sm:py-2 rounded-lg text-xs font-medium transition-all duration-200 whitespace-nowrap
                  ${showOnlyNoConstructionReport
                    ? 'bg-orange-100 text-orange-700 border-2 border-orange-300 shadow-sm'
                    : 'bg-gray-100 text-gray-600 border-2 border-gray-200 hover:bg-gray-200'
                  }
                `}
                title="착공신고서 제출일이 없는 사업장만 표시"
              >
                <div className="flex items-center gap-1">
                  <FileX className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                  <span>착공미제출</span>
                </div>
              </button>

              {/* 🆕 완료된 업무 토글 버튼 */}
              <button
                onClick={() => setShowCompletedTasks(!showCompletedTasks)}
                className={`
                  px-2 py-1.5 sm:px-3 sm:py-2 rounded-lg text-xs font-medium transition-all duration-200 whitespace-nowrap
                  ${showCompletedTasks
                    ? 'bg-green-100 text-green-700 border-2 border-green-300 shadow-sm'
                    : 'bg-gray-100 text-gray-600 border-2 border-gray-200 hover:bg-gray-200'
                  }
                `}
                title="완료된 업무만 표시"
              >
                <div className="flex items-center gap-1">
                  {showCompletedTasks ? (
                    <CheckCircle className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                  ) : (
                    <Eye className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                  )}
                  <span>완료업무</span>
                  {showCompletedTasks && (
                    <span className="ml-0.5 px-1 py-0.5 bg-green-200 text-green-800 rounded text-xs font-semibold">
                      {tasks.filter(t => t.progressPercentage === 100).length}
                    </span>
                  )}
                </div>
              </button>
            </div>

            {/* 검색창 */}
            <div className="flex-1 relative">
              <Search className="absolute left-2 sm:left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-3 h-3 sm:w-4 sm:h-4" />
              <input
                type="text"
                placeholder="사업장명, 담당자, 지자체, 설명으로 검색..."
                className="w-full pl-8 pr-3 py-1.5 sm:pl-10 sm:pr-4 sm:py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm sm:text-sm"
                onChange={(e) => debouncedSearch(e.target.value)}
              />
            </div>
          </div>

          {/* 결과 요약 */}
          <div className="mt-3 flex items-center justify-between text-sm text-gray-600">
            <div className="flex items-center gap-2 flex-wrap">
              <span>총 {filteredTasks.length}개 업무</span>
              {/* 진행구분 필터 라벨 */}
              {selectedProgressStatus !== 'all' && (
                <button
                  onClick={() => handleProgressStatusChange('all')}
                  className="flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs hover:bg-blue-200 transition-colors"
                  title="진행구분 필터 제거"
                >
                  <span>{selectedProgressStatus}</span>
                  <X className="w-3 h-3" />
                </button>
              )}
              {/* 우선순위 필터 라벨 */}
              {selectedPriority !== 'all' && (
                <button
                  onClick={() => setSelectedPriority('all')}
                  className="flex items-center gap-1 px-2 py-1 bg-yellow-100 text-yellow-800 rounded text-xs hover:bg-yellow-200 transition-colors"
                  title="우선순위 필터 제거"
                >
                  <span>
                    {selectedPriority === 'high' ? '높음' :
                     selectedPriority === 'medium' ? '보통' : '낮음'}
                  </span>
                  <X className="w-3 h-3" />
                </button>
              )}
              {/* 담당자 필터 라벨 */}
              {selectedAssignee !== 'all' && (
                <button
                  onClick={() => setSelectedAssignee('all')}
                  className="flex items-center gap-1 px-2 py-1 bg-purple-100 text-purple-800 rounded text-xs hover:bg-purple-200 transition-colors"
                  title="담당자 필터 제거"
                >
                  <span>{selectedAssignee}</span>
                  <X className="w-3 h-3" />
                </button>
              )}
              {/* 업무단계 필터 라벨 */}
              {selectedStatus !== 'all' && (
                <button
                  onClick={() => setSelectedStatus('all')}
                  className="flex items-center gap-1 px-2 py-1 bg-green-100 text-green-800 rounded text-xs hover:bg-green-200 transition-colors"
                  title="업무단계 필터 제거"
                >
                  <span>{currentSteps.find(step => step.status === selectedStatus)?.label || selectedStatus}</span>
                  <X className="w-3 h-3" />
                </button>
              )}
              {/* 지자체 필터 라벨 */}
              {selectedLocalGov !== 'all' && (
                <button
                  onClick={() => setSelectedLocalGov('all')}
                  className="flex items-center gap-1 px-2 py-1 bg-indigo-100 text-indigo-800 rounded text-xs hover:bg-indigo-200 transition-colors"
                  title="지자체 필터 제거"
                >
                  <span>{selectedLocalGov}</span>
                  <X className="w-3 h-3" />
                </button>
              )}
              {/* 전체 필터 초기화 버튼 */}
              {(selectedType !== 'subsidy' || selectedPriority !== 'all' || selectedAssignee !== 'all' ||
                selectedStatus !== 'all' || selectedLocalGov !== 'all' || showOnlyNoConstructionReport ||
                showCompletedTasks || searchTerm) && (
                <button
                  onClick={handleResetFilters}
                  className="flex items-center gap-1 px-2 py-1 bg-red-100 text-red-800 rounded text-xs hover:bg-red-200 transition-colors font-medium"
                  title="모든 필터 초기화"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>전체 초기화</span>
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs">
                데이터 연결: 정상
              </span>
              <div className="w-2 h-2 rounded-full bg-green-500" />
            </div>
          </div>
        </div>


        {/* 업무 리스트 뷰 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 sm:p-4">
          <h2 className="text-base sm:text-lg font-semibold text-gray-900 mb-3 sm:mb-4">업무 목록</h2>

          {/* 모바일: 카드 뷰 */}
          <div className="md:hidden">
            <TaskCardList
              tasks={paginatedTasks as any}
              onTaskClick={handleTaskClick as any}
              onTaskEdit={(task: any) => {
                setEditingTask(task)
                setEditBusinessSearchTerm(task.businessName || '')
                setShowEditModal(true)
              }}
              onComplete={handleCompleteTask}
              isLoading={isLoading}
              activeSubsidies={activeSubsidies}
            />
          </div>

          {/* 데스크톱: 기존 테이블 */}
          <div className="hidden md:block">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                <span className="ml-2 text-gray-500">로딩 중...</span>
              </div>
            ) : filteredTasks.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                등록된 업무가 없습니다.
              </div>
            ) : (
              <div className="overflow-x-auto bg-white rounded-lg border border-gray-200">
              <table className="w-full min-w-[800px]">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="text-left py-2 sm:py-2.5 px-2 sm:px-3 text-[10px] sm:text-xs font-semibold text-gray-800">사업장</th>
                    <th className="text-left py-2 sm:py-2.5 px-2 sm:px-3 text-[10px] sm:text-xs font-semibold text-gray-800">지자체</th>
                    <th className="text-left py-2 sm:py-2.5 px-2 sm:px-3 text-[10px] sm:text-xs font-semibold text-gray-800 w-28 sm:w-40 max-w-28 sm:max-w-40">업무 설명</th>
                    <th className="text-left py-2 sm:py-2.5 px-2 sm:px-3 text-[10px] sm:text-xs font-semibold text-gray-800">업무 단계</th>
                    <th className="text-left py-2 sm:py-2.5 px-2 sm:px-3 text-[10px] sm:text-xs font-semibold text-gray-800">담당자</th>
                    <th className="text-left py-2 sm:py-2.5 px-2 sm:px-3 text-[10px] sm:text-xs font-semibold text-gray-800">업무 타입</th>
                    <th className="text-center py-2 sm:py-2.5 px-1 sm:px-2 text-[10px] sm:text-xs font-semibold text-gray-800">설치완료</th>
                    <th className="text-center py-2 sm:py-2.5 px-1 sm:px-2 text-[10px] sm:text-xs font-semibold text-gray-800">부착통보</th>
                    <th className="text-center py-2 sm:py-2.5 px-1 sm:px-2 text-[10px] sm:text-xs font-semibold text-gray-800">그린링크</th>
                    <th className="text-center py-2 sm:py-2.5 px-1 sm:px-2 text-[10px] sm:text-xs font-semibold text-gray-800">미수금</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedTasks.map((task, index) => {
                    const step = (task.type === 'self' ? selfSteps :
                                   task.type === 'subsidy' ? subsidySteps :
                                   task.type === 'dealer' ? dealerSteps :
                                   task.type === 'outsourcing' ? outsourcingSteps :
                                   task.type === 'etc' ? etcSteps : asSteps).find(s => s.status === task.status)
                    const statusLabel = getStatusLabel(task.type, task.status)
                    return (
                      <tr
                        key={task.id}
                        onClick={() => handleOpenEditModal(task)}
                        className={`border-b border-gray-100 hover:bg-blue-50 transition-colors cursor-pointer ${index % 2 === 0 ? 'bg-white' : 'bg-gray-25'}`}
                      >
                        <td className="py-2 sm:py-2.5 px-2 sm:px-3 text-[10px] sm:text-xs">
                          <div className="flex items-center gap-1">
                            <span className="font-medium text-gray-900 truncate max-w-[120px] sm:max-w-none">
                              {task.businessName}
                            </span>
                            <SubsidyActiveBadge
                              localGovernment={task.localGovernment}
                              activeSubsidies={activeSubsidies}
                              taskStatus={task.status}
                              taskType={task.type}
                            />
                          </div>
                        </td>
                        <td className="py-2 sm:py-2.5 px-2 sm:px-3 text-[10px] sm:text-xs text-gray-600">
                          {task.localGovernment || '-'}
                        </td>
                        <td className="py-2 sm:py-2.5 px-2 sm:px-3 text-[10px] sm:text-xs">
                          <div
                            className="font-medium text-gray-900 max-w-[160px] leading-tight"
                            style={{
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis'
                            }}
                          >
                            {task.description || '-'}
                          </div>
                        </td>
                        <td className="py-2 sm:py-2.5 px-2 sm:px-3 text-[10px] sm:text-xs">
                          <span className={`inline-flex px-2 py-1 text-xs rounded-full ${getColorClasses(step?.color || 'gray')}`}>
                            {statusLabel}
                          </span>
                        </td>
                        <td className="py-2 sm:py-2.5 px-2 sm:px-3 text-[10px] sm:text-xs text-gray-600">
                          {task.assignees && task.assignees.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {task.assignees.slice(0, 3).map((assignee) => (
                                <span
                                  key={assignee.id}
                                  className="inline-flex items-center px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-medium"
                                  title={`${assignee.name} (${assignee.position})`}
                                >
                                  {assignee.name}
                                </span>
                              ))}
                              {task.assignees.length > 3 && (
                                <span className="text-gray-400 text-xs">
                                  +{task.assignees.length - 3}명
                                </span>
                              )}
                            </div>
                          ) : (
                            task.assignee || '미배정'
                          )}
                        </td>
                        <td className="py-2 sm:py-2.5 px-2 sm:px-3 text-[10px] sm:text-xs">
                          <span className={`inline-flex px-2 py-1 text-xs rounded ${
                            task.type === 'self'
                              ? 'bg-blue-100 text-blue-800'
                              : task.type === 'subsidy'
                              ? 'bg-purple-100 text-purple-800'
                              : task.type === 'dealer'
                              ? 'bg-cyan-100 text-cyan-800'
                              : task.type === 'outsourcing'
                              ? 'bg-indigo-100 text-indigo-800'
                              : task.type === 'etc'
                              ? 'bg-gray-100 text-gray-800'
                              : 'bg-orange-100 text-orange-800'
                          }`}>
                            {task.type === 'self' ? '자비' :
                             task.type === 'subsidy' ? '보조금' :
                             task.type === 'dealer' ? '대리점' :
                             task.type === 'outsourcing' ? '외주설치' :
                             task.type === 'etc' ? '기타' : 'AS'}
                          </span>
                        </td>
                        <td className="py-2 sm:py-2.5 px-1 sm:px-2 text-[10px] sm:text-xs text-center">
                          {(() => {
                            const formatDateShort = (dateStr: string) => {
                              const d = new Date(dateStr)
                              const yy = d.getFullYear().toString().slice(-2)
                              const mm = (d.getMonth() + 1).toString().padStart(2, '0')
                              const dd = d.getDate().toString().padStart(2, '0')
                              return `${yy}.${mm}.${dd}`
                            }
                            if (task.installationDate) {
                              return <span className="text-green-600 font-medium">{formatDateShort(task.installationDate)}</span>
                            }
                            if (task.progressStatus === '대리점' && task.orderDate) {
                              return <span className="text-blue-600 font-medium">{formatDateShort(task.orderDate)}</span>
                            }
                            return <span className="text-gray-400">-</span>
                          })()}
                        </td>
                        <td className="py-2 sm:py-2.5 px-1 sm:px-2 text-[10px] sm:text-xs text-center">
                          {task.attachmentCompletionSubmittedAt ? (
                            <span className="text-emerald-600 font-medium">
                              {(() => { const d = new Date(task.attachmentCompletionSubmittedAt); return `${d.getFullYear().toString().slice(-2)}.${(d.getMonth()+1).toString().padStart(2,'0')}.${d.getDate().toString().padStart(2,'0')}` })()}
                            </span>
                          ) : <span className="text-gray-400">-</span>}
                        </td>
                        <td className="py-2 sm:py-2.5 px-1 sm:px-2 text-[10px] sm:text-xs text-center">
                          {task.greenlinkConfirmationSubmittedAt ? (
                            <span className="text-blue-600 font-medium">
                              {(() => { const d = new Date(task.greenlinkConfirmationSubmittedAt); return `${d.getFullYear().toString().slice(-2)}.${(d.getMonth()+1).toString().padStart(2,'0')}.${d.getDate().toString().padStart(2,'0')}` })()}
                            </span>
                          ) : <span className="text-gray-400">-</span>}
                        </td>
                        <td className="py-2 sm:py-2.5 px-1 sm:px-2 text-[10px] sm:text-xs text-center">
                          {(() => {
                            const batchVal = taskReceivables[task.businessId || '']
                            if (batchVal === null || batchVal === undefined) return <span className="text-gray-400">-</span>
                            if (batchVal <= 0) return <span className="text-green-600 font-medium">0</span>
                            return <span className="text-red-600 font-medium">{batchVal.toLocaleString()}</span>
                          })()}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            )}
          </div>

          {/* 페이지네이션 - 모바일 & 데스크톱 공통 */}
          {!isLoading && filteredTasks.length > 0 && totalPages > 1 && (
            <div className="mt-4 sm:mt-6">
              {/* 모바일: 간단한 페이지네이션 */}
              <div className="md:hidden">
                <div className="flex items-center justify-between px-2">
                  <button
                    onClick={() => setCurrentPage(currentPage - 1)}
                    disabled={currentPage === 1}
                    className={`flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      currentPage === 1
                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 active:scale-95'
                    }`}
                  >
                    ← 이전
                  </button>
                  <span className="text-sm font-medium text-gray-700">
                    {currentPage} / {totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className={`flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      currentPage === totalPages
                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 active:scale-95'
                    }`}
                  >
                    다음 →
                  </button>
                </div>
                <div className="text-center mt-2">
                  <span className="text-xs text-gray-500">
                    전체 {filteredTasks.length}개 중 {((currentPage - 1) * itemsPerPage) + 1}-{Math.min(currentPage * itemsPerPage, filteredTasks.length)}개 표시
                  </span>
                </div>
              </div>

              {/* 데스크톱: 풀 페이지네이션 */}
              <div className="hidden md:flex items-center justify-between px-4">
                <div className="text-sm text-gray-600">
                  전체 {filteredTasks.length}개 중 {((currentPage - 1) * itemsPerPage) + 1}-{Math.min(currentPage * itemsPerPage, filteredTasks.length)}개 표시
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage(1)}
                    disabled={currentPage === 1}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      currentPage === 1
                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    처음
                  </button>
                  <button
                    onClick={() => setCurrentPage(currentPage - 1)}
                    disabled={currentPage === 1}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      currentPage === 1
                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    이전
                  </button>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
                      // 현재 페이지 근처만 표시
                      if (
                        page === 1 ||
                        page === totalPages ||
                        (page >= currentPage - 1 && page <= currentPage + 1)
                      ) {
                        return (
                          <button
                            key={page}
                            onClick={() => setCurrentPage(page)}
                            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                              currentPage === page
                                ? 'bg-blue-600 text-white'
                                : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                            }`}
                          >
                            {page}
                          </button>
                        )
                      } else if (page === currentPage - 2 || page === currentPage + 2) {
                        return <span key={page} className="text-gray-400">...</span>
                      }
                      return null
                    })}
                  </div>
                  <button
                    onClick={() => setCurrentPage(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      currentPage === totalPages
                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    다음
                  </button>
                  <button
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={currentPage === totalPages}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      currentPage === totalPages
                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    마지막
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 모바일 상세 모달 */}
        <TaskMobileModal
          task={mobileSelectedTask as any}
          isOpen={mobileModalOpen}
          onClose={() => {
            setMobileModalOpen(false)
            setMobileSelectedTask(null)
          }}
          onEdit={(task: any) => {
            setEditingTask(task)
            setEditBusinessSearchTerm(task.businessName || '')
            setShowEditModal(true)
            setMobileModalOpen(false)
          }}
          onDelete={async (task: any) => {
            // handleDeleteTask에서 모달을 자동으로 닫으므로 별도 처리 불필요
            await handleDeleteTask(task.id)
          }}
          activeSubsidies={activeSubsidies}
          availableSteps={mobileTaskSteps as any}
          onMoveStage={handleMoveStage}
        />
      </div>

      {/* 칸반 보드 */}
      <div className="space-y-3 md:space-y-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-gray-500">업무 목록을 불러오는 중...</p>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-2 sm:p-3 md:p-4">
            {/* 칸반 보드 헤더 */}
            <div className="flex items-center justify-between mb-2 sm:mb-3 md:mb-4">
              <h3 className="text-base sm:text-lg font-semibold text-gray-900">업무 흐름</h3>
              <button
                onClick={() => setIsCompactMode(!isCompactMode)}
                className="flex items-center gap-1 sm:gap-2 px-2 py-1.5 sm:px-3 sm:py-2 text-xs sm:text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
              >
                {isCompactMode ? (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                    전체 보기
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                    </svg>
                    간소 보기
                  </>
                )}
              </button>
            </div>
            <div className="relative">
              <div key={`kanban-${selectedType}`} className="flex gap-2 sm:gap-3 md:gap-4 overflow-x-auto pb-3 md:pb-4 scroll-smooth">
              {tasksByStatus.steps.map((step) => (
                <div
                  key={step.status}
                  className="flex-shrink-0 w-52 sm:w-60 md:w-64 bg-gray-50 rounded-lg p-2 sm:p-3"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => handleDrop(step.status)}
                >
                  {/* 칼럼 헤더 */}
                  <div className="flex items-center justify-between mb-2 sm:mb-3">
                    <div className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded-full ${getDotColor(step.color)}`} />
                      <h3 className="font-medium text-gray-900 text-xs sm:text-sm">{step.label}</h3>
                    </div>
                    <span className="text-xs text-gray-500 bg-white px-1.5 py-0.5 sm:px-2 sm:py-1 rounded">
                      총 {tasksByStatus.grouped[step.status]?.length || 0}개
                    </span>
                  </div>

                  {/* 업무 카드들 */}
                  <div className={`space-y-1.5 sm:space-y-2 ${isCompactMode ? 'min-h-[80px] sm:min-h-[100px]' : 'max-h-[400px] sm:max-h-[500px] overflow-y-auto scrollbar-thin'}`}>
                    {(isCompactMode
                      ? getDisplayTasks(tasksByStatus.grouped[step.status] || [])
                      : (tasksByStatus.grouped[step.status] || [])
                    ).map((task) => (
                      <div
                        key={task.id}
                        draggable
                        onDragStart={() => handleDragStart(task)}
                        onDragEnd={handleDragEnd}
                      >
                        <TaskCard
                          task={task as any}
                          onClick={() => handleOpenEditModal(task)}
                          onEdit={(task: any) => {
                            setEditingTask(task)
                            setEditBusinessSearchTerm(task.businessName || '')
                            setShowEditModal(true)
                          }}
                          onComplete={handleCompleteTask}
                          activeSubsidies={activeSubsidies}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              </div>
              {/* 우측 페이드 힌트 — 가로 스크롤 가능함을 시각적으로 표시 */}
              <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-white to-transparent rounded-r-xl" />
            </div>
          </div>
        )}
      </div>

      {/* 새 업무 등록 모달 */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 backdrop-blur-sm p-2 sm:p-4">
          <div className="bg-white rounded-xl sm:rounded-2xl shadow-2xl w-full max-w-4xl max-h-[98vh] sm:max-h-[95vh] overflow-hidden">
            {/* 세련된 헤더 섹션 */}
            <div className="bg-gradient-to-r from-green-600 to-green-700 px-4 sm:px-6 py-3 sm:py-4 text-white">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="bg-white bg-opacity-20 rounded-xl p-2 sm:p-2.5">
                    <Plus className="w-4 h-4 sm:w-5 sm:h-5" />
                  </div>
                  <div>
                    <h1 className="text-base sm:text-xl font-bold">새 업무 등록</h1>
                    <p className="text-green-100 mt-0.5 text-xs sm:text-xs hidden sm:block">새로운 업무를 시스템에 등록합니다</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`inline-flex px-3 py-1 text-sm rounded-full font-medium ${
                    createTaskForm.type === 'self'
                      ? 'bg-blue-100 text-blue-800'
                      : createTaskForm.type === 'subsidy'
                      ? 'bg-purple-100 text-purple-800'
                      : createTaskForm.type === 'dealer'
                      ? 'bg-cyan-100 text-cyan-800'
                      : createTaskForm.type === 'outsourcing'
                      ? 'bg-indigo-100 text-indigo-800'
                      : createTaskForm.type === 'etc'
                      ? 'bg-gray-100 text-gray-800'
                      : 'bg-orange-100 text-orange-800'
                  }`}>
                    {createProgressStatus || '진행구분 미선택'}
                  </span>

                  {/* 액션 버튼들 */}
                  <div className="flex items-center gap-1 sm:gap-2 ml-2 sm:ml-3">
                    <button
                      onClick={() => setShowCreateModal(false)}
                      className="px-2 sm:px-3 py-1 sm:py-1.5 text-white bg-white bg-opacity-20 rounded-lg hover:bg-opacity-30 transition-all font-medium backdrop-blur-sm border border-white border-opacity-30 text-xs sm:text-sm"
                    >
                      취소
                    </button>
                    <button
                      onClick={handleCreateTask}
                      className="px-3 sm:px-4 py-1 sm:py-1.5 bg-white text-green-700 rounded-lg hover:bg-green-50 transition-all font-medium shadow-lg text-xs sm:text-sm"
                    >
                      등록
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-3 sm:p-6 overflow-y-auto max-h-[calc(98vh-120px)] sm:max-h-[calc(95vh-120px)]">
              {/* 핵심 정보 카드들 */}
              <div className="grid grid-cols-3 gap-1 sm:gap-2 mb-3 sm:mb-3">
                {/* 업무 정보 카드 */}
                <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-md p-2 border border-green-200">
                  <div className="flex items-center gap-1 mb-1">
                    <div className="bg-green-600 rounded-sm p-1">
                      <FileText className="w-2 h-2 sm:w-3 sm:h-3 text-white" />
                    </div>
                    <h3 className="text-xs sm:text-xs font-medium text-gray-900 truncate">업무정보</h3>
                  </div>
                  <div>
                    <p className="text-xs sm:text-xs font-medium text-gray-900 truncate">
                      {createProgressStatus || '미선택'}
                    </p>
                  </div>
                </div>

                {/* 일정 관리 카드 */}
                <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-md p-2 border border-blue-200">
                  <div className="flex items-center gap-1 mb-1">
                    <div className="bg-blue-600 rounded-sm p-1">
                      <Calendar className="w-2 h-2 sm:w-3 sm:h-3 text-white" />
                    </div>
                    <h3 className="text-xs sm:text-xs font-medium text-gray-900 truncate">일정</h3>
                  </div>
                  <div>
                    <p className="text-xs sm:text-xs font-medium text-gray-900 truncate">
                      {createTaskForm.startDate ? new Date(createTaskForm.startDate).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' }) : '미설정'}
                    </p>
                  </div>
                </div>

                {/* 담당자 배정 카드 */}
                <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-md p-2 border border-purple-200">
                  <div className="flex items-center gap-1 mb-1">
                    <div className="bg-purple-600 rounded-sm p-1">
                      <User className="w-2 h-2 sm:w-3 sm:h-3 text-white" />
                    </div>
                    <h3 className="text-xs sm:text-xs font-medium text-gray-900 truncate">우선순위</h3>
                  </div>
                  <div>
                    <p className="text-xs sm:text-xs font-medium text-gray-900">
                      {createTaskForm.priority === 'high' ? '높음' :
                       createTaskForm.priority === 'medium' ? '보통' : '낮음'}
                    </p>
                  </div>
                </div>
              </div>

              {/* 수정 폼 */}
              <div className="bg-gray-50 rounded-xl p-3 sm:p-4">
                <h3 className="text-base font-semibold text-gray-900 mb-4">업무 정보 입력</h3>
                <div className="space-y-4">
                {/* 사업장 선택 (기타 타입일 때는 선택사항) */}
                <div className="relative">
                  <label className="block text-xs sm:text-xs font-medium text-gray-700 mb-2">
                    사업장 {createTaskForm.type !== 'etc' && <span className="text-red-500">*</span>}
                  </label>
                  <input
                    type="text"
                    value={businessSearchTerm}
                    onChange={(e) => handleBusinessSearch(e.target.value)}
                    onFocus={() => setShowBusinessDropdown(businessSearchTerm.length >= 2)}
                    onKeyDown={(e) => handleBusinessKeyDown(e)}
                    placeholder="사업장명을 입력하세요 (최소 2글자)"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-xs sm:text-sm"
                  />

                  {/* 자동완성 드롭다운 */}
                  {showBusinessDropdown && filteredBusinesses.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                      {filteredBusinesses.map((business, index) => (
                        <div
                          key={business.id}
                          onClick={() => handleBusinessSelect(business)}
                          className={`p-3 cursor-pointer border-b border-gray-100 last:border-b-0 ${
                            index === selectedBusinessIndex
                              ? 'bg-blue-50 border-blue-200'
                              : 'hover:bg-gray-50'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="font-medium text-gray-900">{business.name}</div>
                            {business.progress_status && (
                              <span className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded-full ml-2">
                                {business.progress_status}
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-gray-500">{business.address}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* 진행구분 */}
                  <div>
                    <label className="block text-xs sm:text-xs font-medium text-gray-700 mb-2">
                      진행구분 <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={createProgressStatus}
                      onChange={(e) => handleCreateProgressStatusChange(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-xs sm:text-sm"
                    >
                      <option value="" disabled>진행구분 선택</option>
                      {progressCategoryOrder.map(ps => (
                        <option key={ps} value={ps}>{ps}</option>
                      ))}
                      {!progressCategoryOrder.includes('기타') && (
                        <option value="기타">기타 (사업장 없음)</option>
                      )}
                    </select>
                  </div>

                  {/* 우선순위 */}
                  <div>
                    <label className="block text-xs sm:text-xs font-medium text-gray-700 mb-2">우선순위</label>
                    <select
                      value={createTaskForm.priority}
                      onChange={(e) => setCreateTaskForm(prev => ({ ...prev, priority: e.target.value as Priority }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-xs sm:text-sm"
                    >
                      <option value="high">높음</option>
                      <option value="medium">보통</option>
                      <option value="low">낮음</option>
                    </select>
                  </div>
                </div>

                {/* 현재 단계 (필수) */}
                <div>
                  <label className="block text-xs sm:text-xs font-medium text-gray-700 mb-2">
                    현재 단계 <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={createTaskForm.status}
                    onChange={(e) => setCreateTaskForm(prev => ({ ...prev, status: e.target.value as TaskStatus }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-xs sm:text-sm"
                    required
                  >
                    {(createTaskForm.type === 'self' ? selfSteps :
                     createTaskForm.type === 'subsidy' ? subsidySteps :
                     createTaskForm.type === 'dealer' ? dealerSteps :
                     createTaskForm.type === 'outsourcing' ? outsourcingSteps :
                     createTaskForm.type === 'etc' ? etcSteps : asSteps).map(step => (
                      <option key={step.status} value={step.status}>{step.label}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* 담당자 (다중 선택) */}
                  <div className="md:col-span-3">
                    <label className="block text-xs sm:text-xs font-medium text-gray-700 mb-2">
                      담당자 <span className="text-gray-500 text-xs">(여러 명 선택 가능)</span>
                    </label>
                    <MultiAssigneeSelector
                      selectedAssignees={createTaskForm.assignees}
                      onAssigneesChange={(assignees) => setCreateTaskForm(prev => ({
                        ...prev,
                        assignees,
                        assignee: assignees.length > 0 ? assignees[0].name : ''
                      }))}
                      placeholder="담당자를 검색하여 선택하세요"
                      maxAssignees={5}
                      showCurrentUserFirst={true}
                      className="w-full"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

                  {/* 시작일 */}
                  <div>
                    <label className="block text-xs sm:text-xs font-medium text-gray-700 mb-2">시작일</label>
                    <input
                      type="date"
                      value={createTaskForm.startDate}
                      onChange={(e) => setCreateTaskForm(prev => ({ ...prev, startDate: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-xs sm:text-sm"
                    />
                  </div>

                  {/* 마감일 */}
                  <div>
                    <label className="block text-xs sm:text-xs font-medium text-gray-700 mb-2">마감일</label>
                    <input
                      type="date"
                      value={createTaskForm.dueDate}
                      onChange={(e) => setCreateTaskForm(prev => ({ ...prev, dueDate: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-xs sm:text-sm"
                    />
                  </div>
                </div>


                {/* 업무 설명 */}
                <div>
                  <label className="block text-xs sm:text-xs font-medium text-gray-700 mb-2">업무 설명</label>
                  <textarea
                    ref={createDescriptionRef}
                    value={createTaskForm.description}
                    onChange={(e) => {
                      setCreateTaskForm(prev => ({ ...prev, description: e.target.value }))
                      // Auto-resize
                      const target = e.target as HTMLTextAreaElement
                      target.style.height = 'auto'
                      target.style.height = Math.min(target.scrollHeight, window.innerHeight * 0.5) + 'px'
                    }}
                    placeholder="업무에 대한 설명을 입력하세요"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none text-xs sm:text-sm"
                    style={{ minHeight: '80px', maxHeight: '50vh' }}
                  />
                </div>

                {/* 메모 */}
                <div>
                  <label className="block text-xs sm:text-xs font-medium text-gray-700 mb-2">메모</label>
                  <textarea
                    ref={createNotesRef}
                    value={createTaskForm.notes}
                    onChange={(e) => {
                      setCreateTaskForm(prev => ({ ...prev, notes: e.target.value }))
                      // Auto-resize
                      const target = e.target as HTMLTextAreaElement
                      target.style.height = 'auto'
                      target.style.height = Math.min(target.scrollHeight, window.innerHeight * 0.5) + 'px'
                    }}
                    placeholder="메모나 추가 정보를 입력하세요"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none text-xs sm:text-sm"
                    style={{ minHeight: '60px', maxHeight: '50vh' }}
                  />
                </div>
                </div>

                {/* 하단 여백 */}
                <div className="mt-4"></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 업무 상세/수정 모달 */}
      {showEditModal && editingTask && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 backdrop-blur-sm p-2 sm:p-4">
          <div className="bg-white rounded-xl sm:rounded-2xl shadow-2xl w-full max-w-7xl max-h-[98vh] sm:max-h-[95vh] overflow-hidden">
            {/* 세련된 헤더 섹션 */}
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-4 sm:px-6 py-3 sm:py-4 text-white">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                  <div className="bg-white bg-opacity-20 rounded-xl p-2 sm:p-2.5 flex-shrink-0">
                    <Building2 className="w-4 h-4 sm:w-5 sm:h-5" />
                  </div>
                  <div className="min-w-0 flex-1 max-w-[200px] sm:max-w-[300px]">
                    <h1 className="text-base sm:text-xl font-bold truncate" title={editingTask.title}>{editingTask.title}</h1>
                    <p className="text-blue-100 mt-0.5 text-xs sm:text-xs truncate" title={editingTask.businessName}>{editingTask.businessName}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                  <span className={`inline-flex px-2 sm:px-3 py-1 text-xs sm:text-sm rounded-full font-medium flex-shrink-0 ${
                    editingTask.type === 'self'
                      ? 'bg-blue-100 text-blue-800'
                      : editingTask.type === 'subsidy'
                      ? 'bg-purple-100 text-purple-800'
                      : editingTask.type === 'dealer'
                      ? 'bg-cyan-100 text-cyan-800'
                      : editingTask.type === 'outsourcing'
                      ? 'bg-indigo-100 text-indigo-800'
                      : editingTask.type === 'etc'
                      ? 'bg-gray-100 text-gray-800'
                      : 'bg-orange-100 text-orange-800'
                  }`}>
                    {editingTask.type === 'self' ? '자비' :
                     editingTask.type === 'subsidy' ? '보조금' :
                     editingTask.type === 'dealer' ? '대리점' :
                     editingTask.type === 'outsourcing' ? '외주설치' :
                     editingTask.type === 'etc' ? '기타' : 'AS'}
                  </span>

                  {/* 액션 버튼들 */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => handleDeleteTask(editingTask.id)}
                      className="px-2 sm:px-3 py-1 sm:py-1.5 text-white bg-red-500 bg-opacity-90 rounded-md hover:bg-red-600 transition-all font-medium text-xs sm:text-sm"
                    >
                      삭제
                    </button>
                    <button
                      onClick={() => {
                        setShowEditModal(false)
                        setEditingTask(null)
                        setMemoInput('')
                        setPendingMemo(null)
                      }}
                      className="px-2 sm:px-3 py-1 sm:py-1.5 text-white bg-white bg-opacity-20 rounded-md hover:bg-opacity-30 transition-all font-medium backdrop-blur-sm border border-white border-opacity-30 text-xs sm:text-sm"
                    >
                      취소
                    </button>
                    <button
                      onClick={handleUpdateTask}
                      className="px-3 sm:px-4 py-1 sm:py-1.5 bg-white text-blue-700 rounded-md hover:bg-blue-50 transition-all font-medium shadow-lg text-xs sm:text-sm"
                    >
                      <span className="hidden sm:inline">저장</span>
                      <span className="sm:hidden">저장</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* 2컬럼 레이아웃 (2:1 비율) */}
            <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] h-[calc(98vh-120px)] sm:h-[calc(95vh-120px)] overflow-hidden">
              {/* 왼쪽: 업무 수정 폼 */}
              <div className="p-3 sm:p-6 overflow-y-auto border-r border-gray-200 h-full">
              {/* 핵심 정보 카드들 */}
              <div className="grid grid-cols-3 gap-1 sm:gap-2 mb-3 sm:mb-3">
                {/* 진행 상태 카드 */}
                <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-md p-2 border border-green-200">
                  <div className="flex items-center gap-1 mb-1">
                    <div className="bg-green-600 rounded-sm p-1">
                      <CheckCircle className="w-2 h-2 sm:w-3 sm:h-3 text-white" />
                    </div>
                    <h3 className="text-xs sm:text-xs font-medium text-gray-900 truncate">진행</h3>
                  </div>
                  <div>
                    <p className="text-xs sm:text-xs font-medium text-gray-900 truncate">
                      {getStatusLabel(editingTask.type, editingTask.status)}
                    </p>
                  </div>
                </div>

                {/* 우선순위 카드 */}
                <div className={`rounded-md p-2 border ${
                  editingTask.priority === 'high'
                    ? 'bg-gradient-to-br from-red-50 to-red-100 border-red-200'
                    : editingTask.priority === 'medium'
                    ? 'bg-gradient-to-br from-yellow-50 to-yellow-100 border-yellow-200'
                    : 'bg-gradient-to-br from-green-50 to-green-100 border-green-200'
                }`}>
                  <div className="flex items-center gap-1 mb-1">
                    <div className={`rounded-sm p-1 ${
                      editingTask.priority === 'high'
                        ? 'bg-red-600'
                        : editingTask.priority === 'medium'
                        ? 'bg-yellow-600'
                        : 'bg-green-600'
                    }`}>
                      <Flag className="w-2 h-2 sm:w-3 sm:h-3 text-white" />
                    </div>
                    <h3 className="text-xs sm:text-xs font-medium text-gray-900 truncate">우선</h3>
                  </div>
                  <div>
                    <p className="text-xs sm:text-xs font-medium text-gray-900">
                      {editingTask.priority === 'high' ? '높음' :
                       editingTask.priority === 'medium' ? '보통' : '낮음'}
                    </p>
                  </div>
                </div>

                {/* 담당자 카드 */}
                <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-md p-2 border border-blue-200">
                  <div className="flex items-center gap-1 mb-1">
                    <div className="bg-blue-600 rounded-sm p-1">
                      <User className="w-2 h-2 sm:w-3 sm:h-3 text-white" />
                    </div>
                    <h3 className="text-xs sm:text-xs font-medium text-gray-900 truncate">담당자</h3>
                  </div>
                  <div>
                    <p className="text-xs sm:text-xs font-medium text-gray-900 truncate">
                      {editingTask.assignee || '미배정'}
                    </p>
                  </div>
                </div>
              </div>

              {/* 수정 폼 */}
              <div className="bg-gray-50 rounded-xl p-3 sm:p-4">
                <h3 className="text-base font-semibold text-gray-900 mb-4">업무 정보 수정</h3>
                <div className="space-y-4">
                {/* 사업장 선택 (기타 타입일 때는 선택사항) */}
                <div className="relative">
                  <label className="block text-xs sm:text-xs font-medium text-gray-700 mb-2">
                    사업장 {editingTask?.type !== 'etc' && <span className="text-red-500">*</span>}
                  </label>
                  <input
                    type="text"
                    value={editBusinessSearchTerm}
                    onChange={(e) => handleBusinessSearch(e.target.value, true)}
                    onFocus={() => setShowEditBusinessDropdown(editBusinessSearchTerm.length >= 2)}
                    onKeyDown={(e) => handleBusinessKeyDown(e, true)}
                    placeholder="사업장명을 입력하세요 (최소 2글자)"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-xs sm:text-sm"
                  />

                  {/* 자동완성 드롭다운 */}
                  {showEditBusinessDropdown && filteredEditBusinesses.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                      {filteredEditBusinesses.map((business, index) => (
                        <div
                          key={business.id}
                          onClick={() => handleBusinessSelect(business, true)}
                          className={`p-3 cursor-pointer border-b border-gray-100 last:border-b-0 ${
                            index === editSelectedBusinessIndex
                              ? 'bg-blue-50 border-blue-200'
                              : 'hover:bg-gray-50'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="font-medium text-gray-900">{business.name}</div>
                            {business.progress_status && (
                              <span className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded-full ml-2">
                                {business.progress_status}
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-gray-500">{business.address}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* 업무 타입 */}
                  <div>
                    <label className="block text-xs sm:text-xs font-medium text-gray-700 mb-2">업무 타입</label>
                    <select
                      value={editingTask.type}
                      onChange={(e) => setEditingTask(prev => prev ? { ...prev, type: e.target.value as TaskType } : null)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-xs sm:text-sm"
                    >
                      <option value="self">자비</option>
                      <option value="subsidy">보조금</option>
                      <option value="dealer">대리점</option>
                      <option value="outsourcing">외주설치</option>
                      <option value="etc">기타</option>
                    </select>
                  </div>

                  {/* 우선순위 */}
                  <div>
                    <label className="block text-xs sm:text-xs font-medium text-gray-700 mb-2">우선순위</label>
                    <select
                      value={editingTask.priority}
                      onChange={(e) => setEditingTask(prev => prev ? { ...prev, priority: e.target.value as Priority } : null)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-xs sm:text-sm"
                    >
                      <option value="high">높음</option>
                      <option value="medium">보통</option>
                      <option value="low">낮음</option>
                    </select>
                  </div>
                </div>

                {/* 현재 단계 (필수) */}
                <div>
                  <label className="block text-xs sm:text-xs font-medium text-gray-700 mb-2">
                    현재 단계 <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={editingTask.status}
                    required
                    onChange={(e) => setEditingTask(prev => prev ? { ...prev, status: e.target.value as TaskStatus } : null)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    {(editingTask.type === 'self' ? selfSteps :
                     editingTask.type === 'subsidy' ? subsidySteps :
                     editingTask.type === 'dealer' ? dealerSteps :
                     editingTask.type === 'outsourcing' ? outsourcingSteps :
                     editingTask.type === 'etc' ? etcSteps : asSteps).map(step => (
                      <option key={step.status} value={step.status}>{step.label}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* 담당자 (다중 선택) */}
                  <div className="md:col-span-3">
                    <label className="block text-xs sm:text-xs font-medium text-gray-700 mb-2">
                      담당자 <span className="text-gray-500 text-xs">(여러 명 선택 가능)</span>
                    </label>
                    <MultiAssigneeSelector
                      selectedAssignees={editingTask.assignees || []}
                      onAssigneesChange={(assignees) => setEditingTask(prev => prev ? {
                        ...prev,
                        assignees,
                        assignee: assignees.length > 0 ? assignees[0].name : undefined
                      } : null)}
                      placeholder="담당자를 검색하여 선택하세요"
                      maxAssignees={5}
                      showCurrentUserFirst={true}
                      className="w-full"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

                  {/* 시작일 */}
                  <div>
                    <label className="block text-xs sm:text-xs font-medium text-gray-700 mb-2">시작일</label>
                    <input
                      type="date"
                      value={editingTask.startDate || ''}
                      onChange={(e) => setEditingTask(prev => prev ? { ...prev, startDate: e.target.value || undefined } : null)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-xs sm:text-sm"
                    />
                  </div>

                  {/* 마감일 */}
                  <div>
                    <label className="block text-xs sm:text-xs font-medium text-gray-700 mb-2">마감일</label>
                    <input
                      type="date"
                      value={editingTask.dueDate || ''}
                      onChange={(e) => setEditingTask(prev => prev ? { ...prev, dueDate: e.target.value || undefined } : null)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-xs sm:text-sm"
                    />
                  </div>
                </div>


                {/* 업무 설명 */}
                <div>
                  <label className="block text-xs sm:text-xs font-medium text-gray-700 mb-2">
                    업무 설명 <span className="text-gray-400">(우측 하단을 드래그하여 크기 조정)</span>
                  </label>
                  <textarea
                    ref={editDescriptionRef}
                    value={editingTask.description || ''}
                    onChange={(e) => {
                      setEditingTask(prev => prev ? { ...prev, description: e.target.value || undefined } : null)
                    }}
                    onMouseUp={(e) => {
                      // 사용자가 크기 조정 후 높이를 업무 id별로 저장
                      const target = e.target as HTMLTextAreaElement
                      if (editingTask?.id && target.style.height) {
                        try {
                          localStorage.setItem(`task-desc-height-${editingTask.id}`, target.style.height)
                        } catch {}
                      }
                    }}
                    placeholder="업무에 대한 설명을 입력하세요"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent resize-y text-xs sm:text-sm whitespace-pre-wrap"
                    style={{ minHeight: '80px' }}
                  />
                </div>

                {/* 메모 */}
                <div>
                  <label className="block text-xs sm:text-xs font-medium text-gray-700 mb-2">메모</label>
                  <div className="flex gap-2 items-start">
                    <textarea
                      ref={editNotesRef}
                      value={memoInput}
                      onChange={(e) => {
                        setMemoInput(e.target.value)
                        // Auto-resize
                        const target = e.target as HTMLTextAreaElement
                        target.style.height = 'auto'
                        target.style.height = Math.min(target.scrollHeight, window.innerHeight * 0.5) + 'px'
                      }}
                      placeholder="우측 업무진행현황 메모에 기록할 내용을 입력하세요"
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none text-xs sm:text-sm"
                      style={{ minHeight: '60px', maxHeight: '50vh' }}
                    />
                    <button
                      type="button"
                      onClick={handleAddMemo}
                      disabled={!memoInput.trim() || isMemoSubmitting}
                      className="flex-shrink-0 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-xs sm:text-sm font-medium whitespace-nowrap"
                    >
                      {isMemoSubmitting ? '기록 중...' : '기록 추가'}
                    </button>
                  </div>
                </div>

                {/* 단계 이력 */}
                <div className="border border-gray-200 rounded-lg p-4 bg-white">
                  <button
                    type="button"
                    onClick={() => setShowEditHistory(!showEditHistory)}
                    className="w-full flex items-center justify-between mb-3 group"
                  >
                    <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                      <History className="w-4 h-4 text-purple-600" />
                      단계 이력
                    </h3>
                    <span className="text-xs text-gray-500 group-hover:text-gray-700">
                      {showEditHistory ? '접기' : '펼치기'}
                    </span>
                  </button>
                  {showEditHistory && (
                    <div className="mt-4">
                      <TaskHistoryTimeline taskId={editingTask.id} />
                    </div>
                  )}
                </div>
                </div>

                {/* 하단 여백 */}
                <div className="mt-4"></div>
              </div>
              </div>

              {/* 오른쪽: 사업장 정보 패널 */}
              <div className="overflow-y-auto bg-gray-50 h-full">
                <BusinessInfoPanel
                  key={editingTask.businessId || 'empty'}
                  businessId={editingTask.businessId || null}
                  businessName={editingTask.businessName}
                  taskId={editingTask.id}
                  onModalClose={() => setEditingTask(null)}
                  pendingMemo={pendingMemo}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 엑셀 일괄 등록 모달 */}
      {showBulkUploadModal && (
        <BulkUploadModal
          onClose={() => setShowBulkUploadModal(false)}
          onSuccess={() => {
            setShowBulkUploadModal(false)
            fetchTasks() // 업무 목록 새로고침
          }}
        />
      )}

      {/* 중복 업무 관리 모달 */}
      <DuplicateTasksModal
        isOpen={showDuplicateModal}
        onClose={() => setShowDuplicateModal(false)}
        duplicates={duplicateGroups}
        summary={duplicateSummary}
        onDelete={deleteDuplicates}
      />
    </AdminLayout>
  );
}

export default withAuth(TaskManagementPage, undefined, 1)