// app/api/revenue/commission-rates/history/route.ts
// 수수료율 변경 이력 조회 API

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { withApiHandler, createSuccessResponse, createErrorResponse } from '@/lib/api-utils'
import { verifyTokenHybrid } from '@/lib/secure-jwt'
import type { CommissionRateHistory, Manufacturer } from '@/types/commission'

export const dynamic = 'force-dynamic'
// force-dynamic만으로는 GET 전용 라우트의 fetch 조회가 데이터 캐시에 영구 저장되므로 명시적으로 끈다
export const fetchCache = 'force-no-store'
export const runtime = 'nodejs'

// 권한 확인 함수
async function checkUserPermission(request: NextRequest) {
  const authHeader = request.headers.get('authorization')

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { authorized: false, user: null }
  }

  try {
    const token = authHeader.replace('Bearer ', '')
    const result = await verifyTokenHybrid(token)

    if (!result.user) {
      return { authorized: false, user: null }
    }

    // 권한 레벨 3 이상만 수수료율 이력 조회 가능
    if (result.user.permission_level < 3) {
      return { authorized: false, user: null }
    }

    return {
      authorized: true,
      user: result.user
    }
  } catch (error) {
    console.error('❌ [COMMISSION-HISTORY] 권한 확인 오류:', error)
    return { authorized: false, user: null }
  }
}

// GET: 수수료율 변경 이력 조회
export const GET = withApiHandler(async (request: NextRequest) => {
  // 권한 확인
  const { authorized, user } = await checkUserPermission(request)
  if (!authorized) {
    return createErrorResponse('권한이 없습니다', 403)
  }

  const { searchParams } = new URL(request.url)
  const salesOffice = searchParams.get('sales_office')
  const manufacturer = searchParams.get('manufacturer') as Manufacturer | null
  const startDate = searchParams.get('start_date')
  const endDate = searchParams.get('end_date')
  const showCurrentOnly = searchParams.get('current_only') === 'true'
  const page = parseInt(searchParams.get('page') || '1')
  const limit = parseInt(searchParams.get('limit') || '50')

  try {
    let query = supabaseAdmin
      .from('commission_rate_history')
      .select('*', { count: 'exact' })

    // 필터 적용
    if (salesOffice) {
      query = query.eq('sales_office', salesOffice)
    }

    if (manufacturer) {
      query = query.eq('manufacturer', manufacturer)
    }

    if (showCurrentOnly) {
      query = query.eq('is_current', true)
    }

    if (startDate) {
      query = query.gte('effective_from', startDate)
    }

    if (endDate) {
      query = query.lte('effective_from', endDate)
    }

    // 페이지네이션
    const offset = (page - 1) * limit
    query = query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    const { data: history, error, count } = await query

    if (error) {
      throw error
    }

    return createSuccessResponse({
      sales_office: salesOffice,
      manufacturer: manufacturer,
      history: history || [],
      total: count || 0,
      page,
      limit,
      total_pages: Math.ceil((count || 0) / limit)
    })
  } catch (error) {
    console.error('❌ [COMMISSION-HISTORY] 이력 조회 오류:', error)
    return createErrorResponse('수수료율 이력 조회 중 오류가 발생했습니다', 500)
  }
}, { logLevel: 'debug' })
