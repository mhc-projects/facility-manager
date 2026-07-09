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
import {
  EQUIPMENT_FIELDS,
  calculateContractAmount,
  buildRecordsMap,
  computeBusinessReceivableNow,
} from '@/lib/receivables-engine';
import type { InvoiceRecordsByStage } from '@/types/invoice';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

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
      contract_amount: calculateContractAmount(biz, officialPrices),
    };
  }).filter(Boolean);

  // invoice_records 맵 구성
  const recordsMap = buildRecordsMap(ids, recordsResult.rows || []);

  // 미수금·입금액 계산
  const { receivables, payments } = calculateBatchReceivables(businesses, recordsMap);

  return NextResponse.json({ success: true, data: receivables, payments });
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
  const { receivables } = calculateBatchReceivables(businesses, recordsMap);

  // 매출관리 페이지: 기존 data 필드만 반환 (역방향 호환)
  return NextResponse.json({ success: true, data: receivables });
}

/**
 * 사업장별 미수금·입금액 일괄 계산 - lib/receivables-engine의 공유 공식을 사용
 * (주간 브리핑도 동일 공식을 써서 두 화면의 미수금 총액이 항상 일치한다)
 */
function calculateBatchReceivables(
  businesses: any[],
  recordsMap: Map<string, InvoiceRecordsByStage>
): { receivables: Record<string, number>; payments: Record<string, number> } {
  const result: Record<string, number> = {};
  const paymentsResult: Record<string, number> = {};

  for (const b of businesses) {
    const stages = recordsMap.get(b.id) || {
      subsidy_1st: [], subsidy_2nd: [], subsidy_additional: [],
      self_advance: [], self_balance: [], extra: [],
    };
    const { receivable, payment } = computeBusinessReceivableNow(b, stages);
    result[b.id] = receivable;
    paymentsResult[b.id] = payment;
  }

  return { receivables: result, payments: paymentsResult };
}
