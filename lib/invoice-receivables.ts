/**
 * 미수금 계산 핵심 로직 — 단일 진실 공급원 (Single Source of Truth)
 *
 * 테이블(revenue page)과 모달(business-invoices API) 모두 이 함수를 사용합니다.
 * 미수금 계산 로직을 변경할 때 이 파일만 수정하면 됩니다.
 *
 * 계산 원칙:
 *   미수금 = contract_amount(최종매출 부가세포함) - 총 입금액
 *   - 계산서 발행 여부 / 발행일 / 입금일 무관하게, 입금액이 있으면 합산
 *   - 자비 / 보조금 구분 없이 동일한 규칙 적용
 *   - 설치일 없고 입금도 없으면 0 (아직 매출 미발생)
 */

import { query as pgQuery } from '@/lib/supabase-direct';
import { calculateReceivables } from '@/lib/receivables-calculator';
import type { InvoiceRecord, InvoiceRecordsByStage } from '@/types/invoice';

/** business_info에서 필요한 최소 필드 */
export interface BusinessForReceivables {
  id: string;
  business_name: string;
  progress_status: string | null;
  installation_date: string | null;
  additional_cost: number | null;
  invoice_additional_date: string | null;
  invoice_1st_amount: number | null;
  invoice_2nd_amount: number | null;
  payment_1st_amount: number | null;
  payment_2nd_amount: number | null;
  payment_additional_amount: number | null;
  invoice_advance_amount: number | null;
  invoice_balance_amount: number | null;
  payment_advance_amount: number | null;
  payment_balance_amount: number | null;
}

/** 진행구분 → 보조금/자비 매핑 */
export function mapProgressToCategory(progressStatus: string | null | undefined): '보조금' | '자비' {
  const s = (progressStatus || '').trim();
  if (s === '보조금' || s === '보조금 동시진행' || s === '보조금 추가승인') return '보조금';
  return '자비';
}

/**
 * 단일 사업장의 미수금을 계산합니다.
 *
 * @param business   - business_info 레코드 (최소 필드)
 * @param contractAmount - 최종매출금액(부가세 포함). 없으면 계산서 발행금액 fallback.
 * @returns totalReceivables
 */
export async function computeReceivables(
  business: BusinessForReceivables,
  contractAmount: number = 0
): Promise<number> {
  const category = mapProgressToCategory(business.progress_status);

  // ── invoice_records 조회 ─────────────────────────────────────────────
  let invoiceRecordsByStage: InvoiceRecordsByStage = {
    subsidy_1st: [],
    subsidy_2nd: [],
    subsidy_additional: [],
    self_advance: [],
    self_balance: [],
    extra: [],
  };

  try {
    const recordsResult = await pgQuery(
      `SELECT id, business_id, invoice_stage, record_type, parent_record_id,
              issue_date, total_amount, supply_amount, tax_amount,
              payment_date, payment_amount, is_active
       FROM invoice_records
       WHERE business_id = $1 AND is_active = TRUE
       ORDER BY invoice_stage, record_type, created_at ASC`,
      [business.id]
    );

    if (recordsResult.rows?.length > 0) {
      const allRecords: InvoiceRecord[] = recordsResult.rows;
      const topLevel = allRecords.filter(r => !r.parent_record_id);
      topLevel.forEach(r => {
        const stage = r.invoice_stage as keyof InvoiceRecordsByStage;
        if (invoiceRecordsByStage[stage] !== undefined) {
          invoiceRecordsByStage[stage].push(r);
        }
      });
    }
  } catch {
    // invoice_records 없는 레거시 데이터 → business_info 필드 fallback
  }

  const getOriginal = (stage: keyof InvoiceRecordsByStage): InvoiceRecord | null =>
    invoiceRecordsByStage[stage].find(r => r.record_type === 'original') || null;

  // ── 총 입금액 집계 (계산서/날짜 무관, payment_amount 있으면 합산) ────
  let allPayments = 0;

  if (category === '보조금') {
    const rec1st = getOriginal('subsidy_1st');
    const rec2nd = getOriginal('subsidy_2nd');
    const recAdd = getOriginal('subsidy_additional');
    allPayments +=
      (rec1st !== null ? (rec1st.payment_amount || 0) : (Number(business.payment_1st_amount) || 0)) +
      (rec2nd !== null ? (rec2nd.payment_amount || 0) : (Number(business.payment_2nd_amount) || 0)) +
      (recAdd !== null ? (recAdd.payment_amount || 0) : (Number(business.payment_additional_amount) || 0));
  } else {
    const recAdv = getOriginal('self_advance');
    const recBal = getOriginal('self_balance');
    allPayments +=
      (recAdv !== null ? (recAdv.payment_amount || 0) : (Number(business.payment_advance_amount) || 0)) +
      (recBal !== null ? (recBal.payment_amount || 0) : (Number(business.payment_balance_amount) || 0));
  }

  // extra 계산서 입금 포함
  allPayments += invoiceRecordsByStage.extra
    .filter(r => r.record_type !== 'cancelled')
    .reduce((sum, r) => sum + (r.payment_amount || 0), 0);

  // ── 기준금액 결정 ────────────────────────────────────────────────────
  let baseAmount = contractAmount;

  if (!baseAmount) {
    // fallback: 발행된 계산서 합계
    const recAdd = getOriginal('subsidy_additional');
    if (category === '보조금') {
      const r1 = getOriginal('subsidy_1st');
      const r2 = getOriginal('subsidy_2nd');
      baseAmount +=
        (r1 ? (r1.total_amount || 0) : (Number(business.invoice_1st_amount) || 0)) +
        (r2 ? (r2.total_amount || 0) : (Number(business.invoice_2nd_amount) || 0)) +
        (recAdd
          ? (recAdd.issue_date ? (recAdd.total_amount || 0) : 0)
          : (business.invoice_additional_date
              ? Math.round((Number(business.additional_cost) || 0) * 1.1)
              : 0));
    } else {
      const rAdv = getOriginal('self_advance');
      const rBal = getOriginal('self_balance');
      baseAmount +=
        (rAdv ? (rAdv.total_amount || 0) : (Number(business.invoice_advance_amount) || 0)) +
        (rBal ? (rBal.total_amount || 0) : (Number(business.invoice_balance_amount) || 0));
    }
    // extra 계산서 포함
    baseAmount += invoiceRecordsByStage.extra
      .filter(r => r.record_type !== 'cancelled')
      .reduce((sum, r) => sum + (r.total_amount || 0), 0);

    // 계산서 미발행 + 입금 있는 경우: 입금액이 실질 기준
    baseAmount = Math.max(baseAmount, allPayments);
  }

  if (baseAmount === 0) return 0;

  return calculateReceivables({
    installationDate: business.installation_date,
    totalRevenueWithTax: baseAmount,
    totalPayments: allPayments,
  });
}
