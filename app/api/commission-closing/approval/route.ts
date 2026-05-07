import { NextRequest, NextResponse } from 'next/server';
import { transaction, queryOne } from '@/lib/supabase-direct';
import { verifyTokenString } from '@/utils/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/commission-closing/approval
 * 영업비 마감 결재 상신
 *
 * Body: {
 *   commission_payment_ids: string[],   // 결재에 포함할 commission_payments.id 배열
 *   payment_month: string,              // 귀속 월 YYYY-MM
 *   note?: string,
 *   team_leader_id?: string,
 *   executive_id?: string,
 *   vice_president_id?: string,
 *   ceo_id: string,
 * }
 *
 * 처리:
 * 1. approval_documents 생성 (type: commission_closing)
 * 2. commission_payments status → pending_approval + approval_document_id 연결
 * 3. 자동 상신 (/api/approvals/[id]/submit)
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ success: false, message: '인증이 필요합니다.' }, { status: 401 });
    }

    const decoded = verifyTokenString(authHeader.substring(7));
    if (!decoded) {
      return NextResponse.json({ success: false, message: '유효하지 않은 토큰입니다.' }, { status: 401 });
    }

    const userId = decoded.userId ?? decoded.id;
    const permissionLevel = decoded.permissionLevel ?? decoded.permission_level;
    if (!permissionLevel || permissionLevel < 3) {
      return NextResponse.json({ success: false, message: '권한이 필요합니다. (레벨 3 이상)' }, { status: 403 });
    }

    const body = await request.json();
    const {
      commission_payment_ids,
      payment_month,
      note,
      team_leader_id,
      executive_id,
      vice_president_id,
      ceo_id,
    } = body;

    if (!commission_payment_ids?.length || !ceo_id || !payment_month) {
      return NextResponse.json({ success: false, message: '필수 항목 누락: commission_payment_ids, payment_month, ceo_id' }, { status: 400 });
    }

    // 요청자 정보
    const requester = await queryOne(
      `SELECT id, name, department, role FROM employees WHERE id = $1`,
      [userId]
    );
    if (!requester) {
      return NextResponse.json({ success: false, message: '사용자 정보를 찾을 수 없습니다.' }, { status: 404 });
    }

    // 포함된 commission_payments 조회 (영업점·금액 집계용)
    const payments = await queryOne(
      `SELECT
         COUNT(*)::int                          AS count,
         SUM(actual_amount)::bigint             AS total_amount,
         array_agg(DISTINCT sales_office)       AS sales_offices,
         jsonb_agg(jsonb_build_object(
           'id',            id,
           'business_id',   business_id,
           'sales_office',  sales_office,
           'progress_type', progress_type,
           'actual_amount', actual_amount
         ))                                     AS items
       FROM commission_payments
       WHERE id = ANY($1::uuid[])
         AND status = 'eligible'`,
      [commission_payment_ids]
    );

    if (!payments || payments.count === 0) {
      return NextResponse.json({
        success: false,
        message: '결재 가능한 건이 없습니다. (eligible 상태인지 확인해주세요)',
      }, { status: 400 });
    }

    const totalAmount = Number(payments.total_amount ?? 0);
    const salesOffices: string[] = payments.sales_offices ?? [];
    const officeLabel = salesOffices.length <= 3
      ? salesOffices.join(', ')
      : `${salesOffices.slice(0, 3).join(', ')} 외 ${salesOffices.length - 3}개`;

    const title = `영업비 마감 결재 (${payment_month}, ${officeLabel}, ${payments.count}건, ${totalAmount.toLocaleString()}원)`;

    const formData = {
      writer: requester.name,
      department: requester.department ?? '',
      written_date: new Date().toISOString().split('T')[0],
      payment_month,
      commission_payment_ids,
      sales_offices: salesOffices,
      total_count: payments.count,
      total_amount: totalAmount,
      items: payments.items ?? [],
      note: note ?? '',
    };

    const result = await transaction(async (client) => {
      // 1. 문서번호 생성
      const { rows: [{ generate_document_number: docNumber }] } = await client.query(
        `SELECT generate_document_number('commission_closing')`
      );

      // 2. 결재 문서 생성
      const { rows: [doc] } = await client.query(`
        INSERT INTO approval_documents
          (document_number, document_type, title, requester_id, department,
           team_leader_id, executive_id, vice_president_id, ceo_id,
           form_data, status, current_step)
        VALUES ($1, 'commission_closing', $2, $3, $4, $5, $6, $7, $8, $9, 'draft', 0)
        RETURNING *
      `, [
        docNumber,
        title,
        userId,
        requester.department ?? '',
        team_leader_id ?? null,
        executive_id ?? null,
        vice_president_id ?? null,
        ceo_id,
        JSON.stringify(formData),
      ]);

      // 3. commission_payments → pending_approval + approval_document_id 연결
      await client.query(`
        UPDATE commission_payments
        SET status               = 'pending_approval',
            approval_document_id = $1,
            updated_at           = NOW()
        WHERE id = ANY($2::uuid[])
          AND status = 'eligible'
      `, [doc.id, commission_payment_ids]);

      return doc;
    });

    // 4. 자동 상신
    const submitRes = await fetch(
      new URL(`/api/approvals/${result.id}/submit`, request.url).toString(),
      {
        method: 'POST',
        headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }
    );
    const submitData = await submitRes.json();

    return NextResponse.json({
      success: true,
      data: {
        document_id: result.id,
        document_number: result.document_number,
        submitted: submitData.success,
      },
      message: `결재 문서가 생성되어 상신되었습니다. (${result.document_number})`,
    });
  } catch (error: any) {
    console.error('❌ [COMMISSION-APPROVAL] 오류:', error);
    return NextResponse.json({ success: false, message: '결재 문서 생성 실패' }, { status: 500 });
  }
}
