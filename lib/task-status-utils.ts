/**
 * 업무 상태 코드를 한글로 변환하는 유틸리티 함수들
 */

// 업무 상태 한글 매핑
export const TASK_STATUS_KR: { [key: string]: string } = {
  // 확인필요 단계 (각 업무 타입별)
  'self_needs_check': '확인필요',
  'subsidy_needs_check': '확인필요',
  'as_needs_check': '확인필요',
  'dealer_needs_check': '확인필요',
  'outsourcing_needs_check': '확인필요',
  'etc_needs_check': '확인필요',

  // 자비 업무 단계
  'customer_contact': '고객 상담',
  'site_inspection': '현장 실사',
  'quotation': '견적서 작성',
  'contract': '계약 체결',
  'deposit_confirm': '계약금 확인',
  'product_order': '제품 발주',
  'product_shipment': '제품 출고',
  'installation_schedule': '설치예정',
  'installation': '설치완료',
  'balance_payment': '잔금 입금',
  'document_complete': '서류 발송 완료',

  // 보조금 업무 단계
  'document_preparation': '신청서 작성 필요',
  'application_submit': '신청서 제출',
  'approval_pending': '보조금 승인대기',
  'approved': '보조금 승인',
  'rejected': '보조금 탈락',
  'document_supplement': '신청서 보완',
  'pre_construction_inspection': '착공 전 실사',
  'pre_construction_supplement_1st': '착공 보완 1차',
  'pre_construction_supplement_2nd': '착공 보완 2차',
  'construction_report_submit': '착공신고서 제출',
  'pre_completion_document_submit': '준공도서 작성 필요',
  'completion_inspection': '준공 실사',
  'completion_supplement_1st': '준공 보완 1차',
  'completion_supplement_2nd': '준공 보완 2차',
  'completion_supplement_3rd': '준공 보완 3차',
  'final_document_submit': '보조금지급신청서 제출',
  'subsidy_payment': '보조금 입금',

  // AS 업무 단계
  'as_customer_contact': 'AS 고객 상담',
  'as_site_inspection': 'AS 현장 확인',
  'as_quotation': 'AS 견적 작성',
  'as_contract': 'AS 계약 체결',
  'as_part_order': 'AS 부품 발주',
  'as_completed': 'AS 완료',

  // 대리점 업무 단계 (단순화)
  'dealer_order_received': '발주 수신',
  'dealer_invoice_issued': '계산서 발행',
  'dealer_payment_confirmed': '입금 확인',
  'dealer_product_ordered': '제품 발주',

  // 기타 단계
  'etc_status': '기타',

  // 기존 단계 (호환성)
  'pending': '대기',
  'in_progress': '진행중',
  'completed': '완료',
  'cancelled': '취소',
  'on_hold': '보류'
};

// 업무 타입 한글 매핑
export const TASK_TYPE_KR: { [key: string]: string } = {
  'self': '자가시설',
  'subsidy': '보조금',
  'as': 'A/S',
  'dealer': '대리점'
};

// 우선순위 한글 매핑
export const PRIORITY_KR: { [key: string]: string } = {
  'low': '낮음',
  'medium': '보통',
  'high': '높음',
  'critical': '긴급'
};

/**
 * 업무 상태 코드를 한글로 변환
 */
export function getTaskStatusKR(status: string): string {
  return TASK_STATUS_KR[status] || status;
}

/**
 * 업무 타입 코드를 한글로 변환
 */
export function getTaskTypeKR(taskType: string): string {
  return TASK_TYPE_KR[taskType] || taskType;
}

/**
 * 우선순위 코드를 한글로 변환
 */
export function getPriorityKR(priority: string): string {
  return PRIORITY_KR[priority] || priority;
}

/**
 * 상태 변경 메시지를 한글로 생성
 */
export function createStatusChangeMessage(
  oldStatus: string,
  newStatus: string,
  businessName: string,
  modifierName?: string
): string {
  const oldStatusKR = getTaskStatusKR(oldStatus);
  const newStatusKR = getTaskStatusKR(newStatus);

  // 수정자 정보가 있으면 수정자 이름을, 없으면 사업장명을 괄호에 표시
  const suffix = modifierName ? `(${modifierName}님이 수정)` : `(${businessName})`;
  return `"${businessName}" 업무 상태가 ${oldStatusKR}에서 ${newStatusKR}로 변경되었습니다. ${suffix}`;
}

/**
 * 업무 상태별 진행률 계산 (자가시설)
 */
export function getStatusProgress(status: string): number {
  const progressMap: { [key: string]: number } = {
    'customer_contact': 5,
    'site_inspection': 15,
    'quotation': 25,
    'contract': 35,
    'deposit_confirm': 45,
    'product_order': 55,
    'product_shipment': 65,
    'installation_schedule': 75,
    'installation': 85,
    'balance_payment': 95,
    'document_complete': 100
  };

  return progressMap[status] || 0;
}

/**
 * 상태별 색상 반환
 */
export function getStatusColor(status: string): string {
  const colorMap: { [key: string]: string } = {
    // 자가 시설 설치 단계
    'customer_contact': 'bg-gray-100 text-gray-800',
    'site_inspection': 'bg-blue-100 text-blue-800',
    'quotation': 'bg-yellow-100 text-yellow-800',
    'contract': 'bg-orange-100 text-orange-800',
    'deposit_confirm': 'bg-purple-100 text-purple-800',
    'product_order': 'bg-indigo-100 text-indigo-800',
    'product_shipment': 'bg-cyan-100 text-cyan-800',
    'installation_schedule': 'bg-teal-100 text-teal-800',
    'installation': 'bg-green-100 text-green-800',
    'balance_payment': 'bg-emerald-100 text-emerald-800',
    'document_complete': 'bg-green-200 text-green-900',

    // AS 전용 단계
    'as_customer_contact': 'bg-blue-100 text-blue-800',
    'as_site_inspection': 'bg-yellow-100 text-yellow-800',
    'as_quotation': 'bg-orange-100 text-orange-800',
    'as_contract': 'bg-purple-100 text-purple-800',
    'as_part_order': 'bg-cyan-100 text-cyan-800',
    'as_completed': 'bg-green-100 text-green-800',

    // 대리점 전용 단계 (단순화)
    'dealer_order_received': 'bg-blue-100 text-blue-800',
    'dealer_invoice_issued': 'bg-yellow-100 text-yellow-800',
    'dealer_payment_confirmed': 'bg-green-100 text-green-800',
    'dealer_product_ordered': 'bg-emerald-100 text-emerald-800'
  };

  return colorMap[status] || 'bg-gray-100 text-gray-800';
}