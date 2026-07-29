// 전류계(배출/송풍/펌프) 정격전류 스펙(100A/400A)별 매입원가 계산 헬퍼
//
// 설계: business_info의 discharge_current_meter 등은 "총 수량" 의미를 그대로 유지하고,
// 그 중 400A 대수만 discharge_current_meter_400a 등 별도 컬럼에 저장한다.
// 100A 수량은 (총수량 - 400a)로 파생하며, 0 <= 400a <= 총수량 불변식은 이 파일에서 클램프로 보장한다.
//
// manufacturer_pricing에 스펙별 행(discharge_current_meter_100a 등)이 없는 제조사는
// 레거시 행(discharge_current_meter)으로 자동 폴백되어 기존 계산과 동일하게 동작한다.

export const SPEC_SPLIT_FIELDS = [
  'discharge_current_meter',
  'fan_current_meter',
  'pump_current_meter',
] as const;

export type SpecSplitField = typeof SPEC_SPLIT_FIELDS[number];

export function isSpecSplitField(field: string): field is SpecSplitField {
  return (SPEC_SPLIT_FIELDS as readonly string[]).includes(field);
}

export function spec400Column(field: SpecSplitField): string {
  return `${field}_400a`;
}

export function specCostKey100(field: SpecSplitField): string {
  return `${field}_100a`;
}

export function specCostKey400(field: SpecSplitField): string {
  return `${field}_400a`;
}

/** equipment_type -> 단가를 조회하는 함수. 5곳의 서로 다른 원가 자료구조를 하나로 흡수하기 위한 어댑터. */
export type CostLookup = (equipmentType: string) => number | undefined;

/** Record<equipment_type, { cost_price }> 형태의 원가 맵을 CostLookup으로 변환 */
export function costLookupFromRows(
  map: Record<string, { cost_price?: unknown } | undefined> | null | undefined
): CostLookup {
  return (equipmentType: string) => {
    const row = map?.[equipmentType];
    if (!row) return undefined;
    const n = Number(row.cost_price);
    return Number.isFinite(n) ? n : undefined;
  };
}

/** Record<equipment_type, number> 형태의 원가 맵을 CostLookup으로 변환 */
export function costLookupFromNumbers(
  map: Record<string, number | undefined> | null | undefined
): CostLookup {
  return (equipmentType: string) => {
    const v = map?.[equipmentType];
    return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
  };
}

/** 여러 CostLookup을 순서대로 시도해 첫 유효값을 반환 (다단 폴백 합성) */
export function chainCostLookups(...lookups: CostLookup[]): CostLookup {
  return (equipmentType: string) => {
    for (const lookup of lookups) {
      const v = lookup(equipmentType);
      if (v !== undefined) return v;
    }
    return undefined;
  };
}

export interface EquipmentCost {
  /** 정확한 매입원가 합계 (합산에 사용) */
  totalCost: number;
  /** 수량 대비 가중평균 단가 (표시 전용) */
  unitCost: number;
  /** 스펙 분기 필드일 때만 존재 */
  qty100?: number;
  qty400?: number;
  unitCost100?: number;
  unitCost400?: number;
  /** 스펙 분기가 있을 때만 존재 (예: '100A 3 × 28,000 + 400A 2 × 32,000') */
  specNote?: string;
}

/**
 * 모든 매입원가 곱셈 지점의 단일 진입점.
 * 스펙 분기가 없는 필드는 기존과 100% 동일하게 동작한다(단가 * 수량).
 */
export function resolveEquipmentCost(
  field: string,
  quantity: number,
  business: Record<string, any>,
  lookup: CostLookup
): EquipmentCost {
  const total = Math.max(0, Number(quantity) || 0);

  if (!isSpecSplitField(field)) {
    const unit = lookup(field) ?? 0;
    return { totalCost: unit * total, unitCost: unit };
  }

  const raw400 = Math.max(0, Number(business?.[spec400Column(field)]) || 0);
  const qty400 = Math.min(raw400, total); // 불변식 클램프: 400a가 총수량을 넘지 않도록
  const qty100 = total - qty400;

  // 스펙별 원가가 없으면 레거시 키로 폴백 -> 스펙 미분리 제조사는 기존 동작과 동일
  const unitCost100 = lookup(specCostKey100(field)) ?? lookup(field) ?? 0;
  const unitCost400 = lookup(specCostKey400(field)) ?? unitCost100;

  const totalCost = qty100 * unitCost100 + qty400 * unitCost400;

  return {
    totalCost,
    unitCost: total > 0 ? totalCost / total : 0,
    qty100,
    qty400,
    unitCost100,
    unitCost400,
    specNote:
      qty400 > 0
        ? `100A ${qty100} × ${unitCost100.toLocaleString()} + 400A ${qty400} × ${unitCost400.toLocaleString()}`
        : undefined,
  };
}
