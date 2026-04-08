import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/supabase-direct';
import { verifyTokenString } from '@/utils/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/installation-closing/summary?month=2026-04
 * 월별 요약 통계
 */
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ success: false, message: '인증이 필요합니다.' }, { status: 401 });
    }

    const decoded = verifyTokenString(authHeader.substring(7));
    if (!decoded) {
      return NextResponse.json({ success: false, message: '유효하지 않은 토큰입니다.' }, { status: 401 });
    }

    const permissionLevel = decoded.permissionLevel || decoded.permission_level;
    if (!permissionLevel || permissionLevel < 3) {
      return NextResponse.json({ success: false, message: '권한이 필요합니다.' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month');

    if (!month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      return NextResponse.json({ success: false, message: '올바른 월 형식이 필요합니다.' }, { status: 400 });
    }

    const summary = await queryOne(`
      SELECT
        COALESCE(COUNT(*) FILTER (WHERE payment_type = 'forecast' AND status = 'paid'), 0)::int AS forecast_paid_count,
        COALESCE(SUM(actual_amount) FILTER (WHERE payment_type = 'forecast' AND status = 'paid'), 0)::bigint AS forecast_paid_amount,
        COALESCE(COUNT(*) FILTER (WHERE payment_type = 'final' AND status = 'paid'), 0)::int AS final_paid_count,
        COALESCE(SUM(actual_amount) FILTER (WHERE payment_type = 'final' AND status = 'paid'), 0)::bigint AS final_paid_amount,
        COALESCE(COUNT(*) FILTER (WHERE payment_type = 'adjustment' AND status = 'pending'), 0)::int AS adjustment_pending_count,
        COALESCE(SUM(actual_amount) FILTER (WHERE payment_type = 'adjustment' AND status = 'pending'), 0)::bigint AS adjustment_pending_amount,
        COALESCE(COUNT(DISTINCT business_id) FILTER (WHERE status = 'paid'), 0)::int AS total_businesses_paid
      FROM installation_payments
      WHERE payment_month = $1
        AND status NOT IN ('cancelled', 'deducted')
    `, [month]);

    return NextResponse.json({
      success: true,
      data: { month, ...summary },
    }, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
    });
  } catch (error: any) {
    console.error('❌ [CLOSING] 요약 통계 조회 실패:', error);
    return NextResponse.json({ success: false, message: '요약 통계 조회에 실패했습니다.' }, { status: 500 });
  }
}
