import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/supabase-direct';
import { verifyTokenString } from '@/utils/auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/approvals/pending-count
 * 로그인 사용자가 결재해야 할 대기 건수 반환
 * 플로팅 배너에서 폴링용
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

    // 내가 결재해야 할 pending 단계의 문서 수
    const result = await queryOne(
      `SELECT COUNT(*) AS count
       FROM approval_steps s
       JOIN approval_documents d ON d.id = s.document_id
       WHERE s.approver_id = $1
         AND s.status = 'pending'
         AND d.status = 'pending'
         AND d.is_deleted = FALSE
         AND (
           -- 팀장: current_step = 1
           (s.step_order = 2 AND d.current_step = 1)
           OR
           -- 중역: current_step = 2
           (s.step_order = 3 AND d.current_step = 2)
           OR
           -- 부사장: current_step = 3
           (s.step_order = 4 AND d.current_step = 3)
           OR
           -- 대표이사: current_step = 4
           (s.step_order = 5 AND d.current_step = 4)
         )`,
      [userId]
    );

    return NextResponse.json({
      success: true,
      count: parseInt(result?.count || '0', 10)
    });
  } catch (error: any) {
    console.error('[API] /approvals/pending-count error:', error);
    return NextResponse.json({ success: false, count: 0 }, { status: 200 });
  }
}
