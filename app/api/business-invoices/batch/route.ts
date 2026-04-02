/**
 * POST /api/business-invoices/batch
 *
 * 여러 사업장의 미수금을 한 번에 계산합니다.
 * revenue page 테이블이 이 API를 사용해 테이블과 모달의 미수금을 단일 로직으로 통일합니다.
 *
 * Request body:
 *   모드 1 (매출관리): { businesses: Array<{ id, progress_status, installation_date, contract_amount, ...payment fields }> }
 *   모드 2 (사업장관리): { ids: string[] } — 서버에서 business_info + government_pricing 기반 contract_amount 직접 계산
 *
 * Response:
 *   { success: true, data: Record<businessId, number> }
 */

import { NextRequest, NextResponse } from 'next/server';
import { query as pgQuery } from '@/lib/supabase-direct';
import { calculateReceivables } from '@/lib/receivables-calculator';
import type { InvoiceRecord, InvoiceRecordsByStage } from '@/types/invoice';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// 고시가 기반 매출 계산에 사용되는 기기 필드
const EQUIPMENT_FIELDS = [
  'ph_meter', 'differential_pressure_meter', 'temperature_meter',
  'discharge_current_meter', 'fan_current_meter', 'pump_current_meter',
  'gateway', 'gateway_1_2', 'gateway_3_4', 'vpn_wired', 'vpn_wireless',
  'explosion_proof_differential_pressure_meter_domestic',
  'explosion_proof_temperature_meter_domestic', 'expansion_device',
  'relay_8ch', 'relay_16ch', 'main_board_replacement', 'multiple_stack'
];

function mapProgressToCategory(s: string | null | undefined): '보조금' | '자비' {
  const v = (s || '').trim();
  if (v === '보조금' || v === '보조금 동시진행' || v === '보조금 추가승인') return '보조금';
  return '자비';
}

/**
 * 서버 사이드 contract_amount 계산
 * 환경부 고시가 × 수량 + 추가공사비 - 협의사항 + 매출비용조정 (부가세 포함)
 */
function calculateServerContractAmount(
  business: any,
  officialPrices: Record<string, number>
): number {
  let revenue = 0;
  for (const field of EQUIPMENT_FIELDS) {
    const qty = Number(business[field]) || 0;
    if (qty > 0) {
      revenue += (officialPrices[field] || 0) * qty;
    }
  }
  // 추가공사비
  revenue += Number(business.additional_cost) || 0;
  // 협의사항
  const negotiation = business.negotiation
    ? parseFloat(String(business.negotiation)) || 0
    : 0;
  revenue -= negotiation;
  // 매출비용 조정 (JSONB 배열)
  try {
    const raw = business.revenue_adjustments;
    if (raw) {
      const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (Array.isArray(arr)) {
        revenue += arr.reduce((s: number, a: any) => s + (Number(a.amount) || 0), 0);
      }
    }
  } catch { /* ignore */ }
  // 부가세 포함
  return Math.round(revenue * 1.1);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // ids 모드: 서버에서 business_info 조회 + contract_amount 직접 계산
    if (body.ids && Array.isArray(body.ids) && body.ids.length > 0) {
      return handleIdsMode(body.ids);
    }

    // 기존 모드: 클라이언트에서 contract_amount 전달
    const businesses: any[] = body.businesses || [];
    if (!businesses.length) {
      return NextResponse.json({ success: true, data: {} });
    }

    return handleBusinessesMode(businesses);
  } catch (error: any) {
    console.error('❌ [BUSINESS-INVOICES/BATCH] Error:', error);
    return NextResponse.json(
      { success: false, message: '서버 오류', error: error.message },
      { status: 500 }
    );
  }
}

/**
 * ids 모드: 서버에서 모든 데이터를 조회하여 미수금 계산 (사업장관리 페이지용)
 */
async function handleIdsMode(ids: string[]) {
  const placeholders = ids.map((_: any, i: number) => `$${i + 1}`).join(', ');

  // business_info + government_pricing 병렬 조회
  const equipmentSelect = EQUIPMENT_FIELDS.map(f => `bi.${f}`).join(', ');
  const [bizResult, pricingResult, recordsResult] = await Promise.all([
    pgQuery(
      `SELECT bi.id, bi.progress_status, bi.installation_date,
              bi.additional_cost, bi.negotiation, bi.revenue_adjustments,
              bi.invoice_additional_date,
              bi.invoice_1st_amount, bi.invoice_2nd_amount,
              bi.payment_1st_amount, bi.payment_2nd_amount, bi.payment_additional_amount,
              bi.invoice_advance_amount, bi.invoice_balance_amount,
              bi.payment_advance_amount, bi.payment_balance_amount,
              ${equipmentSelect}
       FROM business_info bi
       WHERE bi.id IN (${placeholders})`,
      ids
    ),
    pgQuery(
      `SELECT equipment_type, official_price FROM government_pricing WHERE is_active = true`
    ),
    pgQuery(
      `SELECT id, business_id, invoice_stage, record_type, parent_record_id,
              issue_date, total_amount, supply_amount, payment_amount, is_active
       FROM invoice_records
       WHERE business_id IN (${placeholders}) AND is_active = TRUE
       ORDER BY business_id, invoice_stage, record_type, created_at ASC`,
      ids
    ),
  ]);

  // 고시가 맵 구성
  const officialPrices: Record<string, number> = {};
  if (pricingResult.rows?.length) {
    for (const row of pricingResult.rows) {
      officialPrices[row.equipment_type] = Number(row.official_price) || 0;
    }
  }

  // business_info id 맵 구성
  const bizMap = new Map<string, any>();
  if (bizResult.rows?.length) {
    for (const row of bizResult.rows) {
      bizMap.set(row.id, row);
    }
  }

  // businesses 배열 구성 (contract_amount 서버에서 계산)
  const businesses = ids.map(id => {
    const biz = bizMap.get(id);
    if (!biz) return null;
    return {
      ...biz,
      contract_amount: calculateServerContractAmount(biz, officialPrices),
    };
  }).filter(Boolean);

  // invoice_records 맵 구성
  const recordsMap = buildRecordsMap(ids, recordsResult.rows || []);

  // 미수금 계산
  const result = calculateBatchReceivables(businesses, recordsMap);

  return NextResponse.json({ success: true, data: result });
}

/**
 * 기존 businesses 모드: 클라이언트에서 contract_amount 전달 (매출관리 페이지용)
 */
async function handleBusinessesMode(businesses: any[]) {
  const ids = businesses.map((b: any) => b.id);
  const placeholders = ids.map((_: any, i: number) => `$${i + 1}`).join(', ');

  const recordsResult = await pgQuery(
    `SELECT id, business_id, invoice_stage, record_type, parent_record_id,
            issue_date, total_amount, supply_amount, payment_amount, is_active
     FROM invoice_records
     WHERE business_id IN (${placeholders}) AND is_active = TRUE
     ORDER BY business_id, invoice_stage, record_type, created_at ASC`,
    ids
  );

  const recordsMap = buildRecordsMap(ids, recordsResult.rows || []);
  const result = calculateBatchReceivables(businesses, recordsMap);

  return NextResponse.json({ success: true, data: result });
}

/**
 * invoice_records 맵 구성
 */
function buildRecordsMap(ids: string[], rows: any[]): Map<string, InvoiceRecordsByStage> {
  const recordsMap = new Map<string, InvoiceRecordsByStage>();
  for (const id of ids) {
    recordsMap.set(id, {
      subsidy_1st: [], subsidy_2nd: [], subsidy_additional: [],
      self_advance: [], self_balance: [], extra: [],
    });
  }

  for (const row of rows as InvoiceRecord[]) {
    if (row.parent_record_id) continue;
    const stageMap = recordsMap.get(row.business_id);
    if (!stageMap) continue;
    const stage = row.invoice_stage as keyof InvoiceRecordsByStage;
    if (stageMap[stage]) stageMap[stage].push(row);
  }

  return recordsMap;
}

/**
 * 사업장별 미수금 일괄 계산
 */
function calculateBatchReceivables(
  businesses: any[],
  recordsMap: Map<string, InvoiceRecordsByStage>
): Record<string, number> {
  const result: Record<string, number> = {};

  for (const b of businesses) {
    const category = mapProgressToCategory(b.progress_status);
    const stages = recordsMap.get(b.id) || {
      subsidy_1st: [], subsidy_2nd: [], subsidy_additional: [],
      self_advance: [], self_balance: [], extra: [],
    };

    const getOriginal = (stage: keyof InvoiceRecordsByStage): InvoiceRecord | null =>
      stages[stage].find((r: InvoiceRecord) => r.record_type === 'original') || null;

    // 총 입금액 집계
    let allPayments = 0;
    if (category === '보조금') {
      const r1 = getOriginal('subsidy_1st');
      const r2 = getOriginal('subsidy_2nd');
      const rA = getOriginal('subsidy_additional');
      allPayments =
        (r1 !== null ? (r1.payment_amount || 0) : (Number(b.payment_1st_amount) || 0)) +
        (r2 !== null ? (r2.payment_amount || 0) : (Number(b.payment_2nd_amount) || 0)) +
        (rA !== null ? (rA.payment_amount || 0) : (Number(b.payment_additional_amount) || 0));
    } else {
      const rAdv = getOriginal('self_advance');
      const rBal = getOriginal('self_balance');
      allPayments =
        (rAdv !== null ? (rAdv.payment_amount || 0) : (Number(b.payment_advance_amount) || 0)) +
        (rBal !== null ? (rBal.payment_amount || 0) : (Number(b.payment_balance_amount) || 0));
    }
    allPayments += stages.extra
      .filter((r: InvoiceRecord) => r.record_type !== 'cancelled')
      .reduce((sum: number, r: InvoiceRecord) => sum + (r.payment_amount || 0), 0);

    // 기준금액: 실제 발행된 계산서 합산
    let invoicedFallback = 0;
    if (category === '보조금') {
      const r1 = getOriginal('subsidy_1st');
      const r2 = getOriginal('subsidy_2nd');
      const rA = getOriginal('subsidy_additional');
      invoicedFallback =
        (r1 ? (r1.total_amount || 0) : (Number(b.invoice_1st_amount) || 0)) +
        (r2 ? (r2.total_amount || 0) : (Number(b.invoice_2nd_amount) || 0)) +
        (rA
          ? (rA.issue_date ? (rA.total_amount || 0) : 0)
          : (b.invoice_additional_date
              ? Math.round((Number(b.additional_cost) || 0) * 1.1)
              : 0));
    } else {
      const rAdv = getOriginal('self_advance');
      const rBal = getOriginal('self_balance');
      invoicedFallback =
        (rAdv ? (rAdv.total_amount || 0) : (Number(b.invoice_advance_amount) || 0)) +
        (rBal ? (rBal.total_amount || 0) : (Number(b.invoice_balance_amount) || 0));
    }
    invoicedFallback += stages.extra
      .filter((r: InvoiceRecord) => r.record_type !== 'cancelled')
      .reduce((sum: number, r: InvoiceRecord) => sum + (r.total_amount || 0), 0);

    // extra 계산서 공급가액 합계 — contract_amount 보정용
    const extraSupplyTotal = stages.extra
      .filter((r: InvoiceRecord) => r.record_type !== 'cancelled')
      .reduce((sum: number, r: InvoiceRecord) => sum + (r.supply_amount || 0), 0);
    const contractAmountWithExtra = Math.round((b.contract_amount || 0) + extraSupplyTotal * 1.1);

    // contract_amount(extra 보정 후)와 실제 발행 계산서 중 큰 값 사용
    const baseFromInvoice = Math.max(contractAmountWithExtra, invoicedFallback);

    // 계산서 발행이 없고 입금만 있는 경우: 입금액이 실질 기준
    const baseAmount = baseFromInvoice > 0 ? baseFromInvoice : allPayments;

    result[b.id] = baseAmount === 0
      ? 0
      : calculateReceivables({
          installationDate: b.installation_date,
          totalRevenueWithTax: baseAmount,
          totalPayments: allPayments,
        });
  }

  return result;
}
