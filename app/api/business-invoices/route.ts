// app/api/business-invoices/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { queryOne, query as pgQuery, queryAll } from '@/lib/supabase-direct';
import type { InvoiceRecord, InvoiceRecordsByStage } from '@/types/invoice';
import { calculateBusinessRevenue } from '@/lib/revenue-calculator';
import { calculateReceivables, sumAllPayments } from '@/lib/receivables-calculator';

// Force dynamic rendering for API routes
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET - 사업장별 계산서 및 입금 정보 조회
 * Query params: business_id
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const businessId = searchParams.get('business_id');

    if (!businessId) {
      return NextResponse.json(
        { success: false, message: '사업장 ID가 필요합니다' },
        { status: 400 }
      );
    }

    // 사업장 정보 조회 - Direct PostgreSQL
    console.log('🔍 [BUSINESS-INVOICES] GET - 사업장 정보 조회:', businessId);
    const business = await queryOne(
      `SELECT
        id, business_name, business_category, progress_status, additional_cost,
        installation_date,
        manufacturer, sales_office, negotiation,
        ph_meter, differential_pressure_meter, temperature_meter,
        discharge_current_meter, fan_current_meter, pump_current_meter,
        gateway, gateway_1_2, gateway_3_4, vpn_wired, vpn_wireless,
        multiple_stack, expansion_device, relay_8ch, relay_16ch,
        main_board_replacement,
        explosion_proof_differential_pressure_meter_domestic,
        explosion_proof_temperature_meter_domestic,
        estimate_survey_date, pre_construction_survey_date, completion_survey_date,
        installation_extra_cost,
        invoice_1st_date, invoice_1st_amount, payment_1st_date, payment_1st_amount,
        invoice_2nd_date, invoice_2nd_amount, payment_2nd_date, payment_2nd_amount,
        invoice_additional_date, payment_additional_date, payment_additional_amount,
        invoice_advance_date, invoice_advance_amount, payment_advance_date, payment_advance_amount,
        invoice_balance_date, invoice_balance_amount, payment_balance_date, payment_balance_amount
       FROM business_info
       WHERE id = $1`,
      [businessId]
    );

    if (!business) {
      return NextResponse.json(
        { success: false, message: '사업장을 찾을 수 없습니다' },
        { status: 404 }
      );
    }

    // pricing 데이터 로드 (매출 계산용)
    const [govPricing, mfgPricing, installCostData, salesOfficeData, surveyCostData] = await Promise.all([
      queryAll('SELECT * FROM government_pricing WHERE is_active = true', []),
      queryAll('SELECT * FROM manufacturer_pricing WHERE is_active = true', []),
      queryAll('SELECT * FROM equipment_installation_cost WHERE is_active = true', []),
      queryAll('SELECT * FROM sales_office_cost_settings WHERE is_active = true', []),
      queryAll('SELECT * FROM survey_cost_settings WHERE is_active = true', []),
    ]);

    const officialPrices: Record<string, number> = {};
    govPricing?.forEach((item: any) => { officialPrices[item.equipment_type] = Number(item.official_price) || 0; });

    const manufacturerPrices: Record<string, Record<string, number>> = {};
    mfgPricing?.forEach((item: any) => {
      const key = item.manufacturer.toLowerCase().trim();
      if (!manufacturerPrices[key]) manufacturerPrices[key] = {};
      manufacturerPrices[key][item.equipment_type] = Number(item.cost_price) || 0;
    });

    const baseInstallationCosts: Record<string, number> = {};
    installCostData?.forEach((item: any) => { baseInstallationCosts[item.equipment_type] = Number(item.base_installation_cost) || 0; });

    const salesOfficeSettings: Record<string, any> = {};
    salesOfficeData?.forEach((item: any) => { salesOfficeSettings[item.sales_office] = item; });

    const surveyCostSettings: Record<string, number> = {};
    surveyCostData?.forEach((item: any) => { surveyCostSettings[item.survey_type] = Number(item.cost) || 0; });

    const pricingData = { officialPrices, manufacturerPrices, baseInstallationCosts, salesOfficeSettings, surveyCostSettings };

    // 전체 매출 계산 (부가세 포함)
    const revenueResult = calculateBusinessRevenue(business, pricingData);
    const totalRevenueWithTax = Math.round(revenueResult.total_revenue * 1.1);

    // 총 입금액
    const allPayments = sumAllPayments(business);

    console.log('✅ [BUSINESS-INVOICES] GET - 조회 완료:', business.business_name);

    // 미수금 계산
    let totalReceivables = 0;
    let invoicesData: any = {};

    // progress_status(진행구분)를 사용 (business_category는 대기필증 종별이므로 무관)
    const rawCategory = business.progress_status;

    // 진행구분을 보조금/자비로 매핑
    const mapCategoryToInvoiceType = (category: string | null | undefined): '보조금' | '자비' => {
      const normalized = category?.trim() || '';

      // 보조금 처리
      if (normalized === '보조금' || normalized === '보조금 동시진행' || normalized === '보조금 추가승인') {
        return '보조금';
      }

      // 자비 처리: 자비, 대리점, AS, 외주설치
      if (normalized === '자비' || normalized === '대리점' || normalized === 'AS' || normalized === '외주설치') {
        return '자비';
      }

      // 기본값: 자비
      return '자비';
    };

    const category = mapCategoryToInvoiceType(rawCategory);

    console.log('📊 [business-invoices] 진행구분 매핑:', {
      사업장명: business.business_name,
      원본진행구분: rawCategory,
      매핑된진행구분: category
    });

    // 신규 미수금 계산: 전체 매출(부가세 포함) - 총 입금액
    // 설치일 없으면 0, 계산서 발행 여부 무관
    totalReceivables = calculateReceivables({
      installationDate: business.installation_date,
      totalRevenueWithTax,
      totalPayments: allPayments,
    });

    if (category === '보조금') {
      // invoicesData: 차수별 계산서/입금 현황 (참고용 - 발행내역 표시에 사용)
      invoicesData = {
        first: {
          invoice_date: business.invoice_1st_date,
          invoice_amount: business.invoice_1st_amount,
          payment_date: business.payment_1st_date,
          payment_amount: business.payment_1st_amount,
          receivable: (business.invoice_1st_amount || 0) - (business.payment_1st_amount || 0),
        },
        second: {
          invoice_date: business.invoice_2nd_date,
          invoice_amount: business.invoice_2nd_amount,
          payment_date: business.payment_2nd_date,
          payment_amount: business.payment_2nd_amount,
          receivable: (business.invoice_2nd_amount || 0) - (business.payment_2nd_amount || 0),
        },
        additional: {
          invoice_date: business.invoice_additional_date,
          invoice_amount: Math.round((business.additional_cost || 0) * 1.1),
          payment_date: business.payment_additional_date,
          payment_amount: business.payment_additional_amount,
          receivable: business.invoice_additional_date
            ? Math.round((business.additional_cost || 0) * 1.1) - (business.payment_additional_amount || 0)
            : 0,
        },
      };
    } else if (category === '자비') {
      // invoicesData: 차수별 계산서/입금 현황 (참고용 - 발행내역 표시에 사용)
      invoicesData = {
        advance: {
          invoice_date: business.invoice_advance_date,
          invoice_amount: business.invoice_advance_amount,
          payment_date: business.payment_advance_date,
          payment_amount: business.payment_advance_amount,
          receivable: (business.invoice_advance_amount || 0) - (business.payment_advance_amount || 0),
        },
        balance: {
          invoice_date: business.invoice_balance_date,
          invoice_amount: business.invoice_balance_amount,
          payment_date: business.payment_balance_date,
          payment_amount: business.payment_balance_amount,
          receivable: (business.invoice_balance_amount || 0) - (business.payment_balance_amount || 0),
        },
      };
    }

    // ── 신규: invoice_records 조회 ──────────────────────────────
    let invoiceRecordsByStage: InvoiceRecordsByStage = {
      subsidy_1st: [],
      subsidy_2nd: [],
      subsidy_additional: [],
      self_advance: [],
      self_balance: [],
      extra: [],
    };
    let extraReceivables = 0;

    try {
      const recordsResult = await pgQuery(
        `SELECT * FROM invoice_records
         WHERE business_id = $1 AND is_active = TRUE
         ORDER BY invoice_stage, record_type, created_at ASC`,
        [businessId]
      );

      if (recordsResult.rows && recordsResult.rows.length > 0) {
        const allRecords: InvoiceRecord[] = recordsResult.rows;

        // 단계별 그룹핑 및 수정이력 연결
        const recordMap = new Map<string, InvoiceRecord>();
        allRecords.forEach(r => recordMap.set(r.id, { ...r, revisions: [] }));

        allRecords.forEach(r => {
          if (r.parent_record_id && recordMap.has(r.parent_record_id)) {
            const parent = recordMap.get(r.parent_record_id)!;
            parent.revisions = parent.revisions || [];
            parent.revisions.push(recordMap.get(r.id)!);
          }
        });

        // 최상위(원본) 레코드만 단계별 분류
        const topLevelRecords = allRecords.filter(r => !r.parent_record_id);
        topLevelRecords.forEach(r => {
          const withRevisions = recordMap.get(r.id)!;
          const stage = r.invoice_stage as keyof InvoiceRecordsByStage;
          if (invoiceRecordsByStage[stage] !== undefined) {
            invoiceRecordsByStage[stage].push(withRevisions);
          }
        });

        // 추가 계산서(extra) 미수금 계산
        invoiceRecordsByStage.extra.forEach(record => {
          // 취소된 계산서는 미수금 제외
          if (record.record_type !== 'cancelled') {
            extraReceivables += (record.total_amount || 0) - (record.payment_amount || 0);
          }
        });

        // invoice_records 우선값으로 invoicesData 업데이트 (발행내역 표시용)
        // totalReceivables는 전체 매출 기준으로 이미 계산됨 - 재계산 불필요
        const getStageRecord = (stage: keyof InvoiceRecordsByStage): InvoiceRecord | null =>
          invoiceRecordsByStage[stage].find(r => r.record_type === 'original' && r.issue_date) || null;

        if (category === '보조금') {
          const rec1st = getStageRecord('subsidy_1st');
          const rec2nd = getStageRecord('subsidy_2nd');
          const recAdditional = getStageRecord('subsidy_additional');

          if (rec1st) {
            invoicesData.first.invoice_date   = rec1st.issue_date;
            invoicesData.first.invoice_amount = rec1st.total_amount;
            invoicesData.first.payment_date   = rec1st.payment_date;
            invoicesData.first.payment_amount = rec1st.payment_amount;
            invoicesData.first.receivable     = rec1st.total_amount - rec1st.payment_amount;
          }
          if (rec2nd) {
            invoicesData.second.invoice_date   = rec2nd.issue_date;
            invoicesData.second.invoice_amount = rec2nd.total_amount;
            invoicesData.second.payment_date   = rec2nd.payment_date;
            invoicesData.second.payment_amount = rec2nd.payment_amount;
            invoicesData.second.receivable     = rec2nd.total_amount - rec2nd.payment_amount;
          }
          if (recAdditional) {
            invoicesData.additional.invoice_date   = recAdditional.issue_date;
            invoicesData.additional.invoice_amount = recAdditional.total_amount;
            invoicesData.additional.payment_date   = recAdditional.payment_date;
            invoicesData.additional.payment_amount = recAdditional.payment_amount;
            invoicesData.additional.receivable     = recAdditional.total_amount - recAdditional.payment_amount;
          }
        } else if (category === '자비') {
          const recAdvance = getStageRecord('self_advance');
          const recBalance = getStageRecord('self_balance');

          if (recAdvance) {
            invoicesData.advance.invoice_date   = recAdvance.issue_date;
            invoicesData.advance.invoice_amount = recAdvance.total_amount;
            invoicesData.advance.payment_date   = recAdvance.payment_date;
            invoicesData.advance.payment_amount = recAdvance.payment_amount;
            invoicesData.advance.receivable     = recAdvance.total_amount - recAdvance.payment_amount;
          }
          if (recBalance) {
            invoicesData.balance.invoice_date   = recBalance.issue_date;
            invoicesData.balance.invoice_amount = recBalance.total_amount;
            invoicesData.balance.payment_date   = recBalance.payment_date;
            invoicesData.balance.payment_amount = recBalance.payment_amount;
            invoicesData.balance.receivable     = recBalance.total_amount - recBalance.payment_amount;
          }
        }
      }
    } catch (recordsError) {
      // invoice_records 테이블이 없는 경우(마이그레이션 전) 빈 값으로 처리
      console.warn('⚠️ [BUSINESS-INVOICES] invoice_records 조회 실패 (테이블 없음?):', recordsError);
    }

    return NextResponse.json({
      success: true,
      data: {
        business_id: business.id,
        business_name: business.business_name,
        business_category: category,
        additional_cost: business.additional_cost,
        invoices: invoicesData,
        total_receivables: totalReceivables,
        // 미수금 계산 근거 (UI 표시용)
        total_revenue: totalRevenueWithTax,
        total_payment_amount: allPayments,
        // 추가 계산서
        invoice_records: invoiceRecordsByStage,
        extra_receivables: extraReceivables,
        grand_total_receivables: totalReceivables,
      },
    });
  } catch (error: any) {
    console.error('Unexpected error in GET /api/business-invoices:', error);
    return NextResponse.json(
      { success: false, message: '서버 오류가 발생했습니다', error: error.message },
      { status: 500 }
    );
  }
}

/**
 * PUT - 계산서/입금 정보 업데이트 (기존 business_info 컬럼 직접 업데이트)
 * Body: { business_id, invoice_type, invoice_date?, invoice_amount?, payment_date?, payment_amount? }
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      business_id,
      invoice_type, // '1st' | '2nd' | 'additional' | 'advance' | 'balance'
      invoice_date,
      invoice_amount,
      payment_date,
      payment_amount,
    } = body;

    // 필수 파라미터 검증
    if (!business_id || !invoice_type) {
      return NextResponse.json(
        { success: false, message: '사업장 ID와 계산서 타입이 필요합니다' },
        { status: 400 }
      );
    }

    // 유효한 invoice_type 검증
    const validTypes = ['1st', '2nd', 'additional', 'advance', 'balance'];
    if (!validTypes.includes(invoice_type)) {
      return NextResponse.json(
        { success: false, message: '유효하지 않은 계산서 타입입니다' },
        { status: 400 }
      );
    }

    // 업데이트할 필드 매핑
    const updateData: any = {};

    if (invoice_type === '1st') {
      if (invoice_date !== undefined) updateData.invoice_1st_date = invoice_date;
      if (invoice_amount !== undefined) updateData.invoice_1st_amount = invoice_amount;
      if (payment_date !== undefined) updateData.payment_1st_date = payment_date;
      if (payment_amount !== undefined) updateData.payment_1st_amount = payment_amount;
    } else if (invoice_type === '2nd') {
      if (invoice_date !== undefined) updateData.invoice_2nd_date = invoice_date;
      if (invoice_amount !== undefined) updateData.invoice_2nd_amount = invoice_amount;
      if (payment_date !== undefined) updateData.payment_2nd_date = payment_date;
      if (payment_amount !== undefined) updateData.payment_2nd_amount = payment_amount;
    } else if (invoice_type === 'additional') {
      if (invoice_date !== undefined) updateData.invoice_additional_date = invoice_date;
      // invoice_amount는 additional_cost 사용하므로 업데이트 불가
      if (payment_date !== undefined) updateData.payment_additional_date = payment_date;
      if (payment_amount !== undefined) updateData.payment_additional_amount = payment_amount;
    } else if (invoice_type === 'advance') {
      if (invoice_date !== undefined) updateData.invoice_advance_date = invoice_date;
      if (invoice_amount !== undefined) updateData.invoice_advance_amount = invoice_amount;
      if (payment_date !== undefined) updateData.payment_advance_date = payment_date;
      if (payment_amount !== undefined) updateData.payment_advance_amount = payment_amount;
    } else if (invoice_type === 'balance') {
      if (invoice_date !== undefined) updateData.invoice_balance_date = invoice_date;
      if (invoice_amount !== undefined) updateData.invoice_balance_amount = invoice_amount;
      if (payment_date !== undefined) updateData.payment_balance_date = payment_date;
      if (payment_amount !== undefined) updateData.payment_balance_amount = payment_amount;
    }

    // 업데이트할 내용이 없으면 에러
    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { success: false, message: '업데이트할 데이터가 없습니다' },
        { status: 400 }
      );
    }

    // 업데이트 - Direct PostgreSQL
    console.log('📝 [BUSINESS-INVOICES] PUT - 계산서 정보 업데이트:', { business_id, invoice_type });
    const updateFields = Object.keys(updateData);
    const setClause = updateFields.map((field, index) => `${field} = $${index + 1}`).join(', ');
    const values = updateFields.map(field => updateData[field]);
    values.push(business_id);

    const updateQuery = `
      UPDATE business_info
      SET ${setClause}
      WHERE id = $${values.length}
      RETURNING *
    `;

    const updateResult = await pgQuery(updateQuery, values);

    if (!updateResult.rows || updateResult.rows.length === 0) {
      console.error('❌ [BUSINESS-INVOICES] PUT - 업데이트 실패');
      return NextResponse.json(
        { success: false, message: '계산서 정보 업데이트 실패' },
        { status: 500 }
      );
    }

    const data = updateResult.rows[0];
    console.log('✅ [BUSINESS-INVOICES] PUT - 업데이트 완료');

    return NextResponse.json({
      success: true,
      data,
      message: '계산서 정보가 업데이트되었습니다',
    });
  } catch (error: any) {
    console.error('Unexpected error in PUT /api/business-invoices:', error);
    return NextResponse.json(
      { success: false, message: '서버 오류가 발생했습니다', error: error.message },
      { status: 500 }
    );
  }
}
