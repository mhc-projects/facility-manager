import { NextRequest, NextResponse } from 'next/server';
import { query as pgQuery } from '@/lib/supabase-direct';
import { verifyTokenString } from '@/utils/auth';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/as-materials/[id]
 * 사용자재 수정
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
    const { device_type, device_label, price_list_id, material_name, quantity, unit, unit_price, notes } = body;

    const result = await pgQuery(
      `UPDATE as_material_usage SET
        device_type = COALESCE($1, device_type),
        device_label = COALESCE($2, device_label),
        price_list_id = $3,
        material_name = COALESCE($4, material_name),
        quantity = COALESCE($5, quantity),
        unit = COALESCE($6, unit),
        unit_price = COALESCE($7, unit_price),
        notes = COALESCE($8, notes)
      WHERE id = $9
      RETURNING *`,
      [
        device_type ?? null,
        device_label ?? null,
        price_list_id ?? null,
        material_name ?? null,
        quantity ?? null,
        unit ?? null,
        unit_price ?? null,
        notes ?? null,
        id,
      ]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ success: false, error: '자재를 찾을 수 없습니다' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('[as-materials/[id]] PATCH error:', error);
    return NextResponse.json({ success: false, error: '자재 수정 실패' }, { status: 500 });
  }
}

/**
 * DELETE /api/as-materials/[id]
 * 사용자재 삭제
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
    const result = await pgQuery(
      `DELETE FROM as_material_usage WHERE id = $1 RETURNING id`,
      [id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ success: false, error: '자재를 찾을 수 없습니다' }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: '자재가 삭제되었습니다' });
  } catch (error) {
    console.error('[as-materials/[id]] DELETE error:', error);
    return NextResponse.json({ success: false, error: '자재 삭제 실패' }, { status: 500 });
  }
}
