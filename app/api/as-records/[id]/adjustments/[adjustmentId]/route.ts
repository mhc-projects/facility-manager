import { NextRequest, NextResponse } from 'next/server';
import { query as pgQuery } from '@/lib/supabase-direct';
import { verifyTokenString } from '@/utils/auth';

export const dynamic = 'force-dynamic';

/**
 * DELETE /api/as-records/[id]/adjustments/[adjustmentId]
 * 금액 조정 취소 (소프트 삭제)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; adjustmentId: string } }
) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ success: false, error: '인증 토큰이 필요합니다' }, { status: 401 });
    }
    const token = authHeader.substring(7);
    if (!verifyTokenString(token)) {
      return NextResponse.json({ success: false, error: '유효하지 않은 토큰입니다' }, { status: 401 });
    }

    const { id, adjustmentId } = params;
    const body = await request.json().catch(() => ({}));
    const { deleted_by_name } = body;

    const result = await pgQuery(
      `UPDATE as_price_adjustments
       SET is_deleted = TRUE, deleted_at = NOW(), deleted_by_name = $1
       WHERE id = $2 AND as_record_id = $3 AND is_deleted = FALSE
       RETURNING id`,
      [deleted_by_name || null, adjustmentId, id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ success: false, error: '조정 항목을 찾을 수 없습니다' }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: '조정이 취소되었습니다' });
  } catch (error) {
    console.error('[as-records/[id]/adjustments/[adjustmentId]] DELETE error:', error);
    return NextResponse.json({ success: false, error: '조정 취소 실패' }, { status: 500 });
  }
}
