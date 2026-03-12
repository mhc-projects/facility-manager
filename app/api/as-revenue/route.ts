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

    // 유상/무상 모두 집계 (출동비는 공통, 자재는 유상만)

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

          -- 유상/무상 판단
          CASE
            WHEN ar.is_paid_override = false THEN true
            WHEN ar.is_paid_override IS NULL AND (
              bi.delivery_date IS NULL
              OR bi.delivery_date + INTERVAL '26 months' > NOW()
            ) THEN true
            ELSE false
          END AS is_free,

          -- 출동 원가 (무상/유상 공통)
          COALESCE(
            (SELECT apl.unit_price FROM as_price_list apl WHERE apl.id = ar.dispatch_cost_price_id AND apl.is_active = true),
            0
          ) * ar.dispatch_count AS dispatch_cost,

          -- 출동 매출 (무상이면 0)
          CASE
            WHEN ar.is_paid_override = false THEN 0
            WHEN ar.is_paid_override IS NULL AND (
              bi.delivery_date IS NULL
              OR bi.delivery_date + INTERVAL '26 months' > NOW()
            ) THEN 0
            ELSE COALESCE(
              (SELECT apl.unit_price FROM as_price_list apl WHERE apl.id = ar.dispatch_revenue_price_id AND apl.is_active = true),
              0
            ) * ar.dispatch_count
          END AS dispatch_revenue,

          -- 자재 원가 합계 (무상이면 0)
          CASE
            WHEN ar.is_paid_override = false THEN 0
            WHEN ar.is_paid_override IS NULL AND (
              bi.delivery_date IS NULL
              OR bi.delivery_date + INTERVAL '26 months' > NOW()
            ) THEN 0
            ELSE COALESCE(
              (SELECT SUM(amu.quantity * amu.unit_price) FROM as_material_usage amu WHERE amu.as_record_id = ar.id),
              0
            )
          END AS material_cost,

          -- 자재 매출 합계 (무상이면 0, 우선순위: 직접입력 > 수동매핑 > 자동매핑 > 0)
          CASE
            WHEN ar.is_paid_override = false THEN 0
            WHEN ar.is_paid_override IS NULL AND (
              bi.delivery_date IS NULL
              OR bi.delivery_date + INTERVAL '26 months' > NOW()
            ) THEN 0
            ELSE COALESCE(
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
            )
          END AS material_revenue,

          -- 매출 조정 합계 (무상이면 0)
          CASE
            WHEN ar.is_paid_override = false THEN 0
            WHEN ar.is_paid_override IS NULL AND (
              bi.delivery_date IS NULL
              OR bi.delivery_date + INTERVAL '26 months' > NOW()
            ) THEN 0
            ELSE COALESCE(
              (SELECT SUM(apa.amount) FROM as_price_adjustments apa
               WHERE apa.as_record_id = ar.id AND apa.adjustment_type = 'revenue' AND apa.is_deleted = false),
              0
            )
          END AS revenue_adjustment,

          -- 매입 조정 합계 (무상이면 0)
          CASE
            WHEN ar.is_paid_override = false THEN 0
            WHEN ar.is_paid_override IS NULL AND (
              bi.delivery_date IS NULL
              OR bi.delivery_date + INTERVAL '26 months' > NOW()
            ) THEN 0
            ELSE COALESCE(
              (SELECT SUM(apa.amount) FROM as_price_adjustments apa
               WHERE apa.as_record_id = ar.id AND apa.adjustment_type = 'cost' AND apa.is_deleted = false),
              0
            )
          END AS cost_adjustment

        FROM as_records ar
        LEFT JOIN business_info bi ON ar.business_id = bi.id
        WHERE ${whereClause}
      )
      SELECT
        business_id,
        business_name,
        COUNT(*) AS record_count,
        SUM(CASE WHEN is_free THEN 1 ELSE 0 END) AS free_record_count,
        SUM(dispatch_count) AS total_dispatch_count,
        SUM(dispatch_cost) AS total_dispatch_cost,
        SUM(dispatch_revenue) AS total_dispatch_revenue,
        SUM(material_cost) AS total_material_cost,
        SUM(material_revenue) AS total_material_revenue,
        SUM(revenue_adjustment) AS total_revenue_adjustment,
        SUM(cost_adjustment) AS total_cost_adjustment,
        SUM(dispatch_cost + material_cost + cost_adjustment) AS total_cost,
        SUM(dispatch_revenue + material_revenue + revenue_adjustment) AS total_revenue,
        SUM((dispatch_revenue + material_revenue + revenue_adjustment) - (dispatch_cost + material_cost + cost_adjustment)) AS profit,
        JSON_AGG(
          JSON_BUILD_OBJECT(
            'id', record_id,
            'work_date', work_date,
            'receipt_content', receipt_content,
            'dispatch_count', dispatch_count,
            'is_free', is_free,
            'dispatch_cost', dispatch_cost,
            'dispatch_revenue', dispatch_revenue,
            'material_cost', material_cost,
            'material_revenue', material_revenue,
            'revenue_adjustment', revenue_adjustment,
            'cost_adjustment', cost_adjustment,
            'total_cost', dispatch_cost + material_cost + cost_adjustment,
            'total_revenue', dispatch_revenue + material_revenue + revenue_adjustment,
            'profit', (dispatch_revenue + material_revenue + revenue_adjustment) - (dispatch_cost + material_cost + cost_adjustment)
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
      const profit = Number(row.profit);
      const totalDispatchCost = Number(row.total_dispatch_cost);
      const totalMaterialRevenue = Number(row.total_material_revenue);
      const totalMaterialCost = Number(row.total_material_cost);
      const totalRevenueAdjustment = Number(row.total_revenue_adjustment);
      const totalCostAdjustment = Number(row.total_cost_adjustment);
      // 인센티브: 자재마진 기준, 유상만 (무상은 material_revenue/cost = 0이므로 자동으로 0)
      const incentivePay = Math.round((totalMaterialRevenue - totalMaterialCost) * 0.3);
      const dispatchPay = totalDispatchCost;
      // total_manager_pay = dispatch_pay + incentive_pay (표시용)
      // 단, net_profit 계산 시 dispatch_pay는 이미 profit에 반영 → incentive_pay만 추가 차감
      const totalManagerPay = incentivePay + dispatchPay;
      const records = ((row.records as Record<string, unknown>[]) || []).map((rec: Record<string, unknown>) => {
        const recProfit = Number(rec.profit);
        const recDispatchCost = Number(rec.dispatch_cost);
        const recMaterialRevenue = Number(rec.material_revenue);
        const recMaterialCost = Number(rec.material_cost);
        const recIsFree = Boolean(rec.is_free);
        const recIncentivePay = recIsFree ? 0 : Math.round((recMaterialRevenue - recMaterialCost) * 0.3);
        const recDispatchPay = recDispatchCost;
        const recTotalManagerPay = recIncentivePay + recDispatchPay;
        // dispatch_cost는 이미 profit(total_cost)에 반영되어 있으므로
        // net_profit에서 dispatch_pay를 다시 빼면 이중차감됨
        // → net_profit = profit - incentive_pay (인센티브만 추가 차감)
        const recNetProfit = recProfit - recIncentivePay;
        return {
          ...rec,
          is_free: recIsFree,
          revenue_adjustment: Number(rec.revenue_adjustment),
          cost_adjustment: Number(rec.cost_adjustment),
          incentive_pay: recIncentivePay,
          dispatch_pay: recDispatchPay,
          total_manager_pay: recTotalManagerPay,
          net_profit: recNetProfit,
        };
      });
      // 사업장 net_profit = 레코드별 net_profit 합산 (이중차감 방지)
      const bizNetProfit = records.reduce((sum: number, rec: Record<string, unknown>) => sum + Number(rec.net_profit), 0);
      return {
        business_id: row.business_id,
        business_name: row.business_name,
        record_count: Number(row.record_count),
        free_record_count: Number(row.free_record_count),
        total_dispatch_count: Number(row.total_dispatch_count),
        total_dispatch_cost: totalDispatchCost,
        total_dispatch_revenue: Number(row.total_dispatch_revenue),
        total_material_cost: totalMaterialCost,
        total_material_revenue: totalMaterialRevenue,
        total_revenue_adjustment: totalRevenueAdjustment,
        total_cost_adjustment: totalCostAdjustment,
        total_cost: Number(row.total_cost),
        total_revenue: totalRevenue,
        profit,
        profit_rate: totalRevenue > 0 ? Math.round((bizNetProfit / totalRevenue) * 1000) / 10 : 0,
        incentive_pay: incentivePay,
        dispatch_pay: dispatchPay,
        total_manager_pay: totalManagerPay,
        net_profit: bizNetProfit,
        records,
      };
    });

    type BizRow = typeof businesses[0];
    type BizSummary = { paid_count: number; total_dispatch_cost: number; total_dispatch_revenue: number; total_material_cost: number; total_material_revenue: number; total_revenue_adjustment: number; total_cost_adjustment: number; total_cost: number; total_revenue: number; profit: number; total_manager_pay: number; net_profit: number; };
    const summary = businesses.reduce(
      (acc: BizSummary, b: BizRow) => ({
        paid_count: acc.paid_count + b.record_count,
        total_dispatch_cost: acc.total_dispatch_cost + b.total_dispatch_cost,
        total_dispatch_revenue: acc.total_dispatch_revenue + b.total_dispatch_revenue,
        total_material_cost: acc.total_material_cost + b.total_material_cost,
        total_material_revenue: acc.total_material_revenue + b.total_material_revenue,
        total_revenue_adjustment: acc.total_revenue_adjustment + b.total_revenue_adjustment,
        total_cost_adjustment: acc.total_cost_adjustment + b.total_cost_adjustment,
        total_cost: acc.total_cost + b.total_cost,
        total_revenue: acc.total_revenue + b.total_revenue,
        profit: acc.profit + b.profit,
        total_manager_pay: acc.total_manager_pay + b.total_manager_pay,
        net_profit: acc.net_profit + b.net_profit,
      }),
      {
        paid_count: 0,
        total_dispatch_cost: 0,
        total_dispatch_revenue: 0,
        total_material_cost: 0,
        total_material_revenue: 0,
        total_revenue_adjustment: 0,
        total_cost_adjustment: 0,
        total_cost: 0,
        total_revenue: 0,
        profit: 0,
        total_manager_pay: 0,
        net_profit: 0,
      }
    );

    const profitRate = summary.total_revenue > 0
      ? Math.round((summary.net_profit / summary.total_revenue) * 1000) / 10
      : 0;

    // 담당자별 지급 집계 (출동비는 무상 포함, 자재 인센티브는 유상만)
    const managerSql = `
      WITH record_costs AS (
        SELECT
          COALESCE(ar.as_manager_name, '미배정') AS manager_name,
          ar.dispatch_count,
          -- 출동 원가 (무상 포함)
          COALESCE(
            (SELECT apl.unit_price FROM as_price_list apl WHERE apl.id = ar.dispatch_cost_price_id AND apl.is_active = true),
            0
          ) * ar.dispatch_count AS dispatch_cost,

          -- 자재 원가 (유상만)
          CASE
            WHEN ar.is_paid_override = false THEN 0
            WHEN ar.is_paid_override IS NULL AND (bi.delivery_date IS NULL OR bi.delivery_date + INTERVAL '26 months' > NOW()) THEN 0
            ELSE COALESCE((SELECT SUM(amu.quantity * amu.unit_price) FROM as_material_usage amu WHERE amu.as_record_id = ar.id), 0)
          END AS material_cost,

          -- 자재 매출 (유상만)
          CASE
            WHEN ar.is_paid_override = false THEN 0
            WHEN ar.is_paid_override IS NULL AND (bi.delivery_date IS NULL OR bi.delivery_date + INTERVAL '26 months' > NOW()) THEN 0
            ELSE COALESCE(
              (SELECT SUM(amu.quantity * COALESCE(amu.revenue_unit_price, (SELECT apl2.unit_price FROM as_price_list apl2 WHERE apl2.id = amu.revenue_price_list_id AND apl2.is_active = true), (SELECT apl3.unit_price FROM as_price_list apl3 WHERE apl3.item_name = amu.material_name AND apl3.price_type = 'revenue' AND apl3.is_active = true ORDER BY apl3.sort_order ASC LIMIT 1), 0)) FROM as_material_usage amu WHERE amu.as_record_id = ar.id),
              0
            )
          END AS material_revenue

        FROM as_records ar
        LEFT JOIN business_info bi ON ar.business_id = bi.id
        WHERE ${whereClause}
      )
      SELECT
        manager_name,
        COUNT(*) AS record_count,
        SUM(dispatch_count) AS total_dispatch_count,
        SUM(dispatch_cost) AS total_dispatch_cost,
        SUM(ROUND((material_revenue - material_cost) * 0.3)) AS incentive_pay,
        SUM(dispatch_cost) + SUM(ROUND((material_revenue - material_cost) * 0.3)) AS total_pay
      FROM record_costs
      GROUP BY manager_name
      ORDER BY total_pay DESC
    `;

    const managerResult = await pgQuery(managerSql, values);
    const managers = managerResult.rows.map((row: Record<string, unknown>) => ({
      manager_name: row.manager_name as string,
      record_count: Number(row.record_count),
      total_dispatch_count: Number(row.total_dispatch_count),
      dispatch_pay: Number(row.total_dispatch_cost),
      incentive_pay: Number(row.incentive_pay),
      total_pay: Number(row.total_pay),
    }));

    return NextResponse.json({
      success: true,
      period: { from: dateFrom, to: dateTo },
      summary: { ...summary, profit_rate: profitRate },
      businesses,
      managers,
    });
  } catch (error) {
    console.error('[as-revenue] GET error:', error);
    return NextResponse.json({ success: false, error: '매출 조회 실패' }, { status: 500 });
  }
}
