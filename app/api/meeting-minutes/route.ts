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
 * GET /api/meeting-minutes
 * 회의록 목록 조회 (필터링, 페이지네이션)
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

    // 기본 쿼리 시작
    let query = supabase
      .from('meeting_minutes')
      .select('*', { count: 'exact' })

    // 상태 필터 (all이 아닌 경우)
    if (status !== 'all') {
      query = query.eq('status', status)
    }

    // 회의 유형 필터
    if (meeting_type) {
      query = query.eq('meeting_type', meeting_type)
    }

    // 날짜 범위 필터
    if (date_from) {
      query = query.gte('meeting_date', date_from)
    }
    if (date_to) {
      query = query.lte('meeting_date', date_to)
    }

    // 주관자 필터
    if (organizer) {
      query = query.eq('organizer_id', organizer)
    }

    // 검색 (제목 또는 내용)
    if (search) {
      query = query.or(`title.ilike.%${search}%,content->>summary.ilike.%${search}%`)
    }

    // 정렬 (최신순)
    query = query.order('meeting_date', { ascending: false })

    // 페이지네이션
    const offset = (page - 1) * limit
    query = query.range(offset, offset + limit - 1)

    // 실행
    const { data: minutes, error, count } = await query

    if (error) {
      console.error('[MEETING-MINUTES] Query error:', error)
      return NextResponse.json(
        { success: false, error: '회의록 조회에 실패했습니다.' },
        { status: 500 }
      )
    }

    // 통계 조회 (병렬 처리)
    const [draftCount, completedCount, archivedCount, thisMonthCount] = await Promise.all([
      supabase.from('meeting_minutes').select('*', { count: 'exact', head: true }).eq('status', 'draft'),
      supabase.from('meeting_minutes').select('*', { count: 'exact', head: true }).eq('status', 'completed'),
      supabase.from('meeting_minutes').select('*', { count: 'exact', head: true }).eq('status', 'archived'),
      supabase
        .from('meeting_minutes')
        .select('*', { count: 'exact', head: true })
        .gte('meeting_date', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString())
    ])

    const totalPages = Math.ceil((count || 0) / limit)

    const response: MeetingMinutesListResponse = {
      success: true,
      data: {
        items: minutes || [],
        pagination: {
          total: count || 0,
          page,
          limit,
          totalPages
        },
        statistics: {
          total: count || 0,
          draft: draftCount.count || 0,
          completed: completedCount.count || 0,
          archived: archivedCount.count || 0,
          thisMonth: thisMonthCount.count || 0
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
