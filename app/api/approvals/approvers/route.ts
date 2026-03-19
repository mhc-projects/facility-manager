import { NextRequest, NextResponse } from 'next/server';
import { queryAll } from '@/lib/supabase-direct';
import { verifyTokenString } from '@/utils/auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/approvals/approvers
 * 결재자 목록 조회 (팀장, 중역, 대표이사)
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

    const rows = await queryAll(
      `SELECT id, name, department, position, role
       FROM employees
       WHERE is_active = TRUE AND is_deleted = FALSE
         AND role IN ('team_leader', 'executive', 'ceo')
       ORDER BY
         CASE role WHEN 'team_leader' THEN 1 WHEN 'executive' THEN 2 WHEN 'ceo' THEN 3 END,
         name ASC`,
      []
    );

    const teamLeaders = rows.filter((r: any) => r.role === 'team_leader');
    const executives  = rows.filter((r: any) => r.role === 'executive');
    const ceoList     = rows.filter((r: any) => r.role === 'ceo');

    return NextResponse.json({
      success: true,
      data: { teamLeaders, executives, ceoList }
    });
  } catch (error: any) {
    console.error('[API] /approvals/approvers error:', error);
    return NextResponse.json({ success: false, error: error.message || '서버 오류' }, { status: 500 });
  }
}
