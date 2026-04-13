import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { verifyTokenString } from '@/utils/auth';

// GET: 월별 마감 데이터 조회
export async function GET(request: NextRequest) {
  try {
    // JWT 토큰 검증
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({
        success: false,
        message: '인증이 필요합니다.'
      }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const decoded = verifyTokenString(token);

    if (!decoded) {
      return NextResponse.json({
        success: false,
        message: '유효하지 않은 토큰입니다.'
      }, { status: 401 });
    }

    const permissionLevel = decoded.permissionLevel || decoded.permission_level;
    if (!permissionLevel || permissionLevel < 3) {
      return NextResponse.json({
        success: false,
        message: '권한이 부족합니다.'
      }, { status: 403 });
    }

    const searchParams = request.nextUrl.searchParams;
    const year = searchParams.get('year');
    const month = searchParams.get('month');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '12');

    const supabase = supabaseAdmin;

    // 쿼리 빌더 시작
    let query = supabase
      .from('monthly_closings')
      .select('*', { count: 'exact' });

    // 필터 적용
    if (year) {
      query = query.eq('year', parseInt(year));
    }
    if (month) {
      query = query.eq('month', parseInt(month));
    }

    // 정렬 및 페이지네이션
    const offset = (page - 1) * limit;
    query = query
      .order('year', { ascending: false })
      .order('month', { ascending: false })
      .range(offset, offset + limit - 1);

    const { data: closings, error, count } = await query;

    if (error) {
      console.error('월별 마감 데이터 조회 오류:', error);
      return NextResponse.json({
        success: false,
        message: '월별 마감 데이터 조회 중 오류가 발생했습니다.'
      }, { status: 500 });
    }

    // 각 월별 마감의 실제 사업장 수 및 금액 실시간 계산 (설치일 있는 사업장만)
    const closingsWithRealCount = await Promise.all(
      (closings || []).map(async (closing: any) => {
        const startDate = `${closing.year}-${String(closing.month).padStart(2, '0')}-01`;
        const endDate = closing.month === 12
          ? `${closing.year + 1}-01-01`
          : `${closing.year}-${String(closing.month + 1).padStart(2, '0')}-01`;

        // 해당 월의 설치일 있는 사업장의 매출 데이터 실시간 조회
        const { data: monthBusinesses } = await supabase
          .from('revenue_calculations')
          .select(`
            total_revenue,
            total_cost,
            sales_commission,
            adjusted_sales_commission,
            installation_costs,
            survey_costs,
            net_profit,
            business_info!inner(installation_date)
          `)
          .gte('calculation_date', startDate)
          .lt('calculation_date', endDate)
          .not('business_info.installation_date', 'is', null);

        // 실시간 집계 계산
        const realBusinessCount = monthBusinesses?.length || 0;
        const totalRevenue = monthBusinesses?.reduce((sum: number, b: any) => sum + (Number(b.total_revenue) || 0), 0) || 0;
        const totalCost = monthBusinesses?.reduce((sum: number, b: any) => sum + (Number(b.total_cost) || 0), 0) || 0;
        const salesCommission = monthBusinesses?.reduce((sum: number, b: any) =>
          sum + (Number(b.adjusted_sales_commission) || Number(b.sales_commission) || 0), 0) || 0;
        const surveyCosts = monthBusinesses?.reduce((sum: number, b: any) =>
          sum + (Number(b.survey_costs) || 0), 0) || 0;
        const installationCosts = monthBusinesses?.reduce((sum: number, b: any) =>
          sum + (Number(b.installation_costs) || 0), 0) || 0;

        // 기존 기타 비용은 DB에서 유지
        const miscCosts = Number(closing.miscellaneous_costs) || 0;

        // 순이익 재계산
        const netProfit = totalRevenue - totalCost - salesCommission - surveyCosts - installationCosts - miscCosts;

        return {
          ...closing,
          business_count: realBusinessCount,
          total_revenue: totalRevenue,
          total_cost: totalCost,
          sales_commission_costs: salesCommission,
          survey_costs: surveyCosts,
          installation_costs: installationCosts,
          net_profit: netProfit
        };
      })
    );

    // 전체 통계 계산
    const { data: allClosings } = await supabase
      .from('monthly_closings')
      .select('total_revenue, total_cost, sales_commission_costs, survey_costs, installation_costs, miscellaneous_costs, net_profit');

    const summary = allClosings?.reduce((acc, closing) => ({
      totalRevenue: acc.totalRevenue + (Number(closing.total_revenue) || 0),
      totalCost: acc.totalCost + (Number(closing.total_cost) || 0),
      totalSalesCommission: acc.totalSalesCommission + (Number(closing.sales_commission_costs) || 0),
      totalSurveyCosts: acc.totalSurveyCosts + (Number(closing.survey_costs) || 0),
      totalInstallationCosts: acc.totalInstallationCosts + (Number(closing.installation_costs) || 0),
      totalMiscCosts: acc.totalMiscCosts + (Number(closing.miscellaneous_costs) || 0),
      totalProfit: acc.totalProfit + (Number(closing.net_profit) || 0)
    }), {
      totalRevenue: 0,
      totalCost: 0,
      totalSalesCommission: 0,
      totalSurveyCosts: 0,
      totalInstallationCosts: 0,
      totalMiscCosts: 0,
      totalProfit: 0
    }) || {
      totalRevenue: 0,
      totalCost: 0,
      totalSalesCommission: 0,
      totalSurveyCosts: 0,
      totalInstallationCosts: 0,
      totalMiscCosts: 0,
      totalProfit: 0
    };

    // 미분류(설치일 없음) 사업장 집계
    const { data: unclassifiedData } = await supabase
      .from('revenue_calculations')
      .select(`
        total_revenue,
        total_cost,
        sales_commission,
        adjusted_sales_commission,
        installation_costs,
        survey_costs,
        net_profit,
        business_info!inner(
          installation_date,
          completion_date
        )
      `)
      .is('business_info.installation_date', null)
      .is('business_info.completion_date', null);

    const unclassifiedSummary = unclassifiedData?.reduce((acc: any, item: any) => ({
      count: acc.count + 1,
      totalRevenue: acc.totalRevenue + (Number(item.total_revenue) || 0),
      totalCost: acc.totalCost + (Number(item.total_cost) || 0),
      salesCommissionCosts: acc.salesCommissionCosts + (Number(item.adjusted_sales_commission) || Number(item.sales_commission) || 0),
      surveyCosts: acc.surveyCosts + (Number(item.survey_costs) || 0),
      installationCosts: acc.installationCosts + (Number(item.installation_costs) || 0),
      netProfit: acc.netProfit + (Number(item.net_profit) || 0)
    }), {
      count: 0,
      totalRevenue: 0,
      totalCost: 0,
      salesCommissionCosts: 0,
      surveyCosts: 0,
      installationCosts: 0,
      netProfit: 0
    }) || {
      count: 0,
      totalRevenue: 0,
      totalCost: 0,
      salesCommissionCosts: 0,
      surveyCosts: 0,
      installationCosts: 0,
      netProfit: 0
    };

    return NextResponse.json({
      success: true,
      data: {
        closings: closingsWithRealCount?.map(c => ({
          id: c.id,
          year: c.year,
          month: c.month,
          totalRevenue: Number(c.total_revenue) || 0,
          totalCost: Number(c.total_cost) || 0,
          salesCommissionCosts: Number(c.sales_commission_costs) || 0,
          surveyCosts: Number(c.survey_costs) || 0,
          installationCosts: Number(c.installation_costs) || 0,
          miscellaneousCosts: Number(c.miscellaneous_costs) || 0,
          netProfit: Number(c.net_profit) || 0,
          businessCount: c.business_count || 0,  // 실시간 집계된 값 사용
          isClosed: c.is_closed || false,
          closedAt: c.closed_at,
          closedBy: c.closed_by,
          createdAt: c.created_at,
          updatedAt: c.updated_at
        })) || [],
        unclassified: unclassifiedSummary,
        pagination: {
          total: count || 0,
          page,
          limit,
          totalPages: Math.ceil((count || 0) / limit)
        },
        summary
      }
    });

  } catch (error) {
    console.error('월별 마감 조회 오류:', error);
    return NextResponse.json({
      success: false,
      message: '서버 오류가 발생했습니다.'
    }, { status: 500 });
  }
}

// POST: 특정 연월의 마감 데이터 자동 계산
export async function POST(request: NextRequest) {
  try {
    // JWT 토큰 검증
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({
        success: false,
        message: '인증이 필요합니다.'
      }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const decoded = verifyTokenString(token);

    if (!decoded) {
      return NextResponse.json({
        success: false,
        message: '유효하지 않은 토큰입니다.'
      }, { status: 401 });
    }

    const permissionLevel = decoded.permissionLevel || decoded.permission_level;
    if (!permissionLevel || permissionLevel < 3) {
      return NextResponse.json({
        success: false,
        message: '권한이 부족합니다.'
      }, { status: 403 });
    }

    const body = await request.json();
    const { year, month } = body;

    if (!year || !month || month < 1 || month > 12) {
      return NextResponse.json({
        success: false,
        message: '유효한 연도와 월을 입력해주세요.'
      }, { status: 400 });
    }

    const supabase = supabaseAdmin;

    // 1. 해당 월에 설치 완료된 사업장 찾기 (calculation_date 기준)
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = month === 12
      ? `${year + 1}-01-01`
      : `${year}-${String(month + 1).padStart(2, '0')}-01`;

    const { data: businesses, error: businessError } = await supabase
      .from('revenue_calculations')
      .select('total_revenue, total_cost, sales_commission, installation_costs, adjusted_sales_commission')
      .gte('calculation_date', startDate)
      .lt('calculation_date', endDate);

    if (businessError) {
      console.error('사업장 데이터 조회 오류:', businessError);
      return NextResponse.json({
        success: false,
        message: '사업장 데이터 조회 중 오류가 발생했습니다.'
      }, { status: 500 });
    }

    // 2. 집계 계산
    const totalRevenue = businesses?.reduce((sum, b) => sum + (Number(b.total_revenue) || 0), 0) || 0;
    const totalCost = businesses?.reduce((sum, b) => sum + (Number(b.total_cost) || 0), 0) || 0;
    const salesCommission = businesses?.reduce((sum, b) =>
      sum + (Number(b.adjusted_sales_commission) || Number(b.sales_commission) || 0), 0) || 0;
    const surveyCosts = businesses?.reduce((sum, b) =>
      sum + (Number(b.survey_costs) || 0), 0) || 0;
    const installationCosts = businesses?.reduce((sum, b) =>
      sum + (Number(b.installation_costs) || 0), 0) || 0;

    // 3. 기존 기타 비용 합산
    const { data: existingClosing } = await supabase
      .from('monthly_closings')
      .select('id')
      .eq('year', year)
      .eq('month', month)
      .single();

    let miscCosts = 0;
    if (existingClosing) {
      const { data: miscCostsData } = await supabase
        .from('miscellaneous_costs')
        .select('amount')
        .eq('monthly_closing_id', existingClosing.id);

      miscCosts = miscCostsData?.reduce((sum, c) => sum + (Number(c.amount) || 0), 0) || 0;
    }

    // 4. 순이익 계산
    const netProfit = totalRevenue - totalCost - salesCommission - surveyCosts - installationCosts - miscCosts;

    // 5. 저장 또는 업데이트
    const closingData = {
      year,
      month,
      total_revenue: totalRevenue,
      total_cost: totalCost,
      sales_commission_costs: salesCommission,
      survey_costs: surveyCosts,
      installation_costs: installationCosts,
      miscellaneous_costs: miscCosts,
      net_profit: netProfit,
      business_count: businesses?.length || 0,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('monthly_closings')
      .upsert(closingData, { onConflict: 'year,month' })
      .select()
      .single();

    if (error) {
      console.error('마감 데이터 저장 오류:', error);
      return NextResponse.json({
        success: false,
        message: '마감 데이터 저장 중 오류가 발생했습니다.'
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: {
        closing: {
          id: data.id,
          year: data.year,
          month: data.month,
          totalRevenue: Number(data.total_revenue) || 0,
          totalCost: Number(data.total_cost) || 0,
          salesCommissionCosts: Number(data.sales_commission_costs) || 0,
          installationCosts: Number(data.installation_costs) || 0,
          miscellaneousCosts: Number(data.miscellaneous_costs) || 0,
          netProfit: Number(data.net_profit) || 0,
          businessCount: data.business_count || 0,
          isClosed: data.is_closed || false,
          createdAt: data.created_at,
          updatedAt: data.updated_at
        },
        businessCount: businesses?.length || 0,
        revenueBreakdown: {
          totalRevenue,
          totalCost,
          salesCommission,
          installationCosts,
          miscCosts,
          netProfit
        }
      }
    });

  } catch (error) {
    console.error('월별 마감 계산 오류:', error);
    return NextResponse.json({
      success: false,
      message: '서버 오류가 발생했습니다.'
    }, { status: 500 });
  }
}
