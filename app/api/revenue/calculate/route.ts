import { NextRequest, NextResponse } from 'next/server';
import { queryOne, queryAll, query as pgQuery } from '@/lib/supabase-direct';
import { verifyTokenString } from '@/utils/auth';

// Force dynamic rendering for API routes
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface EquipmentBreakdown {
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

interface CostBreakdown {
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

interface RevenueCalculationResult {
  business_id: string;
  business_name: string;
  sales_office: string;
  calculation_date: string;
  base_revenue: number;  // 기본 매출 (기기 합계, 조정 전)
  total_revenue: number;  // 최종 매출 (기본 매출 + 추가공사비 - 협의사항 + 매출비용 조정)
  total_cost: number;
  installation_extra_cost: number;  // 추가설치비 (설치팀 요청 추가 비용)
  gross_profit: number;
  sales_commission: number;
  survey_costs: number;
  installation_costs: number;
  as_cost?: number;  // AS 비용
  custom_additional_costs?: any;  // 커스텀 추가비용 (JSONB)
  net_profit: number;
  equipment_breakdown: EquipmentBreakdown[];
  cost_breakdown: CostBreakdown;
}

// 매출 계산 실행
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

    if (!permissionLevel || permissionLevel < 1) {
      return NextResponse.json({
        success: false,
        message: '매출 계산 권한이 필요합니다.'
      }, { status: 403 });
    }

    const body = await request.json();
    const { business_id, calculation_date, save_result = true } = body;

    if (!business_id) {
      return NextResponse.json({
        success: false,
        message: 'business_id가 필요합니다.'
      }, { status: 400 });
    }

    // 1. 사업장 정보 조회 (먼저 조회하여 설치일 확인) - Direct PostgreSQL
    const businessInfo = await queryOne(
      'SELECT * FROM business_info WHERE id = $1',
      [business_id]
    );

    if (!businessInfo) {
      return NextResponse.json({
        success: false,
        message: '사업장 정보를 찾을 수 없습니다.'
      }, { status: 404 });
    }

    console.log('🏢 [REVENUE-API] 사업장 정보 조회:', {
      business_id,
      business_name: businessInfo.business_name,
      survey_fee_adjustment: businessInfo.survey_fee_adjustment,
      additional_cost: businessInfo.additional_cost,
      negotiation: businessInfo.negotiation,
      estimate_survey_date: businessInfo.estimate_survey_date,
      pre_construction_survey_date: businessInfo.pre_construction_survey_date,
      completion_survey_date: businessInfo.completion_survey_date
    });

    // 계산일 결정 우선순위:
    // 1. 명시적으로 전달된 calculation_date
    // 2. 사업장의 설치완료일 (completion_date)
    // 3. 사업장의 설치일 (installation_date)
    // 4. 현재 날짜
    const calcDate = calculation_date
      || businessInfo.completion_date
      || businessInfo.installation_date
      || new Date().toISOString().split('T')[0];

    // 2. 환경부 고시가 정보 조회 (활성화된 최신 데이터) - Direct PostgreSQL
    // 날짜 조건 제거하여 최신 활성 데이터만 조회
    const pricingData = await queryAll(
      'SELECT * FROM government_pricing WHERE is_active = $1',
      [true]
    );

    if (!pricingData) {
      console.error('가격 정보 조회 오류');
      return NextResponse.json({
        success: false,
        message: '가격 정보 조회에 실패했습니다.'
      }, { status: 500 });
    }

    // 환경부 고시가를 맵으로 변환
    const officialPriceMap = pricingData?.reduce((acc, item) => {
      acc[item.equipment_type] = item;
      return acc;
    }, {} as Record<string, any>) || {};

    // 2-1. 제조사별 원가 정보 조회
    let manufacturer = businessInfo.manufacturer;

    if (!manufacturer || manufacturer.trim() === '') {
      manufacturer = '에코센스'; // 계산용 기본값 (DB 저장 안 함)
    } else {
      // 공백 제거 (데이터베이스 매칭을 위해)
      manufacturer = manufacturer.trim();
    }

    // Direct PostgreSQL query - 날짜 조건 제거하여 최신 활성 데이터만 조회
    // 문제: calcDate(2024-10-27)보다 effective_from(2025-01-01)이 미래여서 조회 실패
    // 해결: 날짜 조건 없이 is_active=true인 최신 데이터만 조회
    const manufacturerPricing = await queryAll(
      `SELECT * FROM manufacturer_pricing
       WHERE manufacturer = $1
       AND is_active = $2`,
      [manufacturer, true]
    );

    if (!manufacturerPricing) {
      console.error('제조사별 원가 조회 오류');
      return NextResponse.json({
        success: false,
        message: '제조사별 원가 조회에 실패했습니다.'
      }, { status: 500 });
    }

    // 제조사별 원가를 맵으로 변환
    const manufacturerCostMap = manufacturerPricing?.reduce((acc, item) => {
      acc[item.equipment_type] = item;
      return acc;
    }, {} as Record<string, any>) || {};

    // 2-2. 기기별 기본 설치비 조회 - Direct PostgreSQL
    // 날짜 조건 제거하여 최신 활성 데이터만 조회
    const installationCosts = await queryAll(
      `SELECT * FROM equipment_installation_cost
       WHERE is_active = $1`,
      [true]
    );

    if (!installationCosts) {
      console.error('설치비 조회 오류');
    }

    const installationCostMap = installationCosts?.reduce((acc, item) => {
      // 🔧 PostgreSQL DECIMAL 타입이 문자열로 반환되므로 Number()로 변환
      acc[item.equipment_type] = Number(item.base_installation_cost) || 0;
      return acc;
    }, {} as Record<string, number>) || {};

    // 2-3. 사업장별 추가 설치비 조회 - Direct PostgreSQL
    // applied_date 조건은 유지 (사업장별 추가 설치비는 날짜별로 적용)
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

    // 사업장 추가 설치비를 맵으로 변환 (equipment_type별로 그룹화)
    const additionalCostMap = additionalCosts?.reduce((acc, item) => {
      const key = item.equipment_type || 'all'; // NULL이면 'all' 키로 저장
      if (!acc[key]) {
        acc[key] = 0;
      }
      // 🔧 PostgreSQL DECIMAL 타입이 문자열로 반환되므로 Number()로 변환
      acc[key] += Number(item.additional_cost) || 0;
      return acc;
    }, {} as Record<string, number>) || {};

    if (Object.keys(manufacturerCostMap).length === 0) {
      console.warn(`제조사 '${manufacturer}'의 원가 데이터 없음:`, businessInfo.business_name);
    }

    // 3. 영업비용 설정 조회: 영업점별 + 제조사별 수수료율 우선
    const salesOffice = businessInfo.sales_office || '기본';

    // 제조사명을 DB 코드로 변환 (한글 → 영문 코드)
    const manufacturerCodeMap: Record<string, string> = {
      '에코센스': 'ecosense',
      '크린어스': 'cleanearth',
      '가이아씨앤에스': 'gaia_cns',
      '이브이에스': 'evs'
    };
    const manufacturerCode = manufacturerCodeMap[manufacturer] || manufacturer.toLowerCase();

    // 3-1. 영업점별 + 제조사별 수수료율 조회 (최우선) - Direct PostgreSQL
    // 날짜 조건 제거하여 최신 활성 데이터만 조회
    const commissionRate = await queryOne(
      `SELECT * FROM sales_office_commission_rates
       WHERE sales_office = $1
       AND manufacturer = $2
       ORDER BY effective_from DESC
       LIMIT 1`,
      [salesOffice, manufacturerCode]
    );

    // 3-2. 영업점별 기본 설정 조회 (제조사별 수수료율 없을 경우 폴백) - Direct PostgreSQL
    // 날짜 조건 제거하여 최신 활성 데이터만 조회
    const salesSettings = await queryOne(
      `SELECT * FROM sales_office_cost_settings
       WHERE sales_office = $1
       AND is_active = $2
       ORDER BY effective_from DESC
       LIMIT 1`,
      [salesOffice, true]
    );

    // 기본 영업비용 설정 (최종 폴백, 10%)
    const defaultCommission = {
      commission_type: 'percentage',
      commission_percentage: 10.0,
      commission_per_unit: null
    };

    let commissionSettings;
    if (commissionRate) {
      commissionSettings = {
        commission_type: 'percentage',
        // 🔧 PostgreSQL DECIMAL 타입이 문자열로 반환되므로 Number()로 변환
        commission_percentage: Number(commissionRate.commission_rate) || 10.0,
        commission_per_unit: null
      };
    } else if (salesSettings) {
      // 🔧 salesSettings의 숫자 필드도 변환
      commissionSettings = {
        ...salesSettings,
        commission_percentage: salesSettings.commission_percentage ? Number(salesSettings.commission_percentage) : undefined,
        commission_per_unit: salesSettings.commission_per_unit ? Number(salesSettings.commission_per_unit) : undefined
      };
    } else {
      commissionSettings = defaultCommission;
    }

    // 4. 실사비용 설정 조회 - Direct PostgreSQL
    // 날짜 조건 제거하여 최신 활성 데이터만 조회
    const surveyCosts = await queryAll(
      `SELECT * FROM survey_cost_settings
       WHERE is_active = $1`,
      [true]
    );

    const surveyCostMap = surveyCosts?.reduce((acc, item) => {
      // 🔧 PostgreSQL DECIMAL 타입이 문자열로 반환되므로 Number()로 변환
      acc[item.survey_type] = Number(item.base_cost) || 0;
      return acc;
    }, {} as Record<string, number>) || {
      estimate: 100000,
      pre_construction: 150000,
      completion: 200000
    };

    console.log('📋 [REVENUE-API] 실사비용 설정 로드:', {
      business_id,
      calcDate,
      surveyCosts_count: surveyCosts?.length || 0,
      surveyCostMap
    });

    // 5. 실사비용 조정 조회 - Direct PostgreSQL
    const surveyAdjustments = await queryAll(
      `SELECT * FROM survey_cost_adjustments
       WHERE business_id = $1
       AND applied_date <= $2`,
      [business_id, calcDate]
    );

    const totalAdjustments = surveyAdjustments?.reduce((sum, adj) => {
      // 🔧 PostgreSQL DECIMAL 타입이 문자열로 반환되므로 Number()로 변환
      return sum + (Number(adj.adjustment_amount) || 0);
    }, 0) || 0;

    // 6. 측정기기별 매출/매입 계산
    const equipmentFields = [
      'ph_meter', 'differential_pressure_meter', 'temperature_meter',
      'discharge_current_meter', 'fan_current_meter', 'pump_current_meter',
      'gateway_1_2', 'gateway_3_4', 'vpn_wired', 'vpn_wireless', // ✅ gateway removed (deprecated)
      'explosion_proof_differential_pressure_meter_domestic',
      'explosion_proof_temperature_meter_domestic', 'expansion_device',
      'relay_8ch', 'relay_16ch', 'main_board_replacement', 'multiple_stack'
    ];

    let totalRevenue = 0;
    let totalCost = 0;
    let totalInstallationCosts = 0;
    let totalEquipmentCount = 0;
    const equipmentBreakdown: EquipmentBreakdown[] = [];

    for (const field of equipmentFields) {
      const quantity = businessInfo[field] || 0;

      if (quantity > 0) {
        // 환경부 고시가 (매출) - DB에서 조회, 없으면 기본값 사용
        const officialPrice = officialPriceMap[field];

        // 기본 환경부 고시가 (fallback)
        const DEFAULT_OFFICIAL_PRICES: Record<string, number> = {
          'ph_meter': 1000000,
          'differential_pressure_meter': 400000,
          'temperature_meter': 500000,
          'discharge_current_meter': 300000,
          'fan_current_meter': 300000,
          'pump_current_meter': 300000,
          'gateway': 1600000, // @deprecated
          'gateway_1_2': 1600000, // 게이트웨이(1,2) - 매출금액 동일
          'gateway_3_4': 1600000, // 게이트웨이(3,4) - 매출금액 동일
          'vpn_wired': 400000,
          'vpn_wireless': 400000,
          'explosion_proof_differential_pressure_meter_domestic': 800000,
          'explosion_proof_temperature_meter_domestic': 1500000,
          'expansion_device': 800000,
          'relay_8ch': 300000,
          'relay_16ch': 1600000,
          'main_board_replacement': 350000,
          'multiple_stack': 480000
        };

        let unitRevenue = 0;
        if (officialPrice) {
          // 🔧 PostgreSQL DECIMAL 타입이 문자열로 반환되므로 Number()로 변환
          unitRevenue = Number(officialPrice.official_price) || 0;
        } else {
          unitRevenue = DEFAULT_OFFICIAL_PRICES[field] || 0;
        }

        // 제조사별 원가 (매입) - DB에서 조회
        const manufacturerCost = manufacturerCostMap[field];

        // ❌ DEFAULT_COSTS 제거됨 - 사용자 명시적 요구사항
        // "하드코딩하지 말고 제조사별 원가 탭에서 직접 데이터를 가져다 사용하는 로직으로 작성해줘야해"
        // 이제 DB에서 로드된 제조사별 원가만 사용합니다.
        //
        // 이전 하드코딩된 DEFAULT_COSTS는 실제 DB 값과 불일치했습니다:
        // - 차압계: DEFAULT ₩100,000 vs DB ₩140,000
        // - 온도계: DEFAULT ₩125,000 vs DB ₩120,000
        // - 전류계들: DEFAULT ₩80,000 vs DB ₩70,000
        // - PH센서: DEFAULT ₩250,000 vs DB ₩580,000

        // 🔧 제조사별 원가 직접 사용 (DB에서 로드된 값만 사용)
        // DEFAULT_COSTS 사용 안 함 - 사용자 명시적 요구사항
        let unitCost = manufacturerCost ? Number(manufacturerCost.cost_price) || 0 : 0;

        // 디버깅: 원가가 0인 경우 경고 출력
        if (unitCost === 0 && quantity > 0) {
          console.warn(`⚠️ [API CALC] ${field}: 제조사별 원가 없음`);
        }

        // 설치비 = 기본 설치비 + 사업장 추가비(공통) + 사업장 추가비(기기별)
        // 🔧 게이트웨이(1,2), 게이트웨이(3,4) 모두 gateway 기본설치비 사용
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

        // 기기명 fallback
        const EQUIPMENT_NAMES: Record<string, string> = {
          'ph_meter': 'PH센서',
          'differential_pressure_meter': '차압계',
          'temperature_meter': '온도계',
          'discharge_current_meter': '배출전류계',
          'fan_current_meter': '송풍전류계',
          'pump_current_meter': '펌프전류계',
          'gateway': '게이트웨이', // @deprecated
          'gateway_1_2': '게이트웨이(1,2)',
          'gateway_3_4': '게이트웨이(3,4)',
          'vpn_wired': 'VPN(유선)',
          'vpn_wireless': 'VPN(무선)',
          'explosion_proof_differential_pressure_meter_domestic': '방폭차압계(국산)',
          'explosion_proof_temperature_meter_domestic': '방폭온도계(국산)',
          'expansion_device': '확장디바이스',
          'relay_8ch': '중계기(8채널)',
          'relay_16ch': '중계기(16채널)',
          'main_board_replacement': '메인보드교체',
          'multiple_stack': '복수굴뚝'
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
          profit: itemRevenue - itemCost - itemInstallation
        });
      }
    }

    // 6-1. 복수굴뚝 설치비 전용 추가 수량 반영 (매출에 영향 없음)
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
        profit: -extraInstallTotal
      });
    }

    // 7. 실사비용 계산 (실사일이 있는 경우에만 비용 추가)
    let baseSurveyCosts = 0;

    // 날짜 필드가 문자열 또는 Date 객체일 수 있으므로 안전하게 체크
    if (businessInfo.estimate_survey_date && String(businessInfo.estimate_survey_date).trim() !== '') {
      baseSurveyCosts += surveyCostMap.estimate || 0;
    }

    if (businessInfo.pre_construction_survey_date && String(businessInfo.pre_construction_survey_date).trim() !== '') {
      baseSurveyCosts += surveyCostMap.pre_construction || 0;
    }

    if (businessInfo.completion_survey_date && String(businessInfo.completion_survey_date).trim() !== '') {
      baseSurveyCosts += surveyCostMap.completion || 0;
    }

    // 실사비 조정 (기본 실사비 100,000원 기준 조정)
    const surveyFeeAdjustment = Math.round(Number(businessInfo.survey_fee_adjustment) || 0);

    const totalSurveyCosts = Math.round(baseSurveyCosts + totalAdjustments + surveyFeeAdjustment);

    console.log('💰 [REVENUE-API] 실사비용 계산:', {
      business_id,
      baseSurveyCosts,
      totalAdjustments,
      surveyFeeAdjustment,
      totalSurveyCosts
    });

    // 8. 추가공사비 및 협의사항 반영
    const additionalCost = Math.round(Number(businessInfo.additional_cost) || 0); // 추가공사비 (매출에 더하기)
    const negotiationDiscount = Math.round(businessInfo.negotiation ? parseFloat(businessInfo.negotiation) || 0 : 0); // 협의사항 (매출에서 빼기)

    // 8-0. 추가 계산서(invoice_records.extra) 공급가액 합계 조회 — 미수금 기준금액에 포함
    // supply_amount(부가세 제외) 사용 — adjustedRevenue는 부가세 제외 기준이며 마지막에 × 1.1 변환됨
    // total_amount(부가세 포함)를 사용하면 이중 부가세가 적용되어 미수금이 틀려짐
    let extraInvoiceTotal = 0;
    try {
      const extraResult = await pgQuery(
        `SELECT COALESCE(SUM(supply_amount), 0) AS total
         FROM invoice_records
         WHERE business_id = $1
           AND invoice_stage = 'extra'
           AND is_active = TRUE
           AND record_type != 'cancelled'`,
        [business_id]
      );
      extraInvoiceTotal = Math.round(Number(extraResult.rows?.[0]?.total) || 0);
    } catch {
      // invoice_records 테이블 없는 레거시 환경 → 0 유지
    }

    // 8-1. 매출비용 조정 합계 계산 (revenue_adjustments JSONB 배열)
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

    // 8-2. 매입비용 조정 합계 계산 (purchase_adjustments JSONB 배열)
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

    // 영업비용 계산 기준: 기본 매출 - 협의사항 (추가공사비 제외)
    const commissionBaseRevenue = totalRevenue - negotiationDiscount;

    // 최종 매출 = 기본 매출 + 추가공사비 - 협의사항 + 매출비용 조정 + 추가 계산서 합계
    const adjustedRevenue = totalRevenue + additionalCost - negotiationDiscount + revenueAdjustmentTotal + extraInvoiceTotal;

    // 최종 매입 = 기기별 매입 합계 + 매입비용 조정
    totalCost = Math.round(totalCost + purchaseAdjustmentTotal);

    const installationExtraCost = Number(businessInfo.installation_extra_cost) || 0;

    let salesCommission = 0;
    if (commissionSettings.commission_type === 'percentage') {
      salesCommission = commissionBaseRevenue * (commissionSettings.commission_percentage / 100);
    } else {
      salesCommission = totalEquipmentCount * (commissionSettings.commission_per_unit || 0);
    }

    // 9.1 영업비용 조정 값 조회 및 적용 - Direct PostgreSQL
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
      // 🔧 Number() 변환으로 문자열 연결 방지
      const adjustmentAmount = Number(operatingCostAdjustment.adjustment_amount) || 0;
      if (operatingCostAdjustment.adjustment_type === 'add') {
        adjustedSalesCommission = salesCommission + adjustmentAmount;
      } else {
        adjustedSalesCommission = salesCommission - adjustmentAmount;
      }
    }

    // 10. AS 비용 및 커스텀 추가비용 계산
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
          ? costs.reduce((sum, item) => sum + (Number(item.amount) || 0), 0)
          : 0;
      } catch (e) {
        console.warn('⚠️ [REVENUE-API] 커스텀 추가비용 파싱 오류:', e);
        customCostTotal = 0;
      }
    }

    // 11. 최종 계산 (조정된 매출 기준)
    // 순이익 = 매출 - 매입 - 추가설치비 - 조정된 영업비용 - 실사비용 - 설치비용 - AS비용 - 커스텀추가비용
    const grossProfit = Math.round(adjustedRevenue - totalCost);
    const netProfit = Math.round(
      grossProfit
      - installationExtraCost
      - adjustedSalesCommission
      - totalSurveyCosts
      - totalInstallationCosts
      - asCost
      - customCostTotal
    );

    console.log('📊 [REVENUE-API] 순이익 계산:', {
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
      netProfit
    });

    // 기본 매출 = equipment_breakdown의 total_revenue 합계 (장비 합계만)
    const baseRevenue = equipmentBreakdown.reduce((sum, item) => sum + item.total_revenue, 0);

    const result: RevenueCalculationResult = {
      business_id,
      business_name: businessInfo.business_name,
      sales_office: salesOffice,
      calculation_date: calcDate,
      base_revenue: baseRevenue, // 기본 매출 (기기 합계만, 조정 전)
      total_revenue: adjustedRevenue, // 최종 매출 (기본 + 추가공사비 - 협의사항 + 매출비용 조정)
      total_cost: totalCost,
      installation_extra_cost: installationExtraCost,  // 추가설치비
      gross_profit: grossProfit,
      sales_commission: salesCommission, // 기본 영업비용 (조정 전)
      survey_costs: totalSurveyCosts,
      installation_costs: totalInstallationCosts,
      as_cost: asCost,  // AS 비용
      custom_additional_costs: businessInfo.custom_additional_costs,  // 커스텀 추가비용
      net_profit: netProfit,
      equipment_breakdown: equipmentBreakdown,
      cost_breakdown: {
        sales_commission_type: commissionSettings.commission_type,
        sales_commission_rate: commissionSettings.commission_type === 'percentage'
          ? commissionSettings.commission_percentage
          : commissionSettings.commission_per_unit,
        sales_commission_amount: salesCommission,
        survey_costs: {
          estimate: surveyCostMap.estimate,
          pre_construction: surveyCostMap.pre_construction,
          completion: surveyCostMap.completion,
          adjustments: totalAdjustments,
          total: totalSurveyCosts
        },
        total_installation_costs: totalInstallationCosts
      },
      // 영업비용 조정 정보 (신규)
      operating_cost_adjustment: operatingCostAdjustment || null,
      adjusted_sales_commission: hasAdjustment ? adjustedSalesCommission : null,
      // 실사비 조정 정보
      survey_fee_adjustment: surveyFeeAdjustment,
      adjusted_survey_costs: totalSurveyCosts
    };

    let savedCalculation = null;

    if (save_result) {
      if (permissionLevel < 3) {
        console.warn(`DB 저장 권한 부족 (권한 ${permissionLevel}, 필요: 3 이상)`);
      } else {
        // 가격 정보 스냅샷 생성 (계산 시점의 가격 정보 보존)
      const pricingSnapshot = {
        manufacturer,
        official_prices: officialPriceMap,
        manufacturer_costs: manufacturerCostMap,
        installation_costs: installationCostMap,
        additional_costs: additionalCostMap,
        calculation_date: calcDate
      };

      // UPSERT: 같은 business_id + calculation_date 조합이 있으면 UPDATE, 없으면 INSERT - Direct PostgreSQL
      try {
        const saved = await queryOne(
          `INSERT INTO revenue_calculations (
            business_id, business_name, calculation_date, total_revenue, total_cost,
            gross_profit, sales_commission, adjusted_sales_commission, survey_costs,
            installation_costs, net_profit, equipment_breakdown, cost_breakdown,
            pricing_version_snapshot, sales_office, business_category, calculated_by, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
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
            net_profit = $11,
            equipment_breakdown = $12,
            cost_breakdown = $13,
            pricing_version_snapshot = $14,
            sales_office = $15,
            business_category = $16,
            calculated_by = $17,
            updated_at = $18
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
            totalInstallationCosts + installationExtraCost,
            netProfit,
            JSON.stringify(equipmentBreakdown),
            JSON.stringify(result.cost_breakdown),
            JSON.stringify(pricingSnapshot),
            salesOffice,
            businessInfo.category || null,
            userId,
            new Date().toISOString()
          ]
        );

        savedCalculation = saved;
      } catch (saveError) {
        console.error('매출 계산 저장 오류:', saveError);
      }
      }
    }

    console.log('🎯 [REVENUE-API] 응답 데이터 생성:', {
      business_id,
      business_name: businessInfo.business_name,
      result_survey_costs: result.survey_costs,
      result_net_profit: result.net_profit,
      saved_survey_costs: savedCalculation?.survey_costs,
      saved_net_profit: savedCalculation?.net_profit
    });

    return NextResponse.json({
      success: true,
      data: {
        calculation: result,
        saved_record: savedCalculation,
        summary: {
          equipment_count: totalEquipmentCount,
          profit_margin: totalRevenue > 0 ? ((grossProfit / totalRevenue) * 100).toFixed(2) + '%' : '0%',
          net_margin: totalRevenue > 0 ? ((netProfit / totalRevenue) * 100).toFixed(2) + '%' : '0%'
        }
      },
      message: '매출 계산이 완료되었습니다.'
    });

  } catch (error) {
    console.error('매출 계산 API 오류:', error);
    return NextResponse.json({
      success: false,
      message: '서버 오류가 발생했습니다.'
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    // JWT 토큰 검증 (헤더 또는 쿠키)
    const authHeader = request.headers.get('authorization');
    let token: string | null = null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else {
      // 쿠키에서 토큰 확인
      const cookieToken = request.cookies.get('auth_token')?.value;
      if (cookieToken) {
        token = cookieToken;
      }
    }

    if (!token) {
      return NextResponse.json({
        success: false,
        message: '인증이 필요합니다.'
      }, { status: 401 });
    }

    const decoded = verifyTokenString(token);

    if (!decoded) {
      return NextResponse.json({
        success: false,
        message: '유효하지 않은 토큰입니다.'
      }, { status: 401 });
    }

    const userId = decoded.userId || decoded.id;
    if (!userId) {
      return NextResponse.json({
        success: false,
        message: '토큰에 사용자 정보가 없습니다.'
      }, { status: 401 });
    }

    let permissionLevel = decoded.permissionLevel || decoded.permission_level;

    if (!permissionLevel) {
      // Direct PostgreSQL query
      const user = await queryOne(
        'SELECT id, permission_level FROM employees WHERE id = $1 AND is_active = $2 LIMIT 1',
        [userId, true]
      );

      if (!user) {
        console.error('사용자 조회 실패');
        return NextResponse.json({
          success: false,
          message: '사용자를 찾을 수 없습니다.'
        }, { status: 401 });
      }

      permissionLevel = user.permission_level;
    }

    // 권한 1 이상 확인
    if (!permissionLevel || permissionLevel < 1) {
      return NextResponse.json({
        success: false,
        message: '매출 조회 권한이 필요합니다.'
      }, { status: 403 });
    }

    // URL 파라미터 처리
    const url = new URL(request.url);
    const businessId = url.searchParams.get('business_id');
    const salesOffice = url.searchParams.get('sales_office');
    const startDate = url.searchParams.get('start_date');
    const endDate = url.searchParams.get('end_date');
    const limit = parseInt(url.searchParams.get('limit') || '10000'); // 기본값 10000으로 증가
    const offset = parseInt(url.searchParams.get('offset') || '0');

    // Direct PostgreSQL query with dynamic WHERE clause
    const whereClauses: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (businessId) {
      whereClauses.push(`business_id = $${paramIndex}`);
      params.push(businessId);
      paramIndex++;
    }

    if (salesOffice) {
      whereClauses.push(`sales_office = $${paramIndex}`);
      params.push(salesOffice);
      paramIndex++;
    }

    if (startDate) {
      whereClauses.push(`calculation_date >= $${paramIndex}`);
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      whereClauses.push(`calculation_date <= $${paramIndex}`);
      params.push(endDate);
      paramIndex++;
    }

    const whereClause = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';

    const allCalculations = await queryAll(
      `SELECT * FROM revenue_calculations
       ${whereClause}
       ORDER BY calculation_date DESC`,
      params
    );

    if (!allCalculations) {
      console.error('매출 계산 조회 오류');
      return NextResponse.json({
        success: false,
        message: '계산 결과 조회에 실패했습니다.'
      }, { status: 500 });
    }

    console.log('📊 [REVENUE-API] 조회 완료:', {
      총_레코드: allCalculations.length
    });

    // 사업장별 최신 레코드만 필터링 (중복 제거)
    const latestCalculationsMap = new Map();

    allCalculations?.forEach(calc => {
      const existing = latestCalculationsMap.get(calc.business_id);

      // 최신 레코드 판단: calculation_date DESC, created_at DESC
      if (!existing ||
          calc.calculation_date > existing.calculation_date ||
          (calc.calculation_date === existing.calculation_date && calc.created_at > existing.created_at)) {
        latestCalculationsMap.set(calc.business_id, calc);
      }
    });

    const calculations = Array.from(latestCalculationsMap.values());

    // 디버깅 로그
    console.log('📊 [REVENUE-API] 중복 제거 결과:', {
      전체_레코드: allCalculations?.length || 0,
      중복_제거_후: calculations.length,
      제거된_레코드: (allCalculations?.length || 0) - calculations.length
    });

    const totalRevenue = calculations?.reduce((sum, calc) => sum + (calc.total_revenue || 0), 0) || 0;
    const totalProfit = calculations?.reduce((sum, calc) => sum + (calc.net_profit || 0), 0) || 0;

    console.log('💰 [REVENUE-API] 매출 합계:', {
      총_매출: totalRevenue.toLocaleString(),
      총_이익: totalProfit.toLocaleString()
    });

    return NextResponse.json({
      success: true,
      data: {
        calculations: calculations || [],
        pagination: {
          total_count: calculations?.length || 0,
          offset,
          limit,
          has_more: (calculations?.length || 0) === limit
        },
        summary: {
          total_revenue: totalRevenue,
          total_profit: totalProfit,
          average_profit_margin: totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(2) + '%' : '0%'
        }
      }
    });

  } catch (error) {
    console.error('매출 계산 GET 오류:', error);
    return NextResponse.json({
      success: false,
      message: '서버 오류가 발생했습니다.'
    }, { status: 500 });
  }
}// Force reload
