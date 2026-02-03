// app/api/admin/tasks/bulk-upload/route.ts - 엑셀 일괄 업무 등록 API
import { NextRequest } from 'next/server';
import { withApiHandler, createSuccessResponse, createErrorResponse } from '@/lib/api-utils';
import { queryOne, queryAll, query as pgQuery } from '@/lib/supabase-direct';
import { TASK_STATUS_KR, TASK_TYPE_KR } from '@/lib/task-status-utils';
import { verifyTokenHybrid } from '@/lib/secure-jwt';
import { logDebug, logError } from '@/lib/logger';
import { startNewStatus } from '@/lib/task-status-history';
// 🔧 Phase 4: 공통 매핑 모듈 import
import { convertTaskType, getInvalidTaskTypeMessage } from '@/lib/task-type-mappings';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// 사용자 권한 확인 (권한 4만 허용)
async function checkAdminPermission(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  let token: string | null = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.replace('Bearer ', '');
  } else {
    const cookieToken = request.cookies.get('auth_token')?.value;
    if (cookieToken) {
      token = cookieToken;
    }
  }

  if (!token) {
    return { authorized: false, user: null };
  }

  try {
    const result = await verifyTokenHybrid(token);

    if (!result.user) {
      return { authorized: false, user: null };
    }

    // 권한 4 체크
    if (result.user.permission_level < 4) {
      logDebug('BULK-UPLOAD', '권한 부족', {
        userId: result.user.id,
        permission: result.user.permission_level
      });
      return { authorized: false, user: result.user };
    }

    return {
      authorized: true,
      user: result.user
    };
  } catch (error) {
    logError('BULK-UPLOAD', '권한 확인 오류', error);
    return { authorized: false, user: null };
  }
}

// 한글 → 영문 코드 변환 매핑
// 🔧 Phase 4: REVERSE_TASK_TYPE_MAP 제거 - 공통 모듈 사용으로 대체
// 이제 lib/task-type-mappings.ts의 convertTaskType() 함수 사용

// 한글 상태명 → 영문 코드 변환 (역방향 매핑)
// 🔧 Phase 7: "확인필요"는 업무타입에 따라 다른 코드로 변환
// 🔧 Fix: task_type을 고려하여 올바른 status 코드 반환
function getStatusCodeFromKorean(koreanStatus: string, taskType?: string | null): string | null {
  // 특별 처리: "확인필요"는 업무타입에 따라 다른 코드로 변환
  if (koreanStatus === '확인필요' && taskType) {
    const needsCheckMap: { [key: string]: string } = {
      'self': 'self_needs_check',
      'subsidy': 'subsidy_needs_check',
      'as': 'as_needs_check',
      'dealer': 'dealer_needs_check',
      'outsourcing': 'outsourcing_needs_check',
      'etc': 'etc_needs_check'
    };
    return needsCheckMap[taskType] || null;
  }

  // task_type이 있는 경우: prefix가 있는 status 우선 검색
  if (taskType) {
    // 1순위: {task_type}_{status} 형태 검색 (예: dealer_product_ordered)
    for (const [code, korean] of Object.entries(TASK_STATUS_KR)) {
      if (korean === koreanStatus && code.startsWith(`${taskType}_`)) {
        return code;
      }
    }

    // 2순위: 공통 단계 검색 (prefix 없는 status)
    // dealer, outsourcing, etc는 공통 단계를 사용하지 않으므로 이 단계를 건너뜀
    if (taskType !== 'dealer' && taskType !== 'outsourcing' && taskType !== 'etc') {
      for (const [code, korean] of Object.entries(TASK_STATUS_KR)) {
        if (korean === koreanStatus && !code.includes('_')) {
          return code;
        }
      }
    }
  }

  // task_type이 없거나 위에서 찾지 못한 경우: 일반 매핑 (첫 번째 매칭)
  for (const [code, korean] of Object.entries(TASK_STATUS_KR)) {
    if (korean === koreanStatus) {
      return code;
    }
  }

  return null;
}

interface ParsedTask {
  businessName: string;
  taskType: string;
  currentStatus: string;
  assignee: string;
  memo: string;
  rowNumber: number;
}

interface ValidationResult {
  isValid: boolean;
  businessId?: string;
  taskTypeCode?: string;
  statusCode?: string;
  assigneeId?: string;
  errors: string[];
}

// 업무 데이터 검증 함수
async function validateTask(task: ParsedTask): Promise<ValidationResult> {
  const errors: string[] = [];
  let businessId: string | undefined;
  let taskTypeCode: string | undefined;
  let statusCode: string | undefined;
  let assigneeId: string | undefined;

  // 1. 사업장 검증
  try {
    const business = await queryOne(
      'SELECT id FROM business_info WHERE business_name = $1 AND is_active = true AND is_deleted = false',
      [task.businessName]
    );

    if (!business) {
      errors.push(`사업장 "${task.businessName}"을 찾을 수 없습니다`);
    } else {
      businessId = business.id;
    }
  } catch (error: any) {
    errors.push(`사업장 조회 오류: ${error.message}`);
  }

  // 2. 업무타입 검증 및 변환 (🔧 Phase 4: 공통 모듈 사용)
  taskTypeCode = convertTaskType(task.taskType);
  if (!taskTypeCode) {
    errors.push(getInvalidTaskTypeMessage(task.taskType));
  }

  // 3. 현재단계 검증 및 변환
  // 🔧 Phase 7: "확인필요" 처리를 위해 taskTypeCode 전달
  statusCode = getStatusCodeFromKorean(task.currentStatus, taskTypeCode);
  if (!statusCode) {
    errors.push(`현재단계 "${task.currentStatus}"이 유효하지 않습니다. 입력 가이드를 참고하세요.`);
  }

  // 4. 담당자 검증 (선택사항)
  // 🔧 Phase 5: 담당자 필드를 선택사항으로 변경
  if (task.assignee && task.assignee.trim() !== '') {
    try {
      const employee = await queryOne(
        'SELECT id FROM employees WHERE name = $1 AND is_active = true AND is_deleted = false',
        [task.assignee.trim()]
      );

      if (!employee) {
        // 경고만 하고 계속 진행 (담당자 미지정 상태로 생성)
        logDebug('BULK-UPLOAD', `담당자 "${task.assignee}" 찾을 수 없음 - 담당자 미지정으로 진행`, {
          businessName: task.businessName,
          rowNumber: task.rowNumber
        });
      } else {
        assigneeId = employee.id;
      }
    } catch (error: any) {
      // 조회 오류도 경고만 하고 계속 진행
      logDebug('BULK-UPLOAD', `담당자 조회 오류 - 담당자 미지정으로 진행`, {
        assignee: task.assignee,
        error: error.message
      });
    }
  }

  return {
    isValid: errors.length === 0,
    businessId,
    taskTypeCode,
    statusCode,
    assigneeId,
    errors
  };
}

// POST: 엑셀 일괄 업무 등록
export const POST = withApiHandler(async (request: NextRequest) => {
  try {
    // 관리자 권한 확인 (권한 4만)
    const { authorized, user } = await checkAdminPermission(request);
    if (!authorized || !user) {
      return createErrorResponse('관리자 권한이 필요합니다 (권한 레벨 4)', 403);
    }

    logDebug('BULK-UPLOAD', '일괄 등록 시작', {
      user: user.name,
      permission: user.permission_level
    });

    const body = await request.json();
    const { tasks } = body;

    if (!tasks || !Array.isArray(tasks) || tasks.length === 0) {
      return createErrorResponse('업무 데이터가 없습니다', 400);
    }

    logDebug('BULK-UPLOAD', '업무 개수', { count: tasks.length });

    // 각 업무 검증
    const validationResults: Array<{ task: ParsedTask; validation: ValidationResult }> = [];

    for (const task of tasks) {
      const validation = await validateTask(task);
      validationResults.push({ task, validation });
    }

    // 유효성 검사 결과
    const validTasks = validationResults.filter(r => r.validation.isValid);
    const invalidTasks = validationResults.filter(r => !r.validation.isValid);

    if (validTasks.length === 0) {
      return createErrorResponse('유효한 업무가 없습니다. 모든 업무가 검증에 실패했습니다.', 400);
    }

    // 유효한 업무들 일괄 등록 및 업데이트
    const createdResults: any[] = [];
    const updatedResults: any[] = [];
    const skippedResults: any[] = [];
    const failResults: any[] = [];

    for (const { task, validation } of validTasks) {
      try {
        // 중복 체크 (전체 필드 조회)
        const existingTasks = await queryAll(
          `SELECT * FROM facility_tasks
           WHERE business_name = $1 AND status = $2 AND task_type = $3
             AND is_active = true AND is_deleted = false`,
          [task.businessName, validation.statusCode, validation.taskTypeCode]
        );

        if (existingTasks && existingTasks.length > 0) {
          // 🆕 중복 업무 발견: 스마트 병합 (빈 필드만 업데이트)
          const existingTask = existingTasks[0];
          const updateFields: any = {};
          const updatedFieldNames: string[] = [];

          // 메모가 비어있고 새 메모가 있으면 업데이트
          if ((!existingTask.notes || existingTask.notes.trim() === '') && task.memo && task.memo.trim() !== '') {
            updateFields.notes = task.memo;
            updatedFieldNames.push('메모');
          }

          // 담당자가 비어있고 새 담당자가 있으면 업데이트
          if ((!existingTask.assignee || existingTask.assignee.trim() === '') && task.assignee && task.assignee.trim() !== '') {
            updateFields.assignee = task.assignee;
            updateFields.assignees = JSON.stringify([{
              id: validation.assigneeId || '',
              name: task.assignee,
              position: '미정',
              email: ''
            }]);
            updatedFieldNames.push('담당자');
          }

          // 설명이 비어있고 새 설명이 있으면 업데이트 (description은 엑셀에 없지만 나중을 위해)
          if ((!existingTask.description || existingTask.description.trim() === '') && task.memo && task.memo.trim() !== '') {
            // 메모를 description으로도 활용할 수 있음
          }

          if (updatedFieldNames.length > 0) {
            // UPDATE 쿼리 실행
            updateFields.updated_at = new Date().toISOString();
            updateFields.last_modified_by = user.id;
            updateFields.last_modified_by_name = user.name;

            const updateFieldKeys = Object.keys(updateFields);
            const setClause = updateFieldKeys.map((field, index) => `${field} = $${index + 1}`).join(', ');
            const values = updateFieldKeys.map(field => updateFields[field]);
            values.push(existingTask.id);

            const updateQuery = `
              UPDATE facility_tasks
              SET ${setClause}
              WHERE id = $${values.length}
              RETURNING *
            `;

            const updateResult = await pgQuery(updateQuery, values);

            // 🆕 메모가 업데이트되었으면 사업장 메모에 동기화 (이력 누적)
            if (updatedFieldNames.includes('메모') && task.memo && task.memo.trim() !== '' && validation.businessId) {
              try {
                const { addTaskMemoToBusinessHistory } = await import('@/lib/task-memo-sync');
                const syncResult = await addTaskMemoToBusinessHistory({
                  taskId: existingTask.id,
                  businessId: validation.businessId,
                  businessName: task.businessName,
                  notes: task.memo,
                  status: validation.statusCode || '',
                  taskType: validation.taskTypeCode || '',
                  userId: user.id,
                  userName: user.name
                });

                if (syncResult.success) {
                  console.log('✅ [BULK-UPLOAD] 엑셀 메모 업데이트 → 사업장 메모 동기화 완료:', syncResult.memoId);
                } else {
                  console.warn('⚠️ [BULK-UPLOAD] 메모 동기화 실패 (계속 진행):', syncResult.error);
                }
              } catch (syncError) {
                console.error('⚠️ [BULK-UPLOAD] 메모 동기화 오류 (계속 진행):', syncError);
              }
            }

            updatedResults.push({
              row: task.rowNumber,
              businessName: task.businessName,
              taskId: existingTask.id,
              action: 'updated',
              updatedFields: updatedFieldNames
            });
          } else {
            // 업데이트할 빈 필드가 없으면 건너뛰기
            skippedResults.push({
              row: task.rowNumber,
              businessName: task.businessName,
              taskId: existingTask.id,
              action: 'skipped',
              reason: '업데이트할 빈 필드 없음'
            });
          }
          continue;
        }

        // 중복이 없으면 새로 생성
        const title = `${task.businessName} - ${task.currentStatus}`;
        const insertQuery = `
          INSERT INTO facility_tasks (
            title, description, business_name, business_id, task_type, status, priority,
            assignee, assignees, notes,
            created_by, created_by_name, last_modified_by, last_modified_by_name
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
          RETURNING *
        `;

        const assignees = validation.assigneeId ? [{
          id: validation.assigneeId,
          name: task.assignee,
          position: '미정',
          email: ''
        }] : [];

        const insertResult = await pgQuery(insertQuery, [
          title,
          task.memo || null,
          task.businessName,
          validation.businessId,
          validation.taskTypeCode,
          validation.statusCode,
          'medium', // 기본 우선순위
          task.assignee,
          JSON.stringify(assignees),
          task.memo || null,
          user.id,
          user.name,
          user.id,
          user.name
        ]);

        if (!insertResult.rows || insertResult.rows.length === 0) {
          failResults.push({
            row: task.rowNumber,
            businessName: task.businessName,
            error: '업무 생성 실패'
          });
          continue;
        }

        const newTask = insertResult.rows[0];

        // 첫 단계 이력 기록
        try {
          await startNewStatus({
            taskId: newTask.id,
            status: newTask.status,
            taskType: newTask.task_type,
            businessName: newTask.business_name,
            assigneeId: validation.assigneeId,
            assigneeName: task.assignee,
            notes: `일괄 등록 - ${title}`,
            createdBy: user.id,
            createdByName: user.name
          });
        } catch (historyError) {
          console.warn('⚠️ [BULK-UPLOAD] 단계 이력 기록 실패 (계속 진행):', historyError);
        }

        // 🆕 엑셀 일괄 등록 메모 → 사업장 메모 동기화 (이력 누적)
        if (task.memo && task.memo.trim() !== '' && validation.businessId) {
          try {
            const { addTaskMemoToBusinessHistory } = await import('@/lib/task-memo-sync');
            const syncResult = await addTaskMemoToBusinessHistory({
              taskId: newTask.id,
              businessId: validation.businessId,
              businessName: task.businessName,
              notes: task.memo,
              status: validation.statusCode || '',
              taskType: validation.taskTypeCode || '',
              userId: user.id,
              userName: user.name
            });

            if (syncResult.success) {
              console.log('✅ [BULK-UPLOAD] 엑셀 메모 → 사업장 메모 동기화 완료:', syncResult.memoId);
            } else {
              console.warn('⚠️ [BULK-UPLOAD] 메모 동기화 실패 (계속 진행):', syncResult.error);
            }
          } catch (syncError) {
            console.error('⚠️ [BULK-UPLOAD] 메모 동기화 오류 (계속 진행):', syncError);
          }
        }

        createdResults.push({
          row: task.rowNumber,
          businessName: task.businessName,
          taskId: newTask.id,
          action: 'created',
          title: newTask.title
        });

      } catch (error: any) {
        console.error('🔴 [BULK-UPLOAD] 업무 처리 오류:', error);
        failResults.push({
          row: task.rowNumber,
          businessName: task.businessName,
          action: 'failed',
          error: error.message || '업무 처리 중 오류 발생'
        });
      }
    }

    const totalSuccess = createdResults.length + updatedResults.length;
    const totalFail = failResults.length + invalidTasks.length;

    logDebug('BULK-UPLOAD', '일괄 처리 완료', {
      created: createdResults.length,
      updated: updatedResults.length,
      skipped: skippedResults.length,
      fail: totalFail,
      invalid: invalidTasks.length
    });

    return createSuccessResponse({
      // 전체 통계
      totalCount: tasks.length,
      successCount: totalSuccess,
      newCount: createdResults.length,
      updateCount: updatedResults.length,
      skipCount: skippedResults.length,
      failCount: totalFail,

      // 상세 결과
      results: [
        ...createdResults,
        ...updatedResults,
        ...skippedResults,
        ...failResults.map(r => ({ ...r, action: 'failed' })),
        ...invalidTasks.map(r => ({
          row: r.task.rowNumber,
          businessName: r.task.businessName,
          action: 'failed',
          errors: r.validation.errors
        }))
      ],

      message:
        `✅ ${totalSuccess}개 업무 처리 완료\n` +
        `  - 신규 생성: ${createdResults.length}개\n` +
        `  - 업데이트: ${updatedResults.length}개\n` +
        `  - 건너뛰기: ${skippedResults.length}개\n` +
        (totalFail > 0 ? `⚠️ ${totalFail}개 실패` : '')
    });

  } catch (error: any) {
    console.error('🔴 [BULK-UPLOAD] POST 오류:', error?.message || error);
    return createErrorResponse('일괄 업무 등록 중 오류가 발생했습니다', 500);
  }
}, { logLevel: 'debug' });
