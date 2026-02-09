/**
 * 시설 정보 캡션 생성 유틸리티
 */

export interface FacilityInfo {
  facilityNumber: string;    // "방1", "배1" 등
  facilityName: string;      // "여과집진시설"
  capacity?: string;         // "450"
  capacityUnit?: string;     // "㎥/분"
  additionalInfo?: string;   // "송풍"
}

/**
 * 폴더명에서 시설번호 추출
 * 예: "방지시설/<방1>여과집진시설/" → "<방1>"
 */
export function extractFacilityNumber(folderName: string): string {
  const match = folderName.match(/<(.+?)>/);
  return match ? `<${match[1]}>` : '';
}

/**
 * 폴더명에서 시설명 추출
 * 예: "방지시설/<방1>여과집진시설/" → "여과집진시설"
 */
export function extractFacilityName(folderName: string): string {
  // <시설번호> 다음의 텍스트 추출
  const afterNumber = folderName.match(/<.+?>(.+?)(?:\/|$)/);
  return afterNumber ? afterNumber[1].trim() : '';
}

/**
 * 폴더명에서 시설 정보 추출
 */
export function extractFacilityInfoFromFolder(folderName: string): FacilityInfo {
  const numberMatch = folderName.match(/<(.+?)>/);
  const nameMatch = folderName.match(/<.+?>(.+?)(?:\/|$)/);

  return {
    facilityNumber: numberMatch ? numberMatch[1] : '',
    facilityName: nameMatch ? nameMatch[1].trim() : '',
    capacity: undefined,
    capacityUnit: undefined,
    additionalInfo: undefined
  };
}

/**
 * 시설 정보로 캡션 생성
 * 예: "<방1>여과집진시설 450㎥/분_송풍"
 */
export function generateCaption(info: FacilityInfo): string {
  let caption = `<${info.facilityNumber}>${info.facilityName}`;

  if (info.capacity && info.capacityUnit) {
    caption += ` ${info.capacity}${info.capacityUnit}`;
  }

  if (info.additionalInfo) {
    caption += `_${info.additionalInfo}`;
  }

  return caption;
}

/**
 * 게이트웨이/기본사진 판별
 */
export function isGatewayOrBasicPhoto(folderName: string): boolean {
  return folderName.includes('기본사진/gateway') || folderName.includes('기본사진');
}

/**
 * 게이트웨이 캡션 생성
 */
export function generateGatewayCaption(): string {
  return '<게이트웨이>설치위치';
}
