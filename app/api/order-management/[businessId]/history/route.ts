// app/api/order-management/[businessId]/history/route.ts
// 발주 이력 조회 API

import { NextRequest } from 'next/server'
import {
  withApiHandler,
  createSuccessResponse,
  createErrorResponse
} from '@/lib/api-utils'
import { supabaseAdmin } from '@/lib/supabase'
import { verifyTokenHybrid } from '@/lib/secure-jwt'
import type { OrderHistoryResponse } from '@/types/order-management'

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
    console.error('[ORDER-HISTORY] 권한 확인 오류:', error)
    return { authorized: false, user: null }
  }
}

// GET: 발주 이력 조회
export const GET = withApiHandler(
  async (
    request: NextRequest,
    { params }: { params: { businessId: string } }
  ) => {
    try {
      const { authorized, user } = await checkUserPermission(request)
      if (!authorized || !user) {
        return createErrorResponse('인증이 필요합니다', 401)
      }

      const { businessId } = params

      console.log('[ORDER-HISTORY] 이력 조회:', {
        user: user.name,
        businessId
      })

      // order_management_timeline 뷰에서 조회
      const { data: history, error } = await supabaseAdmin
        .from('order_management_timeline')
        .select('*')
        .eq('business_id', businessId)
        .order('changed_at', { ascending: false })

      if (error) {
        console.error('[ORDER-HISTORY] 조회 오류:', error)
        return createErrorResponse('이력 조회 중 오류가 발생했습니다', 500)
      }

      const responseData: OrderHistoryResponse = {
        success: true,
        data: {
          history: history || [],
          total: history?.length || 0
        }
      }

      return createSuccessResponse(responseData.data)
    } catch (error) {
      console.error('[ORDER-HISTORY] API 오류:', error)
      return createErrorResponse('서버 내부 오류가 발생했습니다', 500)
    }
  },
  { logLevel: 'debug' }
)
