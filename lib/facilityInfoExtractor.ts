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
 * 파일명에서 시설 정보 추출
 * 파일명 형식: discharge1_2.5MB_001_250109.webp 또는 prevention2_250㎥_002_250109.webp
 */
export function extractFacilityInfoFromFileName(fileName: string, filePath: string): FacilityInfo {
  console.log('[FACILITY-EXTRACTOR] 입력:', { fileName, filePath });

  // 파일명에서 확장자 제거
  const nameWithoutExt = fileName.replace(/\.(webp|jpg|jpeg|png)$/i, '');
  console.log('[FACILITY-EXTRACTOR] 확장자 제거:', nameWithoutExt);

  // 배출시설인지 방지시설인지 판별
  const isDischarge = filePath.includes('/discharge/');
  const isPrevention = filePath.includes('/prevention/');

  // 파일명 패턴: {facilityType}{number}_{capacity}_{photoIndex}_{timestamp}
  // 예: discharge1_2.5MB_001_250109
  const match = nameWithoutExt.match(/^(discharge|prevention)(\d+)_([^_]+)_\d+_\d+$/);
  console.log('[FACILITY-EXTRACTOR] 정규식 매칭 결과:', match);

  if (match) {
    const facilityType = match[1]; // 'discharge' or 'prevention'
    const facilityNumber = match[2]; // '1', '2', etc.
    const capacity = match[3]; // '2.5MB', '250㎥', etc.

    // 시설 타입을 한글로 변환
    const typePrefix = facilityType === 'discharge' ? '배' : '방';

    // 용량 단위 파싱
    let capacityValue = capacity;
    let capacityUnit = '';

    // MB 단위 제거 (파일명 생성 시 추가된 것)
    if (capacity.endsWith('MB')) {
      capacityValue = capacity.replace('MB', '');
      capacityUnit = 'MB';
    } else {
      // 한글 단위 추출 (㎥/분, ㎥, 등)
      const unitMatch = capacity.match(/([0-9.]+)(.+)/);
      if (unitMatch) {
        capacityValue = unitMatch[1];
        capacityUnit = unitMatch[2];
      }
    }

    return {
      facilityNumber: `${typePrefix}${facilityNumber}`,
      facilityName: '', // 파일명에서는 시설명을 알 수 없음
      capacity: capacityValue,
      capacityUnit: capacityUnit,
      additionalInfo: undefined
    };
  }

  // 폴더명에서 추출 시도 (기존 로직)
  console.log('[FACILITY-EXTRACTOR] 파일명 매칭 실패, 폴더명에서 추출 시도');
  const result = extractFacilityInfoFromFolder(filePath);
  console.log('[FACILITY-EXTRACTOR] 폴더명에서 추출한 결과:', result);
  return result;
}

/**
 * 폴더명에서 시설 정보 추출 (기존 로직 유지)
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
 * 예: "<방1>여과집진시설 450㎥/분_송풍" 또는 "<배1> 2.5MB"
 */
export function generateCaption(info: FacilityInfo): string {
  // 시설번호만 있는 경우 (파일명에서 추출한 경우)
  if (!info.facilityName) {
    let caption = `<${info.facilityNumber}>`;

    if (info.capacity && info.capacityUnit) {
      caption += ` ${info.capacity}${info.capacityUnit}`;
    }

    return caption;
  }

  // 시설번호 + 시설명이 있는 경우 (기존 로직)
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
