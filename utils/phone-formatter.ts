// utils/phone-formatter.ts - 전화번호 포맷팅 유틸리티 (일반전화 · 휴대폰 자동 감지 포함)

/**
 * 휴대폰 번호 포맷팅: xxx-xxxx-xxxx
 */
export function formatMobilePhone(value: string): string {
  const numbers = value.replace(/[^0-9]/g, '')

  if (numbers.length <= 3) {
    return numbers
  } else if (numbers.length <= 7) {
    return `${numbers.slice(0, 3)}-${numbers.slice(3)}`
  } else {
    return `${numbers.slice(0, 3)}-${numbers.slice(3, 7)}-${numbers.slice(7, 11)}`
  }
}

/**
 * 사업장 연락처 자동 감지 포맷팅
 * - 010으로 시작하면 휴대폰 형식: 010-xxxx-xxxx
 * - 그 외는 지역번호 형식: 02-xxx-xxxx / 031-xxx-xxxx 등
 */
export function formatBusinessPhone(value: string): string {
  const numbers = value.replace(/[^0-9]/g, '')

  if (numbers.startsWith('010')) {
    if (numbers.length <= 3) return numbers
    if (numbers.length <= 7) return `${numbers.slice(0, 3)}-${numbers.slice(3)}`
    return `${numbers.slice(0, 3)}-${numbers.slice(3, 7)}-${numbers.slice(7, 11)}`
  }

  return formatLandlinePhone(value)
}

/**
 * 일반 전화번호 포맷팅: xx-xxx-xxxx (지역번호 2자리) 또는 xxx-xxx-xxxx (지역번호 3자리)
 * 팩스번호 등 10자리 숫자(xx-xxxx-xxxx 또는 xxx-xxxx-xxxx)도 지원
 */
export function formatLandlinePhone(value: string): string {
  const numbers = value.replace(/[^0-9]/g, '')

  // 02 (서울) - 특수 케이스
  if (numbers.startsWith('02')) {
    if (numbers.length <= 2) {
      return numbers
    } else if (numbers.length <= 5) {
      return `${numbers.slice(0, 2)}-${numbers.slice(2)}`
    } else if (numbers.length <= 9) {
      return `${numbers.slice(0, 2)}-${numbers.slice(2, 5)}-${numbers.slice(5, 9)}`
    } else {
      // 10자리: 02-xxxx-xxxx
      return `${numbers.slice(0, 2)}-${numbers.slice(2, 6)}-${numbers.slice(6, 10)}`
    }
  }

  // 070 (인터넷전화) - xxx-xxxx-xxxx (11자리)
  if (numbers.startsWith('070')) {
    if (numbers.length <= 3) {
      return numbers
    } else if (numbers.length <= 7) {
      return `${numbers.slice(0, 3)}-${numbers.slice(3)}`
    } else {
      return `${numbers.slice(0, 3)}-${numbers.slice(3, 7)}-${numbers.slice(7, 11)}`
    }
  }

  // 031, 032, etc. (지역번호 3자리)
  if (numbers.length <= 3) {
    return numbers
  } else if (numbers.length <= 6) {
    return `${numbers.slice(0, 3)}-${numbers.slice(3)}`
  } else if (numbers.length <= 9) {
    return `${numbers.slice(0, 3)}-${numbers.slice(3, 6)}-${numbers.slice(6, 9)}`
  } else {
    // 10자리: 031-123-4567, 062-946-0230
    return `${numbers.slice(0, 3)}-${numbers.slice(3, 6)}-${numbers.slice(6, 10)}`
  }
}
