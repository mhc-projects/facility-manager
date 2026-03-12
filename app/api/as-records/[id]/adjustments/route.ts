import { NextRequest, NextResponse } from 'next/server';
import { query as pgQuery } from '@/lib/supabase-direct';
import { verifyTokenString } from '@/utils/auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/as-records/[id]/adjustments
 * 매출/매입 금액 조정 이력 조회
 */
export async function GET(
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
      `SELECT
        id,
        as_record_id,
        adjustment_type,
        amount,
        reason,
        created_by_name,
        created_at
      FROM as_price_adjustments
      WHERE as_record_id = $1 AND is_deleted = FALSE
      ORDER BY created_at ASC`,
      [id]
    );

    // 요약 계산
    const rows = result.rows;
    const revenueTotal = rows
      .filter((r: any) => r.adjustment_type === 'revenue')
      .reduce((sum: number, r: any) => sum + Number(r.amount), 0);
    const costTotal = rows
      .filter((r: any) => r.adjustment_type === 'cost')
      .reduce((sum: number, r: any) => sum + Number(r.amount), 0);

    return NextResponse.json({
      success: true,
      data: rows,
      summary: {
        revenue_adjustment_total: revenueTotal,
        cost_adjustment_total: costTotal,
      },
    });
  } catch (error) {
    console.error('[as-records/[id]/adjustments] GET error:', error);
    return NextResponse.json({ success: false, error: '조정 이력 조회 실패' }, { status: 500 });
  }
}

/**
 * POST /api/as-records/[id]/adjustments
 * 금액 조정 추가
 */
export async function POST(
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
    const { adjustment_type, amount, reason, created_by_name } = body;

    // 유효성 검사
    if (!adjustment_type || !['revenue', 'cost'].includes(adjustment_type)) {
      return NextResponse.json({ success: false, error: '조정 유형이 올바르지 않습니다 (revenue 또는 cost)' }, { status: 400 });
    }
    if (amount === undefined || amount === null || isNaN(Number(amount))) {
      return NextResponse.json({ success: false, error: '조정 금액을 입력해주세요' }, { status: 400 });
    }
    if (Number(amount) === 0) {
      return NextResponse.json({ success: false, error: '조정 금액은 0이 될 수 없습니다' }, { status: 400 });
    }
    if (!reason || !reason.trim()) {
      return NextResponse.json({ success: false, error: '조정 사유를 입력해주세요' }, { status: 400 });
    }

    // AS 건 존재 확인
    const recordCheck = await pgQuery(
      `SELECT id FROM as_records WHERE id = $1 AND is_deleted = FALSE`,
      [id]
    );
    if (recordCheck.rows.length === 0) {
      return NextResponse.json({ success: false, error: 'AS 건을 찾을 수 없습니다' }, { status: 404 });
    }

    const result = await pgQuery(
      `INSERT INTO as_price_adjustments
        (as_record_id, adjustment_type, amount, reason, created_by_name)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *`,
      [id, adjustment_type, Math.round(Number(amount)), reason.trim(), created_by_name || null]
    );

    return NextResponse.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('[as-records/[id]/adjustments] POST error:', error);
    return NextResponse.json({ success: false, error: '금액 조정 추가 실패' }, { status: 500 });
  }
}
