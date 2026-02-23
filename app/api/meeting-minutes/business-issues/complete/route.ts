// ============================================
// 회의록 API: 사업장별 이슈 일괄 완료 처리 (PUT)
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
 * PUT /api/meeting-minutes/business-issues/complete
 * 동일한 사업장 이슈를 모든 회의록에서 완료 처리
 *
 * Request Body:
 * {
 *   "issue_id": "이슈의 고유 ID",
 *   "business_id": "사업장 ID",
 *   "issue_content": "이슈 내용"
 * }
 */
export async function PUT(request: NextRequest) {
  try {
    // JWT 인증 확인
    const user = await getUserFromToken(request)
    if (!user) {
      return NextResponse.json(
        { success: false, error: '인증이 필요합니다.' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { issue_id, business_id, issue_content } = body

    if (!issue_id) {
      return NextResponse.json(
        { success: false, error: 'issue_id는 필수입니다.' },
        { status: 400 }
      )
    }

    // 모든 정기회의 조회 (is_completed=false인 동일 이슈 찾기)
    const { data: meetings, error: fetchError } = await supabase
      .from('meeting_minutes')
      .select('id, content')
      .eq('meeting_type', '정기회의')
      .neq('status', 'archived')

    if (fetchError) {
      console.error('[COMPLETE-ISSUE] Fetch error:', fetchError)
      return NextResponse.json(
        { success: false, error: '회의록 조회에 실패했습니다.' },
        { status: 500 }
      )
    }

    if (!meetings || meetings.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          updated_count: 0,
          message: '업데이트할 회의록이 없습니다.'
        }
      })
    }

    // 일치하는 이슈를 찾아서 is_completed=true로 업데이트
    let updatedCount = 0
    const updatePromises: Promise<any>[] = []

    for (const meeting of meetings) {
      const businessIssues = meeting.content?.business_issues || []
      let hasChanges = false

      const updatedIssues = businessIssues.map((issue: any) => {
        // 동일한 이슈인지 확인 (business_id와 issue_content가 일치)
        const isMatchingIssue =
          issue.id === issue_id ||
          (issue.business_id === business_id &&
           issue.issue_content === issue_content &&
           issue.is_completed === false)

        if (isMatchingIssue) {
          hasChanges = true
          return {
            ...issue,
            is_completed: true,
            completed_date: new Date().toISOString(),
            completed_by: user.id
          }
        }
        return issue
      })

      // 변경사항이 있는 경우에만 업데이트
      if (hasChanges) {
        const updatedContent = {
          ...meeting.content,
          business_issues: updatedIssues
        }

        const updatePromise = supabase
          .from('meeting_minutes')
          .update({
            content: updatedContent,
            updated_by: user.id
          })
          .eq('id', meeting.id)

        updatePromises.push(updatePromise)
        updatedCount++
      }
    }

    // 모든 업데이트를 병렬로 실행
    const results = await Promise.all(updatePromises)

    // 에러 확인
    const errors = results.filter(result => result.error)
    if (errors.length > 0) {
      console.error('[COMPLETE-ISSUE] Update errors:', errors)
      return NextResponse.json(
        {
          success: false,
          error: '일부 회의록 업데이트에 실패했습니다.',
          details: errors.map(e => e.error.message)
        },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: {
        updated_count: updatedCount,
        message: `${updatedCount}개의 회의록에서 이슈가 완료 처리되었습니다.`
      }
    })
  } catch (error) {
    console.error('[COMPLETE-ISSUE] Update error:', error)
    return NextResponse.json(
      { success: false, error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
