import { NextRequest, NextResponse } from 'next/server';
import { query as pgQuery } from '@/lib/supabase-direct';
import { verifyTokenString } from '@/utils/auth';
import { verifyApiKey } from '@/utils/api-key-auth';

export const dynamic = 'force-dynamic';

/**
 * POST /api/as-records/[id]/materials
 * 사용자재 추가
 * JWT 토큰 또는 API 키 인증 모두 허용 (에코센스 등 외부 시스템 지원)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ success: false, error: '인증이 필요합니다' }, { status: 401 });
    }
    const token = authHeader.substring(7);

    // JWT 또는 API 키 중 하나 인증
    const isJwt = verifyTokenString(token);
    const apiKeyInfo = isJwt ? null : await verifyApiKey(token, `/api/as-records/${params.id}/materials`);
    if (!isJwt && !apiKeyInfo) {
      return NextResponse.json({ success: false, error: '유효하지 않은 인증 정보입니다' }, { status: 401 });
    }

    const { id: as_record_id } = params;
    const body = await request.json();
    const { device_type, device_label, price_list_id, material_name, quantity = 1, unit = '개', unit_price = 0, notes } = body;

    if (!material_name) {
      return NextResponse.json({ success: false, error: '자재명이 필요합니다' }, { status: 400 });
    }

    // AS 건 존재 확인
    const asRecord = await pgQuery(
      `SELECT id FROM as_records WHERE id = $1 AND is_deleted = false`,
      [as_record_id]
    );
    if (asRecord.rows.length === 0) {
      return NextResponse.json({ success: false, error: 'AS 건을 찾을 수 없습니다' }, { status: 404 });
    }

    const result = await pgQuery(
      `INSERT INTO as_material_usage (
        as_record_id, device_type, device_label, price_list_id,
        material_name, quantity, unit, unit_price, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        as_record_id,
        device_type || null,
        device_label || null,
        price_list_id || null,
        material_name,
        quantity,
        unit,
        unit_price,
        notes || null,
      ]
    );

    return NextResponse.json({ success: true, data: result.rows[0] }, { status: 201 });
  } catch (error) {
    console.error('[as-records/[id]/materials] POST error:', error);
    return NextResponse.json({ success: false, error: '자재 추가 실패' }, { status: 500 });
  }
}
