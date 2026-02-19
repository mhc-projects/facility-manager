import { NextRequest, NextResponse } from 'next/server';
import { queryAll } from '@/lib/supabase-direct';
import { verifyTokenString } from '@/utils/auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/business-task-status
 * business_name별 진행 중인 업무 목록 반환
 * 미수금 위험도 컬럼의 업무단계 표시에 사용
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

    const tasks = await queryAll(
      `SELECT business_name, business_id, task_type, status
       FROM facility_tasks
       WHERE is_deleted = false
       ORDER BY business_name, updated_at DESC`,
      []
    );

    // business_name 기준으로 그룹핑
    const taskMap: Record<string, Array<{ task_type: string; status: string }>> = {};

    for (const task of tasks) {
      const name = task.business_name;
      if (!name) continue;
      if (!taskMap[name]) {
        taskMap[name] = [];
      }
      taskMap[name].push({
        task_type: task.task_type,
        status: task.status,
      });
    }

    return NextResponse.json(
      { success: true, data: taskMap },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch (error) {
    console.error('[business-task-status] GET error:', error);
    return NextResponse.json(
      { success: false, error: '업무 상태 조회 실패' },
      { status: 500 }
    );
  }
}
