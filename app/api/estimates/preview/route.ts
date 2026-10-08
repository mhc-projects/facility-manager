// app/api/estimates/preview/route.ts
// 견적서 미리보기 데이터 생성 API

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

// 측정기기 필드 매핑 (견적서 생성 API와 동일)
const EQUIPMENT_FIELDS: Record<string, string> = {
  ph_meter: 'pH미터',
  differential_pressure_meter: '차압계',
  temperature_meter: '온도계',
  discharge_current_meter: '배출전류계',
  fan_current_meter: '송풍전류계',
  pump_current_meter: '펌프전류계',
  gateway: 'G/W(1,2CH)',
  vpn_wired: 'VPN(유선)',
  vpn_wireless: 'VPN(무선)'
}

interface EstimateItem {
  no: number
  name: string
  spec: string
  quantity: number
  unit_price: number
  supply_amount: number
  vat_amount: number
  note: string
}

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
    console.error('[ESTIMATE-PREVIEW] 권한 확인 오류:', error)
    return { authorized: false, user: null }
  }
}

// GET: 견적서 미리보기 데이터 생성
export const GET = withApiHandler(async (request: NextRequest) => {
  try {
    const { authorized, user } = await checkUserPermission(request)
    if (!authorized || !user) {
      return createErrorResponse('인증이 필요합니다', 401)
    }

    const { searchParams } = new URL(request.url)
    const businessId = searchParams.get('business_id')

    if (!businessId) {
      return createErrorResponse('사업장 ID가 필요합니다', 400)
    }

    console.log('[ESTIMATE-PREVIEW] 미리보기 데이터 생성:', {
      user: user.name,
      businessId
    })

    // 1. 사업장 정보 조회
    const { data: business, error: businessError } = await supabaseAdmin
      .from('business_info')
      .select('*')
      .eq('id', businessId)
      .single()

    if (businessError || !business) {
      console.error('[ESTIMATE-PREVIEW] 사업장 조회 오류:', businessError)
      return createErrorResponse('사업장 정보를 찾을 수 없습니다', 404)
    }

    // 2. 활성 템플릿 조회
    const { data: template, error: templateError } = await supabaseAdmin
      .from('estimate_templates')
      .select('*')
      .eq('is_active', true)
      .single()

    if (templateError || !template) {
      console.error('[ESTIMATE-PREVIEW] 템플릿 조회 오류:', templateError)
      return createErrorResponse('활성 템플릿을 찾을 수 없습니다', 404)
    }

    // 3. 측정기기 항목 추출 및 가격 조회
    const estimateItems: EstimateItem[] = []
    let itemNo = 1

    for (const [fieldName, equipmentName] of Object.entries(EQUIPMENT_FIELDS)) {
      const quantity = business[fieldName] || 0

      if (quantity > 0) {
        // 환경부 고시가 조회
        const { data: pricing } = await supabaseAdmin
          .from('government_pricing')
          .select('official_price')
          .eq('equipment_type', fieldName)
          .eq('is_active', true)
          .order('effective_from', { ascending: false })
          .limit(1)
          .maybeSingle()

        const unitPrice = pricing?.official_price || 0
        const supplyAmount = unitPrice * quantity
        const vatAmount = Math.round(supplyAmount * 0.1)

        estimateItems.push({
          no: itemNo++,
          name: equipmentName,
          spec: 'EA',
          quantity,
          unit_price: unitPrice,
          supply_amount: supplyAmount,
          vat_amount: vatAmount,
          note: '보조금 사업'
        })
      }
    }

    // 4. 추가공사비 항목
    if (business.additional_cost && business.additional_cost > 0) {
      const supplyAmount = business.additional_cost
      const vatAmount = Math.round(supplyAmount * 0.1)

      estimateItems.push({
        no: itemNo++,
        name: '추가공사비',
        spec: 'EA',
        quantity: 1,
        unit_price: business.additional_cost,
        supply_amount: supplyAmount,
        vat_amount: vatAmount,
        note: '자부담'
      })
    }

    // 5. 협의사항 항목
    if (business.negotiation) {
      estimateItems.push({
        no: itemNo++,
        name: business.negotiation,
        spec: 'EA',
        quantity: 1,
        unit_price: 0,
        supply_amount: 0,
        vat_amount: 0,
        note: '협의'
      })
    }

    // 6. 합계 계산
    const subtotal = estimateItems.reduce((sum, item) => sum + item.supply_amount, 0)
    const vatTotal = estimateItems.reduce((sum, item) => sum + item.vat_amount, 0)
    const total = subtotal + vatTotal

    // 7. 대기필증 정보 조회
    const { data: airPermitData } = await supabaseAdmin
      .from('air_permit_info')
      .select('*')
      .eq('business_id', businessId)
      .eq('is_deleted', false)
      .maybeSingle()

    let air_permit = null

    if (airPermitData) {
      console.log('[ESTIMATE-PREVIEW] 대기필증 정보 조회 성공:', airPermitData.id)

      // 배출구 정보 조회
      const { data: outletsData } = await supabaseAdmin
        .from('discharge_outlets')
        .select('*')
        .eq('air_permit_id', airPermitData.id)
        .order('outlet_number', { ascending: true })

      // 배출시설과 방지시설 정보 수집
      const emission_facilities = []
      const prevention_facilities = []

      if (outletsData && outletsData.length > 0) {
        for (const outlet of outletsData) {
          // 배출시설 조회
          const { data: dischargeFacilities } = await supabaseAdmin
            .from('discharge_facilities')
            .select('*')
            .eq('outlet_id', outlet.id)
            .order('facility_number', { ascending: true })

          // 방지시설 조회
          const { data: preventionFacilities } = await supabaseAdmin
            .from('prevention_facilities')
            .select('*')
            .eq('outlet_id', outlet.id)
            .order('facility_number', { ascending: true })

          // 배출시설 추가
          if (dischargeFacilities && dischargeFacilities.length > 0) {
            dischargeFacilities.forEach((f) => {
              emission_facilities.push({
                facility_number: f.facility_number || 0,
                name: f.facility_name || '',
                capacity: f.capacity || '',
                quantity: f.quantity || 1,
                green_link_code: f.green_link_code || '',
                measuring_devices: f.additional_info?.measuring_devices || []
              })
            })
          }

          // 방지시설 추가
          if (preventionFacilities && preventionFacilities.length > 0) {
            preventionFacilities.forEach((f) => {
              prevention_facilities.push({
                facility_number: f.facility_number || 0,
                name: f.facility_name || '',
                capacity: f.capacity || '',
                quantity: f.quantity || 1,
                green_link_code: f.green_link_code || '',
                measuring_devices: f.additional_info?.measuring_devices || []
              })
            })
          }
        }
      }

      air_permit = {
        business_type: airPermitData.business_type || '',
        category: airPermitData.additional_info?.category || '',
        first_report_date: airPermitData.first_report_date || '',
        operation_start_date: airPermitData.operation_start_date || '',
        emission_facilities,
        prevention_facilities
      }

      console.log('[ESTIMATE-PREVIEW] 대기필증 데이터 구성:', {
        emissionCount: emission_facilities.length,
        preventionCount: prevention_facilities.length
      })
    } else {
      console.log('[ESTIMATE-PREVIEW] 대기필증 정보 없음')
    }

    // 8. 견적서 번호 생성
    const now = new Date()
    const estimateNumber = `EST-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-PREVIEW`

    const previewData = {
      estimate_number: estimateNumber,
      estimate_date: now.toISOString().split('T')[0],
      business_name: business.business_name,
      customer_name: business.business_name,
      customer_registration_number: business.business_registration_number || '',
      customer_address: business.address || '',
      customer_representative: business.representative_name || '',
      customer_business_type: business.business_type || '',
      customer_business_category: business.business_category || '',
      customer_phone: business.business_contact || '',
      customer_manager: business.manager_name || '',
      customer_manager_contact: business.manager_contact || '',
      supplier_info: {
        company_name: template.supplier_company_name,
        address: template.supplier_address,
        registration_number: template.supplier_registration_number,
        representative: template.supplier_representative,
        business_type: template.supplier_business_type,
        business_category: template.supplier_business_category,
        phone: template.supplier_phone,
        fax: template.supplier_fax
      },
      estimate_items: estimateItems,
      subtotal,
      vat_amount: vatTotal,
      total_amount: total,
      terms_and_conditions: template.terms_and_conditions,
      air_permit
    }

    console.log('[ESTIMATE-PREVIEW] 미리보기 데이터 생성 완료:', {
      estimateNumber,
      itemCount: estimateItems.length,
      totalAmount: total
    })

    return createSuccessResponse(previewData)
  } catch (error) {
    console.error('[ESTIMATE-PREVIEW] API 오류:', error)
    return createErrorResponse('서버 내부 오류가 발생했습니다', 500)
  }
}, { logLevel: 'debug' })
