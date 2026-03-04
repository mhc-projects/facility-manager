// app/api/document-automation/purchase-order/route.ts
// 발주서 생성 API

import { NextRequest, NextResponse } from 'next/server'
import {
  withApiHandler,
  createSuccessResponse,
  createErrorResponse
} from '@/lib/api-utils'
import { supabaseAdmin } from '@/lib/supabase'
import { verifyTokenHybrid } from '@/lib/secure-jwt'
import { generatePurchaseOrderExcel } from '@/lib/document-generators/excel-generator'
import { generateEcosensePurchaseOrderExcel } from '@/lib/document-generators/excel-generator-ecosense'
import { generateEcosensePurchaseOrderFromTemplate } from '@/lib/document-generators/excel-generator-ecosense-template'
import { generatePurchaseOrderPDF } from '@/lib/document-generators/pdf-generator'
import { generateEcosensePurchaseOrderPDF } from '@/lib/document-generators/pdf-generator-ecosense'
import type {
  CreatePurchaseOrderRequest,
  PurchaseOrderData,
  PurchaseOrderDataEcosense,
  PurchaseOrderItem
} from '@/types/document-automation'

export const dynamic = 'force-dynamic'
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
    console.error('[PURCHASE-ORDER] 권한 확인 오류:', error)
    return { authorized: false, user: null }
  }
}

// GET: 사업장의 발주서 데이터 조회 (자동 채우기용)
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

    console.log('[PURCHASE-ORDER] 데이터 조회:', {
      user: user.name,
      businessId
    })

    // 사업장 정보 조회
    const { data: business, error: businessError } = await supabaseAdmin
      .from('business_info')
      .select('*')
      .eq('id', businessId)
      .eq('is_deleted', false)
      .single()

    if (businessError || !business) {
      console.error('[PURCHASE-ORDER] 사업장 조회 오류:', businessError)
      return createErrorResponse('사업장을 찾을 수 없습니다', 404)
    }

    console.log('[PURCHASE-ORDER] 사업장 데이터:', {
      id: business.id,
      name: business.business_name,
      manufacturer: business.manufacturer,  // ✅ 제조사 확인용 로그 추가
      ph_meter: business.ph_meter,
      differential_pressure_meter: business.differential_pressure_meter,
      temperature_meter: business.temperature_meter,
      gateway_1_2: business.gateway_1_2,
      gateway_3_4: business.gateway_3_4
    })

    // 장비 수량 데이터 변환
    // business_info 테이블의 컬럼을 직접 사용
    // 다중 굴뚝(multiple_stack)은 발주서에 포함하지 않음
    const equipment = {
      ph_sensor: business.ph_meter || 0,
      differential_pressure_meter: business.differential_pressure_meter || 0,
      temperature_meter: business.temperature_meter || 0,
      discharge_ct: business.discharge_current_meter || 0,
      fan_ct: business.fan_current_meter || 0,
      pump_ct: business.pump_current_meter || 0,
      gateway_1_2: business.gateway_1_2 || 0, // ✅ Gateway split fields
      gateway_3_4: business.gateway_3_4 || 0, // ✅ Gateway split fields
      vpn_router_wired: business.vpn_wired || 0,
      vpn_router_wireless: business.vpn_wireless || 0,
      explosion_proof_differential_pressure_meter_domestic:
        business.explosion_proof_differential_pressure_meter_domestic || 0,
      explosion_proof_temperature_meter_domestic:
        business.explosion_proof_temperature_meter_domestic || 0,
      expansion_device: business.expansion_device || 0,
      relay_8ch: business.relay_8ch || 0,
      relay_16ch: business.relay_16ch || 0,
      main_board_replacement: business.main_board_replacement || 0
    }

    console.log('[PURCHASE-ORDER] 변환된 장비 데이터:', equipment)

    // 장비 타입과 한글명 매핑
    const equipmentTypeMapping: Record<string, string> = {
      ph_sensor: 'ph_meter',
      differential_pressure_meter: 'differential_pressure_meter',
      temperature_meter: 'temperature_meter',
      discharge_ct: 'discharge_current_meter',
      fan_ct: 'fan_current_meter',
      pump_ct: 'pump_current_meter',
      gateway_1_2: 'gateway_1_2', // ✅ Gateway split fields
      gateway_3_4: 'gateway_3_4', // ✅ Gateway split fields
      vpn_router_wired: 'vpn_wired',
      vpn_router_wireless: 'vpn_wireless',
      explosion_proof_differential_pressure_meter_domestic:
        'explosion_proof_differential_pressure_meter_domestic',
      explosion_proof_temperature_meter_domestic:
        'explosion_proof_temperature_meter_domestic',
      expansion_device: 'expansion_device',
      relay_8ch: 'relay_8ch',
      relay_16ch: 'relay_16ch',
      main_board_replacement: 'main_board_replacement'
    }

    const equipmentNames: Record<string, string> = {
      ph_sensor: 'PH센서',
      differential_pressure_meter: '차압계',
      temperature_meter: '온도계',
      discharge_ct: '배출전류계',
      fan_ct: '송풍전류계',
      pump_ct: '펌프전류계',
      gateway_1_2: '게이트웨이(1,2)', // ✅ Gateway split fields
      gateway_3_4: '게이트웨이(3,4)', // ✅ Gateway split fields
      vpn_router_wired: 'VPN(유선)',
      vpn_router_wireless: 'VPN(무선)',
      explosion_proof_differential_pressure_meter_domestic: '방폭차압계(국산)',
      explosion_proof_temperature_meter_domestic: '방폭온도계(국산)',
      expansion_device: '확장디바이스',
      relay_8ch: '중계기(8채널)',
      relay_16ch: '중계기(16채널)',
      main_board_replacement: '메인보드교체'
    }

    // manufacturer_pricing 테이블에서 제조사별 원가 조회
    const { data: pricingData, error: pricingError } = await supabaseAdmin
      .from('manufacturer_pricing')
      .select('equipment_type, cost_price')
      .eq('manufacturer', business.manufacturer)
      .is('effective_to', null) // 현재 적용중인 가격만

    if (pricingError) {
      console.error('[PURCHASE-ORDER] 가격 조회 오류:', pricingError)
    }

    // 가격 데이터를 맵으로 변환
    const unitPrices: Record<string, number> = {}
    if (pricingData) {
      pricingData.forEach((price) => {
        unitPrices[price.equipment_type] = Number(price.cost_price)
      })
    }

    console.log('[PURCHASE-ORDER] 조회된 단가:', {
      manufacturer: business.manufacturer,
      pricesCount: Object.keys(unitPrices).length,
      prices: unitPrices
    })

    // 발주서 품목 생성 (수량이 0보다 큰 것만)
    const items: PurchaseOrderItem[] = []
    Object.entries(equipment).forEach(([key, quantity]) => {
      if (quantity > 0) {
        const equipmentType = equipmentTypeMapping[key]
        const unitPrice = unitPrices[equipmentType] || 0
        items.push({
          item_name: equipmentNames[key] || key,
          specification: '표준형',
          quantity,
          unit_price: unitPrice,
          total_price: quantity * unitPrice
        })
      }
    })

    console.log('[PURCHASE-ORDER] 생성된 품목:', {
      itemsCount: items.length,
      items: items.map(i => ({ name: i.item_name, qty: i.quantity, price: i.total_price }))
    })

    // 금액 계산
    const subtotal = items.reduce((sum, item) => sum + item.total_price, 0)
    const vat = Math.round(subtotal * 0.1)
    const grand_total = subtotal + vat

    console.log('[PURCHASE-ORDER] 금액 계산:', { subtotal, vat, grand_total })

    // 로그인한 사용자 정보 조회 (블루온 담당자)
    const { data: userData, error: userError } = await supabaseAdmin
      .from('employees')
      .select('name, email, mobile')
      .eq('id', user.id)
      .single()

    console.log('[PURCHASE-ORDER] 사용자 정보 조회:', {
      userId: user.id,
      userData,
      userError
    })

    // facility_tasks에서 assignee(담당자) 정보 조회 (현재 status 포함 레거시 호환)
    const { data: taskData } = await supabaseAdmin
      .from('facility_tasks')
      .select('assignee')
      .eq('business_id', businessId)
      .in('status', ['self_product_order', 'subsidy_product_order', 'product_order'])
      .eq('is_deleted', false)
      .limit(1)
      .maybeSingle()

    // 대기필증 정보 조회 (is_active=true인 활성 대기필증만 조회)
    const { data: airPermitData, error: airPermitError } = await supabaseAdmin
      .from('air_permit_info')
      .select(`
        *,
        business:business_info!air_permit_info_business_id_fkey(business_name, local_government)
      `)
      .eq('business_id', businessId)
      .eq('is_active', true)
      .eq('is_deleted', false)
      .limit(1)
      .maybeSingle()

    let air_permit = undefined

    if (airPermitData) {
      console.log('[PURCHASE-ORDER] 대기필증 기본 정보 조회 성공:', airPermitData.id)

      // 배출구 정보 조회
      const { data: outletsData } = await supabaseAdmin
        .from('discharge_outlets')
        .select('*')
        .eq('air_permit_id', airPermitData.id)
        .order('outlet_number', { ascending: true })

      console.log('[PURCHASE-ORDER] 배출구 수:', outletsData?.length || 0)

      let outletsWithFacilities = []

      if (outletsData && outletsData.length > 0) {
        outletsWithFacilities = await Promise.all(
          outletsData.map(async (outlet) => {
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

            console.log(`[PURCHASE-ORDER] 배출구 ${outlet.outlet_number}: 배출시설 ${dischargeFacilities?.length || 0}개, 방지시설 ${preventionFacilities?.length || 0}개`)

            return {
              outlet_number: outlet.outlet_number,
              outlet_name: outlet.outlet_name || `배출구 ${outlet.outlet_number}`,
              additional_info: outlet.additional_info || {}, // ✅ 게이트웨이 정보 포함
              discharge_facilities: dischargeFacilities?.map(f => ({
                name: f.facility_name,
                capacity: f.capacity || '',
                quantity: f.quantity || 1,
                green_link_code: f.green_link_code || f.additional_info?.green_link_code || ''
              })) || [],
              prevention_facilities: preventionFacilities?.map(f => ({
                name: f.facility_name,
                capacity: f.capacity || '',
                quantity: f.quantity || 1,
                green_link_code: f.green_link_code || f.additional_info?.green_link_code || ''
              })) || []
            }
          })
        )
      }

      // 배출구가 없어도 기본 정보는 포함
      air_permit = {
        business_type: airPermitData.business_type || '',
        category: airPermitData.additional_info?.category || '',
        facility_number: airPermitData.facility_number || '',
        green_link_code: airPermitData.green_link_code || '',
        first_report_date: airPermitData.first_report_date || '',
        operation_start_date: airPermitData.operation_start_date || '',
        outlets: outletsWithFacilities
      }
    } else {
      console.log('[PURCHASE-ORDER] 대기필증 정보 없음')
      if (airPermitError) {
        console.error('[PURCHASE-ORDER] 대기필증 조회 오류:', airPermitError)
      }
    }

    console.log('[PURCHASE-ORDER] 대기필증 데이터:', air_permit ? '있음' : '없음')

    // 설치 희망날짜: 오늘 +7일
    const today = new Date()
    const installationDate = new Date(today.setDate(today.getDate() + 7))
    const installation_desired_date = installationDate.toISOString().split('T')[0]

    // 발주서 데이터 구성 (에코센스 양식 통일)
    const purchaseOrderData: PurchaseOrderDataEcosense = {
      business_name: business.business_name,
      address: business.address || '',
      manager_name: userData?.name || user.name,
      manager_contact: userData?.mobile || '010-4320-3521',
      manager_email: userData?.email || user.email,
      manufacturer: business.manufacturer,
      vpn_type: business.vpn || 'wired',
      equipment,
      order_date: new Date().toISOString().split('T')[0],
      delivery_address: business.address || '',
      item_details: items,
      subtotal,
      vat,
      grand_total,
      installation_desired_date,
      factory_name: business.business_name,
      factory_address: business.address || '',
      factory_manager: business.manager_name || '',
      factory_contact: business.manager_contact || '',
      factory_email: business.email || '',
      business_management_code: business.business_management_code || '', // 사업장관리코드
      greenlink_id: business.greenlink_id || '',
      greenlink_pw: business.greenlink_pw || '',
      delivery_recipient: undefined,
      delivery_contact: undefined,
      delivery_postal_code: undefined,
      delivery_full_address: business.address || '',
      delivery_address_detail: undefined,
      air_permit
    }

    console.log('[PURCHASE-ORDER] 발주서 데이터 구성 완료:', {
      hasAirPermit: !!air_permit,
      outletsCount: air_permit?.outlets?.length || 0
    })

    return createSuccessResponse({
      business_id: businessId,
      data: purchaseOrderData
    })
  } catch (error) {
    console.error('[PURCHASE-ORDER] API 오류:', error)
    return createErrorResponse('서버 내부 오류가 발생했습니다', 500)
  }
}, { logLevel: 'debug' })

// POST: 발주서 생성 및 저장
export const POST = withApiHandler(async (request: NextRequest) => {
  try {
    const { authorized, user } = await checkUserPermission(request)
    if (!authorized || !user) {
      return createErrorResponse('인증이 필요합니다', 401)
    }

    const body: CreatePurchaseOrderRequest = await request.json()

    console.log('[PURCHASE-ORDER] 발주서 생성 요청:', {
      user: user.name,
      businessId: body.business_id,
      fileFormat: body.file_format
    })

    // 파일 생성
    let fileBuffer: Buffer
    let fileExtension: string
    let mimeType: string

    try {
      if (body.file_format === 'excel') {
        console.log('[PURCHASE-ORDER] Excel 파일 생성 시작 (에코센스 통합 템플릿)')
        fileBuffer = await generateEcosensePurchaseOrderFromTemplate(body.data as PurchaseOrderDataEcosense)
        console.log('[PURCHASE-ORDER] Excel 파일 생성 완료:', fileBuffer.length, 'bytes')
        fileExtension = 'xlsx'
        mimeType =
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      } else if (body.file_format === 'pdf') {
        console.log('[PURCHASE-ORDER] PDF 파일 생성 시작...')
        // 임시로 기존 PDF 생성기 사용 (한글 폰트 문제는 추후 Puppeteer로 해결 예정)
        fileBuffer = await generatePurchaseOrderPDF(body.data as PurchaseOrderDataEcosense)
        console.log('[PURCHASE-ORDER] PDF 파일 생성 완료:', fileBuffer.length, 'bytes')
        fileExtension = 'pdf'
        mimeType = 'application/pdf'
      } else {
        return createErrorResponse('지원하지 않는 파일 형식입니다', 400)
      }
    } catch (fileError) {
      console.error('[PURCHASE-ORDER] 파일 생성 오류:', fileError)
      console.error('[PURCHASE-ORDER] 에러 스택:', (fileError as Error).stack)
      return createErrorResponse(`파일 생성 중 오류가 발생했습니다: ${(fileError as Error).message}`, 500)
    }

    // 파일명 생성 (Supabase Storage는 영문/숫자만 지원)
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    // 스토리지용: business_id와 timestamp만 사용 (한글 제외)
    const fileName = `purchase_order_${body.business_id}_${timestamp}.${fileExtension}`

    // 사용자에게 보여줄 한글 파일명 (다운로드시 사용)
    const displayFileName = `발주서_${body.data.business_name}_${timestamp}.${fileExtension}`

    // Supabase Storage에 업로드
    const filePath = `documents/purchase-orders/${body.business_id}/${fileName}`

    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from('facility-files')
      .upload(filePath, fileBuffer, {
        contentType: mimeType,
        upsert: false
      })

    if (uploadError) {
      console.error('[PURCHASE-ORDER] 파일 업로드 오류:', uploadError)
      return createErrorResponse('파일 업로드 중 오류가 발생했습니다', 500)
    }

    // 공개 URL 생성
    const { data: urlData } = supabaseAdmin.storage
      .from('facility-files')
      .getPublicUrl(filePath)

    // 문서 이력 저장
    const { data: historyData, error: historyError } = await supabaseAdmin
      .from('document_history')
      .insert({
        business_id: body.business_id,
        document_type: 'purchase_order',
        document_name: displayFileName,  // 한글 파일명으로 저장
        document_data: body.data,
        file_path: filePath,
        file_format: body.file_format,
        file_size: fileBuffer.length,
        created_by: user.id
      })
      .select()
      .single()

    if (historyError) {
      console.error('[PURCHASE-ORDER] 이력 저장 오류:', historyError)
      // 파일은 업로드했지만 이력 저장 실패 - 파일 삭제
      await supabaseAdmin.storage.from('facility-files').remove([filePath])
      return createErrorResponse('문서 이력 저장 중 오류가 발생했습니다', 500)
    }

    console.log('[PURCHASE-ORDER] 발주서 생성 완료:', {
      historyId: historyData.id,
      fileName: displayFileName,
      storagePath: fileName,
      fileSize: fileBuffer.length
    })

    return createSuccessResponse({
      history_id: historyData.id,
      document_name: displayFileName,  // 사용자에게 한글 파일명 표시
      file_path: filePath,
      file_url: urlData.publicUrl,
      file_format: body.file_format,
      created_at: historyData.created_at
    })
  } catch (error) {
    console.error('[PURCHASE-ORDER] API 오류:', error)
    console.error('[PURCHASE-ORDER] 에러 상세:', {
      name: (error as Error).name,
      message: (error as Error).message,
      stack: (error as Error).stack
    })
    return createErrorResponse(`서버 내부 오류가 발생했습니다: ${(error as Error).message}`, 500)
  }
}, { logLevel: 'debug' })
