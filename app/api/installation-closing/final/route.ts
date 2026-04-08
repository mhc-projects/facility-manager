import { NextRequest, NextResponse } from 'next/server';
import { queryAll } from '@/lib/supabase-direct';
import { verifyTokenString } from '@/utils/auth';
import { calculateFinalDiff } from '@/lib/installation-closing';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/installation-closing/final?month=2026-04
 * 해당 월 본마감 대상 목록
 *
 * 본마감 대상 조건:
 *   1. 설치완료일(installation_date)이 해당 월인 사업장
 *   2. 또는 해당 월에 본마감 레코드가 이미 있는 사업장 (마감월 수동 변경 등)
 *
 * 예측마감 여부와 무관하게 독립 작동.
 * 예측마감이 있으면 차액을 보여주고, 없으면 전체 금액이 본마감 대상.
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
      return NextResponse.json({ success: false, message: '설치비 마감 권한이 필요합니다.' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month');

    if (!month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      return NextResponse.json({ success: false, message: '올바른 월 형식이 필요합니다.' }, { status: 400 });
    }

    // 본마감 대상: 설치완료일이 해당 월 OR 해당 월에 본마감 레코드가 있는 사업장
    // 예측마감 의존 없이 독립 작동
    const businesses = await queryAll(`
      SELECT
        b.id,
        b.business_name,
        b.sales_office,
        b.order_date,
        b.installation_date,
        b.additional_cost,
        b.installation_extra_cost,
        vps.payment_status,
        -- 예측마감 지급 여부
        EXISTS (
          SELECT 1 FROM installation_payments ip
          WHERE ip.business_id = b.id AND ip.payment_type = 'forecast' AND ip.status = 'paid'
        ) AS has_forecast,
        -- 본마감 상태
        (SELECT ip.status FROM installation_payments ip
         WHERE ip.business_id = b.id AND ip.payment_type = 'final'
           AND ip.payment_month = $1 AND ip.status NOT IN ('cancelled', 'deducted')
         LIMIT 1) AS final_status
      FROM business_info b
      LEFT JOIN v_business_payment_status vps ON vps.business_id = b.id
      WHERE b.installation_date IS NOT NULL
        AND (
          TO_CHAR(b.installation_date, 'YYYY-MM') = $1
          OR EXISTS (
            SELECT 1 FROM installation_payments ip
            WHERE ip.business_id = b.id AND ip.payment_type IN ('final', 'adjustment')
              AND ip.payment_month = $1 AND ip.status NOT IN ('cancelled', 'deducted')
          )
        )
      ORDER BY b.installation_date ASC, b.business_name ASC
    `, [month]);

    // 각 사업장별 금액 계산
    const results = await Promise.all(
      businesses.map(async (biz: any) => {
        try {
          const diff = await calculateFinalDiff(biz.id);
          return {
            ...biz,
            forecast_total: diff.forecast_total,
            final_total: diff.final_total,
            diff_total: diff.diff_total,
            diff_details: diff.diff_details,
          };
        } catch (err: any) {
          return {
            ...biz,
            forecast_total: 0,
            final_total: 0,
            diff_total: 0,
            diff_details: [],
            error: err.message,
          };
        }
      })
    );

    const stats = {
      total_count: results.length,
      final_completed: results.filter((r: any) => r.final_status === 'paid').length,
      final_pending: results.filter((r: any) => r.final_status !== 'paid').length,
      has_diff: results.filter((r: any) => r.diff_total !== 0 && r.forecast_total > 0).length,
      total_diff: results.reduce((s: number, r: any) => s + (r.diff_total || 0), 0),
      total_final_amount: results.reduce((s: number, r: any) => s + (r.final_total || 0), 0),
      total_forecast_amount: results.reduce((s: number, r: any) => s + (r.forecast_total || 0), 0),
    };

    return NextResponse.json({
      success: true,
      data: { businesses: results, stats, month },
    }, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
    });
  } catch (error: any) {
    console.error('❌ [FINAL] 본마감 대상 조회 실패:', error);
    return NextResponse.json({ success: false, message: '본마감 대상 조회에 실패했습니다.' }, { status: 500 });
  }
}
