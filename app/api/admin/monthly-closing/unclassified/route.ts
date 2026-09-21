import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { verifyTokenString } from '@/utils/auth';

// request.headers를 읽으므로 정적 렌더링 대상에서 제외한다 (빌드 시 Dynamic server usage 오류 방지)
export const dynamic = 'force-dynamic';

// GET: 설치일 없는 미분류 사업장 조회
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
    if (!permissionLevel || permissionLevel < 1) {
      return NextResponse.json({
        success: false,
        message: '권한이 부족합니다.'
      }, { status: 403 });
    }

    const supabase = supabaseAdmin;

    // 설치일 정보가 없는 사업장의 매출 계산 내역 조회
    const { data: revenueData, error: revenueError } = await supabase
      .from('revenue_calculations')
      .select(`
        id,
        business_id,
        business_name,
        calculation_date,
        total_revenue,
        total_cost,
        gross_profit,
        sales_commission,
        adjusted_sales_commission,
        installation_costs,
        survey_costs,
        net_profit,
        created_at,
        business_info!inner(
          installation_date,
          completion_date
        )
      `)
      .is('business_info.installation_date', null)
      .is('business_info.completion_date', null)
      .order('calculation_date', { ascending: false });

    if (revenueError) {
      console.error('미분류 사업장 데이터 조회 오류:', revenueError);
      return NextResponse.json({
        success: false,
        message: '미분류 사업장 데이터 조회 중 오류가 발생했습니다.'
      }, { status: 500 });
    }

    // 데이터 포맷팅 및 집계
    const businesses = revenueData?.map(d => ({
      id: d.id,
      businessId: d.business_id,
      businessName: d.business_name,
      calculationDate: d.calculation_date,
      totalRevenue: Number(d.total_revenue) || 0,
      totalCost: Number(d.total_cost) || 0,
      grossProfit: Number(d.gross_profit) || 0,
      salesCommission: Number(d.adjusted_sales_commission) || Number(d.sales_commission) || 0,
      installationCosts: Number(d.installation_costs) || 0,
      surveyCosts: Number(d.survey_costs) || 0,
      netProfit: Number(d.net_profit) || 0,
      createdAt: d.created_at,
      installationDate: null,
      completionDate: null
    })) || [];

    // 집계 계산
    const totalRevenue = businesses.reduce((sum, b) => sum + b.totalRevenue, 0);
    const totalCost = businesses.reduce((sum, b) => sum + b.totalCost, 0);
    const totalSalesCommission = businesses.reduce((sum, b) => sum + b.salesCommission, 0);
    const totalSurveyCosts = businesses.reduce((sum, b) => sum + b.surveyCosts, 0);
    const totalInstallationCosts = businesses.reduce((sum, b) => sum + b.installationCosts, 0);
    const totalNetProfit = businesses.reduce((sum, b) => sum + b.netProfit, 0);

    return NextResponse.json({
      success: true,
      data: {
        summary: {
          count: businesses.length,
          totalRevenue,
          totalCost,
          salesCommissionCosts: totalSalesCommission,
          surveyCosts: totalSurveyCosts,
          installationCosts: totalInstallationCosts,
          netProfit: totalNetProfit
        },
        businesses
      }
    });

  } catch (error) {
    console.error('미분류 사업장 조회 오류:', error);
    return NextResponse.json({
      success: false,
      message: '서버 오류가 발생했습니다.'
    }, { status: 500 });
  }
}
