import { NextRequest, NextResponse } from 'next/server';
import { transaction } from '@/lib/supabase-direct';
import { verifyTokenString } from '@/utils/auth';
import { calculateFinalDiff } from '@/lib/installation-closing';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/installation-closing/final/process
 * 선택된 건 본마감 일괄 처리
 *
 * 예측마감 유무에 따라 동작이 다름:
 * - 예측마감 있음 → 차액 정산 (adjustment 레코드 생성)
 * - 예측마감 없음 → 전체 금액 본마감 (final 레코드 직접 생성)
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ success: false, message: '인증이 필요합니다.' }, { status: 401 });
    }

    const decoded = verifyTokenString(authHeader.substring(7));
    if (!decoded) {
      return NextResponse.json({ success: false, message: '유효하지 않은 토큰입니다.' }, { status: 401 });
    }

    const userId = decoded.userId || decoded.id;
    const permissionLevel = decoded.permissionLevel || decoded.permission_level;
    if (!permissionLevel || permissionLevel < 3) {
      return NextResponse.json({ success: false, message: '설치비 마감 권한이 필요합니다.' }, { status: 403 });
    }

    const body = await request.json();
    const { business_ids, payment_month } = body;

    if (!Array.isArray(business_ids) || business_ids.length === 0) {
      return NextResponse.json({ success: false, message: 'business_ids가 필요합니다.' }, { status: 400 });
    }

    if (!payment_month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(payment_month)) {
      return NextResponse.json({ success: false, message: '올바른 월 형식이 필요합니다.' }, { status: 400 });
    }

    const result = await transaction(async (client) => {
      // 대상 사업장 행 락 (FOR UPDATE) — forecast/process 와 동일한 패턴
      // 동시 요청이 들어와도 한 트랜잭션씩 순차 처리됨
      await client.query(`
        SELECT id FROM business_info WHERE id = ANY($1) FOR UPDATE OF business_info
      `, [business_ids]);

      let processed = 0;
      let skipped = 0;
      const skippedIds: string[] = [];

      for (const bizId of business_ids) {
        // 이미 paid 상태 본마감이 있으면 스킵
        const { rows: existing } = await client.query(`
          SELECT id FROM installation_payments
          WHERE business_id = $1 AND payment_type = 'final' AND status = 'paid'
            AND payment_month = $2
          LIMIT 1
        `, [bizId, payment_month]);

        if (existing.length > 0) {
          skipped++;
          skippedIds.push(bizId);
          continue;
        }

        // 기존 pending final/adjustment 레코드가 있으면 paid로 변경
        const { rowCount: updatedCount } = await client.query(`
          UPDATE installation_payments
          SET status = 'paid', payment_date = CURRENT_DATE, payment_month = $2
          WHERE business_id = $1
            AND payment_type IN ('final', 'adjustment')
            AND status = 'pending'
        `, [bizId, payment_month]);

        // pending 레코드가 없었으면 → 새로 final 레코드 생성 (예측마감 없이 바로 본마감)
        if (!updatedCount || updatedCount === 0) {
          const diff = await calculateFinalDiff(bizId);
          const snapshotData = JSON.stringify({
            equipment_breakdown: diff.final_breakdown.equipment_breakdown,
            additional_cost: 0,
            installation_extra_cost: diff.final_breakdown.extra_installation_cost,
            calculated_at: new Date().toISOString(),
            forecast_total: diff.forecast_total,
            is_direct_final: diff.forecast_total === 0, // 예측마감 없이 직접 본마감
          });

          // 항목별 final 레코드 생성
          if (diff.final_breakdown.base_installation_cost > 0) {
            await client.query(`
              INSERT INTO installation_payments
                (business_id, payment_type, payment_category, calculated_amount, actual_amount,
                 snapshot_data, payment_month, payment_date, status, created_by)
              VALUES ($1, 'final', 'base_installation', $2, $2, $3, $4, CURRENT_DATE, 'paid', $5)
              ON CONFLICT DO NOTHING
            `, [bizId, diff.final_breakdown.base_installation_cost, snapshotData, payment_month, userId]);
          }

          if (diff.final_breakdown.additional_construction_cost > 0) {
            await client.query(`
              INSERT INTO installation_payments
                (business_id, payment_type, payment_category, calculated_amount, actual_amount,
                 snapshot_data, payment_month, payment_date, status, created_by)
              VALUES ($1, 'final', 'additional_construction', $2, $2, $3, $4, CURRENT_DATE, 'paid', $5)
              ON CONFLICT DO NOTHING
            `, [bizId, diff.final_breakdown.additional_construction_cost, snapshotData, payment_month, userId]);
          }

          if (diff.final_breakdown.extra_installation_cost > 0) {
            await client.query(`
              INSERT INTO installation_payments
                (business_id, payment_type, payment_category, calculated_amount, actual_amount,
                 snapshot_data, payment_month, payment_date, status, created_by)
              VALUES ($1, 'final', 'extra_installation', $2, $2, $3, $4, CURRENT_DATE, 'paid', $5)
              ON CONFLICT DO NOTHING
            `, [bizId, diff.final_breakdown.extra_installation_cost, snapshotData, payment_month, userId]);
          }

          // 예측마감이 있고 차액이 있으면 adjustment 레코드도 생성
          if (diff.forecast_total > 0 && diff.diff_total !== 0) {
            for (const detail of diff.diff_details) {
              if (detail.diff !== 0) {
                await client.query(`
                  INSERT INTO installation_payments
                    (business_id, payment_type, payment_category, calculated_amount, actual_amount,
                     snapshot_data, payment_month, payment_date, status, created_by)
                  VALUES ($1, 'adjustment', $2, $3, $3, $4, $5, CURRENT_DATE, 'paid', $6)
                  ON CONFLICT DO NOTHING
                `, [bizId, detail.category, detail.diff, snapshotData, payment_month, userId]);
              }
            }
          }
        }

        processed++;
      }

      return { processed, skipped, skipped_ids: skippedIds };
    });

    return NextResponse.json({
      success: true,
      data: result,
      message: `${result.processed}건 본마감 처리 완료${result.skipped > 0 ? ` (${result.skipped}건 이미 처리됨)` : ''}`,
    }, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
    });
  } catch (error: any) {
    console.error('❌ [FINAL] 본마감 처리 실패:', error);
    return NextResponse.json({ success: false, message: '본마감 처리에 실패했습니다.' }, { status: 500 });
  }
}
