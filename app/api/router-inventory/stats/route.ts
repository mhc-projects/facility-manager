// app/api/router-inventory/stats/route.ts
// 무선 라우터 재고 통계 API

import { NextRequest } from 'next/server'
import {
  withApiHandler,
  createSuccessResponse,
  createErrorResponse
} from '@/lib/api-utils'
import { supabaseAdmin } from '@/lib/supabase'
import { verifyTokenHybrid } from '@/lib/secure-jwt'
import type { RouterStatistics } from '@/types/router-inventory'

export const dynamic = 'force-dynamic'
// force-dynamic만으로는 GET 전용 라우트의 fetch 조회가 데이터 캐시에 영구 저장되므로 명시적으로 끈다
export const fetchCache = 'force-no-store'
export const runtime = 'nodejs'

// 사용자 인증
async function checkUserPermission(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  let token: string | null = null

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.replace('Bearer ', '')
  } else {
    const cookieToken = request.cookies.get('auth_token')?.value
    if (cookieToken) token = cookieToken
  }

  if (!token) {
    return { authorized: false, user: null }
  }

  try {
    const result = await verifyTokenHybrid(token)
    if (!result.user) {
      return { authorized: false, user: null }
    }
    return { authorized: true, user: result.user }
  } catch (error) {
    console.error('[ROUTER-STATS] 권한 확인 오류:', error)
    return { authorized: false, user: null }
  }
}

// GET: 라우터 재고 통계
export const GET = withApiHandler(
  async (request: NextRequest) => {
    try {
      const { authorized, user } = await checkUserPermission(request)
      if (!authorized || !user) {
        return createErrorResponse('인증이 필요합니다', 401)
      }

      // 전체 재고 수
      const { count: totalInventory } = await supabaseAdmin
        .from('router_inventory')
        .select('*', { count: 'exact', head: true })
        .eq('is_deleted', false)

      // 가용 재고 수 (in_stock 상태)
      const { count: availableStock } = await supabaseAdmin
        .from('router_inventory')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'in_stock')
        .eq('is_deleted', false)

      // 할당된 라우터 수
      const { count: assignedCount } = await supabaseAdmin
        .from('router_inventory')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'assigned')
        .eq('is_deleted', false)

      // 최근 7일 출고 수
      const sevenDaysAgo = new Date()
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
      const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0]

      const { count: recentShipments } = await supabaseAdmin
        .from('router_inventory')
        .select('*', { count: 'exact', head: true })
        .gte('shipped_date', sevenDaysAgoStr)
        .eq('is_deleted', false)

      // 재고 부족 경고 (가용 재고 10개 미만)
      const lowStockAlert = (availableStock || 0) < 10

      // 통계 데이터 구성
      const statistics: RouterStatistics = {
        total_inventory: totalInventory || 0,
        available_stock: availableStock || 0,
        assigned_count: assignedCount || 0,
        recent_shipments: recentShipments || 0,
        low_stock_alert: lowStockAlert
      }

      return createSuccessResponse(statistics)
    } catch (error) {
      console.error('[ROUTER-STATS] API 오류:', error)
      return createErrorResponse('서버 내부 오류가 발생했습니다', 500)
    }
  },
  { logLevel: 'debug' }
)
