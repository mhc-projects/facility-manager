// ================================================================
// invoice.ts - 계산서 발행 관련 타입 정의
// ================================================================

export type InvoiceStage =
  | 'subsidy_1st'         // 보조금 1차
  | 'subsidy_2nd'         // 보조금 2차
  | 'subsidy_additional'  // 보조금 추가공사비
  | 'self_advance'        // 자비 선금
  | 'self_balance'        // 자비 잔금
  | 'extra';              // 추가 계산서 (자유 입력)

export type InvoiceRecordType = 'original' | 'revised' | 'cancelled';

export type InvoiceCategory = '보조금' | '자비';

// ----------------------------------------------------------------
// DB 레코드 타입
// ----------------------------------------------------------------
export interface InvoiceRecord {
  id: string;
  business_id: string;
  invoice_stage: InvoiceStage;
  extra_title?: string | null;
  record_type: InvoiceRecordType;
  parent_record_id?: string | null;
  revised_reason?: string | null;

  issue_date?: string | null;        // YYYY-MM-DD
  invoice_number?: string | null;
  supply_amount: number;
  tax_amount: number;
  total_amount: number;

  payment_date?: string | null;      // YYYY-MM-DD
  payment_amount: number;
  payment_memo?: string | null;

  is_active: boolean;
  created_at: string;
  updated_at: string;

  // 조회 시 포함되는 수정이력 (record_type='revised' 자식들)
  revisions?: InvoiceRecord[];
}

// ----------------------------------------------------------------
// API 요청 타입
// ----------------------------------------------------------------
export interface CreateInvoiceRecordRequest {
  business_id: string;
  invoice_stage: InvoiceStage;
  extra_title?: string;          // invoice_stage='extra' 시 필수

  record_type: InvoiceRecordType;
  parent_record_id?: string;     // record_type='revised' 시 필수
  revised_reason?: string;

  issue_date?: string;
  invoice_number?: string;
  supply_amount?: number;
  tax_amount?: number;           // 미입력 시 supply_amount * 0.1 자동 계산
  // total_amount는 서버에서 supply + tax로 자동 계산

  payment_date?: string;
  payment_amount?: number;
  payment_memo?: string;
}

export interface UpdateInvoiceRecordRequest {
  issue_date?: string;
  invoice_number?: string;
  supply_amount?: number;
  tax_amount?: number;
  payment_date?: string;
  payment_amount?: number;
  payment_memo?: string;
  revised_reason?: string;
  extra_title?: string;
}

// ----------------------------------------------------------------
// API 응답 타입
// ----------------------------------------------------------------
export interface InvoiceRecordsByStage {
  subsidy_1st: InvoiceRecord[];
  subsidy_2nd: InvoiceRecord[];
  subsidy_additional: InvoiceRecord[];
  self_advance: InvoiceRecord[];
  self_balance: InvoiceRecord[];
  extra: InvoiceRecord[];
}

export interface BusinessInvoicesResponse {
  business_id: string;
  business_name: string;
  business_category: InvoiceCategory;
  additional_cost: number;

  // 기존 필드 (하위 호환)
  invoices: {
    first?: LegacyInvoiceStage;
    second?: LegacyInvoiceStage;
    additional?: LegacyInvoiceStage;
    advance?: LegacyInvoiceStage;
    balance?: LegacyInvoiceStage;
  };
  total_receivables: number;

  // 신규 필드
  invoice_records: InvoiceRecordsByStage;
  extra_receivables: number;
  grand_total_receivables: number;
}

export interface LegacyInvoiceStage {
  invoice_date?: string | null;
  invoice_amount?: number;
  payment_date?: string | null;
  payment_amount?: number;
  receivable: number;
}

// ----------------------------------------------------------------
// UI 폼 상태 타입
// ----------------------------------------------------------------
export interface InvoiceRecordFormState {
  invoice_stage: InvoiceStage;
  extra_title: string;
  record_type: InvoiceRecordType;
  parent_record_id: string;
  revised_reason: string;

  issue_date: string;
  invoice_number: string;
  supply_amount: string;      // 입력은 string, 저장 시 number로 변환
  tax_amount: string;
  auto_tax: boolean;          // 세액 자동계산 (공급가 * 10%) 여부

  payment_date: string;
  payment_amount: string;
  payment_memo: string;
}

export const INVOICE_STAGE_LABELS: Record<InvoiceStage, string> = {
  subsidy_1st:         '1차 계산서',
  subsidy_2nd:         '2차 계산서',
  subsidy_additional:  '추가공사비',
  self_advance:        '선금',
  self_balance:        '잔금',
  extra:               '추가 계산서',
};

export const INVOICE_RECORD_TYPE_LABELS: Record<InvoiceRecordType, string> = {
  original:   '일반발행',
  revised:    '수정발행',
  cancelled:  '취소',
};

// 진행구분 → 보조금/자비 매핑 헬퍼
export const mapProgressToCategory = (progressStatus: string | null | undefined): InvoiceCategory => {
  const normalized = progressStatus?.trim() || '';
  if (normalized === '보조금' || normalized === '보조금 동시진행' || normalized === '보조금 추가승인') {
    return '보조금';
  }
  return '자비';
};

// 진행구분 → 해당하는 InvoiceStage 목록 반환
export const getStagesForCategory = (category: InvoiceCategory): InvoiceStage[] => {
  if (category === '보조금') {
    return ['subsidy_1st', 'subsidy_2nd', 'subsidy_additional'];
  }
  return ['self_advance', 'self_balance'];
};
