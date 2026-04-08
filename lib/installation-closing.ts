/**
 * 설치비 예측마감/본마감 공통 유틸리티
 */
import { queryAll, queryOne } from '@/lib/supabase-direct';

const EQUIPMENT_FIELDS = [
  'ph_meter', 'differential_pressure_meter', 'temperature_meter',
  'discharge_current_meter', 'fan_current_meter', 'pump_current_meter',
  'gateway_1_2', 'gateway_3_4', 'vpn_wired', 'vpn_wireless',
  'explosion_proof_differential_pressure_meter_domestic',
  'explosion_proof_temperature_meter_domestic',
  'expansion_device', 'relay_8ch', 'relay_16ch',
  'main_board_replacement', 'multiple_stack'
];

interface InstallCostBreakdown {
  base_installation_cost: number;
  additional_construction_cost: number;
  extra_installation_cost: number;
  total: number;
  equipment_breakdown: Record<string, { qty: number; unit_price: number }>;
}

interface DiffDetail {
  category: string;
  label: string;
  forecast_amount: number;
  final_amount: number;
  diff: number;
}

export interface FinalClosingResult {
  business_id: string;
  forecast_total: number;
  final_total: number;
  diff_total: number;
  diff_details: DiffDetail[];
  final_breakdown: InstallCostBreakdown;
}

/**
 * 사업장의 현재 설치비를 계산
 */
export async function calculateInstallCosts(businessId: string): Promise<InstallCostBreakdown> {
  const installationCosts = await queryAll(
    `SELECT equipment_type, base_installation_cost FROM equipment_installation_cost WHERE is_active = true`
  );
  const installCostMap: Record<string, number> = {};
  installationCosts.forEach((row: any) => {
    installCostMap[row.equipment_type] = Number(row.base_installation_cost) || 0;
  });

  const equipmentFields = EQUIPMENT_FIELDS.map(f => `${f}`).join(', ');
  const biz = await queryOne(
    `SELECT ${equipmentFields}, multiple_stack_install_extra, additional_cost, installation_extra_cost
     FROM business_info WHERE id = $1`,
    [businessId]
  );

  if (!biz) throw new Error(`사업장을 찾을 수 없습니다: ${businessId}`);

  let baseInstallCost = 0;
  const equipmentBreakdown: Record<string, { qty: number; unit_price: number }> = {};

  EQUIPMENT_FIELDS.forEach(field => {
    const qty = Number(biz[field]) || 0;
    if (qty > 0) {
      const unitPrice = installCostMap[field] || 0;
      baseInstallCost += unitPrice * qty;
      equipmentBreakdown[field] = { qty, unit_price: unitPrice };
    }
  });

  const multiExtra = Number(biz.multiple_stack_install_extra) || 0;
  if (multiExtra > 0) {
    const unitPrice = installCostMap['multiple_stack'] || 0;
    baseInstallCost += unitPrice * multiExtra;
    equipmentBreakdown['multiple_stack_extra'] = { qty: multiExtra, unit_price: unitPrice };
  }

  const extraInstallCost = Number(biz.installation_extra_cost) || 0;

  return {
    base_installation_cost: baseInstallCost,
    additional_construction_cost: 0,
    extra_installation_cost: extraInstallCost,
    total: baseInstallCost + extraInstallCost,
    equipment_breakdown: equipmentBreakdown,
  };
}

/**
 * 예측마감 지급 기록과 현재 확정액을 비교하여 차액 계산
 */
export async function calculateFinalDiff(businessId: string): Promise<FinalClosingResult> {
  // 1. 예측마감 지급 기록 조회
  const forecastPayments = await queryAll(`
    SELECT payment_category, actual_amount, calculated_amount, snapshot_data
    FROM installation_payments
    WHERE business_id = $1 AND payment_type = 'forecast' AND status = 'paid'
    ORDER BY payment_category
  `, [businessId]);

  // 예측 지급 총액 (항목별)
  const forecastMap: Record<string, number> = {
    base_installation: 0,
    additional_construction: 0,
    extra_installation: 0,
  };
  forecastPayments.forEach((p: any) => {
    forecastMap[p.payment_category] = (forecastMap[p.payment_category] || 0) + Number(p.actual_amount);
  });
  const forecastTotal = Object.values(forecastMap).reduce((a, b) => a + b, 0);

  // 2. 현재 확정 금액 계산
  const finalBreakdown = await calculateInstallCosts(businessId);

  // 3. 항목별 차액 계산
  const diffDetails: DiffDetail[] = [
    {
      category: 'base_installation',
      label: '기본설치비',
      forecast_amount: forecastMap.base_installation,
      final_amount: finalBreakdown.base_installation_cost,
      diff: finalBreakdown.base_installation_cost - forecastMap.base_installation,
    },
    {
      category: 'additional_construction',
      label: '추가공사비',
      forecast_amount: forecastMap.additional_construction,
      final_amount: finalBreakdown.additional_construction_cost,
      diff: finalBreakdown.additional_construction_cost - forecastMap.additional_construction,
    },
    {
      category: 'extra_installation',
      label: '추가설치비',
      forecast_amount: forecastMap.extra_installation,
      final_amount: finalBreakdown.extra_installation_cost,
      diff: finalBreakdown.extra_installation_cost - forecastMap.extra_installation,
    },
  ];

  return {
    business_id: businessId,
    forecast_total: forecastTotal,
    final_total: finalBreakdown.total,
    diff_total: finalBreakdown.total - forecastTotal,
    diff_details: diffDetails,
    final_breakdown: finalBreakdown,
  };
}

/**
 * 다음 달 payment_month 문자열 반환
 */
export function getNextMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m, 1); // m is already 1-based, so m = next month
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`;
}

/**
 * 날짜에서 YYYY-MM 추출
 */
export function dateToMonth(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`;
}
