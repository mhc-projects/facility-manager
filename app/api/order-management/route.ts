// app/api/order-management/route.ts
// 발주 관리 API - 목록 조회

import { NextRequest } from 'next/server'
import {
  withApiHandler,
  createSuccessResponse,
  createErrorResponse
} from '@/lib/api-utils'
import { queryAll, queryOne } from '@/lib/supabase-direct'
import { verifyTokenHybrid } from '@/lib/secure-jwt'
import type {
  OrderListItem,
  OrderListResponse,
  OrderListFilter,
  Manufacturer
} from '@/types/order-management'
import { MANUFACTURER_WORKFLOWS } from '@/types/order-management'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// 한글 제조사명 → 영문 키 매핑
const MANUFACTURER_MAP: Record<string, Manufacturer> = {
  '에코센스': 'ecosense',
  '가이아씨앤에스': 'gaia_cns',
  '크린어스': 'cleanearth',
  '이브이에스': 'evs',
  'EVS': 'evs'
}

// 영문 키 → 한글 제조사명 역매핑
const MANUFACTURER_REVERSE_MAP: Record<Manufacturer, string> = {
  'ecosense': '에코센스',
  'gaia_cns': '가이아씨앤에스',
  'cleanearth': '크린어스',
  'evs': '이브이에스'
}

// 사용자 인증
async function checkUserPermission(request: NextRequest) {
  console.log('🔍 [ORDER-AUTH] 인증 시작')

  const authHeader = request.headers.get('authorization')
  console.log('🔍 [ORDER-AUTH] Authorization 헤더:', authHeader ? 'exists' : 'missing')

  let token: string | null = null

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.replace('Bearer ', '')
    console.log('🔍 [ORDER-AUTH] Bearer 토큰 추출 완료')
  } else {
    const cookieToken = request.cookies.get('auth_token')?.value
    console.log('🔍 [ORDER-AUTH] 쿠키 토큰:', cookieToken ? 'exists' : 'missing')
    if (cookieToken) token = cookieToken
  }

  if (!token) {
    console.log('❌ [ORDER-AUTH] 토큰 없음 - 401 반환')
    return { authorized: false, user: null }
  }

  console.log('🔍 [ORDER-AUTH] verifyTokenHybrid 호출 시작')
  try {
    const result = await verifyTokenHybrid(token)
    console.log('🔍 [ORDER-AUTH] verifyTokenHybrid 결과:', {
      hasUser: !!result.user,
      userName: result.user?.name,
      userId: result.user?.id
    })

    if (!result.user) {
      console.log('❌ [ORDER-AUTH] 사용자 정보 없음 - 401 반환')
      return { authorized: false, user: null }
    }

    console.log('✅ [ORDER-AUTH] 인증 성공:', result.user.name)
    return { authorized: true, user: result.user }
  } catch (error) {
    console.error('❌ [ORDER-AUTH] 권한 확인 오류:', error)
    return { authorized: false, user: null }
  }
}

// GET: 발주 대상 사업장 목록 조회
export const GET = withApiHandler(
  async (request: NextRequest) => {
    try {
      const { authorized, user } = await checkUserPermission(request)
      if (!authorized || !user) {
        return createErrorResponse('인증이 필요합니다', 401)
      }

      const { searchParams } = new URL(request.url)
      const search = searchParams.get('search') || ''
      const manufacturer = searchParams.get('manufacturer') || 'all'
      const status = searchParams.get('status') || 'all'
      const sort = searchParams.get('sort') || 'latest'
      const page = parseInt(searchParams.get('page') || '1')
      const limit = parseInt(searchParams.get('limit') || '7')

      console.log('[ORDER-MANAGEMENT] 목록 조회:', {
        user: user.name,
        search,
        manufacturer,
        status,
        page,
        limit
      })

      let orders: any[] = []
      let orderError: any = null

      // 1. 상태에 따라 다른 쿼리 실행
      if (status === 'in_progress') {
        // 발주 필요: facility_tasks에서 제품 발주 단계인 사업장 - Direct PostgreSQL
        // self_product_order (자비), subsidy_product_order (보조금), product_order (레거시)
        const tasks = await queryAll(
          `SELECT * FROM facility_tasks
           WHERE status IN ($1, $2, $3) AND is_deleted = $4 AND is_active = $5`,
          ['self_product_order', 'subsidy_product_order', 'product_order', false, true]
        )
        const taskErr = null

        if (taskErr) {
          orderError = taskErr
        } else if (tasks && tasks.length > 0) {
          console.log('[ORDER-MANAGEMENT] facility_tasks 조회 결과:', {
            totalTasks: tasks.length,
            taskIds: tasks.map(t => t.id),
            businessIds: tasks.map(t => ({ taskId: t.id, businessId: t.business_id })),
            assigneeData: tasks.map(t => ({
              businessName: t.business_name,
              assignee: t.assignee,
              assignees: t.assignees
            })),
            firstTaskAllFields: tasks.length > 0 ? tasks[0] : null,
            firstTaskKeys: tasks.length > 0 ? Object.keys(tasks[0]) : []
          })

          // business_id로 business_info 조회 (null 값 필터링)
          const businessIds = tasks
            .map(t => t.business_id)
            .filter(id => id !== null && id !== undefined)

          console.log('[ORDER-MANAGEMENT] 필터링 후 business_ids:', businessIds)

          // business_id가 없는 tasks도 business_name으로 조회 시도
          const tasksWithoutId = tasks.filter(t => !t.business_id && t.business_name)
          const businessNames = tasksWithoutId.map(t => t.business_name)

          let businesses: any[] = []
          let bizErr: any = null

          // ✅ 쿼리 통합: business_id와 business_name 조회를 하나의 쿼리로 통합 - Direct PostgreSQL
          if (businessIds.length > 0 || businessNames.length > 0) {
            const conditions: string[] = ['is_deleted = $1']
            const params: any[] = [false]
            let paramIndex = 2

            // OR 조건으로 business_id와 business_name 동시 조회
            const orConditions: string[] = []
            if (businessIds.length > 0) {
              const placeholders = businessIds.map((_, i) => `$${paramIndex + i}`).join(', ')
              orConditions.push(`id IN (${placeholders})`)
              params.push(...businessIds)
              paramIndex += businessIds.length
            }
            if (businessNames.length > 0) {
              const placeholders = businessNames.map((_, i) => `$${paramIndex + i}`).join(', ')
              orConditions.push(`business_name IN (${placeholders})`)
              params.push(...businessNames)
              paramIndex += businessNames.length
            }

            if (orConditions.length > 0) {
              conditions.push(`(${orConditions.join(' OR ')})`)
            }

            const businessData = await queryAll(
              `SELECT id, business_name, address, manufacturer, updated_at, order_date
               FROM business_info
               WHERE ${conditions.join(' AND ')}`,
              params
            )
            const queryErr = null

            if (queryErr) {
              bizErr = queryErr
              console.error('[ORDER-MANAGEMENT] business_info 통합 조회 오류:', queryErr)
            } else {
              businesses = businessData || []
              console.log('[ORDER-MANAGEMENT] business_info 통합 조회 성공:', {
                requestedIds: businessIds.length,
                requestedNames: businessNames.length,
                foundBusinesses: businesses.length,
                foundIds: businesses.map(b => b.id)
              })
            }
          }

          if (bizErr) {
            orderError = bizErr
          } else {
            // business_info를 Map으로 변환 (id 기반, name 기반 모두 지원)
            const businessMap = new Map(
              businesses.map(b => [b.id, b])
            )
            const businessNameMap = new Map(
              businesses.map(b => [b.business_name, b])
            )

            // order_management 데이터 조회 (진행률 계산용) - Direct PostgreSQL
            const businessIdsForOrder = businessIds.filter(id => id !== null && id !== undefined)
            let orderManagementData: any[] = []

            if (businessIdsForOrder.length > 0) {
              const placeholders = businessIdsForOrder.map((_, i) => `$${i + 1}`).join(', ')
              const omData = await queryAll(
                `SELECT * FROM order_management
                 WHERE business_id IN (${placeholders})`,
                businessIdsForOrder
              )

              if (!omData) {
                console.error('[ORDER-MANAGEMENT] order_management 조회 오류')
              } else {
                orderManagementData = omData || []
              }
            }

            // order_management를 Map으로 변환
            const orderManagementMap = new Map(
              orderManagementData.map(om => [om.business_id, om])
            )

            // facility_tasks와 business_info 결합
            orders = tasks
              .map((task: any) => {
                // business_id로 먼저 조회, 없으면 business_name으로 조회
                let bi = task.business_id ? businessMap.get(task.business_id) : null
                if (!bi && task.business_name) {
                  bi = businessNameMap.get(task.business_name)
                  if (bi) {
                    console.log('[ORDER-MANAGEMENT] business_name으로 매칭 성공:', {
                      taskId: task.id,
                      businessName: task.business_name,
                      matchedBusinessId: bi.id
                    })
                  }
                }

                if (!bi) {
                  console.warn('[ORDER-MANAGEMENT] business_info를 찾을 수 없음 - facility_tasks 데이터 사용:', {
                    taskId: task.id,
                    businessId: task.business_id,
                    businessName: task.business_name
                  })
                  // business_info를 찾지 못해도 facility_tasks 데이터로 표시
                  return {
                    id: task.id,
                    business_id: task.business_id,
                    business_name: task.business_name || '(사업장명 없음)',
                    address: null,
                    manufacturer: null,
                    status: 'in_progress',
                    progress_percentage: 0,
                    last_updated: task.updated_at,
                    steps_completed: 0,
                    steps_total: 3,
                    assignee: task.assignee,
                    assignees: task.assignees || []
                  }
                }

                // 사업장명 검색 필터
                if (search && !bi.business_name?.toLowerCase().includes(search.toLowerCase())) {
                  return null
                }

                // 제조사 한글 → 영문 변환
                const trimmedManufacturer = bi.manufacturer?.trim() || ''
                const manufacturerKey = MANUFACTURER_MAP[trimmedManufacturer] || null

                // 제조사 필터
                if (manufacturer !== 'all' && manufacturerKey !== manufacturer) {
                  return null
                }

                // order_management 데이터로 진행률 계산
                const orderData = orderManagementMap.get(bi.id)
                const workflow = manufacturerKey ? MANUFACTURER_WORKFLOWS[manufacturerKey] : null
                let stepsCompleted = 0
                let stepsTotal = workflow?.total_steps || 3
                let progressPercentage = 0

                if (orderData && workflow) {
                  // 완료된 단계 계산
                  stepsCompleted = workflow.steps.filter(
                    (step) => orderData[step.field] != null
                  ).length
                  progressPercentage = Math.round((stepsCompleted / stepsTotal) * 100)
                }

                return {
                  id: task.id,
                  business_id: bi.id,
                  business_name: bi.business_name,
                  address: bi.address,
                  manufacturer: manufacturerKey,
                  status: 'in_progress',
                  progress_percentage: progressPercentage,
                  last_updated: task.updated_at || bi.updated_at || new Date().toISOString(),
                  steps_completed: stepsCompleted,
                  steps_total: stepsTotal,
                  assignee: task.assignee,
                  assignees: task.assignees || []
                }
              })
              .filter((o: any) => o !== null)

            console.log('[ORDER-MANAGEMENT] 최종 필터링 결과:', {
              totalOrders: orders.length,
              orderBusinessNames: orders.map((o: any) => o.business_name)
            })
          }
        }
      } else if (status === 'not_started') {
        // 발주 진행 전: business_info에서 order_date가 NULL인 사업장 - Direct PostgreSQL
        const conditions: string[] = ['order_date IS NULL', 'is_deleted = $1']
        const params: any[] = [false]
        let paramIndex = 2

        // 사업장명 검색
        if (search) {
          conditions.push(`business_name ILIKE $${paramIndex}`)
          params.push(`%${search}%`)
          paramIndex++
        }

        // 제조사 필터 (영문 키 → 한글 변환)
        if (manufacturer !== 'all') {
          const manufacturerKorean = MANUFACTURER_REVERSE_MAP[manufacturer as Manufacturer]
          if (manufacturerKorean) {
            conditions.push(`manufacturer = $${paramIndex}`)
            params.push(manufacturerKorean)
            paramIndex++
          }
        }

        const businesses = await queryAll(
          `SELECT id, business_name, address, manufacturer, updated_at, order_date
           FROM business_info
           WHERE ${conditions.join(' AND ')}`,
          params
        )
        const bizErr = null

        if (bizErr) {
          orderError = bizErr
        } else if (businesses) {
          // business_info 데이터를 order 형식으로 변환
          orders = businesses.map((bi: any) => {
            const trimmedManufacturer = bi.manufacturer?.trim() || ''
            const manufacturerKey = MANUFACTURER_MAP[trimmedManufacturer] || null
            return {
              id: bi.id,
              business_id: bi.id,
              business_name: bi.business_name,
              address: bi.address,
              manufacturer: manufacturerKey,
              status: 'not_started',
              progress_percentage: 0,
              last_updated: bi.updated_at || new Date().toISOString(),
              steps_completed: 0,
              steps_total: manufacturerKey === 'ecosense' ? 2 : 3
            }
          })
        }
      } else if (status === 'completed') {
        // 발주 완료: business_info에서 order_date가 있는 사업장 - Direct PostgreSQL
        const conditions: string[] = ['order_date IS NOT NULL', 'is_deleted = $1']
        const params: any[] = [false]
        let paramIndex = 2

        // 사업장명 검색
        if (search) {
          conditions.push(`business_name ILIKE $${paramIndex}`)
          params.push(`%${search}%`)
          paramIndex++
        }

        // 제조사 필터 (영문 키 → 한글 변환)
        if (manufacturer !== 'all') {
          const manufacturerKorean = MANUFACTURER_REVERSE_MAP[manufacturer as Manufacturer]
          if (manufacturerKorean) {
            conditions.push(`manufacturer = $${paramIndex}`)
            params.push(manufacturerKorean)
            paramIndex++
          }
        }

        const businesses = await queryAll(
          `SELECT id, business_name, address, manufacturer, updated_at, order_date
           FROM business_info
           WHERE ${conditions.join(' AND ')}`,
          params
        )
        const bizErr = null

        if (bizErr) {
          orderError = bizErr
        } else if (businesses) {
          // business_info 데이터를 order 형식으로 변환
          orders = businesses.map((bi: any) => {
            const trimmedManufacturer = bi.manufacturer?.trim() || ''
            const manufacturerKey = MANUFACTURER_MAP[trimmedManufacturer] || null
            return {
              id: bi.id,
              business_id: bi.id,
              business_name: bi.business_name,
              address: bi.address,
              manufacturer: manufacturerKey,
              status: 'completed',
              progress_percentage: 100,
              last_updated: bi.updated_at || new Date().toISOString(),
              steps_completed: manufacturerKey === 'ecosense' ? 2 : 3,
              steps_total: manufacturerKey === 'ecosense' ? 2 : 3
            }
          })
        }
      } else {
        // 'all' 상태: 모든 사업장 조회 - Direct PostgreSQL
        const conditions: string[] = ['is_deleted = $1']
        const params: any[] = [false]
        let paramIndex = 2

        if (search) {
          conditions.push(`business_name ILIKE $${paramIndex}`)
          params.push(`%${search}%`)
          paramIndex++
        }

        // 제조사 필터 (영문 키 → 한글 변환)
        if (manufacturer !== 'all') {
          const manufacturerKorean = MANUFACTURER_REVERSE_MAP[manufacturer as Manufacturer]
          if (manufacturerKorean) {
            conditions.push(`manufacturer = $${paramIndex}`)
            params.push(manufacturerKorean)
            paramIndex++
          }
        }

        const businesses = await queryAll(
          `SELECT id, business_name, address, manufacturer, updated_at, order_date
           FROM business_info
           WHERE ${conditions.join(' AND ')}`,
          params
        )
        const bizErr = null

        if (bizErr) {
          orderError = bizErr
        } else if (businesses) {
          orders = businesses.map((bi: any) => {
            const hasOrderDate = !!bi.order_date
            const trimmedManufacturer = bi.manufacturer?.trim() || ''
            const manufacturerKey = MANUFACTURER_MAP[trimmedManufacturer] || null
            return {
              id: bi.id,
              business_id: bi.id,
              business_name: bi.business_name,
              address: bi.address,
              manufacturer: manufacturerKey,
              status: hasOrderDate ? 'completed' : 'in_progress',
              progress_percentage: hasOrderDate ? 100 : 0,
              last_updated: bi.updated_at || new Date().toISOString(),
              steps_completed: hasOrderDate ? (manufacturerKey === 'ecosense' ? 2 : 3) : 0,
              steps_total: manufacturerKey === 'ecosense' ? 2 : 3
            }
          })
        }
      }

      if (orderError) {
        console.error('[ORDER-MANAGEMENT] 발주 정보 조회 오류:', {
          message: orderError.message,
          details: orderError.details,
          hint: orderError.hint,
          code: orderError.code,
          full: orderError
        })
        return createErrorResponse('발주 정보 조회 중 오류가 발생했습니다', 500)
      }

      if (!orders || orders.length === 0) {
        return createSuccessResponse({
          orders: [],
          pagination: { total: 0, page: 1, limit, total_pages: 0 },
          summary: {
            total_orders: 0,
            in_progress: 0,
            completed: 0,
            by_manufacturer: { ecosense: 0, gaia_cns: 0, cleanearth: 0, evs: 0 }
          }
        })
      }

      // 2. 데이터 매핑
      let orderList: OrderListItem[] = orders.map((order: any) => {
        return {
          id: order.id || '',
          business_id: order.business_id,
          business_name: order.business_name,
          address: order.address,
          manufacturer: order.manufacturer,
          status: order.status || 'in_progress',
          progress_percentage: order.progress_percentage || 0,
          last_updated: order.updated_at,
          steps_completed: order.steps_completed || 0,
          steps_total: order.steps_total || 2,
          latest_step: null,
          latest_step_date: null,
          assignee: order.assignee,
          assignees: order.assignees
        }
      })

      // 3. 정렬
      if (sort === 'name') {
        orderList.sort((a, b) =>
          a.business_name.localeCompare(b.business_name, 'ko')
        )
      } else if (sort === 'updated') {
        orderList.sort(
          (a, b) =>
            new Date(b.last_updated).getTime() -
            new Date(a.last_updated).getTime()
        )
      } else {
        // latest (기본)
        orderList.sort(
          (a, b) =>
            new Date(b.last_updated).getTime() -
            new Date(a.last_updated).getTime()
        )
      }

      // 6. 페이지네이션
      const total = orderList.length
      const totalPages = Math.ceil(total / limit)
      const startIndex = (page - 1) * limit
      const paginatedOrders = orderList.slice(startIndex, startIndex + limit)

      // 7. 통계 계산 (전체 데이터 기준) - Direct PostgreSQL
      // 발주 필요: facility_tasks에서 제품 발주 단계 카운트 (self_product_order, subsidy_product_order, product_order 레거시)
      const inProgressResult = await queryOne(
        `SELECT COUNT(*) as count FROM facility_tasks
         WHERE status IN ($1, $2, $3) AND is_deleted = $4 AND is_active = $5`,
        ['self_product_order', 'subsidy_product_order', 'product_order', false, true]
      )
      const inProgressCount = parseInt(inProgressResult?.count || '0')

      // 발주 진행 전: business_info.order_date가 NULL인 사업장 카운트
      const notStartedResult = await queryOne(
        `SELECT COUNT(*) as count FROM business_info
         WHERE order_date IS NULL AND is_deleted = $1`,
        [false]
      )
      const notStartedCount = parseInt(notStartedResult?.count || '0')

      // 발주 완료: business_info.order_date가 있는 사업장 카운트
      const completedResult = await queryOne(
        `SELECT COUNT(*) as count FROM business_info
         WHERE order_date IS NOT NULL AND is_deleted = $1`,
        [false]
      )
      const completedCount = parseInt(completedResult?.count || '0')

      const summary = {
        total_orders: (inProgressCount || 0) + (notStartedCount || 0) + (completedCount || 0),
        in_progress: inProgressCount || 0,
        not_started: notStartedCount || 0,
        completed: completedCount || 0,
        by_manufacturer: {
          ecosense: orderList.filter((o) => o.manufacturer === 'ecosense')
            .length,
          gaia_cns: orderList.filter((o) => o.manufacturer === 'gaia_cns')
            .length,
          cleanearth: orderList.filter((o) => o.manufacturer === 'cleanearth')
            .length,
          evs: orderList.filter((o) => o.manufacturer === 'evs').length
        }
      }

      return createSuccessResponse({
        orders: paginatedOrders,
        pagination: {
          total,
          page,
          limit,
          total_pages: totalPages
        },
        summary
      })
    } catch (error) {
      console.error('[ORDER-MANAGEMENT] API 오류:', error)
      return createErrorResponse('서버 내부 오류가 발생했습니다', 500)
    }
  },
  { logLevel: 'debug' }
)
