import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth/require-auth'

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request, 1);
    if (!auth.ok) return auth.response;

    const body = await request.json()
    const { taskId, completionNotes } = body

    if (!taskId) {
      return NextResponse.json(
        { success: false, message: '업무 ID가 필요합니다.' },
        { status: 400 }
      )
    }

    const supabase = supabaseAdmin

    // PostgreSQL 함수 호출
    const { data, error } = await supabase.rpc('advance_task_to_next_step', {
      task_id: taskId,
      completion_notes: completionNotes || null
    })

    if (error) {
      console.error('[API] advance_task_to_next_step error:', error)
      return NextResponse.json(
        { success: false, message: '다음 단계로 이동 중 오류가 발생했습니다.', error: error.message },
        { status: 500 }
      )
    }

    // 함수 결과 확인
    const result = data && data.length > 0 ? data[0] : null

    if (!result || !result.success) {
      return NextResponse.json(
        { success: false, message: result?.message || '다음 단계로 이동할 수 없습니다.' },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      message: result.message,
      newStatus: result.new_status
    })

  } catch (error: any) {
    console.error('[API] Advance task error:', error)
    return NextResponse.json(
      { success: false, message: '서버 오류가 발생했습니다.', error: error.message },
      { status: 500 }
    )
  }
}
