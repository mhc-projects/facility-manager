// app/api/facility-tasks/route.ts - 시설 업무 관리 API
import { NextRequest } from 'next/server';
import { withApiHandler, createSuccessResponse, createErrorResponse } from '@/lib/api-utils';
import { queryOne, queryAll, query as pgQuery } from '@/lib/supabase-direct';
import { getTaskStatusKR, createStatusChangeMessage } from '@/lib/task-status-utils';
import { createTaskAssignmentNotifications, updateTaskAssignmentNotifications, type TaskAssignee } from '@/lib/task-notification-service';
import { verifyTokenHybrid } from '@/lib/secure-jwt';
import { logDebug, logError } from '@/lib/logger';
import { startNewStatus, completeCurrentStatus, getTaskStatusHistory } from '@/lib/task-status-history';

// Force dynamic rendering for API routes
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// 새로운 보안 JWT 시스템 사용 (verifyTokenHybrid는 secure-jwt.ts에서 import됨)

// 사용자 권한 확인 헬퍼 함수 (Authorization 헤더 + httpOnly 쿠키 지원)
async function checkUserPermission(request: NextRequest) {
  // Authorization 헤더에서 토큰 확인
  const authHeader = request.headers.get('authorization');
  let token: string | null = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.replace('Bearer ', '');
  } else {
    // httpOnly 쿠키에서 토큰 확인
    const cookieToken = request.cookies.get('auth_token')?.value;
    if (cookieToken) {
      token = cookieToken;
    }
  }

  if (!token) {
    logDebug('FACILITY-TASKS', '토큰 없음 (헤더/쿠키 모두 없음)');
    return { authorized: false, user: null };
  }

  try {
    const result = await verifyTokenHybrid(token);

    if (!result.user) {
      logDebug('FACILITY-TASKS', '사용자 정보 없음', result.error);
      return { authorized: false, user: null };
    }

    logDebug('FACILITY-TASKS', '사용자 인증 성공', {
      userId: result.user.id,
      permission: result.user.permission_level
    });

    return {
      authorized: true,
      user: result.user
    };
  } catch (error) {
    logError('FACILITY-TASKS', '권한 확인 오류', error);
    return { authorized: false, user: null };
  }
}


// 담당자 타입은 lib/task-notification-service.ts에서 import됨

// Facility Task 타입 정의 (다중 담당자 지원)
export interface FacilityTask {
  id: string;
  created_at: string;
  updated_at: string;
  title: string;
  description?: string;
  business_name: string;
  business_id?: string;
  task_type: 'self' | 'subsidy' | 'etc' | 'as' | 'dealer' | 'outsourcing';
  status: string;
  priority: 'low' | 'medium' | 'high';
  assignee?: string; // 기존 호환성 유지
  assignees: TaskAssignee[]; // 새로운 다중 담당자 필드
  primary_assignee_id?: string;
  assignee_updated_at?: string;
  due_date?: string;
  completed_at?: string;
  notes?: string;
  is_active: boolean;
  is_deleted: boolean;
}

// GET: 시설 업무 목록 조회 (권한별 필터링 적용)
export const GET = withApiHandler(async (request: NextRequest) => {
  try {
    const { searchParams } = new URL(request.url);
    const businessName = searchParams.get('businessName');
    const taskType = searchParams.get('type');
    const status = searchParams.get('status');
    const assignee = searchParams.get('assignee');

    // 사용자 인증 및 권한 확인 (보안 강화된 JWT 시스템)
    const { authorized, user } = await checkUserPermission(request);
    if (!authorized || !user) {
      logDebug('FACILITY-TASKS', 'GET 인증 실패');
      return createErrorResponse('인증이 필요합니다', 401);
    }

    logDebug('FACILITY-TASKS', '시설 업무 목록 조회', {
      user: user.name,
      permission: user.permission_level,
      filters: { businessName, taskType, status, assignee }
    });

    // Direct PostgreSQL 쿼리 빌드
    let whereClauses: string[] = ['ftb.is_active = true', 'ftb.is_deleted = false'];
    let params: any[] = [];
    let paramIndex = 1;

    if (businessName) {
      whereClauses.push(`ftb.business_name = $${paramIndex}`);
      params.push(businessName);
      paramIndex++;
    }
    if (taskType && taskType !== 'all') {
      whereClauses.push(`ftb.task_type = $${paramIndex}`);
      params.push(taskType);
      paramIndex++;
    }
    if (status) {
      whereClauses.push(`ftb.status = $${paramIndex}`);
      params.push(status);
      paramIndex++;
    }
    if (assignee) {
      console.log('🔍 [FACILITY-TASKS] assignee 필터 적용:', assignee);
      // 다중 담당자 지원: assignees JSON 배열에서 검색
      whereClauses.push(`(ftb.assignee = $${paramIndex} OR ftb.assignees::text LIKE $${paramIndex + 1})`);
      params.push(assignee);
      params.push(`%"name":"${assignee}"%`);
      paramIndex += 2;
    }

    const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const queryText = `
      SELECT
        ftb.id,
        ftb.created_at,
        ftb.updated_at,
        ftb.title,
        ftb.description,
        ftb.business_name,
        ftb.business_id,
        ftb.task_type,
        ftb.status,
        ftb.priority,
        ftb.assignee,
        ftb.assignees,
        ftb.primary_assignee_id,
        ftb.assignee_updated_at,
        ftb.start_date,
        ftb.due_date,
        ftb.completed_at,
        ftb.notes,
        ftb.created_by,
        ftb.created_by_name,
        ftb.last_modified_by,
        ftb.last_modified_by_name,
        ftb.is_active,
        ftb.is_deleted,
        ftb.address,
        ftb.manager_name,
        ftb.manager_contact,
        ftb.local_government,
        bi.construction_report_submitted_at as construction_report_date
      FROM facility_tasks_with_business ftb
      LEFT JOIN business_info bi ON ftb.business_name = bi.business_name
      ${whereClause}
      ORDER BY ftb.created_at DESC
    `;

    console.log('🗄️ [FACILITY-TASKS] Direct PostgreSQL 쿼리 실행 시작');
    let tasks;
    try {
      tasks = await queryAll(queryText, params);
      console.log('🗄️ [FACILITY-TASKS] Direct PostgreSQL 쿼리 완료:', {
        taskCount: tasks?.length || 0
      });
    } catch (queryError) {
      console.error('❌ [FACILITY-TASKS] Direct PostgreSQL 쿼리 예외:', queryError);
      throw queryError;
    }

    return createSuccessResponse({
      tasks: tasks || [],
      count: tasks?.length || 0,
      user: {
        id: user.id,
        name: user.name,
        permission_level: user.permission_level
      },
      metadata: {
        filters: { businessName, taskType, status, assignee },
        totalCount: tasks?.length || 0,
        userPermission: user.permission_level,
        isAdmin: user.permission_level >= 4,
        authStatus: 'authenticated'
      }
    });

  } catch (error: any) {
    console.error('❌ [FACILITY-TASKS] GET 예외 발생:', {
      name: error?.name,
      message: error?.message,
      stack: error?.stack?.substring(0, 500), // 스택 트레이스 일부만
      type: typeof error
    });

    // 구체적인 에러 메시지 제공
    let errorMessage = '시설 업무 목록 조회 중 오류가 발생했습니다';
    if (error?.message) {
      if (error.message.includes('JWT')) {
        errorMessage = 'JWT 토큰 인증 오류';
      } else if (error.message.includes('database') || error.message.includes('supabase')) {
        errorMessage = '데이터베이스 연결 오류';
      } else if (error.message.includes('network')) {
        errorMessage = '네트워크 연결 오류';
      }
    }

    return createErrorResponse(errorMessage, 500);
  }
}, { logLevel: 'debug' });

// POST: 새 시설 업무 생성 (생성자 정보 포함)
export const POST = withApiHandler(async (request: NextRequest) => {
  try {
    // 사용자 인증 및 권한 확인
    const { authorized, user } = await checkUserPermission(request);
    if (!authorized || !user) {
      return createErrorResponse('인증이 필요합니다', 401);
    }

    const body = await request.json();
    const {
      title,
      description,
      business_name,
      business_id, // 프론트엔드에서 전달받은 business_id
      task_type,
      status = 'customer_contact',
      priority = 'medium',
      assignee, // 기존 호환성용
      assignees, // 새로운 다중 담당자
      primary_assignee_id,
      start_date,
      due_date,
      notes
    } = body;

    console.log('📝 [FACILITY-TASKS] 새 시설 업무 생성:', {
      user: user.name,
      permission: user.permission_level,
      title,
      business_name,
      business_id,
      task_type,
      status
    });

    // 필수 필드 검증
    if (!title || !business_name || !task_type) {
      return createErrorResponse('제목, 사업장명, 업무 타입은 필수입니다', 400);
    }

    // business_id가 없으면 business_name으로 조회
    let resolvedBusinessId = business_id;
    if (!resolvedBusinessId && business_name) {
      try {
        const businessResult = await queryOne(
          'SELECT id FROM business_info WHERE business_name = $1 AND is_active = true AND is_deleted = false',
          [business_name]
        );

        if (businessResult) {
          resolvedBusinessId = businessResult.id;
          console.log('✅ [FACILITY-TASKS] business_name으로 business_id 조회 성공:', {
            business_name,
            business_id: resolvedBusinessId
          });
        } else {
          console.warn('⚠️ [FACILITY-TASKS] 사업장을 찾을 수 없음:', business_name);
        }
      } catch (lookupError: any) {
        console.error('🔴 [FACILITY-TASKS] business_id 조회 실패:', lookupError?.message);
      }
    }

    // 업무 타입 검증
    if (!['self', 'subsidy', 'as', 'dealer', 'outsourcing', 'etc'].includes(task_type)) {
      return createErrorResponse('유효하지 않은 업무 타입입니다', 400);
    }

    // 우선순위 검증
    if (priority && !['low', 'medium', 'high'].includes(priority)) {
      return createErrorResponse('유효하지 않은 우선순위입니다', 400);
    }

    // 중복 업무 체크: 같은 사업장에 같은 단계의 활성 업무가 있는지 확인 - Direct PostgreSQL
    let existingTasks;
    try {
      existingTasks = await queryAll(
        `SELECT id, title, business_name, status, created_at, task_type
         FROM facility_tasks
         WHERE business_name = $1 AND status = $2 AND task_type = $3
           AND is_active = true AND is_deleted = false`,
        [business_name, status, task_type]
      );
    } catch (checkError) {
      console.error('🔴 [FACILITY-TASKS] 중복 체크 오류:', checkError);
    }

    if (existingTasks && existingTasks.length > 0) {
      const existingTask = existingTasks[0];
      const statusLabel = getTaskStatusKR(status);

      console.warn('⚠️ [FACILITY-TASKS] 중복 업무 감지:', {
        businessName: business_name,
        status,
        statusLabel,
        existingTaskId: existingTask.id,
        existingTaskTitle: existingTask.title
      });

      return createErrorResponse(
        `이미 "${business_name}" 사업장에 "${statusLabel}" 단계의 업무가 등록되어 있습니다.\n\n` +
        `기존 업무: ${existingTask.title}\n` +
        `등록일: ${new Date(existingTask.created_at).toLocaleDateString('ko-KR')}\n\n` +
        `같은 단계의 중복 업무는 등록할 수 없습니다. 기존 업무를 수정하거나 완료 후 새 업무를 등록해주세요.`,
        409 // Conflict
      );
    }

    // 담당자 처리: assignees 우선, 없으면 assignee를 assignees로 변환
    let finalAssignees = assignees || [];
    if (!finalAssignees.length && assignee) {
      finalAssignees = [{
        id: '',
        name: assignee,
        position: '미정',
        email: ''
      }];
    }

    // 담당자 이름으로 ID 조회 및 매핑
    if (finalAssignees.length > 0) {
      for (let i = 0; i < finalAssignees.length; i++) {
        const assigneeItem = finalAssignees[i];
        if (assigneeItem.name && !assigneeItem.id) {
          // employees 테이블에서 이름으로 사용자 정보 조회 - Direct PostgreSQL
          try {
            const employee = await queryOne(
              'SELECT id, name, email, position FROM employees WHERE name = $1 AND is_active = true AND is_deleted = false',
              [assigneeItem.name]
            );

            if (employee) {
              finalAssignees[i] = {
                id: employee.id,
                name: employee.name,
                position: employee.position || '미정',
                email: employee.email || ''
              };
            } else {
              console.warn('⚠️ [FACILITY-TASKS] 담당자 ID 조회 실패:', assigneeItem.name, '- 직원 없음');
            }
          } catch (employeeError: any) {
            console.warn('⚠️ [FACILITY-TASKS] 담당자 ID 조회 실패:', assigneeItem.name, employeeError?.message);
          }
        }
      }
    }

    // 새 업무 생성 - Direct PostgreSQL
    const insertQuery = `
      INSERT INTO facility_tasks (
        title, description, business_name, business_id, task_type, status, priority,
        assignee, assignees, primary_assignee_id, start_date, due_date, notes,
        created_by, created_by_name, last_modified_by, last_modified_by_name
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING *
    `;

    const insertResult = await pgQuery(insertQuery, [
      title,
      description,
      business_name,
      resolvedBusinessId, // business_id 추가
      task_type,
      status,
      priority,
      finalAssignees.length > 0 ? finalAssignees[0].name : null, // 기존 호환성
      JSON.stringify(finalAssignees),
      primary_assignee_id,
      start_date,
      due_date,
      notes,
      user.id,
      user.name,
      user.id,
      user.name
    ]);

    if (!insertResult.rows || insertResult.rows.length === 0) {
      console.error('🔴 [FACILITY-TASKS] 생성 실패');
      throw new Error('업무 생성 실패');
    }

    const newTask = insertResult.rows[0];

    // 🆕 업무 메모 → 사업장 메모 동기화 (이력 누적)
    if (notes && notes.trim() !== '' && resolvedBusinessId) {
      try {
        const { addTaskMemoToBusinessHistory } = await import('@/lib/task-memo-sync');
        const syncResult = await addTaskMemoToBusinessHistory({
          taskId: newTask.id,
          businessId: resolvedBusinessId,
          businessName: business_name,
          notes: notes,
          status: status,
          taskType: task_type,
          userId: user.id,
          userName: user.name
        });

        if (syncResult.success) {
          console.log('✅ [FACILITY-TASKS] 업무 메모 → 사업장 메모 동기화 완료:', syncResult.memoId);
        } else {
          console.warn('⚠️ [FACILITY-TASKS] 메모 동기화 실패 (계속 진행):', syncResult.error);
        }
      } catch (syncError) {
        console.error('⚠️ [FACILITY-TASKS] 메모 동기화 오류 (계속 진행):', syncError);
      }
    }

    // 🆕 업무 생성 시 첫 단계 이력 기록
    try {
      await startNewStatus({
        taskId: newTask.id,
        status: newTask.status,
        taskType: newTask.task_type,
        businessName: newTask.business_name,
        assigneeId: finalAssignees.length > 0 ? finalAssignees[0].id : undefined,
        assigneeName: finalAssignees.length > 0 ? finalAssignees[0].name : undefined,
        primaryAssigneeId: newTask.primary_assignee_id,
        notes: `업무 생성 - ${newTask.title}`,
        createdBy: user.id,
        createdByName: user.name
      });
      console.log('✅ [FACILITY-TASKS] 첫 단계 이력 기록 완료:', newTask.id);
    } catch (historyError) {
      console.error('⚠️ [FACILITY-TASKS] 단계 이력 기록 실패 (계속 진행):', historyError);
    }

    // 업무 생성 시 자동 메모 생성
    await createTaskCreationNote(newTask);

    // 다중 담당자 알림 생성 (PostgreSQL 함수 사용)
    if (finalAssignees.length > 0) {
      try {
        const notificationResult = await createTaskAssignmentNotifications(
          newTask.id,
          finalAssignees.map(a => ({
            id: a.id,
            name: a.name,
            email: a.email,
            position: a.position
          })),
          newTask.business_name,
          newTask.title,
          newTask.task_type,
          newTask.priority,
          user.name
        );

        console.log('✅ [NOTIFICATION] 업무 할당 알림 생성:', notificationResult);
      } catch (notificationError) {
        console.error('❌ [NOTIFICATION] 업무 할당 알림 생성 실패:', notificationError);
      }
    }

    return createSuccessResponse({
      task: newTask,
      message: '시설 업무가 성공적으로 생성되었습니다'
    });

  } catch (error: any) {
    console.error('🔴 [FACILITY-TASKS] POST 오류:', error?.message || error);
    return createErrorResponse('시설 업무 생성 중 오류가 발생했습니다', 500);
  }
}, { logLevel: 'debug' });

// PUT: 시설 업무 수정 (권한 제어 적용)
export const PUT = withApiHandler(async (request: NextRequest) => {
  try {
    // 사용자 인증 및 권한 확인
    const { authorized, user } = await checkUserPermission(request);
    if (!authorized || !user) {
      return createErrorResponse('인증이 필요합니다', 401);
    }

    const body = await request.json();
    const {
      id,
      title,
      description,
      business_name,
      task_type,
      status,
      priority,
      assignee, // 기존 호환성용
      assignees, // 새로운 다중 담당자
      primary_assignee_id,
      start_date,
      due_date,
      notes,
      completed_at
    } = body;

    console.log('📝 [FACILITY-TASKS] 시설 업무 수정:', {
      user: user.name,
      permission: user.permission_level,
      id,
      title,
      status
    });

    if (!id) {
      return createErrorResponse('업무 ID는 필수입니다', 400);
    }

    // 기존 업무 정보 조회 (상태 변경 감지용) - Direct PostgreSQL
    const existingTask = await queryOne(
      `SELECT * FROM facility_tasks
       WHERE id = $1 AND is_active = true AND is_deleted = false`,
      [id]
    );

    if (!existingTask) {
      return createErrorResponse('시설 업무를 찾을 수 없습니다', 404);
    }

    // 권한 체크: 모든 레벨 사용자가 업무 수정 가능 (이력 추적으로 투명성 확보)
    // - 레벨 1+: 모든 업무 수정 가능 (단, 수정 이력은 모두 기록됨)
    const canEdit = user.permission_level >= 1;

    if (!canEdit) {
      console.warn('❌ [FACILITY-TASKS] 권한 부족:', {
        user: user.name,
        level: user.permission_level,
        taskId: existingTask.id
      });
      return createErrorResponse('업무를 수정할 권한이 없습니다', 403);
    }

    // 수정 이력 로깅 강화
    console.log('📝 [FACILITY-TASKS] 업무 수정 시작:', {
      taskId: existingTask.id,
      taskTitle: existingTask.title,
      editor: user.name,
      editorLevel: user.permission_level,
      originalCreator: existingTask.created_by_name,
      changes: {
        title: title !== undefined,
        description: description !== undefined,
        status: status !== undefined,
        assignees: assignees !== undefined,
        priority: priority !== undefined
      }
    });

    // 중복 업무 체크: 사업장이나 상태가 변경되는 경우에만 체크
    if ((business_name !== undefined && business_name !== existingTask.business_name) ||
        (status !== undefined && status !== existingTask.status) ||
        (task_type !== undefined && task_type !== existingTask.task_type)) {

      const checkBusinessName = business_name !== undefined ? business_name : existingTask.business_name;
      const checkStatus = status !== undefined ? status : existingTask.status;
      const checkTaskType = task_type !== undefined ? task_type : existingTask.task_type;

      // Direct PostgreSQL 중복 체크
      let duplicateTasks;
      try {
        duplicateTasks = await queryAll(
          `SELECT id, title, business_name, status, created_at, task_type
           FROM facility_tasks
           WHERE business_name = $1 AND status = $2 AND task_type = $3
             AND is_active = true AND is_deleted = false AND id != $4`,
          [checkBusinessName, checkStatus, checkTaskType, id]
        );
      } catch (duplicateCheckError) {
        console.error('🔴 [FACILITY-TASKS] 중복 체크 오류:', duplicateCheckError);
      }

      if (duplicateTasks && duplicateTasks.length > 0) {
        const duplicateTask = duplicateTasks[0];
        const statusLabel = getTaskStatusKR(checkStatus);

        console.warn('⚠️ [FACILITY-TASKS] 수정 시 중복 업무 감지:', {
          businessName: checkBusinessName,
          status: checkStatus,
          statusLabel,
          duplicateTaskId: duplicateTask.id,
          duplicateTaskTitle: duplicateTask.title
        });

        return createErrorResponse(
          `이미 "${checkBusinessName}" 사업장에 "${statusLabel}" 단계의 업무가 등록되어 있습니다.\n\n` +
          `기존 업무: ${duplicateTask.title}\n` +
          `등록일: ${new Date(duplicateTask.created_at).toLocaleDateString('ko-KR')}\n\n` +
          `같은 단계의 중복 업무는 등록할 수 없습니다. 기존 업무를 수정하거나 완료 후 새 업무를 등록해주세요.`,
          409 // Conflict
        );
      }
    }

    // 업데이트할 필드만 포함
    const updateData: any = {
      updated_at: new Date().toISOString(),
      last_modified_by: user.id,
      last_modified_by_name: user.name
    };

    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (business_name !== undefined) updateData.business_name = business_name;
    if (task_type !== undefined) updateData.task_type = task_type;
    if (status !== undefined) updateData.status = status;
    if (priority !== undefined) updateData.priority = priority;
    if (start_date !== undefined) updateData.start_date = start_date;
    if (due_date !== undefined) updateData.due_date = due_date;
    if (notes !== undefined) updateData.notes = notes;
    if (completed_at !== undefined) updateData.completed_at = completed_at;

    // 담당자 업데이트 처리
    if (assignees !== undefined) {
      // 담당자 배열이 전달된 경우 ID 매핑 처리
      const mappedAssignees = [...assignees];
      for (let i = 0; i < mappedAssignees.length; i++) {
        const assigneeItem = mappedAssignees[i];
        if (assigneeItem.name && !assigneeItem.id) {
          // employees 테이블에서 이름으로 사용자 정보 조회 - Direct PostgreSQL
          try {
            const employee = await queryOne(
              'SELECT id, name, email, position FROM employees WHERE name = $1 AND is_active = true AND is_deleted = false',
              [assigneeItem.name]
            );

            if (employee) {
              mappedAssignees[i] = {
                id: employee.id,
                name: employee.name,
                position: employee.position || '미정',
                email: employee.email || ''
              };
            } else {
              console.warn('⚠️ [FACILITY-TASKS] 수정 시 담당자 ID 조회 실패:', assigneeItem.name, '- 직원 없음');
            }
          } catch (employeeError: any) {
            console.warn('⚠️ [FACILITY-TASKS] 수정 시 담당자 ID 조회 실패:', assigneeItem.name, employeeError?.message);
          }
        }
      }
      updateData.assignees = mappedAssignees;
      updateData.assignee = mappedAssignees.length > 0 ? mappedAssignees[0].name : null; // 기존 호환성
    } else if (assignee !== undefined) {
      updateData.assignee = assignee;
      // assignee가 있으면 assignees도 업데이트하고 ID 매핑
      if (assignee) {
        // employees 테이블에서 이름으로 사용자 정보 조회 - Direct PostgreSQL
        try {
          const employee = await queryOne(
            'SELECT id, name, email, position FROM employees WHERE name = $1 AND is_active = true AND is_deleted = false',
            [assignee]
          );

          if (employee) {
            updateData.assignees = [{
              id: employee.id,
              name: employee.name,
              position: employee.position || '미정',
              email: employee.email || ''
            }];
          } else {
            console.warn('⚠️ [FACILITY-TASKS] 단일 담당자 ID 조회 실패:', assignee, '- 직원 없음');
            updateData.assignees = [{
              id: '',
              name: assignee,
              position: '미정',
              email: ''
            }];
          }
        } catch (employeeError: any) {
          console.warn('⚠️ [FACILITY-TASKS] 단일 담당자 ID 조회 실패:', assignee, employeeError?.message);
          updateData.assignees = [{
            id: '',
            name: assignee,
            position: '미정',
            email: ''
          }];
        }
      } else {
        updateData.assignees = [];
      }
    }

    if (primary_assignee_id !== undefined) updateData.primary_assignee_id = primary_assignee_id;

    // 업데이트 쿼리 빌드 - Direct PostgreSQL
    const updateFields = Object.keys(updateData);
    const setClause = updateFields.map((field, index) => `${field} = $${index + 1}`).join(', ');
    const values = updateFields.map(field => {
      // assignees 필드는 JSON 문자열로 변환
      if (field === 'assignees' && updateData[field]) {
        return JSON.stringify(updateData[field]);
      }
      return updateData[field];
    });
    values.push(id); // Add id as the last parameter

    const updateQuery = `
      UPDATE facility_tasks
      SET ${setClause}
      WHERE id = $${values.length} AND is_active = true AND is_deleted = false
      RETURNING *
    `;

    const updateResult = await pgQuery(updateQuery, values);

    if (!updateResult.rows || updateResult.rows.length === 0) {
      console.error('🔴 [FACILITY-TASKS] 수정 실패');
      return createErrorResponse('시설 업무를 찾을 수 없습니다', 404);
    }

    const updatedTask = updateResult.rows[0];

    // ✅ 업무 수정 시 사업장 updated_at 업데이트 (리스트 상단 표시) - Direct PostgreSQL
    if (updatedTask?.business_name) {
      try {
        // business_name을 business_id로 변환
        const businessInfo = await queryOne(
          `SELECT id FROM business_info
           WHERE business_name = $1 AND is_active = true AND is_deleted = false`,
          [updatedTask.business_name]
        );

        if (!businessInfo) {
          console.warn('⚠️ [FACILITY-TASKS] 사업장 조회 실패:', updatedTask.business_name);
        } else {
          await pgQuery(
            `UPDATE business_info SET updated_at = NOW() WHERE id = $1`,
            [businessInfo.id]
          );
          console.log(`✅ [FACILITY-TASKS] 사업장 updated_at 업데이트 완료 - businessName: ${updatedTask.business_name}`);
        }
      } catch (updateBusinessError) {
        console.error('❌ [FACILITY-TASKS] 사업장 updated_at 업데이트 중 오류:', updateBusinessError);
        // 업무 수정은 성공했으므로 계속 진행
      }
    }

    // 📝 수정 이력 상세 로깅
    const changedFields = Object.keys(updateData).filter(key =>
      !['updated_at', 'last_modified_by', 'last_modified_by_name'].includes(key)
    );

    if (changedFields.length > 0) {
      console.log('📋 [EDIT-HISTORY] 수정 내역:', {
        taskId: updatedTask.id,
        taskTitle: updatedTask.title,
        editor: user.name,
        editorId: user.id,
        editorLevel: user.permission_level,
        changedFields,
        timestamp: new Date().toISOString(),
        summary: `${changedFields.join(', ')} 필드 수정됨`
      });

      // 수정 요약 업데이트 - 주석 처리 (last_edit_summary 컬럼이 새 DB에 없음)
      // await pgQuery(
      //   `UPDATE facility_tasks
      //    SET last_edit_summary = $1
      //    WHERE id = $2`,
      //   [`${user.name}이(가) ${changedFields.join(', ')} 수정함`, updatedTask.id]
      // );
    }

    // 🆕 상태 변경 감지 및 이력 기록
    const statusChanged = status !== undefined && existingTask.status !== updatedTask.status;
    if (statusChanged) {
      try {
        await startNewStatus({
          taskId: updatedTask.id,
          status: updatedTask.status,
          taskType: updatedTask.task_type,
          businessName: updatedTask.business_name,
          assigneeId: updatedTask.assignees?.[0]?.id,
          assigneeName: updatedTask.assignees?.[0]?.name,
          primaryAssigneeId: updatedTask.primary_assignee_id,
          notes: `단계 변경: ${getTaskStatusKR(existingTask.status)} → ${getTaskStatusKR(updatedTask.status)}`,
          createdBy: user.id,
          createdByName: user.name
        });
        console.log('✅ [FACILITY-TASKS] 단계 변경 이력 기록:', {
          taskId: updatedTask.id,
          from: existingTask.status,
          to: updatedTask.status
        });
      } catch (historyError) {
        console.error('⚠️ [FACILITY-TASKS] 단계 이력 기록 실패 (계속 진행):', historyError);
      }
    }

    // 상태 변경 시 자동 메모 및 알림 생성
    await createAutoProgressNoteAndNotification(existingTask, updatedTask, user);

    // 담당자 변경 시 다중 담당자 알림 업데이트 (PostgreSQL 함수 사용)
    const assigneesChanged = JSON.stringify(existingTask.assignees || []) !== JSON.stringify(updatedTask.assignees || []);
    if (assigneesChanged) {
      try {
        const updateResult = await updateTaskAssignmentNotifications(
          updatedTask.id,
          existingTask.assignees || [],
          updatedTask.assignees || [],
          updatedTask.business_name,
          updatedTask.title,
          updatedTask.task_type,
          updatedTask.priority,
          user.name
        );

        console.log('✅ [NOTIFICATION] 담당자 변경 알림 업데이트:', updateResult);
      } catch (notificationError) {
        console.error('❌ [NOTIFICATION] 담당자 변경 알림 업데이트 실패:', notificationError);
      }
    }

    // 🆕 메모 변경 감지 및 사업장 메모 동기화 (이력 누적)
    const notesChanged = notes !== undefined && existingTask.notes !== updatedTask.notes;
    if (notesChanged && updatedTask.notes && updatedTask.notes.trim() !== '') {
      try {
        // business_name으로 business_id 조회
        const businessInfo = await queryOne(
          `SELECT id FROM business_info
           WHERE business_name = $1 AND is_active = true AND is_deleted = false`,
          [updatedTask.business_name]
        );

        if (!businessInfo) {
          console.warn('⚠️ [FACILITY-TASKS] 메모 동기화 - 사업장 조회 실패:', updatedTask.business_name);
        } else {
          const { addTaskMemoToBusinessHistory } = await import('@/lib/task-memo-sync');
          const syncResult = await addTaskMemoToBusinessHistory({
            taskId: updatedTask.id,
            businessId: businessInfo.id,
            businessName: updatedTask.business_name,
            notes: updatedTask.notes,
            status: updatedTask.status,
            taskType: updatedTask.task_type,
            userId: user.id,
            userName: user.name
          });

          if (syncResult.success) {
            console.log('✅ [FACILITY-TASKS] 업무 메모 수정 → 사업장 메모 동기화 완료:', syncResult.memoId);
          } else {
            console.warn('⚠️ [FACILITY-TASKS] 메모 동기화 실패 (계속 진행):', syncResult.error);
          }
        }
      } catch (syncError) {
        console.error('⚠️ [FACILITY-TASKS] 메모 동기화 오류 (계속 진행):', syncError);
      }
    }

    return createSuccessResponse({
      task: updatedTask,
      message: '시설 업무가 성공적으로 수정되었습니다'
    });

  } catch (error: any) {
    console.error('🔴 [FACILITY-TASKS] PUT 오류:', error?.message || error);
    return createErrorResponse('시설 업무 수정 중 오류가 발생했습니다', 500);
  }
}, { logLevel: 'debug' });

// DELETE: 시설 업무 삭제 (권한 제어 적용, 소프트 삭제)
export const DELETE = withApiHandler(async (request: NextRequest) => {
  try {
    // 사용자 인증 및 권한 확인
    const { authorized, user } = await checkUserPermission(request);
    if (!authorized || !user) {
      return createErrorResponse('인증이 필요합니다', 401);
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    console.log('🗑️ [FACILITY-TASKS] 시설 업무 삭제:', {
      user: user.name,
      permission: user.permission_level,
      id
    });

    if (!id) {
      return createErrorResponse('업무 ID는 필수입니다', 400);
    }

    // 기존 업무 정보 조회 (권한 체크용) - Direct PostgreSQL
    const existingTask = await queryOne(
      `SELECT * FROM facility_tasks
       WHERE id = $1 AND is_active = true AND is_deleted = false`,
      [id]
    );

    if (!existingTask) {
      return createErrorResponse('시설 업무를 찾을 수 없습니다', 404);
    }

    // 슈퍼 관리자 화이트리스트 (모든 업무 삭제 가능)
    const SUPER_ADMIN_EMAILS = ['psm19911@naver.com'];

    // 권한 체크: 슈퍼 관리자, 관리자(레벨 4+), 또는 본인이 생성한 업무만 삭제 가능
    const isSuperAdmin = SUPER_ADMIN_EMAILS.includes(user.email);
    const isAdmin = user.permission_level >= 4;
    const isOwner = existingTask.created_by === user.id;

    const canDelete = isSuperAdmin || isAdmin || isOwner;

    if (!canDelete) {
      console.warn('❌ [FACILITY-TASKS] 삭제 권한 부족:', {
        user: user.name,
        email: user.email,
        level: user.permission_level,
        taskCreator: existingTask.created_by_name,
        isSuperAdmin,
        isAdmin,
        isOwner
      });
      return createErrorResponse('이 업무를 삭제할 권한이 없습니다', 403);
    }

    // 소프트 삭제 - Direct PostgreSQL
    const deleteResult = await pgQuery(
      `UPDATE facility_tasks
       SET is_deleted = true, updated_at = NOW(),
           last_modified_by = $1, last_modified_by_name = $2
       WHERE id = $3 AND is_active = true AND is_deleted = false
       RETURNING *`,
      [user.id, user.name, id]
    );

    if (!deleteResult.rows || deleteResult.rows.length === 0) {
      console.error('🔴 [FACILITY-TASKS] 삭제 실패');
      return createErrorResponse('시설 업무를 찾을 수 없습니다', 404);
    }

    const deletedTask = deleteResult.rows[0];


    // Supabase Realtime: PostgreSQL 트리거가 자동으로 알림 생성
    console.log('🔔 [REALTIME] 업무 삭제 - 트리거가 자동으로 알림 생성:', deletedTask.id);

    return createSuccessResponse({
      message: '시설 업무가 성공적으로 삭제되었습니다'
    });

  } catch (error: any) {
    console.error('🔴 [FACILITY-TASKS] DELETE 오류:', error?.message || error);
    return createErrorResponse('시설 업무 삭제 중 오류가 발생했습니다', 500);
  }
}, { logLevel: 'debug' });

// ============================================================================
// 자동 메모 및 알림 생성 유틸리티 함수
// ============================================================================

async function createAutoProgressNoteAndNotification(existingTask: any, updatedTask: any, user: any) {
  try {
    const statusChanged = existingTask.status !== updatedTask.status;
    const assigneesChanged = JSON.stringify(existingTask.assignees || []) !== JSON.stringify(updatedTask.assignees || []);

    // 상태 변경 시 자동 메모 생성
    if (statusChanged) {
      await createAutoProgressNote({
        task: updatedTask,
        oldStatus: existingTask.status,
        newStatus: updatedTask.status,
        changeType: 'status_change'
      });
    }

    // 담당자 변경 시 자동 메모 생성
    if (assigneesChanged) {
      await createAutoProgressNote({
        task: updatedTask,
        oldAssignees: existingTask.assignees || [],
        newAssignees: updatedTask.assignees || [],
        changeType: 'assignee_change'
      });
    }

    // 알림 생성 (담당자들에게)
    if (statusChanged || assigneesChanged) {
      await createTaskNotifications({
        task: updatedTask,
        oldTask: existingTask,
        statusChanged,
        assigneesChanged,
        modifierName: user.name // 수정자 정보 추가
      });
    }

  } catch (error) {
    console.error('🔴 [AUTO-PROGRESS] 자동 메모/알림 생성 오류:', error);
    // 에러가 발생해도 메인 로직에 영향을 주지 않도록 함
  }
}

async function createAutoProgressNote(params: {
  task: any;
  oldStatus?: string;
  newStatus?: string;
  oldAssignees?: any[];
  newAssignees?: any[];
  changeType: 'status_change' | 'assignee_change';
}) {
  const { task, oldStatus, newStatus, oldAssignees, newAssignees, changeType } = params;

  let content = '';
  let metadata: any = {};

  if (changeType === 'status_change' && oldStatus && newStatus) {
    const statusLabels: { [key: string]: string } = {
      // 자비 업무 단계
      'customer_contact': '고객 상담',
      'site_inspection': '현장 실사',
      'quotation': '견적서 작성',
      'contract': '계약 체결',
      'deposit_confirm': '계약금 확인',
      'product_order': '제품 발주',
      'product_shipment': '제품 출고',
      'installation_schedule': '설치 협의',
      'installation': '제품 설치',
      'balance_payment': '잔금 입금',
      'document_complete': '서류 발송 완료',
      // 보조금 업무 단계
      'document_preparation': '신청서 작성 필요',
      'application_submit': '신청서 제출',
      'approval_pending': '보조금 승인대기',
      'approved': '보조금 승인',
      'rejected': '보조금 탈락',
      'document_supplement': '신청서 보완',
      'pre_construction_inspection': '착공 전 실사',
      'pre_construction_supplement_1st': '착공 보완 1차',
      'pre_construction_supplement_2nd': '착공 보완 2차',
      'construction_report_submit': '착공신고서 제출',
      'pre_completion_document_submit': '준공도서 작성 필요',
      'completion_inspection': '준공 실사',
      'completion_supplement_1st': '준공 보완 1차',
      'completion_supplement_2nd': '준공 보완 2차',
      'completion_supplement_3rd': '준공 보완 3차',
      'final_document_submit': '보조금지급신청서 제출',
      'subsidy_payment': '보조금 입금',
      // AS 업무 단계
      'as_customer_contact': 'AS 고객 상담',
      'as_site_inspection': 'AS 현장 확인',
      'as_quotation': 'AS 견적 작성',
      'as_contract': 'AS 계약 체결',
      'as_part_order': 'AS 부품 발주',
      'as_completed': 'AS 완료',
      // 기타 단계
      'etc_status': '기타',
      // 기존 단계 (호환성)
      'pending': '대기',
      'in_progress': '진행중',
      'completed': '완료',
      'cancelled': '취소',
      'on_hold': '보류'
    };

    content = `업무 상태가 "${statusLabels[oldStatus] || oldStatus}"에서 "${statusLabels[newStatus] || newStatus}"로 변경되었습니다.`;
    metadata = {
      change_type: 'status',
      old_status: oldStatus,
      new_status: newStatus,
      task_priority: task.priority,
      task_type: task.task_type
    };
  } else if (changeType === 'assignee_change') {
    const oldNames = oldAssignees?.map(a => a.name).join(', ') || '없음';
    const newNames = newAssignees?.map(a => a.name).join(', ') || '없음';

    content = `담당자가 "${oldNames}"에서 "${newNames}"로 변경되었습니다.`;
    metadata = {
      change_type: 'assignee',
      old_assignees: oldAssignees,
      new_assignees: newAssignees,
      task_priority: task.priority,
      task_type: task.task_type
    };
  }

  if (content) {
    try {
      // business_name을 business_id로 변환 - Direct PostgreSQL
      const businessInfo = await queryOne(
        `SELECT id FROM business_info
         WHERE business_name = $1 AND is_active = true AND is_deleted = false`,
        [task.business_name]
      );

      if (!businessInfo) {
        console.warn(`⚠️ [FACILITY-TASKS] 사업장을 찾을 수 없음 (메모 생성 생략): ${task.business_name}`);
        return; // 메모 생성 실패하지만 업무는 계속 진행
      }

      // 메모 생성 - Direct PostgreSQL
      await pgQuery(
        `INSERT INTO business_memos (
          business_id, title, content, created_by, updated_by
         ) VALUES ($1, $2, $3, $4, $5)`,
        [
          businessInfo.id,
          `[자동] ${task.task_type === 'self' ? '자비' : task.task_type === 'subsidy' ? '보조금' : task.task_type === 'as' ? 'AS' : '기타'} 업무 상태 변경`,
          content,
          'system',
          'system'
        ]
      );

      console.log('✅ [AUTO-PROGRESS] 자동 메모 생성 성공:', task.id);
    } catch (memoError) {
      console.warn('⚠️ [AUTO-PROGRESS] 메모 생성 중 예외 (계속 진행):', memoError);
    }
  }
}

async function createTaskNotifications(params: {
  task: any;
  oldTask: any;
  statusChanged: boolean;
  assigneesChanged: boolean;
  modifierName?: string;
}) {
  const { task, oldTask, statusChanged, assigneesChanged, modifierName } = params;

  // 알림을 받을 사용자 ID 수집
  const userIds = new Set<string>();

  // 현재 담당자들
  if (task.assignees && Array.isArray(task.assignees)) {
    task.assignees.forEach((assignee: any) => {
      if (assignee.id) userIds.add(assignee.id);
    });
  }

  // 이전 담당자들 (변경된 경우)
  if (assigneesChanged && oldTask.assignees && Array.isArray(oldTask.assignees)) {
    oldTask.assignees.forEach((assignee: any) => {
      if (assignee.id) userIds.add(assignee.id);
    });
  }

  const userIdArray = Array.from(userIds);
  if (userIdArray.length === 0) return;

  // 알림 생성
  const notifications: any[] = [];

  if (statusChanged) {
    // 새로운 한글 상태 매핑과 수정자 정보를 사용하여 알림 메시지 생성
    const message = createStatusChangeMessage(
      oldTask.status,
      task.status,
      task.business_name,
      modifierName
    );

    userIdArray.forEach(userId => {
      notifications.push({
        user_id: userId,
        task_id: task.id,
        business_name: task.business_name,
        message: message,
        notification_type: 'status_change',
        priority: task.priority === 'urgent' ? 'urgent' : task.priority === 'high' ? 'high' : 'normal'
      });
    });
  }

  if (assigneesChanged) {
    // 새로 배정된 담당자들에게 알림
    const newUserIds = task.assignees?.map((a: any) => a.id).filter((id: string) => id) || [];
    const oldUserIds = oldTask.assignees?.map((a: any) => a.id).filter((id: string) => id) || [];
    const assignedUserIds = newUserIds.filter((id: string) => !oldUserIds.includes(id));

    assignedUserIds.forEach((userId: string) => {
      notifications.push({
        user_id: userId,
        task_id: task.id,
        business_name: task.business_name,
        message: `${task.business_name}의 새 업무 "${task.title}"이 담당자로 배정되었습니다.`,
        notification_type: 'assignment',
        priority: task.priority === 'urgent' ? 'urgent' : task.priority === 'high' ? 'high' : 'normal'
      });
    });
  }

  // 알림 일괄 생성 - Direct PostgreSQL
  if (notifications.length > 0) {
    try {
      // 다중 INSERT를 위한 VALUES 절 생성
      const values: any[] = [];
      const valuePlaceholders: string[] = [];
      let paramIndex = 1;

      notifications.forEach((notif, index) => {
        valuePlaceholders.push(
          `($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4}, $${paramIndex + 5})`
        );
        values.push(
          notif.user_id,
          notif.task_id,
          notif.business_name,
          notif.message,
          notif.notification_type,
          notif.priority
        );
        paramIndex += 6;
      });

      const insertQuery = `
        INSERT INTO task_notifications (
          user_id, task_id, business_name, message, notification_type, priority
        ) VALUES ${valuePlaceholders.join(', ')}
        RETURNING *
      `;

      const insertResult = await pgQuery(insertQuery, values);
      const createdNotifications = insertResult.rows;

      console.log('✅ [AUTO-PROGRESS] 자동 알림 생성 성공:', notifications.length, '개');

      // WebSocket으로 실시간 알림 전송
      try {
        const io = (global as any).io;
        if (io && createdNotifications) {
          createdNotifications.forEach((notification: any) => {
            io.to(`user:${notification.user_id}`).emit('task_notification_created', {
              notification: notification
            });
          });
          console.log('🔔 [WEBSOCKET] 업무 변경 알림 WebSocket 전송 성공:', createdNotifications.length, '개');
        }
      } catch (wsError) {
        console.warn('⚠️ [WEBSOCKET] 업무 변경 알림 WebSocket 전송 실패:', wsError);
      }
    } catch (error) {
      console.error('🔴 [AUTO-PROGRESS] 자동 알림 생성 중 오류:', error);
    }
  }
}

// 업무 생성 시 자동 메모 생성 함수
async function createTaskCreationNote(task: any) {
  try {
    const taskTypeLabels: { [key: string]: string } = {
      'self': '자비 설치',
      'subsidy': '보조금',
      'as': 'AS',
      'dealer': '대리점',
      'outsourcing': '외주설치',
      'etc': '기타'
    };

    const statusLabels: { [key: string]: string } = {
      'customer_contact': '고객 연락',
      'pending': '대기',
      'in_progress': '진행중',
      'quote_requested': '견적 요청',
      'quote_received': '견적 수신',
      'work_scheduled': '작업 예정',
      'work_in_progress': '작업중',
      'completed': '완료',
      'cancelled': '취소'
    };

    const taskTypeLabel = taskTypeLabels[task.task_type] || task.task_type;
    const statusLabel = statusLabels[task.status] || task.status;
    const assigneeList = task.assignees?.map((a: any) => a.name).filter(Boolean).join(', ') || '미배정';

    const content = `새로운 ${taskTypeLabel} 업무 "${task.title}"이 생성되었습니다. (상태: ${statusLabel}, 담당자: ${assigneeList})`;

    const metadata = {
      change_type: 'creation',
      task_type: task.task_type,
      initial_status: task.status,
      initial_assignees: task.assignees || [],
      task_priority: task.priority,
      creation_timestamp: new Date().toISOString()
    };

    try {
      // business_name을 business_id로 변환 - Direct PostgreSQL
      const businessInfo = await queryOne(
        `SELECT id FROM business_info
         WHERE business_name = $1 AND is_active = true AND is_deleted = false`,
        [task.business_name]
      );

      if (!businessInfo) {
        console.warn(`⚠️ [TASK-CREATION] 사업장을 찾을 수 없음 (메모 생성 생략): ${task.business_name}`);
        return; // 메모 생성 실패하지만 업무는 계속 진행
      }

      // 메모 생성 - Direct PostgreSQL
      await pgQuery(
        `INSERT INTO business_memos (
          business_id, title, content, created_by, updated_by
         ) VALUES ($1, $2, $3, $4, $5)`,
        [
          businessInfo.id,
          `[자동] ${task.task_type === 'self' ? '자비' : task.task_type === 'subsidy' ? '보조금' : task.task_type === 'as' ? 'AS' : '기타'} 업무 상태 변경`,
          content,
          'system',
          'system'
        ]
      );

      console.log('✅ [TASK-CREATION] 생성 메모 성공:', task.id);
    } catch (memoError) {
      console.warn('⚠️ [TASK-CREATION] 메모 생성 중 예외 (계속 진행):', memoError);
    }

    // 알림은 이미 createTaskAssignmentNotifications에서 생성됨 (중복 제거)

  } catch (error) {
    console.error('🔴 [TASK-CREATION] 생성 메모/알림 처리 오류:', error);
    // 에러가 발생해도 메인 로직에 영향을 주지 않도록 함
  }
}

// ============================================================================
// Supabase Realtime 시스템 - PostgreSQL 트리거가 알림을 자동 생성
// ============================================================================

// 참고:
// - PostgreSQL 트리거 (sql/realtime_triggers.sql)가 facility_tasks 변경을 감지하여 자동으로 알림 생성
// - notifications 및 task_notifications 테이블에 Supabase Realtime 활성화
// - 클라이언트는 useRealtimeNotifications 훅으로 실시간 알림 수신
// - 폴링 폴백으로 연결 끊김 시에도 안정적인 알림 전달 보장