/**
 * 활성 보조금 공고 API
 *
 * GET /api/active-subsidies
 * - 현재 접수 중인 보조금 공고를 지자체별로 그룹화하여 반환
 * - 마감일 있는 공고: D-day 계산
 * - 마감일 없는 공고: "예산소진시" 표시
 */

import { NextRequest, NextResponse } from 'next/server'
import { queryAll } from '@/lib/supabase-direct'

// 요청마다 DB를 다시 조회하도록 정적 렌더링 대상에서 제외한다 (없으면 빌드 시점 응답이 다음 배포까지 그대로 나간다)
export const dynamic = 'force-dynamic'

// 성공 응답 생성
function createSuccessResponse(data: any) {
  return NextResponse.json({
    success: true,
    data
  })
}

// 오류 응답 생성
function createErrorResponse(message: string, status: number = 500) {
  return NextResponse.json(
    {
      success: false,
      error: message
    },
    { status }
  )
}

// D-day 계산 함수
function calculateDisplayText(hasDeadline: boolean, nearestDeadline: string | null): string {
  if (!hasDeadline || !nearestDeadline) {
    return '예산소진시'
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const endDate = new Date(nearestDeadline)
  endDate.setHours(0, 0, 0, 0)

  const diffTime = endDate.getTime() - today.getTime()
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return 'D-Day'
  if (diffDays < 0) return '마감'
  return `D-${diffDays}`
}

export async function GET(request: NextRequest) {
  try {
    console.log('🔍 [ACTIVE-SUBSIDIES] 활성 보조금 공고 조회 시작')

    // 활성 보조금 공고 조회
    const result = await queryAll(`
      SELECT
        region_name,
        COUNT(*) as announcement_count,
        MIN(application_period_end) as nearest_deadline,
        BOOL_OR(application_period_end IS NOT NULL) as has_deadline,
        json_agg(
          json_build_object(
            'id', id,
            'title', title,
            'application_period_end', application_period_end,
            'budget', budget,
            'source_url', source_url
          ) ORDER BY application_period_end ASC NULLS LAST
        ) as announcements
      FROM subsidy_announcements
      WHERE
        (application_period_start IS NULL OR application_period_start <= CURRENT_DATE)
        AND (application_period_end IS NULL OR application_period_end >= CURRENT_DATE)
        AND status NOT IN ('expired', 'not_relevant')
        AND is_relevant = true
      GROUP BY region_name
      ORDER BY has_deadline DESC, nearest_deadline ASC NULLS LAST
    `)

    console.log(`✅ [ACTIVE-SUBSIDIES] ${result.length}개 지자체에서 활성 공고 발견`)

    // display_text 계산 및 데이터 가공
    const activeRegions = result.map((row: any) => {
      const hasDeadline = row.has_deadline
      const nearestDeadline = row.nearest_deadline
      const displayText = calculateDisplayText(hasDeadline, nearestDeadline)

      return {
        region_name: row.region_name,
        announcement_count: parseInt(row.announcement_count),
        has_deadline: hasDeadline,
        nearest_deadline: nearestDeadline,
        display_text: displayText,
        announcements: row.announcements
      }
    })

    // 디버깅: 각 지자체별 정보 출력
    activeRegions.forEach((region: any) => {
      console.log(`  📍 ${region.region_name}: ${region.announcement_count}개 공고, ${region.display_text}`)
    })

    return createSuccessResponse({ activeRegions })

  } catch (error: any) {
    console.error('❌ [ACTIVE-SUBSIDIES] 조회 실패:', error)
    return createErrorResponse(error?.message || '활성 보조금 공고를 불러오는데 실패했습니다.')
  }
}
