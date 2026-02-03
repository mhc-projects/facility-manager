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

  // 공통 단계 (여러 타입에서 공유) - 레거시 호환성
  'customer_contact': '고객 상담',
  'site_inspection': '현장 실사',
  'quotation': '견적서 작성',
  'contract': '계약 체결',

  // 자비 공통 단계 (self_ prefix)
  'self_customer_contact': '고객 상담',
  'self_site_inspection': '현장 실사',
  'self_quotation': '견적서 작성',
  'self_contract': '계약 체결',

  // 자비 전용 단계 (self_ prefix)
  'self_deposit_confirm': '계약금 확인',
  'self_product_order': '제품 발주',
  'self_product_shipment': '제품 출고',
  'self_installation_schedule': '설치 협의',
  'self_installation': '제품 설치',
  'self_balance_payment': '잔금 입금',
  'self_document_complete': '서류 발송 완료',

  // 레거시 호환성 (구버전 status - 마이그레이션 전까지 유지)
  'deposit_confirm': '계약금 확인',
  'product_order': '제품 발주',
  'product_shipment': '제품 출고',
  'installation_schedule': '설치예정',
  'installation': '설치완료',
  'balance_payment': '잔금 입금',
  'document_complete': '서류 발송 완료',

  // 보조금 공통 단계 (subsidy_ prefix)
  'subsidy_customer_contact': '고객 상담',
  'subsidy_site_inspection': '현장 실사',
  'subsidy_quotation': '견적서 작성',
  'subsidy_contract': '계약 체결',

  // 보조금 전용 단계 (subsidy_ prefix)
  'subsidy_document_preparation': '신청서 작성 필요',
  'subsidy_application_submit': '신청서 제출',
  'subsidy_approval_pending': '보조금 승인대기',
  'subsidy_approved': '보조금 승인',
  'subsidy_rejected': '보조금 탈락',
  'subsidy_document_supplement': '신청서 보완',
  'subsidy_pre_construction_inspection': '착공 전 실사',
  'subsidy_pre_construction_supplement_1st': '착공 보완 1차',
  'subsidy_pre_construction_supplement_2nd': '착공 보완 2차',
  'subsidy_construction_report_submit': '착공신고서 제출',
  'subsidy_product_order': '제품 발주',
  'subsidy_product_shipment': '제품 출고',
  'subsidy_installation_schedule': '설치예정',
  'subsidy_installation': '설치완료',
  'subsidy_pre_completion_document_submit': '준공도서 작성 필요',
  'subsidy_completion_inspection': '준공 실사',
  'subsidy_completion_supplement_1st': '준공 보완 1차',
  'subsidy_completion_supplement_2nd': '준공 보완 2차',
  'subsidy_completion_supplement_3rd': '준공 보완 3차',
  'subsidy_final_document_submit': '보조금지급신청서 제출',
  'subsidy_payment': '보조금 입금',

  // 레거시 호환성 (구버전 status - 마이그레이션 전까지 유지)
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

  // 외주설치 단계 (outsourcing_ prefix)
  'outsourcing_order': '외주 발주',
  'outsourcing_schedule': '일정 조율',
  'outsourcing_in_progress': '설치 진행 중',
  'outsourcing_completed': '설치 완료',

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
    // 공통 단계 - 레거시
    'customer_contact': 5,
    'site_inspection': 15,
    'quotation': 25,
    'contract': 35,

    // 자비 공통 단계
    'self_customer_contact': 5,
    'self_site_inspection': 15,
    'self_quotation': 25,
    'self_contract': 35,

    // 자비 전용 단계
    'self_deposit_confirm': 45,
    'self_product_order': 55,
    'self_product_shipment': 65,
    'self_installation_schedule': 75,
    'self_installation': 85,
    'self_balance_payment': 95,
    'self_document_complete': 100,

    // 레거시 호환성
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
    // 공통 단계 - 레거시
    'customer_contact': 'bg-gray-100 text-gray-800',
    'site_inspection': 'bg-blue-100 text-blue-800',
    'quotation': 'bg-yellow-100 text-yellow-800',
    'contract': 'bg-orange-100 text-orange-800',

    // 자비 공통 단계
    'self_customer_contact': 'bg-blue-100 text-blue-800',
    'self_site_inspection': 'bg-yellow-100 text-yellow-800',
    'self_quotation': 'bg-orange-100 text-orange-800',
    'self_contract': 'bg-purple-100 text-purple-800',

    // 보조금 공통 단계
    'subsidy_customer_contact': 'bg-blue-100 text-blue-800',
    'subsidy_site_inspection': 'bg-yellow-100 text-yellow-800',
    'subsidy_quotation': 'bg-orange-100 text-orange-800',
    'subsidy_contract': 'bg-purple-100 text-purple-800',

    // 확인필요 단계
    'self_needs_check': 'bg-red-100 text-red-800',
    'subsidy_needs_check': 'bg-red-100 text-red-800',
    'as_needs_check': 'bg-red-100 text-red-800',
    'dealer_needs_check': 'bg-red-100 text-red-800',
    'outsourcing_needs_check': 'bg-red-100 text-red-800',
    'etc_needs_check': 'bg-red-100 text-red-800',

    // 자비 전용 단계
    'self_deposit_confirm': 'bg-purple-100 text-purple-800',
    'self_product_order': 'bg-indigo-100 text-indigo-800',
    'self_product_shipment': 'bg-cyan-100 text-cyan-800',
    'self_installation_schedule': 'bg-teal-100 text-teal-800',
    'self_installation': 'bg-green-100 text-green-800',
    'self_balance_payment': 'bg-emerald-100 text-emerald-800',
    'self_document_complete': 'bg-green-200 text-green-900',

    // 보조금 전용 단계
    'subsidy_document_preparation': 'bg-amber-100 text-amber-800',
    'subsidy_application_submit': 'bg-purple-100 text-purple-800',
    'subsidy_approval_pending': 'bg-sky-100 text-sky-800',
    'subsidy_approved': 'bg-lime-100 text-lime-800',
    'subsidy_rejected': 'bg-red-100 text-red-800',
    'subsidy_document_supplement': 'bg-pink-100 text-pink-800',
    'subsidy_pre_construction_inspection': 'bg-indigo-100 text-indigo-800',
    'subsidy_pre_construction_supplement_1st': 'bg-rose-100 text-rose-800',
    'subsidy_pre_construction_supplement_2nd': 'bg-fuchsia-100 text-fuchsia-800',
    'subsidy_construction_report_submit': 'bg-blue-100 text-blue-800',
    'subsidy_product_order': 'bg-cyan-100 text-cyan-800',
    'subsidy_product_shipment': 'bg-emerald-100 text-emerald-800',
    'subsidy_installation_schedule': 'bg-teal-100 text-teal-800',
    'subsidy_installation': 'bg-green-100 text-green-800',
    'subsidy_pre_completion_document_submit': 'bg-amber-100 text-amber-800',
    'subsidy_completion_inspection': 'bg-violet-100 text-violet-800',
    'subsidy_completion_supplement_1st': 'bg-slate-100 text-slate-800',
    'subsidy_completion_supplement_2nd': 'bg-zinc-100 text-zinc-800',
    'subsidy_completion_supplement_3rd': 'bg-stone-100 text-stone-800',
    'subsidy_final_document_submit': 'bg-gray-100 text-gray-800',
    'subsidy_payment': 'bg-green-100 text-green-800',

    // AS 전용 단계
    'as_customer_contact': 'bg-blue-100 text-blue-800',
    'as_site_inspection': 'bg-yellow-100 text-yellow-800',
    'as_quotation': 'bg-orange-100 text-orange-800',
    'as_contract': 'bg-purple-100 text-purple-800',
    'as_part_order': 'bg-cyan-100 text-cyan-800',
    'as_completed': 'bg-green-100 text-green-800',

    // 대리점 전용 단계
    'dealer_order_received': 'bg-blue-100 text-blue-800',
    'dealer_invoice_issued': 'bg-yellow-100 text-yellow-800',
    'dealer_payment_confirmed': 'bg-green-100 text-green-800',
    'dealer_product_ordered': 'bg-emerald-100 text-emerald-800',

    // 외주설치 단계
    'outsourcing_order': 'bg-blue-100 text-blue-800',
    'outsourcing_schedule': 'bg-yellow-100 text-yellow-800',
    'outsourcing_in_progress': 'bg-orange-100 text-orange-800',
    'outsourcing_completed': 'bg-green-100 text-green-800',

    // 레거시 호환성 (구버전 status)
    'deposit_confirm': 'bg-purple-100 text-purple-800',
    'product_order': 'bg-indigo-100 text-indigo-800',
    'product_shipment': 'bg-cyan-100 text-cyan-800',
    'installation_schedule': 'bg-teal-100 text-teal-800',
    'installation': 'bg-green-100 text-green-800',
    'balance_payment': 'bg-emerald-100 text-emerald-800',
    'document_complete': 'bg-green-200 text-green-900'
  };

  return colorMap[status] || 'bg-gray-100 text-gray-800';
}