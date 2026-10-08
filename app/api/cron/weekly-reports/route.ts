// app/api/cron/weekly-reports/route.ts - 주간 리포트 자동 생성 Cron Job
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

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

// 통계 계산 함수
function calculateWeeklyStats(tasks: any[], weekStart: string, weekEnd: string) {
  const totalTasks = tasks.length;

  // 완료된 업무 (해당 주간 내에 completed_at이 있는 것)
  const completedTasks = tasks.filter(t =>
    ['document_complete', 'subsidy_payment', 'final_document_submit'].includes(t.status) &&
    t.completed_at &&
    new Date(t.completed_at) >= new Date(weekStart) &&
    new Date(t.completed_at) <= new Date(weekEnd)
  );

  // 진행중 업무
  const inProgressTasks = tasks.filter(t =>
    ['site_survey', 'document_preparation', 'subsidy_application'].includes(t.status)
  );

  // 대기 업무
  const pendingTasks = tasks.filter(t =>
    ['customer_contact', 'consultation_scheduled'].includes(t.status)
  );

  const completionRate = totalTasks > 0 ? Math.round((completedTasks.length / totalTasks) * 100) : 0;

  // 업무 타입별
  const selfTasks = tasks.filter(t => t.task_type === 'self').length;
  const subsidyTasks = tasks.filter(t => t.task_type === 'subsidy').length;

  // 우선순위별 완료
  const highPriorityCompleted = completedTasks.filter(t => t.priority === 'high').length;
  const mediumPriorityCompleted = completedTasks.filter(t => t.priority === 'medium').length;
  const lowPriorityCompleted = completedTasks.filter(t => t.priority === 'low').length;

  // 완료 업무 상세
  const completedTaskDetails = completedTasks.map(task => ({
    id: task.id,
    title: task.title,
    business_name: task.business_name,
    task_type: task.task_type,
    status: task.status,
    completed_at: task.completed_at,
    priority: task.priority
  }));

  // 미완료 업무 상세 (연체 계산)
  const pendingTaskDetails = [...inProgressTasks, ...pendingTasks].map(task => {
    const daysOverdue = task.due_date
      ? Math.max(0, Math.ceil((new Date().getTime() - new Date(task.due_date).getTime()) / (1000 * 60 * 60 * 24)))
      : undefined;

    return {
      id: task.id,
      title: task.title,
      business_name: task.business_name,
      task_type: task.task_type,
      status: task.status,
      due_date: task.due_date,
      priority: task.priority,
      days_overdue: daysOverdue
    };
  });

  // 평균 완료 시간
  const completedWithDuration = completedTasks.filter(t => t.created_at && t.completed_at);
  const averageCompletionTime = completedWithDuration.length > 0
    ? completedWithDuration.reduce((acc, task) => {
        const created = new Date(task.created_at);
        const completed = new Date(task.completed_at);
        const days = (completed.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
        return acc + days;
      }, 0) / completedWithDuration.length
    : 0;

  // 연체 업무 수
  const overdueTasks = pendingTaskDetails.filter(t => t.days_overdue && t.days_overdue > 0).length;

  return {
    total_tasks: totalTasks,
    completed_tasks: completedTasks.length,
    in_progress_tasks: inProgressTasks.length,
    pending_tasks: pendingTasks.length,
    completion_rate: completionRate,
    self_tasks: selfTasks,
    subsidy_tasks: subsidyTasks,
    high_priority_completed: highPriorityCompleted,
    medium_priority_completed: mediumPriorityCompleted,
    low_priority_completed: lowPriorityCompleted,
    completed_task_details: JSON.stringify(completedTaskDetails),
    pending_task_details: JSON.stringify(pendingTaskDetails),
    average_completion_time_days: Math.round(averageCompletionTime * 10) / 10,
    overdue_tasks: overdueTasks
  };
}

// 리포트 생성 및 저장
async function generateAndSaveReport(
  userId: string,
  userName: string,
  weekStart: string,
  weekEnd: string
) {
  // 해당 주간의 업무 조회
  const { data: tasks, error: tasksError } = await supabaseAdmin
    .from('facility_tasks')
    .select(`
      id,
      title,
      business_name,
      task_type,
      status,
      priority,
      assignee,
      due_date,
      completed_at,
      created_at,
      updated_at
    `)
    .eq('assignee', userName)
    .eq('is_active', true)
    .eq('is_deleted', false)
    .or(`created_at.gte.${weekStart},updated_at.gte.${weekStart},completed_at.gte.${weekStart}`)
    .lte('created_at', weekEnd);

  if (tasksError) {
    console.error(`❌ [CRON] ${userName} 업무 조회 실패:`, tasksError);
    throw tasksError;
  }

  // 통계 계산
  const stats = calculateWeeklyStats(tasks || [], weekStart, weekEnd);

  // 기존 리포트 확인 (중복 방지)
  const { data: existingReport } = await supabaseAdmin
    .from('weekly_reports')
    .select('id')
    .eq('user_id', userId)
    .eq('week_start', weekStart)
    .single();

  if (existingReport) {
    // 이미 존재하면 업데이트
    const { error: updateError } = await supabaseAdmin
      .from('weekly_reports')
      .update({
        ...stats,
        generated_at: new Date().toISOString(),
        is_auto_generated: true,
        updated_at: new Date().toISOString()
      })
      .eq('id', existingReport.id);

    if (updateError) throw updateError;
    return { action: 'updated', reportId: existingReport.id };
  } else {
    // 새로 생성
    const { data: newReport, error: insertError } = await supabaseAdmin
      .from('weekly_reports')
      .insert({
        user_id: userId,
        user_name: userName,
        week_start: weekStart,
        week_end: weekEnd,
        ...stats,
        is_auto_generated: true,
        generated_at: new Date().toISOString()
      })
      .select('id')
      .single();

    if (insertError) throw insertError;
    return { action: 'created', reportId: newReport?.id };
  }
}

// Cron Job 엔드포인트
export async function GET(request: NextRequest) {
  try {
    // Vercel Cron 인증 확인
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      console.warn('⚠️ [CRON] 인증 실패: 잘못된 CRON_SECRET');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('🕐 [CRON] 주간 리포트 자동 생성 시작:', new Date().toISOString());

    // 모든 활성 사용자 조회
    const { data: users, error: usersError } = await supabaseAdmin
      .from('employees')
      .select('id, name, email')
      .eq('is_active', true);

    if (usersError) {
      console.error('❌ [CRON] 사용자 조회 실패:', usersError);
      throw usersError;
    }

    console.log(`👥 [CRON] 활성 사용자 ${users?.length || 0}명 발견`);

    // 현재 주간 계산
    const { start, end } = getWeekRange();
    console.log(`📅 [CRON] 주간 범위: ${start.split('T')[0]} ~ ${end.split('T')[0]}`);

    const results = {
      total: users?.length || 0,
      success: 0,
      updated: 0,
      failed: 0,
      errors: [] as any[]
    };

    // 각 사용자별 리포트 생성
    for (const user of users || []) {
      try {
        const result = await generateAndSaveReport(user.id, user.name, start, end);
        results.success++;
        if (result.action === 'updated') results.updated++;
        console.log(`✅ [CRON] ${user.name} 리포트 ${result.action === 'created' ? '생성' : '업데이트'} 완료`);
      } catch (error: any) {
        results.failed++;
        results.errors.push({
          userId: user.id,
          name: user.name,
          error: error.message
        });
        console.error(`❌ [CRON] ${user.name} 리포트 생성 실패:`, error.message);
      }
    }

    console.log('✅ [CRON] 주간 리포트 생성 완료:', {
      total: results.total,
      success: results.success,
      updated: results.updated,
      failed: results.failed
    });

    return NextResponse.json({
      success: true,
      message: 'Weekly reports generated successfully',
      results,
      week_period: `${start.split('T')[0]} ~ ${end.split('T')[0]}`
    });

  } catch (error: any) {
    console.error('❌ [CRON] 리포트 생성 오류:', error);
    return NextResponse.json({
      success: false,
      error: error.message || '리포트 생성 중 오류가 발생했습니다'
    }, { status: 500 });
  }
}
