import { NextRequest, NextResponse } from 'next/server';
import { query as pgQuery } from '@/lib/supabase-direct';
import { verifyTokenString } from '@/utils/auth';

export const dynamic = 'force-dynamic';

type RiskLevel = '상' | '중' | '하' | null;

/**
 * PATCH /api/business-risk/[id]
 * 사업장 미수금 위험도 업데이트
 * Body: { risk: '상' | '중' | '하' | null }
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
    const risk: RiskLevel = body.risk ?? null;

    // 허용값 검증
    if (risk !== null && !['상', '중', '하'].includes(risk)) {
      return NextResponse.json(
        { success: false, error: '위험도는 상, 중, 하 중 하나여야 합니다' },
        { status: 400 }
      );
    }

    const result = await pgQuery(
      `UPDATE business_info
       SET receivable_risk = $1, updated_at = NOW()
       WHERE id = $2 AND is_deleted = false
       RETURNING id, business_name, receivable_risk`,
      [risk, id]
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
    console.error('[business-risk] PATCH error:', error);
    return NextResponse.json(
      { success: false, error: '위험도 업데이트 실패' },
      { status: 500 }
    );
  }
}
