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
 * PUT /api/commission-closing/hold/[id]/release
 * on_hold → eligible (보류 해제)
 * Body: { release_note?: string }
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const decoded = authGuard(request);
    if (!decoded) return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 403 });

    const { id } = params;
    const body = await request.json().catch(() => ({}));
    const releaseNote = body?.release_note;

    await pgQuery(
      `UPDATE commission_payments
       SET status            = 'eligible',
           hold_reason       = NULL,
           hold_note         = CASE WHEN $1::text IS NOT NULL
                                    THEN CONCAT(COALESCE(hold_note,''), ' [해제] ', $1::text)
                                    ELSE hold_note END,
           receivable_amount = 0,
           updated_at        = NOW()
       WHERE id = $2 AND status = 'on_hold'`,
      [releaseNote ?? null, id]
    );

    return NextResponse.json({ success: true, message: '보류 해제 완료' });
  } catch (error) {
    console.error('❌ [COMMISSION-HOLD-RELEASE] 오류:', error);
    return NextResponse.json({ success: false, message: '서버 오류' }, { status: 500 });
  }
}
