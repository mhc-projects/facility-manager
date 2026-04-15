// 제조사 영어-한글 매핑 테이블
export const MANUFACTURER_NAMES = {
  ecosense: '에코센스',
  cleanearth: '크린어스',
  gaia_cns: '가이아씨앤에스',
  evs: '이브이에스',
  weblesse: '위블레스'
} as const;

// 제조사 한글-영어 역매핑 테이블
export const MANUFACTURER_NAMES_REVERSE = {
  '에코센스': 'ecosense',
  '크린어스': 'cleanearth',
  '가이아씨앤에스': 'gaia_cns',
  '이브이에스': 'evs',
  '위블레스': 'weblesse'
} as const;

export type ManufacturerCode = keyof typeof MANUFACTURER_NAMES;
export type ManufacturerName = typeof MANUFACTURER_NAMES[ManufacturerCode];

// 영어 코드 → 한글 이름 변환 (한글 이름이 입력되면 그대로 반환)
export function getManufacturerName(code: ManufacturerCode | ManufacturerName | string): ManufacturerName | string {
  // 이미 한글 이름인 경우 그대로 반환
  if (code in MANUFACTURER_NAMES_REVERSE) {
    return code;
  }
  // 영어 코드인 경우 한글로 변환
  if (code in MANUFACTURER_NAMES) {
    return MANUFACTURER_NAMES[code as ManufacturerCode];
  }
  // 알 수 없는 값은 그대로 반환
  return code || '';
}

// 한글 이름 → 영어 코드 변환 (영어 코드가 입력되면 그대로 반환)
export function getManufacturerCode(name: ManufacturerName | ManufacturerCode | string): ManufacturerCode | string {
  // 이미 영어 코드인 경우 그대로 반환
  if (name in MANUFACTURER_NAMES) {
    return name;
  }
  // 한글 이름인 경우 영어로 변환
  if (name in MANUFACTURER_NAMES_REVERSE) {
    return MANUFACTURER_NAMES_REVERSE[name as ManufacturerName];
  }
  // 알 수 없는 값은 그대로 반환
  return name || '';
}

/**
 * 제조사 식별자의 모든 별칭(영문코드 + 한글명)을 반환합니다.
 * 코스트 맵 생성 시 양쪽 키로 등록하여 영문/한글 불일치 문제를 해결합니다.
 *
 * 예) '에코센스' → ['에코센스', 'ecosense']
 *     'ecosense' → ['ecosense', '에코센스']
 *     '위블레스' → ['위블레스', 'weblesse']
 *     '알수없음'  → ['알수없음']
 */
export function getManufacturerAliases(value: string): string[] {
  if (!value) return [];
  const aliases = new Set<string>([value]);
  // 영문코드 → 한글명
  const korean = MANUFACTURER_NAMES[value as ManufacturerCode];
  if (korean) aliases.add(korean);
  // 한글명 → 영문코드
  const code = MANUFACTURER_NAMES_REVERSE[value as ManufacturerName];
  if (code) aliases.add(code);
  return Array.from(aliases);
}
