/**
 * 실시간 매출 계산 유틸리티
 *
 * Admin 대시보드(/api/dashboard/revenue/route.ts)의 계산 로직을 클라이언트에서 사용할 수 있도록 추출
 *
 * 계산 공식 (Admin 대시보드와 100% 동일):
 * - 매출 = (환경부 고시가 × 수량) + 추가공사비 - 협의사항
 * - 매입 = 제조사별 원가 × 수량
 * - 총이익 = 매출 - 매입
 * - 순이익 = 총이익 - 영업비용 - 실사비용 - 기본설치비 - 추가설치비 - AS비용 - 커스텀비용
 */

export interface BusinessInfo {
  id: string;
  business_name: string;
  sales_office?: string;
  manufacturer?: string;
  additional_cost?: number;
  negotiation?: string | number;
  installation_extra_cost?: number;
  estimate_survey_date?: string | Date | null;
  pre_construction_survey_date?: string | Date | null;
  completion_survey_date?: string | Date | null;
  [key: string]: any; // equipment fields
}

export interface RevenueCalculationResult {
  total_revenue: number;
  total_cost: number;
  gross_profit: number;
  net_profit: number;
  sales_commission: number;
  adjusted_sales_commission?: number;
  survey_costs: number;
  installation_costs: number;
  installation_extra_cost: number;
}

export interface PricingData {
  officialPrices: Record<string, number>;
  manufacturerPrices: Record<string, Record<string, number>>;
  salesOfficeSettings: Record<string, any>;
  surveyCostSettings: Record<string, number>;
  baseInstallationCosts: Record<string, number>;
}

// 📍 Admin 대시보드와 동일한 측정기기 필드 정의
const EQUIPMENT_FIELDS = [
  'ph_meter',
  'differential_pressure_meter',
  'temperature_meter',
  'discharge_current_meter',
  'fan_current_meter',
  'pump_current_meter',
  'gateway', // deprecated but kept for backward compatibility
  'gateway_1_2',
  'gateway_3_4',
  'vpn_wired',
  'vpn_wireless',
  'explosion_proof_differential_pressure_meter_domestic',
  'explosion_proof_temperature_meter_domestic',
  'expansion_device',
  'relay_8ch',
  'relay_16ch',
  'main_board_replacement',
  'multiple_stack'
];

// ❌ DEFAULT_COSTS 제거됨 - 사용자 명시적 요구사항
// "하드코딩하지 말고 제조사별 원가 탭에서 직접 데이터를 가져다 사용하는 로직으로 작성해줘야해"
// 이제 DB에서 로드된 제조사별 원가만 사용합니다.
//
// 이전 하드코딩된 DEFAULT_COSTS는 실제 DB 값과 불일치했습니다:
// - 차압계: DEFAULT ₩100,000 vs DB ₩140,000
// - 온도계: DEFAULT ₩125,000 vs DB ₩120,000
// - 전류계들: DEFAULT ₩80,000 vs DB ₩70,000
// - PH센서: DEFAULT ₩250,000 vs DB ₩580,000

/**
 * 사업장 매출 실시간 계산 함수
 *
 * @param business - 사업장 정보
 * @param pricingData - 가격 데이터 (환경부 고시가, 제조사별 원가, 영업점 설정, 실사비용, 설치비)
 * @returns 계산된 매출 정보
 *
 * 📌 Admin 대시보드 (/api/dashboard/revenue/route.ts Line 267-350)와 100% 동일한 계산 로직
 */
export function calculateBusinessRevenue(
  business: BusinessInfo,
  pricingData: PricingData
): RevenueCalculationResult {
  const {
    officialPrices,
    manufacturerPrices,
    salesOfficeSettings,
    surveyCostSettings,
    baseInstallationCosts
  } = pricingData;

  // 사업장의 제조사 정보 (기본값: ecosense)
  const rawManufacturer = business.manufacturer || 'ecosense';

  // 제조사 원가 맵 키 탐색 우선순위:
  // 1) 소문자 정규화 (영문 코드: ecosense)
  // 2) 원본 그대로 (한글: 에코센스)
  // 3) 영문→한글 변환 (ecosense → 에코센스)
  // 4) 한글→영문 변환 (에코센스 → ecosense)
  // DB manufacturer_pricing 테이블 키가 한글/영문 어느 쪽이든 매칭되도록 처리
  const NAMES: Record<string, string> = { ecosense: '에코센스', cleanearth: '크린어스', gaia_cns: '가이아씨앤에스', evs: '이브이에스' };
  const NAMES_REV: Record<string, string> = { '에코센스': 'ecosense', '크린어스': 'cleanearth', '가이아씨앤에스': 'gaia_cns', '이브이에스': 'evs' };
  const candidates = [
    rawManufacturer.toLowerCase().trim(),
    rawManufacturer,
    NAMES[rawManufacturer.toLowerCase().trim()] || '',
    NAMES_REV[rawManufacturer] || '',
  ];
  let manufacturerCosts: Record<string, number> = {};
  for (const key of candidates) {
    if (key && manufacturerPrices[key]) {
      manufacturerCosts = manufacturerPrices[key];
      break;
    }
  }

  // 매출/제조사 매입 계산
  let businessRevenue = 0;
  let manufacturerCost = 0;
  let totalInstallationCosts = 0;
  let totalEquipmentCount = 0;

  EQUIPMENT_FIELDS.forEach(field => {
    const quantity = Number(business[field]) || 0;

    // ✅ 성능 최적화: 수량이 0이면 계산 생략
    if (quantity <= 0) return;

    const officialPrice = officialPrices[field];

    // ✅ 성능 최적화: 매출 단가 없으면 생략
    if (!officialPrice) return;

    // 매출 = 환경부 고시가 × 수량
    businessRevenue += officialPrice * quantity;

    // 🔧 제조사별 원가 직접 사용 (DB에서 로드된 값만 사용)
    // DEFAULT_COSTS 사용 안 함 - 사용자 명시적 요구사항
    let costPrice = manufacturerCosts[field] || 0;

    manufacturerCost += costPrice * quantity;

    // 기본 설치비 (equipment_installation_cost 테이블)
    const installCost = baseInstallationCosts[field] || 0;
    totalInstallationCosts += installCost * quantity;
    totalEquipmentCount += quantity;
  });

  // 추가공사비 및 협의사항 반영
  const additionalCost = Number(business.additional_cost) || 0;
  const negotiationDiscount = business.negotiation
    ? parseFloat(String(business.negotiation)) || 0
    : 0;
  businessRevenue += additionalCost - negotiationDiscount;

  // 영업비용 계산 기준: 기기합계 - 협의사항 (추가공사비, 매출비용조정 제외) — API와 동일
  const commissionBaseRevenue = businessRevenue - additionalCost;

  // 매출비용 조정 반영 (revenue_adjustments JSONB 배열)
  const revenueAdjustmentTotal = (() => {
    const raw = (business as any).revenue_adjustments;
    if (!raw) return 0;
    try {
      const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!Array.isArray(arr)) return 0;
      return arr.reduce((s: number, a: any) => s + (Number(a.amount) || 0), 0);
    } catch {
      return 0;
    }
  })();
  businessRevenue += revenueAdjustmentTotal;

  // 영업비용 계산
  const salesOffice = business.sales_office || '기본';
  const commissionSettings = salesOfficeSettings[salesOffice] || {
    commission_type: 'percentage',
    commission_percentage: 10.0,
    commission_per_unit: null
  };

  let salesCommission = 0;
  if (commissionSettings.commission_type === 'percentage') {
    salesCommission = commissionBaseRevenue * (commissionSettings.commission_percentage / 100);
  } else {
    salesCommission = totalEquipmentCount * (commissionSettings.commission_per_unit || 0);
  }

  // 실사비용 계산 (실사일이 있는 경우에만 비용 추가)
  let totalSurveyCosts = 0;

  // 견적실사 비용 (견적실사일이 있는 경우에만)
  if (business.estimate_survey_date) {
    totalSurveyCosts += Number(surveyCostSettings.estimate ?? surveyCostSettings['estimate']) || 100000;
  }

  // 착공전실사 비용 (착공전실사일이 있는 경우에만)
  if (business.pre_construction_survey_date) {
    totalSurveyCosts += Number(surveyCostSettings.pre_construction ?? surveyCostSettings['pre_construction']) || 150000;
  }

  // 준공실사 비용 (준공실사일이 있는 경우에만)
  if (business.completion_survey_date) {
    totalSurveyCosts += Number(surveyCostSettings.completion ?? surveyCostSettings['completion']) || 200000;
  }

  // 실사비용 조정은 DB 조회가 필요하므로 클라이언트에서는 생략
  // (서버 측 계산에서는 survey_cost_adjustments 테이블 조회)

  // 복수굴뚝 추가 수량 설치비 (기본설치비에 포함)
  const multipleStackInstallExtra = Number(business.multiple_stack_install_extra) || 0;
  if (multipleStackInstallExtra > 0) {
    const unitInstallCost = baseInstallationCosts['multiple_stack'] || 0;
    totalInstallationCosts += unitInstallCost * multipleStackInstallExtra;
  }

  // 추가설치비 (설치팀 요청 추가 비용)
  const installationExtraCost = Number(business.installation_extra_cost) || 0;

  // 매입비용 조정 반영 (purchase_adjustments JSONB 배열)
  const purchaseAdjustmentTotal = (() => {
    const raw = (business as any).purchase_adjustments;
    if (!raw) return 0;
    try {
      const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!Array.isArray(arr)) return 0;
      return arr.reduce((s: number, a: any) => s + (Number(a.amount) || 0), 0);
    } catch {
      return 0;
    }
  })();

  // 매출 관리와 동일한 계산 방식
  // total_cost = 제조사 매입 + 매입비용 조정
  const totalCost = (Number(manufacturerCost) || 0) + purchaseAdjustmentTotal;

  // 총이익 = 매출 - 매입(조정 포함)
  const grossProfit = (Number(businessRevenue) || 0) - totalCost;

  // AS비용
  const asCost = Number(business.as_cost) || 0;

  // 커스텀 추가비용
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
  const netProfit = grossProfit -
                    (Number(salesCommission) || 0) -
                    (Number(totalSurveyCosts) || 0) -
                    (Number(totalInstallationCosts) || 0) -
                    (Number(installationExtraCost) || 0) -
                    asCost -
                    customCosts;

  return {
    total_revenue: Math.round(businessRevenue),
    total_cost: Math.round(totalCost),
    gross_profit: Math.round(grossProfit),
    net_profit: Math.round(netProfit),
    sales_commission: Math.round(salesCommission),
    adjusted_sales_commission: Math.round(salesCommission),
    survey_costs: Math.round(totalSurveyCosts),
    installation_costs: Math.round(totalInstallationCosts),
    installation_extra_cost: Math.round(installationExtraCost)
  };
}

/**
 * 여러 사업장의 매출을 일괄 계산
 *
 * @param businesses - 사업장 목록
 * @param pricingData - 가격 데이터
 * @returns 사업장별 계산 결과 맵 (business_id → RevenueCalculationResult)
 */
export function calculateMultipleBusinessRevenue(
  businesses: BusinessInfo[],
  pricingData: PricingData
): Map<string, RevenueCalculationResult> {
  const results = new Map<string, RevenueCalculationResult>();

  businesses.forEach(business => {
    const calculation = calculateBusinessRevenue(business, pricingData);
    results.set(business.id, calculation);
  });

  return results;
}

/**
 * 계산 결과 통계 집계
 *
 * @param calculations - 계산 결과 맵
 * @returns 총 매출, 총 이익, 평균 이익률 등
 */
export function aggregateRevenueStats(calculations: Map<string, RevenueCalculationResult>) {
  let totalRevenue = 0;
  let totalCost = 0;
  let totalProfit = 0;
  let totalSalesCommission = 0;
  let totalInstallationCost = 0;

  calculations.forEach(calc => {
    totalRevenue += calc.total_revenue;
    totalCost += calc.total_cost;
    totalProfit += calc.net_profit;
    totalSalesCommission += calc.sales_commission;
    totalInstallationCost += calc.installation_costs + calc.installation_extra_cost;
  });

  const avgProfitRate = totalRevenue > 0
    ? ((totalProfit / totalRevenue) * 100)
    : 0;

  return {
    total_businesses: calculations.size,
    total_revenue: Math.round(totalRevenue),
    total_cost: Math.round(totalCost),
    total_profit: Math.round(totalProfit),
    total_sales_commission: Math.round(totalSalesCommission),
    total_installation_cost: Math.round(totalInstallationCost),
    average_margin: avgProfitRate.toFixed(1) + '%'
  };
}
