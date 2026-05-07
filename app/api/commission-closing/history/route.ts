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
 * GET /api/commission-closing/history
 * 영업비 지급 이력 (paid + cancelled)
 * Query: ?sales_office=&month=&progress_type=&page=1&limit=50
 */
export async function GET(request: NextRequest) {
  try {
    const decoded = authGuard(request);
    if (!decoded) return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const salesOffice = searchParams.get('sales_office');
    const month = searchParams.get('month');
    const progressType = searchParams.get('progress_type');
    const page = parseInt(searchParams.get('page') ?? '1');
    const limit = parseInt(searchParams.get('limit') ?? '50');
    const offset = (page - 1) * limit;

    const clauses: string[] = ["cp.status IN ('paid', 'cancelled')"];
    const params: any[] = [];
    let idx = 1;

    if (salesOffice) { clauses.push(`cp.sales_office = $${idx++}`); params.push(salesOffice); }
    if (month)       { clauses.push(`cp.payment_month = $${idx++}`); params.push(month); }
    if (progressType){ clauses.push(`cp.progress_type = $${idx++}`); params.push(progressType); }

    const where = clauses.join(' AND ');

    const rows = await queryAll(`
      SELECT
        cp.id,
        b.business_name,
        cp.sales_office,
        cp.progress_type,
        cp.calculated_amount,
        cp.actual_amount,
        cp.status,
        cp.payment_month,
        cp.payment_date,
        cp.payment_note,
        cp.approved_at,
        cp.triggered_at,
        cp.trigger_type,
        e_paid.name     AS paid_by_name,
        e_approved.name AS approved_by_name
      FROM commission_payments cp
      JOIN business_info b     ON b.id = cp.business_id
      LEFT JOIN employees e_paid     ON e_paid.id = cp.paid_by
      LEFT JOIN employees e_approved ON e_approved.id = cp.approved_by
      WHERE ${where}
      ORDER BY cp.payment_date DESC NULLS LAST, cp.updated_at DESC
      LIMIT $${idx} OFFSET $${idx + 1}
    `, [...params, limit, offset]);

    // 집계
    const totals = await queryAll(`
      SELECT
        COUNT(*)::int AS total_count,
        SUM(actual_amount) AS total_amount,
        COUNT(*) FILTER (WHERE status='paid')::int AS paid_count
      FROM commission_payments cp
      WHERE ${where}
    `, params);

    const summary = totals[0] ?? { total_count: 0, total_amount: 0, paid_count: 0 };

    return NextResponse.json({
      success: true,
      data: {
        records: rows,
        pagination: { page, limit, total: summary.total_count },
        summary,
      },
    });
  } catch (error) {
    console.error('❌ [COMMISSION-HISTORY] 오류:', error);
    return NextResponse.json({ success: false, message: '서버 오류' }, { status: 500 });
  }
}
