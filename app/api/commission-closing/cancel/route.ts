import { NextRequest, NextResponse } from 'next/server';
import { query as pgQuery } from '@/lib/supabase-direct';
import { verifyTokenString } from '@/utils/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function authGuard(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const decoded = verifyTokenString(authHeader.substring(7));
  if (!decoded) return null;
  const level = decoded.permissionLevel ?? decoded.permission_level;
  if (!level || level < 3) return null;
  return decoded;
}

/**
 * POST /api/commission-closing/cancel
 * eligible 상태의 commission_payments를 cancelled로 변경 → 처리 대기 상태로 복귀
 * Body: { commission_payment_ids: string[] }
 */
export async function POST(request: NextRequest) {
  try {
    const decoded = authGuard(request);
    if (!decoded) return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 403 });

    const body = await request.json();
    const { commission_payment_ids } = body;

    if (!commission_payment_ids?.length) {
      return NextResponse.json({ success: false, message: '취소할 항목을 선택하세요.' }, { status: 400 });
    }

    const result = await pgQuery(
      `UPDATE commission_payments
       SET status     = 'cancelled',
           updated_at = NOW()
       WHERE id = ANY($1::uuid[])
         AND status = 'eligible'`,
      [commission_payment_ids]
    );

    return NextResponse.json({
      success: true,
      message: `${commission_payment_ids.length}건 처리가 취소되어 처리 대기로 복귀했습니다.`,
    });
  } catch (error) {
    console.error('❌ [COMMISSION-CANCEL] 오류:', error);
    return NextResponse.json({ success: false, message: '서버 오류' }, { status: 500 });
  }
}
