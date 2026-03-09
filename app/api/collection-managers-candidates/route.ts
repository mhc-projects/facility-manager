import { NextRequest, NextResponse } from 'next/server';
import { query as pgQuery } from '@/lib/supabase-direct';
import { verifyTokenString } from '@/utils/auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/collection-managers-candidates
 * 수금 담당자로 지정 가능한 직원 목록 조회
 * - is_active = true, is_deleted = false, permission_level >= 1
 */
export async function GET(request: NextRequest) {
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

    const result = await pgQuery(
      `SELECT id, name, department, permission_level
       FROM employees
       WHERE is_deleted = false
         AND is_active = true
         AND permission_level >= 1
       ORDER BY permission_level DESC, name ASC`,
      []
    );

    return NextResponse.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('[collection-managers-candidates] GET error:', error);
    return NextResponse.json(
      { success: false, error: '직원 목록 조회 실패' },
      { status: 500 }
    );
  }
}
