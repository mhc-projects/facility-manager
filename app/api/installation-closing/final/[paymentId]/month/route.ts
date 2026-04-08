import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/supabase-direct';
import { verifyTokenString } from '@/utils/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * PUT /api/installation-closing/final/[paymentId]/month
 * 개별 건 본마감 귀속월 변경
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ paymentId: string }> }
) {
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

    const { paymentId } = await params;
    const body = await request.json();
    const { payment_month } = body;

    if (!payment_month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(payment_month)) {
      return NextResponse.json({ success: false, message: '올바른 월 형식이 필요합니다.' }, { status: 400 });
    }

    const updated = await queryOne(`
      UPDATE installation_payments
      SET payment_month = $1
      WHERE id = $2 AND payment_type IN ('final', 'adjustment')
      RETURNING *
    `, [payment_month, paymentId]);

    if (!updated) {
      return NextResponse.json({ success: false, message: '지급 기록을 찾을 수 없습니다.' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: updated,
      message: `마감월이 ${payment_month}로 변경되었습니다.`,
    });
  } catch (error: any) {
    console.error('❌ [FINAL] 마감월 변경 실패:', error);
    return NextResponse.json({ success: false, message: '마감월 변경에 실패했습니다.' }, { status: 500 });
  }
}
