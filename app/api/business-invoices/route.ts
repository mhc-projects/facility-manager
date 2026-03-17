// app/api/business-invoices/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { queryOne, query as pgQuery } from '@/lib/supabase-direct';
import type { InvoiceRecord, InvoiceRecordsByStage } from '@/types/invoice';
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
        invoice_balance_date, invoice_balance_amount, payment_balance_date, payment_balance_amount,
        revenue_adjustments
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

    // 총 입금액 (business_info 기본값 - invoice_records 조회 후 재계산될 수 있음)
    let allPayments = sumAllPayments(business);

    console.log('✅ [BUSINESS-INVOICES] GET - 조회 완료:', business.business_name);

    // 미수금 계산 (invoice_records 조회 후 재계산)
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

    // 미수금은 invoice_records 조회 후 최종 계산 (아래 참고)

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
          invoiceRecordsByStage[stage].find(r => r.record_type === 'original') || null;

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
            // issue_date가 null이면 business_info.invoice_additional_date fallback 사용
            invoicesData.additional.invoice_date   = recAdditional.issue_date || business.invoice_additional_date;
            // total_amount가 0이면 business_info 기반 금액 fallback 사용
            const recAdditionalAmount = recAdditional.total_amount || Math.round((Number(business.additional_cost) || 0) * 1.1);
            invoicesData.additional.invoice_amount = recAdditionalAmount;
            invoicesData.additional.payment_date   = recAdditional.payment_date || business.payment_additional_date;
            invoicesData.additional.payment_amount = recAdditional.payment_amount || Number(business.payment_additional_amount) || 0;
            invoicesData.additional.receivable     = recAdditionalAmount - (recAdditional.payment_amount || Number(business.payment_additional_amount) || 0);
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

    // invoice_records 입금액 반영 재계산
    // invoice_records에만 입금이 기록되고 business_info 필드는 0인 경우를 처리
    const getStageRecordFinal = (stage: keyof InvoiceRecordsByStage): InvoiceRecord | null =>
      invoiceRecordsByStage[stage].find(r => r.record_type === 'original') || null;

    if (category === '보조금') {
      const rec1st = getStageRecordFinal('subsidy_1st');
      const rec2nd = getStageRecordFinal('subsidy_2nd');
      const recAdditional = getStageRecordFinal('subsidy_additional');

        // invoice_records에 추가공사비가 있는데 business_info.additional_cost가 0/NULL인 경우 보완
      // (invoice_records로 마이그레이션 후 business_info 필드가 초기화된 케이스)
      if (recAdditional && (!business.additional_cost || Number(business.additional_cost) === 0)) {
        business.additional_cost = recAdditional.supply_amount || 0;
      }
      // invoice_records 레코드 있으면 실입금액 그대로 사용 (total=0이어도 입금은 유효)
      // 단, subsidy_additional은 total=0이면 bi 기반 청구금액을 쓰므로 입금도 bi 기반 사용
      // invoice_records 없으면(null) business_info 입금 필드 사용
      const pay1st = rec1st
        ? (rec1st.payment_amount || 0)
        : (Number(business.payment_1st_amount) || 0);
      const pay2nd = rec2nd
        ? (rec2nd.payment_amount || 0)
        : (Number(business.payment_2nd_amount) || 0);
      // 추가공사비: issue_date 없으면 미발행으로 간주 → 입금도 제외 (invAdditional과 동일 기준)
      const payAdditional = recAdditional
        ? (recAdditional.issue_date ? (recAdditional.payment_amount || 0) : 0)
        : (business.invoice_additional_date ? (Number(business.payment_additional_amount) || 0) : 0);
      allPayments = pay1st + pay2nd + payAdditional;
    } else {
      const recAdvance = getStageRecordFinal('self_advance');
      const recBalance = getStageRecordFinal('self_balance');
      const payAdvance = recAdvance
        ? (recAdvance.payment_amount || 0)
        : (Number(business.payment_advance_amount) || 0);
      const payBalance = recBalance
        ? (recBalance.payment_amount || 0)
        : (Number(business.payment_balance_amount) || 0);
      allPayments = payAdvance + payBalance;
    }

    // extra(추가 계산서) 입금도 반영
    const extraPayments = invoiceRecordsByStage.extra
      .filter(r => r.record_type !== 'cancelled')
      .reduce((sum, r) => sum + (r.payment_amount || 0), 0);
    allPayments += extraPayments;


    // 전체 매출 계산 (부가세 포함) — invoice_records 기반 청구금액 합계
    // revenue_adjustments는 내부 이익 조정 항목이므로 미수금 계산에서 제외
    // 미수금은 실제 발행된 계산서 금액 기준으로 계산
    let totalInvoicedAmount = 0;
    if (category === '보조금') {
      const rec1stFinal = getStageRecordFinal('subsidy_1st');
      const rec2ndFinal = getStageRecordFinal('subsidy_2nd');
      const recAdditionalFinal = getStageRecordFinal('subsidy_additional');
      // total_amount=0인 레코드는 무효 계산서 — business_info fallback 사용하지 않음 (마이너스 방지)
      // invoice_records 없으면(null) business_info 필드 fallback
      const inv1st = rec1stFinal ? (rec1stFinal.total_amount || 0) : (Number(business.invoice_1st_amount) || 0);
      const inv2nd = rec2ndFinal ? (rec2ndFinal.total_amount || 0) : (Number(business.invoice_2nd_amount) || 0);
      // 추가공사비: 발행일(issue_date) 있는 경우만 청구금액에 포함 (발행일 없으면 미발행으로 간주)
      // invoice_records 있으면 issue_date 확인, 없으면 bi.invoice_additional_date 확인
      const invAdditional = recAdditionalFinal
        ? (recAdditionalFinal.issue_date ? (recAdditionalFinal.total_amount || 0) : 0)
        : (business.invoice_additional_date ? Math.round((Number(business.additional_cost) || 0) * 1.1) : 0);
      totalInvoicedAmount = inv1st + inv2nd + invAdditional;
    } else {
      const recAdvanceFinal = getStageRecordFinal('self_advance');
      const recBalanceFinal = getStageRecordFinal('self_balance');
      const invAdvance = recAdvanceFinal ? (recAdvanceFinal.total_amount || 0) : (Number(business.invoice_advance_amount) || 0);
      const invBalance = recBalanceFinal ? (recBalanceFinal.total_amount || 0) : (Number(business.invoice_balance_amount) || 0);
      totalInvoicedAmount = invAdvance + invBalance;
    }
    // extra 계산서 포함
    const extraInvoiced = invoiceRecordsByStage.extra
      .filter(r => r.record_type !== 'cancelled')
      .reduce((sum, r) => sum + (r.total_amount || 0), 0);
    totalInvoicedAmount += extraInvoiced;

    const totalRevenueWithTax = totalInvoicedAmount; // 청구금액 기반

    // 최종 미수금 계산 — 실제 발행된 계산서 금액 - 총 입금액
    // 청구금액이 0이면 아직 계산서 미발행 상태 → 미수금 0 (선입금은 미수금으로 처리하지 않음)
    if (totalInvoicedAmount === 0) {
      totalReceivables = 0;
    } else {
      totalReceivables = calculateReceivables({
        installationDate: business.installation_date,
        totalRevenueWithTax: totalInvoicedAmount,
        totalPayments: allPayments,
      });
    }

    console.log('💰 [BUSINESS-INVOICES] 최종 미수금 계산:', {
      사업장명: business.business_name,
      totalRevenueWithTax,
      allPayments,
      totalReceivables,
    });

    return NextResponse.json({
      success: true,
      data: {
        business_id: business.id,
        business_name: business.business_name,
        business_category: category,
        additional_cost: business.additional_cost,
        invoices: invoicesData,
        total_receivables: totalReceivables,
        // 미수금 계산 근거 (UI 표시용) — revenue_adjustments는 calculateBusinessRevenue에 이미 포함됨
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
