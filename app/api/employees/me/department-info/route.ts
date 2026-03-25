import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/supabase-direct';
import { verifyTokenString } from '@/utils/auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/employees/me/department-info
 * 현재 사용자의 부서 정보 및 경영지원부 여부 반환
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

    const userId = decoded.userId || decoded.id;

    const result = await queryOne(
      `SELECT
        e.department_id,
        d.name AS department_name,
        d.is_management_support
       FROM employees e
       LEFT JOIN departments d ON d.id = e.department_id::uuid
       WHERE e.id = $1 AND e.is_deleted = FALSE`,
      [userId]
    );

    return NextResponse.json({
      success: true,
      data: {
        department_id: result?.department_id || null,
        department_name: result?.department_name || null,
        is_management_support: result?.is_management_support === true,
      }
    });
  } catch (error: any) {
    console.error('[API] GET /employees/me/department-info error:', error);
    return NextResponse.json({ success: false, error: error.message || '서버 오류' }, { status: 500 });
  }
}
