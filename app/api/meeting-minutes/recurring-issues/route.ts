// ============================================
// 회의록 API: 미해결 반복 이슈 조회 (GET)
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import jwt from 'jsonwebtoken'

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
 * GET /api/meeting-minutes/recurring-issues
 * 미해결된 반복 이슈 조회 (정기회의에서 is_completed=false인 사업장별 이슈)
 *
 * Query Parameters:
 * - limit: 반환할 최대 이슈 개수 (기본값: 50)
 * - offset: 페이지네이션 오프셋 (기본값: 0)
 * - days_since: N일 이전부터의 이슈만 조회 (선택사항)
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

    // Query parameters
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')
    const daysSince = searchParams.get('days_since') ? parseInt(searchParams.get('days_since')!) : null

    // 정기회의에서 미해결 이슈 조회
    let query = supabase
      .from('meeting_minutes')
      .select('id, title, meeting_date, meeting_type, content')
      .eq('meeting_type', '정기회의')
      .neq('status', 'archived')
      .order('meeting_date', { ascending: false })

    // days_since 필터 적용
    if (daysSince !== null) {
      const sinceDate = new Date()
      sinceDate.setDate(sinceDate.getDate() - daysSince)
      query = query.gte('meeting_date', sinceDate.toISOString().split('T')[0])
    }

    const { data: meetings, error } = await query

    if (error) {
      console.error('[RECURRING-ISSUES] Query error:', error)
      return NextResponse.json(
        { success: false, error: '회의록 조회에 실패했습니다.' },
        { status: 500 }
      )
    }

    if (!meetings || meetings.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          recurring_issues: [],
          total_count: 0
        }
      })
    }

    // 미해결 이슈 추출
    const recurringIssues: any[] = []
    const today = new Date()

    for (const meeting of meetings) {
      const businessIssues = meeting.content?.business_issues || []

      for (const issue of businessIssues) {
        // is_completed가 false인 이슈만 포함
        if (issue.is_completed === false) {
          const meetingDate = new Date(meeting.meeting_date)
          const daysElapsed = Math.floor((today.getTime() - meetingDate.getTime()) / (1000 * 60 * 60 * 24))

          recurringIssues.push({
            ...issue,
            original_meeting_id: meeting.id,
            original_meeting_title: meeting.title,
            original_meeting_date: meeting.meeting_date,
            days_elapsed: daysElapsed,
            is_recurring: true
          })
        }
      }
    }

    // days_elapsed 기준으로 오래된 순서로 정렬
    recurringIssues.sort((a, b) => b.days_elapsed - a.days_elapsed)

    // 페이지네이션 적용
    const paginatedIssues = recurringIssues.slice(offset, offset + limit)

    return NextResponse.json({
      success: true,
      data: {
        recurring_issues: paginatedIssues,
        total_count: recurringIssues.length,
        limit,
        offset
      }
    })
  } catch (error) {
    console.error('[RECURRING-ISSUES] Get error:', error)
    return NextResponse.json(
      { success: false, error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
