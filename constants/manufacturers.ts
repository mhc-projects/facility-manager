// 제조사 영어-한글 매핑 테이블
export const MANUFACTURER_NAMES = {
  ecosense: '에코센스',
  cleanearth: '크린어스',
  gaia_cns: '가이아씨앤에스',
  evs: '이브이에스'
} as const;

// 제조사 한글-영어 역매핑 테이블
export const MANUFACTURER_NAMES_REVERSE = {
  '에코센스': 'ecosense',
  '크린어스': 'cleanearth',
  '가이아씨앤에스': 'gaia_cns',
  '이브이에스': 'evs'
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
