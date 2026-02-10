/**
 * 시설 정보 JSON을 한글 캡션으로 변환하는 유틸리티
 */

interface FacilityInfoJSON {
  type: 'prevention' | 'discharge' | 'basic';
  outlet?: number;
  number?: number;
  instance?: number;
  category?: string;
  name?: string;      // 시설명 (옵션)
  capacity?: string;  // 용량 (옵션)
}

/**
 * JSON 형식의 facility_info를 한글 캡션으로 변환
 *
 * @example
 * {"type":"prevention","outlet":1,"number":1,"instance":1}
 * → "방지시설1 (배출구: 1번)"
 *
 * @example
 * {"type":"discharge","outlet":1,"number":1,"instance":1}
 * → "배출시설1 (배출구: 1번)"
 *
 * @example
 * {"type":"basic","category":"others"}
 * → "기타시설"
 */
export function formatFacilityInfoToCaption(facilityInfoStr: string): string {
  try {
    // JSON 파싱 시도
    const info: FacilityInfoJSON = JSON.parse(facilityInfoStr);

    // 시설 타입별 한글 변환
    let caption = '';

    if (info.type === 'prevention') {
      // 방지시설
      // 시설번호 형식: instance가 있으면 "4-1", "4-2" 형식으로, 없으면 "4"
      const facilityNumberText = info.instance && info.instance > 1
        ? `${info.number || ''}-${info.instance}`
        : `${info.number || ''}`;

      if (info.name && info.capacity) {
        // 시설명과 용량이 있는 경우: "방지시설4-1 여과집진시설 (450㎥/분, 배출구: 1번)"
        caption = `방지시설${facilityNumberText} ${info.name} (${info.capacity}`;
        if (info.outlet) {
          caption += `, 배출구: ${info.outlet}번`;
        }
        caption += ')';
      } else {
        // 기본 형식: "방지시설4-1 (배출구: 1번)"
        caption = `방지시설${facilityNumberText}`;
        if (info.outlet) {
          caption += ` (배출구: ${info.outlet}번)`;
        }
      }
    } else if (info.type === 'discharge') {
      // 배출시설
      // 시설번호 형식: instance가 있으면 "4-1", "4-2" 형식으로, 없으면 "4"
      const facilityNumberText = info.instance && info.instance > 1
        ? `${info.number || ''}-${info.instance}`
        : `${info.number || ''}`;

      if (info.name && info.capacity) {
        // 시설명과 용량이 있는 경우: "배출시설4-1 압출기 (2.5㎥, 배출구: 1번)"
        caption = `배출시설${facilityNumberText} ${info.name} (${info.capacity}`;
        if (info.outlet) {
          caption += `, 배출구: ${info.outlet}번`;
        }
        caption += ')';
      } else {
        // 기본 형식: "배출시설4-1 (배출구: 1번)"
        caption = `배출시설${facilityNumberText}`;
        if (info.outlet) {
          caption += ` (배출구: ${info.outlet}번)`;
        }
      }
    } else if (info.type === 'basic') {
      // 기본시설
      const categoryMap: Record<string, string> = {
        'gateway': '게이트웨이',
        'control_panel': '제어반',
        'fan': '송풍팬',
        'others': '기타시설'
      };

      const category = info.category || 'others';
      caption = categoryMap[category] || '기본시설';

      // 시설번호가 있으면 추가
      if (info.number) {
        caption += ` ${info.number}`;
      }
    } else {
      // 알 수 없는 타입
      return facilityInfoStr;
    }

    return caption;

  } catch (error) {
    // JSON 파싱 실패 시 원본 문자열 반환
    console.warn('[FORMAT-FACILITY] JSON 파싱 실패, 원본 반환:', facilityInfoStr);
    return facilityInfoStr;
  }
}

/**
 * facility_info가 JSON인지 확인
 */
export function isFacilityInfoJSON(facilityInfo: string): boolean {
  if (!facilityInfo) return false;

  const trimmed = facilityInfo.trim();
  return (trimmed.startsWith('{') && trimmed.endsWith('}'));
}

/**
 * facility_info를 최적 포맷으로 변환
 * - JSON 형식이면 한글로 변환
 * - 이미 한글이면 그대로 반환
 */
export function normalizeFacilityInfo(facilityInfo: string): string {
  if (!facilityInfo) return '';

  if (isFacilityInfoJSON(facilityInfo)) {
    return formatFacilityInfoToCaption(facilityInfo);
  }

  return facilityInfo;
}
