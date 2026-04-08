import { NextRequest, NextResponse } from 'next/server';
import { queryAll, queryOne, query as pgQuery } from '@/lib/supabase-direct';
import { verifyTokenString } from '@/utils/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/installation-closing/transfers?month=2026-04
 * 해당 월 은결 송금 기록 + 매칭 현황
 */
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ success: false, message: '인증이 필요합니다.' }, { status: 401 });
    }

    const decoded = verifyTokenString(authHeader.substring(7));
    if (!decoded) {
      return NextResponse.json({ success: false, message: '유효하지 않은 토큰입니다.' }, { status: 401 });
    }

    const permissionLevel = decoded.permissionLevel || decoded.permission_level;
    if (!permissionLevel || permissionLevel < 3) {
      return NextResponse.json({ success: false, message: '권한이 필요합니다.' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month');

    if (!month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      return NextResponse.json({ success: false, message: '올바른 월 형식이 필요합니다.' }, { status: 400 });
    }

    // 송금 기록 조회
    const transfers = await queryAll(`
      SELECT
        et.*,
        COALESCE((
          SELECT SUM(ip.actual_amount)
          FROM installation_payments ip
          WHERE ip.transfer_id = et.id AND ip.status = 'paid'
        ), 0)::bigint AS matched_amount,
        COALESCE((
          SELECT COUNT(*)
          FROM installation_payments ip
          WHERE ip.transfer_id = et.id AND ip.status = 'paid'
        ), 0)::int AS matched_count
      FROM eungyeol_transfers et
      WHERE et.payment_month = $1
      ORDER BY et.transfer_date DESC
    `, [month]);

    // 해당 월 전체 지급 건 요약
    const monthSummary = await queryOne(`
      SELECT
        COALESCE(SUM(actual_amount) FILTER (WHERE status = 'paid'), 0)::bigint AS total_paid_amount,
        COALESCE(COUNT(*) FILTER (WHERE status = 'paid'), 0)::int AS total_paid_count,
        COALESCE(COUNT(DISTINCT business_id) FILTER (WHERE status = 'paid'), 0)::int AS total_businesses,
        COALESCE(SUM(actual_amount) FILTER (WHERE status = 'paid' AND transfer_id IS NOT NULL), 0)::bigint AS total_matched,
        COALESCE(SUM(actual_amount) FILTER (WHERE status = 'paid' AND transfer_id IS NULL), 0)::bigint AS total_unmatched
      FROM installation_payments
      WHERE payment_month = $1
        AND status NOT IN ('cancelled', 'deducted')
    `, [month]);

    // 은결 총 송금액
    const transferTotal = transfers.reduce((s: number, t: any) => s + Number(t.transfer_amount), 0);

    return NextResponse.json({
      success: true,
      data: {
        transfers,
        summary: {
          ...monthSummary,
          transfer_total: transferTotal,
          transfer_count: transfers.length,
        },
        month,
      },
    }, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
    });
  } catch (error: any) {
    console.error('❌ [TRANSFERS] 조회 실패:', error);
    return NextResponse.json({ success: false, message: '송금 기록 조회에 실패했습니다.' }, { status: 500 });
  }
}

/**
 * POST /api/installation-closing/transfers
 * 은결 송금 기록 등록
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ success: false, message: '인증이 필요합니다.' }, { status: 401 });
    }

    const decoded = verifyTokenString(authHeader.substring(7));
    if (!decoded) {
      return NextResponse.json({ success: false, message: '유효하지 않은 토큰입니다.' }, { status: 401 });
    }

    const userId = decoded.userId || decoded.id;
    const permissionLevel = decoded.permissionLevel || decoded.permission_level;
    if (!permissionLevel || permissionLevel < 3) {
      return NextResponse.json({ success: false, message: '권한이 필요합니다.' }, { status: 403 });
    }

    const body = await request.json();
    const { transfer_date, transfer_amount, bank_reference, payment_month, notes } = body;

    if (!transfer_date || !transfer_amount || !payment_month) {
      return NextResponse.json({ success: false, message: '송금일, 금액, 귀속 월은 필수입니다.' }, { status: 400 });
    }

    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(payment_month)) {
      return NextResponse.json({ success: false, message: '올바른 월 형식이 필요합니다.' }, { status: 400 });
    }

    const result = await queryOne(`
      INSERT INTO eungyeol_transfers
        (transfer_date, transfer_amount, bank_reference, payment_month, status, notes, created_by)
      VALUES ($1, $2, $3, $4, 'transferred', $5, $6)
      RETURNING *
    `, [transfer_date, transfer_amount, bank_reference || null, payment_month, notes || null, userId]);

    return NextResponse.json({
      success: true,
      data: result,
      message: '송금 기록이 등록되었습니다.',
    }, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
    });
  } catch (error: any) {
    console.error('❌ [TRANSFERS] 등록 실패:', error);
    return NextResponse.json({ success: false, message: '송금 기록 등록에 실패했습니다.' }, { status: 500 });
  }
}
