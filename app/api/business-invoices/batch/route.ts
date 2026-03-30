/**
 * POST /api/business-invoices/batch
 *
 * 여러 사업장의 미수금을 한 번에 계산합니다.
 * revenue page 테이블이 이 API를 사용해 테이블과 모달의 미수금을 단일 로직으로 통일합니다.
 *
 * Request body:
 *   { businesses: Array<{ id, progress_status, installation_date, contract_amount, ...payment fields }> }
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

function mapProgressToCategory(s: string | null | undefined): '보조금' | '자비' {
  const v = (s || '').trim();
  if (v === '보조금' || v === '보조금 동시진행' || v === '보조금 추가승인') return '보조금';
  return '자비';
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const businesses: any[] = body.businesses || [];

    if (!businesses.length) {
      return NextResponse.json({ success: true, data: {} });
    }

    const ids = businesses.map((b: any) => b.id);

    // 모든 사업장의 invoice_records를 한 번에 조회
    // supply_amount: extra 계산서의 부가세 제외 금액 — contract_amount 보정에 사용
    const placeholders = ids.map((_: any, i: number) => `$${i + 1}`).join(', ');
    const recordsResult = await pgQuery(
      `SELECT id, business_id, invoice_stage, record_type, parent_record_id,
              issue_date, total_amount, supply_amount, payment_amount, is_active
       FROM invoice_records
       WHERE business_id IN (${placeholders}) AND is_active = TRUE
       ORDER BY business_id, invoice_stage, record_type, created_at ASC`,
      ids
    );

    // business_id → stage → records 맵 구성
    const recordsMap = new Map<string, InvoiceRecordsByStage>();
    for (const id of ids) {
      recordsMap.set(id, {
        subsidy_1st: [], subsidy_2nd: [], subsidy_additional: [],
        self_advance: [], self_balance: [], extra: [],
      });
    }

    if (recordsResult.rows?.length) {
      for (const row of recordsResult.rows as InvoiceRecord[]) {
        if (row.parent_record_id) continue; // 수정이력은 미수금 계산에서 제외
        const stageMap = recordsMap.get(row.business_id);
        if (!stageMap) continue;
        const stage = row.invoice_stage as keyof InvoiceRecordsByStage;
        if (stageMap[stage]) stageMap[stage].push(row);
      }
    }

    // 사업장별 미수금 계산
    const result: Record<string, number> = {};

    for (const b of businesses) {
      const category = mapProgressToCategory(b.progress_status);
      const stages = recordsMap.get(b.id) || {
        subsidy_1st: [], subsidy_2nd: [], subsidy_additional: [],
        self_advance: [], self_balance: [], extra: [],
      };

      const getOriginal = (stage: keyof InvoiceRecordsByStage): InvoiceRecord | null =>
        stages[stage].find((r: InvoiceRecord) => r.record_type === 'original') || null;

      // 총 입금액 집계 (계산서/날짜 무관, payment_amount 있으면 합산)
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

      // 기준금액: 실제 발행된 계산서 합산 (DB total_amount 기준)
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

      // extra 계산서 공급가액(부가세 제외) 합계 — contract_amount 보정용
      // contract_amount는 클라이언트의 calculateBusinessRevenue() 기반이므로 invoice_records.extra를 모름.
      // 서버에서 직접 조회한 supply_amount × 1.1 을 더해 정확한 기준금액으로 보정.
      const extraSupplyTotal = stages.extra
        .filter((r: InvoiceRecord) => r.record_type !== 'cancelled')
        .reduce((sum: number, r: InvoiceRecord) => sum + (r.supply_amount || 0), 0);
      const contractAmountWithExtra = Math.round((b.contract_amount || 0) + extraSupplyTotal * 1.1);

      // contract_amount(extra 보정 후)와 실제 발행 계산서 중 큰 값 사용
      // (부가세 반올림으로 contract_amount가 실제보다 1원 작을 수 있으므로)
      const baseFromInvoice = Math.max(contractAmountWithExtra, invoicedFallback);

      // 계산서 발행이 없고 입금만 있는 경우: 입금액이 실질 기준 (마이너스 방지)
      // 계산서 발행이 있는 경우: allPayments 비교 안 함 (초과입금 음수 허용)
      const baseAmount = baseFromInvoice > 0 ? baseFromInvoice : allPayments;

      result[b.id] = baseAmount === 0
        ? 0
        : calculateReceivables({
            installationDate: b.installation_date,
            totalRevenueWithTax: baseAmount,
            totalPayments: allPayments,
          });
    }

    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    console.error('❌ [BUSINESS-INVOICES/BATCH] Error:', error);
    return NextResponse.json(
      { success: false, message: '서버 오류', error: error.message },
      { status: 500 }
    );
  }
}
