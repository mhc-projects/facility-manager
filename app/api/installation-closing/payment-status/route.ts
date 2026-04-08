import { NextRequest, NextResponse } from 'next/server';
import { queryAll } from '@/lib/supabase-direct';
import { verifyTokenString } from '@/utils/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/installation-closing/payment-status
 * 여러 사업장의 설치비 지급 상태 일괄 조회 (매출관리 페이지 연동용)
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

    const body = await request.json();
    const { business_ids } = body;

    if (!Array.isArray(business_ids) || business_ids.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    const statuses = await queryAll(`
      SELECT business_id, payment_status, has_refund_history
      FROM v_business_payment_status
      WHERE business_id = ANY($1)
    `, [business_ids]);

    return NextResponse.json({
      success: true,
      data: statuses,
    }, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
    });
  } catch (error: any) {
    console.error('❌ [PAYMENT-STATUS] 조회 실패:', error);
    return NextResponse.json({ success: false, message: '상태 조회에 실패했습니다.' }, { status: 500 });
  }
}
