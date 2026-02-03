// lib/task-steps.ts - 업무 단계 정의 공유 모듈 (완전 prefix 적용 버전)
// admin/tasks 페이지의 단계 정의를 공통 모듈로 추출

// 업무 타입 정의
export type TaskType = 'self' | 'subsidy' | 'etc' | 'as' | 'dealer' | 'outsourcing'

// 업무 상태 정의 (완전 prefix 적용)
export type TaskStatus =
  // 확인필요 단계 (각 업무 타입별)
  | 'self_needs_check' | 'subsidy_needs_check' | 'as_needs_check' | 'dealer_needs_check' | 'outsourcing_needs_check' | 'etc_needs_check'
  // 자비 공통 단계
  | 'self_customer_contact' | 'self_site_inspection' | 'self_quotation' | 'self_contract'
  // 보조금 공통 단계
  | 'subsidy_customer_contact' | 'subsidy_site_inspection' | 'subsidy_quotation' | 'subsidy_contract'
  // AS 공통 단계 (기존 as_ prefix와 통합)
  // dealer 공통 단계 (필요시 추가)
  // outsourcing 공통 단계 (필요시 추가)
  // 자비 전용 단계 (self_ prefix)
  | 'self_deposit_confirm' | 'self_product_order' | 'self_product_shipment' | 'self_installation_schedule'
  | 'self_installation' | 'self_balance_payment' | 'self_document_complete'
  // 보조금 전용 단계 (subsidy_ prefix)
  | 'subsidy_document_preparation' | 'subsidy_application_submit' | 'subsidy_approval_pending' | 'subsidy_approved' | 'subsidy_rejected'
  | 'subsidy_document_supplement' | 'subsidy_pre_construction_inspection'
  | 'subsidy_pre_construction_supplement_1st' | 'subsidy_pre_construction_supplement_2nd'
  | 'subsidy_construction_report_submit' | 'subsidy_product_order' | 'subsidy_product_shipment' | 'subsidy_installation_schedule'
  | 'subsidy_installation' | 'subsidy_pre_completion_document_submit' | 'subsidy_completion_inspection'
  | 'subsidy_completion_supplement_1st' | 'subsidy_completion_supplement_2nd' | 'subsidy_completion_supplement_3rd'
  | 'subsidy_final_document_submit' | 'subsidy_payment'
  // AS 전용 단계 (as_ prefix)
  | 'as_customer_contact' | 'as_site_inspection' | 'as_quotation' | 'as_contract'
  | 'as_part_order' | 'as_completed'
  // 대리점 단계 (dealer_ prefix)
  | 'dealer_order_received' | 'dealer_invoice_issued' | 'dealer_payment_confirmed' | 'dealer_product_ordered'
  // 외주설치 단계 (outsourcing_ prefix)
  | 'outsourcing_order' | 'outsourcing_schedule' | 'outsourcing_in_progress' | 'outsourcing_completed'
  // 기타 단계
  | 'etc_status'

// 단계 정의 타입
export interface TaskStep {
  status: TaskStatus
  label: string
  color: string
}

// 상태별 단계 정의 (자비) - 모든 status에 self_ prefix 적용
export const selfSteps: TaskStep[] = [
  { status: 'self_needs_check', label: '확인필요', color: 'red' },
  { status: 'self_customer_contact', label: '고객 상담', color: 'blue' },
  { status: 'self_site_inspection', label: '현장 실사', color: 'yellow' },
  { status: 'self_quotation', label: '견적서 작성', color: 'orange' },
  { status: 'self_contract', label: '계약 체결', color: 'purple' },
  { status: 'self_deposit_confirm', label: '계약금 확인', color: 'indigo' },
  { status: 'self_product_order', label: '제품 발주', color: 'cyan' },
  { status: 'self_product_shipment', label: '제품 출고', color: 'emerald' },
  { status: 'self_installation_schedule', label: '설치 협의', color: 'teal' },
  { status: 'self_installation', label: '제품 설치', color: 'green' },
  { status: 'self_balance_payment', label: '잔금 입금', color: 'lime' },
  { status: 'self_document_complete', label: '서류 발송 완료', color: 'green' }
]

// 상태별 단계 정의 (보조금) - 모든 status에 subsidy_ prefix 적용
export const subsidySteps: TaskStep[] = [
  { status: 'subsidy_needs_check', label: '확인필요', color: 'red' },
  { status: 'subsidy_customer_contact', label: '고객 상담', color: 'blue' },
  { status: 'subsidy_site_inspection', label: '현장 실사', color: 'yellow' },
  { status: 'subsidy_quotation', label: '견적서 작성', color: 'orange' },
  { status: 'subsidy_contract', label: '계약 체결', color: 'purple' },
  { status: 'subsidy_document_preparation', label: '신청서 작성 필요', color: 'amber' },
  { status: 'subsidy_application_submit', label: '신청서 제출', color: 'purple' },
  { status: 'subsidy_approval_pending', label: '보조금 승인대기', color: 'sky' },
  { status: 'subsidy_approved', label: '보조금 승인', color: 'lime' },
  { status: 'subsidy_rejected', label: '보조금 탈락', color: 'red' },
  { status: 'subsidy_document_supplement', label: '신청서 보완', color: 'pink' },
  { status: 'subsidy_pre_construction_inspection', label: '착공 전 실사', color: 'indigo' },
  { status: 'subsidy_pre_construction_supplement_1st', label: '착공 보완 1차', color: 'rose' },
  { status: 'subsidy_pre_construction_supplement_2nd', label: '착공 보완 2차', color: 'fuchsia' },
  { status: 'subsidy_construction_report_submit', label: '착공신고서 제출', color: 'blue' },
  { status: 'subsidy_product_order', label: '제품 발주', color: 'cyan' },
  { status: 'subsidy_product_shipment', label: '제품 출고', color: 'emerald' },
  { status: 'subsidy_installation_schedule', label: '설치예정', color: 'teal' },
  { status: 'subsidy_installation', label: '설치완료', color: 'green' },
  { status: 'subsidy_pre_completion_document_submit', label: '준공도서 작성 필요', color: 'amber' },
  { status: 'subsidy_completion_inspection', label: '준공 실사', color: 'violet' },
  { status: 'subsidy_completion_supplement_1st', label: '준공 보완 1차', color: 'slate' },
  { status: 'subsidy_completion_supplement_2nd', label: '준공 보완 2차', color: 'zinc' },
  { status: 'subsidy_completion_supplement_3rd', label: '준공 보완 3차', color: 'stone' },
  { status: 'subsidy_final_document_submit', label: '보조금지급신청서 제출', color: 'gray' },
  { status: 'subsidy_payment', label: '보조금 입금', color: 'green' }
]

// 상태별 단계 정의 (기타)
export const etcSteps: TaskStep[] = [
  { status: 'etc_needs_check', label: '확인필요', color: 'red' },
  { status: 'etc_status', label: '기타', color: 'gray' }
]

// 상태별 단계 정의 (AS)
export const asSteps: TaskStep[] = [
  { status: 'as_needs_check', label: '확인필요', color: 'red' },
  { status: 'as_customer_contact', label: 'AS 고객 상담', color: 'blue' },
  { status: 'as_site_inspection', label: 'AS 현장 확인', color: 'yellow' },
  { status: 'as_quotation', label: 'AS 견적 작성', color: 'orange' },
  { status: 'as_contract', label: 'AS 계약 체결', color: 'purple' },
  { status: 'as_part_order', label: 'AS 부품 발주', color: 'cyan' },
  { status: 'as_completed', label: 'AS 완료', color: 'green' }
]

// 상태별 단계 정의 (대리점) - 단순화
export const dealerSteps: TaskStep[] = [
  { status: 'dealer_needs_check', label: '확인필요', color: 'red' },
  { status: 'dealer_order_received', label: '발주 수신', color: 'blue' },
  { status: 'dealer_invoice_issued', label: '계산서 발행', color: 'yellow' },
  { status: 'dealer_payment_confirmed', label: '입금 확인', color: 'green' },
  { status: 'dealer_product_ordered', label: '제품 발주', color: 'emerald' }
]

// 상태별 단계 정의 (외주설치)
export const outsourcingSteps: TaskStep[] = [
  { status: 'outsourcing_needs_check', label: '확인필요', color: 'red' },
  { status: 'outsourcing_order', label: '외주 발주', color: 'blue' },
  { status: 'outsourcing_schedule', label: '일정 조율', color: 'yellow' },
  { status: 'outsourcing_in_progress', label: '설치 진행 중', color: 'orange' },
  { status: 'outsourcing_completed', label: '설치 완료', color: 'green' }
]

/**
 * 업무 타입에 따른 단계 배열 반환
 * @param type - 업무 타입
 * @returns 해당 업무 타입의 단계 배열
 */
export function getStepsForType(type: TaskType): TaskStep[] {
  switch (type) {
    case 'self':
      return selfSteps
    case 'subsidy':
      return subsidySteps
    case 'dealer':
      return dealerSteps
    case 'outsourcing':
      return outsourcingSteps
    case 'etc':
      return etcSteps
    case 'as':
      return asSteps
    default:
      return etcSteps
  }
}

/**
 * 진행률 자동 계산 함수
 * @param type - 업무 타입
 * @param status - 현재 업무 상태
 * @returns 진행률 (0-100)
 */
export function calculateProgressPercentage(type: TaskType, status: TaskStatus): number {
  const steps = getStepsForType(type)
  const currentStepIndex = steps.findIndex(step => step.status === status)

  if (currentStepIndex === -1) {
    return 0 // 단계를 찾을 수 없으면 0%
  }

  // 현재 단계 / 전체 단계 * 100 (소수점 첫째자리 반올림)
  const progress = ((currentStepIndex + 1) / steps.length) * 100
  return Math.round(progress)
}

/**
 * 상태를 한글 라벨로 변환하는 헬퍼 함수
 * @param type - 업무 타입
 * @param status - 업무 상태
 * @returns 한글 라벨
 */
export function getStatusLabel(type: TaskType, status: TaskStatus): string {
  const steps = getStepsForType(type)
  const step = steps.find(s => s.status === status)

  if (step) {
    return step.label
  }

  // 타입이 맞지 않는 경우, 모든 steps 배열에서 검색
  const allSteps = [...selfSteps, ...subsidySteps, ...dealerSteps, ...outsourcingSteps, ...etcSteps, ...asSteps]
  const foundStep = allSteps.find(s => s.status === status)

  if (foundStep) {
    return foundStep.label
  }

  // 그래도 찾지 못한 경우, status 값을 사람이 읽을 수 있는 형태로 변환
  return status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
}

/**
 * 상태 색상 CSS 클래스 반환
 * @param type - 업무 타입
 * @param status - 업무 상태
 * @returns Tailwind CSS 색상 클래스
 */
export function getStatusColorClass(type: TaskType, status: TaskStatus): string {
  const steps = getStepsForType(type)
  const step = steps.find(s => s.status === status)

  if (step) {
    return step.color
  }

  // 기본 색상
  return 'gray'
}

/**
 * 모든 단계 배열 (중복 제거된 통합 배열)
 */
export const allSteps: TaskStep[] = [
  ...selfSteps,
  ...subsidySteps,
  ...dealerSteps,
  ...outsourcingSteps,
  ...etcSteps,
  ...asSteps
]
