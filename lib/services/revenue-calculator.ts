/**
 * Revenue Calculator Service
 *
 * 서버 사이드 매출 계산 로직 — /api/revenue/calculate POST 핸들러에서 추출
 * auto-calculate, calculate-batch 등 내부 호출자가 HTTP 없이 직접 사용합니다.
 *
 * 책임:
 * - DB 조회 (supabase-direct)
 * - 계산 로직 실행
 * - save_result = true 일 때 revenue_calculations UPSERT (permissionLevel >= 3 필요)
 *
 * 변경 금지:
 * - 반환 타입 구조 (프론트엔드 호환 목적의 래퍼 route.ts가 { success, data } 형태로 감쌈)
 * - 권한 체크 (permissionLevel >= 3 저장 조건)
 */

import { queryOne, queryAll } from '@/lib/supabase-direct';
import { getManufacturerAliases } from '@/constants/manufacturers';

// ─── 타입 정의 ────────────────────────────────────────────────────────────────

export interface EquipmentBreakdown {
  equipment_type: string;
  equipment_name: string;
  quantity: number;
  unit_official_price: number;
  unit_manufacturer_price: number;
  unit_installation_cost: number;
  total_revenue: number;
  total_cost: number;
  total_installation: number;
  profit: number;
}

export interface CostBreakdown {
  sales_commission_type: 'percentage' | 'per_unit';
  sales_commission_rate: number;
  sales_commission_amount: number;
  survey_costs: {
    estimate: number;
    pre_construction: number;
    completion: number;
    adjustments: number;
    total: number;
  };
  total_installation_costs: number;
}

export interface RevenueCalculationResult {
  business_id: string;
  business_name: string;
  sales_office: string;
  calculation_date: string;
  base_revenue: number;
  total_revenue: number;
  total_cost: number;
  installation_extra_cost: number;
  gross_profit: number;
  sales_commission: number;
  survey_costs: number;
  installation_costs: number;
  as_cost?: number;
  custom_additional_costs?: any;
  net_profit: number;
  equipment_breakdown: EquipmentBreakdown[];
  multiple_stack_unit_install_cost: number;
  cost_breakdown: CostBreakdown;
  operating_cost_adjustment?: any;
  adjusted_sales_commission?: number | null;
  survey_fee_adjustment?: number;
  adjusted_survey_costs?: number;
}

/**
 * 글로벌 마스터 데이터 (배치 계산 시 루프 밖에서 1회 사전 로드)
 *
 * government_pricing, manufacturer_pricing, equipment_installation_cost,
 * survey_cost_settings 4개 테이블은 사업장마다 동일한 값을 반환하므로
 * 배치 계산 전 한 번만 조회하고 재사용합니다.
 */
export interface PreloadedMasterData {
  /** government_pricing — equipment_type → row */
  officialPriceMap: Record<string, any>;
  /** manufacturer_pricing — equipment_type → row, 제조사별 */
  manufacturerPricingByManufacturer: Record<string, Record<string, any>>;
  /** equipment_installation_cost — equipment_type → base_installation_cost */
  installationCostMap: Record<string, number>;
  /** survey_cost_settings — survey_type → base_cost */
  surveyCostMap: Record<string, number>;
}

export interface CalculateRevenueParams {
  business_id: string | number;
  calculation_date?: string;
  save_result?: boolean;
  userId: string | number;
  permissionLevel: number;
  /** 배치 계산 시 루프 밖에서 사전 로드된 글로벌 마스터 데이터 (있으면 해당 테이블 재조회 생략) */
  preloadedMasterData?: PreloadedMasterData;
}

export interface CalculateRevenueReturn {
  calculation: RevenueCalculationResult;
  saved_record: any | null;
  summary: {
    equipment_count: number;
    profit_margin: string;
    net_margin: string;
  };
}

// ─── 메인 함수 ────────────────────────────────────────────────────────────────

/**
 * 사업장 매출 계산 서비스 함수
 *
 * route.ts의 POST 핸들러에서 계산 로직을 추출한 함수입니다.
 * HTTP 계층(인증·파싱·응답)을 제외한 순수 계산 + DB 로직만 포함합니다.
 *
 * @throws Error — 사업장 정보 없음, 가격 정보 조회 실패 등
 */
export async function calculateRevenue(
  params: CalculateRevenueParams
): Promise<CalculateRevenueReturn> {
  const {
    business_id,
    calculation_date,
    save_result = true,
    userId,
    permissionLevel,
    preloadedMasterData,
  } = params;

  // 1. 사업장 정보 조회
  const businessInfo = await queryOne(
    'SELECT * FROM business_info WHERE id = $1',
    [business_id]
  );

  if (!businessInfo) {
    throw new Error('사업장 정보를 찾을 수 없습니다.');
  }

  console.log('🏢 [REVENUE-SVC] 사업장 정보 조회:', {
    business_id,
    business_name: businessInfo.business_name,
    survey_fee_adjustment: businessInfo.survey_fee_adjustment,
    additional_cost: businessInfo.additional_cost,
    negotiation: businessInfo.negotiation,
    estimate_survey_date: businessInfo.estimate_survey_date,
    pre_construction_survey_date: businessInfo.pre_construction_survey_date,
    completion_survey_date: businessInfo.completion_survey_date,
  });

  // 계산일 결정 우선순위:
  // 1. 명시적으로 전달된 calculation_date
  // 2. 사업장의 설치완료일 (completion_date)
  // 3. 사업장의 설치일 (installation_date)
  // 4. 현재 날짜
  const calcDate =
    calculation_date ||
    businessInfo.completion_date ||
    businessInfo.installation_date ||
    new Date().toISOString().split('T')[0];

  // 2. 환경부 고시가 정보 조회 (활성화된 최신 데이터)
  // preloadedMasterData가 있으면 DB 재조회 생략
  let officialPriceMap: Record<string, any>;
  if (preloadedMasterData) {
    officialPriceMap = preloadedMasterData.officialPriceMap;
  } else {
    const pricingData = await queryAll(
      'SELECT * FROM government_pricing WHERE is_active = $1',
      [true]
    );

    if (!pricingData) {
      throw new Error('가격 정보 조회에 실패했습니다.');
    }

    officialPriceMap = pricingData?.reduce((acc: Record<string, any>, item: any) => {
      acc[item.equipment_type] = item;
      return acc;
    }, {} as Record<string, any>) || {};
  }

  // 2-1. 제조사별 원가 정보 조회
  let manufacturer = businessInfo.manufacturer;
  if (!manufacturer || manufacturer.trim() === '') {
    manufacturer = '에코센스';
  } else {
    manufacturer = manufacturer.trim();
  }

  // preloadedMasterData가 있으면 DB 재조회 생략 (제조사별로 필터링)
  let manufacturerCostMap: Record<string, any>;
  if (preloadedMasterData) {
    // 영문코드/한글명 별칭 모두 시도하여 첫 번째 매칭 사용
    const aliases = [manufacturer, ...getManufacturerAliases(manufacturer), manufacturer.toLowerCase()];
    manufacturerCostMap = {};
    for (const alias of aliases) {
      if (alias && preloadedMasterData.manufacturerPricingByManufacturer[alias]) {
        manufacturerCostMap = preloadedMasterData.manufacturerPricingByManufacturer[alias];
        break;
      }
    }
  } else {
    // DB에서 영문코드/한글명 두 형식 모두 조회
    const aliases = [...new Set([manufacturer, ...getManufacturerAliases(manufacturer)])];
    const placeholders = aliases.map((_, i) => `$${i + 2}`).join(', ');
    const manufacturerPricing = await queryAll(
      `SELECT * FROM manufacturer_pricing
       WHERE manufacturer = ANY(ARRAY[${placeholders}]::text[])
       AND is_active = $1`,
      [true, ...aliases]
    );

    if (!manufacturerPricing) {
      throw new Error('제조사별 원가 조회에 실패했습니다.');
    }

    manufacturerCostMap = manufacturerPricing.reduce((acc: Record<string, any>, item: any) => {
      acc[item.equipment_type] = item;
      return acc;
    }, {} as Record<string, any>);
  }

  // 2-2. 기기별 기본 설치비 조회
  // preloadedMasterData가 있으면 DB 재조회 생략
  let installationCostMap: Record<string, number>;
  if (preloadedMasterData) {
    installationCostMap = preloadedMasterData.installationCostMap;
  } else {
    const installationCosts = await queryAll(
      `SELECT * FROM equipment_installation_cost
       WHERE is_active = $1`,
      [true]
    );

    if (!installationCosts) {
      console.error('설치비 조회 오류');
    }

    installationCostMap = installationCosts?.reduce((acc: Record<string, number>, item: any) => {
      acc[item.equipment_type] = Number(item.base_installation_cost) || 0;
      return acc;
    }, {} as Record<string, number>) || {};
  }

  // 2-3. 사업장별 추가 설치비 조회
  const additionalCosts = await queryAll(
    `SELECT * FROM business_additional_installation_cost
     WHERE business_id = $1
     AND is_active = $2
     AND applied_date <= $3`,
    [business_id, true, calcDate]
  );

  if (!additionalCosts) {
    console.error('추가 설치비 조회 오류');
  }

  const additionalCostMap = additionalCosts?.reduce((acc: Record<string, number>, item: any) => {
    const key = item.equipment_type || 'all';
    if (!acc[key]) acc[key] = 0;
    acc[key] += Number(item.additional_cost) || 0;
    return acc;
  }, {} as Record<string, number>) || {};

  if (Object.keys(manufacturerCostMap).length === 0) {
    console.warn(`제조사 '${manufacturer}'의 원가 데이터 없음:`, businessInfo.business_name);
  }

  // 3. 영업비용 설정 조회
  const salesOffice = businessInfo.sales_office || '기본';

  const manufacturerCodeMap: Record<string, string> = {
    '에코센스': 'ecosense',
    '크린어스': 'cleanearth',
    '가이아씨앤에스': 'gaia_cns',
    '이브이에스': 'evs',
  };
  const manufacturerCode = manufacturerCodeMap[manufacturer] || manufacturer.toLowerCase();

  // 3-1. 영업점별 + 제조사별 수수료율 조회 (최우선)
  const commissionRate = await queryOne(
    `SELECT * FROM sales_office_commission_rates
     WHERE sales_office = $1
     AND manufacturer = $2
     ORDER BY effective_from DESC
     LIMIT 1`,
    [salesOffice, manufacturerCode]
  );

  // 3-2. 영업점별 기본 설정 조회 (폴백)
  const salesSettings = await queryOne(
    `SELECT * FROM sales_office_cost_settings
     WHERE sales_office = $1
     AND is_active = $2
     ORDER BY effective_from DESC
     LIMIT 1`,
    [salesOffice, true]
  );

  const defaultCommission = {
    commission_type: 'percentage',
    commission_percentage: 10.0,
    commission_per_unit: null,
  };

  let commissionSettings: any;
  if (commissionRate) {
    commissionSettings = {
      commission_type: 'percentage',
      commission_percentage: Number(commissionRate.commission_rate) || 10.0,
      commission_per_unit: null,
    };
  } else if (salesSettings) {
    commissionSettings = {
      ...salesSettings,
      commission_percentage: salesSettings.commission_percentage
        ? Number(salesSettings.commission_percentage)
        : undefined,
      commission_per_unit: salesSettings.commission_per_unit
        ? Number(salesSettings.commission_per_unit)
        : undefined,
    };
  } else {
    commissionSettings = defaultCommission;
  }

  // 4. 실사비용 설정 조회
  // preloadedMasterData가 있으면 DB 재조회 생략
  let surveyCostMap: Record<string, number>;
  if (preloadedMasterData) {
    surveyCostMap = preloadedMasterData.surveyCostMap;
  } else {
    const surveyCostsRaw = await queryAll(
      `SELECT * FROM survey_cost_settings
       WHERE is_active = $1`,
      [true]
    );

    surveyCostMap = surveyCostsRaw?.reduce((acc: Record<string, number>, item: any) => {
      acc[item.survey_type] = Number(item.base_cost) || 0;
      return acc;
    }, {} as Record<string, number>) || {
      estimate: 100000,
      pre_construction: 150000,
      completion: 200000,
    };

    console.log('📋 [REVENUE-SVC] 실사비용 설정 로드:', {
      business_id,
      calcDate,
      surveyCosts_count: surveyCostsRaw?.length || 0,
      surveyCostMap,
    });
  }

  // 5. 실사비용 조정 조회
  const surveyAdjustments = await queryAll(
    `SELECT * FROM survey_cost_adjustments
     WHERE business_id = $1
     AND applied_date <= $2`,
    [business_id, calcDate]
  );

  const totalAdjustments =
    surveyAdjustments?.reduce((sum: number, adj: any) => sum + (Number(adj.adjustment_amount) || 0), 0) || 0;

  // 6. 측정기기별 매출/매입 계산
  const equipmentFields = [
    'ph_meter',
    'differential_pressure_meter',
    'temperature_meter',
    'discharge_current_meter',
    'fan_current_meter',
    'pump_current_meter',
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
    'multiple_stack',
  ];

  let totalRevenue = 0;
  let totalCost = 0;
  let totalInstallationCosts = 0;
  let totalEquipmentCount = 0;
  const equipmentBreakdown: EquipmentBreakdown[] = [];

  for (const field of equipmentFields) {
    const quantity = businessInfo[field] || 0;

    if (quantity > 0) {
      const officialPrice = officialPriceMap[field];

      const DEFAULT_OFFICIAL_PRICES: Record<string, number> = {
        ph_meter: 1000000,
        differential_pressure_meter: 400000,
        temperature_meter: 500000,
        discharge_current_meter: 300000,
        fan_current_meter: 300000,
        pump_current_meter: 300000,
        gateway: 1600000,
        gateway_1_2: 1600000,
        gateway_3_4: 1600000,
        vpn_wired: 400000,
        vpn_wireless: 400000,
        explosion_proof_differential_pressure_meter_domestic: 800000,
        explosion_proof_temperature_meter_domestic: 1500000,
        expansion_device: 800000,
        relay_8ch: 300000,
        relay_16ch: 1600000,
        main_board_replacement: 350000,
        multiple_stack: 480000,
      };

      let unitRevenue = 0;
      if (officialPrice) {
        unitRevenue = Number(officialPrice.official_price) || 0;
      } else {
        unitRevenue = DEFAULT_OFFICIAL_PRICES[field] || 0;
      }

      const manufacturerCost = manufacturerCostMap[field];
      let unitCost = manufacturerCost ? Number(manufacturerCost.cost_price) || 0 : 0;

      if (unitCost === 0 && quantity > 0) {
        console.warn(`⚠️ [SVC CALC] ${field}: 제조사별 원가 없음`);
      }

      let baseInstallCost = installationCostMap[field] || 0;
      if ((field === 'gateway_1_2' || field === 'gateway_3_4') && baseInstallCost === 0) {
        baseInstallCost = installationCostMap['gateway'] || 0;
      }
      const commonAdditionalCost = additionalCostMap['all'] || 0;
      const equipmentAdditionalCost = additionalCostMap[field] || 0;
      const unitInstallation = baseInstallCost + commonAdditionalCost + equipmentAdditionalCost;

      const itemRevenue = unitRevenue * quantity;
      const itemCost = unitCost * quantity;
      const itemInstallation = unitInstallation * quantity;

      totalRevenue += itemRevenue;
      totalCost += itemCost;
      totalInstallationCosts += itemInstallation;
      totalEquipmentCount += quantity;

      const EQUIPMENT_NAMES: Record<string, string> = {
        ph_meter: 'PH센서',
        differential_pressure_meter: '차압계',
        temperature_meter: '온도계',
        discharge_current_meter: '배출전류계',
        fan_current_meter: '송풍전류계',
        pump_current_meter: '펌프전류계',
        gateway: '게이트웨이',
        gateway_1_2: '게이트웨이(1,2)',
        gateway_3_4: '게이트웨이(3,4)',
        vpn_wired: 'VPN(유선)',
        vpn_wireless: 'VPN(무선)',
        explosion_proof_differential_pressure_meter_domestic: '방폭차압계(국산)',
        explosion_proof_temperature_meter_domestic: '방폭온도계(국산)',
        expansion_device: '확장디바이스',
        relay_8ch: '중계기(8채널)',
        relay_16ch: '중계기(16채널)',
        main_board_replacement: '메인보드교체',
        multiple_stack: '복수굴뚝',
      };

      const equipmentName = officialPrice?.equipment_name || EQUIPMENT_NAMES[field] || field;

      equipmentBreakdown.push({
        equipment_type: field,
        equipment_name: equipmentName,
        quantity,
        unit_official_price: unitRevenue,
        unit_manufacturer_price: unitCost,
        unit_installation_cost: unitInstallation,
        total_revenue: itemRevenue,
        total_cost: itemCost,
        total_installation: itemInstallation,
        profit: itemRevenue - itemCost - itemInstallation,
      });
    }
  }

  // 6-1. 복수굴뚝 설치비 전용 추가 수량 반영
  const multipleStackInstallExtra = Number(businessInfo.multiple_stack_install_extra) || 0;
  if (multipleStackInstallExtra > 0) {
    const unitInstallationExtra = installationCostMap['multiple_stack'] || 0;
    const extraInstallTotal = unitInstallationExtra * multipleStackInstallExtra;
    totalInstallationCosts += extraInstallTotal;

    equipmentBreakdown.push({
      equipment_type: 'multiple_stack_install_extra',
      equipment_name: '복수굴뚝 (추가 수량)',
      quantity: multipleStackInstallExtra,
      unit_official_price: 0,
      unit_manufacturer_price: 0,
      unit_installation_cost: unitInstallationExtra,
      total_revenue: 0,
      total_cost: 0,
      total_installation: extraInstallTotal,
      profit: -extraInstallTotal,
    });
  }

  // 7. 실사비용 계산
  let baseSurveyCosts = 0;
  if (
    businessInfo.estimate_survey_date &&
    String(businessInfo.estimate_survey_date).trim() !== ''
  ) {
    baseSurveyCosts += surveyCostMap.estimate || 0;
  }
  if (
    businessInfo.pre_construction_survey_date &&
    String(businessInfo.pre_construction_survey_date).trim() !== ''
  ) {
    baseSurveyCosts += surveyCostMap.pre_construction || 0;
  }
  if (
    businessInfo.completion_survey_date &&
    String(businessInfo.completion_survey_date).trim() !== ''
  ) {
    baseSurveyCosts += surveyCostMap.completion || 0;
  }

  const surveyFeeAdjustment = Math.round(Number(businessInfo.survey_fee_adjustment) || 0);
  const totalSurveyCosts = Math.round(baseSurveyCosts + totalAdjustments + surveyFeeAdjustment);

  console.log('💰 [REVENUE-SVC] 실사비용 계산:', {
    business_id,
    baseSurveyCosts,
    totalAdjustments,
    surveyFeeAdjustment,
    totalSurveyCosts,
  });

  // 8. 추가공사비 및 협의사항 반영
  const additionalCost = Math.round(Number(businessInfo.additional_cost) || 0);
  const negotiationDiscount = Math.round(
    businessInfo.negotiation ? parseFloat(businessInfo.negotiation) || 0 : 0
  );

  // 8-1. 매출비용 조정 합계
  const revenueAdjustmentTotal = (() => {
    const raw = businessInfo.revenue_adjustments;
    if (!raw) return 0;
    try {
      const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!Array.isArray(arr)) return 0;
      return Math.round(arr.reduce((s: number, a: any) => s + (Number(a.amount) || 0), 0));
    } catch {
      return 0;
    }
  })();

  // 8-2. 매입비용 조정 합계
  const purchaseAdjustmentTotal = (() => {
    const raw = businessInfo.purchase_adjustments;
    if (!raw) return 0;
    try {
      const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!Array.isArray(arr)) return 0;
      return Math.round(arr.reduce((s: number, a: any) => s + (Number(a.amount) || 0), 0));
    } catch {
      return 0;
    }
  })();

  const commissionBaseRevenue = totalRevenue - negotiationDiscount;
  const adjustedRevenue = totalRevenue + additionalCost - negotiationDiscount + revenueAdjustmentTotal;

  totalCost = Math.round(totalCost + purchaseAdjustmentTotal);

  const installationExtraCost = Number(businessInfo.installation_extra_cost) || 0;

  let salesCommission = 0;
  if (commissionSettings.commission_type === 'percentage') {
    salesCommission = commissionBaseRevenue * (commissionSettings.commission_percentage / 100);
  } else {
    salesCommission = totalEquipmentCount * (commissionSettings.commission_per_unit || 0);
  }

  // 9.1. 영업비용 조정 조회
  const operatingCostAdjustment = await queryOne(
    `SELECT * FROM operating_cost_adjustments
     WHERE business_id = $1
     LIMIT 1`,
    [business_id]
  );

  let adjustedSalesCommission = salesCommission;
  let hasAdjustment = false;
  if (operatingCostAdjustment) {
    hasAdjustment = true;
    const adjustmentAmount = Number(operatingCostAdjustment.adjustment_amount) || 0;
    if (operatingCostAdjustment.adjustment_type === 'add') {
      adjustedSalesCommission = salesCommission + adjustmentAmount;
    } else {
      adjustedSalesCommission = salesCommission - adjustmentAmount;
    }
  }

  // 10. AS 비용 및 커스텀 추가비용
  const asCost = Number(businessInfo.as_cost || 0);

  let customCostTotal = 0;
  if (businessInfo.custom_additional_costs) {
    try {
      let costs = [];
      if (typeof businessInfo.custom_additional_costs === 'string') {
        costs = JSON.parse(businessInfo.custom_additional_costs);
      } else if (Array.isArray(businessInfo.custom_additional_costs)) {
        costs = businessInfo.custom_additional_costs;
      }
      customCostTotal = Array.isArray(costs)
        ? costs.reduce((sum: number, item: any) => sum + (Number(item.amount) || 0), 0)
        : 0;
    } catch (e) {
      console.warn('⚠️ [REVENUE-SVC] 커스텀 추가비용 파싱 오류:', e);
      customCostTotal = 0;
    }
  }

  // 11. 최종 계산
  const grossProfit = Math.round(adjustedRevenue - totalCost);
  const netProfit = Math.round(
    grossProfit -
      installationExtraCost -
      adjustedSalesCommission -
      totalSurveyCosts -
      totalInstallationCosts -
      asCost -
      customCostTotal
  );

  console.log('📊 [REVENUE-SVC] 순이익 계산:', {
    business_id,
    baseRevenue: equipmentBreakdown.reduce((s, i) => s + i.total_revenue, 0),
    additionalCost,
    negotiationDiscount,
    revenueAdjustmentTotal,
    purchaseAdjustmentTotal,
    adjustedRevenue,
    totalCost,
    grossProfit,
    installationExtraCost,
    adjustedSalesCommission,
    totalSurveyCosts,
    totalInstallationCosts,
    asCost,
    customCostTotal,
    netProfit,
  });

  const baseRevenue = equipmentBreakdown.reduce((sum, item) => sum + item.total_revenue, 0);

  const result: RevenueCalculationResult = {
    business_id: String(business_id),
    business_name: businessInfo.business_name,
    sales_office: salesOffice,
    calculation_date: calcDate,
    base_revenue: baseRevenue,
    total_revenue: adjustedRevenue,
    total_cost: totalCost,
    installation_extra_cost: installationExtraCost,
    gross_profit: grossProfit,
    sales_commission: salesCommission,
    survey_costs: totalSurveyCosts,
    installation_costs: totalInstallationCosts,
    as_cost: asCost,
    custom_additional_costs: businessInfo.custom_additional_costs,
    net_profit: netProfit,
    equipment_breakdown: equipmentBreakdown,
    multiple_stack_unit_install_cost: installationCostMap['multiple_stack'] || 0,
    cost_breakdown: {
      sales_commission_type: commissionSettings.commission_type,
      sales_commission_rate:
        commissionSettings.commission_type === 'percentage'
          ? commissionSettings.commission_percentage
          : commissionSettings.commission_per_unit,
      sales_commission_amount: salesCommission,
      survey_costs: {
        estimate: surveyCostMap.estimate,
        pre_construction: surveyCostMap.pre_construction,
        completion: surveyCostMap.completion,
        adjustments: totalAdjustments,
        total: totalSurveyCosts,
      },
      total_installation_costs: totalInstallationCosts,
    },
    operating_cost_adjustment: operatingCostAdjustment || null,
    adjusted_sales_commission: hasAdjustment ? adjustedSalesCommission : null,
    survey_fee_adjustment: surveyFeeAdjustment,
    adjusted_survey_costs: totalSurveyCosts,
  };

  // 12. DB 저장 (save_result && permissionLevel >= 3)
  let savedCalculation = null;

  if (save_result) {
    if (permissionLevel < 3) {
      console.warn(`DB 저장 권한 부족 (권한 ${permissionLevel}, 필요: 3 이상)`);
    } else {
      const pricingSnapshot = {
        manufacturer,
        official_prices: officialPriceMap,
        manufacturer_costs: manufacturerCostMap,
        installation_costs: installationCostMap,
        additional_costs: additionalCostMap,
        calculation_date: calcDate,
      };

      try {
        const saved = await queryOne(
          `INSERT INTO revenue_calculations (
            business_id, business_name, calculation_date, total_revenue, total_cost,
            gross_profit, sales_commission, adjusted_sales_commission, survey_costs,
            installation_costs, installation_extra_cost, net_profit, equipment_breakdown, cost_breakdown,
            pricing_version_snapshot, sales_office, business_category, calculated_by, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
          ON CONFLICT (business_id, calculation_date)
          DO UPDATE SET
            business_name = $2,
            total_revenue = $4,
            total_cost = $5,
            gross_profit = $6,
            sales_commission = $7,
            adjusted_sales_commission = $8,
            survey_costs = $9,
            installation_costs = $10,
            installation_extra_cost = $11,
            net_profit = $12,
            equipment_breakdown = $13,
            cost_breakdown = $14,
            pricing_version_snapshot = $15,
            sales_office = $16,
            business_category = $17,
            calculated_by = $18,
            updated_at = $19
          RETURNING *`,
          [
            business_id,
            businessInfo.business_name,
            calcDate,
            adjustedRevenue,
            totalCost,
            grossProfit,
            salesCommission,
            hasAdjustment ? adjustedSalesCommission : null,
            totalSurveyCosts,
            totalInstallationCosts,
            installationExtraCost,
            netProfit,
            JSON.stringify(equipmentBreakdown),
            JSON.stringify(result.cost_breakdown),
            JSON.stringify(pricingSnapshot),
            salesOffice,
            businessInfo.category || null,
            userId,
            new Date().toISOString(),
          ]
        );

        savedCalculation = saved;
      } catch (saveError) {
        console.error('매출 계산 저장 오류:', saveError);
      }
    }
  }

  console.log('🎯 [REVENUE-SVC] 응답 데이터 생성:', {
    business_id,
    business_name: businessInfo.business_name,
    result_survey_costs: result.survey_costs,
    result_net_profit: result.net_profit,
    saved_survey_costs: savedCalculation?.survey_costs,
    saved_net_profit: savedCalculation?.net_profit,
  });

  return {
    calculation: result,
    saved_record: savedCalculation,
    summary: {
      equipment_count: totalEquipmentCount,
      profit_margin:
        totalRevenue > 0
          ? ((grossProfit / totalRevenue) * 100).toFixed(2) + '%'
          : '0%',
      net_margin:
        totalRevenue > 0
          ? ((netProfit / totalRevenue) * 100).toFixed(2) + '%'
          : '0%',
    },
  };
}

// ─── 배치 최적화 헬퍼 ─────────────────────────────────────────────────────────

/**
 * 글로벌 마스터 데이터 사전 로드
 *
 * 배치 계산(auto-calculate, calculate-batch) 시 루프 진입 전 한 번만 호출합니다.
 * 반환값을 calculateRevenue({ ..., preloadedMasterData }) 에 넘기면
 * government_pricing, manufacturer_pricing, equipment_installation_cost,
 * survey_cost_settings 4개 테이블의 N+1 조회를 제거합니다.
 */
export async function preloadMasterData(): Promise<PreloadedMasterData> {
  const [pricingRows, manufacturerRows, installationRows, surveyCostRows] = await Promise.all([
    queryAll('SELECT * FROM government_pricing WHERE is_active = $1', [true]),
    queryAll('SELECT * FROM manufacturer_pricing WHERE is_active = $1', [true]),
    queryAll('SELECT * FROM equipment_installation_cost WHERE is_active = $1', [true]),
    queryAll('SELECT * FROM survey_cost_settings WHERE is_active = $1', [true]),
  ]);

  // government_pricing: equipment_type → row
  const officialPriceMap = (pricingRows || []).reduce((acc: Record<string, any>, item: any) => {
    acc[item.equipment_type] = item;
    return acc;
  }, {} as Record<string, any>);

  // manufacturer_pricing: 제조사명 → { equipment_type → row }
  // 영문코드/한글명 양쪽 키로 등록하여 어떤 형식으로 조회해도 매칭되도록 처리
  const manufacturerPricingByManufacturer = (manufacturerRows || []).reduce(
    (acc: Record<string, Record<string, any>>, item: any) => {
      const mfr: string = item.manufacturer || '';
      for (const alias of [mfr, ...getManufacturerAliases(mfr)]) {
        if (!alias) continue;
        if (!acc[alias]) acc[alias] = {};
        acc[alias][item.equipment_type] = item;
      }
      return acc;
    },
    {} as Record<string, Record<string, any>>
  );

  // equipment_installation_cost: equipment_type → base_installation_cost
  const installationCostMap = (installationRows || []).reduce(
    (acc: Record<string, number>, item: any) => {
      acc[item.equipment_type] = Number(item.base_installation_cost) || 0;
      return acc;
    },
    {} as Record<string, number>
  );

  // survey_cost_settings: survey_type → base_cost
  const surveyCostMap = (surveyCostRows || []).reduce(
    (acc: Record<string, number>, item: any) => {
      acc[item.survey_type] = Number(item.base_cost) || 0;
      return acc;
    },
    { estimate: 100000, pre_construction: 150000, completion: 200000 } as Record<string, number>
  );

  return {
    officialPriceMap,
    manufacturerPricingByManufacturer,
    installationCostMap,
    surveyCostMap,
  };
}
