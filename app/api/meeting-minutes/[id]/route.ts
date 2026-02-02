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
