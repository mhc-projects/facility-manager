// 대리점 판매가(dealer_pricing) 매칭 로직 — 서버/클라이언트 공통 순수 함수만 포함 (DB 접근 없음)
//
// dealer_pricing.equipment_type은 government_pricing/manufacturer_pricing과 달리
// 대분류(sensor/meter/network/device/maintenance)라서 장비 필드 매칭에 쓸 수 없다.
// 대신 equipment_name(한글명)으로 매칭한다 — government_pricing과 동일한 한글명 체계를 쓰기 때문.
// 게이트웨이는 대리점가에서 1,2/3,4 구분이 없어 gateway_1_2/gateway_3_4가 동일 항목을 공유한다.

export interface DealerPricingRow {
  equipment_name: string;
  manufacturer: string | null;
  dealer_selling_price: number | string;
}

export const DEALER_EQUIPMENT_NAME_MAP: Record<string, string> = {
  ph_meter: 'PH센서',
  differential_pressure_meter: '차압계',
  temperature_meter: '온도계',
  discharge_current_meter: '배출전류계',
  fan_current_meter: '송풍전류계',
  pump_current_meter: '펌프전류계',
  gateway: '게이트웨이',
  gateway_1_2: '게이트웨이',
  gateway_3_4: '게이트웨이',
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

/** 사업장의 진행구분(progress_status)이 대리점인지 판별 */
export function isDealerBusiness(progressStatus: string | null | undefined): boolean {
  return String(progressStatus || '').trim() === '대리점';
}

/** dealer_pricing 행 목록을 equipment_name 기준으로 그룹핑 */
export function groupDealerPricingByName(
  rows: DealerPricingRow[]
): Record<string, DealerPricingRow[]> {
  const map: Record<string, DealerPricingRow[]> = {};
  for (const row of rows) {
    const name = row.equipment_name;
    if (!name) continue;
    if (!map[name]) map[name] = [];
    map[name].push(row);
  }
  return map;
}

/**
 * 제조사명이 비어있으면 기본값(에코센스)으로 정규화한다.
 * business_info.manufacturer/dealer_pricing.manufacturer는 한글명으로 저장되므로
 * lib/services/revenue-calculator.ts의 기본값 규칙과 동일하게 맞춘다.
 */
function normalizeManufacturer(manufacturer: string | null | undefined): string {
  const trimmed = (manufacturer || '').trim();
  return trimmed !== '' ? trimmed : '에코센스';
}

/**
 * 장비 필드 하나의 대리점 판매가를 조회한다.
 * 제조사가 일치하는 항목을 우선하고, 없으면 첫 번째 항목을 사용한다.
 * 매칭되는 대리점가가 없으면 null (호출부에서 기존 단가로 폴백해야 함).
 */
export function resolveDealerUnitPrice(
  field: string,
  manufacturer: string | null | undefined,
  dealerPricingByName: Record<string, DealerPricingRow[]>
): number | null {
  const dealerName = DEALER_EQUIPMENT_NAME_MAP[field];
  if (!dealerName) return null;
  const candidates = dealerPricingByName[dealerName];
  if (!candidates || candidates.length === 0) return null;
  const normalized = normalizeManufacturer(manufacturer);
  const match = candidates.find(r => r.manufacturer === normalized) || candidates[0];
  return Number(match.dealer_selling_price) || 0;
}

/**
 * 대리점 사업장이면 장비 필드별 매출단가 맵(officialPrices)의 값을 대리점 판매가로 치환한다.
 * 대리점 판매가가 없는 항목은 기존 officialPrices 값을 그대로 유지한다(폴백).
 * 대리점이 아니면 officialPrices를 그대로 반환한다.
 */
export function resolveEquipmentUnitPrices(
  progressStatus: string | null | undefined,
  manufacturer: string | null | undefined,
  officialPrices: Record<string, number>,
  dealerPricingByName: Record<string, DealerPricingRow[]>
): Record<string, number> {
  if (!isDealerBusiness(progressStatus)) return officialPrices;

  const resolved: Record<string, number> = { ...officialPrices };
  for (const field of Object.keys(DEALER_EQUIPMENT_NAME_MAP)) {
    const price = resolveDealerUnitPrice(field, manufacturer, dealerPricingByName);
    if (price !== null) resolved[field] = price;
  }
  return resolved;
}
