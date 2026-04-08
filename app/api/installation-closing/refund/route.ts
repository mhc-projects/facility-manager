import { NextRequest, NextResponse } from 'next/server';
import { transaction, queryAll } from '@/lib/supabase-direct';
import { verifyTokenString } from '@/utils/auth';
import { getNextMonth } from '@/lib/installation-closing';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/installation-closing/refund
 * 발주 취소/변경 시 환수 처리
 * - 기존 예측마감 기록 cancelled
 * - 차기 월에 음수 금액 deducted 기록 생성
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
    const { business_id, reason, old_month, new_month } = body;

    if (!business_id) {
      return NextResponse.json({ success: false, message: 'business_id가 필요합니다.' }, { status: 400 });
    }

    // 해당 사업장의 paid 상태 예측마감 기록 조회
    const paidForecasts = await queryAll(`
      SELECT id, payment_category, actual_amount, payment_month
      FROM installation_payments
      WHERE business_id = $1 AND payment_type = 'forecast' AND status = 'paid'
    `, [business_id]);

    if (paidForecasts.length === 0) {
      return NextResponse.json({
        success: true,
        data: { action: 'skipped', reason: '예측마감 지급 기록이 없습니다.' },
      });
    }

    const result = await transaction(async (client) => {
      let cancelledCount = 0;
      let deductedCount = 0;
      let totalRefundAmount = 0;

      for (const forecast of paidForecasts) {
        // 1. 원래 기록을 cancelled로 변경
        await client.query(`
          UPDATE installation_payments
          SET status = 'cancelled',
              notes = COALESCE(notes || ' | ', '') || $1
          WHERE id = $2
        `, [
          `환수: ${reason === 'order_date_deleted' ? '발주일 삭제' : `발주일 변경 (${old_month} → ${new_month})`}`,
          forecast.id,
        ]);
        cancelledCount++;

        // 2. 차기 월에 차감(deducted) 기록 생성
        const currentMonth = new Date().toISOString().substring(0, 7);
        const nextMonth = getNextMonth(currentMonth);
        const refundAmount = -(Number(forecast.actual_amount) || 0);

        await client.query(`
          INSERT INTO installation_payments
            (business_id, payment_type, payment_category, calculated_amount, actual_amount,
             payment_month, status, notes, created_by)
          VALUES ($1, 'adjustment', $2, $3, $3, $4, 'deducted', $5, $6)
        `, [
          business_id,
          forecast.payment_category,
          refundAmount,
          nextMonth,
          `차기 월 차감: 원 지급건 ${forecast.id} (${forecast.payment_month})`,
          userId,
        ]);
        deductedCount++;
        totalRefundAmount += Math.abs(Number(forecast.actual_amount) || 0);
      }

      return { cancelledCount, deductedCount, totalRefundAmount };
    });

    console.log(`✅ [REFUND] 환수 처리 완료: 취소 ${result.cancelledCount}건, 차감 ${result.deductedCount}건, 금액 ${result.totalRefundAmount}`);

    return NextResponse.json({
      success: true,
      data: result,
      message: `${result.cancelledCount}건 환수 처리 완료 (차기 월 차감액: ${result.totalRefundAmount.toLocaleString()}원)`,
    }, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
    });
  } catch (error: any) {
    console.error('❌ [REFUND] 환수 처리 실패:', error);
    return NextResponse.json({ success: false, message: '환수 처리에 실패했습니다.' }, { status: 500 });
  }
}
