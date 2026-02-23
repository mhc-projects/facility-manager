// app/api/business-invoices/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { queryOne, query as pgQuery } from '@/lib/supabase-direct';

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

    if (category === '보조금') {
      // 추가공사비는 계산서가 발행된 경우에만 미수금 계산 (부가세 10% 포함)
      const hasAdditionalInvoice = business.invoice_additional_date;
      const additionalCostInvoice = hasAdditionalInvoice ? Math.round((business.additional_cost || 0) * 1.1) : 0;

      // 총액 방식: 전체 계산서 합계 - 전체 입금 합계
      const totalInvoices = (business.invoice_1st_amount || 0) +
                           (business.invoice_2nd_amount || 0) +
                           additionalCostInvoice;

      const totalPayments = (business.payment_1st_amount || 0) +
                           (business.payment_2nd_amount || 0) +
                           (business.payment_additional_amount || 0);

      totalReceivables = totalInvoices - totalPayments;

      // 각 차수별 미수금 (참고용)
      const receivable1st = (business.invoice_1st_amount || 0) - (business.payment_1st_amount || 0);
      const receivable2nd = (business.invoice_2nd_amount || 0) - (business.payment_2nd_amount || 0);
      const receivableAdditional = hasAdditionalInvoice
        ? Math.round((business.additional_cost || 0) * 1.1) - (business.payment_additional_amount || 0)
        : 0;

      invoicesData = {
        first: {
          invoice_date: business.invoice_1st_date,
          invoice_amount: business.invoice_1st_amount,
          payment_date: business.payment_1st_date,
          payment_amount: business.payment_1st_amount,
          receivable: receivable1st,
        },
        second: {
          invoice_date: business.invoice_2nd_date,
          invoice_amount: business.invoice_2nd_amount,
          payment_date: business.payment_2nd_date,
          payment_amount: business.payment_2nd_amount,
          receivable: receivable2nd,
        },
        additional: {
          invoice_date: business.invoice_additional_date,
          invoice_amount: Math.round((business.additional_cost || 0) * 1.1), // 추가공사비 + 부가세 10%
          payment_date: business.payment_additional_date,
          payment_amount: business.payment_additional_amount,
          receivable: receivableAdditional,
        },
      };
    } else if (category === '자비') {
      // 총액 방식: 전체 계산서 합계 - 전체 입금 합계
      const totalInvoices = (business.invoice_advance_amount || 0) +
                           (business.invoice_balance_amount || 0);

      const totalPayments = (business.payment_advance_amount || 0) +
                           (business.payment_balance_amount || 0);

      totalReceivables = totalInvoices - totalPayments;

      // 각 차수별 미수금 (참고용)
      const receivableAdvance = (business.invoice_advance_amount || 0) - (business.payment_advance_amount || 0);
      const receivableBalance = (business.invoice_balance_amount || 0) - (business.payment_balance_amount || 0);

      invoicesData = {
        advance: {
          invoice_date: business.invoice_advance_date,
          invoice_amount: business.invoice_advance_amount,
          payment_date: business.payment_advance_date,
          payment_amount: business.payment_advance_amount,
          receivable: receivableAdvance,
        },
        balance: {
          invoice_date: business.invoice_balance_date,
          invoice_amount: business.invoice_balance_amount,
          payment_date: business.payment_balance_date,
          payment_amount: business.payment_balance_amount,
          receivable: receivableBalance,
        },
      };
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
 * PUT - 계산서/입금 정보 업데이트
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
