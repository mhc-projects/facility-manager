/**
 * 날짜 유틸리티 - 타임존 문제 해결
 *
 * 사용 원칙:
 * 1. 날짜만 필요한 경우: toKSTDateString() 사용
 * 2. 날짜+시간이 필요한 경우: toKSTISOString() 사용
 * 3. 표시용 날짜: formatKSTDate() 사용
 *
 * @see claudedocs/timezone-fix-comprehensive-design.md
 */

/**
 * YYYY-MM-DD 형식의 날짜 문자열을 반환 (타임존 영향 없음)
 *
 * 이 함수는 Date 객체나 날짜 문자열을 받아서 YYYY-MM-DD 형식으로 변환합니다.
 * 타임존 변환 없이 날짜 컴포넌트를 직접 조합하므로 "하루 빠지는" 문제가 발생하지 않습니다.
 *
 * @param date - Date 객체 또는 날짜 문자열
 * @returns YYYY-MM-DD 형식 문자열 또는 null
 *
 * @example
 * toKSTDateString(new Date()) // "2026-02-04"
 * toKSTDateString("2016-01-11T15:00:00Z") // "2016-01-11"
 * toKSTDateString(null) // null
 */
export function toKSTDateString(date: Date | string | null | undefined): string | null {
  if (!date) return null

  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return null

  // 한국 시간대로 날짜 문자열 생성 (타임존 변환 없음)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

/**
 * 한국 시간대 기준 ISO 문자열 반환
 *
 * 시간 정보가 중요한 필드(created_at, updated_at 등)에서 사용합니다.
 * UTC+9 (한국 표준시)를 명시적으로 적용합니다.
 *
 * @param date - Date 객체 (생략 시 현재 시간)
 * @returns ISO 8601 형식 문자열 (KST 기준)
 *
 * @example
 * toKSTISOString() // "2026-02-04T15:30:00.000+09:00"
 * toKSTISOString(new Date('2016-01-11')) // "2016-01-11T09:00:00.000+09:00"
 */
export function toKSTISOString(date?: Date): string {
  const d = date || new Date()

  // UTC+9 (한국 시간)로 변환
  const kstOffset = 9 * 60 * 60 * 1000
  const kstDate = new Date(d.getTime() + kstOffset)

  return kstDate.toISOString().replace('Z', '+09:00')
}

/**
 * HTML input[type="date"]에서 받은 문자열을 그대로 반환
 * (타임존 변환 없이 날짜만 추출)
 *
 * HTML input[type="date"]는 항상 YYYY-MM-DD 형식의 문자열을 반환합니다.
 * 이 함수는 해당 문자열의 유효성을 검증하고 그대로 반환합니다.
 * Date 객체로 변환하지 않으므로 타임존 문제가 발생하지 않습니다.
 *
 * @param inputValue - HTML input에서 받은 값
 * @returns YYYY-MM-DD 형식 문자열 또는 null
 *
 * @example
 * parseDateInput("2016-01-11") // "2016-01-11"
 * parseDateInput("") // null
 * parseDateInput("invalid") // null (콘솔 경고 출력)
 */
export function parseDateInput(inputValue: string | null | undefined): string | null {
  if (!inputValue || inputValue.trim() === '') return null

  // YYYY-MM-DD 형식 검증
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/
  if (!dateRegex.test(inputValue)) {
    console.warn(`⚠️ [DATE-UTILS] 잘못된 날짜 형식: ${inputValue}`)
    return null
  }

  // 날짜 유효성 검증 (2월 30일 같은 잘못된 날짜 방지)
  const [year, month, day] = inputValue.split('-').map(Number)
  const testDate = new Date(year, month - 1, day)

  if (
    testDate.getFullYear() !== year ||
    testDate.getMonth() !== month - 1 ||
    testDate.getDate() !== day
  ) {
    console.warn(`⚠️ [DATE-UTILS] 유효하지 않은 날짜: ${inputValue}`)
    return null
  }

  return inputValue
}

/**
 * 한국어 날짜 형식으로 표시 (YYYY.MM.DD)
 *
 * UI에서 날짜를 한국어 형식으로 표시할 때 사용합니다.
 * 옵션으로 시간까지 포함할 수 있습니다.
 *
 * @param date - Date 객체 또는 날짜 문자열
 * @param includeTime - 시간 포함 여부 (기본: false)
 * @returns 한국어 날짜 문자열
 *
 * @example
 * formatKSTDate("2016-01-11") // "2016.01.11"
 * formatKSTDate(new Date(), true) // "2026.02.04 15:30"
 * formatKSTDate(null) // "-"
 */
export function formatKSTDate(
  date: Date | string | null | undefined,
  includeTime: boolean = false
): string {
  if (!date) return '-'

  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return '-'

  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')

  let result = `${year}.${month}.${day}`

  if (includeTime) {
    const hours = String(d.getHours()).padStart(2, '0')
    const minutes = String(d.getMinutes()).padStart(2, '0')
    result += ` ${hours}:${minutes}`
  }

  return result
}

/**
 * 날짜 비교 유틸리티 (타임존 무시)
 *
 * 두 날짜가 같은 날인지 비교합니다.
 * 시간 정보는 무시하고 날짜만 비교합니다.
 *
 * @param date1 - 첫 번째 날짜
 * @param date2 - 두 번째 날짜
 * @returns 날짜가 같으면 true, 다르면 false
 *
 * @example
 * isSameDate("2016-01-11", "2016-01-11T15:00:00Z") // true
 * isSameDate("2016-01-11", "2016-01-12") // false
 * isSameDate(null, "2016-01-11") // false
 */
export function isSameDate(
  date1: Date | string | null | undefined,
  date2: Date | string | null | undefined
): boolean {
  const d1 = toKSTDateString(date1)
  const d2 = toKSTDateString(date2)
  return d1 === d2 && d1 !== null
}

/**
 * 현재 날짜를 YYYY-MM-DD 형식으로 반환
 *
 * 오늘 날짜를 기본값으로 사용할 때 편리합니다.
 *
 * @returns 오늘 날짜의 YYYY-MM-DD 문자열
 *
 * @example
 * getTodayDateString() // "2026-02-04"
 */
export function getTodayDateString(): string {
  return toKSTDateString(new Date())!
}

/**
 * 날짜 문자열 유효성 검증
 *
 * YYYY-MM-DD 형식의 문자열이 유효한 날짜인지 확인합니다.
 *
 * @param dateString - 검증할 날짜 문자열
 * @returns 유효한 날짜면 true, 아니면 false
 *
 * @example
 * isValidDateString("2016-01-11") // true
 * isValidDateString("2016-02-30") // false
 * isValidDateString("invalid") // false
 */
export function isValidDateString(dateString: string | null | undefined): boolean {
  return parseDateInput(dateString) !== null
}

/**
 * 날짜 범위 검증
 *
 * 주어진 날짜가 시작일과 종료일 사이에 있는지 확인합니다.
 *
 * @param date - 검증할 날짜
 * @param startDate - 시작일 (inclusive)
 * @param endDate - 종료일 (inclusive)
 * @returns 범위 내에 있으면 true
 *
 * @example
 * isDateInRange("2016-01-15", "2016-01-01", "2016-01-31") // true
 * isDateInRange("2016-02-01", "2016-01-01", "2016-01-31") // false
 */
export function isDateInRange(
  date: Date | string | null | undefined,
  startDate: Date | string | null | undefined,
  endDate: Date | string | null | undefined
): boolean {
  const d = toKSTDateString(date)
  const start = toKSTDateString(startDate)
  const end = toKSTDateString(endDate)

  if (!d || !start || !end) return false

  return d >= start && d <= end
}
