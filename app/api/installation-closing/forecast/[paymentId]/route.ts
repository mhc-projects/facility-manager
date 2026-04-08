import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/supabase-direct';
import { verifyTokenString } from '@/utils/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * PUT /api/installation-closing/forecast/[paymentId]
 * 개별 건 금액 조정
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
      return NextResponse.json({ success: false, message: '설치비 마감 권한이 필요합니다.' }, { status: 403 });
    }

    const { paymentId } = await params;
    const body = await request.json();
    const { actual_amount, amount_diff_reason, notes } = body;

    if (actual_amount === undefined || actual_amount === null) {
      return NextResponse.json({ success: false, message: 'actual_amount가 필요합니다.' }, { status: 400 });
    }

    // 기존 레코드 확인
    const existing = await queryOne(
      `SELECT * FROM installation_payments WHERE id = $1`,
      [paymentId]
    );

    if (!existing) {
      return NextResponse.json({ success: false, message: '지급 기록을 찾을 수 없습니다.' }, { status: 404 });
    }

    // 금액 차이 시 사유 필수
    if (Number(actual_amount) !== Number(existing.calculated_amount) && !amount_diff_reason) {
      return NextResponse.json({
        success: false,
        message: '계산 금액과 다를 경우 사유 입력이 필요합니다.',
        error: { code: 'DIFF_REASON_REQUIRED' },
      }, { status: 400 });
    }

    const updated = await queryOne(`
      UPDATE installation_payments
      SET actual_amount = $1,
          amount_diff_reason = $2,
          notes = COALESCE($3, notes)
      WHERE id = $4
      RETURNING *
    `, [actual_amount, amount_diff_reason || null, notes || null, paymentId]);

    return NextResponse.json({
      success: true,
      data: updated,
      message: '금액이 수정되었습니다.',
    }, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
    });
  } catch (error: any) {
    console.error('❌ [FORECAST] 금액 조정 실패:', error);
    return NextResponse.json({
      success: false,
      message: '금액 조정에 실패했습니다.',
      error: { code: 'INTERNAL_ERROR', message: error.message },
    }, { status: 500 });
  }
}
