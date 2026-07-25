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
    const userId = decoded.userId || decoded.id;

    // 본인은 후보에서 제외 (본인 결재라인에 본인을 상위 결재자로 선택하는 것을 방지)
    // 단, 대표이사(ceo)는 조직 최상위라 위임할 상위 결재자가 없으므로 본인 제외 규칙에서 예외로 둔다
    // (그렇지 않으면 대표이사 본인이 작성하는 문서는 대표이사 결재선을 아예 구성할 수 없게 된다).
    const rows = await queryAll(
      `SELECT id, name, department, position, role
       FROM employees
       WHERE is_active = TRUE AND is_deleted = FALSE
         AND role IN ('team_leader', 'executive', 'vice_president', 'ceo')
         AND (role = 'ceo' OR id != $1)
       ORDER BY
         CASE role WHEN 'team_leader' THEN 1 WHEN 'executive' THEN 2 WHEN 'vice_president' THEN 3 WHEN 'ceo' THEN 4 END,
         name ASC`,
      [userId]
    );

    const teamLeaders        = rows.filter((r: any) => r.role === 'team_leader');
    const executives         = rows.filter((r: any) => r.role === 'executive');
    const vicePresidentList  = rows.filter((r: any) => r.role === 'vice_president');
    const ceoList            = rows.filter((r: any) => r.role === 'ceo');

    return NextResponse.json({
      success: true,
      data: { teamLeaders, executives, vicePresidentList, ceoList }
    });
  } catch (error: any) {
    console.error('[API] /approvals/approvers error:', error);
    return NextResponse.json({ success: false, error: error.message || '서버 오류' }, { status: 500 });
  }
}
