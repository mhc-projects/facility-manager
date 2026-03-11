import { NextRequest, NextResponse } from 'next/server';
import { query as pgQuery } from '@/lib/supabase-direct';
import { verifyTokenString } from '@/utils/auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/as-revenue
 * AS 매출관리 — 사업장별 원가/매출/이익 집계
 *
 * Query params:
 *   - period_from: "YYYY-MM" (default: 이번 달)
 *   - period_to:   "YYYY-MM" (default: 이번 달)
 *   - business_name: string (부분 검색)
 *
 * 매출단가 우선순위:
 *   1. as_material_usage.revenue_unit_price (직접 입력)
 *   2. as_material_usage.revenue_price_list_id → as_price_list.unit_price
 *   3. as_price_list (item_name 자동 매핑: price_type='revenue')
 *   4. 0원 (매핑 없음)
 */
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ success: false, error: '인증 토큰이 필요합니다' }, { status: 401 });
    }
    const token = authHeader.substring(7);
    if (!verifyTokenString(token)) {
      return NextResponse.json({ success: false, error: '유효하지 않은 토큰입니다' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);

    // 기본값: 이번 달
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const periodFrom = searchParams.get('period_from') || thisMonth;
    const periodTo = searchParams.get('period_to') || thisMonth;
    const businessName = searchParams.get('business_name');

    // YYYY-MM → YYYY-MM-01, YYYY-MM-last-day 변환
    const dateFrom = `${periodFrom}-01`;
    const [toYear, toMonth] = periodTo.split('-').map(Number);
    const dateTo = `${periodTo}-${new Date(toYear, toMonth, 0).getDate()}`;

    const conditions: string[] = ['ar.is_deleted = false', 'ar.work_date IS NOT NULL'];
    const values: (string | number)[] = [];
    let paramIdx = 1;

    conditions.push(`ar.work_date >= $${paramIdx++}`);
    values.push(dateFrom);
    conditions.push(`ar.work_date <= $${paramIdx++}`);
    values.push(dateTo);

    // 유상 AS만 집계 (자동 계산 포함)
    conditions.push(`(
      ar.is_paid_override = true
      OR (ar.is_paid_override IS NULL AND bi.delivery_date IS NOT NULL AND bi.delivery_date + INTERVAL '26 months' <= NOW())
    )`);

    if (businessName) {
      conditions.push(`(bi.business_name ILIKE $${paramIdx++} OR ar.business_name_raw ILIKE $${paramIdx - 1})`);
      values.push(`%${businessName}%`);
    }

    const whereClause = conditions.join(' AND ');

    const sql = `
      WITH record_costs AS (
        SELECT
          ar.id AS record_id,
          COALESCE(bi.business_name, ar.business_name_raw) AS business_name,
          ar.business_id,
          ar.work_date,
          ar.receipt_content,
          ar.dispatch_count,

          -- 출동 원가
          COALESCE(
            (SELECT apl.unit_price FROM as_price_list apl WHERE apl.id = ar.dispatch_cost_price_id AND apl.is_active = true),
            0
          ) * ar.dispatch_count AS dispatch_cost,

          -- 출동 매출
          COALESCE(
            (SELECT apl.unit_price FROM as_price_list apl WHERE apl.id = ar.dispatch_revenue_price_id AND apl.is_active = true),
            0
          ) * ar.dispatch_count AS dispatch_revenue,

          -- 자재 원가 합계
          COALESCE(
            (SELECT SUM(amu.quantity * amu.unit_price) FROM as_material_usage amu WHERE amu.as_record_id = ar.id),
            0
          ) AS material_cost,

          -- 자재 매출 합계 (우선순위: 직접입력 > 수동매핑 > 자동매핑 > 0)
          COALESCE(
            (
              SELECT SUM(
                amu.quantity *
                COALESCE(
                  amu.revenue_unit_price,
                  (SELECT apl2.unit_price FROM as_price_list apl2 WHERE apl2.id = amu.revenue_price_list_id AND apl2.is_active = true),
                  (
                    SELECT apl3.unit_price
                    FROM as_price_list apl3
                    WHERE apl3.item_name = amu.material_name
                      AND apl3.price_type = 'revenue'
                      AND apl3.is_active = true
                    ORDER BY apl3.sort_order ASC
                    LIMIT 1
                  ),
                  0
                )
              )
              FROM as_material_usage amu
              WHERE amu.as_record_id = ar.id
            ),
            0
          ) AS material_revenue

        FROM as_records ar
        LEFT JOIN business_info bi ON ar.business_id = bi.id
        WHERE ${whereClause}
      )
      SELECT
        business_id,
        business_name,
        COUNT(*) AS record_count,
        SUM(dispatch_count) AS total_dispatch_count,
        SUM(dispatch_cost) AS total_dispatch_cost,
        SUM(dispatch_revenue) AS total_dispatch_revenue,
        SUM(material_cost) AS total_material_cost,
        SUM(material_revenue) AS total_material_revenue,
        SUM(dispatch_cost + material_cost) AS total_cost,
        SUM(dispatch_revenue + material_revenue) AS total_revenue,
        SUM((dispatch_revenue + material_revenue) - (dispatch_cost + material_cost)) AS profit,
        JSON_AGG(
          JSON_BUILD_OBJECT(
            'id', record_id,
            'work_date', work_date,
            'receipt_content', receipt_content,
            'dispatch_count', dispatch_count,
            'dispatch_cost', dispatch_cost,
            'dispatch_revenue', dispatch_revenue,
            'material_cost', material_cost,
            'material_revenue', material_revenue,
            'total_cost', dispatch_cost + material_cost,
            'total_revenue', dispatch_revenue + material_revenue,
            'profit', (dispatch_revenue + material_revenue) - (dispatch_cost + material_cost)
          )
          ORDER BY work_date DESC
        ) AS records
      FROM record_costs
      GROUP BY business_id, business_name
      ORDER BY business_name ASC
    `;

    const result = await pgQuery(sql, values);

    // 요약 집계
    const businesses = result.rows.map((row: Record<string, unknown>) => {
      const totalRevenue = Number(row.total_revenue);
      return {
        business_id: row.business_id,
        business_name: row.business_name,
        record_count: Number(row.record_count),
        total_dispatch_count: Number(row.total_dispatch_count),
        total_dispatch_cost: Number(row.total_dispatch_cost),
        total_dispatch_revenue: Number(row.total_dispatch_revenue),
        total_material_cost: Number(row.total_material_cost),
        total_material_revenue: Number(row.total_material_revenue),
        total_cost: Number(row.total_cost),
        total_revenue: totalRevenue,
        profit: Number(row.profit),
        profit_rate: totalRevenue > 0 ? Math.round((Number(row.profit) / totalRevenue) * 1000) / 10 : 0,
        records: row.records || [],
      };
    });

    type BizRow = typeof businesses[0];
    type BizSummary = { paid_count: number; total_dispatch_cost: number; total_dispatch_revenue: number; total_material_cost: number; total_material_revenue: number; total_cost: number; total_revenue: number; profit: number; };
    const summary = businesses.reduce(
      (acc: BizSummary, b: BizRow) => ({
        paid_count: acc.paid_count + b.record_count,
        total_dispatch_cost: acc.total_dispatch_cost + b.total_dispatch_cost,
        total_dispatch_revenue: acc.total_dispatch_revenue + b.total_dispatch_revenue,
        total_material_cost: acc.total_material_cost + b.total_material_cost,
        total_material_revenue: acc.total_material_revenue + b.total_material_revenue,
        total_cost: acc.total_cost + b.total_cost,
        total_revenue: acc.total_revenue + b.total_revenue,
        profit: acc.profit + b.profit,
      }),
      {
        paid_count: 0,
        total_dispatch_cost: 0,
        total_dispatch_revenue: 0,
        total_material_cost: 0,
        total_material_revenue: 0,
        total_cost: 0,
        total_revenue: 0,
        profit: 0,
      }
    );

    const profitRate = summary.total_revenue > 0
      ? Math.round((summary.profit / summary.total_revenue) * 1000) / 10
      : 0;

    return NextResponse.json({
      success: true,
      period: { from: dateFrom, to: dateTo },
      summary: { ...summary, profit_rate: profitRate },
      businesses,
    });
  } catch (error) {
    console.error('[as-revenue] GET error:', error);
    return NextResponse.json({ success: false, error: '매출 조회 실패' }, { status: 500 });
  }
}
