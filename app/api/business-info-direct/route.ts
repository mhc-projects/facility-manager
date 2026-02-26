import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { queryAll, queryOne, query as pgQuery, transaction } from '@/lib/supabase-direct';

// Force dynamic rendering for API routes
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Debug logging control
const DEBUG = process.env.NODE_ENV === 'development';
const log = (...args: any[]) => DEBUG && console.log(...args);
const logError = (...args: any[]) => console.error(...args); // Always log errors

// UTF-8 normalization function
function normalizeUTF8(str: string): string {
  if (!str || typeof str !== 'string') return '';
  return str.normalize('NFC');
}

// Date field normalization function - converts empty strings to null
function normalizeDateField(value: any): string | null {
  if (!value || value === '' || value === 'null' || value === 'undefined') {
    return null;
  }
  return value;
}

// Business data normalization - used by both batch upload and replaceAll
function normalizeBusinessData(business: any, normalizedName: string) {
  return {
    business_name: normalizedName,
    local_government: normalizeUTF8(business.local_government || ''),
    address: normalizeUTF8(business.address || ''),
    representative_name: normalizeUTF8(business.representative_name || ''),
    business_registration_number: normalizeUTF8(business.business_registration_number || ''),
    business_type: normalizeUTF8(business.business_type || ''),
    business_contact: normalizeUTF8(business.business_contact || ''),
    manager_name: normalizeUTF8(business.manager_name || ''),
    manager_contact: normalizeUTF8(business.manager_contact || ''),
    manager_position: normalizeUTF8(business.manager_position || ''),
    fax_number: normalizeUTF8(business.fax_number || ''),
    email: normalizeUTF8(business.email || ''),
    ph_meter: parseInt(business.ph_meter || '0') || 0,
    differential_pressure_meter: parseInt(business.differential_pressure_meter || '0') || 0,
    temperature_meter: parseInt(business.temperature_meter || '0') || 0,
    discharge_current_meter: parseInt(business.discharge_current_meter || '0') || 0,
    fan_current_meter: parseInt(business.fan_current_meter || '0') || 0,
    pump_current_meter: parseInt(business.pump_current_meter || '0') || 0,
    gateway: parseInt(business.gateway || '0') || 0,
    gateway_1_2: parseInt(business.gateway_1_2 || '0') || 0,
    gateway_3_4: parseInt(business.gateway_3_4 || '0') || 0,
    vpn_wired: parseInt(business.vpn_wired || '0') || 0,
    vpn_wireless: parseInt(business.vpn_wireless || '0') || 0,
    multiple_stack: parseInt(business.multiple_stack || '0') || 0,
    explosion_proof_differential_pressure_meter_domestic: parseInt(business.explosion_proof_differential_pressure_meter_domestic || '0') || 0,
    explosion_proof_temperature_meter_domestic: parseInt(business.explosion_proof_temperature_meter_domestic || '0') || 0,
    expansion_device: parseInt(business.expansion_device || '0') || 0,
    relay_8ch: parseInt(business.relay_8ch || '0') || 0,
    relay_16ch: parseInt(business.relay_16ch || '0') || 0,
    main_board_replacement: parseInt(business.main_board_replacement || '0') || 0,
    business_management_code: parseInt(business.business_management_code || '0') || 0,
    department: normalizeUTF8(business.department || ''),
    progress_status: normalizeUTF8(business.progress_status || ''),
    project_year: business.project_year ? parseInt(business.project_year) : null,
    installation_team: normalizeUTF8(business.installation_team || ''),
    business_category: normalizeUTF8(business.business_category || ''),
    manufacturer: business.manufacturer || null,
    sales_office: normalizeUTF8(business.sales_office || ''),
    greenlink_id: normalizeUTF8(business.greenlink_id || ''),
    greenlink_pw: normalizeUTF8(business.greenlink_pw || ''),
    additional_cost: business.additional_cost ? parseInt(business.additional_cost) : null,
    negotiation: normalizeUTF8(business.negotiation || ''),
    order_manager: normalizeUTF8(business.order_manager || ''),
    order_request_date: normalizeDateField(business.order_request_date),
    receipt_date: normalizeDateField(business.receipt_date),
    order_date: normalizeDateField(business.order_date),
    shipment_date: normalizeDateField(business.shipment_date),
    installation_date: normalizeDateField(business.installation_date),
    estimate_survey_manager: normalizeUTF8(business.estimate_survey_manager || ''),
    estimate_survey_date: normalizeDateField(business.estimate_survey_date),
    pre_construction_survey_manager: normalizeUTF8(business.pre_construction_survey_manager || ''),
    pre_construction_survey_date: normalizeDateField(business.pre_construction_survey_date),
    completion_survey_manager: normalizeUTF8(business.completion_survey_manager || ''),
    completion_survey_date: normalizeDateField(business.completion_survey_date),
    invoice_1st_date: normalizeDateField(business.invoice_1st_date),
    invoice_1st_amount: business.invoice_1st_amount ? parseInt(business.invoice_1st_amount) : null,
    payment_1st_date: normalizeDateField(business.payment_1st_date),
    payment_1st_amount: business.payment_1st_amount ? parseInt(business.payment_1st_amount) : null,
    invoice_2nd_date: normalizeDateField(business.invoice_2nd_date),
    invoice_2nd_amount: business.invoice_2nd_amount ? parseInt(business.invoice_2nd_amount) : null,
    payment_2nd_date: normalizeDateField(business.payment_2nd_date),
    payment_2nd_amount: business.payment_2nd_amount ? parseInt(business.payment_2nd_amount) : null,
    invoice_additional_date: normalizeDateField(business.invoice_additional_date),
    payment_additional_date: normalizeDateField(business.payment_additional_date),
    payment_additional_amount: business.payment_additional_amount ? parseInt(business.payment_additional_amount) : null,
    invoice_advance_date: normalizeDateField(business.invoice_advance_date),
    invoice_advance_amount: business.invoice_advance_amount ? parseInt(business.invoice_advance_amount) : null,
    payment_advance_date: normalizeDateField(business.payment_advance_date),
    payment_advance_amount: business.payment_advance_amount ? parseInt(business.payment_advance_amount) : null,
    invoice_balance_date: normalizeDateField(business.invoice_balance_date),
    invoice_balance_amount: business.invoice_balance_amount ? parseInt(business.invoice_balance_amount) : null,
    payment_balance_date: normalizeDateField(business.payment_balance_date),
    payment_balance_amount: business.payment_balance_amount ? parseInt(business.payment_balance_amount) : null,
    construction_report_submitted_at: normalizeDateField(business.construction_report_submitted_at),
    greenlink_confirmation_submitted_at: normalizeDateField(business.greenlink_confirmation_submitted_at),
    attachment_completion_submitted_at: normalizeDateField(business.attachment_completion_submitted_at),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    is_active: true,
    is_deleted: false
  };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const searchQuery = searchParams.get('search') || '';
    const limit = parseInt(searchParams.get('limit') || '5000');
    const id = searchParams.get('id');
    const includeFileStats = searchParams.get('includeFileStats') === 'true';

    log('📊 [BUSINESS-INFO-DIRECT] Direct PostgreSQL 조회 시작 - 검색:', `"${searchQuery}"`, '제한:', limit, 'ID:', id || 'N/A');

    // Build WHERE clause
    const whereClauses: string[] = ['is_deleted = false'];
    const params: any[] = [];
    let paramIndex = 1;

    if (id) {
      whereClauses.push(`id = $${paramIndex++}`);
      params.push(id);
    } else if (searchQuery) {
      whereClauses.push(`(
        business_name ILIKE $${paramIndex} OR
        address ILIKE $${paramIndex} OR
        manager_name ILIKE $${paramIndex}
      )`);
      params.push(`%${searchQuery}%`);
      paramIndex++;
    }

    const whereClause = whereClauses.join(' AND ');

    // ⚡ Direct PostgreSQL query - 필요한 필드만 선택 조회
    const selectFields = `
      id, business_name, address, local_government,
      manager_name, manager_contact, manager_position, business_contact,
      representative_name, business_registration_number,
      manufacturer, sales_office, progress_status, business_category,
      project_year, installation_team, is_active, is_deleted,
      updated_at, created_at, additional_info,
      ph_meter, differential_pressure_meter, temperature_meter,
      discharge_current_meter, fan_current_meter, pump_current_meter,
      gateway, gateway_1_2, gateway_3_4,
      vpn_wired, vpn_wireless,
      explosion_proof_differential_pressure_meter_domestic,
      explosion_proof_temperature_meter_domestic,
      expansion_device, relay_8ch, relay_16ch,
      main_board_replacement, multiple_stack,
      additional_cost, negotiation,
      receivable_risk,
      payment_scheduled_date::text as payment_scheduled_date,
      revenue_source,
      order_date::text as order_date,
      order_manager,
      order_request_date::text as order_request_date,
      receipt_date::text as receipt_date,
      shipment_date::text as shipment_date,
      installation_date::text as installation_date,
      subsidy_approval_date::text as subsidy_approval_date,
      contract_sent_date::text as contract_sent_date,
      construction_report_submitted_at::text as construction_report_submitted_at,
      greenlink_confirmation_submitted_at::text as greenlink_confirmation_submitted_at,
      attachment_completion_submitted_at::text as attachment_completion_submitted_at,
      invoice_1st_date::text as invoice_1st_date,
      invoice_1st_amount,
      payment_1st_date::text as payment_1st_date,
      payment_1st_amount,
      invoice_2nd_date::text as invoice_2nd_date,
      invoice_2nd_amount,
      payment_2nd_date::text as payment_2nd_date,
      payment_2nd_amount,
      invoice_additional_date::text as invoice_additional_date,
      payment_additional_date::text as payment_additional_date,
      payment_additional_amount,
      invoice_advance_date::text as invoice_advance_date,
      invoice_advance_amount,
      payment_advance_date::text as payment_advance_date,
      payment_advance_amount,
      invoice_balance_date::text as invoice_balance_date,
      invoice_balance_amount,
      payment_balance_date::text as payment_balance_date,
      payment_balance_amount,
      estimate_survey_date::text as estimate_survey_date,
      estimate_survey_manager,
      pre_construction_survey_date::text as pre_construction_survey_date,
      pre_construction_survey_manager,
      completion_survey_date::text as completion_survey_date,
      completion_survey_manager
    `;

    const queryText = `
      SELECT ${selectFields}
      FROM business_info
      WHERE ${whereClause}
      ORDER BY updated_at DESC
      LIMIT $${paramIndex}
    `;
    params.push(limit);

    log('🔍 [BUSINESS-INFO-DIRECT] Executing PostgreSQL query with', params.length, 'parameters');
    const businesses = await queryAll(queryText, params);

    log('✅ [BUSINESS-INFO-DIRECT] 조회 완료 -', `${businesses?.length || 0}개 사업장`);

    if (!businesses || businesses.length === 0) {
      log('⚠️ [BUSINESS-INFO-DIRECT] 조회 결과 없음');
    }

    // Include file statistics if requested
    if (includeFileStats && businesses?.length) {
      log('📊 [BUSINESS-INFO-DIRECT] 파일 통계 추가 중...');
      // Add file stats logic here if needed
      log('✅ [BUSINESS-INFO-DIRECT] 파일 통계 추가 완료 - 0개 매칭');
    }

    return NextResponse.json({
      success: true,
      data: businesses || [],
      count: businesses?.length || 0,
      totalCount: businesses?.length || 0,
      requestedLimit: limit
    });

  } catch (error) {
    logError('❌ [BUSINESS-INFO-DIRECT] 조회 실패:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '알 수 없는 오류',
      data: []
    }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { id } = body;

    // updateData가 있으면 사용, 없으면 body 자체를 updateData로 사용 (id 제외)
    let updateData = body.updateData;
    if (!updateData) {
      // updateData 없이 직접 필드가 전달된 경우 (예: {id, survey_fee_adjustment})
      const { id: _, ...restFields } = body;
      updateData = restFields;
    }

    if (!id) {
      return NextResponse.json({
        success: false,
        error: 'ID가 필요합니다'
      }, { status: 400 });
    }

    const business = await queryOne(
      'SELECT * FROM business_info WHERE id = $1',
      [id]
    );

    if (!business) {
      return NextResponse.json({
        success: false,
        error: '사업장을 찾을 수 없습니다'
      }, { status: 404 });
    }

    // Build update object with proper field handling
    const updateObject: any = {};

    // String fields with UTF-8 normalization
    // business_name 변경 시 중복 체크 (자기 자신 제외)
    if (updateData.business_name !== undefined) {
      const normalizedName = normalizeUTF8(updateData.business_name || '').trim();

      // 현재 저장된 이름과 다른 경우에만 중복 체크 및 업데이트
      if (normalizedName !== business.business_name?.trim()) {
        const existingWithSameName = await queryOne(
          'SELECT id FROM business_info WHERE business_name = $1 AND is_deleted = false AND id != $2',
          [normalizedName, id]
        );

        if (existingWithSameName) {
          logError('❌ [BUSINESS-INFO-DIRECT] 중복 사업장명:', normalizedName);
          return NextResponse.json({
            success: false,
            error: `이미 동일한 사업장명이 존재합니다: ${normalizedName}`
          }, { status: 409 });  // Conflict
        }

        // Only update business_name if it actually changed
        updateObject.business_name = normalizedName;
      }
      // If name didn't change, don't include it in updateObject to avoid unique constraint error
    }
    if (updateData.local_government !== undefined) {
      updateObject.local_government = normalizeUTF8(updateData.local_government || '');
    }
    if (updateData.address !== undefined) {
      updateObject.address = normalizeUTF8(updateData.address || '');
    }
    if (updateData.representative_name !== undefined) {
      updateObject.representative_name = normalizeUTF8(updateData.representative_name || '');
    }
    if (updateData.business_registration_number !== undefined) {
      updateObject.business_registration_number = normalizeUTF8(updateData.business_registration_number || '');
    }
    if (updateData.business_type !== undefined) {
      updateObject.business_type = normalizeUTF8(updateData.business_type || '');
    }
    if (updateData.business_contact !== undefined) {
      updateObject.business_contact = normalizeUTF8(updateData.business_contact || '');
    }
    if (updateData.manager_name !== undefined) {
      updateObject.manager_name = normalizeUTF8(updateData.manager_name || '');
    }
    if (updateData.manager_contact !== undefined) {
      updateObject.manager_contact = normalizeUTF8(updateData.manager_contact || '');
    }
    if (updateData.manager_position !== undefined) {
      updateObject.manager_position = normalizeUTF8(updateData.manager_position || '');
    }
    if (updateData.fax_number !== undefined) {
      updateObject.fax_number = normalizeUTF8(updateData.fax_number || '');
    }
    if (updateData.email !== undefined) {
      updateObject.email = normalizeUTF8(updateData.email || '');
    }

    // Measurement device fields - all as integers, null-safe
    if (updateData.ph_meter !== undefined) {
      updateObject.ph_meter = updateData.ph_meter === null ? null : parseInt(updateData.ph_meter) || 0;
    }
    if (updateData.differential_pressure_meter !== undefined) {
      updateObject.differential_pressure_meter = updateData.differential_pressure_meter === null ? null : parseInt(updateData.differential_pressure_meter) || 0;
    }
    if (updateData.temperature_meter !== undefined) {
      updateObject.temperature_meter = updateData.temperature_meter === null ? null : parseInt(updateData.temperature_meter) || 0;
    }
    if (updateData.discharge_current_meter !== undefined) {
      updateObject.discharge_current_meter = updateData.discharge_current_meter === null ? null : parseInt(updateData.discharge_current_meter) || 0;
    }
    if (updateData.fan_current_meter !== undefined) {
      updateObject.fan_current_meter = updateData.fan_current_meter === null ? null : parseInt(updateData.fan_current_meter) || 0;
    }
    if (updateData.pump_current_meter !== undefined) {
      updateObject.pump_current_meter = updateData.pump_current_meter === null ? null : parseInt(updateData.pump_current_meter) || 0;
    }
    if (updateData.gateway !== undefined) {
      updateObject.gateway = updateData.gateway === null ? null : parseInt(updateData.gateway) || 0;
    }
    // 🎯 Gateway split fields (gateway_1_2, gateway_3_4)
    if (updateData.gateway_1_2 !== undefined) {
      updateObject.gateway_1_2 = updateData.gateway_1_2 === null ? null : parseInt(updateData.gateway_1_2) || 0;
    }
    if (updateData.gateway_3_4 !== undefined) {
      updateObject.gateway_3_4 = updateData.gateway_3_4 === null ? null : parseInt(updateData.gateway_3_4) || 0;
    }

    // VPN fields - POST MIGRATION: Direct integer handling (no boolean conversion), null-safe
    if (updateData.vpn_wired !== undefined) {
      updateObject.vpn_wired = updateData.vpn_wired === null ? null : parseInt(updateData.vpn_wired) || 0;
    }
    if (updateData.vpn_wireless !== undefined) {
      updateObject.vpn_wireless = updateData.vpn_wireless === null ? null : parseInt(updateData.vpn_wireless) || 0;
    }
    if (updateData.multiple_stack !== undefined) {
      updateObject.multiple_stack = updateData.multiple_stack === null ? null : parseInt(updateData.multiple_stack) || 0;
    }

    // Additional measurement device fields - null-safe
    if (updateData.explosion_proof_differential_pressure_meter_domestic !== undefined) {
      updateObject.explosion_proof_differential_pressure_meter_domestic = updateData.explosion_proof_differential_pressure_meter_domestic === null ? null : parseInt(updateData.explosion_proof_differential_pressure_meter_domestic) || 0;
    }
    if (updateData.explosion_proof_temperature_meter_domestic !== undefined) {
      updateObject.explosion_proof_temperature_meter_domestic = updateData.explosion_proof_temperature_meter_domestic === null ? null : parseInt(updateData.explosion_proof_temperature_meter_domestic) || 0;
    }
    if (updateData.expansion_device !== undefined) {
      updateObject.expansion_device = updateData.expansion_device === null ? null : parseInt(updateData.expansion_device) || 0;
    }
    if (updateData.relay_8ch !== undefined) {
      updateObject.relay_8ch = updateData.relay_8ch === null ? null : parseInt(updateData.relay_8ch) || 0;
    }
    if (updateData.relay_16ch !== undefined) {
      updateObject.relay_16ch = updateData.relay_16ch === null ? null : parseInt(updateData.relay_16ch) || 0;
    }
    if (updateData.main_board_replacement !== undefined) {
      updateObject.main_board_replacement = updateData.main_board_replacement === null ? null : parseInt(updateData.main_board_replacement) || 0;
    }
    if (updateData.business_management_code !== undefined) {
      updateObject.business_management_code = updateData.business_management_code === null ? null : parseInt(updateData.business_management_code) || 0;
    }

    // Project management fields
    if (updateData.row_number !== undefined) {
      updateObject.row_number = parseInt(updateData.row_number) || null;
    }
    if (updateData.department !== undefined) {
      updateObject.department = normalizeUTF8(updateData.department || '');
    }
    if (updateData.progress_status !== undefined) {
      updateObject.progress_status = normalizeUTF8(updateData.progress_status || '');
    }
    if (updateData.project_year !== undefined) {
      updateObject.project_year = parseInt(updateData.project_year) || null;
    }
    if (updateData.revenue_source !== undefined) {
      updateObject.revenue_source = normalizeUTF8(updateData.revenue_source || '');
    }
    if (updateData.contract_document !== undefined) {
      updateObject.contract_document = normalizeUTF8(updateData.contract_document || '');
    }
    if (updateData.order_request_date !== undefined) {
      updateObject.order_request_date = updateData.order_request_date || null;
    }
    if (updateData.receipt_date !== undefined) {
      updateObject.receipt_date = updateData.receipt_date || null;
    }
    if (updateData.wireless_document !== undefined) {
      updateObject.wireless_document = normalizeUTF8(updateData.wireless_document || '');
    }
    if (updateData.installation_support !== undefined) {
      updateObject.installation_support = normalizeUTF8(updateData.installation_support || '');
    }
    if (updateData.order_manager !== undefined) {
      updateObject.order_manager = normalizeUTF8(updateData.order_manager || '');
    }
    if (updateData.order_date !== undefined) {
      updateObject.order_date = updateData.order_date || null;
    }
    if (updateData.shipment_date !== undefined) {
      updateObject.shipment_date = updateData.shipment_date || null;
    }
    if (updateData.inventory_check !== undefined) {
      updateObject.inventory_check = normalizeUTF8(updateData.inventory_check || '');
    }
    if (updateData.installation_date !== undefined) {
      updateObject.installation_date = updateData.installation_date || null;
    }
    if (updateData.payment_scheduled_date !== undefined) {
      updateObject.payment_scheduled_date = updateData.payment_scheduled_date || null;
    }
    if (updateData.installation_team !== undefined) {
      updateObject.installation_team = normalizeUTF8(updateData.installation_team || '');
    }

    // Business classification and operational fields
    if (updateData.business_category !== undefined) {
      updateObject.business_category = normalizeUTF8(updateData.business_category || '');
    }
    if (updateData.pollutants !== undefined) {
      updateObject.pollutants = normalizeUTF8(updateData.pollutants || '');
    }
    if (updateData.annual_emission_amount !== undefined) {
      updateObject.annual_emission_amount = parseInt(updateData.annual_emission_amount) || null;
    }
    if (updateData.first_report_date !== undefined) {
      updateObject.first_report_date = updateData.first_report_date || null;
    }
    if (updateData.operation_start_date !== undefined) {
      updateObject.operation_start_date = updateData.operation_start_date || null;
    }
    if (updateData.subsidy_approval_date !== undefined) {
      updateObject.subsidy_approval_date = updateData.subsidy_approval_date || null;
    }
    if (updateData.contract_sent_date !== undefined) {
      updateObject.contract_sent_date = updateData.contract_sent_date || null;
    }

    // System and additional fields
    if (updateData.manufacturer !== undefined) {
      updateObject.manufacturer = updateData.manufacturer;
    }
    if (updateData.vpn !== undefined) {
      updateObject.vpn = updateData.vpn;
    }
    if (updateData.greenlink_id !== undefined) {
      updateObject.greenlink_id = normalizeUTF8(updateData.greenlink_id || '');
    }
    if (updateData.greenlink_pw !== undefined) {
      updateObject.greenlink_pw = normalizeUTF8(updateData.greenlink_pw || '');
    }
    if (updateData.sales_office !== undefined) {
      updateObject.sales_office = normalizeUTF8(updateData.sales_office || '');
    }
    if (updateData.expansion_pack !== undefined) {
      updateObject.expansion_pack = parseInt(updateData.expansion_pack) || null;
    }
    if (updateData.other_equipment !== undefined) {
      updateObject.other_equipment = normalizeUTF8(updateData.other_equipment || '');
    }
    if (updateData.additional_cost !== undefined) {
      updateObject.additional_cost = parseInt(updateData.additional_cost) || null;
    }
    if (updateData.installation_extra_cost !== undefined) {
      updateObject.installation_extra_cost = parseInt(updateData.installation_extra_cost) || null;
    }
    if (updateData.survey_fee_adjustment !== undefined) {
      // null, undefined, 빈 문자열이면 null로, 그 외에는 parseInt
      if (updateData.survey_fee_adjustment === null || updateData.survey_fee_adjustment === '' || updateData.survey_fee_adjustment === undefined) {
        updateObject.survey_fee_adjustment = null;
      } else {
        const numValue = parseInt(updateData.survey_fee_adjustment);
        updateObject.survey_fee_adjustment = isNaN(numValue) ? null : numValue;
      }
    }

    // AS 비용 처리 (survey_fee_adjustment와 동일한 패턴)
    if (updateData.as_cost !== undefined) {
      if (updateData.as_cost === null || updateData.as_cost === '' || updateData.as_cost === undefined) {
        updateObject.as_cost = null;
      } else {
        const numValue = parseInt(updateData.as_cost);
        updateObject.as_cost = isNaN(numValue) || numValue < 0 ? 0 : numValue;
      }
    }

    // 커스텀 추가비용 처리 (JSONB 배열)
    if (updateData.custom_additional_costs !== undefined) {
      if (Array.isArray(updateData.custom_additional_costs)) {
        // 배열의 각 항목 검증: name과 amount 필드 확인
        const validatedCosts = updateData.custom_additional_costs
          .filter((item: any) => {
            return item &&
                   typeof item === 'object' &&
                   typeof item.name === 'string' &&
                   item.name.trim() !== '' &&
                   (typeof item.amount === 'number' || typeof item.amount === 'string');
          })
          .map((item: any) => ({
            name: item.name.trim(),
            amount: typeof item.amount === 'number' ? item.amount : parseFloat(item.amount) || 0
          }))
          .filter((item: any) => item.amount >= 0); // 음수 제거

        updateObject.custom_additional_costs = JSON.stringify(validatedCosts);
      } else {
        updateObject.custom_additional_costs = '[]';
      }
    }

    if (updateData.negotiation !== undefined) {
      updateObject.negotiation = normalizeUTF8(updateData.negotiation || '');
    }
    if (updateData.multiple_stack_cost !== undefined) {
      updateObject.multiple_stack_cost = parseInt(updateData.multiple_stack_cost) || null;
    }
    if (updateData.representative_birth_date !== undefined) {
      updateObject.representative_birth_date = updateData.representative_birth_date || null;
    }
    if (updateData.is_active !== undefined) {
      updateObject.is_active = Boolean(updateData.is_active);
    }

    // 실사 관리 필드
    if (updateData.estimate_survey_manager !== undefined) {
      updateObject.estimate_survey_manager = normalizeUTF8(updateData.estimate_survey_manager || '');
    }
    if (updateData.estimate_survey_date !== undefined) {
      updateObject.estimate_survey_date = updateData.estimate_survey_date || null;
    }
    if (updateData.pre_construction_survey_manager !== undefined) {
      updateObject.pre_construction_survey_manager = normalizeUTF8(updateData.pre_construction_survey_manager || '');
    }
    if (updateData.pre_construction_survey_date !== undefined) {
      updateObject.pre_construction_survey_date = updateData.pre_construction_survey_date || null;
    }
    if (updateData.completion_survey_manager !== undefined) {
      updateObject.completion_survey_manager = normalizeUTF8(updateData.completion_survey_manager || '');
    }
    if (updateData.completion_survey_date !== undefined) {
      updateObject.completion_survey_date = updateData.completion_survey_date || null;
    }

    // 계산서 및 입금 관리 필드 (보조금 사업장)
    if (updateData.invoice_1st_date !== undefined) {
      updateObject.invoice_1st_date = updateData.invoice_1st_date || null;
    }
    if (updateData.invoice_1st_amount !== undefined) {
      updateObject.invoice_1st_amount = updateData.invoice_1st_amount ? parseInt(updateData.invoice_1st_amount) : null;
    }
    if (updateData.payment_1st_date !== undefined) {
      updateObject.payment_1st_date = updateData.payment_1st_date || null;
    }
    if (updateData.payment_1st_amount !== undefined) {
      updateObject.payment_1st_amount = updateData.payment_1st_amount ? parseInt(updateData.payment_1st_amount) : null;
    }
    if (updateData.invoice_2nd_date !== undefined) {
      updateObject.invoice_2nd_date = updateData.invoice_2nd_date || null;
    }
    if (updateData.invoice_2nd_amount !== undefined) {
      updateObject.invoice_2nd_amount = updateData.invoice_2nd_amount ? parseInt(updateData.invoice_2nd_amount) : null;
    }
    if (updateData.payment_2nd_date !== undefined) {
      updateObject.payment_2nd_date = updateData.payment_2nd_date || null;
    }
    if (updateData.payment_2nd_amount !== undefined) {
      updateObject.payment_2nd_amount = updateData.payment_2nd_amount ? parseInt(updateData.payment_2nd_amount) : null;
    }
    if (updateData.invoice_additional_date !== undefined) {
      updateObject.invoice_additional_date = updateData.invoice_additional_date || null;
    }
    if (updateData.payment_additional_date !== undefined) {
      updateObject.payment_additional_date = updateData.payment_additional_date || null;
    }
    if (updateData.payment_additional_amount !== undefined) {
      updateObject.payment_additional_amount = updateData.payment_additional_amount ? parseInt(updateData.payment_additional_amount) : null;
    }

    // 계산서 및 입금 관리 필드 (자비 사업장)
    if (updateData.invoice_advance_date !== undefined) {
      updateObject.invoice_advance_date = updateData.invoice_advance_date || null;
    }
    if (updateData.invoice_advance_amount !== undefined) {
      updateObject.invoice_advance_amount = updateData.invoice_advance_amount ? parseInt(updateData.invoice_advance_amount) : null;
    }
    if (updateData.payment_advance_date !== undefined) {
      updateObject.payment_advance_date = updateData.payment_advance_date || null;
    }
    if (updateData.payment_advance_amount !== undefined) {
      updateObject.payment_advance_amount = updateData.payment_advance_amount ? parseInt(updateData.payment_advance_amount) : null;
    }
    if (updateData.invoice_balance_date !== undefined) {
      updateObject.invoice_balance_date = updateData.invoice_balance_date || null;
    }
    if (updateData.invoice_balance_amount !== undefined) {
      updateObject.invoice_balance_amount = updateData.invoice_balance_amount ? parseInt(updateData.invoice_balance_amount) : null;
    }
    if (updateData.payment_balance_date !== undefined) {
      updateObject.payment_balance_date = updateData.payment_balance_date || null;
    }
    if (updateData.payment_balance_amount !== undefined) {
      updateObject.payment_balance_amount = updateData.payment_balance_amount ? parseInt(updateData.payment_balance_amount) : null;
    }

    // 제출일 관리 필드 (착공신고서, 그린링크 전송확인서, 부착완료통보서)
    if (updateData.construction_report_submitted_at !== undefined) {
      updateObject.construction_report_submitted_at = updateData.construction_report_submitted_at || null;
    }
    if (updateData.greenlink_confirmation_submitted_at !== undefined) {
      updateObject.greenlink_confirmation_submitted_at = updateData.greenlink_confirmation_submitted_at || null;
    }
    if (updateData.attachment_completion_submitted_at !== undefined) {
      updateObject.attachment_completion_submitted_at = updateData.attachment_completion_submitted_at || null;
    }

    // Set updated timestamp
    updateObject.updated_at = new Date().toISOString();

    // Build dynamic UPDATE query
    const updateFields = Object.keys(updateObject);
    const setClause = updateFields.map((field, index) => `${field} = $${index + 1}`).join(', ');
    const values = updateFields.map(field => updateObject[field]);
    values.push(id); // Add id as the last parameter

    const updateQuery = `
      UPDATE business_info
      SET ${setClause}
      WHERE id = $${values.length}
      RETURNING *
    `;

    const result = await pgQuery(updateQuery, values);
    const updatedBusiness = result.rows[0];

    if (!updatedBusiness) {
      logError('❌ [BUSINESS-INFO-DIRECT] PUT 실패: 업데이트된 레코드 없음');
      return NextResponse.json({
        success: false,
        error: '업데이트 실패'
      }, { status: 500 });
    }

    log('✅ [BUSINESS-INFO-DIRECT] PUT 성공:', `사업장 ${updatedBusiness.business_name} 업데이트 완료`);

    return NextResponse.json({ 
      success: true, 
      message: '사업장 정보가 성공적으로 수정되었습니다.',
      data: updatedBusiness
    });

  } catch (error) {
    logError('❌ [BUSINESS-INFO-DIRECT] PUT 실패:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '알 수 없는 오류'
    }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const businessData = await request.json();

    // 배치 업로드 모드 확인
    if (businessData.isBatchUpload && Array.isArray(businessData.businesses)) {
      const uploadMode = businessData.uploadMode || 'overwrite';
      const startTime = Date.now();

      log('📦 [BATCH-UPLOAD] 시작 -', businessData.businesses.length, '개 사업장 / 모드:', uploadMode);

      // 🔄 전체 교체 모드
      if (uploadMode === 'replaceAll') {
        return await executeReplaceAll(businessData.businesses, startTime, businessData.force_replace === true);
      }

      // 🚀 배치 INSERT 최적화: 대량 데이터를 한 번에 처리
      return await executeBatchUpload(businessData.businesses, uploadMode, startTime);
    }

    // 📝 개별 사업장 생성
    log('📝 [BUSINESS-INFO-DIRECT] POST 시작 - 새 사업장 생성');

    // Normalize and structure all fields properly
    const normalizedData = {
      // Basic business information
      business_name: normalizeUTF8(businessData.business_name || ''),
      local_government: normalizeUTF8(businessData.local_government || ''),
      address: normalizeUTF8(businessData.address || ''),
      representative_name: normalizeUTF8(businessData.representative_name || ''),
      business_registration_number: normalizeUTF8(businessData.business_registration_number || ''),
      business_type: normalizeUTF8(businessData.business_type || ''),
      business_contact: normalizeUTF8(businessData.business_contact || ''),
      manager_name: normalizeUTF8(businessData.manager_name || ''),
      manager_contact: normalizeUTF8(businessData.manager_contact || ''),
      manager_position: normalizeUTF8(businessData.manager_position || ''),
      fax_number: normalizeUTF8(businessData.fax_number || ''),
      email: normalizeUTF8(businessData.email || ''),

      // Measurement device fields
      ph_meter: parseInt(businessData.ph_meter || '0') || 0,
      differential_pressure_meter: parseInt(businessData.differential_pressure_meter || '0') || 0,
      temperature_meter: parseInt(businessData.temperature_meter || '0') || 0,
      discharge_current_meter: parseInt(businessData.discharge_current_meter || '0') || 0,
      fan_current_meter: parseInt(businessData.fan_current_meter || '0') || 0,
      pump_current_meter: parseInt(businessData.pump_current_meter || '0') || 0,
      gateway: businessData.gateway,
      gateway_1_2: parseInt(businessData.gateway_1_2 || '0') || 0,
      gateway_3_4: parseInt(businessData.gateway_3_4 || '0') || 0,

      // VPN fields as integers (post-migration)
      vpn_wired: parseInt(businessData.vpn_wired || '0') || 0,
      vpn_wireless: parseInt(businessData.vpn_wireless || '0') || 0,
      multiple_stack: parseInt(businessData.multiple_stack || '0') || 0,

      // Additional measurement device fields
      explosion_proof_differential_pressure_meter_domestic: parseInt(businessData.explosion_proof_differential_pressure_meter_domestic || '0') || 0,
      explosion_proof_temperature_meter_domestic: parseInt(businessData.explosion_proof_temperature_meter_domestic || '0') || 0,
      expansion_device: parseInt(businessData.expansion_device || '0') || 0,
      relay_8ch: parseInt(businessData.relay_8ch || '0') || 0,
      relay_16ch: parseInt(businessData.relay_16ch || '0') || 0,
      main_board_replacement: parseInt(businessData.main_board_replacement || '0') || 0,
      business_management_code: parseInt(businessData.business_management_code || '0') || 0,

      // Project management fields
      row_number: businessData.row_number ? parseInt(businessData.row_number) : null,
      department: normalizeUTF8(businessData.department || ''),
      progress_status: normalizeUTF8(businessData.progress_status || ''),
      project_year: businessData.project_year ? parseInt(businessData.project_year) : null,
      contract_document: normalizeUTF8(businessData.contract_document || ''),
      order_request_date: businessData.order_request_date || null,
      receipt_date: businessData.receipt_date || null,
      wireless_document: normalizeUTF8(businessData.wireless_document || ''),
      installation_support: normalizeUTF8(businessData.installation_support || ''),
      order_manager: normalizeUTF8(businessData.order_manager || ''),
      order_date: businessData.order_date || null,
      shipment_date: businessData.shipment_date || null,
      inventory_check: normalizeUTF8(businessData.inventory_check || ''),
      installation_date: businessData.installation_date || null,
      payment_scheduled_date: businessData.payment_scheduled_date || null,
      installation_team: normalizeUTF8(businessData.installation_team || ''),

      // Business classification and operational fields
      business_category: normalizeUTF8(businessData.business_category || ''),
      pollutants: normalizeUTF8(businessData.pollutants || ''),
      annual_emission_amount: businessData.annual_emission_amount ? parseInt(businessData.annual_emission_amount) : null,
      first_report_date: businessData.first_report_date || null,
      operation_start_date: businessData.operation_start_date || null,
      subsidy_approval_date: businessData.subsidy_approval_date || null,
      contract_sent_date: businessData.contract_sent_date || null,

      // System and additional fields
      manufacturer: businessData.manufacturer,
      vpn: businessData.vpn,
      greenlink_id: normalizeUTF8(businessData.greenlink_id || ''),
      greenlink_pw: normalizeUTF8(businessData.greenlink_pw || ''),
      sales_office: normalizeUTF8(businessData.sales_office || ''),
      expansion_pack: businessData.expansion_pack ? parseInt(businessData.expansion_pack) : null,
      other_equipment: normalizeUTF8(businessData.other_equipment || ''),
      additional_cost: businessData.additional_cost ? parseInt(businessData.additional_cost) : null,
      negotiation: normalizeUTF8(businessData.negotiation || ''),
      multiple_stack_cost: businessData.multiple_stack_cost ? parseInt(businessData.multiple_stack_cost) : null,
      representative_birth_date: businessData.representative_birth_date || null,

      // 실사 관리 필드
      estimate_survey_manager: normalizeUTF8(businessData.estimate_survey_manager || ''),
      estimate_survey_date: businessData.estimate_survey_date || null,
      pre_construction_survey_manager: normalizeUTF8(businessData.pre_construction_survey_manager || ''),
      pre_construction_survey_date: businessData.pre_construction_survey_date || null,
      completion_survey_manager: normalizeUTF8(businessData.completion_survey_manager || ''),
      completion_survey_date: businessData.completion_survey_date || null,

      // 계산서 및 입금 관리 (보조금 사업장)
      invoice_1st_date: businessData.invoice_1st_date || null,
      invoice_1st_amount: businessData.invoice_1st_amount ? parseInt(businessData.invoice_1st_amount) : null,
      payment_1st_date: businessData.payment_1st_date || null,
      payment_1st_amount: businessData.payment_1st_amount ? parseInt(businessData.payment_1st_amount) : null,
      invoice_2nd_date: businessData.invoice_2nd_date || null,
      invoice_2nd_amount: businessData.invoice_2nd_amount ? parseInt(businessData.invoice_2nd_amount) : null,
      payment_2nd_date: businessData.payment_2nd_date || null,
      payment_2nd_amount: businessData.payment_2nd_amount ? parseInt(businessData.payment_2nd_amount) : null,
      invoice_additional_date: businessData.invoice_additional_date || null,
      payment_additional_date: businessData.payment_additional_date || null,
      payment_additional_amount: businessData.payment_additional_amount ? parseInt(businessData.payment_additional_amount) : null,

      // 계산서 및 입금 관리 (자비 사업장)
      invoice_advance_date: businessData.invoice_advance_date || null,
      invoice_advance_amount: businessData.invoice_advance_amount ? parseInt(businessData.invoice_advance_amount) : null,
      payment_advance_date: businessData.payment_advance_date || null,
      payment_advance_amount: businessData.payment_advance_amount ? parseInt(businessData.payment_advance_amount) : null,
      invoice_balance_date: businessData.invoice_balance_date || null,
      invoice_balance_amount: businessData.invoice_balance_amount ? parseInt(businessData.invoice_balance_amount) : null,
      payment_balance_date: businessData.payment_balance_date || null,
      payment_balance_amount: businessData.payment_balance_amount ? parseInt(businessData.payment_balance_amount) : null,

      // 제출일 관리 (착공신고서, 그린링크 전송확인서, 부착완료통보서)
      construction_report_submitted_at: businessData.construction_report_submitted_at || null,
      greenlink_confirmation_submitted_at: businessData.greenlink_confirmation_submitted_at || null,
      attachment_completion_submitted_at: businessData.attachment_completion_submitted_at || null,

      // System fields
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      is_active: businessData.is_active ?? true,
      is_deleted: businessData.is_deleted ?? false
    };

    const fields = Object.keys(normalizedData);
    const placeholders = fields.map((_, index) => `$${index + 1}`).join(', ');
    const values = fields.map(field => (normalizedData as any)[field]);

    const insertQuery = `
      INSERT INTO business_info (${fields.join(', ')})
      VALUES (${placeholders})
      RETURNING *
    `;

    const result = await pgQuery(insertQuery, values);
    const newBusiness = result.rows[0];

    if (!newBusiness) {
      logError('❌ [BUSINESS-INFO-DIRECT] POST 실패: 생성된 레코드 없음');
      return NextResponse.json({
        success: false,
        error: '생성 실패'
      }, { status: 500 });
    }

    log('✅ [BUSINESS-INFO-DIRECT] POST 성공:', `사업장 ${newBusiness.business_name} 생성 완료`);

    return NextResponse.json({
      success: true,
      message: '사업장이 성공적으로 생성되었습니다.',
      data: newBusiness
    });

  } catch (error) {
    logError('❌ [BUSINESS-INFO-DIRECT] POST 실패:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '알 수 없는 오류'
    }, { status: 500 });
  }
}

/**
 * 🚀 배치 업로드 최적화 함수
 * 3,000개 사업장을 30초 이내에 처리 (기존 5분 → 90% 단축)
 */
async function executeBatchUpload(
  businesses: any[],
  uploadMode: 'overwrite' | 'merge' | 'skip',
  startTime: number
) {
  // PostgreSQL 파라미터 제한: 65,535개
  // normalizeBusinessData 필드 수: 79개
  // 최대 안전 배치: floor(65535 / 79) = 829 → 여유있게 500 사용
  const BATCH_SIZE = 500;
  const errorDetails: Array<{ business_name: string; error: string }> = [];

  let totalCreated = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  // 1️⃣ 데이터 정규화 및 검증
  const normalizedBusinesses = businesses
    .map(business => {
      try {
        const normalizedName = normalizeUTF8(business.business_name || '');

        if (!normalizedName) {
          totalErrors++;
          errorDetails.push({ business_name: '(이름 없음)', error: '사업장명이 비어있습니다' });
          return null;
        }

        return normalizeBusinessData(business, normalizedName);
      } catch (error: any) {
        totalErrors++;
        errorDetails.push({
          business_name: business.business_name || '(이름 없음)',
          error: error.message
        });
        return null;
      }
    })
    .filter(Boolean) as any[];

  log('✅ [BATCH] 정규화 완료 -', normalizedBusinesses.length, '개 유효 /', totalErrors, '개 오류');

  // 2️⃣ 배치 단위로 분할 처리
  for (let i = 0; i < normalizedBusinesses.length; i += BATCH_SIZE) {
    const batch = normalizedBusinesses.slice(i, i + BATCH_SIZE);
    const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(normalizedBusinesses.length / BATCH_SIZE);

    log(`🔄 [BATCH ${batchNumber}/${totalBatches}] 처리 중 - ${batch.length}개 사업장`);

    try {
      const batchResult = await executeSingleBatch(batch, uploadMode);

      totalCreated += batchResult.created;
      totalUpdated += batchResult.updated;
      totalSkipped += batchResult.skipped;

      log(`✅ [BATCH ${batchNumber}/${totalBatches}] 완료 - 생성: ${batchResult.created}, 업데이트: ${batchResult.updated}`);
    } catch (batchError: any) {
      logError(`❌ [BATCH ${batchNumber}/${totalBatches}] 실패:`, batchError);
      totalErrors += batch.length;
      errorDetails.push({
        business_name: `배치 ${batchNumber} (${batch.length}개)`,
        error: batchError.message
      });
    }
  }

  const elapsedTime = Date.now() - startTime;
  log(`🎉 [BATCH-UPLOAD] 완료 - ${elapsedTime}ms 소요 / 생성: ${totalCreated}, 업데이트: ${totalUpdated}, 오류: ${totalErrors}`);

  return NextResponse.json({
    success: true,
    message: '배치 업로드가 완료되었습니다.',
    data: {
      results: {
        total: businesses.length,
        created: totalCreated,
        updated: totalUpdated,
        skipped: totalSkipped,
        errors: totalErrors,
        errorDetails: errorDetails.slice(0, 10),
        elapsedTime
      }
    }
  });
}

/**
 * 단일 배치 처리 함수 (최대 1,000개)
 */
async function executeSingleBatch(
  batch: any[],
  uploadMode: 'overwrite' | 'merge' | 'skip'
) {
  if (batch.length === 0) {
    return { created: 0, updated: 0, skipped: 0 };
  }

  const fields = Object.keys(batch[0]);
  const fieldCount = fields.length;

  // 3️⃣ VALUES 절 생성
  const valuePlaceholders = batch.map((_, index) => {
    const start = index * fieldCount;
    const placeholders = Array.from(
      { length: fieldCount },
      (_, i) => `$${start + i + 1}`
    );
    return `(${placeholders.join(', ')})`;
  }).join(', ');

  // 4️⃣ 모든 값을 1차원 배열로 평탄화
  const values = batch.flatMap(business =>
    fields.map(field => business[field])
  );

  // 5️⃣ ON CONFLICT 절 생성 (모드별 처리)
  let conflictClause = '';

  if (uploadMode === 'overwrite') {
    // 덮어쓰기: 모든 필드 업데이트
    const updateFields = fields
      .filter(f => f !== 'business_name' && f !== 'created_at')
      .map(field => `${field} = EXCLUDED.${field}`)
      .join(', ');

    conflictClause = `
      ON CONFLICT (business_name)
      DO UPDATE SET ${updateFields}
    `;
  } else if (uploadMode === 'merge') {
    // 병합: 빈 값이 아닌 필드만 업데이트
    const integerFields = [
      'ph_meter', 'differential_pressure_meter', 'temperature_meter',
      'discharge_current_meter', 'fan_current_meter', 'pump_current_meter',
      'gateway', 'gateway_1_2', 'gateway_3_4', 'vpn_wired', 'vpn_wireless',
      'multiple_stack', 'explosion_proof_differential_pressure_meter_domestic',
      'explosion_proof_temperature_meter_domestic', 'expansion_device',
      'relay_8ch', 'relay_16ch', 'main_board_replacement', 'business_management_code',
      'project_year', 'additional_cost', 'invoice_1st_amount', 'payment_1st_amount',
      'invoice_2nd_amount', 'payment_2nd_amount', 'payment_additional_amount',
      'invoice_advance_amount', 'payment_advance_amount', 'invoice_balance_amount',
      'payment_balance_amount'
    ];

    const updateFields = fields
      .filter(f => f !== 'business_name' && f !== 'created_at')
      .map(field => {
        if (integerFields.includes(field)) {
          // 숫자 필드: 0이 아닌 경우만 업데이트 (명시적 타입 캐스팅)
          return `${field} = CASE
            WHEN EXCLUDED.${field} IS NOT NULL AND EXCLUDED.${field}::integer != 0
            THEN EXCLUDED.${field}
            ELSE business_info.${field}
          END`;
        } else if (field === 'updated_at') {
          // updated_at는 항상 업데이트
          return `${field} = EXCLUDED.${field}`;
        } else {
          // 문자열 필드: 빈 값이 아닌 경우만 업데이트
          return `${field} = COALESCE(NULLIF(EXCLUDED.${field}, ''), business_info.${field})`;
        }
      })
      .join(', ');

    conflictClause = `
      ON CONFLICT (business_name)
      DO UPDATE SET ${updateFields}
    `;
  } else if (uploadMode === 'skip') {
    // 건너뛰기: 중복 시 아무것도 안 함
    conflictClause = 'ON CONFLICT (business_name) DO NOTHING';
  }

  // 6️⃣ 배치 INSERT 실행
  const query = `
    INSERT INTO business_info (${fields.join(', ')})
    VALUES ${valuePlaceholders}
    ${conflictClause}
    RETURNING id, business_name, (xmax = 0) AS was_inserted
  `;

  try {
    const result = await pgQuery(query, values);

    // 7️⃣ 결과 집계
    const inserted = result.rows.filter((r: any) => r.was_inserted).length;
    const updated = result.rows.filter((r: any) => !r.was_inserted).length;
    const skipped = uploadMode === 'skip' ? (batch.length - result.rows.length) : 0;

    return {
      created: inserted,
      updated: updated,
      skipped: skipped
    };
  } catch (error: any) {
    logError('❌ [BATCH-INSERT] 쿼리 실패:', error);
    throw error;
  }
}


/**
 * 🔄 전체 교체(replaceAll) 모드
 * 1. 기존 데이터 JSON 백업 → backup_snapshots 저장
 * 2. 트랜잭션: revenue/survey NULL 처리 → DELETE → INSERT → air_permit 재연결
 */
async function executeReplaceAll(businesses: any[], startTime: number, forceReplace: boolean = false) {
  if (!businesses || businesses.length === 0) {
    return NextResponse.json({ success: false, error: '업로드할 사업장 데이터가 없습니다' }, { status: 400 });
  }

  // ─── Step 0: 사진 등록된 사업장 체크 ────────────────────────────────────
  if (!forceReplace) {
    const photoBizRows = await queryAll(`
      SELECT bi.business_name, COUNT(uf.id)::int AS photo_count
      FROM business_info bi
      JOIN uploaded_files uf ON uf.business_id = bi.id
      WHERE bi.is_deleted = false
      GROUP BY bi.business_name
      HAVING COUNT(uf.id) > 0
      ORDER BY bi.business_name
    `);
    if (photoBizRows && photoBizRows.length > 0) {
      const list = photoBizRows.map((r: any) => `${r.business_name}(${r.photo_count}장)`).join(', ');
      log('🚫 [REPLACE-ALL] 사진 등록 사업장 존재로 전체교체 차단:', list);
      return NextResponse.json({
        success: false,
        error: `사진이 등록된 사업장이 있어 전체교체를 진행할 수 없습니다: ${list}`,
        photo_businesses: photoBizRows,
      }, { status: 409 });
    }
  }

  // ─── Step 1: 백업 생성 (트랜잭션 외부) ─────────────────────────────────
  log('💾 [REPLACE-ALL] Step1: 백업 생성 시작');
  let snapshotId: string;
  try {
    const backupRows = await queryAll(`
      SELECT
        bi.business_name,
        json_agg(
          json_build_object(
            'business_type',              api.business_type,
            'annual_pollutant_emission',  api.annual_pollutant_emission,
            'first_report_date',          api.first_report_date,
            'operation_start_date',       api.operation_start_date,
            'additional_info',            api.additional_info,
            'outlets', (
              SELECT json_agg(
                json_build_object(
                  'outlet_number',  do2.outlet_number,
                  'outlet_name',    do2.outlet_name,
                  'additional_info', do2.additional_info,
                  'facilities', (
                    SELECT json_agg(json_build_object(
                      'facility_name', df.facility_name,
                      'capacity',      df.capacity,
                      'quantity',      df.quantity
                    )) FROM discharge_facilities df WHERE df.outlet_id = do2.id
                  ),
                  'prevention_facilities', (
                    SELECT json_agg(json_build_object(
                      'facility_name', pf.facility_name,
                      'capacity',      pf.capacity,
                      'quantity',      pf.quantity
                    )) FROM prevention_facilities pf WHERE pf.outlet_id = do2.id
                  )
                )
              ) FROM discharge_outlets do2 WHERE do2.air_permit_id = api.id
            )
          )
        ) FILTER (WHERE api.id IS NOT NULL) AS air_permits
      FROM business_info bi
      LEFT JOIN air_permit_info api ON api.business_id = bi.id
      WHERE bi.is_deleted = false
      GROUP BY bi.business_name
    `);

    const snapshotResult = await pgQuery(
      `INSERT INTO backup_snapshots (snapshot_type, data, record_count)
       VALUES ('business_replace_all', $1, $2)
       RETURNING id`,
      [JSON.stringify({ businesses: backupRows }), backupRows.length]
    );
    snapshotId = snapshotResult.rows[0].id;
    log('✅ [REPLACE-ALL] 백업 완료 - snapshotId:', snapshotId, '/ 사업장 수:', backupRows.length);
  } catch (err) {
    logError('❌ [REPLACE-ALL] 백업 실패:', err);
    return NextResponse.json({ success: false, error: '백업 생성에 실패했습니다. 업로드를 중단합니다.' }, { status: 500 });
  }

  // ─── Step 2: 데이터 정규화 ──────────────────────────────────────────────
  const normalizedBusinesses = businesses
    .map((b: any) => {
      const name = normalizeUTF8(b.business_name || '');
      if (!name) return null;
      return normalizeBusinessData(b, name);
    })
    .filter(Boolean);

  if (normalizedBusinesses.length === 0) {
    return NextResponse.json({ success: false, error: '유효한 사업장 데이터가 없습니다' }, { status: 400 });
  }

  // ─── Step 3: 순차 처리 (트랜잭션 없이, 백업으로 롤백 가능) ─────────────
  log('🔄 [REPLACE-ALL] Step3: 데이터 교체 시작');
  let created = 0;
  let airPermitRestored = 0;
  const airPermitNotRestored: string[] = [];
  const replaceStartTime = Date.now();

  try {
    const backupData = await queryOne(
      `SELECT data FROM backup_snapshots WHERE id = $1`, [snapshotId]
    );
    const backupBusinesses: any[] = backupData?.data?.businesses || [];

    // 3a-1. NOT NULL no-action FK: 먼저 삭제
    await pgQuery(`DELETE FROM estimate_history
      WHERE business_id IN (SELECT id FROM business_info WHERE is_deleted = false)`);
    await pgQuery(`DELETE FROM operating_cost_adjustments
      WHERE business_id IN (SELECT id FROM business_info WHERE is_deleted = false)`);

    // 3a-2. nullable no-action FK: NULL 처리
    await pgQuery(`UPDATE revenue_calculations SET business_id = NULL
      WHERE business_id IN (SELECT id FROM business_info WHERE is_deleted = false)`);
    await pgQuery(`UPDATE survey_cost_adjustments SET business_id = NULL
      WHERE business_id IN (SELECT id FROM business_info WHERE is_deleted = false)`);
    await pgQuery(`UPDATE calendar_events SET business_id = NULL
      WHERE business_id IN (SELECT id FROM business_info WHERE is_deleted = false)`);

    // 3b. 기존 사업장 전체 삭제
    await pgQuery(`DELETE FROM business_info WHERE is_deleted = false`);
    log('🗑️ [REPLACE-ALL] 기존 사업장 삭제 완료');

    // 3c. 새 사업장 INSERT (배치)
    // 배치 크기: 필드수(~80) × 50 = 4000 파라미터로 안전하게 유지
    const validBusinesses = normalizedBusinesses.filter((b): b is NonNullable<typeof b> => b !== null);
    const BATCH = 50;
    for (let i = 0; i < validBusinesses.length; i += BATCH) {
      const batchSlice = validBusinesses.slice(i, i + BATCH);
      const fields = Object.keys(batchSlice[0]);
      const fieldCount = fields.length;
      const valuePlaceholders = batchSlice.map((_, idx) => {
        const start = idx * fieldCount;
        return `(${Array.from({ length: fieldCount }, (_, j) => `$${start + j + 1}`).join(', ')})`;
      }).join(', ');
      const values = batchSlice.flatMap(b => fields.map(f => (b as any)[f]));
      await pgQuery(
        `INSERT INTO business_info (${fields.join(', ')}) VALUES ${valuePlaceholders}
         ON CONFLICT (business_name) DO NOTHING`,
        values
      );
      created += batchSlice.length;
      log(`📝 [REPLACE-ALL] INSERT ${Math.min(i + BATCH, validBusinesses.length)}/${validBusinesses.length}`);
    }

    // 3d. 새 사업장 UUID 맵 생성 (business_name → new_id)
    const newBusinessRows = await pgQuery(
      `SELECT id, business_name FROM business_info WHERE is_deleted = false`
    );
    const nameToId: Record<string, string> = {};
    for (const row of newBusinessRows.rows) {
      nameToId[row.business_name] = row.id;
    }

    // 3e. 대기필증 재연결
    for (const backupBiz of backupBusinesses) {
      const newBizId = nameToId[backupBiz.business_name];
      if (!newBizId) {
        if (backupBiz.air_permits && backupBiz.air_permits.length > 0) {
          airPermitNotRestored.push(backupBiz.business_name);
        }
        continue;
      }
      if (!backupBiz.air_permits || backupBiz.air_permits.length === 0) continue;

      for (const permit of backupBiz.air_permits) {
        const permitResult = await pgQuery(
          `INSERT INTO air_permit_info (
            business_id, business_type, annual_pollutant_emission,
            first_report_date, operation_start_date, additional_info,
            is_active, is_deleted
          ) VALUES ($1,$2,$3,$4,$5,$6, true, false)
          RETURNING id`,
          [
            newBizId,
            permit.business_type || null,
            permit.annual_pollutant_emission || null,
            permit.first_report_date || null,
            permit.operation_start_date || null,
            JSON.stringify(permit.additional_info || {}),
          ]
        );
        const newPermitId = permitResult.rows[0].id;
        airPermitRestored++;

        if (!permit.outlets) continue;
        for (const outlet of permit.outlets) {
          const outletResult = await pgQuery(
            `INSERT INTO discharge_outlets (
              air_permit_id, outlet_number, outlet_name, additional_info
            ) VALUES ($1,$2,$3,$4)
            RETURNING id`,
            [
              newPermitId,
              outlet.outlet_number,
              outlet.outlet_name || null,
              JSON.stringify(outlet.additional_info || {}),
            ]
          );
          const newOutletId = outletResult.rows[0].id;

          if (outlet.facilities) {
            for (const f of outlet.facilities) {
              await pgQuery(
                `INSERT INTO discharge_facilities (outlet_id, facility_name, capacity, quantity)
                 VALUES ($1,$2,$3,$4)`,
                [newOutletId, f.facility_name, f.capacity || null, f.quantity || 1]
              );
            }
          }
          if (outlet.prevention_facilities) {
            for (const pf of outlet.prevention_facilities) {
              await pgQuery(
                `INSERT INTO prevention_facilities (outlet_id, facility_name, capacity, quantity)
                 VALUES ($1,$2,$3,$4)`,
                [newOutletId, pf.facility_name, pf.capacity || null, pf.quantity || 1]
              );
            }
          }
        }
      }
    }
  } catch (err) {
    logError('❌ [REPLACE-ALL] 실패:', err);
    return NextResponse.json({
      success: false,
      error: `교체 중 오류가 발생했습니다. 백업 ID로 복원하세요: ${snapshotId}`,
      snapshotId
    }, { status: 500 });
  }

  const elapsed = Date.now() - replaceStartTime;
  log(`✅ [REPLACE-ALL] 완료 - ${created}개 사업장, 대기필증 복원: ${airPermitRestored}건, 소요: ${elapsed}ms`);

  return NextResponse.json({
    success: true,
    data: {
      snapshotId,
      created,
      airPermitRestored,
      airPermitNotRestored,
      elapsedMs: elapsed,
      message: `${created}개 사업장 교체 완료. 대기필증 ${airPermitRestored}건 재연결.` +
        (airPermitNotRestored.length > 0
          ? ` ⚠️ 대기필증 유실 ${airPermitNotRestored.length}건: ${airPermitNotRestored.join(', ')}`
          : '')
    }
  });
}

export async function DELETE(request: Request) {
  try {
    const { id } = await request.json();

    if (!id) {
      return NextResponse.json({
        success: false,
        error: 'ID가 필요합니다'
      }, { status: 400 });
    }

    log('🗑️ [BUSINESS-INFO-DIRECT] 삭제 요청 - ID:', id);

    // 사업장 존재 여부 확인
    const existing = await queryOne(
      'SELECT id, business_name, is_deleted FROM business_info WHERE id = $1',
      [id]
    );

    if (!existing) {
      logError('❌ [BUSINESS-INFO-DIRECT] 사업장을 찾을 수 없음');
      return NextResponse.json({
        success: false,
        error: '사업장을 찾을 수 없습니다'
      }, { status: 404 });
    }

    if (existing.is_deleted) {
      return NextResponse.json({
        success: false,
        error: '이미 삭제된 사업장입니다'
      }, { status: 400 });
    }

    // 사진이 등록된 사업장은 삭제 불가
    const photoCheck = await queryOne(
      `SELECT COUNT(*)::int AS cnt FROM uploaded_files WHERE business_id = $1`,
      [id]
    );
    if (photoCheck?.cnt > 0) {
      return NextResponse.json({
        success: false,
        error: `이 사업장에 등록된 사진 ${photoCheck.cnt}장이 있어 삭제할 수 없습니다. 사진을 먼저 삭제해주세요.`,
        photo_count: photoCheck.cnt,
      }, { status: 409 });
    }

    // Soft delete: is_deleted 플래그를 true로 설정
    const result = await pgQuery(
      `UPDATE business_info
       SET is_deleted = true, updated_at = $1
       WHERE id = $2
       RETURNING *`,
      [new Date().toISOString(), id]
    );

    const deletedBusiness = result.rows[0];

    if (!deletedBusiness) {
      logError('❌ [BUSINESS-INFO-DIRECT] 삭제 실패: 레코드 없음');
      return NextResponse.json({
        success: false,
        error: '삭제에 실패했습니다'
      }, { status: 500 });
    }

    log('✅ [BUSINESS-INFO-DIRECT] 삭제 성공:', existing.business_name, '(ID:', id, ')');

    return NextResponse.json({
      success: true,
      message: `${existing.business_name} 사업장이 성공적으로 삭제되었습니다.`,
      data: deletedBusiness
    });

  } catch (error) {
    logError('❌ [BUSINESS-INFO-DIRECT] DELETE 실패:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '알 수 없는 오류'
    }, { status: 500 });
  }
}