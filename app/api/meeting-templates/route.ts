// ============================================
// 회의록 템플릿 API: 목록 조회 (GET), 생성 (POST)
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import jwt from 'jsonwebtoken'
import {
  CreateMeetingTemplateRequest,
  MeetingTemplatesResponse,
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
 * GET /api/meeting-templates
 * 템플릿 목록 조회
 */
export async function GET(request: NextRequest) {
  try {
    // JWT 인증 확인
    const user = await getUserFromToken(request)
    if (!user) {
      return NextResponse.json(
        { success: false, error: '인증이 필요합니다.' },
        { status: 401 }
      )
    }

    // 쿼리 파라미터 파싱
    const searchParams = request.nextUrl.searchParams
    const meeting_type = searchParams.get('meeting_type')

    // 템플릿 조회 (공개 템플릿 + 본인 템플릿)
    let query = supabase
      .from('meeting_templates')
      .select('*')
      .order('usage_count', { ascending: false })
      .order('created_at', { ascending: false })

    // 회의 유형 필터
    if (meeting_type) {
      query = query.eq('meeting_type', meeting_type)
    }

    const { data: templates, error } = await query

    if (error) {
      console.error('[MEETING-TEMPLATES] Query error:', error)
      return NextResponse.json(
        { success: false, error: '템플릿 조회에 실패했습니다.' },
        { status: 500 }
      )
    }

    const response: MeetingTemplatesResponse = {
      success: true,
      data: templates || []
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('[MEETING-TEMPLATES] Unexpected error:', error)
    return NextResponse.json(
      { success: false, error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/meeting-templates
 * 새 템플릿 생성
 */
export async function POST(request: NextRequest) {
  try {
    // JWT 인증 확인
    const user = await getUserFromToken(request)
    if (!user) {
      return NextResponse.json(
        { success: false, error: '인증이 필요합니다.' },
        { status: 401 }
      )
    }

    // 요청 본문 파싱
    const body: CreateMeetingTemplateRequest = await request.json()

    // 필수 필드 검증
    if (!body.name || !body.meeting_type || !body.template_structure) {
      return NextResponse.json(
        { success: false, error: '필수 필드가 누락되었습니다.' },
        { status: 400 }
      )
    }

    // 템플릿 데이터 구성
    const templateData = {
      name: body.name,
      description: body.description || '',
      meeting_type: body.meeting_type,
      template_structure: body.template_structure,
      is_public: body.is_public || false,
      created_by: user.id
    }

    // 템플릿 생성
    const { data: newTemplate, error } = await supabase
      .from('meeting_templates')
      .insert(templateData)
      .select()
      .single()

    if (error) {
      console.error('[MEETING-TEMPLATES] Insert error:', error)
      return NextResponse.json(
        { success: false, error: '템플릿 생성에 실패했습니다.' },
        { status: 500 }
      )
    }

    const response: ApiResponse = {
      success: true,
      data: newTemplate,
      message: '템플릿이 생성되었습니다.'
    }

    return NextResponse.json(response, { status: 201 })
  } catch (error) {
    console.error('[MEETING-TEMPLATES] Unexpected error:', error)
    return NextResponse.json(
      { success: false, error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
