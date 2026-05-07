import { NextRequest, NextResponse } from 'next/server';
import { queryAll, queryOne, query as pgQuery } from '@/lib/supabase-direct';
import { verifyTokenString } from '@/utils/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function authGuard(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const decoded = verifyTokenString(authHeader.substring(7));
  if (!decoded) return null;
  const level = decoded.permissionLevel ?? decoded.permission_level;
  if (!level || level < 3) return null;
  return decoded;
}

/**
 * GET /api/commission-closing/transfers
 * 송금 이력 조회
 * Query: ?month=YYYY-MM&sales_office=
 */
export async function GET(request: NextRequest) {
  try {
    const decoded = authGuard(request);
    if (!decoded) return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month');
    const salesOffice = searchParams.get('sales_office');

    const clauses: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (month)       { clauses.push(`ct.payment_month = $${idx++}`); params.push(month); }
    if (salesOffice) { clauses.push(`ct.sales_office  = $${idx++}`); params.push(salesOffice); }

    const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : '';

    // 송금 이력 + 포함된 건수/금액
    const transfers = await queryAll(`
      SELECT
        ct.*,
        e.name AS created_by_name,
        COUNT(cp.id)::int          AS payment_count,
        SUM(cp.actual_amount)      AS linked_amount,
        jsonb_agg(jsonb_build_object(
          'id',            cp.id,
          'business_name', b.business_name,
          'sales_office',  cp.sales_office,
          'progress_type', cp.progress_type,
          'actual_amount', cp.actual_amount,
          'payment_date',  cp.payment_date
        ) ORDER BY b.business_name) AS businesses
      FROM commission_transfers ct
      LEFT JOIN commission_payments cp ON cp.transfer_id = ct.id
      LEFT JOIN business_info b  ON b.id = cp.business_id
      LEFT JOIN employees e      ON e.id = ct.created_by
      ${where}
      GROUP BY ct.id, e.name
      ORDER BY ct.transfer_date DESC, ct.created_at DESC
    `, params);

    return NextResponse.json({
      success: true,
      data: {
        transfers,
        total_amount: transfers.reduce((s: number, t: any) => s + (Number(t.transfer_amount) ?? 0), 0),
      },
    });
  } catch (error) {
    console.error('❌ [COMMISSION-TRANSFERS] GET 오류:', error);
    return NextResponse.json({ success: false, message: '서버 오류' }, { status: 500 });
  }
}

/**
 * POST /api/commission-closing/transfers
 * 송금 기록 생성 + 연결된 commission_payments → paid 처리
 *
 * Body: {
 *   sales_office: string,
 *   transfer_date: string,           // YYYY-MM-DD
 *   transfer_amount: number,
 *   bank_reference?: string,
 *   payment_month: string,
 *   notes?: string,
 *   commission_payment_ids: string[] // approved 상태인 commission_payments.id 배열
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const decoded = authGuard(request);
    if (!decoded) return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 403 });

    const userId = decoded.userId ?? decoded.id;
    const body = await request.json();
    const {
      sales_office,
      transfer_date,
      transfer_amount,
      bank_reference,
      payment_month,
      notes,
      commission_payment_ids,
    } = body;

    if (!sales_office || !transfer_date || !transfer_amount || !commission_payment_ids?.length) {
      return NextResponse.json({ success: false, message: '필수 항목 누락' }, { status: 400 });
    }

    // 1. commission_transfers 생성
    const transfer = await queryOne(
      `INSERT INTO commission_transfers
         (sales_office, transfer_date, transfer_amount, bank_reference, payment_month, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        sales_office,
        transfer_date,
        transfer_amount,
        bank_reference ?? null,
        payment_month ?? null,
        notes ?? null,
        userId,
      ]
    );

    if (!transfer) {
      return NextResponse.json({ success: false, message: '송금 기록 생성 실패' }, { status: 500 });
    }

    // 2. commission_payments → paid + transfer_id 연결
    await pgQuery(
      `UPDATE commission_payments
       SET status      = 'paid',
           transfer_id = $1,
           payment_date = $2,
           paid_by     = $3,
           updated_at  = NOW()
       WHERE id = ANY($4::uuid[])
         AND status = 'approved'`,
      [transfer.id, transfer_date, userId, commission_payment_ids]
    );

    return NextResponse.json({
      success: true,
      data: { transfer },
      message: `송금 기록이 저장되었습니다. (${commission_payment_ids.length}건)`,
    });
  } catch (error) {
    console.error('❌ [COMMISSION-TRANSFERS] POST 오류:', error);
    return NextResponse.json({ success: false, message: '서버 오류' }, { status: 500 });
  }
}
