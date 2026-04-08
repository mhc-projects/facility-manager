// lib/task-memo-sync.ts - 업무 메모 → 사업장 메모 동기화 유틸리티
import { query as pgQuery, queryOne } from '@/lib/supabase-direct'
import { getSupabaseAdmin } from '@/lib/supabase'
import { TASK_STATUS_KR, TASK_TYPE_KR } from '@/lib/task-status-utils'
import { logDebug, logError } from '@/lib/logger'

/**
 * 업무 메모를 사업장 메모로 동기화 (이력 누적 방식)
 *
 * @description
 * - 업무 메모를 business_memos에 새 레코드로 추가 (이력 누적)
 * - facility_tasks.notes는 비워지지 않고 유지됨
 * - 동일한 source_id로 여러 개의 메모 이력이 쌓임
 *
 * @param params - 동기화 파라미터
 * @returns Promise<{ success: boolean, memoId?: string, error?: string }>
 */
export async function addTaskMemoToBusinessHistory({
  taskId,
  businessId,
  businessName,
  notes,
  status,
  taskType,
  userId,
  userName
}: {
  taskId: string
  businessId: string
  businessName: string
  notes: string
  status: string
  taskType: string
  userId: string
  userName: string
}): Promise<{ success: boolean; memoId?: string; error?: string }> {
  try {
    // 메모가 비어있으면 동기화하지 않음
    if (!notes || notes.trim() === '') {
      logDebug('TASK-MEMO-SYNC', '메모가 비어있어 동기화하지 않음', { taskId })
      return { success: true }
    }

    // 상태 및 타입 한글 변환
    const statusKR = TASK_STATUS_KR[status] || status
    const taskTypeKR = TASK_TYPE_KR[taskType] || taskType

    // 제목 생성: [업무] 사업장명 - 업무타입 - 현재단계
    const title = `[업무] ${businessName} - ${taskTypeKR} - ${statusKR}`

    logDebug('TASK-MEMO-SYNC', '업무 메모 → 사업장 메모 동기화 시작', {
      taskId,
      businessId,
      businessName,
      status: statusKR,
      taskType: taskTypeKR
    })

    // business_memos에 새 이력 레코드 추가 (Supabase client 사용 → Realtime 이벤트 발생)
    const supabaseAdmin = getSupabaseAdmin()
    const { data: insertedMemo, error: insertError } = await supabaseAdmin
      .from('business_memos')
      .insert({
        business_id: businessId,
        title,
        content: notes,
        source_type: 'task_sync',
        source_id: taskId,
        task_status: statusKR,
        task_type: taskType,
        created_by: userName,
        updated_by: userName,
        is_active: true,
        is_deleted: false
      })
      .select('id')
      .single()

    if (insertError || !insertedMemo) {
      logError('TASK-MEMO-SYNC', '메모 레코드 생성 실패', { taskId, businessId, error: insertError?.message })
      return { success: false, error: insertError?.message || '메모 레코드 생성 실패' }
    }

    const memoId = insertedMemo.id

    logDebug('TASK-MEMO-SYNC', '업무 메모 동기화 완료', {
      taskId,
      businessId,
      memoId,
      title
    })

    return { success: true, memoId }
  } catch (error: any) {
    logError('TASK-MEMO-SYNC', '업무 메모 동기화 오류', {
      error: error.message,
      taskId,
      businessId
    })
    return { success: false, error: error.message || '동기화 오류 발생' }
  }
}

/**
 * 특정 업무의 모든 메모 이력 조회
 *
 * @param taskId - 업무 ID
 * @returns Promise<Array<BusinessMemo>>
 */
export async function getTaskMemoHistory(taskId: string) {
  try {
    const query = `
      SELECT
        id,
        title,
        content,
        task_status,
        task_type,
        created_at,
        created_by
      FROM business_memos
      WHERE source_type = 'task_sync'
        AND source_id = $1
        AND is_active = true
        AND is_deleted = false
      ORDER BY created_at DESC
    `

    const result = await pgQuery(query, [taskId])

    return result.rows || []
  } catch (error: any) {
    logError('TASK-MEMO-SYNC', '업무 메모 이력 조회 오류', {
      error: error.message,
      taskId
    })
    return []
  }
}

/**
 * 업무 삭제 시 관련 메모 이력도 소프트 삭제
 * (CASCADE 설정으로 자동 처리되지만, 소프트 삭제를 위한 함수)
 *
 * @param taskId - 업무 ID
 * @returns Promise<{ success: boolean, deletedCount: number }>
 */
export async function softDeleteTaskMemos(taskId: string): Promise<{ success: boolean; deletedCount: number }> {
  try {
    const updateQuery = `
      UPDATE business_memos
      SET is_deleted = true, updated_at = NOW()
      WHERE source_type = 'task_sync'
        AND source_id = $1
        AND is_deleted = false
      RETURNING id
    `

    const result = await pgQuery(updateQuery, [taskId])

    const deletedCount = result.rows?.length || 0

    logDebug('TASK-MEMO-SYNC', '업무 메모 이력 소프트 삭제 완료', {
      taskId,
      deletedCount
    })

    return { success: true, deletedCount }
  } catch (error: any) {
    logError('TASK-MEMO-SYNC', '업무 메모 이력 삭제 오류', {
      error: error.message,
      taskId
    })
    return { success: false, deletedCount: 0 }
  }
}

/**
 * 업무 타입 변경 시 해당 업무의 기존 메모 제목에서 업무 타입을 업데이트
 * 제목 형식: [업무] 사업장명 - 업무타입 - 현재단계
 *
 * @param taskId - 업무 ID
 * @param newTaskType - 새 업무 타입 (e.g., 'subsidy', 'self')
 * @param businessName - 사업장명
 * @returns Promise<{ success: boolean, updatedCount: number }>
 */
export async function updateMemoTaskType(
  taskId: string,
  newTaskType: string,
  businessName: string
): Promise<{ success: boolean; updatedCount: number }> {
  try {
    const newTaskTypeKR = TASK_TYPE_KR[newTaskType] || newTaskType

    // 해당 업무의 [업무] 형식 메모를 조회
    const selectQuery = `
      SELECT id, title
      FROM business_memos
      WHERE source_type = 'task_sync'
        AND source_id = $1
        AND is_deleted = false
        AND title LIKE '[업무]%'
    `
    const memos = await pgQuery(selectQuery, [taskId])

    if (!memos.rows || memos.rows.length === 0) {
      return { success: true, updatedCount: 0 }
    }

    let updatedCount = 0
    for (const memo of memos.rows) {
      // [업무] 사업장명 - 업무타입 - 현재단계 → 업무타입 부분만 교체
      const prefix = `[업무] ${businessName} - `
      if (!memo.title.startsWith(prefix)) continue

      const afterPrefix = memo.title.substring(prefix.length)
      const lastDashIdx = afterPrefix.lastIndexOf(' - ')
      if (lastDashIdx === -1) continue

      const statusPart = afterPrefix.substring(lastDashIdx) // ' - 현재단계'
      const newTitle = `${prefix}${newTaskTypeKR}${statusPart}`

      if (newTitle !== memo.title) {
        await pgQuery(
          `UPDATE business_memos SET title = $1, updated_at = NOW() WHERE id = $2`,
          [newTitle, memo.id]
        )
        updatedCount++
      }
    }

    if (updatedCount > 0) {
      logDebug('TASK-MEMO-SYNC', '업무 타입 변경 → 기존 메모 제목 업데이트', {
        taskId,
        newTaskType: newTaskTypeKR,
        updatedCount
      })
    }

    return { success: true, updatedCount }
  } catch (error: any) {
    logError('TASK-MEMO-SYNC', '메모 타입 업데이트 오류', {
      error: error.message,
      taskId,
      newTaskType
    })
    return { success: false, updatedCount: 0 }
  }
}
