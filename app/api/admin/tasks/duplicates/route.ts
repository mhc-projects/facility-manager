import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

/**
 * GET /api/admin/tasks/duplicates
 * 중복 업무 조회
 */
export async function GET(request: NextRequest) {
  try {
    // 1. 인증 확인
    const token = request.headers.get('authorization')?.replace('Bearer ', '')
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    // 2. 모든 활성 업무 조회
    const { data: tasks, error } = await supabase
      .from('facility_tasks')
      .select('id, business_name, task_type, status, title, created_at, assignee, due_date')
      .eq('is_active', true)
      .eq('is_deleted', false)
      .order('business_name')
      .order('task_type')
      .order('status')
      .order('created_at')

    if (error) {
      console.error('업무 조회 오류:', error)
      throw error
    }

    // 3. 중복 그룹 생성
    const groups: Record<string, any[]> = {}
    tasks.forEach(task => {
      const key = `${task.business_name}|${task.task_type}|${task.status}`
      if (!groups[key]) groups[key] = []
      groups[key].push(task)
    })

    // 4. 중복만 필터링 (2개 이상)
    const duplicates = Object.entries(groups)
      .filter(([_, groupTasks]) => groupTasks.length > 1)
      .map(([key, groupTasks]) => {
        const [business_name, task_type, status] = key.split('|')

        // 생성일 기준 정렬 (최신순)
        const sorted = groupTasks.sort((a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )

        return {
          key,
          business_name,
          task_type,
          status,
          count: groupTasks.length,
          tasks: sorted.map((task, index) => ({
            id: task.id,
            title: task.title,
            created_at: task.created_at,
            assignee: task.assignee,
            due_date: task.due_date,
            keep: index === 0  // 첫 번째(최신)만 보존
          }))
        }
      })

    // 5. 요약 통계
    const summary = {
      totalGroups: duplicates.length,
      totalDuplicates: duplicates.reduce((sum, group) => sum + group.count, 0),
      toDelete: duplicates.reduce((sum, group) => sum + (group.count - 1), 0)
    }

    return NextResponse.json({ duplicates, summary })
  } catch (error) {
    console.error('중복 조회 오류:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/admin/tasks/duplicates
 * 선택된 중복 업무 삭제 (soft delete)
 */
export async function DELETE(request: NextRequest) {
  try {
    // 1. 인증 확인
    const token = request.headers.get('authorization')?.replace('Bearer ', '')
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 2. 요청 파싱
    const { taskIds } = await request.json()
    if (!Array.isArray(taskIds) || taskIds.length === 0) {
      return NextResponse.json(
        { error: 'taskIds must be a non-empty array' },
        { status: 400 }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    // 3. Soft delete 실행
    let successCount = 0
    let failedCount = 0
    const errors: any[] = []

    for (const taskId of taskIds) {
      const { error } = await supabase
        .from('facility_tasks')
        .update({
          is_deleted: true,
          updated_at: new Date().toISOString()
        })
        .eq('id', taskId)

      if (error) {
        failedCount++
        errors.push({ id: taskId, error: error.message })
        console.error(`업무 삭제 실패 (${taskId}):`, error)
      } else {
        successCount++
      }
    }

    return NextResponse.json({
      success: successCount,
      failed: failedCount,
      errors: errors.length > 0 ? errors : undefined
    })
  } catch (error) {
    console.error('중복 삭제 오류:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
