// app/api/weekly-reports/admin/route.ts - 관리자용 전체 리포트 조회 API
import { NextRequest } from 'next/server';
import { withApiHandler, createSuccessResponse, createErrorResponse } from '@/lib/api-utils';
import { supabaseAdmin } from '@/lib/supabase';
import { verifyToken } from '@/lib/secure-jwt';

export const dynamic = 'force-dynamic';
// force-dynamic만으로는 GET 전용 라우트의 fetch 조회가 데이터 캐시에 영구 저장되므로 명시적으로 끈다
export const fetchCache = 'force-no-store';
export const runtime = 'nodejs';

// 주간 날짜 계산 함수
function getWeekRange(dateStr?: string) {
  const date = dateStr ? new Date(dateStr) : new Date();
  const day = date.getDay();
  const diff = date.getDate() - day; // 일요일을 주의 시작으로

  const weekStart = new Date(date.setDate(diff));
  weekStart.setHours(0, 0, 0, 0);

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  return {
    start: weekStart.toISOString(),
    end: weekEnd.toISOString()
  };
}

// GET: 전체 사용자 리포트 조회 (관리자 전용)
export const GET = withApiHandler(async (request: NextRequest) => {
  try {
    // JWT 토큰 검증 및 권한 확인
    const authHeader = request.headers.get('authorization');
    let token = authHeader?.replace('Bearer ', '');

    if (!token) {
      const cookieToken = request.cookies.get('auth_token')?.value;
      if (cookieToken) token = cookieToken;
    }

    if (!token) {
      console.log('❌ [ADMIN-REPORTS] 토큰 없음');
      return createErrorResponse('인증이 필요합니다', 401);
    }

    const decoded = verifyToken(token);
    if (!decoded) {
      console.log('❌ [ADMIN-REPORTS] 토큰 검증 실패');
      return createErrorResponse('유효하지 않은 토큰입니다', 401);
    }

    const userId = decoded.userId || decoded.id;
    const permissionLevel = decoded.permissionLevel || decoded.permission_level;

    // 권한 3 이상 확인
    if (permissionLevel < 3) {
      console.log('❌ [ADMIN-REPORTS] 권한 부족:', { userId, permissionLevel });
      return createErrorResponse('권한이 부족합니다 (권한 3 이상 필요)', 403);
    }

    console.log('✅ [ADMIN-REPORTS] 관리자 인증 성공:', { userId, permissionLevel });

    const { searchParams } = new URL(request.url);
    const weekDate = searchParams.get('weekDate');

    // 주간 범위 계산
    const { start, end } = getWeekRange(weekDate || undefined);

    console.log('📅 [ADMIN-REPORTS] 주간 범위:', {
      weekDate,
      start: start.split('T')[0],
      end: end.split('T')[0]
    });

    // 모든 사용자의 해당 주간 리포트 조회
    const { data: reports, error } = await supabaseAdmin
      .from('weekly_reports')
      .select('*')
      .gte('week_start', start)
      .lte('week_start', end) // week_start가 범위 내에 있는 것
      .order('completion_rate', { ascending: false });

    if (error) {
      console.error('❌ [ADMIN-REPORTS] 리포트 조회 오류:', error);
      throw error;
    }

    console.log('📊 [ADMIN-REPORTS] 리포트 조회 성공:', reports?.length || 0, '건');

    // 전체 통계 계산
    const totalStats = {
      total_users: reports?.length || 0,
      total_tasks: reports?.reduce((sum, r) => sum + r.total_tasks, 0) || 0,
      total_completed: reports?.reduce((sum, r) => sum + r.completed_tasks, 0) || 0,
      average_completion_rate: reports?.length
        ? Math.round(reports.reduce((sum, r) => sum + r.completion_rate, 0) / reports.length)
        : 0,
      total_overdue: reports?.reduce((sum, r) => sum + r.overdue_tasks, 0) || 0,
      total_in_progress: reports?.reduce((sum, r) => sum + r.in_progress_tasks, 0) || 0,
      total_pending: reports?.reduce((sum, r) => sum + r.pending_tasks, 0) || 0
    };

    // JSONB 필드 파싱 (completed_task_details, pending_task_details)
    const parsedReports = reports?.map(report => ({
      ...report,
      completed_task_details: typeof report.completed_task_details === 'string'
        ? JSON.parse(report.completed_task_details)
        : report.completed_task_details,
      pending_task_details: typeof report.pending_task_details === 'string'
        ? JSON.parse(report.pending_task_details)
        : report.pending_task_details
    }));

    return createSuccessResponse({
      reports: parsedReports || [],
      summary: totalStats,
      week_period: {
        start,
        end,
        display: `${start.split('T')[0]} ~ ${end.split('T')[0]}`
      },
      metadata: {
        admin_user_id: userId,
        report_count: reports?.length || 0,
        query_time: new Date().toISOString()
      }
    });

  } catch (error: any) {
    console.error('❌ [ADMIN-REPORTS] 조회 오류:', error);
    return createErrorResponse(
      error.message || '리포트 조회 중 오류가 발생했습니다',
      500
    );
  }
}, { logLevel: 'debug' });
