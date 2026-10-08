// app/api/router-inventory/export/route.ts
// 라우터 재고 Excel 내보내기 API

import { NextRequest } from 'next/server'
import {
  withApiHandler,
  createSuccessResponse,
  createErrorResponse
} from '@/lib/api-utils'
import { supabaseAdmin } from '@/lib/supabase'
import { verifyTokenHybrid } from '@/lib/secure-jwt'

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
    console.error('[ROUTER-EXPORT] 권한 확인 오류:', error)
    return { authorized: false, user: null }
  }
}

// GET: 라우터 목록 CSV 내보내기
export const GET = withApiHandler(
  async (request: NextRequest) => {
    try {
      const { authorized, user } = await checkUserPermission(request)
      if (!authorized || !user) {
        return createErrorResponse('인증이 필요합니다', 401)
      }

      console.log('[ROUTER-EXPORT] CSV 내보내기 시작:', { user: user.name })

      // 모든 라우터 데이터 조회
      const { data: routers, error } = await supabaseAdmin
        .from('router_inventory')
        .select('*')
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('[ROUTER-EXPORT] 조회 오류:', error)
        return createErrorResponse('라우터 데이터 조회 중 오류가 발생했습니다', 500)
      }

      // 할당된 사업장 정보 가져오기
      const businessIds = Array.from(new Set(
        routers
          ?.filter((r: any) => r.assigned_business_id)
          .map((r: any) => r.assigned_business_id) || []
      ))

      let businessMap: Record<string, string> = {}

      if (businessIds.length > 0) {
        const { data: businesses } = await supabaseAdmin
          .from('business_info')
          .select('id, business_name')
          .in('id', businessIds)
          .eq('is_deleted', false)

        if (businesses) {
          businessMap = businesses.reduce((acc: Record<string, string>, b: any) => {
            acc[b.id] = b.business_name
            return acc
          }, {})
        }
      }

      // CSV 생성
      const headers = [
        '상품명',
        'S/N',
        'MAC 주소',
        'IMEI',
        '출고일',
        '공급업체',
        '할당 사업장',
        '상태',
        '비고'
      ]

      const rows = routers?.map((r: any) => {
        const assignedBusinessName = r.assigned_business_id
          ? (businessMap[r.assigned_business_id] || '')
          : ''

        return [
          r.product_name || '',
          r.serial_number || '',
          r.mac_address || '',
          r.imei || '',
          r.shipped_date || '',
          r.supplier || '',
          assignedBusinessName,
          r.status || '',
          r.notes || ''
        ]
      }) || []

      // CSV 문자열 생성 (Excel 호환, UTF-8 BOM 포함)
      const csvContent = [
        headers.join('\t'),
        ...rows.map(row => row.join('\t'))
      ].join('\n')

      // UTF-8 BOM 추가 (Excel에서 한글이 깨지지 않도록)
      const bom = '\uFEFF'
      const csvWithBom = bom + csvContent

      console.log('[ROUTER-EXPORT] CSV 생성 완료:', {
        rowCount: rows.length,
        user: user.name
      })

      // CSV 파일로 응답
      return new Response(csvWithBom, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="router_inventory_${new Date().toISOString().split('T')[0]}.csv"`
        }
      })
    } catch (error) {
      console.error('[ROUTER-EXPORT] API 오류:', error)
      return createErrorResponse('서버 내부 오류가 발생했습니다', 500)
    }
  },
  { logLevel: 'debug' }
)
