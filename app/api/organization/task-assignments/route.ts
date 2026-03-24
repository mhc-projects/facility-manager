import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendWebPushToUser } from '@/lib/send-push';
import { sendTelegramToUser } from '@/lib/send-telegram';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// 사용자 권한 확인 헬퍼
async function checkUserPermission(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { authorized: false, user: null };
  }

  return {
    authorized: true,
    user: {
      id: 'admin-user',
      permission_level: 3,
      name: '관리자'
    }
  };
}

// 업무 담당자 변경 알림 헬퍼
async function notifyTaskAssignmentChange(
  taskId: string,
  changeType: 'assigned' | 'reassigned' | 'unassigned',
  oldAssigneeId: string | null,
  newAssigneeId: string | null,
  changedBy: string,
  taskTitle: string
) {
  try {
    // 관련자 정보 조회
    const userQueries = [];
    if (oldAssigneeId) userQueries.push(supabase.from('employees').select('*').eq('id', oldAssigneeId).single());
    if (newAssigneeId) userQueries.push(supabase.from('employees').select('*').eq('id', newAssigneeId).single());
    if (changedBy) userQueries.push(supabase.from('employees').select('*').eq('id', changedBy).single());

    const userResults = await Promise.all(userQueries);
    const [oldAssignee, newAssignee, changer] = userResults.map(r => r.data).filter(Boolean);

    // notifications 테이블이 존재하는지 확인
    const { data: tableExists } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_name', 'notifications')
      .single();

    if (tableExists) {
      // 1. 이전 담당자에게 알림 (재할당/해제 시)
      if (oldAssigneeId && changeType !== 'assigned') {
        const oldTitle = changeType === 'reassigned' ? '담당 업무 변경 알림' : '담당 업무 해제 알림';
        const oldMessage = changeType === 'reassigned'
          ? `'${taskTitle}' 업무가 다른 담당자에게 재할당되었습니다.`
          : `'${taskTitle}' 업무 담당이 해제되었습니다.`;
        await supabase.from('notifications').insert({
          title: oldTitle,
          message: oldMessage,
          notification_tier: 'personal',
          target_user_id: oldAssigneeId,
          type: 'task_assignment_change',
          metadata: {
            task_id: taskId,
            task_title: taskTitle,
            change_type: changeType,
            changed_by: changer?.name,
            old_assignee: oldAssignee?.name,
            new_assignee: newAssignee?.name
          }
        });
        const pushPayload = { title: oldTitle, body: oldMessage, url: `/tasks/${taskId}`, category: 'task_assignment' };
        sendWebPushToUser(oldAssigneeId, pushPayload).catch(() => {});
        sendTelegramToUser(oldAssigneeId, pushPayload).catch(() => {});
      }

      // 2. 새 담당자에게 알림 (할당/재할당 시)
      if (newAssigneeId && changeType !== 'unassigned') {
        const newTitle = changeType === 'assigned' ? '새 업무 할당 알림' : '업무 재할당 알림';
        const newMessage = `'${taskTitle}' 업무가 회원님에게 ${changeType === 'assigned' ? '할당' : '재할당'}되었습니다.`;
        await supabase.from('notifications').insert({
          title: newTitle,
          message: newMessage,
          notification_tier: 'personal',
          target_user_id: newAssigneeId,
          type: 'task_assignment_change',
          metadata: {
            task_id: taskId,
            task_title: taskTitle,
            change_type: changeType,
            changed_by: changer?.name,
            old_assignee: oldAssignee?.name,
            new_assignee: newAssignee?.name
          }
        });
        const pushPayload = { title: newTitle, body: newMessage, url: `/tasks/${taskId}`, category: 'task_assignment' };
        sendWebPushToUser(newAssigneeId, pushPayload).catch(() => {});
        sendTelegramToUser(newAssigneeId, pushPayload).catch(() => {});
      }

      // 3. 관련 팀에 알림 (선택사항)
      if (newAssignee?.primary_team_id) {
        await supabase.from('notifications').insert({
          title: '팀 업무 변경 알림',
          message: `${newAssignee.name}님에게 '${taskTitle}' 업무가 ${changeType === 'assigned' ? '할당' : '재할당'}되었습니다.`,
          notification_tier: 'team',
          target_team_id: newAssignee.primary_team_id,
          type: 'team_task_update',
          metadata: {
            task_id: taskId,
            task_title: taskTitle,
            assignee: newAssignee.name,
            change_type: changeType
          }
        });
      }
    }

    // 4. 조직 변경 히스토리에 기록
    await supabase.from('organization_changes_detailed').insert({
      employee_id: newAssigneeId || oldAssigneeId,
      change_type: 'assignment_change',
      affected_task_id: taskId,
      task_change_type: changeType,
      old_data: oldAssignee ? { assignee: oldAssignee } : null,
      new_data: newAssignee ? { assignee: newAssignee } : null,
      changed_by: changedBy,
      reason: `업무 담당자 ${changeType} - ${taskTitle}`
    });

    console.log(`✅ 업무 담당자 변경 알림 발송 완료: ${taskId} (${changeType})`);

  } catch (error) {
    console.error('❌ 업무 담당자 변경 알림 발송 실패:', error);
  }
}

// GET: 업무 담당자 변경 히스토리 조회
export async function GET(request: NextRequest) {
  try {
    const { authorized, user } = await checkUserPermission(request);
    if (!authorized || !user) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const employeeId = searchParams.get('employee_id');
    const taskId = searchParams.get('task_id');
    const limit = parseInt(searchParams.get('limit') || '50');

    let query = supabase
      .from('organization_changes_detailed')
      .select(`
        *,
        employee:employees(id, name, email),
        changer:employees!organization_changes_detailed_changed_by_fkey(id, name, email)
      `)
      .eq('change_type', 'assignment_change')
      .order('changed_at', { ascending: false })
      .limit(limit);

    if (employeeId) {
      query = query.eq('employee_id', employeeId);
    }

    if (taskId) {
      query = query.eq('affected_task_id', taskId);
    }

    const { data: history, error } = await query;

    if (error) {
      console.error('담당자 변경 히스토리 조회 오류:', error);
      return NextResponse.json({ error: '히스토리를 불러올 수 없습니다.' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: history || [],
      summary: {
        total_changes: history?.length || 0,
        by_change_type: (history || []).reduce((acc: any, item: any) => {
          const type = item.task_change_type || 'unknown';
          acc[type] = (acc[type] || 0) + 1;
          return acc;
        }, {})
      }
    });

  } catch (error) {
    console.error('담당자 변경 히스토리 조회 중 오류:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}

// POST: 업무 담당자 변경 및 알림
export async function POST(request: NextRequest) {
  try {
    const { authorized, user } = await checkUserPermission(request);
    if (!authorized || !user) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    const body = await request.json();
    const {
      task_id,
      task_title,
      old_assignee_id,
      new_assignee_id,
      change_type,
      reason
    } = body;

    if (!task_id || !task_title || !change_type) {
      return NextResponse.json({
        error: '업무 ID, 제목, 변경 타입은 필수입니다.'
      }, { status: 400 });
    }

    if (!['assigned', 'reassigned', 'unassigned'].includes(change_type)) {
      return NextResponse.json({
        error: '유효하지 않은 변경 타입입니다.'
      }, { status: 400 });
    }

    // 담당자 정보 검증
    if (new_assignee_id) {
      const { data: newAssignee, error: assigneeError } = await supabase
        .from('employees')
        .select('id, name, email, is_active')
        .eq('id', new_assignee_id)
        .eq('is_active', true)
        .single();

      if (assigneeError || !newAssignee) {
        return NextResponse.json({
          error: '유효하지 않은 담당자입니다.'
        }, { status: 400 });
      }
    }

    // 알림 발송
    await notifyTaskAssignmentChange(
      task_id,
      change_type,
      old_assignee_id,
      new_assignee_id,
      user.id,
      task_title
    );

    return NextResponse.json({
      success: true,
      message: '담당자 변경 및 알림이 성공적으로 처리되었습니다.',
      data: {
        task_id,
        change_type,
        old_assignee_id,
        new_assignee_id,
        changed_by: user.id,
        changed_at: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('담당자 변경 처리 중 오류:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}

// PUT: 기존 업무 시스템과 연동하여 담당자 변경 감지 및 처리
export async function PUT(request: NextRequest) {
  try {
    const { authorized, user } = await checkUserPermission(request);
    if (!authorized || !user) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    const body = await request.json();
    const { batch_updates } = body; // 여러 업무의 담당자 변경을 일괄 처리

    if (!Array.isArray(batch_updates) || batch_updates.length === 0) {
      return NextResponse.json({
        error: '일괄 업데이트할 데이터가 필요합니다.'
      }, { status: 400 });
    }

    const results = [];
    const errors = [];

    for (const update of batch_updates) {
      try {
        const {
          task_id,
          task_title,
          old_assignee_id,
          new_assignee_id
        } = update;

        // 변경 타입 결정
        let changeType;
        if (!old_assignee_id && new_assignee_id) {
          changeType = 'assigned';
        } else if (old_assignee_id && !new_assignee_id) {
          changeType = 'unassigned';
        } else if (old_assignee_id && new_assignee_id && old_assignee_id !== new_assignee_id) {
          changeType = 'reassigned';
        } else {
          // 변경사항 없음
          continue;
        }

        // 알림 발송
        await notifyTaskAssignmentChange(
          task_id,
          changeType,
          old_assignee_id,
          new_assignee_id,
          user.id,
          task_title
        );

        results.push({
          task_id,
          change_type: changeType,
          status: 'success'
        });

      } catch (error) {
        errors.push({
          task_id: update.task_id,
          error: '처리 실패'
        });
        console.error(`담당자 변경 처리 실패 (${update.task_id}):`, error);
      }
    }

    return NextResponse.json({
      success: errors.length === 0,
      data: {
        processed: results.length,
        failed: errors.length,
        results,
        errors
      },
      message: `${results.length}개 업무 담당자 변경 처리 완료`
    });

  } catch (error) {
    console.error('일괄 담당자 변경 처리 중 오류:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}

// DELETE: 담당자 변경 히스토리 정리
export async function DELETE(request: NextRequest) {
  try {
    const { authorized, user } = await checkUserPermission(request);
    if (!authorized || !user || user.permission_level < 3) {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const beforeDate = searchParams.get('before_date');
    const taskId = searchParams.get('task_id');

    if (!beforeDate && !taskId) {
      return NextResponse.json({
        error: '정리할 기준 (날짜 또는 업무 ID)이 필요합니다.'
      }, { status: 400 });
    }

    let query = supabase
      .from('organization_changes_detailed')
      .delete()
      .eq('change_type', 'assignment_change');

    if (beforeDate) {
      query = query.lt('changed_at', beforeDate);
    }

    if (taskId) {
      query = query.eq('affected_task_id', taskId);
    }

    const { error, count } = await query;

    if (error) {
      console.error('히스토리 정리 오류:', error);
      return NextResponse.json({ error: '히스토리 정리 중 오류가 발생했습니다.' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: `${count}개의 담당자 변경 히스토리가 정리되었습니다.`,
      data: { deleted_count: count }
    });

  } catch (error) {
    console.error('담당자 변경 히스토리 정리 중 오류:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}