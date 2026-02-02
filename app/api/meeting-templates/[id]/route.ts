// ============================================
// 회의록 템플릿 API: 상세 조회 (GET)
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import jwt from 'jsonwebtoken'
import { MeetingTemplateResponse } from '@/types/meeting-minutes'

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
 * GET /api/meeting-templates/[id]
 * 특정 템플릿 상세 조회 및 사용 횟수 증가
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

    // 템플릿 조회 (RLS로 권한 자동 체크)
    const { data: template, error } = await supabase
      .from('meeting_templates')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !template) {
      return NextResponse.json(
        { success: false, error: '템플릿을 찾을 수 없습니다.' },
        { status: 404 }
      )
    }

    // 사용 횟수 증가 (백그라운드 처리)
    supabase
      .from('meeting_templates')
      .update({ usage_count: template.usage_count + 1 })
      .eq('id', id)
      .then()

    const response: MeetingTemplateResponse = {
      success: true,
      data: template
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('[MEETING-TEMPLATES] Get error:', error)
    return NextResponse.json(
      { success: false, error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
