import { NextRequest, NextResponse } from 'next/server';
import { queryAll } from '@/lib/supabase-direct';
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
 * GET /api/commission-closing/summary?month=YYYY-MM
 * 영업점별 approved 건 집계 (지급 명세)
 */
export async function GET(request: NextRequest) {
  try {
    const decoded = authGuard(request);
    if (!decoded) return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month');
    const monthClause = month ? `AND cp.payment_month = '${month}'` : '';

    const rows = await queryAll(`
      SELECT
        cp.id,
        cp.business_id,
        b.business_name,
        cp.sales_office,
        cp.progress_type,
        cp.calculated_amount,
        cp.actual_amount,
        cp.status,
        cp.approved_at,
        cp.payment_date,
        cp.payment_month,
        cp.payment_note,
        cp.snapshot_data
      FROM commission_payments cp
      JOIN business_info b ON b.id = cp.business_id
      WHERE cp.status IN ('approved', 'paid')
        ${monthClause}
      ORDER BY cp.sales_office, b.business_name
    `);

    // 영업점별 그룹화
    const grouped: Record<string, any> = {};
    for (const row of rows) {
      const office = row.sales_office;
      if (!grouped[office]) {
        grouped[office] = {
          sales_office: office,
          businesses: [],
          total_amount: 0,
          approved_count: 0,
          paid_count: 0,
        };
      }
      grouped[office].businesses.push(row);
      grouped[office].total_amount += row.actual_amount ?? 0;
      if (row.status === 'approved') grouped[office].approved_count++;
      if (row.status === 'paid') grouped[office].paid_count++;
    }

    const summaries = Object.values(grouped).sort((a: any, b: any) =>
      a.sales_office.localeCompare(b.sales_office, 'ko')
    );

    const grandTotal = summaries.reduce((s: number, g: any) => s + g.total_amount, 0);

    return NextResponse.json({
      success: true,
      data: {
        summaries,
        grand_total: grandTotal,
        total_count: rows.length,
      },
    });
  } catch (error) {
    console.error('❌ [COMMISSION-SUMMARY] 오류:', error);
    return NextResponse.json({ success: false, message: '서버 오류' }, { status: 500 });
  }
}
