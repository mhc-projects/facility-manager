// app/api/invoice-records/route.ts
// 계산서 발행 상세 레코드 CRUD API
import { NextRequest, NextResponse } from 'next/server';
import { query as pgQuery, queryOne } from '@/lib/supabase-direct';
import { verifyTokenString } from '@/utils/auth';
import type { CreateInvoiceRecordRequest } from '@/types/invoice';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Bearer 토큰 인증 (as-records, business-collection-manager와 동일 패턴)
function authGuard(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  return verifyTokenString(authHeader.substring(7));
}

// invoice_stage → business_info 컬럼 매핑
const STAGE_TO_COLUMNS: Record<string, { date: string; amount?: string; paymentDate: string; paymentAmount: string } | null> = {
  subsidy_1st:        { date: 'invoice_1st_date',        amount: 'invoice_1st_amount',      paymentDate: 'payment_1st_date',        paymentAmount: 'payment_1st_amount' },
  subsidy_2nd:        { date: 'invoice_2nd_date',        amount: 'invoice_2nd_amount',      paymentDate: 'payment_2nd_date',        paymentAmount: 'payment_2nd_amount' },
  subsidy_additional: { date: 'invoice_additional_date', amount: undefined,                 paymentDate: 'payment_additional_date', paymentAmount: 'payment_additional_amount' },
  self_advance:       { date: 'invoice_advance_date',    amount: 'invoice_advance_amount',  paymentDate: 'payment_advance_date',    paymentAmount: 'payment_advance_amount' },
  self_balance:       { date: 'invoice_balance_date',    amount: 'invoice_balance_amount',  paymentDate: 'payment_balance_date',    paymentAmount: 'payment_balance_amount' },
  extra:              null, // business_info 동기화 없음
};

/**
 * POST - 새 계산서 레코드 생성
 * - 기존 단계의 상세 발행정보
 * - 수정발행 (record_type: 'revised')
 * - 추가 계산서 (invoice_stage: 'extra')
 */
export async function POST(request: NextRequest) {
  try {
    const decoded = authGuard(request);
    if (!decoded) {
      return NextResponse.json({ success: false, message: '인증이 필요합니다' }, { status: 401 });
    }

    const body: CreateInvoiceRecordRequest = await request.json();
    const {
      business_id,
      invoice_stage,
      extra_title,
      record_type = 'original',
      parent_record_id,
      revised_reason,
      issue_date,
      invoice_number,
      supply_amount = 0,
      tax_amount,
      payment_date,
      payment_amount = 0,
      payment_memo,
    } = body;

    // 필수값 검증
    if (!business_id || !invoice_stage) {
      return NextResponse.json(
        { success: false, message: '사업장 ID와 계산서 단계가 필요합니다' },
        { status: 400 }
      );
    }

    const validStages = ['subsidy_1st', 'subsidy_2nd', 'subsidy_additional', 'self_advance', 'self_balance', 'extra'];
    if (!validStages.includes(invoice_stage)) {
      return NextResponse.json(
        { success: false, message: '유효하지 않은 계산서 단계입니다' },
        { status: 400 }
      );
    }

    if (invoice_stage === 'extra' && !extra_title?.trim()) {
      return NextResponse.json(
        { success: false, message: '추가 계산서 제목이 필요합니다' },
        { status: 400 }
      );
    }

    if (record_type === 'revised' && !parent_record_id) {
      return NextResponse.json(
        { success: false, message: '수정발행 시 원본 계산서 ID가 필요합니다' },
        { status: 400 }
      );
    }

    // 사업장 존재 확인
    const business = await queryOne(
      'SELECT id FROM business_info WHERE id = $1',
      [business_id]
    );
    if (!business) {
      return NextResponse.json(
        { success: false, message: '사업장을 찾을 수 없습니다' },
        { status: 404 }
      );
    }

    // 세액 계산: 미입력 시 공급가액 * 10%
    const calculatedTax = tax_amount !== undefined ? tax_amount : Math.round(supply_amount * 0.1);
    const calculatedTotal = supply_amount + calculatedTax;

    console.log('📝 [INVOICE-RECORDS] POST - 계산서 레코드 생성:', {
      business_id,
      invoice_stage,
      record_type,
      supply_amount,
      calculatedTax,
      calculatedTotal,
    });

    // invoice_records 테이블에 저장
    const insertResult = await pgQuery(
      `INSERT INTO invoice_records (
        business_id, invoice_stage, extra_title, record_type,
        parent_record_id, revised_reason,
        issue_date, invoice_number, supply_amount, tax_amount, total_amount,
        payment_date, payment_amount, payment_memo
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *`,
      [
        business_id,
        invoice_stage,
        extra_title || null,
        record_type,
        parent_record_id || null,
        revised_reason || null,
        issue_date || null,
        invoice_number || null,
        supply_amount,
        calculatedTax,
        calculatedTotal,
        payment_date || null,
        payment_amount,
        payment_memo || null,
      ]
    );

    if (!insertResult.rows || insertResult.rows.length === 0) {
      return NextResponse.json(
        { success: false, message: '계산서 레코드 생성 실패' },
        { status: 500 }
      );
    }

    const newRecord = insertResult.rows[0];

    // business_info 동기화 (extra가 아닌 기존 단계, 원본 발행인 경우)
    // 수정발행은 가장 최신 레코드가 실질적 발행이므로 동기화
    if (invoice_stage !== 'extra' && record_type !== 'cancelled') {
      const columns = STAGE_TO_COLUMNS[invoice_stage];
      if (columns) {
        const syncData: Record<string, any> = {};

        if (issue_date !== undefined) syncData[columns.date] = issue_date;
        if (columns.amount && supply_amount !== undefined) {
          syncData[columns.amount] = calculatedTotal; // 합계금액으로 동기화
        }
        if (payment_date !== undefined) syncData[columns.paymentDate] = payment_date;
        if (payment_amount !== undefined) syncData[columns.paymentAmount] = payment_amount;

        if (Object.keys(syncData).length > 0) {
          const syncFields = Object.keys(syncData);
          const setClause = syncFields.map((f, i) => `${f} = $${i + 1}`).join(', ');
          const syncValues = syncFields.map(f => syncData[f]);
          syncValues.push(business_id);

          await pgQuery(
            `UPDATE business_info SET ${setClause} WHERE id = $${syncValues.length}`,
            syncValues
          );
          console.log('🔄 [INVOICE-RECORDS] business_info 동기화 완료:', invoice_stage);
        }
      }
    }

    console.log('✅ [INVOICE-RECORDS] POST - 생성 완료:', newRecord.id);

    return NextResponse.json({
      success: true,
      data: newRecord,
      message: '계산서 레코드가 생성되었습니다',
    });
  } catch (error: any) {
    console.error('Unexpected error in POST /api/invoice-records:', error);
    return NextResponse.json(
      { success: false, message: '서버 오류가 발생했습니다', error: error.message },
      { status: 500 }
    );
  }
}

/**
 * PUT - 기존 계산서 레코드 수정 (오기 정정)
 * Body: { id, ...수정필드 }
 */
export async function PUT(request: NextRequest) {
  try {
    const decoded = authGuard(request);
    if (!decoded) {
      return NextResponse.json({ success: false, message: '인증이 필요합니다' }, { status: 401 });
    }

    const body = await request.json();
    const {
      id,
      issue_date,
      invoice_number,
      supply_amount,
      tax_amount,
      payment_date,
      payment_amount,
      payment_memo,
      revised_reason,
      extra_title,
    } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, message: '레코드 ID가 필요합니다' },
        { status: 400 }
      );
    }

    // 기존 레코드 조회
    const existing = await queryOne(
      'SELECT * FROM invoice_records WHERE id = $1 AND is_active = TRUE',
      [id]
    );

    if (!existing) {
      return NextResponse.json(
        { success: false, message: '계산서 레코드를 찾을 수 없습니다' },
        { status: 404 }
      );
    }

    // 업데이트 데이터 구성
    const updateData: Record<string, any> = {};
    if (issue_date !== undefined) updateData.issue_date = issue_date;
    if (invoice_number !== undefined) updateData.invoice_number = invoice_number;
    if (extra_title !== undefined) updateData.extra_title = extra_title;
    if (revised_reason !== undefined) updateData.revised_reason = revised_reason;
    if (payment_date !== undefined) updateData.payment_date = payment_date;
    if (payment_memo !== undefined) updateData.payment_memo = payment_memo;

    // 금액은 함께 재계산
    const newSupply = supply_amount !== undefined ? supply_amount : existing.supply_amount;
    const newTax = tax_amount !== undefined ? tax_amount : existing.tax_amount;
    if (supply_amount !== undefined || tax_amount !== undefined) {
      updateData.supply_amount = newSupply;
      updateData.tax_amount = newTax;
      updateData.total_amount = newSupply + newTax;
    }
    if (payment_amount !== undefined) updateData.payment_amount = payment_amount;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { success: false, message: '업데이트할 데이터가 없습니다' },
        { status: 400 }
      );
    }

    const updateFields = Object.keys(updateData);
    const setClause = updateFields.map((f, i) => `${f} = $${i + 1}`).join(', ');
    const values = updateFields.map(f => updateData[f]);
    values.push(id);

    const updateResult = await pgQuery(
      `UPDATE invoice_records SET ${setClause} WHERE id = $${values.length} RETURNING *`,
      values
    );

    if (!updateResult.rows || updateResult.rows.length === 0) {
      return NextResponse.json(
        { success: false, message: '업데이트 실패' },
        { status: 500 }
      );
    }

    const updated = updateResult.rows[0];

    // business_info 동기화 (extra, 수정/취소 레코드 제외)
    if (existing.invoice_stage !== 'extra' && existing.record_type === 'original') {
      const columns = STAGE_TO_COLUMNS[existing.invoice_stage];
      if (columns) {
        const syncData: Record<string, any> = {};
        if (issue_date !== undefined) syncData[columns.date] = issue_date;
        if (columns.amount && (supply_amount !== undefined || tax_amount !== undefined)) {
          syncData[columns.amount] = newSupply + newTax;
        }
        if (payment_date !== undefined) syncData[columns.paymentDate] = payment_date;
        if (payment_amount !== undefined) syncData[columns.paymentAmount] = payment_amount;

        if (Object.keys(syncData).length > 0) {
          const syncFields = Object.keys(syncData);
          const setClause2 = syncFields.map((f, i) => `${f} = $${i + 1}`).join(', ');
          const syncValues = syncFields.map(f => syncData[f]);
          syncValues.push(existing.business_id);
          await pgQuery(
            `UPDATE business_info SET ${setClause2} WHERE id = $${syncValues.length}`,
            syncValues
          );
        }
      }
    }

    console.log('✅ [INVOICE-RECORDS] PUT - 수정 완료:', id);

    return NextResponse.json({
      success: true,
      data: updated,
      message: '계산서 레코드가 수정되었습니다',
    });
  } catch (error: any) {
    console.error('Unexpected error in PUT /api/invoice-records:', error);
    return NextResponse.json(
      { success: false, message: '서버 오류가 발생했습니다', error: error.message },
      { status: 500 }
    );
  }
}

/**
 * DELETE - 계산서 레코드 소프트 삭제
 * Query params: id
 */
export async function DELETE(request: NextRequest) {
  try {
    const decoded = authGuard(request);
    if (!decoded) {
      return NextResponse.json({ success: false, message: '인증이 필요합니다' }, { status: 401 });
    }
    const level = decoded.permissionLevel ?? decoded.permission_level;
    if (!level || level < 3) {
      return NextResponse.json({ success: false, message: '권한이 없습니다' }, { status: 403 });
    }

    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { success: false, message: '레코드 ID가 필요합니다' },
        { status: 400 }
      );
    }

    const existing = await queryOne(
      'SELECT * FROM invoice_records WHERE id = $1 AND is_active = TRUE',
      [id]
    );

    if (!existing) {
      return NextResponse.json(
        { success: false, message: '계산서 레코드를 찾을 수 없습니다' },
        { status: 404 }
      );
    }

    await pgQuery(
      'UPDATE invoice_records SET is_active = FALSE WHERE id = $1',
      [id]
    );

    console.log('✅ [INVOICE-RECORDS] DELETE - 소프트삭제 완료:', id);

    return NextResponse.json({
      success: true,
      message: '계산서 레코드가 삭제되었습니다',
    });
  } catch (error: any) {
    console.error('Unexpected error in DELETE /api/invoice-records:', error);
    return NextResponse.json(
      { success: false, message: '서버 오류가 발생했습니다', error: error.message },
      { status: 500 }
    );
  }
}
