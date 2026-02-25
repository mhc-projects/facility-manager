import { NextRequest, NextResponse } from 'next/server'
import { queryAll } from '@/lib/supabase-direct'
import {
  determineAggregationLevel,
  getAggregationKey,
  generateAggregationKeys,
  type AggregationLevel
} from '@/lib/dashboard-utils'

// Force dynamic rendering for API routes
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface RevenueQueryParams {
  months?: string;
  office?: string;
  manufacturer?: string;
  salesOffice?: string;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    // 기간 파라미터 (3가지 모드)
    const months = searchParams.get('months') ? parseInt(searchParams.get('months')!) : null;
    const startDate = searchParams.get('startDate'); // YYYY-MM-DD 또는 YYYY-MM 형식
    const endDate = searchParams.get('endDate');     // YYYY-MM-DD 또는 YYYY-MM 형식
    const year = searchParams.get('year') ? parseInt(searchParams.get('year')!) : null;

    // 필터 파라미터
    const office = searchParams.get('office'); // 지역 필터 (주소에서 추출)
    const manufacturer = searchParams.get('manufacturer');
    const salesOffice = searchParams.get('salesOffice');
    const progressStatus = searchParams.get('progressStatus'); // 진행구분 필터

    console.log('📊 [Dashboard Revenue API] Request params:', { months, startDate, endDate, year, office, manufacturer, salesOffice, progressStatus });

    const calcDate = new Date().toISOString().split('T')[0];

    // 1. 사업장 조회 (설치 완료된 사업장만) - 직접 PostgreSQL 연결 사용
    const queryParts: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    queryParts.push('SELECT * FROM business_info WHERE is_active = true AND is_deleted = false AND installation_date IS NOT NULL');

    // 날짜 범위 필터 (기간 지정 모드에서만 적용)
    if (startDate && endDate) {
      queryParts.push(`AND installation_date >= $${paramIndex++}`);
      params.push(startDate);
      queryParts.push(`AND installation_date <= $${paramIndex++}`);
      params.push(endDate);
    }

    // 필터 적용
    if (manufacturer) {
      queryParts.push(`AND manufacturer = $${paramIndex++}`);
      params.push(manufacturer);
    }
    if (salesOffice) {
      queryParts.push(`AND sales_office = $${paramIndex++}`);
      params.push(salesOffice);
    }
    if (progressStatus) {
      queryParts.push(`AND progress_status = $${paramIndex++}`);
      params.push(progressStatus);
    }

    const finalQuery = queryParts.join(' ');
    console.log('📊 [Dashboard Revenue API] Executing PostgreSQL query with', params.length, 'parameters');

    const businesses = await queryAll(finalQuery, params);

    console.log('📊 [Dashboard Revenue API] Total businesses (before region filter):', businesses.length);

    // 지역 필터링 (주소에서 지역 추출 - 사업장 관리와 동일)
    let filteredBusinesses = businesses || [];
    if (office) {
      filteredBusinesses = filteredBusinesses.filter(business => {
        const address = business.address || '';
        if (!address) return false;

        // 주소에서 지역 추출 (예: "서울시", "경기도 수원시" -> "경기도")
        const regionMatch = address.match(/^(.*?시|.*?도|.*?군)/);
        const region = regionMatch ? regionMatch[1] : '';
        return region === office;
      });
    }

    console.log('📊 [Dashboard Revenue API] Total businesses (after filters):', filteredBusinesses.length);

    // 2. 환경부 고시가 정보 조회 - 직접 PostgreSQL 연결 사용
    const pricingData = await queryAll(
      'SELECT * FROM government_pricing WHERE is_active = true AND effective_from <= $1',
      [calcDate]
    );

    const priceMap = pricingData?.reduce((acc, item) => {
      acc[item.equipment_type] = item;
      return acc;
    }, {} as Record<string, any>) || {};

    // 2-1. 제조사별 원가 정보 조회 - 직접 PostgreSQL 연결 사용
    const manufacturerPricingData = await queryAll(
      'SELECT * FROM manufacturer_pricing WHERE is_active = true AND effective_from <= $1 AND (effective_to IS NULL OR effective_to >= $1)',
      [calcDate]
    );

    // 제조사별 원가 맵 생성 (매출 관리 페이지와 100% 동일한 로직)
    // ✅ 제조사 이름 정규화: 대소문자 무시 + 공백 제거로 매칭 성공률 향상
    // ✅ DB의 한글 이름을 그대로 소문자 정규화하여 사용 (한글 → 한글 매칭)
    // 📍 매출 관리 페이지(/admin/revenue/page.tsx Line 211)와 동일한 방식
    const manufacturerCostMap: Record<string, Record<string, number>> = {};
    manufacturerPricingData?.forEach(item => {
      const normalizedManufacturer = item.manufacturer.toLowerCase().trim();
      if (!manufacturerCostMap[normalizedManufacturer]) {
        manufacturerCostMap[normalizedManufacturer] = {};
      }
      // 🔧 PostgreSQL DECIMAL 타입이 문자열로 반환되므로 Number()로 변환
      manufacturerCostMap[normalizedManufacturer][item.equipment_type] = Number(item.cost_price) || 0;
    });

    console.log('📊 [Dashboard Revenue API] Manufacturer pricing loaded:', Object.keys(manufacturerCostMap).length, 'manufacturers');
    console.log('📊 [Dashboard Revenue API] 제조사 키 목록:', Object.keys(manufacturerCostMap));

    // ❌ DEFAULT_COSTS 제거됨 - 사용자 명시적 요구사항
    // "하드코딩하지 말고 제조사별 원가 탭에서 직접 데이터를 가져다 사용하는 로직으로 작성해줘야해"
    // 이제 DB에서 로드된 제조사별 원가만 사용합니다.

    // 2-2. 기본 설치비 정보 조회 (매출 관리와 동일한 테이블 사용) - 직접 PostgreSQL 연결 사용
    const installationCostData = await queryAll(
      'SELECT * FROM equipment_installation_cost WHERE is_active = true AND effective_from <= $1 AND (effective_to IS NULL OR effective_to >= $1)',
      [calcDate]
    );

    // 기본 설치비 맵 생성
    const installationCostMap: Record<string, number> = {};
    installationCostData?.forEach(item => {
      installationCostMap[item.equipment_type] = Number(item.base_installation_cost) || 0; // 🔧 PostgreSQL DECIMAL 타입이 문자열로 반환되므로 Number()로 변환
    });

    console.log('📊 [Dashboard Revenue API] Installation costs loaded:', Object.keys(installationCostMap).length, 'equipment types');

    // ✅ 매출관리 페이지와 동일한 계산 방식 사용
    // 실사비용 조정(survey_cost_adjustments), 영업비용 조정(operating_cost_adjustments)은
    // 매출관리(revenue-calculator.ts)에서 적용하지 않으므로 대시보드에서도 미적용

    // 3. 집계 단위 결정 및 데이터 맵 초기화
    let aggregationLevel: AggregationLevel = 'monthly'; // 기본값
    const aggregationData: Map<string, any> = new Map();

    if (year) {
      // 연도별 모드: 월별 집계 (기존 로직 유지)
      aggregationLevel = 'monthly';
      for (let month = 1; month <= 12; month++) {
        const monthKey = `${year}-${String(month).padStart(2, '0')}`;
        aggregationData.set(monthKey, {
          month: monthKey,
          revenue: 0,
          cost: 0,
          profit: 0,
          profitRate: 0,
          prevMonthChange: 0,
          count: 0
        });
      }
    } else if (startDate && endDate) {
      // 기간 지정 모드: 집계 단위 자동 결정
      aggregationLevel = determineAggregationLevel(startDate, endDate);
      console.log('📊 [Dashboard Revenue API] Aggregation level:', aggregationLevel);

      // 집계 키 생성
      const keys = generateAggregationKeys(startDate, endDate, aggregationLevel);
      keys.forEach(key => {
        aggregationData.set(key, {
          month: key, // 호환성을 위해 'month' 키 유지
          revenue: 0,
          cost: 0,
          profit: 0,
          profitRate: 0,
          prevMonthChange: 0,
          count: 0
        });
      });
    } else {
      // 최근 N개월 모드: 월별 집계 (기존 로직 유지)
      aggregationLevel = 'monthly';
      const monthsToShow = months || 12;
      for (let i = 0; i < monthsToShow; i++) {
        const date = new Date();
        date.setMonth(date.getMonth() - i);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        aggregationData.set(monthKey, {
          month: monthKey,
          revenue: 0,
          cost: 0,
          profit: 0,
          profitRate: 0,
          prevMonthChange: 0,
          count: 0
        });
      }
    }

    // 4. 영업점 비용 설정 및 실사비용 설정 조회 - 직접 PostgreSQL 연결 사용
    const salesSettings = await queryAll(
      'SELECT * FROM sales_office_cost_settings WHERE is_active = true AND effective_from <= $1 ORDER BY effective_from DESC',
      [calcDate]
    );

    const salesSettingsMap = new Map(
      salesSettings?.map(s => [s.sales_office, s]) || []
    );

    const defaultCommission = {
      commission_type: 'percentage',
      commission_percentage: 10.0,
      commission_per_unit: null
    };

    const surveyCosts = await queryAll(
      'SELECT * FROM survey_cost_settings WHERE is_active = true AND effective_from <= $1',
      [calcDate]
    );

    const surveyCostMap = surveyCosts?.reduce((acc, item) => {
      acc[item.survey_type] = Number(item.base_cost) || 0;
      return acc;
    }, {} as Record<string, number>) || {
      estimate: 100000,
      pre_construction: 150000,
      completion: 200000
    };

    // 5. 측정기기 필드 정의
    // ✅ gateway (구형) 제거 - 게이트웨이(1,2), 게이트웨이(3,4)만 사용
    const equipmentFields = [
      'ph_meter', 'differential_pressure_meter', 'temperature_meter',
      'discharge_current_meter', 'fan_current_meter', 'pump_current_meter',
      'gateway_1_2', 'gateway_3_4', 'vpn_wired', 'vpn_wireless',
      'explosion_proof_differential_pressure_meter_domestic',
      'explosion_proof_temperature_meter_domestic', 'expansion_device',
      'relay_8ch', 'relay_16ch', 'main_board_replacement', 'multiple_stack'
    ];

    console.log('🔍 [CRITICAL CHECK] equipmentFields 배열:', equipmentFields);
    console.log('🔍 [CRITICAL CHECK] gateway_1_2 포함 여부:', equipmentFields.includes('gateway_1_2'));
    console.log('🔍 [CRITICAL CHECK] gateway (구형) 포함 여부:', equipmentFields.includes('gateway'));

    // 6. 사업장별 실시간 매출 계산 및 집계
    // 통계 집계 변수 초기화
    let totalSalesCommissionSum = 0;
    let totalInstallationCostSum = 0;
    let totalCostSum = 0;
    let totalOtherCostsSum = 0;
    let totalProfitRateSum = 0;
    let profitRateCount = 0;

    for (const business of filteredBusinesses) {
      if (!business.installation_date) continue;

      const installDate = new Date(business.installation_date);
      const aggregationKey = getAggregationKey(installDate, aggregationLevel);

      if (!aggregationData.has(aggregationKey)) continue;

      // 사업장의 제조사 정보 (기본값: ecosense)
      // ✅ 제조사 이름 정규화: 소문자 변환 + 공백 제거 (매출 관리와 100% 동일)
      // 📍 revenue-calculator.ts Line 103과 동일한 방식
      const rawManufacturer = business.manufacturer || 'ecosense';
      const normalizedManufacturer = rawManufacturer.toLowerCase().trim();

      // 제조사 원가 맵에서 정규화된 이름으로 검색
      let manufacturerCosts = manufacturerCostMap[normalizedManufacturer];

      // 정규화된 이름으로도 못 찾으면 원본 이름으로 시도
      if (!manufacturerCosts) {
        manufacturerCosts = manufacturerCostMap[rawManufacturer] || {};

        // 🐛 디버깅: 제조사 매칭 실패 로그
        if (aggregationKey === '2025-07') {
          console.log(`[DEBUG] ⚠️ 제조사 매칭 실패: ${business.business_name} (원본: "${rawManufacturer}", 정규화: "${normalizedManufacturer}")`);
          console.log(`[DEBUG] 사용 가능한 제조사 키:`, Object.keys(manufacturerCostMap).slice(0, 5));
        }
      }

      // 매출/제조사 매입 계산
      let businessRevenue = 0;
      let manufacturerCost = 0;
      let totalInstallationCosts = 0;
      let totalEquipmentCount = 0;

      equipmentFields.forEach(field => {
        const quantity = business[field] || 0;

        // 🐛 동승고무기기공업사 gateway_1_2 추적
        if (aggregationKey === '2025-07' && business.business_name === '동승고무기기공업사' && field === 'gateway_1_2') {
          console.log(`[DEBUG] 🔍 동승고무기기공업사 gateway_1_2 확인:`);
          console.log(`[DEBUG]   - business.gateway_1_2 raw value: ${business.gateway_1_2}`);
          console.log(`[DEBUG]   - business.gateway_1_2 type: ${typeof business.gateway_1_2}`);
          console.log(`[DEBUG]   - quantity (after || 0): ${quantity}`);
          console.log(`[DEBUG]   - business object keys 샘플:`, Object.keys(business).slice(0, 15));
        }

        // ✅ 성능 최적화: 수량이 0이면 계산 생략
        if (quantity <= 0) return;

        const priceInfo = priceMap[field];

        // ✅ 성능 최적화: 매출 단가 없으면 생략
        if (!priceInfo) return;

        // 매출 = 환경부 고시가 × 수량
        businessRevenue += priceInfo.official_price * quantity;

        // 🔧 제조사별 원가 직접 사용 (DB에서 로드된 값만 사용)
        // DEFAULT_COSTS 사용 안 함 - 사용자 명시적 요구사항
        let costPrice = manufacturerCosts[field] || 0;

        // 🐛 디버깅: gateway_1_2 계산 추적
        if (aggregationKey === '2025-07' && field === 'gateway_1_2' && quantity > 0) {
          console.log(`[DEBUG] ✅ Gateway_1_2 계산 중: ${business.business_name}`);
          console.log(`[DEBUG]   - 수량: ${quantity}개`);
          console.log(`[DEBUG]   - 원가: ${costPrice.toLocaleString()}원`);
          console.log(`[DEBUG]   - 매입: ${(costPrice * quantity).toLocaleString()}원`);
        }

        manufacturerCost += costPrice * quantity;

        // 기본 설치비 (equipment_installation_cost 테이블 - revenue-calculator.ts와 동일)
        const installCost = installationCostMap[field] || 0;

        totalInstallationCosts += installCost * quantity;
        totalEquipmentCount += quantity;
      });

      // 추가공사비 및 협의사항 반영 (매출관리와 동일: revenue-calculator.ts 기준)
      const additionalCost = Number(business.additional_cost) || 0;
      const negotiationDiscount = Number(business.negotiation) || 0;

      // 최종 매출 = 기본 매출 + 추가공사비 - 협의사항 (revenue-calculator.ts Line 150과 동일)
      const adjustedRevenue = businessRevenue + additionalCost - negotiationDiscount;

      // 영업비용 계산 기준: 최종 매출 기준 (매출관리와 동일 - revenue-calculator.ts Line 162)
      const salesOffice = business.sales_office || '기본';
      const commissionSettings = salesSettingsMap.get(salesOffice) || defaultCommission;

      let adjustedSalesCommission = 0;
      if (commissionSettings.commission_type === 'percentage') {
        adjustedSalesCommission = adjustedRevenue * (commissionSettings.commission_percentage / 100);
      } else {
        adjustedSalesCommission = totalEquipmentCount * (commissionSettings.commission_per_unit || 0);
      }

      // 실사비용 계산 (매출관리와 동일: 실사일이 있는 경우에만 비용 추가, DB 조정값 미적용)
      // revenue-calculator.ts Line 167-183과 동일
      let totalSurveyCosts = 0;

      if (business.estimate_survey_date) {
        totalSurveyCosts += surveyCostMap.estimate || 0;
      }

      if (business.pre_construction_survey_date) {
        totalSurveyCosts += surveyCostMap.pre_construction || 0;
      }

      if (business.completion_survey_date) {
        totalSurveyCosts += surveyCostMap.completion || 0;
      }

      // 추가설치비 (설치팀 요청 추가 비용)
      const installationExtraCost = Number(business.installation_extra_cost) || 0;

      // 매출 관리와 동일한 계산 방식
      const totalCost = Number(manufacturerCost) || 0;

      // 총이익 = 최종 매출 - 제조사 매입 (revenue-calculator.ts Line 196과 동일)
      const grossProfit = Math.round(adjustedRevenue - totalCost);

      // AS비용 및 커스텀 추가비용
      const asCost = Number(business.as_cost) || 0;
      let customCosts = 0;
      if (business.custom_additional_costs) {
        try {
          const costs = typeof business.custom_additional_costs === 'string'
            ? JSON.parse(business.custom_additional_costs)
            : business.custom_additional_costs;
          if (Array.isArray(costs)) {
            customCosts = costs.reduce((t: number, c: any) => t + (Number(c.amount) || 0), 0);
          }
        } catch (e) {}
      }

      // 순이익 = 총이익 - 영업비용 - 실사비용 - 기본설치비 - 추가설치비 - AS비용 - 커스텀비용
      const netProfit = Math.round(
        grossProfit -
        (Number(adjustedSalesCommission) || 0) -
        (Number(totalSurveyCosts) || 0) -
        (Number(totalInstallationCosts) || 0) -
        (Number(installationExtraCost) || 0) -
        asCost -
        customCosts
      );

      // 통계 집계
      totalSalesCommissionSum += adjustedSalesCommission;
      totalInstallationCostSum += (totalInstallationCosts || 0) + (installationExtraCost || 0);
      totalCostSum += totalCost;

      // 기타비용 집계 (실사비용 + AS비용 + 커스텀비용)
      totalOtherCostsSum += (Number(totalSurveyCosts) || 0) + asCost + customCosts;

      // 사업장 평균 이익률 집계 (매출이 있는 사업장만)
      if (adjustedRevenue > 0) {
        totalProfitRateSum += (netProfit / adjustedRevenue) * 100;
        profitRateCount += 1;
      }

      // 월별 데이터 업데이트
      const current = aggregationData.get(aggregationKey);
      current.revenue += adjustedRevenue;
      current.cost += totalCost;  // 매입금액 (제조사 매입만)
      current.profit += netProfit;  // 순이익 (매출관리와 100% 동일한 계산)
      current.count += 1;

      // 🐛 디버깅: 2025-07월 총 매입금액 누적 로그
      if (aggregationKey === '2025-07' && current.count % 50 === 0) {
        console.log(`[DEBUG] 2025-07 누적: ${current.count}개 사업장, 총 매입 ${current.cost.toLocaleString()}원`);
      }
    }

    // 6. 이익률 계산 및 전월 대비 증감 계산
    const sortedMonths = Array.from(aggregationData.keys()).sort();
    let prevProfit = 0;

    sortedMonths.forEach((monthKey, index) => {
      const data = aggregationData.get(monthKey);

      // 🐛 디버깅: 최종 집계 결과 로그 (하이브리드 통계 포함)
      if (monthKey === '2025-07') {
        console.log(`[DEBUG] 2025-07 최종 집계: 사업장 ${data.count}개, 총매출 ${data.revenue.toLocaleString()}원, 총매입 ${data.cost.toLocaleString()}원`);
        if (data.calculationStats) {
          console.log(`[DEBUG] 2025-07 계산 소스: 저장값 ${data.calculationStats.saved}개, 실시간 ${data.calculationStats.realtime}개`);
        }
      }

      // 이익률 계산
      if (data.revenue > 0) {
        data.profitRate = (data.profit / data.revenue) * 100;
      }

      // 전월 대비 증감률 (첫 달은 제외)
      if (index > 0 && prevProfit !== 0) {
        data.prevMonthChange = ((data.profit - prevProfit) / Math.abs(prevProfit)) * 100;
      }

      prevProfit = data.profit;
    });

    // 7. 목표값 조회 - 직접 PostgreSQL 연결 사용
    const targets = await queryAll(
      'SELECT * FROM dashboard_targets WHERE target_type = $1 AND month = ANY($2)',
      ['revenue', sortedMonths]
    );

    const targetMap = new Map(targets?.map(t => [t.month, t.target_value]) || []);

    // 8. 목표 달성률 계산
    sortedMonths.forEach(monthKey => {
      const data = aggregationData.get(monthKey);
      const target = targetMap.get(monthKey);
      if (target && target > 0) {
        data.target = target;
        data.achievementRate = (data.profit / target) * 100;
      }
    });

    // 9. 평균값 계산 및 최종 데이터 배열 생성
    // 연도별/기간지정 모드는 오래된 것부터, 최근 모드는 최신부터
    const dataArray = (year || (startDate && endDate))
      ? Array.from(aggregationData.values()) // 연도별/기간지정: 순방향 (1월→12월)
      : Array.from(aggregationData.values()).reverse(); // 최근 모드: 역방향 (최신→과거)
    const totalProfit = dataArray.reduce((sum, d) => sum + d.profit, 0);
    const totalRevenue = dataArray.reduce((sum, d) => sum + d.revenue, 0);
    const validProfitRates = dataArray.filter(d => d.profitRate > 0);

    const monthCount = dataArray.length; // 실제 월 개수 사용
    const avgProfit = monthCount > 0 ? totalProfit / monthCount : 0;
    const avgProfitRate = validProfitRates.length > 0
      ? validProfitRates.reduce((sum, d) => sum + d.profitRate, 0) / validProfitRates.length
      : 0;

    console.log('📊 [Dashboard Revenue API] Summary:', {
      businesses: filteredBusinesses.length,
      avgProfit: Math.round(avgProfit),
      avgProfitRate: Math.round(avgProfitRate * 100) / 100,
      totalRevenue,
      totalProfit,
      totalCost: Math.round(totalCostSum),
      totalOtherCosts: Math.round(totalOtherCostsSum),
      totalSalesCommission: Math.round(totalSalesCommissionSum),
      totalInstallationCost: Math.round(totalInstallationCostSum)
    });

    return NextResponse.json({
      success: true,
      data: dataArray,
      summary: {
        avgProfit: Math.round(avgProfit),
        avgProfitRate: Math.round(avgProfitRate * 100) / 100,
        totalRevenue,
        totalProfit,
        totalCost: Math.round(totalCostSum),
        totalOtherCosts: Math.round(totalOtherCostsSum),
        avgProfitRateByBiz: profitRateCount > 0
          ? Math.round((totalProfitRateSum / profitRateCount) * 10) / 10
          : 0,
        totalSalesCommission: Math.round(totalSalesCommissionSum),
        totalInstallationCost: Math.round(totalInstallationCostSum)
      }
    });

  } catch (error: any) {
    console.error('❌ [Dashboard Revenue API Error]', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message,
        data: [],
        summary: {
          avgProfit: 0,
          avgProfitRate: 0,
          totalRevenue: 0,
          totalProfit: 0,
          totalCost: 0,
          totalOtherCosts: 0,
          avgProfitRateByBiz: 0,
          totalSalesCommission: 0,
          totalInstallationCost: 0
        }
      },
      { status: 500 }
    );
  }
}
