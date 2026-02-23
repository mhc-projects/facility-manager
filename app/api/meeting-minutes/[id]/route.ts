// ============================================
// 회의록 API: 상세 조회 (GET), 수정 (PUT), 삭제 (DELETE)
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import jwt from 'jsonwebtoken'
import {
  UpdateMeetingMinuteRequest,
  MeetingMinuteResponse,
  ApiResponse
} from '@/types/meeting-minutes'

// Supabase 클라이언트 설정
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(supabaseUrl, supabaseServiceKey)

// JWT 토큰에서 사용자 정보 추출하는 헬퍼 함수
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this-in-production'

async function getUserFromToken(request: NextRequest) {
  try {
    let token: string | null = null

    // 1. Authorization 헤더에서 토큰 확인
    const authHeader = request.headers.get('authorization')
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7)
    }
    // 2. 쿠키에서 session_token 확인 (헤더에 없는 경우)
    else {
      const cookieToken = request.cookies.get('session_token')?.value
      if (cookieToken) {
        token = cookieToken
      }
    }

    if (!token) {
      return null
    }

    const decoded = jwt.verify(token, JWT_SECRET) as any

    // 사용자 정보 조회
    const { data: user, error } = await supabase
      .from('employees')
      .select('id, name, email, permission_level, department')
      .eq('id', decoded.userId || decoded.id)
      .eq('is_active', true)
      .single()

    if (error || !user) {
      console.warn('⚠️ [AUTH] 사용자 조회 실패:', error?.message)
      return null
    }

    return user
  } catch (error) {
    console.warn('⚠️ [AUTH] JWT 토큰 검증 실패:', error)
    return null
  }
}

/**
 * GET /api/meeting-minutes/[id]
 * 특정 회의록 상세 조회
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // JWT 인증 확인
    const user = await getUserFromToken(request)
    if (!user) {
      return NextResponse.json(
        { success: false, error: '인증이 필요합니다.' },
        { status: 401 }
      )
    }

    const { id } = params

    // 회의록 조회 (RLS로 권한 자동 체크)
    const { data: minute, error } = await supabase
      .from('meeting_minutes')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !minute) {
      return NextResponse.json(
        { success: false, error: '회의록을 찾을 수 없습니다.' },
        { status: 404 }
      )
    }

    const response: MeetingMinuteResponse = {
      success: true,
      data: minute
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('[MEETING-MINUTES] Get error:', error)
    return NextResponse.json(
      { success: false, error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/meeting-minutes/[id]
 * 회의록 수정
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // JWT 인증 확인
    const user = await getUserFromToken(request)
    if (!user) {
      return NextResponse.json(
        { success: false, error: '인증이 필요합니다.' },
        { status: 401 }
      )
    }

    const { id } = params
    const body: UpdateMeetingMinuteRequest = await request.json()

    // 수정할 데이터 구성
    const updateData: any = {
      ...body,
      updated_by: user.id
    }

    // 회의록 수정 (RLS로 권한 자동 체크)
    const { data: updatedMinute, error } = await supabase
      .from('meeting_minutes')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('[MEETING-MINUTES] Update error:', error)
      return NextResponse.json(
        { success: false, error: '회의록 수정에 실패했습니다. 권한을 확인하세요.' },
        { status: 403 }
      )
    }

    const response: ApiResponse = {
      success: true,
      data: updatedMinute,
      message: '회의록이 수정되었습니다.'
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('[MEETING-MINUTES] Update error:', error)
    return NextResponse.json(
      { success: false, error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/meeting-minutes/[id]
 * 사업장별 이슈 완료 상태 토글
 *
 * Request Body:
 * {
 *   "type": "toggle_business_issue",
 *   "issue_id": "이슈 ID",
 *   "is_completed": true | false
 * }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getUserFromToken(request)
    if (!user) {
      return NextResponse.json(
        { success: false, error: '인증이 필요합니다.' },
        { status: 401 }
      )
    }

    const { id } = params
    const body = await request.json()
    const { type, issue_id, is_completed } = body

    if (type !== 'toggle_business_issue' || !issue_id || is_completed === undefined) {
      return NextResponse.json(
        { success: false, error: 'type, issue_id, is_completed는 필수입니다.' },
        { status: 400 }
      )
    }

    // 현재 회의록 조회
    const { data: minute, error: fetchError } = await supabase
      .from('meeting_minutes')
      .select('id, content')
      .eq('id', id)
      .single()

    if (fetchError || !minute) {
      return NextResponse.json(
        { success: false, error: '회의록을 찾을 수 없습니다.' },
        { status: 404 }
      )
    }

    // 해당 이슈 업데이트
    const businessIssues = minute.content?.business_issues || []
    let found = false
    const updatedIssues = businessIssues.map((issue: any) => {
      if (issue.id === issue_id) {
        found = true
        return {
          ...issue,
          is_completed,
          completed_at: is_completed ? new Date().toISOString() : null,
          completed_by: is_completed ? user.id : null
        }
      }
      return issue
    })

    if (!found) {
      return NextResponse.json(
        { success: false, error: '이슈를 찾을 수 없습니다.' },
        { status: 404 }
      )
    }

    const updatedContent = { ...minute.content, business_issues: updatedIssues }

    const { error: updateError } = await supabase
      .from('meeting_minutes')
      .update({ content: updatedContent, updated_by: user.id })
      .eq('id', id)

    if (updateError) {
      console.error('[MEETING-MINUTES] PATCH error:', updateError)
      return NextResponse.json(
        { success: false, error: '업데이트에 실패했습니다.' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[MEETING-MINUTES] PATCH error:', error)
    return NextResponse.json(
      { success: false, error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/meeting-minutes/[id]
 * 회의록 삭제
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // JWT 인증 확인
    const user = await getUserFromToken(request)
    if (!user) {
      return NextResponse.json(
        { success: false, error: '인증이 필요합니다.' },
        { status: 401 }
      )
    }

    const { id } = params

    // 회의록 삭제 (RLS로 권한 자동 체크)
    const { error } = await supabase
      .from('meeting_minutes')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('[MEETING-MINUTES] Delete error:', error)
      return NextResponse.json(
        { success: false, error: '회의록 삭제에 실패했습니다. 권한을 확인하세요.' },
        { status: 403 }
      )
    }

    const response: ApiResponse = {
      success: true,
      message: '회의록이 삭제되었습니다.'
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('[MEETING-MINUTES] Delete error:', error)
    return NextResponse.json(
      { success: false, error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
