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
 * POST /api/commission-closing/pay
 * approved 상태 레코드를 paid로 전환
 * Body: { ids: string[], payment_date: string, payment_note?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const decoded = authGuard(request);
    if (!decoded) return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 403 });

    const userId = decoded.userId ?? decoded.id;
    const { ids, payment_date, payment_note } = await request.json();

    if (!ids?.length) {
      return NextResponse.json({ success: false, message: '지급 처리할 항목을 선택해주세요.' }, { status: 400 });
    }
    if (!payment_date) {
      return NextResponse.json({ success: false, message: '지급일을 입력해주세요.' }, { status: 400 });
    }

    await pgQuery(
      `UPDATE commission_payments
       SET status       = 'paid',
           payment_date = $1,
           payment_note = COALESCE($2, payment_note),
           paid_by      = $3,
           updated_at   = NOW()
       WHERE id = ANY($4::uuid[])
         AND status = 'approved'`,
      [payment_date, payment_note ?? null, userId, ids]
    );

    return NextResponse.json({ success: true, message: `${ids.length}건 지급 완료 처리` });
  } catch (error) {
    console.error('❌ [COMMISSION-PAY] 오류:', error);
    return NextResponse.json({ success: false, message: '서버 오류' }, { status: 500 });
  }
}
