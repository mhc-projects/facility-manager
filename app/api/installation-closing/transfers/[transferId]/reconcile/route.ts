import { NextRequest, NextResponse } from 'next/server';
import { transaction, queryOne, queryAll } from '@/lib/supabase-direct';
import { verifyTokenString } from '@/utils/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * PUT /api/installation-closing/transfers/[transferId]/reconcile
 * 대사 처리: 지급 건들을 송금건에 매칭
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ transferId: string }> }
) {
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

    const { transferId } = await params;
    const body = await request.json();
    const { payment_ids } = body;

    if (!Array.isArray(payment_ids) || payment_ids.length === 0) {
      return NextResponse.json({ success: false, message: 'payment_ids가 필요합니다.' }, { status: 400 });
    }

    // 송금 기록 확인
    const transfer = await queryOne(
      `SELECT * FROM eungyeol_transfers WHERE id = $1`,
      [transferId]
    );

    if (!transfer) {
      return NextResponse.json({ success: false, message: '송금 기록을 찾을 수 없습니다.' }, { status: 404 });
    }

    const result = await transaction(async (client) => {
      // 선택된 지급 건들에 transfer_id 연결
      const { rowCount } = await client.query(`
        UPDATE installation_payments
        SET transfer_id = $1
        WHERE id = ANY($2) AND status = 'paid'
      `, [transferId, payment_ids]);

      // 매칭 후 합계 계산
      const { rows: [summary] } = await client.query(`
        SELECT
          COALESCE(SUM(actual_amount), 0)::bigint AS matched_amount,
          COUNT(*)::int AS matched_count
        FROM installation_payments
        WHERE transfer_id = $1 AND status = 'paid'
      `, [transferId]);

      const matchedAmount = Number(summary.matched_amount);
      const transferAmount = Number(transfer.transfer_amount);
      const isReconciled = matchedAmount === transferAmount;

      // 대사 완료 여부에 따라 상태 업데이트
      if (isReconciled) {
        await client.query(`
          UPDATE eungyeol_transfers SET status = 'reconciled' WHERE id = $1
        `, [transferId]);
      }

      return {
        matched_payments: rowCount,
        matched_amount: matchedAmount,
        transfer_amount: transferAmount,
        unmatched_amount: transferAmount - matchedAmount,
        is_reconciled: isReconciled,
      };
    });

    const warning = result.unmatched_amount !== 0
      ? `송금액(${result.transfer_amount.toLocaleString()})과 매칭액(${result.matched_amount.toLocaleString()})이 ${Math.abs(result.unmatched_amount).toLocaleString()}원 차이납니다.`
      : null;

    return NextResponse.json({
      success: true,
      data: result,
      message: `${result.matched_payments}건 매칭 완료${result.is_reconciled ? ' (대사 완료)' : ''}`,
      warning,
    }, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
    });
  } catch (error: any) {
    console.error('❌ [RECONCILE] 대사 처리 실패:', error);
    return NextResponse.json({ success: false, message: '대사 처리에 실패했습니다.' }, { status: 500 });
  }
}
