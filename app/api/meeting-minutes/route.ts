// ============================================
// 회의록 API: 목록 조회 (GET), 생성 (POST)
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import jwt from 'jsonwebtoken'
import {
  CreateMeetingMinuteRequest,
  MeetingFilters,
  MeetingMinutesListResponse,
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
      .select('id, name, email, permission_level, department, role')
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

// 전체 회의록 접근 권한을 가진 특별 허용 이메일 목록
const FULL_ACCESS_EMAILS = ['dpf@kakao.com']

/**
 * GET /api/meeting-minutes
 * 회의록 목록 조회 (참석자 기반 접근 제어 + 필터링, 페이지네이션)
 * - permission_level >= 4 또는 FULL_ACCESS_EMAILS: 전체 조회
 * - 그 외: 본인이 organizer, created_by, 또는 participants 인 회의록만 조회
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
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const status = searchParams.get('status') || 'all'
    const meeting_type = searchParams.get('meeting_type')
    const date_from = searchParams.get('date_from')
    const date_to = searchParams.get('date_to')
    const organizer = searchParams.get('organizer')
    const search = searchParams.get('search')

    // 접근 권한 판별
    const isFullAccess =
      user.permission_level >= 4 ||
      FULL_ACCESS_EMAILS.includes(user.email) ||
      user.role === 'ceo' ||
      user.role === 'executive'

    const offset = (page - 1) * limit

    // RPC 함수로 참석자 기반 필터링 + 페이지네이션 실행
    const { data: rows, error } = await supabase.rpc('get_accessible_meeting_minutes', {
      p_user_id:        user.id,
      p_is_full_access: isFullAccess,
      p_status:         status !== 'all' ? status : null,
      p_meeting_type:   meeting_type || null,
      p_date_from:      date_from || null,
      p_date_to:        date_to || null,
      p_organizer:      organizer || null,
      p_search:         search || null,
      p_limit:          limit,
      p_offset:         offset,
    })

    if (error) {
      console.error('[MEETING-MINUTES] RPC error:', error)
      return NextResponse.json(
        { success: false, error: '회의록 조회에 실패했습니다.' },
        { status: 500 }
      )
    }

    const count = rows?.[0]?.total_count ?? 0
    const minutes = (rows || []).map(({ total_count, ...rest }: any) => rest)

    // 통계 조회 (참석자 기반 접근 제어 적용)
    const { data: statsRow, error: statsError } = await supabase.rpc('get_accessible_meeting_statistics', {
      p_user_id:        user.id,
      p_is_full_access: isFullAccess,
    })

    if (statsError) {
      console.error('[MEETING-MINUTES] Stats RPC error:', statsError)
    }

    const stats = statsRow?.[0] ?? { total: 0, draft: 0, completed: 0, archived: 0, this_month: 0 }
    const totalPages = Math.ceil((count as number) / limit)

    const response: MeetingMinutesListResponse = {
      success: true,
      data: {
        items: minutes,
        pagination: {
          total: count as number,
          page,
          limit,
          totalPages
        },
        statistics: {
          total:     stats.total     || 0,
          draft:     stats.draft     || 0,
          completed: stats.completed || 0,
          archived:  stats.archived  || 0,
          thisMonth: stats.this_month || 0
        }
      }
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('[MEETING-MINUTES] Unexpected error:', error)
    return NextResponse.json(
      { success: false, error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/meeting-minutes
 * 새 회의록 생성
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
    const body: CreateMeetingMinuteRequest = await request.json()

    // 필수 필드 검증
    if (!body.title || !body.meeting_date || !body.meeting_type) {
      return NextResponse.json(
        { success: false, error: '필수 필드가 누락되었습니다.' },
        { status: 400 }
      )
    }

    // 회의록 데이터 구성
    const minuteData = {
      title: body.title,
      meeting_date: body.meeting_date,
      meeting_type: body.meeting_type,
      organizer_id: body.organizer_id || user.id,
      participants: body.participants || [],
      location: body.location || '',
      location_type: body.location_type || 'offline',
      agenda: body.agenda || [],
      content: body.content || { summary: '', discussions: [], action_items: [] },
      attachments: body.attachments || [],
      status: body.status || 'draft',
      visibility: body.visibility || 'private',
      created_by: user.id,
      updated_by: user.id
    }

    // 회의록 생성
    const { data: newMinute, error } = await supabase
      .from('meeting_minutes')
      .insert(minuteData)
      .select()
      .single()

    if (error) {
      console.error('[MEETING-MINUTES] Insert error:', error)
      return NextResponse.json(
        { success: false, error: '회의록 생성에 실패했습니다.' },
        { status: 500 }
      )
    }

    const response: ApiResponse = {
      success: true,
      data: newMinute,
      message: '회의록이 생성되었습니다.'
    }

    return NextResponse.json(response, { status: 201 })
  } catch (error) {
    console.error('[MEETING-MINUTES] Unexpected error:', error)
    return NextResponse.json(
      { success: false, error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
