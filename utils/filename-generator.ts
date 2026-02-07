// utils/filename-generator.ts - 시설별 파일명 생성 유틸리티

import { Facility } from '@/types';

/**
 * 시설별 파일명 생성 규칙 (개선된 형식)
 * 구조: {시설명}{용량}_{순번}_{yymmdd}.webp
 * 
 * 예시:
 * - 배출시설1호2.5MB_001_250109.webp
 * - 방지시설2호250㎥_002_250109.webp
 */

interface FileNameParams {
  facility: Facility;
  facilityType: 'discharge' | 'prevention';
  facilityIndex: number; // 해당 시설 타입 내에서의 순번 (1, 2, 3...)
  facilityInstanceNumber?: number; // 시설 수량 기반 인스턴스 번호 (1, 2, 3...)
  photoIndex: number; // 사진 순서 (1, 2, 3...)
  originalFileName?: string;
}

/**
 * 간략한 타임스탬프 생성 (yymmdd 형식)
 */
function generateTimestamp(): string {
  const now = new Date();
  const year = now.getFullYear().toString().slice(-2); // 24, 25
  const month = (now.getMonth() + 1).toString().padStart(2, '0'); // 01-12
  const day = now.getDate().toString().padStart(2, '0'); // 01-31
  return `${year}${month}${day}`;
}

/**
 * 파일 확장자 추출
 */
function getFileExtension(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  return ext === 'jpg' || ext === 'jpeg' || ext === 'png' ? 'webp' : (ext || 'webp');
}

/**
 * 시설명과 용량을 파일명 호환 형태로 변환 (ASCII 전용)
 */
function createFacilityDisplayName(facilityType: 'discharge' | 'prevention', facilityNumber: number, capacity: string): string {
  // 시설 타입을 영어로 표시 (Supabase Storage 호환)
  const typeMap = {
    'discharge': 'discharge',
    'prevention': 'prevention'
  };

  // 용량 정보에서 한글과 특수문자 제거, ASCII만 유지
  let cleanCapacity = capacity
    .replace(/\s+/g, '') // 공백 제거
    .replace(/[^a-zA-Z0-9]/g, '') // 한글, 특수문자 제거
    .trim();

  // 용량 단위를 영어로 통일
  if (!cleanCapacity.match(/\d/)) {
    cleanCapacity = ''; // 숫자가 없으면 용량 정보 제거
  } else {
    cleanCapacity += 'MB'; // MB 단위 추가
  }

  return `${typeMap[facilityType]}${facilityNumber}${cleanCapacity ? '_' + cleanCapacity : ''}`;
}

/**
 * 시설별 구조화된 파일명 생성 (개선된 형식)
 * 구조: {시설명용량}_{순번}_{yymmdd}.webp
 * 
 * @param params 파일명 생성에 필요한 파라미터
 * @returns 구조화된 파일명
 */
export function generateFacilityFileName(params: FileNameParams): string {
  const {
    facility,
    facilityType,
    facilityIndex,
    facilityInstanceNumber = 1,
    photoIndex,
    originalFileName = 'photo.jpg'
  } = params;

  // 1. 시설명과 용량 조합 (한글 표시)
  const facilityDisplayName = createFacilityDisplayName(
    facilityType, 
    facility.number, 
    facility.capacity
  );

  // 2. 사진 순번 (3자리 0 패딩)
  const photoSequence = photoIndex.toString().padStart(3, '0');

  // 3. 타임스탬프 (yymmdd)
  const timestamp = generateTimestamp();

  // 4. 확장자 (webp로 통일)
  const extension = getFileExtension(originalFileName);

  // 5. 최종 파일명 조합
  const fileName = `${facilityDisplayName}_${photoSequence}_${timestamp}.${extension}`;

  console.log('📝 [FILENAME-GENERATOR] 파일명 생성:', {
    입력: params,
    생성된파일명: fileName,
    구조분석: {
      시설표시명: facilityDisplayName,
      사진순번: photoSequence,
      타임스탬프: timestamp,
      확장자: extension
    }
  });

  return fileName;
}

/**
 * 기본사진용 파일명 생성 (개선된 형식)
 * 구조: {카테고리명}_{순번}_{yymmdd}.webp
 * 송풍팬 + 배출구별: 송풍팬-배{N}-{순번}.jpg 🆕
 */
export function generateBasicFileName(
  category: string,
  photoIndex: number,
  originalFileName: string = 'photo.jpg',
  outletNumber?: number  // 🆕 배출구 번호 (송풍팬 전용)
): string {
  const timestamp = generateTimestamp();
  const extension = getFileExtension(originalFileName);

  // 사진 순번 (3자리 0 패딩)
  const photoSequence = photoIndex.toString().padStart(3, '0');

  // 🆕 송풍팬 + 배출구별 파일명 생성
  if (category === 'fan' && outletNumber !== undefined) {
    // 한글 파일명: 송풍팬-배{N}-{순번}.jpg
    const fileName = `송풍팬-배${outletNumber}-${photoSequence}.jpg`;

    console.log('📝 [FAN-OUTLET-FILENAME-GENERATOR] 배출구별 송풍팬 파일명 생성:', {
      카테고리: category,
      배출구번호: outletNumber,
      사진순번: photoSequence,
      생성된파일명: fileName
    });

    return fileName;
  }

  // 카테고리명 매핑 (ASCII 호환)
  const categoryMap: { [key: string]: string } = {
    'gateway': 'gateway',
    'fan': 'fan',
    'electrical': 'electrical',
    'others': 'others'
  };

  const categoryName = categoryMap[category] || category;
  const fileName = `${categoryName}_${photoSequence}_${timestamp}.${extension}`;

  console.log('📝 [BASIC-FILENAME-GENERATOR] 기본사진 파일명 생성:', {
    카테고리: category,
    카테고리명: categoryName,
    사진순번: photoSequence,
    생성된파일명: fileName
  });

  return fileName;
}

/**
 * 시설 목록에서 특정 시설 타입의 순번 계산
 */
export function calculateFacilityIndex(
  facilities: Facility[], 
  targetFacility: Facility, 
  facilityType: 'discharge' | 'prevention'
): number {
  // 같은 타입의 시설들만 필터링
  const sameTyepFacilities = facilities.filter(f => f.outlet === targetFacility.outlet);
  
  // 배출구 내에서 해당 시설의 순번 찾기
  const facilityIndex = sameTyepFacilities.findIndex(f => 
    f.number === targetFacility.number && 
    f.name === targetFacility.name && 
    f.capacity === targetFacility.capacity
  );

  return facilityIndex + 1; // 1부터 시작
}

/**
 * 업로드된 파일들 중에서 같은 시설의 사진 개수 계산 (사진 순서 결정용)
 */
// 하위 호환성을 위한 sanitizeFacilityInfo 함수 유지
function sanitizeFacilityInfo(name: string, capacity: string): string {
  let cleanName = name.replace(/\s+/g, '').replace(/[()]/g, '').trim();
  let cleanCapacity = capacity.replace(/\s+/g, '').replace(/[가-힣]/g, '').replace(/[^0-9.,\/]/g, '').trim();
  return `${cleanName}${cleanCapacity ? '_' + cleanCapacity : ''}`;
}

export function calculatePhotoIndex(
  existingFiles: any[], 
  facility: Facility, 
  facilityType: 'discharge' | 'prevention',
  facilityInstanceNumber: number = 1
): number {
  const facilityPrefix = facilityType === 'prevention' ? 'prev' : 'disc';
  const facilityInfo = sanitizeFacilityInfo(facility.name, facility.capacity);

  // 새로운 파일명 형식용 시설 표시명 생성
  const facilityDisplayName = createFacilityDisplayName(facilityType, facility.number, facility.capacity);

  console.log('🔍 [PHOTO-INDEX-DEBUG] 사진 순서 계산 시작:', {
    시설정보: { 
      이름: facility.name, 
      용량: facility.capacity, 
      배출구: facility.outlet,
      시설타입: facilityType,
      시설번호: facility.number
    },
    시설표시명: facilityDisplayName,
    전체파일수: existingFiles.length
  });

  // 디버깅용: 모든 파일명 출력
  console.log('📋 [PHOTO-INDEX-DEBUG] 기존 파일 목록:', 
    existingFiles.map(f => ({ 
      name: f.name, 
      originalName: f.originalName,
      folderName: f.folderName,
      facilityInfo: f.facilityInfo 
    }))
  );

  // 1차: 새로운 파일명 형식 매칭 (시설명용량_순번_yymmdd.webp)
  const escapedDisplayName = facilityDisplayName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const newFormatPattern = new RegExp(`^${escapedDisplayName}_\\d{3}_\\d{6}\\.webp$`);
  
  // 2차: 기존 형식 매칭 (하위 호환성)
  const escapedFacilityInfo = facilityInfo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const oldFormatPattern = new RegExp(`^${facilityPrefix}${facility.number}_${escapedFacilityInfo}_`);
  
  const newFormatMatches = existingFiles.filter(file => {
    if (!file.name) return false;
    const matches = newFormatPattern.test(file.name);
    if (matches) {
      console.log('✅ [NEW-FORMAT-MATCH]', file.name);
    }
    return matches;
  });

  const oldFormatMatches = existingFiles.filter(file => {
    if (!file.name) return false;
    const matches = oldFormatPattern.test(file.name);
    if (matches) {
      console.log('✅ [OLD-FORMAT-MATCH]', file.name);
    }
    return matches;
  });

  // 2차: 느슨한 매칭 (시설 정보 포함)
  const looseMatches = existingFiles.filter(file => {
    if (!file.name) return false;
    
    // 구조화된 파일명이 아닌 경우 시설 정보로 매칭
    const hasPrefix = file.name.includes(facilityPrefix);
    const hasFacilityInfo = file.name.includes(facilityInfo) || 
                           file.name.includes(facility.name);
    
    // 배출구 번호도 확인 (facilityInfo가 있는 경우)
    let hasOutletMatch = false;
    if (file.facilityInfo) {
      const outletMatch = file.facilityInfo.match(/배출구[:\s]*(\d+)/);
      if (outletMatch) {
        const fileOutlet = parseInt(outletMatch[1]);
        hasOutletMatch = fileOutlet === facility.outlet;
      }
    }

    const isMatch = hasPrefix && (hasFacilityInfo || hasOutletMatch);
    
    if (isMatch) {
      console.log('✅ [LOOSE-MATCH]', {
        fileName: file.name,
        hasPrefix,
        hasFacilityInfo,
        hasOutletMatch,
        facilityInfo: file.facilityInfo
      });
    }
    
    return isMatch;
  });

  // 우선순위: 새 형식 > 기존 형식 > 느슨한 매칭
  let matchedFiles: any[] = [];
  let matchType = '';
  
  if (newFormatMatches.length > 0) {
    matchedFiles = newFormatMatches;
    matchType = '새로운형식';
  } else if (oldFormatMatches.length > 0) {
    matchedFiles = oldFormatMatches;
    matchType = '기존형식';
  } else {
    matchedFiles = looseMatches;
    matchType = '느슨한매칭';
  }
  
  const existingCount = matchedFiles.length;

  console.log('📊 [PHOTO-INDEX-RESULT] 계산 결과:', {
    새로운형식매칭수: newFormatMatches.length,
    기존형식매칭수: oldFormatMatches.length,
    느슨한매칭수: looseMatches.length,
    사용된매칭타입: matchType,
    최종사용매칭수: existingCount,
    다음사진순서: existingCount + 1,
    매칭된파일명들: matchedFiles.map(f => f.name)
  });

  return existingCount + 1; // 다음 순서
}

/**
 * 기본사진의 사진 순서 계산 (새로운 형식 지원)
 * 🆕 송풍팬 + 배출구별 순서 계산 지원
 */
export function calculateBasicPhotoIndex(
  existingFiles: any[],
  category: string,
  outletNumber?: number  // 🆕 배출구 번호 (송풍팬 전용)
): number {
  const categoryMap: { [key: string]: string } = {
    'gateway': 'gateway',
    'fan': 'fan',
    'electrical': 'electrical',
    'others': 'others'
  };

  const categoryName = categoryMap[category] || category;

  // 🆕 송풍팬 + 배출구별 순서 계산
  if (category === 'fan' && outletNumber !== undefined) {
    const existingCount = existingFiles.filter(file => {
      if (!file.name) return false;

      // 송풍팬-배{N}-{순번}.jpg 패턴 매칭
      const fanOutletMatch = file.name.match(/^송풍팬-배(\d+)-\d+\.jpg$/);
      if (fanOutletMatch) {
        const fileOutlet = parseInt(fanOutletMatch[1], 10);
        return fileOutlet === outletNumber;
      }

      // folder 경로로 매칭 (fan/outlet-N)
      if (file.folderName?.includes(`fan/outlet-${outletNumber}`) ||
          file.folderName?.includes(`fan\\outlet-${outletNumber}`)) {
        return true;
      }

      return false;
    }).length;

    console.log('📝 [FAN-OUTLET-PHOTO-INDEX] 배출구별 송풍팬 순서 계산:', {
      카테고리: category,
      배출구번호: outletNumber,
      기존파일수: existingCount,
      다음순서: existingCount + 1
    });

    return existingCount + 1;
  }

  // 새로운 형식과 기존 형식 모두 지원
  const existingCount = existingFiles.filter(file => {
    if (!file.name) return false;

    // 새로운 형식: {카테고리명}_{순번}_{yymmdd}.webp
    const newFormatMatch = file.name.startsWith(`${categoryName}_`);

    // 기존 형식: basic_{category}_
    const oldFormatMatch = file.name.includes(`기본_${categoryName}`) ||
                          file.name.includes(`basic_${category}`);

    return newFormatMatch || oldFormatMatch;
  }).length;

  console.log('📝 [BASIC-PHOTO-INDEX] 기본사진 순서 계산:', {
    카테고리: category,
    카테고리명: categoryName,
    기존파일수: existingCount,
    다음순서: existingCount + 1
  });

  return existingCount + 1; // 다음 순서
}