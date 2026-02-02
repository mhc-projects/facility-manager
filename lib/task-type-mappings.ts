/**
 * 업무 타입 매핑 정의 (공통 모듈)
 *
 * 🎯 목적: 프론트엔드와 백엔드에서 동일한 업무타입 매핑 사용
 *
 * 사용처:
 * - 프론트엔드: 엑셀 템플릿, 유효성 검사
 * - 백엔드: API 유효성 검사, DB 저장
 *
 * 📅 생성일: 2024-02-02
 * 🔧 Phase 4: 완벽한 재발방지 시스템 구축
 */

// ============================================================================
// 업무 타입 코드 상수 정의
// ============================================================================

export const TASK_TYPE_CODES = {
  SELF: 'self',           // 자비 설치
  SUBSIDY: 'subsidy',     // 보조금
  AS: 'as',               // AS
  DEALER: 'dealer',       // 대리점
  OUTSOURCING: 'outsourcing', // 외주설치
  ETC: 'etc'              // 기타
} as const;

export type TaskTypeCode = typeof TASK_TYPE_CODES[keyof typeof TASK_TYPE_CODES];

// ============================================================================
// 한글 → 영문 코드 매핑
// ============================================================================

/**
 * 한글 업무타입명을 영문 코드로 변환하는 매핑 테이블
 *
 * 주의사항:
 * - 모든 가능한 한글 표현을 포함해야 함 (동의어 지원)
 * - 엑셀 템플릿 가이드와 일치해야 함
 * - 대소문자 구분 없음 (변환 함수에서 처리)
 */
export const TASK_TYPE_KR_TO_CODE: Record<string, TaskTypeCode> = {
  // 자비 관련 (동일 의미의 다양한 표현)
  '자비': TASK_TYPE_CODES.SELF,
  '자가': TASK_TYPE_CODES.SELF,
  '자가시설': TASK_TYPE_CODES.SELF,

  // 보조금
  '보조금': TASK_TYPE_CODES.SUBSIDY,

  // AS (대소문자 모두 지원)
  'AS': TASK_TYPE_CODES.AS,
  'A/S': TASK_TYPE_CODES.AS,
  'as': TASK_TYPE_CODES.AS,
  'a/s': TASK_TYPE_CODES.AS,

  // 대리점
  '대리점': TASK_TYPE_CODES.DEALER,

  // 외주설치
  '외주설치': TASK_TYPE_CODES.OUTSOURCING,

  // 기타
  '기타': TASK_TYPE_CODES.ETC
};

// ============================================================================
// 영문 코드 → 한글 표시명 매핑
// ============================================================================

/**
 * 영문 코드를 한글 표시명으로 변환하는 매핑 테이블
 * UI 표시용으로 사용됨
 */
export const TASK_TYPE_CODE_TO_KR: Record<TaskTypeCode, string> = {
  [TASK_TYPE_CODES.SELF]: '자비',
  [TASK_TYPE_CODES.SUBSIDY]: '보조금',
  [TASK_TYPE_CODES.AS]: 'AS',
  [TASK_TYPE_CODES.DEALER]: '대리점',
  [TASK_TYPE_CODES.OUTSOURCING]: '외주설치',
  [TASK_TYPE_CODES.ETC]: '기타'
};

// ============================================================================
// 엑셀 템플릿용 허용 값 목록
// ============================================================================

/**
 * 엑셀 템플릿에서 권장하는 업무타입 목록
 * 템플릿 가이드 섹션에 표시됨
 */
export const EXCEL_ALLOWED_TASK_TYPES = [
  '자비',
  '보조금',
  'AS',
  '대리점',
  '외주설치',
  '기타'
] as const;

// ============================================================================
// 유효성 검사 헬퍼 함수
// ============================================================================

/**
 * 업무타입이 유효한지 확인
 * @param type - 검증할 업무타입 (한글 또는 영문)
 * @returns 유효하면 true, 아니면 false
 *
 * @example
 * isValidTaskType('자비') // true
 * isValidTaskType('AS') // true
 * isValidTaskType('잘못된타입') // false
 */
export function isValidTaskType(type: string): boolean {
  if (!type || typeof type !== 'string') return false;

  // 한글 → 영문 코드 매핑에 존재하는지 확인
  if (type in TASK_TYPE_KR_TO_CODE) return true;

  // 영문 코드에 직접 존재하는지 확인
  return Object.values(TASK_TYPE_CODES).includes(type as TaskTypeCode);
}

/**
 * 한글 업무타입을 영문 코드로 변환
 * @param koreanType - 한글 업무타입명
 * @returns 영문 코드 또는 null (변환 실패 시)
 *
 * @example
 * convertTaskType('자비') // 'self'
 * convertTaskType('AS') // 'as'
 * convertTaskType('잘못된타입') // null
 */
export function convertTaskType(koreanType: string): TaskTypeCode | null {
  if (!koreanType || typeof koreanType !== 'string') return null;

  // 공백 제거 및 소문자 변환
  const normalized = koreanType.trim();

  // 매핑 테이블에서 찾기
  return TASK_TYPE_KR_TO_CODE[normalized] || null;
}

/**
 * 영문 코드를 한글 표시명으로 변환
 * @param code - 영문 업무타입 코드
 * @returns 한글 표시명 또는 원본 코드 (변환 실패 시)
 *
 * @example
 * getTaskTypeLabel('self') // '자비'
 * getTaskTypeLabel('as') // 'AS'
 */
export function getTaskTypeLabel(code: TaskTypeCode | string): string {
  if (!code || typeof code !== 'string') return '';

  return TASK_TYPE_CODE_TO_KR[code as TaskTypeCode] || code;
}

/**
 * 모든 유효한 업무타입 목록 반환 (한글)
 * @returns 유효한 한글 업무타입 배열
 */
export function getAllValidTaskTypes(): string[] {
  return Object.keys(TASK_TYPE_KR_TO_CODE);
}

/**
 * 유효하지 않은 업무타입에 대한 오류 메시지 생성
 * @param invalidType - 유효하지 않은 업무타입
 * @returns 사용자 친화적인 오류 메시지
 */
export function getInvalidTaskTypeMessage(invalidType: string): string {
  return (
    `업무타입 "${invalidType}"이 유효하지 않습니다. ` +
    `허용된 값: ${EXCEL_ALLOWED_TASK_TYPES.join(', ')}`
  );
}

// ============================================================================
// 타입 가드 함수
// ============================================================================

/**
 * 주어진 값이 유효한 TaskTypeCode인지 확인하는 타입 가드
 * @param value - 확인할 값
 * @returns TaskTypeCode 타입이면 true
 */
export function isTaskTypeCode(value: unknown): value is TaskTypeCode {
  return typeof value === 'string' && Object.values(TASK_TYPE_CODES).includes(value as TaskTypeCode);
}

// ============================================================================
// 엑셀 템플릿 생성 헬퍼
// ============================================================================

/**
 * 엑셀 템플릿 가이드용 업무타입 설명 생성
 * @returns 업무타입별 설명 배열
 */
export function getTaskTypeGuideLines(): string[] {
  return [
    '2. 업무타입 (선택사항)',
    '  - 다음 중 하나를 정확히 입력하세요:',
    '    • 자비 (자비시설 업무)',
    '    • 보조금 (보조금 업무)',
    '    • AS (A/S 업무)',
    '    • 대리점 (대리점 업무)',
    '    • 외주설치 (외주설치 업무)',
    '    • 기타 (기타 업무)',
    '',
    '  ⚠️ 주의: "자가"와 "자비"는 동일하게 처리됩니다'
  ];
}
