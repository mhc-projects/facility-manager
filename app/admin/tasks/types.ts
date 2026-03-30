// 시설 업무 관리 타입 정의
import { SelectedAssignee } from '@/components/ui/MultiAssigneeSelector'

// ==================== 기본 타입 ====================

export type TaskType = 'self' | 'subsidy' | 'etc' | 'as' | 'dealer' | 'outsourcing'

export type TaskStatus =
  // 공통 단계
  | 'pending' | 'site_survey' | 'customer_contact' | 'site_inspection' | 'quotation' | 'contract'
  // 자비 단계
  | 'deposit_confirm' | 'product_order' | 'product_shipment' | 'installation_schedule'
  | 'installation' | 'balance_payment' | 'document_complete'
  // 보조금 단계
  | 'approval_pending' | 'approved' | 'rejected'
  | 'application_submit' | 'document_supplement' | 'document_preparation' | 'pre_construction_inspection'
  // 착공 보완 세분화
  | 'pre_construction_supplement_1st' | 'pre_construction_supplement_2nd'
  | 'pre_completion_document_submit' | 'completion_inspection'
  // 준공 보완 세분화
  | 'completion_supplement_1st' | 'completion_supplement_2nd' | 'completion_supplement_3rd'
  | 'final_document_submit' | 'subsidy_payment'
  // AS 전용 단계
  | 'as_customer_contact' | 'as_site_inspection' | 'as_quotation' | 'as_progress_confirm' | 'as_contract'
  | 'as_part_order' | 'as_completed'
  // 대리점 단계 (단순화)
  | 'dealer_order_received' | 'dealer_invoice_issued'
  | 'dealer_payment_confirmed' | 'dealer_product_ordered'
  // 기타 단계
  | 'etc_status'

export type Priority = 'high' | 'medium' | 'low'

// ==================== 인터페이스 ====================

export interface Task {
  id: string
  title: string
  businessName?: string
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
}

export interface CreateTaskForm {
  title: string
  businessName: string
  // type: UI 단계 목록 표시 전용 (API 전송 안 함)
  // 실제 task_type은 서버 View에서 business_info.progress_status 기반으로 자동 파생됨
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

export interface BusinessOption {
  id: string
  name: string
  address: string
  progress_status?: string // 진행구분 (자비, 보조금, AS, 대리점 등)
}

export interface StepInfo {
  status: TaskStatus
  label: string
  color: string
}

// ==================== 단계 정의 상수 ====================

// 상태별 단계 정의 (자비)
export const selfSteps: StepInfo[] = [
  { status: 'customer_contact', label: '고객 상담', color: 'blue' },
  { status: 'site_inspection', label: '현장 실사', color: 'yellow' },
  { status: 'quotation', label: '견적서 작성', color: 'orange' },
  { status: 'contract', label: '계약 체결', color: 'purple' },
  { status: 'deposit_confirm', label: '계약금 확인', color: 'indigo' },
  { status: 'product_order', label: '제품 발주', color: 'cyan' },
  { status: 'product_shipment', label: '제품 출고', color: 'emerald' },
  { status: 'installation_schedule', label: '설치 협의', color: 'teal' },
  { status: 'installation', label: '제품 설치', color: 'green' },
  { status: 'balance_payment', label: '잔금 입금', color: 'lime' },
  { status: 'document_complete', label: '서류 발송 완료', color: 'green' }
]

// 상태별 단계 정의 (보조금)
export const subsidySteps: StepInfo[] = [
  { status: 'customer_contact', label: '고객 상담', color: 'blue' },
  { status: 'site_inspection', label: '현장 실사', color: 'yellow' },
  { status: 'quotation', label: '견적서 작성', color: 'orange' },
  { status: 'application_submit', label: '신청서 제출', color: 'purple' },
  // 보조금 승인 단계
  { status: 'approval_pending', label: '보조금 승인대기', color: 'sky' },
  { status: 'approved', label: '보조금 승인', color: 'lime' },
  { status: 'rejected', label: '보조금 탈락', color: 'red' },
  { status: 'document_supplement', label: '서류 보완', color: 'pink' },
  { status: 'pre_construction_inspection', label: '착공 전 실사', color: 'indigo' },
  // 착공 보완 세분화
  { status: 'pre_construction_supplement_1st', label: '착공 보완 1차', color: 'rose' },
  { status: 'pre_construction_supplement_2nd', label: '착공 보완 2차', color: 'fuchsia' },
  { status: 'product_order', label: '제품 발주', color: 'cyan' },
  { status: 'product_shipment', label: '제품 출고', color: 'emerald' },
  { status: 'installation_schedule', label: '설치 협의', color: 'teal' },
  { status: 'installation', label: '제품 설치', color: 'green' },
  { status: 'pre_completion_document_submit', label: '준공실사 전 서류 제출', color: 'amber' },
  { status: 'completion_inspection', label: '준공 실사', color: 'violet' },
  // 준공 보완 세분화
  { status: 'completion_supplement_1st', label: '준공 보완 1차', color: 'slate' },
  { status: 'completion_supplement_2nd', label: '준공 보완 2차', color: 'zinc' },
  { status: 'completion_supplement_3rd', label: '준공 보완 3차', color: 'stone' },
  { status: 'final_document_submit', label: '보조금지급신청서 제출', color: 'gray' },
  { status: 'subsidy_payment', label: '보조금 입금', color: 'green' }
]

// 상태별 단계 정의 (기타)
export const etcSteps: StepInfo[] = [
  { status: 'etc_status', label: '기타', color: 'gray' }
]

// 상태별 단계 정의 (AS)
export const asSteps: StepInfo[] = [
  { status: 'as_customer_contact', label: 'AS 고객 상담', color: 'blue' },
  { status: 'as_site_inspection', label: 'AS 현장 확인', color: 'yellow' },
  { status: 'as_quotation', label: 'AS 견적 작성', color: 'orange' },
  { status: 'as_contract', label: 'AS 계약 체결', color: 'purple' },
  { status: 'as_part_order', label: 'AS 부품 발주', color: 'cyan' },
  { status: 'as_completed', label: 'AS 완료', color: 'green' }
]

// 상태별 단계 정의 (대리점) - 단순화
export const dealerSteps: StepInfo[] = [
  { status: 'dealer_order_received', label: '발주 수신', color: 'blue' },
  { status: 'dealer_invoice_issued', label: '계산서 발행', color: 'yellow' },
  { status: 'dealer_payment_confirmed', label: '입금 확인', color: 'green' },
  { status: 'dealer_product_ordered', label: '제품 발주', color: 'emerald' }
]

// ==================== 유틸리티 함수 ====================

/**
 * 업무 타입과 상태에 따라 진행률을 자동 계산
 * @param type 업무 타입 (self, subsidy, etc, as)
 * @param status 현재 업무 상태
 * @returns 진행률 (0-100%)
 */
export const calculateProgressPercentage = (type: TaskType, status: TaskStatus): number => {
  const steps = type === 'self' ? selfSteps :
                type === 'subsidy' ? subsidySteps :
                type === 'dealer' ? dealerSteps :
                type === 'etc' ? etcSteps : asSteps

  const currentStepIndex = steps.findIndex(step => step.status === status)

  if (currentStepIndex === -1) {
    return 0 // 단계를 찾을 수 없으면 0%
  }

  // 현재 단계 / 전체 단계 * 100 (소수점 첫째자리 반올림)
  const progress = ((currentStepIndex + 1) / steps.length) * 100
  return Math.round(progress)
}

/**
 * 업무 타입에 따른 단계 정보 배열 반환
 * @param type 업무 타입
 * @returns 단계 정보 배열
 */
export const getStepsByType = (type: TaskType): StepInfo[] => {
  switch (type) {
    case 'self':
      return selfSteps
    case 'subsidy':
      return subsidySteps
    case 'dealer':
      return dealerSteps
    case 'as':
      return asSteps
    case 'etc':
    default:
      return etcSteps
  }
}

/**
 * 상태에 해당하는 단계 정보 반환
 * @param type 업무 타입
 * @param status 현재 상태
 * @returns 단계 정보 또는 undefined
 */
export const getStepInfo = (type: TaskType, status: TaskStatus): StepInfo | undefined => {
  const steps = getStepsByType(type)
  return steps.find(step => step.status === status)
}
