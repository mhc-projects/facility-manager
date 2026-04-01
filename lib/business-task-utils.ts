// lib/business-task-utils.ts - 사업장 업무 상태 관련 유틸리티 함수들

import { TokenManager } from '@/lib/api-client';
import { TASK_STATUS_KR } from '@/lib/task-status-utils';

// 업무 타입 및 상태 타입 정의
export type TaskType = 'self' | 'subsidy' | 'etc' | 'as'
export type TaskStatus =
  | 'customer_contact' | 'site_inspection' | 'quotation' | 'contract'
  | 'deposit_confirm' | 'product_order' | 'product_shipment' | 'installation_schedule'
  | 'installation' | 'balance_payment' | 'document_complete'
  // 보조금 전용 단계
  | 'application_submit' | 'document_supplement' | 'pre_construction_inspection'
  | 'pre_construction_supplement' | 'completion_inspection' | 'completion_supplement'
  | 'final_document_submit' | 'subsidy_payment'
  // 기타 단계
  | 'etc_status'

export type Priority = 'high' | 'medium' | 'low'

export interface FacilityTask {
  id: string
  title: string
  businessName?: string
  task_type: TaskType
  status: TaskStatus
  priority: Priority
  assignee?: string
  assignees?: any[]
  startDate?: string
  dueDate?: string
  progressPercentage?: number
  delayStatus?: 'on_time' | 'at_risk' | 'delayed' | 'overdue'
  delayDays?: number
  created_at: string
  updated_at: string
  completed_at?: string
  description?: string
  notes?: string
}

// 업무 상태별 한글 레이블 매핑 (task-status-utils.ts의 TASK_STATUS_KR 사용)
// STATUS_LABELS는 TASK_STATUS_KR로 대체되었습니다.
// 아래 주석 처리된 코드는 레거시 참조용으로 보존합니다.
/*
const STATUS_LABELS: Record<string, string> = {
  // 자비/공통 단계
  customer_contact: '고객 상담',
  site_inspection: '현장 실사',
  quotation: '견적서 작성',
  contract: '계약 체결',
  deposit_confirm: '계약금 확인',
  product_order: '제품 발주',
  product_shipment: '제품 출고',
  installation_schedule: '설치예정',
  installation: '제품 설치',
  balance_payment: '잔금 입금',
  document_complete: '서류 발송 완료',

  // 보조금 전용 단계
  application_submit: '신청서 제출',
  document_supplement: '서류 보완',
  pre_construction_inspection: '착공 전 실사',
  pre_construction_supplement: '착공 보완',
  pre_construction_supplement_1st: '착공 보완 1차',
  pre_construction_supplement_2nd: '착공 보완 2차',
  pre_construction_supplement_3rd: '착공 보완 3차',
  completion_inspection: '준공 실사',
  completion_supplement: '준공 보완',
  completion_supplement_1st: '준공 보완 1차',
  completion_supplement_2nd: '준공 보완 2차',
  completion_supplement_3rd: '준공 보완 3차',
  final_document_submit: '서류 제출',
  subsidy_payment: '보조금 입금',

  // 기타
  etc_status: '기타'
}
*/

// 단계별 고유 색상 클래스 (우선순위 대신 단계로 통일감 부여)
const STATUS_COLORS: Record<string, string> = {
  // 확인필요 단계 (모든 타입)
  'self_needs_check': 'bg-red-100 text-red-800',
  'subsidy_needs_check': 'bg-red-100 text-red-800',
  'dealer_needs_check': 'bg-red-100 text-red-800',
  'as_needs_check': 'bg-red-100 text-red-800',
  'outsourcing_needs_check': 'bg-red-100 text-red-800',
  'etc_needs_check': 'bg-red-100 text-red-800',

  // 자비 단계 (self_ prefix)
  'self_customer_contact': 'bg-purple-100 text-purple-800',
  'self_site_inspection': 'bg-blue-100 text-blue-800',
  'self_quotation': 'bg-yellow-100 text-yellow-800',
  'self_contract': 'bg-green-100 text-green-800',
  'self_deposit_confirm': 'bg-emerald-100 text-emerald-800',
  'self_product_order': 'bg-indigo-100 text-indigo-800',
  'self_product_shipment': 'bg-cyan-100 text-cyan-800',
  'self_installation_schedule': 'bg-amber-100 text-amber-800',
  'self_installation': 'bg-orange-100 text-orange-800',
  'self_balance_payment': 'bg-teal-100 text-teal-800',
  'self_document_complete': 'bg-sky-100 text-sky-800',

  // 보조금 단계 (subsidy_ prefix)
  'subsidy_customer_contact': 'bg-purple-100 text-purple-800',
  'subsidy_site_inspection': 'bg-blue-100 text-blue-800',
  'subsidy_quotation': 'bg-yellow-100 text-yellow-800',
  'subsidy_contract': 'bg-green-100 text-green-800',
  'subsidy_document_preparation': 'bg-amber-100 text-amber-800',
  'subsidy_application_submit': 'bg-violet-100 text-violet-800',
  'subsidy_approval_pending': 'bg-sky-100 text-sky-800',
  'subsidy_approved': 'bg-lime-100 text-lime-800',
  'subsidy_rejected': 'bg-red-100 text-red-800',
  'subsidy_document_supplement': 'bg-yellow-100 text-yellow-800',
  'subsidy_pre_construction_inspection': 'bg-blue-100 text-blue-800',
  'subsidy_pre_construction_supplement_1st': 'bg-orange-100 text-orange-800',
  'subsidy_pre_construction_supplement_2nd': 'bg-orange-100 text-orange-800',
  'subsidy_construction_report_submit': 'bg-purple-100 text-purple-800',
  'subsidy_product_order': 'bg-indigo-100 text-indigo-800',
  'subsidy_product_shipment': 'bg-cyan-100 text-cyan-800',
  'subsidy_installation_schedule': 'bg-amber-100 text-amber-800',
  'subsidy_installation': 'bg-orange-100 text-orange-800',
  'subsidy_pre_completion_document_submit': 'bg-amber-100 text-amber-800',
  'subsidy_completion_inspection': 'bg-cyan-100 text-cyan-800',
  'subsidy_completion_supplement_1st': 'bg-amber-100 text-amber-800',
  'subsidy_completion_supplement_2nd': 'bg-amber-100 text-amber-800',
  'subsidy_completion_supplement_3rd': 'bg-amber-100 text-amber-800',
  'subsidy_final_document_submit': 'bg-green-100 text-green-800',
  'subsidy_payment': 'bg-emerald-100 text-emerald-800',

  // 대리점 단계 (dealer_ prefix)
  'dealer_order_received': 'bg-blue-100 text-blue-800',
  'dealer_invoice_issued': 'bg-green-100 text-green-800',
  'dealer_payment_confirmed': 'bg-emerald-100 text-emerald-800',
  'dealer_product_ordered': 'bg-indigo-100 text-indigo-800',

  // AS 단계 (as_ prefix)
  'as_customer_contact': 'bg-purple-100 text-purple-800',
  'as_site_inspection': 'bg-blue-100 text-blue-800',
  'as_quotation': 'bg-yellow-100 text-yellow-800',
  'as_contract': 'bg-green-100 text-green-800',
  'as_part_order': 'bg-indigo-100 text-indigo-800',
  'as_completed': 'bg-emerald-100 text-emerald-800',

  // 외주설치 단계 (outsourcing_ prefix)
  'outsourcing_order': 'bg-blue-100 text-blue-800',
  'outsourcing_schedule': 'bg-amber-100 text-amber-800',
  'outsourcing_in_progress': 'bg-orange-100 text-orange-800',
  'outsourcing_completed': 'bg-emerald-100 text-emerald-800',

  // 레거시 호환성 (구버전 status - prefix 없는 상태)
  customer_contact: 'bg-purple-100 text-purple-800',
  site_inspection: 'bg-blue-100 text-blue-800',
  quotation: 'bg-yellow-100 text-yellow-800',
  contract: 'bg-green-100 text-green-800',
  deposit_confirm: 'bg-emerald-100 text-emerald-800',
  product_order: 'bg-indigo-100 text-indigo-800',
  product_shipment: 'bg-cyan-100 text-cyan-800',
  installation_schedule: 'bg-amber-100 text-amber-800',
  installation: 'bg-orange-100 text-orange-800',
  balance_payment: 'bg-teal-100 text-teal-800',
  document_complete: 'bg-sky-100 text-sky-800',
  application_submit: 'bg-violet-100 text-violet-800',
  document_supplement: 'bg-yellow-100 text-yellow-800',
  pre_construction_inspection: 'bg-blue-100 text-blue-800',
  pre_construction_supplement: 'bg-orange-100 text-orange-800',
  pre_construction_supplement_1st: 'bg-orange-100 text-orange-800',
  pre_construction_supplement_2nd: 'bg-orange-100 text-orange-800',
  pre_construction_supplement_3rd: 'bg-orange-100 text-orange-800',
  completion_inspection: 'bg-cyan-100 text-cyan-800',
  completion_supplement: 'bg-amber-100 text-amber-800',
  completion_supplement_1st: 'bg-amber-100 text-amber-800',
  completion_supplement_2nd: 'bg-amber-100 text-amber-800',
  completion_supplement_3rd: 'bg-amber-100 text-amber-800',
  final_document_submit: 'bg-green-100 text-green-800',
  subsidy_payment: 'bg-emerald-100 text-emerald-800',

  // 기타
  etc_status: 'bg-gray-100 text-gray-600'
}

// 기본 색상 (업무 없음)
const DEFAULT_COLOR = 'bg-gray-100 text-gray-600'

// 완료 상태 색상
const COMPLETED_COLOR = 'bg-green-100 text-green-800'

/**
 * 특정 사업장의 업무 상태 정보를 조회합니다
 * @param businessName 사업장명
 * @param token 인증 토큰
 * @returns 업무 상태 정보
 */
export async function getBusinessTaskStatus(businessName: string, token?: string): Promise<{
  statusText: string
  colorClass: string
  lastUpdated: string
  taskCount: number
  hasActiveTasks: boolean
}> {
  try {
    // 토큰이 없으면 TokenManager에서 자동으로 가져오기
    const authToken = token || TokenManager.getToken()
    console.log('🔐 [BUSINESS-TASK-UTILS] 토큰 상태:', {
      providedToken: !!token,
      managerToken: !!TokenManager.getToken(),
      finalToken: !!authToken,
      tokenLength: authToken ? authToken.length : 0,
      businessName
    })

    // facility-tasks API 호출
    const headers: HeadersInit = {
      'Content-Type': 'application/json'
    }

    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`
      console.log('✅ [BUSINESS-TASK-UTILS] Authorization 헤더 설정됨')
    } else {
      console.warn('⚠️ [BUSINESS-TASK-UTILS] 토큰이 없어 Authorization 헤더 누락')
    }

    const response = await fetch(
      `/api/facility-tasks?businessName=${encodeURIComponent(businessName)}`,
      { headers }
    )

    if (!response.ok) {
      console.warn(`업무 조회 실패 (${businessName}):`, response.status)
      return {
        statusText: '업무 미등록',
        colorClass: DEFAULT_COLOR,
        lastUpdated: '',
        taskCount: 0,
        hasActiveTasks: false
      }
    }

    const data = await response.json()

    let tasks: FacilityTask[] = []
    if (data.success && data.data) {
      // data.data가 배열인지 확인
      if (Array.isArray(data.data)) {
        tasks = data.data
      } else if (data.data.tasks && Array.isArray(data.data.tasks)) {
        // data.data.tasks가 배열인 경우
        tasks = data.data.tasks
      } else {
        console.warn(`⚠️ 업무 데이터 형식 오류 (${businessName}):`, typeof data.data)
        tasks = []
      }
    }

    // 진행 중인 업무만 필터링 (완료되지 않은 업무)
    const activeTasks = tasks.filter(task => !task.completed_at)

    if (activeTasks.length === 0) {
      // 완료된 업무가 있는지 확인
      const completedTasks = tasks.filter(task => task.completed_at)

      if (completedTasks.length > 0) {
        // 가장 최근 완료된 업무 정보
        const latestCompleted = completedTasks.sort((a, b) =>
          new Date(b.completed_at!).getTime() - new Date(a.completed_at!).getTime()
        )[0]

        return {
          statusText: '업무 완료',
          colorClass: COMPLETED_COLOR,
          lastUpdated: latestCompleted.completed_at!,
          taskCount: completedTasks.length,
          hasActiveTasks: false
        }
      }

      return {
        statusText: '업무 미등록',
        colorClass: DEFAULT_COLOR,
        lastUpdated: '',
        taskCount: 0,
        hasActiveTasks: false
      }
    }

    // 우선순위별 정렬 (high > medium > low)
    const priorityOrder = { high: 3, medium: 2, low: 1 }
    const sortedTasks = activeTasks.sort((a, b) => {
      const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority]
      if (priorityDiff !== 0) return priorityDiff

      // 우선순위가 같으면 최신 업데이트 순
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    })

    const topTask = sortedTasks[0]
    const statusLabel = TASK_STATUS_KR[topTask.status] || topTask.status

    // 상태 텍스트 생성
    let statusText: string
    if (activeTasks.length === 1) {
      statusText = statusLabel
    } else {
      statusText = `${statusLabel} 외 ${activeTasks.length - 1}건`
    }

    return {
      statusText,
      colorClass: STATUS_COLORS[topTask.status] || DEFAULT_COLOR,
      lastUpdated: topTask.updated_at,
      taskCount: activeTasks.length,
      hasActiveTasks: true
    }

  } catch (error) {
    console.error(`업무 상태 조회 오류 (${businessName}):`, error)
    return {
      statusText: '조회 실패',
      colorClass: DEFAULT_COLOR,
      lastUpdated: '',
      taskCount: 0,
      hasActiveTasks: false
    }
  }
}

/**
 * 다수 사업장의 업무 상태를 배치로 조회합니다 (성능 최적화)
 * @param businessNames 사업장명 배열
 * @param token 인증 토큰
 * @returns 사업장별 업무 상태 매핑
 */
export async function getBatchBusinessTaskStatuses(
  businessNames: string[],
  token?: string
): Promise<Record<string, {
  statusText: string
  colorClass: string
  lastUpdated: string
  taskCount: number
  hasActiveTasks: boolean
}>> {
  console.log(`🚀 [BATCH-API] 배치 조회 시작: ${businessNames.length}개 사업장`)

  try {
    // 토큰 준비
    const authToken = token || TokenManager.getToken()
    if (!authToken) {
      console.warn('⚠️ [BATCH-API] 토큰이 없어 개별 조회로 폴백')
      return await fallbackToIndividualCalls(businessNames.slice(0, 20))
    }

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`
    }

    // 배치 API 호출
    const response = await fetch('/api/facility-tasks/batch', {
      method: 'POST',
      headers,
      body: JSON.stringify({ businessNames })
    })

    if (!response.ok) {
      console.warn(`⚠️ [BATCH-API] 응답 오류 (${response.status}), 개별 조회로 폴백`)
      return await fallbackToIndividualCalls(businessNames.slice(0, 50)) // 배치 실패시 50개까지 시도
    }

    const data = await response.json()
    if (data.success && data.data?.businessStatuses) {
      console.log(`✅ [BATCH-API] 성공: ${Object.keys(data.data.businessStatuses).length}개 사업장`)
      return data.data.businessStatuses
    }

    console.warn('⚠️ [BATCH-API] 응답 형식 오류, 개별 조회로 폴백')
    return await fallbackToIndividualCalls(businessNames.slice(0, 50))

  } catch (error) {
    console.error('❌ [BATCH-API] 오류:', error)
    console.log('🔄 [BATCH-API] 개별 조회로 폴백')
    return await fallbackToIndividualCalls(businessNames.slice(0, 50))
  }
}

/**
 * 배치 API 실패시 개별 조회로 폴백
 */
async function fallbackToIndividualCalls(
  businessNames: string[],
  token?: string
): Promise<Record<string, {
  statusText: string
  colorClass: string
  lastUpdated: string
  taskCount: number
  hasActiveTasks: boolean
}>> {
  console.log(`🔄 [FALLBACK] 개별 조회 시작: ${businessNames.length}개 사업장`)

  const fallbackResults: Record<string, any> = {}

  for (const businessName of businessNames) {
    try {
      const status = await getBusinessTaskStatus(businessName, token)
      fallbackResults[businessName] = status
    } catch (error) {
      console.warn(`개별 조회 실패 (${businessName}):`, error)
      fallbackResults[businessName] = {
        statusText: '조회 실패',
        colorClass: 'bg-gray-100 text-gray-600',
        lastUpdated: '',
        taskCount: 0,
        hasActiveTasks: false
      }
    }
  }

  console.log(`✅ [FALLBACK] 완료: ${Object.keys(fallbackResults).length}개 사업장`)
  return fallbackResults
}

/**
 * 날짜를 상대적/절대적 형식으로 포맷팅합니다
 * @param dateString ISO 날짜 문자열
 * @returns 포맷된 날짜 문자열
 */
export function formatUpdateDate(dateString: string): string {
  if (!dateString) return ''

  try {
    const now = new Date()
    const date = new Date(dateString)
    const diffMs = now.getTime() - date.getTime()
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffDays = Math.floor(diffHours / 24)

    if (diffMs < 0) return '미래 날짜' // 예외 처리
    if (diffMs < 60 * 1000) return '방금 전'
    if (diffMs < 60 * 60 * 1000) return `${Math.floor(diffMs / (1000 * 60))}분 전`
    if (diffHours < 24) return `${diffHours}시간 전`
    if (diffDays === 1) return '1일 전'
    if (diffDays < 7) return `${diffDays}일 전`
    if (diffDays < 14) return '1주일 전'
    if (diffDays < 30) return `${Math.ceil(diffDays / 7)}주일 전`

    // 30일 이상이면 날짜 표시
    return date.toLocaleDateString('ko-KR', {
      month: 'numeric',
      day: 'numeric'
    })
  } catch (error) {
    console.error('날짜 포맷팅 오류:', error)
    return '날짜 오류'
  }
}

/**
 * 업무 상태 요약 문자열을 생성합니다
 * @param taskCount 업무 개수
 * @param hasActiveTasks 활성 업무 여부
 * @param lastUpdated 마지막 업데이트 날짜
 * @returns 요약 문자열
 */
export function getTaskSummary(taskCount: number, hasActiveTasks: boolean, lastUpdated: string): string {
  if (!hasActiveTasks) {
    if (taskCount === 0) return '등록 필요'
    return `완료 (${formatUpdateDate(lastUpdated)})`
  }

  return `${formatUpdateDate(lastUpdated)} 업데이트`
}