import { NextRequest, NextResponse } from 'next/server';
import { query as pgQuery } from '@/lib/supabase-direct';
import { verifyTokenString } from '@/utils/auth';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/business-collection-manager/[id]
 * 사업장 수금 담당자 업데이트
 * Body: { collection_manager_ids: string[] }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ success: false, error: '인증 토큰이 필요합니다' }, { status: 401 });
    }
    const token = authHeader.substring(7);
    const decoded = verifyTokenString(token);
    if (!decoded) {
      return NextResponse.json({ success: false, error: '유효하지 않은 토큰입니다' }, { status: 401 });
    }

    const { id } = params;
    if (!id) {
      return NextResponse.json({ success: false, error: 'ID가 필요합니다' }, { status: 400 });
    }

    const body = await request.json();
    const collectionManagerIds: string[] = Array.isArray(body.collection_manager_ids)
      ? body.collection_manager_ids
      : [];

    // UUID 형식 검증
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const invalidIds = collectionManagerIds.filter(id => !uuidRegex.test(id));
    if (invalidIds.length > 0) {
      return NextResponse.json(
        { success: false, error: '유효하지 않은 UUID가 포함되어 있습니다' },
        { status: 400 }
      );
    }

    const result = await pgQuery(
      `UPDATE business_info
       SET collection_manager_ids = $1::UUID[],
           updated_at = NOW()
       WHERE id = $2 AND is_deleted = false
       RETURNING id, business_name, collection_manager_ids`,
      [collectionManagerIds, id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: '사업장을 찾을 수 없습니다' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    console.error('[business-collection-manager] PATCH error:', error);
    return NextResponse.json(
      { success: false, error: '수금 담당자 업데이트 실패' },
      { status: 500 }
    );
  }
}
