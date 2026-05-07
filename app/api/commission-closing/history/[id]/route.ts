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
  if (!level || level < 4) return null;
  return decoded;
}

/**
 * DELETE /api/commission-closing/history/[id]
 * 영업비 지급 이력 삭제 (권한 4 이상)
 */
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const decoded = authGuard(request);
    if (!decoded) return NextResponse.json({ success: false, message: '권한이 없습니다. (권한 4 이상 필요)' }, { status: 403 });

    const { id } = params;

    const result = await pgQuery(
      `DELETE FROM commission_payments
       WHERE id = $1
         AND status IN ('paid', 'cancelled')
       RETURNING id`,
      [id]
    );

    if (!result.rows?.length) {
      return NextResponse.json({ success: false, message: '삭제 대상을 찾을 수 없습니다.' }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: '이력이 삭제되었습니다.' });
  } catch (error) {
    console.error('❌ [COMMISSION-HISTORY-DELETE] 오류:', error);
    return NextResponse.json({ success: false, message: '서버 오류' }, { status: 500 });
  }
}
