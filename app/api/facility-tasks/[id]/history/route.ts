// 업무 단계 이력 조회 API
import { NextRequest, NextResponse } from 'next/server';
import { getTaskStatusHistory, getTaskTimeline } from '@/lib/task-status-history';
import { requireAuth } from '@/lib/auth/require-auth';

// Force dynamic rendering
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface RouteParams {
  params: {
    id: string;
  };
}

/**
 * GET /api/facility-tasks/[id]/history
 * 특정 업무의 단계 이력 조회
 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const auth = await requireAuth(request, 1);
    if (!auth.ok) return auth.response;

    const taskId = params.id;
    const { searchParams } = new URL(request.url);
    const includeTimeline = searchParams.get('timeline') === 'true';

    if (!taskId) {
      return NextResponse.json({
        success: false,
        error: '업무 ID가 필요합니다'
      }, { status: 400 });
    }

    // 타임라인 포함 여부에 따라 다른 데이터 조회
    if (includeTimeline) {
      const timeline = await getTaskTimeline(taskId);
      return NextResponse.json({
        success: true,
        data: timeline
      });
    } else {
      const history = await getTaskStatusHistory(taskId);
      return NextResponse.json({
        success: true,
        data: history
      });
    }

  } catch (error) {
    console.error('❌ [TASK-HISTORY] 이력 조회 실패:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '이력 조회 중 오류가 발생했습니다'
    }, { status: 500 });
  }
}
