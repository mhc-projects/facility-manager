// app/api/weekly-reports/realtime/route.ts - 실시간 주간 리포트 자동 집계 API
import { NextRequest } from 'next/server';
import { withApiHandler, createSuccessResponse, createErrorResponse } from '@/lib/api-utils';
import { queryAll } from '@/lib/supabase-direct';
import { verifyToken } from '@/lib/secure-jwt';
import { getStepInfo, type TaskType, type TaskStatus } from '@/app/admin/tasks/types';
import { allSteps } from '@/lib/task-steps';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// 주간 날짜 계산 함수 (일요일 시작)
function getWeekRange(dateStr?: string) {
  const date = dateStr ? new Date(dateStr) : new Date();
  const day = date.getDay();
  const diff = date.getDate() - day;

  const weekStart = new Date(date.setDate(diff));
  weekStart.setHours(0, 0, 0, 0);

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  return {
    start: weekStart.toISOString(),
    end: weekEnd.toISOString(),
    display: `${weekStart.toISOString().split('T')[0]} ~ ${weekEnd.toISOString().split('T')[0]}`
  };
}

// 담당자 정보 추출 함수
function extractAssigneeInfo(task: any): { userId: string; userName: string } | null {
  // assignees 배열에서 primary 담당자 찾기
  if (task.assignees && Array.isArray(task.assignees)) {
    const primaryAssignee = task.assignees.find((a: any) => a.isPrimary);
    if (primaryAssignee) {
      return {
        userId: primaryAssignee.id,
        userName: primaryAssignee.name
      };
    }
    // primary가 없으면 첫 번째 담당자
    if (task.assignees.length > 0) {
      return {
        userId: task.assignees[0].id,
        userName: task.assignees[0].name
      };
    }
  }

  // 기존 assignee 필드 (문자열)
  if (task.assignee) {
    // assignee가 사용자 이름인 경우 (기존 방식)
    return {
      userId: task.assignee, // 임시로 이름을 ID로 사용
      userName: task.assignee
    };
  }

  return null;
}

// 업무 완료 여부 확인
function isTaskCompleted(task: any): boolean {
  const completedStatuses = [
    'document_complete', // 자비 완료
    'subsidy_payment', // 보조금 완료
    'as_completed' // AS 완료
  ];
  return completedStatuses.includes(task.status);
}

// 업무 진행중 여부 확인
function isTaskInProgress(task: any): boolean {
  return !isTaskCompleted(task) && task.status !== 'pending';
}

// 지연 여부 확인
function isTaskOverdue(task: any): boolean {
  if (!task.due_date) return false;
  const today = new Date();
  const dueDate = new Date(task.due_date);
  return today > dueDate && !isTaskCompleted(task);
}

// 단계 한글 라벨 조회 (types + allSteps 모두 검색)
function resolveStepInfo(taskType: string, status: string) {
  return getStepInfo(taskType as TaskType, status as TaskStatus)
    || allSteps.find(s => s.status === status)
    || { label: status, color: 'gray' };
}

// GET: 실시간 주간 리포트 집계 (권한별 필터링)
export const GET = withApiHandler(async (request: NextRequest) => {
  try {
    // JWT 토큰 검증
    const authHeader = request.headers.get('authorization');
    let token = authHeader?.replace('Bearer ', '');

    if (!token) {
      const cookieToken = request.cookies.get('auth_token')?.value;
      if (cookieToken) token = cookieToken;
    }

    if (!token) {
      console.log('❌ [REALTIME-REPORTS] 토큰 없음');
      return createErrorResponse('인증이 필요합니다', 401);
    }

    const decoded = verifyToken(token);
    if (!decoded) {
      console.log('❌ [REALTIME-REPORTS] 토큰 검증 실패');
      return createErrorResponse('유효하지 않은 토큰입니다', 401);
    }

    const userId = decoded.userId || decoded.id;
    const permissionLevel = decoded.permissionLevel || decoded.permission_level;
    const userName = decoded.name || decoded.userName || '알 수 없음';

    console.log('✅ [REALTIME-REPORTS] 사용자 인증:', { userId, permissionLevel, userName });

    const { searchParams } = new URL(request.url);
    const weekDate = searchParams.get('weekDate');
    const searchQuery = searchParams.get('search') || '';
    const assigneeFilter = searchParams.get('assignee') || '';

    // 주간 범위 계산
    const { start, end, display } = getWeekRange(weekDate || undefined);

    console.log('📅 [REALTIME-REPORTS] 주간 범위:', {
      weekDate,
      start: start.split('T')[0],
      end: end.split('T')[0]
    });

    // facility_tasks + 주간 내 단계 이력을 한 번에 조회
    let tasks: any[] = [];
    let statusHistories: any[] = [];

    try {
      const searchCondition = searchQuery
        ? `AND (title ILIKE $3 OR business_name ILIKE $3 OR description ILIKE $3)`
        : '';
      const taskParams = searchQuery
        ? [start, end, `%${searchQuery}%`]
        : [start, end];

      // 이번 주 생성된 업무 조회
      tasks = await queryAll(
        `SELECT * FROM facility_tasks
         WHERE is_deleted = false
         AND created_at >= $1
         AND created_at <= $2
         ${searchCondition}`,
        taskParams
      );

      // 이번 주에 단계가 변경된 이력 조회 (task_status_history)
      // 이번 주 생성된 업무 외에, 이전에 생성되었지만 이번 주에 단계가 변경된 업무도 포함
      statusHistories = await queryAll(
        `SELECT tsh.*, ft.task_type, ft.business_name as ft_business_name,
                ft.assignee, ft.assignees, ft.priority, ft.due_date,
                ft.completed_at, ft.is_deleted, ft.title as ft_title
         FROM task_status_history tsh
         JOIN facility_tasks ft ON ft.id = tsh.task_id
         WHERE ft.is_deleted = false
         AND tsh.started_at >= $1
         AND tsh.started_at <= $2
         ORDER BY tsh.started_at ASC`,
        [start, end]
      );
    } catch (error: any) {
      console.error('❌ [REALTIME-REPORTS] 업무 조회 오류:', error);
      // task_status_history 테이블이 없을 경우 graceful fallback
      statusHistories = [];
    }

    console.log('📊 [REALTIME-REPORTS] 업무 조회 성공:', tasks?.length || 0, '건, 이력:', statusHistories?.length || 0, '건');

    // task_id별 주간 이력 그룹화 (이력이 있는 업무)
    const historyByTaskId = new Map<string, any[]>();
    statusHistories?.forEach(h => {
      if (!historyByTaskId.has(h.task_id)) historyByTaskId.set(h.task_id, []);
      historyByTaskId.get(h.task_id)!.push(h);
    });

    // 이력에 있는 업무 중 tasks에 없는 것 추가 (이전 주에 생성, 이번 주에 단계 변경)
    const taskIds = new Set(tasks.map((t: any) => t.id));
    statusHistories?.forEach(h => {
      if (!taskIds.has(h.task_id) && !h.is_deleted) {
        taskIds.add(h.task_id);
        tasks.push({
          id: h.task_id,
          title: h.ft_title,
          business_name: h.ft_business_name,
          task_type: h.task_type,
          status: h.status, // 이력의 마지막 status
          assignee: h.assignee,
          assignees: h.assignees,
          priority: h.priority,
          due_date: h.due_date,
          completed_at: h.completed_at,
          created_at: h.started_at,
          is_deleted: false
        });
      }
    });

    // 담당자별로 업무 그룹화
    const userTasksMap = new Map<string, any[]>();

    tasks?.forEach(task => {
      const assigneeInfo = extractAssigneeInfo(task);
      if (!assigneeInfo) return;

      const { userId: taskUserId, userName: taskUserName } = assigneeInfo;

      if (!userTasksMap.has(taskUserId)) {
        userTasksMap.set(taskUserId, []);
      }
      userTasksMap.get(taskUserId)!.push({
        ...task,
        _userName: taskUserName
      });
    });

    // 담당자 필터 적용
    let filteredUserIds = Array.from(userTasksMap.keys());
    if (assigneeFilter) {
      filteredUserIds = filteredUserIds.filter(uid => {
        const userTasks = userTasksMap.get(uid) || [];
        const taskUserName = userTasks[0]?._userName || '';
        return taskUserName.includes(assigneeFilter);
      });
    }

    // 각 사용자별 리포트 생성
    const reports = filteredUserIds.map(taskUserId => {
      const userTasks = userTasksMap.get(taskUserId) || [];
      const taskUserName = userTasks[0]?._userName || '알 수 없음';

      const totalTasks = userTasks.length;
      const completedTasks = userTasks.filter(isTaskCompleted).length;
      const inProgressTasks = userTasks.filter(isTaskInProgress).length;
      const pendingTasks = userTasks.filter(t => t.status === 'pending').length;
      const overdueTasks = userTasks.filter(isTaskOverdue).length;

      const completionRate = totalTasks > 0
        ? Math.round((completedTasks / totalTasks) * 100)
        : 0;

      // 업무 상세 정보 (단계 이동 이력 포함)
      const taskDetails = userTasks.map(task => {
        const stepInfo = resolveStepInfo(task.task_type, task.status);

        // 이번 주 단계 이동 이력
        const weekHistory = historyByTaskId.get(task.id) || [];
        const statusTransitions = weekHistory.map(h => {
          const hStepInfo = resolveStepInfo(task.task_type, h.status);
          return {
            status: h.status,
            label: hStepInfo.label,
            color: hStepInfo.color,
            started_at: h.started_at,
            completed_at: h.completed_at,
            is_completed: !!h.completed_at
          };
        });

        return {
          id: task.id,
          title: task.title,
          business_name: task.business_name,
          task_type: task.task_type,
          status: task.status,
          status_label: stepInfo?.label || task.status,
          status_color: stepInfo?.color || 'gray',
          priority: task.priority,
          due_date: task.due_date,
          completed_at: task.completed_at,
          created_at: task.created_at,
          is_completed: isTaskCompleted(task),
          is_overdue: isTaskOverdue(task),
          // 이번 주 단계 이동 이력 (없으면 빈 배열)
          status_transitions: statusTransitions
        };
      });

      const completedTaskDetails = taskDetails.filter(t => t.is_completed);
      const inProgressTaskDetails = taskDetails.filter(t => !t.is_completed && t.status !== 'pending');
      const pendingTaskDetails = taskDetails.filter(t => t.status === 'pending');

      // 자비/보조금 업무 분류
      const selfTasks = userTasks.filter(t => t.task_type === 'self').length;
      const subsidyTasks = userTasks.filter(t => t.task_type === 'subsidy').length;

      // 평균 완료 시간 계산
      const completedWithTime = userTasks.filter(t => t.completed_at && t.created_at);
      const avgCompletionTime = completedWithTime.length > 0
        ? Math.round(
            completedWithTime.reduce((sum, t) => {
              const days = Math.ceil(
                (new Date(t.completed_at).getTime() - new Date(t.created_at).getTime()) / (1000 * 60 * 60 * 24)
              );
              return sum + days;
            }, 0) / completedWithTime.length
          )
        : 0;

      return {
        id: `realtime-${taskUserId}-${start}`,
        user_id: taskUserId,
        user_name: taskUserName,
        week_start: start,
        week_end: end,
        total_tasks: totalTasks,
        completed_tasks: completedTasks,
        in_progress_tasks: inProgressTasks,
        pending_tasks: pendingTasks,
        completion_rate: completionRate,
        self_tasks: selfTasks,
        subsidy_tasks: subsidyTasks,
        overdue_tasks: overdueTasks,
        average_completion_time_days: avgCompletionTime,
        generated_at: new Date().toISOString(),
        is_auto_generated: true,
        completed_task_details: completedTaskDetails,
        in_progress_task_details: inProgressTaskDetails,
        pending_task_details: pendingTaskDetails,
        all_task_details: taskDetails
      };
    });

    // 권한별 필터링
    const filteredReports = permissionLevel >= 3
      ? reports // 관리자는 전체 조회
      : reports.filter(r => r.user_id === userId); // 일반 사용자는 본인 것만

    // 전체 통계 계산
    const summary = {
      total_users: filteredReports.length,
      total_tasks: filteredReports.reduce((sum, r) => sum + r.total_tasks, 0),
      total_completed: filteredReports.reduce((sum, r) => sum + r.completed_tasks, 0),
      average_completion_rate: filteredReports.length > 0
        ? Math.round(filteredReports.reduce((sum, r) => sum + r.completion_rate, 0) / filteredReports.length)
        : 0,
      total_overdue: filteredReports.reduce((sum, r) => sum + r.overdue_tasks, 0),
      total_in_progress: filteredReports.reduce((sum, r) => sum + r.in_progress_tasks, 0),
      total_pending: filteredReports.reduce((sum, r) => sum + r.pending_tasks, 0)
    };

    console.log('✅ [REALTIME-REPORTS] 집계 완료:', {
      totalReports: filteredReports.length,
      summary
    });

    return createSuccessResponse({
      reports: filteredReports,
      summary,
      week_period: {
        start,
        end,
        display
      },
      filters: {
        search: searchQuery || null,
        assignee: assigneeFilter || null
      },
      metadata: {
        user_id: userId,
        permission_level: permissionLevel,
        is_realtime: true,
        query_time: new Date().toISOString()
      }
    });

  } catch (error: any) {
    console.error('❌ [REALTIME-REPORTS] 조회 오류:', error);
    return createErrorResponse(
      error.message || '리포트 집계 중 오류가 발생했습니다',
      500
    );
  }
}, { logLevel: 'debug' });
