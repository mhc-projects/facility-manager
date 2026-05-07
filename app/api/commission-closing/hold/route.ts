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
 * POST /api/commission-closing/hold
 * eligible → on_hold (수동 보류)
 * Body: { id: string, hold_note?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const decoded = authGuard(request);
    if (!decoded) return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 403 });

    const { id, hold_note } = await request.json();
    if (!id) return NextResponse.json({ success: false, message: 'ID 필요' }, { status: 400 });

    await pgQuery(
      `UPDATE commission_payments
       SET status      = 'on_hold',
           hold_reason = 'manual',
           hold_note   = COALESCE($1, hold_note),
           updated_at  = NOW()
       WHERE id = $2 AND status = 'eligible'`,
      [hold_note ?? null, id]
    );

    return NextResponse.json({ success: true, message: '보류 처리 완료' });
  } catch (error) {
    console.error('❌ [COMMISSION-HOLD] 오류:', error);
    return NextResponse.json({ success: false, message: '서버 오류' }, { status: 500 });
  }
}

/**
 * PATCH /api/commission-closing/hold
 * hold_note 업데이트 (메모 추가)
 * Body: { id: string, hold_note: string }
 */
export async function PATCH(request: NextRequest) {
  try {
    const decoded = authGuard(request);
    if (!decoded) return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 403 });

    const { id, hold_note } = await request.json();
    if (!id) return NextResponse.json({ success: false, message: 'ID 필요' }, { status: 400 });

    await pgQuery(
      `UPDATE commission_payments SET hold_note = $1, updated_at = NOW() WHERE id = $2`,
      [hold_note, id]
    );

    return NextResponse.json({ success: true, message: '메모 업데이트 완료' });
  } catch (error) {
    console.error('❌ [COMMISSION-HOLD] PATCH 오류:', error);
    return NextResponse.json({ success: false, message: '서버 오류' }, { status: 500 });
  }
}
