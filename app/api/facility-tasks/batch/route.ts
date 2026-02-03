// API Route: 사업장 업무 상태 배치 조회 엔드포인트
// 대량의 사업장 업무 상태를 한 번의 요청으로 효율적으로 조회

import { NextRequest, NextResponse } from 'next/server'
import { createSuccessResponse, createErrorResponse } from '@/lib/api-utils'
import { queryAll } from '@/lib/supabase-direct'
import { verifyTokenHybrid } from '@/lib/secure-jwt'
import { TASK_STATUS_KR } from '@/lib/task-status-utils'

// 사용자 권한 확인 헬퍼 함수
async function checkUserPermission(request: NextRequest) {
  const authHeader = request.headers.get('authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { authorized: false, user: null };
  }

  try {
    const token = authHeader.replace('Bearer ', '');
    const result = await verifyTokenHybrid(token);

    if (!result.user) {
      return { authorized: false, user: null };
    }

    return {
      authorized: true,
      user: result.user
    };
  } catch (error) {
    console.error('권한 확인 오류:', error);
    return { authorized: false, user: null };
  }
}

export async function POST(request: NextRequest) {
  try {
    console.log('🚀 [FACILITY-TASKS-BATCH] 배치 조회 요청 시작')

    // 사용자 인증
    const { authorized, user } = await checkUserPermission(request)
    if (!authorized || !user) {
      return createErrorResponse('인증이 필요합니다', 401)
    }

    // 요청 본문에서 사업장 목록 가져오기
    const body = await request.json()
    const { businessNames }: { businessNames: string[] } = body

    if (!businessNames || !Array.isArray(businessNames)) {
      return createErrorResponse('사업장 목록이 필요합니다', 400)
    }

    console.log(`📊 [FACILITY-TASKS-BATCH] ${businessNames.length}개 사업장 배치 조회`)

    // 대용량 처리를 위한 청크 단위 분할 (200개씩)
    const CHUNK_SIZE = 200
    const chunks: string[][] = []
    for (let i = 0; i < businessNames.length; i += CHUNK_SIZE) {
      chunks.push(businessNames.slice(i, i + CHUNK_SIZE))
    }

    console.log(`🔄 [FACILITY-TASKS-BATCH] ${chunks.length}개 청크로 분할하여 처리`)

    // 모든 청크를 병렬로 조회 - Direct PostgreSQL 사용
    const allTasksResults = await Promise.all(
      chunks.map(async (chunk, index) => {
        console.log(`📋 [FACILITY-TASKS-BATCH] 청크 ${index + 1}/${chunks.length} 조회 중 (${chunk.length}개 사업장)`)

        try {
          // 동적 IN 절 파라미터 생성
          const placeholders = chunk.map((_, i) => `$${i + 1}`).join(', ')

          const tasks = await queryAll(
            `SELECT * FROM facility_tasks
             WHERE business_name IN (${placeholders})
               AND is_active = true
               AND is_deleted = false
             ORDER BY updated_at DESC`,
            chunk
          )

          console.log(`✅ [FACILITY-TASKS-BATCH] 청크 ${index + 1} 완료 - ${tasks?.length || 0}개 업무`)
          return tasks || []
        } catch (error) {
          console.error(`🔴 [FACILITY-TASKS-BATCH] 청크 ${index + 1} 조회 오류:`, error)
          throw error
        }
      })
    )

    // 모든 결과를 하나로 합치기
    const allTasks = allTasksResults.flat()

    console.log(`📋 [FACILITY-TASKS-BATCH] ${allTasks?.length || 0}개 업무 조회됨`)

    // 사업장별로 업무 그룹화
    const businessTaskMap: Record<string, any[]> = {}
    businessNames.forEach(name => {
      businessTaskMap[name] = []
    })

    // 조회된 업무를 사업장별로 분류
    allTasks?.forEach(task => {
      const businessName = task.business_name
      if (businessTaskMap[businessName]) {
        businessTaskMap[businessName].push(task)
      }
    })

    // 각 사업장별 상태 계산
    const businessStatuses: Record<string, any> = {}

    for (const businessName of businessNames) {
      const tasks = businessTaskMap[businessName] || []
      const activeTasks = tasks.filter(task => !task.completed_at)

      if (activeTasks.length === 0) {
        const completedTasks = tasks.filter(task => task.completed_at)

        if (completedTasks.length > 0) {
          const latestCompleted = completedTasks.sort((a, b) =>
            new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime()
          )[0]

          businessStatuses[businessName] = {
            statusText: '업무 완료',
            colorClass: 'bg-green-100 text-green-800',
            lastUpdated: latestCompleted.completed_at,
            taskCount: completedTasks.length,
            hasActiveTasks: false
          }
        } else {
          businessStatuses[businessName] = {
            statusText: '업무 미등록',
            colorClass: 'bg-gray-100 text-gray-600',
            lastUpdated: '',
            taskCount: 0,
            hasActiveTasks: false
          }
        }
      } else {
        // 우선순위별 정렬
        const priorityOrder = { high: 3, medium: 2, low: 1 }
        const sortedTasks = activeTasks.sort((a, b) => {
          const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority]
          if (priorityDiff !== 0) return priorityDiff
          return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        })

        const topTask = sortedTasks[0]
        // TASK_STATUS_KR을 사용하여 모든 prefix 상태 지원
        const statusLabel = TASK_STATUS_KR[topTask.status] || topTask.status
        let statusText = activeTasks.length === 1 ? statusLabel : `${statusLabel} 외 ${activeTasks.length - 1}건`

        // 단계별 고유 색상 매핑 (모든 prefix 상태 지원)
        const statusColors: Record<string, string> = {
          // 확인필요 단계 (모든 타입)
          'self_needs_check': 'bg-red-100 text-red-800',
          'subsidy_needs_check': 'bg-red-100 text-red-800',
          'dealer_needs_check': 'bg-red-100 text-red-800',
          'as_needs_check': 'bg-red-100 text-red-800',
          'outsourcing_needs_check': 'bg-red-100 text-red-800',
          'etc_needs_check': 'bg-red-100 text-red-800',

          // 자비 단계 (self_ prefix)
          'self_customer_contact': 'bg-purple-100 text-purple-800',
          'self_site_inspection': 'bg-blue-100 text-blue-800',
          'self_quotation': 'bg-yellow-100 text-yellow-800',
          'self_contract': 'bg-green-100 text-green-800',
          'self_deposit_confirm': 'bg-emerald-100 text-emerald-800',
          'self_product_order': 'bg-indigo-100 text-indigo-800',
          'self_product_shipment': 'bg-cyan-100 text-cyan-800',
          'self_installation_schedule': 'bg-amber-100 text-amber-800',
          'self_installation': 'bg-orange-100 text-orange-800',
          'self_balance_payment': 'bg-teal-100 text-teal-800',
          'self_document_complete': 'bg-sky-100 text-sky-800',

          // 보조금 단계 (subsidy_ prefix)
          'subsidy_customer_contact': 'bg-purple-100 text-purple-800',
          'subsidy_site_inspection': 'bg-blue-100 text-blue-800',
          'subsidy_quotation': 'bg-yellow-100 text-yellow-800',
          'subsidy_contract': 'bg-green-100 text-green-800',
          'subsidy_document_preparation': 'bg-amber-100 text-amber-800',
          'subsidy_application_submit': 'bg-violet-100 text-violet-800',
          'subsidy_approval_pending': 'bg-sky-100 text-sky-800',
          'subsidy_approved': 'bg-lime-100 text-lime-800',
          'subsidy_rejected': 'bg-red-100 text-red-800',
          'subsidy_document_supplement': 'bg-yellow-100 text-yellow-800',
          'subsidy_pre_construction_inspection': 'bg-blue-100 text-blue-800',
          'subsidy_pre_construction_supplement_1st': 'bg-orange-100 text-orange-800',
          'subsidy_pre_construction_supplement_2nd': 'bg-orange-100 text-orange-800',
          'subsidy_construction_report_submit': 'bg-purple-100 text-purple-800',
          'subsidy_product_order': 'bg-indigo-100 text-indigo-800',
          'subsidy_product_shipment': 'bg-cyan-100 text-cyan-800',
          'subsidy_installation_schedule': 'bg-amber-100 text-amber-800',
          'subsidy_installation': 'bg-orange-100 text-orange-800',
          'subsidy_pre_completion_document_submit': 'bg-amber-100 text-amber-800',
          'subsidy_completion_inspection': 'bg-cyan-100 text-cyan-800',
          'subsidy_completion_supplement_1st': 'bg-amber-100 text-amber-800',
          'subsidy_completion_supplement_2nd': 'bg-amber-100 text-amber-800',
          'subsidy_completion_supplement_3rd': 'bg-amber-100 text-amber-800',
          'subsidy_final_document_submit': 'bg-green-100 text-green-800',
          'subsidy_payment': 'bg-emerald-100 text-emerald-800',

          // 대리점 단계 (dealer_ prefix)
          'dealer_order_received': 'bg-blue-100 text-blue-800',
          'dealer_invoice_issued': 'bg-green-100 text-green-800',
          'dealer_payment_confirmed': 'bg-emerald-100 text-emerald-800',
          'dealer_product_ordered': 'bg-indigo-100 text-indigo-800',

          // AS 단계 (as_ prefix)
          'as_customer_contact': 'bg-purple-100 text-purple-800',
          'as_site_inspection': 'bg-blue-100 text-blue-800',
          'as_quotation': 'bg-yellow-100 text-yellow-800',
          'as_contract': 'bg-green-100 text-green-800',
          'as_part_order': 'bg-indigo-100 text-indigo-800',
          'as_completed': 'bg-emerald-100 text-emerald-800',

          // 외주설치 단계 (outsourcing_ prefix)
          'outsourcing_order': 'bg-blue-100 text-blue-800',
          'outsourcing_schedule': 'bg-amber-100 text-amber-800',
          'outsourcing_in_progress': 'bg-orange-100 text-orange-800',
          'outsourcing_completed': 'bg-emerald-100 text-emerald-800',

          // 레거시 호환성 (구버전 status - prefix 없는 상태)
          customer_contact: 'bg-purple-100 text-purple-800',
          site_inspection: 'bg-blue-100 text-blue-800',
          quotation: 'bg-yellow-100 text-yellow-800',
          contract: 'bg-green-100 text-green-800',
          deposit_confirm: 'bg-emerald-100 text-emerald-800',
          product_order: 'bg-indigo-100 text-indigo-800',
          product_shipment: 'bg-cyan-100 text-cyan-800',
          installation_schedule: 'bg-amber-100 text-amber-800',
          installation: 'bg-orange-100 text-orange-800',
          balance_payment: 'bg-teal-100 text-teal-800',
          document_complete: 'bg-sky-100 text-sky-800',
          application_submit: 'bg-violet-100 text-violet-800',
          document_supplement: 'bg-yellow-100 text-yellow-800',
          pre_construction_inspection: 'bg-blue-100 text-blue-800',
          pre_construction_supplement: 'bg-orange-100 text-orange-800',
          pre_construction_supplement_1st: 'bg-orange-100 text-orange-800',
          pre_construction_supplement_2nd: 'bg-orange-100 text-orange-800',
          pre_construction_supplement_3rd: 'bg-orange-100 text-orange-800',
          completion_inspection: 'bg-cyan-100 text-cyan-800',
          completion_supplement: 'bg-amber-100 text-amber-800',
          completion_supplement_1st: 'bg-amber-100 text-amber-800',
          completion_supplement_2nd: 'bg-amber-100 text-amber-800',
          completion_supplement_3rd: 'bg-amber-100 text-amber-800',
          final_document_submit: 'bg-green-100 text-green-800',
          subsidy_payment: 'bg-emerald-100 text-emerald-800',
          etc_status: 'bg-gray-100 text-gray-600'
        }

        businessStatuses[businessName] = {
          statusText,
          colorClass: statusColors[topTask.status] || 'bg-gray-100 text-gray-600',
          lastUpdated: topTask.updated_at,
          taskCount: activeTasks.length,
          hasActiveTasks: true
        }
      }
    }

    console.log(`✅ [FACILITY-TASKS-BATCH] 배치 조회 완료: ${Object.keys(businessStatuses).length}개 사업장`)

    return createSuccessResponse({
      businessStatuses,
      totalBusinesses: businessNames.length,
      totalTasks: allTasks?.length || 0,
      user: {
        id: user.id,
        name: user.name,
        permission_level: user.permission_level
      }
    })

  } catch (error) {
    console.error('❌ [FACILITY-TASKS-BATCH] 오류:', error)
    return createErrorResponse('배치 조회 중 오류가 발생했습니다', 500)
  }
}