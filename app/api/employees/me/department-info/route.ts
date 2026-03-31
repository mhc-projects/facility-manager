import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/supabase-direct';
import { verifyTokenString } from '@/utils/auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/employees/me/department-info
 * 현재 사용자의 부서/팀 정보 및 전자결재 관리 권한(총무팀) 여부 반환
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
      `SELECT e.department AS department_name, e.team AS team_name
       FROM employees e
       WHERE e.id = $1 AND e.is_deleted = FALSE`,
      [userId]
    );

    const deptName: string = (result as any)?.department_name || '';
    const teamName: string = (result as any)?.team_name || '';

    // 팀 기반 is_management_support 플래그 조회 (경영지원부 총무팀)
    let isManagementSupport = false;
    if (deptName && teamName) {
      const teamRow = await queryOne(
        `SELECT t.is_management_support
         FROM teams t
         JOIN departments d ON d.id = t.department_id
         WHERE d.name = $1 AND t.name = $2
         LIMIT 1`,
        [deptName, teamName]
      );
      isManagementSupport = teamRow?.is_management_support === true;
    }

    return NextResponse.json({
      success: true,
      data: {
        department_name: deptName || null,
        team_name: teamName || null,
        is_management_support: isManagementSupport,
      }
    });
  } catch (error: any) {
    console.error('[API] GET /employees/me/department-info error:', error);
    return NextResponse.json({ success: false, error: error.message || '서버 오류' }, { status: 500 });
  }
}
