import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { verifyTokenString } from '@/utils/auth';
import { calculateRevenue, preloadMasterData } from '@/lib/services/revenue-calculator';

// POST: 월 마감 자동 계산 (매출 데이터 자동 생성 포함)
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

    const userId = decoded.userId || decoded.id;
    const permissionLevel = decoded.permissionLevel || decoded.permission_level;
    if (!permissionLevel || permissionLevel < 3) {
      return NextResponse.json({
        success: false,
        message: '권한이 부족합니다.'
      }, { status: 403 });
    }

    const body = await request.json();
    const { year, month, force = false } = body;

    if (!year || !month || month < 1 || month > 12) {
      return NextResponse.json({
        success: false,
        message: '유효한 연도와 월을 입력해주세요.'
      }, { status: 400 });
    }

    const supabase = supabaseAdmin;

    // 1. 해당 월의 사업장 목록 조회 (설치 완료된 사업장)
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = month === 12
      ? `${year + 1}-01-01`
      : `${year}-${String(month + 1).padStart(2, '0')}-01`;

    // business_info에서 해당 월에 설치 완료된 사업장 찾기
    const { data: businesses, error: businessError } = await supabase
      .from('business_info')
      .select('id, business_name, installation_date')
      .gte('installation_date', startDate)
      .lt('installation_date', endDate);

    if (businessError) {
      console.error('사업장 조회 오류:', businessError);
      return NextResponse.json({
        success: false,
        message: '사업장 조회 중 오류가 발생했습니다.'
      }, { status: 500 });
    }

    if (!businesses || businesses.length === 0) {
      return NextResponse.json({
        success: true,
        message: `${year}년 ${month}월에 설치 완료된 사업장이 없습니다.`,
        data: {
          totalBusinesses: 0,
          calculatedBusinesses: 0,
          failedBusinesses: 0,
          businesses: []
        }
      });
    }

    // 2. 각 사업장의 매출 계산 실행
    const results = {
      totalBusinesses: businesses.length,
      calculatedBusinesses: 0,
      failedBusinesses: 0,
      businesses: [] as any[]
    };

    // 글로벌 마스터 데이터 사전 로드 (루프 진입 전 1회)
    const masterData = await preloadMasterData();

    for (const business of businesses) {
      try {
        // 2-1. 기존 계산 결과 확인
        const { data: existingCalc } = await supabase
          .from('revenue_calculations')
          .select('id')
          .eq('business_id', business.id)
          .single();

        // 기존 계산이 있고 force가 false면 스킵
        if (existingCalc && !force) {
          results.businesses.push({
            business_id: business.id,
            business_name: business.business_name,
            status: 'skipped',
            message: '이미 계산됨'
          });
          continue;
        }

        // 2-2. 매출 계산 서비스 직접 호출 (HTTP 루프 제거)
        try {
          const calculationDate = business.installation_date;

          const calculateResult = await calculateRevenue({
            business_id: business.id,
            calculation_date: calculationDate,
            save_result: true,
            userId,
            permissionLevel,
            preloadedMasterData: masterData,
          });

          const revenue = calculateResult.calculation?.total_revenue || 0;

          // 매출이 0원이면 계산 실패로 간주 (원가 데이터 없음 등의 문제)
          if (revenue === 0 || !calculateResult.calculation) {
            results.failedBusinesses++;
            results.businesses.push({
              business_id: business.id,
              business_name: business.business_name,
              status: 'failed',
              message: '매출 계산 결과 없음 (원가 데이터 확인 필요)',
              revenue: 0
            });
          } else {
            results.calculatedBusinesses++;
            results.businesses.push({
              business_id: business.id,
              business_name: business.business_name,
              status: 'success',
              message: '계산 완료',
              revenue: revenue
            });
          }
        } catch (svcError) {
          console.error(`사업장 ${business.business_name} 계산 오류:`, svcError);
          results.failedBusinesses++;
          results.businesses.push({
            business_id: business.id,
            business_name: business.business_name,
            status: 'failed',
            message: svcError instanceof Error ? svcError.message : '계산 중 오류 발생'
          });
        }
      } catch (error) {
        console.error(`사업장 ${business.business_name} 계산 오류:`, error);
        results.failedBusinesses++;
        results.businesses.push({
          business_id: business.id,
          business_name: business.business_name,
          status: 'error',
          message: '계산 중 오류 발생'
        });
      }
    }

    // 3. 계산 완료 후 월 마감 집계 실행 (직접 집계)
    let aggregationWarning = null;

    if (results.totalBusinesses > 0) {
      try {
        console.log('[집계 시작] year:', year, 'month:', month);

        // revenue_calculations에서 해당 월 데이터 집계 (설치일 있는 사업장만)
        const { data: revenueData, error: revenueError } = await supabase
          .from('revenue_calculations')
          .select(`
            total_revenue,
            total_cost,
            sales_commission,
            survey_costs,
            installation_costs,
            adjusted_sales_commission,
            business_info!inner(
              installation_date,
              completion_date
            )
          `)
          .gte('calculation_date', startDate)
          .lt('calculation_date', endDate)
          .not('business_info.installation_date', 'is', null);

        if (revenueError) {
          throw new Error(`매출 데이터 조회 실패: ${revenueError.message}`);
        }

        console.log('[집계 데이터 조회 완료] count:', revenueData?.length);

        const totalRevenue = revenueData?.reduce((sum, b) => sum + (Number(b.total_revenue) || 0), 0) || 0;
        const totalCost = revenueData?.reduce((sum, b) => sum + (Number(b.total_cost) || 0), 0) || 0;
        const salesCommission = revenueData?.reduce((sum, b) =>
          sum + (Number(b.adjusted_sales_commission) || Number(b.sales_commission) || 0), 0) || 0;
        const surveyCosts = revenueData?.reduce((sum, b) =>
          sum + (Number(b.survey_costs) || 0), 0) || 0;
        const installationCosts = revenueData?.reduce((sum, b) =>
          sum + (Number(b.installation_costs) || 0), 0) || 0;

        console.log('[집계 계산 완료] totalRevenue:', totalRevenue, 'totalCost:', totalCost, 'salesCommission:', salesCommission, 'surveyCosts:', surveyCosts, 'installationCosts:', installationCosts);

        // 기존 기타 비용 조회
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

        const netProfit = totalRevenue - totalCost - salesCommission - surveyCosts - installationCosts - miscCosts;

        // 월 마감 데이터 저장
        const { error: upsertError } = await supabase
          .from('monthly_closings')
          .upsert({
            year,
            month,
            total_revenue: totalRevenue,
            total_cost: totalCost,
            sales_commission_costs: salesCommission,
            survey_costs: surveyCosts,
            installation_costs: installationCosts,
            miscellaneous_costs: miscCosts,
            net_profit: netProfit,
            business_count: revenueData?.length || 0,
            updated_at: new Date().toISOString()
          }, { onConflict: 'year,month' });

        if (upsertError) {
          throw new Error(`월 마감 데이터 저장 실패: ${upsertError.message}`);
        }

        console.log('[집계 저장 완료] year:', year, 'month:', month);

      } catch (error) {
        console.error('[집계 실패]', error);
        aggregationWarning = '매출 계산은 완료되었으나 월 마감 집계 중 오류가 발생했습니다. 관리자에게 문의하세요.';
      }
    }

    return NextResponse.json({
      success: true,
      message: aggregationWarning || `${results.calculatedBusinesses}개 사업장 계산 완료`,
      warning: aggregationWarning,
      data: results
    });

  } catch (error) {
    console.error('자동 계산 오류:', error);
    return NextResponse.json({
      success: false,
      message: '서버 오류가 발생했습니다.'
    }, { status: 500 });
  }
}
