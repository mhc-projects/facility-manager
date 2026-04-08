import { NextRequest, NextResponse } from 'next/server';
import { queryAll } from '@/lib/supabase-direct';
import { verifyTokenString } from '@/utils/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/installation-closing/transfers/[transferId]/payments
 * 송금건에 매칭된 지급 건 목록 + 미매칭 건 목록
 */
export async function GET(
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

    const { transferId } = await params;

    // 매칭된 건
    const matched = await queryAll(`
      SELECT ip.id, ip.business_id, ip.payment_type, ip.payment_category,
             ip.actual_amount, ip.status,
             b.business_name, b.sales_office
      FROM installation_payments ip
      JOIN business_info b ON b.id = ip.business_id
      WHERE ip.transfer_id = $1 AND ip.status = 'paid'
      ORDER BY b.business_name
    `, [transferId]);

    // 같은 월의 미매칭 건 (transfer_id가 NULL인 paid 건)
    const transfer = await queryAll(`SELECT payment_month FROM eungyeol_transfers WHERE id = $1`, [transferId]);
    let unmatched: any[] = [];
    if (transfer[0]) {
      unmatched = await queryAll(`
        SELECT ip.id, ip.business_id, ip.payment_type, ip.payment_category,
               ip.actual_amount, ip.status,
               b.business_name, b.sales_office
        FROM installation_payments ip
        JOIN business_info b ON b.id = ip.business_id
        WHERE ip.payment_month = $1 AND ip.status = 'paid' AND ip.transfer_id IS NULL
        ORDER BY b.business_name
      `, [transfer[0].payment_month]);
    }

    return NextResponse.json({
      success: true,
      data: { matched, unmatched },
    }, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
    });
  } catch (error: any) {
    console.error('❌ [TRANSFER-PAYMENTS] 조회 실패:', error);
    return NextResponse.json({ success: false, message: '매칭 상세 조회에 실패했습니다.' }, { status: 500 });
  }
}
