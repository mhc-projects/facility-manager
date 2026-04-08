import { NextRequest, NextResponse } from 'next/server';
import { queryAll } from '@/lib/supabase-direct';
import { verifyTokenString } from '@/utils/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/installation-closing/history?month=2026-04&type=all
 * 마감 처리 이력 조회
 * type: forecast | final | all (기본값: all)
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
    const type = searchParams.get('type') || 'all';

    if (!month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      return NextResponse.json({ success: false, message: '올바른 월 형식이 필요합니다.' }, { status: 400 });
    }

    const typeFilter = type === 'all'
      ? `AND ip.payment_type IN ('forecast', 'final', 'adjustment')`
      : `AND ip.payment_type = '${type === 'forecast' ? 'forecast' : 'final'}'`;

    const records = await queryAll(`
      SELECT
        ip.id,
        ip.business_id,
        ip.payment_type,
        ip.payment_category,
        ip.calculated_amount,
        ip.actual_amount,
        ip.payment_month,
        ip.payment_date,
        ip.status,
        ip.amount_diff_reason,
        ip.notes,
        ip.created_at,
        b.business_name,
        b.sales_office,
        e.name AS created_by_name
      FROM installation_payments ip
      JOIN business_info b ON b.id = ip.business_id
      LEFT JOIN employees e ON e.id = ip.created_by
      WHERE ip.payment_month = $1
        ${typeFilter}
      ORDER BY ip.created_at DESC
    `, [month]);

    // 월별 요약
    const summary = {
      forecast_count: records.filter((r: any) => r.payment_type === 'forecast' && r.status === 'paid').length,
      forecast_amount: records
        .filter((r: any) => r.payment_type === 'forecast' && r.status === 'paid')
        .reduce((s: number, r: any) => s + Number(r.actual_amount), 0),
      final_count: records.filter((r: any) => r.payment_type === 'final' && r.status === 'paid').length,
      final_amount: records
        .filter((r: any) => r.payment_type === 'final' && r.status === 'paid')
        .reduce((s: number, r: any) => s + Number(r.actual_amount), 0),
      adjustment_count: records.filter((r: any) => r.payment_type === 'adjustment').length,
      adjustment_amount: records
        .filter((r: any) => r.payment_type === 'adjustment')
        .reduce((s: number, r: any) => s + Number(r.actual_amount), 0),
      cancelled_count: records.filter((r: any) => r.status === 'cancelled').length,
    };

    return NextResponse.json({
      success: true,
      data: { records, summary, month, type },
    }, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
    });
  } catch (error: any) {
    console.error('❌ [HISTORY] 이력 조회 실패:', error);
    return NextResponse.json({ success: false, message: '이력 조회에 실패했습니다.' }, { status: 500 });
  }
}
