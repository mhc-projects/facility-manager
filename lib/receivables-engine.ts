// 사업장 미수금 계산 엔진 - 매출관리(business-invoices/batch)와 주간 브리핑이 공유하는 단일 구현.
//
// computeBusinessReceivableNow: "지금" 기준 계산. business-invoices/batch의 기존 공식과
//   완전히 동일하며, 매출관리 페이지가 보여주는 값과 100% 일치한다.
// computeBusinessReceivableAsOf: 과거 특정 시점(asOfDate) 기준 스냅샷 재구성. 주간 브리핑의
//   "지난주" 비교처럼, 실시간 값과는 다를 수밖에 없는 용도에만 사용한다.
import { calculateReceivables } from './receivables-calculator';
import { mapProgressToCategory } from '@/types/invoice';
import type { InvoiceRecord, InvoiceRecordsByStage } from '@/types/invoice';

export { mapProgressToCategory };

// 고시가 기반 매출 계산에 사용되는 기기 필드
export const EQUIPMENT_FIELDS = [
  'ph_meter', 'differential_pressure_meter', 'temperature_meter',
  'discharge_current_meter', 'fan_current_meter', 'pump_current_meter',
  'gateway', 'gateway_1_2', 'gateway_3_4', 'vpn_wired', 'vpn_wireless',
  'explosion_proof_differential_pressure_meter_domestic',
  'explosion_proof_temperature_meter_domestic', 'expansion_device',
  'relay_8ch', 'relay_16ch', 'main_board_replacement', 'multiple_stack',
];

/**
 * 서버 사이드 contract_amount 계산
 * 환경부 고시가 × 수량 + 추가공사비 - 협의사항 + 매출비용조정 (부가세 포함)
 */
export function calculateContractAmount(
  business: Record<string, any>,
  officialPrices: Record<string, number>
): number {
  let revenue = 0;
  for (const field of EQUIPMENT_FIELDS) {
    const qty = Number(business[field]) || 0;
    if (qty > 0) {
      revenue += (officialPrices[field] || 0) * qty;
    }
  }
  revenue += Number(business.additional_cost) || 0;
  const negotiation = business.negotiation
    ? parseFloat(String(business.negotiation)) || 0
    : 0;
  revenue -= negotiation;
  try {
    const raw = business.revenue_adjustments;
    if (raw) {
      const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (Array.isArray(arr)) {
        revenue += arr.reduce((s: number, a: any) => s + (Number(a.amount) || 0), 0);
      }
    }
  } catch { /* ignore */ }
  return Math.round(revenue * 1.1);
}

const EMPTY_STAGES = (): InvoiceRecordsByStage => ({
  subsidy_1st: [], subsidy_2nd: [], subsidy_additional: [],
  self_advance: [], self_balance: [], extra: [],
});

/**
 * invoice_records 행 목록을 사업장별·단계별로 그룹핑 (최상위/원본 계보만, 수정이력 제외)
 */
export function buildRecordsMap(
  ids: string[],
  rows: InvoiceRecord[]
): Map<string, InvoiceRecordsByStage> {
  const recordsMap = new Map<string, InvoiceRecordsByStage>();
  for (const id of ids) {
    recordsMap.set(id, EMPTY_STAGES());
  }
  for (const row of rows) {
    if (row.parent_record_id) continue;
    const stageMap = recordsMap.get(row.business_id);
    if (!stageMap) continue;
    const stage = row.invoice_stage as keyof InvoiceRecordsByStage;
    if (stageMap[stage]) stageMap[stage].push(row);
  }
  return recordsMap;
}

export interface ReceivableBusiness {
  id: string;
  progress_status: string | null | undefined;
  installation_date: string | null | undefined;
  contract_amount: number;
  additional_cost?: number | null;
  invoice_1st_amount?: number | null; invoice_1st_date?: string | null;
  payment_1st_amount?: number | null; payment_1st_date?: string | null;
  invoice_2nd_amount?: number | null; invoice_2nd_date?: string | null;
  payment_2nd_amount?: number | null; payment_2nd_date?: string | null;
  invoice_additional_date?: string | null;
  payment_additional_amount?: number | null; payment_additional_date?: string | null;
  invoice_advance_amount?: number | null; invoice_advance_date?: string | null;
  payment_advance_amount?: number | null; payment_advance_date?: string | null;
  invoice_balance_amount?: number | null; invoice_balance_date?: string | null;
  payment_balance_amount?: number | null; payment_balance_date?: string | null;
}

export interface ReceivableResult {
  category: '보조금' | '자비';
  receivable: number;
  payment: number;
}

/**
 * "지금" 기준 미수금 계산 - business-invoices/batch의 calculateBatchReceivables와
 * 완전히 동일한 공식. 매출관리 페이지가 보여주는 값과 100% 일치한다.
 */
export function computeBusinessReceivableNow(
  business: ReceivableBusiness,
  stages: InvoiceRecordsByStage
): ReceivableResult {
  const category = mapProgressToCategory(business.progress_status);
  const getOriginal = (stage: keyof InvoiceRecordsByStage): InvoiceRecord | null =>
    stages[stage].find(r => r.record_type === 'original') || null;

  let allPayments = 0;
  let invoicedFallback = 0;

  if (category === '보조금') {
    const r1 = getOriginal('subsidy_1st');
    const r2 = getOriginal('subsidy_2nd');
    const rA = getOriginal('subsidy_additional');
    allPayments =
      (r1 !== null ? (r1.payment_amount || 0) : (Number(business.payment_1st_amount) || 0)) +
      (r2 !== null ? (r2.payment_amount || 0) : (Number(business.payment_2nd_amount) || 0)) +
      (rA !== null ? (rA.payment_amount || 0) : (Number(business.payment_additional_amount) || 0));
    invoicedFallback =
      (r1 ? (r1.total_amount || 0) : (Number(business.invoice_1st_amount) || 0)) +
      (r2 ? (r2.total_amount || 0) : (Number(business.invoice_2nd_amount) || 0)) +
      (rA
        ? (rA.issue_date ? (rA.total_amount || 0) : 0)
        : (business.invoice_additional_date
            ? Math.round((Number(business.additional_cost) || 0) * 1.1)
            : 0));
  } else {
    const rAdv = getOriginal('self_advance');
    const rBal = getOriginal('self_balance');
    allPayments =
      (rAdv !== null ? (rAdv.payment_amount || 0) : (Number(business.payment_advance_amount) || 0)) +
      (rBal !== null ? (rBal.payment_amount || 0) : (Number(business.payment_balance_amount) || 0));
    invoicedFallback =
      (rAdv ? (rAdv.total_amount || 0) : (Number(business.invoice_advance_amount) || 0)) +
      (rBal ? (rBal.total_amount || 0) : (Number(business.invoice_balance_amount) || 0));
  }

  allPayments += stages.extra
    .filter(r => r.record_type !== 'cancelled')
    .reduce((sum, r) => sum + (r.payment_amount || 0), 0);
  invoicedFallback += stages.extra
    .filter(r => r.record_type !== 'cancelled')
    .reduce((sum, r) => sum + (r.total_amount || 0), 0);

  const extraSupplyTotal = stages.extra
    .filter(r => r.record_type !== 'cancelled')
    .reduce((sum, r) => sum + (r.supply_amount || 0), 0);
  const contractAmountWithExtra = Math.round((business.contract_amount || 0) + extraSupplyTotal * 1.1);

  const baseFromInvoice = Math.max(contractAmountWithExtra, invoicedFallback);
  const baseAmount = baseFromInvoice > 0 ? baseFromInvoice : allPayments;

  const receivable = baseAmount === 0
    ? 0
    : calculateReceivables({
        installationDate: business.installation_date,
        totalRevenueWithTax: baseAmount,
        totalPayments: allPayments,
      });

  return { category, receivable, payment: allPayments };
}

function isRecognized(dateStr: string | null | undefined, asOfDate: string): boolean {
  return !!dateStr && dateStr <= asOfDate;
}

/**
 * 과거 특정 시점(asOfDate) 기준 미수금 스냅샷 재구성 - 주간 브리핑의 "지난주" 비교 등 용도.
 * issue_date/payment_date가 asOfDate 이후인 발행·입금은 그 시점엔 아직 없었던 것으로 간주한다.
 * contract_amount(고시가 기반 계약금액)는 발행일 개념이 없어 과거/현재 동일하게 취급한다
 * (설비 수량이 그 주에 바뀌는 경우는 드물다는 전제의 근사치).
 * "지금"(오늘) 값과 정확히 일치시키려면 computeBusinessReceivableNow를 쓸 것 — 이 함수는
 * 그 formula와 미묘하게 다르다(예: subsidy_additional 외 단계도 issue_date로 게이팅).
 */
export function computeBusinessReceivableAsOf(
  business: ReceivableBusiness,
  stages: InvoiceRecordsByStage,
  asOfDate: string
): ReceivableResult {
  const category = mapProgressToCategory(business.progress_status);
  const getOriginal = (stage: keyof InvoiceRecordsByStage): InvoiceRecord | null =>
    stages[stage].find(r => r.record_type === 'original') || null;

  const invoiceAmount = (
    stage: keyof InvoiceRecordsByStage,
    fallbackAmount: number,
    fallbackDate: string | null | undefined
  ): number => {
    const rec = getOriginal(stage);
    if (rec) return isRecognized(rec.issue_date, asOfDate) ? (rec.total_amount || 0) : 0;
    return isRecognized(fallbackDate, asOfDate) ? fallbackAmount : 0;
  };

  const paymentAmount = (
    stage: keyof InvoiceRecordsByStage,
    fallbackAmount: number | null | undefined,
    fallbackDate: string | null | undefined
  ): number => {
    const rec = getOriginal(stage);
    if (rec) return isRecognized(rec.payment_date, asOfDate) ? (rec.payment_amount || 0) : 0;
    return isRecognized(fallbackDate, asOfDate) ? (Number(fallbackAmount) || 0) : 0;
  };

  let allPayments = 0;
  let invoicedFallback = 0;

  if (category === '보조금') {
    invoicedFallback += invoiceAmount('subsidy_1st', Number(business.invoice_1st_amount) || 0, business.invoice_1st_date);
    invoicedFallback += invoiceAmount('subsidy_2nd', Number(business.invoice_2nd_amount) || 0, business.invoice_2nd_date);
    invoicedFallback += invoiceAmount(
      'subsidy_additional',
      Math.round((Number(business.additional_cost) || 0) * 1.1),
      business.invoice_additional_date
    );

    allPayments += paymentAmount('subsidy_1st', business.payment_1st_amount, business.payment_1st_date);
    allPayments += paymentAmount('subsidy_2nd', business.payment_2nd_amount, business.payment_2nd_date);
    allPayments += paymentAmount('subsidy_additional', business.payment_additional_amount, business.payment_additional_date);
  } else {
    invoicedFallback += invoiceAmount('self_advance', Number(business.invoice_advance_amount) || 0, business.invoice_advance_date);
    invoicedFallback += invoiceAmount('self_balance', Number(business.invoice_balance_amount) || 0, business.invoice_balance_date);

    allPayments += paymentAmount('self_advance', business.payment_advance_amount, business.payment_advance_date);
    allPayments += paymentAmount('self_balance', business.payment_balance_amount, business.payment_balance_date);
  }

  for (const r of stages.extra) {
    if (r.record_type === 'cancelled') continue;
    if (isRecognized(r.issue_date, asOfDate)) invoicedFallback += r.total_amount || 0;
    if (isRecognized(r.payment_date, asOfDate)) allPayments += r.payment_amount || 0;
  }

  const extraSupplyRecognized = stages.extra
    .filter(r => r.record_type !== 'cancelled' && isRecognized(r.issue_date, asOfDate))
    .reduce((sum, r) => sum + (r.supply_amount || 0), 0);
  const contractAmountWithExtra = Math.round((business.contract_amount || 0) + extraSupplyRecognized * 1.1);

  const baseFromInvoice = Math.max(contractAmountWithExtra, invoicedFallback);
  const baseAmount = baseFromInvoice > 0 ? baseFromInvoice : allPayments;

  const receivable = baseAmount === 0
    ? 0
    : calculateReceivables({
        installationDate: business.installation_date,
        totalRevenueWithTax: baseAmount,
        totalPayments: allPayments,
      });

  return { category, receivable, payment: allPayments };
}
