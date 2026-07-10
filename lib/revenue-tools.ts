// 블루온AI 매출/미수금 실시간 조회 도구 (관리자 전용)
// 미수금은 어디에도 텍스트로 저장되지 않고 매 요청마다 재계산되는 값이라
// 임베딩 검색이 아니라 receivables-engine을 직접 호출하는 방식으로 조회한다.
import { query as pgQuery } from '@/lib/supabase-direct';
import {
  EQUIPMENT_FIELDS,
  calculateContractAmount,
  buildRecordsMap,
  computeBusinessReceivableNow,
} from '@/lib/receivables-engine';

async function findBusinessesByName(nameQuery: string, limit = 5) {
  if (!nameQuery.trim()) return [];
  const result = await pgQuery(
    `SELECT id, business_name FROM business_info
     WHERE business_name ILIKE $1 AND is_active = true AND is_deleted = false
     ORDER BY business_name LIMIT $2`,
    [`%${nameQuery}%`, limit]
  );
  return (result.rows ?? []) as { id: string; business_name: string }[];
}

/** 사업장의 계약금액·입금액·미수금 (매출관리 페이지와 동일한 receivables-engine 공식 사용) */
export async function getBusinessReceivable(businessNameQuery: string) {
  const matches = await findBusinessesByName(businessNameQuery);
  if (matches.length === 0) {
    return { found: false, message: `"${businessNameQuery}"와 일치하는 사업장을 찾을 수 없습니다.` };
  }

  const ids = matches.map(m => m.id);
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
  const equipmentSelect = EQUIPMENT_FIELDS.map(f => `bi.${f}`).join(', ');

  const [bizResult, pricingResult, recordsResult] = await Promise.all([
    pgQuery(
      `SELECT bi.id, bi.business_name, bi.progress_status, bi.installation_date,
              bi.additional_cost, bi.negotiation, bi.revenue_adjustments,
              bi.invoice_additional_date,
              bi.invoice_1st_amount, bi.invoice_2nd_amount,
              bi.payment_1st_amount, bi.payment_2nd_amount, bi.payment_additional_amount,
              bi.invoice_advance_amount, bi.invoice_balance_amount,
              bi.payment_advance_amount, bi.payment_balance_amount,
              ${equipmentSelect}
       FROM business_info bi WHERE bi.id IN (${placeholders})`,
      ids
    ),
    pgQuery(`SELECT equipment_type, official_price FROM government_pricing WHERE is_active = true`),
    pgQuery(
      `SELECT id, business_id, invoice_stage, record_type, parent_record_id,
              issue_date, total_amount, supply_amount, payment_amount, is_active
       FROM invoice_records WHERE business_id IN (${placeholders}) AND is_active = TRUE
       ORDER BY business_id, invoice_stage, record_type, created_at ASC`,
      ids
    ),
  ]);

  const officialPrices: Record<string, number> = {};
  for (const row of pricingResult.rows ?? []) {
    officialPrices[row.equipment_type] = Number(row.official_price) || 0;
  }

  const recordsMap = buildRecordsMap(ids, recordsResult.rows ?? []);

  const results = (bizResult.rows ?? []).map((biz: any) => {
    const business = { ...biz, contract_amount: calculateContractAmount(biz, officialPrices) };
    const stages = recordsMap.get(biz.id) ?? {
      subsidy_1st: [], subsidy_2nd: [], subsidy_additional: [],
      self_advance: [], self_balance: [], extra: [],
    };
    const { receivable, payment, category } = computeBusinessReceivableNow(business, stages);
    return {
      business_name: biz.business_name,
      category,
      contract_amount: business.contract_amount,
      total_payment: payment,
      receivable,
    };
  });

  return { found: true, results };
}

/** 사업장의 세금계산서 발행/입금 현황 (단계별 원본 레코드) */
export async function getInvoiceStatus(businessNameQuery: string) {
  const matches = await findBusinessesByName(businessNameQuery);
  if (matches.length === 0) {
    return { found: false, message: `"${businessNameQuery}"와 일치하는 사업장을 찾을 수 없습니다.` };
  }

  const ids = matches.map(m => m.id);
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
  const result = await pgQuery(
    `SELECT bi.business_name, ir.invoice_stage, ir.record_type,
            ir.issue_date, ir.supply_amount, ir.tax_amount, ir.total_amount,
            ir.payment_date, ir.payment_amount
     FROM invoice_records ir
     JOIN business_info bi ON bi.id = ir.business_id
     WHERE ir.business_id IN (${placeholders}) AND ir.is_active = TRUE AND ir.record_type != 'cancelled'
     ORDER BY bi.business_name, ir.invoice_stage, ir.issue_date`,
    ids
  );

  return { found: true, records: result.rows ?? [] };
}

/** 기간별 전체 발행/입금 합계 (issue_date 기준) */
export async function getRevenueSummary(startDate: string, endDate: string) {
  const result = await pgQuery(
    `SELECT
       COUNT(DISTINCT business_id) AS business_count,
       COALESCE(SUM(total_amount), 0) AS total_invoiced,
       COALESCE(SUM(payment_amount), 0) AS total_received
     FROM invoice_records
     WHERE is_active = TRUE AND record_type != 'cancelled' AND parent_record_id IS NULL
       AND issue_date BETWEEN $1 AND $2`,
    [startDate, endDate]
  );

  return { found: true, period: { start_date: startDate, end_date: endDate }, ...result.rows?.[0] };
}
