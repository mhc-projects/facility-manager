import { NextRequest, NextResponse } from 'next/server';
import { query as pgQuery } from '@/lib/supabase-direct';
import { verifyTokenString } from '@/utils/auth';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/as-price-list/[id]
 * 단가표 항목 수정
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
    if (!verifyTokenString(token)) {
      return NextResponse.json({ success: false, error: '유효하지 않은 토큰입니다' }, { status: 401 });
    }

    const { id } = params;
    const body = await request.json();
    const { category, item_name, unit_price, unit, description, sort_order, is_active } = body;

    const result = await pgQuery(
      `UPDATE as_price_list SET
        category = COALESCE($1, category),
        item_name = COALESCE($2, item_name),
        unit_price = COALESCE($3, unit_price),
        unit = COALESCE($4, unit),
        description = COALESCE($5, description),
        sort_order = COALESCE($6, sort_order),
        is_active = COALESCE($7, is_active),
        updated_at = NOW()
      WHERE id = $8
      RETURNING *`,
      [
        category ?? null,
        item_name ?? null,
        unit_price !== undefined ? Number(unit_price) : null,
        unit ?? null,
        description ?? null,
        sort_order ?? null,
        is_active ?? null,
        id,
      ]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ success: false, error: '단가표 항목을 찾을 수 없습니다' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('[as-price-list/[id]] PATCH error:', error);
    return NextResponse.json({ success: false, error: '단가표 항목 수정 실패' }, { status: 500 });
  }
}

/**
 * DELETE /api/as-price-list/[id]
 * 단가표 항목 삭제 (is_active = false 처리)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
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

    const { id } = params;
    // 자재에서 참조 중인지 확인
    const usageCheck = await pgQuery(
      `SELECT COUNT(*) FROM as_material_usage WHERE price_list_id = $1`,
      [id]
    );
    const usageCount = parseInt(usageCheck.rows[0]?.count || '0');

    if (usageCount > 0) {
      // 참조 중이면 비활성화만 (스냅샷이 보존되어야 하므로)
      const result = await pgQuery(
        `UPDATE as_price_list SET is_active = false, updated_at = NOW()
         WHERE id = $1 RETURNING id, item_name`,
        [id]
      );
      return NextResponse.json({
        success: true,
        message: `사용 중인 항목이므로 비활성화 처리되었습니다.`,
        data: result.rows[0],
      });
    }

    // 참조 없으면 실제 삭제
    const result = await pgQuery(
      `DELETE FROM as_price_list WHERE id = $1 RETURNING id`,
      [id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ success: false, error: '단가표 항목을 찾을 수 없습니다' }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: '단가표 항목이 삭제되었습니다' });
  } catch (error) {
    console.error('[as-price-list/[id]] DELETE error:', error);
    return NextResponse.json({ success: false, error: '단가표 항목 삭제 실패' }, { status: 500 });
  }
}
