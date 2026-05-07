import { NextRequest, NextResponse } from 'next/server';
import { query as pgQuery, queryOne } from '@/lib/supabase-direct';
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
 * POST /api/commission-closing/approve
 * eligible 상태 레코드를 approved로 전환
 * Body: { ids: string[] }  — commission_payments.id 배열
 */
export async function POST(request: NextRequest) {
  try {
    const decoded = authGuard(request);
    if (!decoded) return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 403 });

    const userId = decoded.userId ?? decoded.id;
    const { ids } = await request.json();

    if (!ids?.length) {
      return NextResponse.json({ success: false, message: '승인할 항목을 선택해주세요.' }, { status: 400 });
    }

    // eligible 상태만 승인 가능
    await pgQuery(
      `UPDATE commission_payments
       SET status      = 'approved',
           approved_by = $1,
           approved_at = NOW(),
           updated_at  = NOW()
       WHERE id = ANY($2::uuid[])
         AND status = 'eligible'`,
      [userId, ids]
    );

    return NextResponse.json({ success: true, message: `${ids.length}건 승인 완료` });
  } catch (error) {
    console.error('❌ [COMMISSION-APPROVE] 오류:', error);
    return NextResponse.json({ success: false, message: '서버 오류' }, { status: 500 });
  }
}
