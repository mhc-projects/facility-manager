import { NextRequest, NextResponse } from 'next/server';
import { queryOne, queryAll, transaction } from '@/lib/supabase-direct';
import { verifyTokenString } from '@/utils/auth';
import { calculateFinalDiff, dateToMonth } from '@/lib/installation-closing';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/installation-closing/final/auto-trigger
 * 설치완료 시 자동 호출 - 본마감 pending 레코드 생성
 * idempotent: 이미 본마감 기록이 있으면 스킵
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
    const body = await request.json();
    const { business_id } = body;

    if (!business_id) {
      return NextResponse.json({ success: false, message: 'business_id가 필요합니다.' }, { status: 400 });
    }

    // 사업장 확인
    const business = await queryOne(
      `SELECT id, business_name, installation_date, order_date FROM business_info WHERE id = $1`,
      [business_id]
    );

    if (!business || !business.installation_date) {
      return NextResponse.json({
        success: true,
        data: { action: 'skipped', reason: '설치완료일이 없습니다.' },
      });
    }

    // 예측마감 기록 확인
    const forecastPayments = await queryAll(`
      SELECT id FROM installation_payments
      WHERE business_id = $1 AND payment_type = 'forecast' AND status = 'paid'
    `, [business_id]);

    if (forecastPayments.length === 0) {
      return NextResponse.json({
        success: true,
        data: { action: 'skipped', reason: '예측마감 기록이 없습니다.' },
      });
    }

    // 이미 본마감 기록 있는지 확인 (idempotent)
    const existingFinal = await queryOne(`
      SELECT id, status FROM installation_payments
      WHERE business_id = $1 AND payment_type = 'final'
        AND status NOT IN ('cancelled', 'deducted')
      LIMIT 1
    `, [business_id]);

    if (existingFinal) {
      return NextResponse.json({
        success: true,
        data: { action: 'skipped', reason: '이미 본마감 기록이 존재합니다.', payment_id: existingFinal.id },
      });
    }

    // 차액 계산
    const diff = await calculateFinalDiff(business_id);
    const paymentMonth = dateToMonth(business.installation_date);

    const snapshotData = {
      equipment_breakdown: diff.final_breakdown.equipment_breakdown,
      additional_cost: diff.final_breakdown.additional_construction_cost,
      installation_extra_cost: diff.final_breakdown.extra_installation_cost,
      calculated_at: new Date().toISOString(),
      forecast_total: diff.forecast_total,
      diff_total: diff.diff_total,
    };

    // 트랜잭션으로 본마감 레코드 생성
    const result = await transaction(async (client) => {
      const payments: any[] = [];

      // 각 항목별 final 레코드 생성
      for (const detail of diff.diff_details) {
        if (detail.final_amount > 0 || detail.forecast_amount > 0) {
          const { rows } = await client.query(`
            INSERT INTO installation_payments
              (business_id, payment_type, payment_category, calculated_amount, actual_amount,
               snapshot_data, payment_month, status, created_by)
            VALUES ($1, 'final', $2, $3, $3, $4, $5, 'pending', $6)
            ON CONFLICT DO NOTHING
            RETURNING *
          `, [
            business_id,
            detail.category,
            detail.final_amount,
            JSON.stringify(snapshotData),
            paymentMonth,
            userId,
          ]);
          if (rows[0]) payments.push(rows[0]);
        }
      }

      // 차액이 있으면 adjustment 레코드도 생성
      if (diff.diff_total !== 0) {
        for (const detail of diff.diff_details) {
          if (detail.diff !== 0) {
            const { rows } = await client.query(`
              INSERT INTO installation_payments
                (business_id, payment_type, payment_category, calculated_amount, actual_amount,
                 snapshot_data, payment_month, status, created_by)
              VALUES ($1, 'adjustment', $2, $3, $3, $4, $5, 'pending', $6)
              ON CONFLICT DO NOTHING
              RETURNING *
            `, [
              business_id,
              detail.category,
              detail.diff,
              JSON.stringify(snapshotData),
              paymentMonth,
              userId,
            ]);
            if (rows[0]) payments.push(rows[0]);
          }
        }
      }

      return payments;
    });

    console.log(`✅ [FINAL-TRIGGER] ${business.business_name} 본마감 자동 생성: ${result.length}건, 차액: ${diff.diff_total}`);

    return NextResponse.json({
      success: true,
      data: {
        action: 'created',
        payments_created: result.length,
        diff_total: diff.diff_total,
        payment_month: paymentMonth,
      },
    }, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
    });
  } catch (error: any) {
    console.error('❌ [FINAL-TRIGGER] 본마감 자동 생성 실패:', error);
    return NextResponse.json({ success: false, message: '본마감 자동 생성에 실패했습니다.' }, { status: 500 });
  }
}
