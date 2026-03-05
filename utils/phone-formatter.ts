// utils/phone-formatter.ts - 전화번호 포맷팅 유틸리티

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

  // 031, 032, etc. (지역번호 3자리)
  if (numbers.length <= 3) {
    return numbers
  } else if (numbers.length <= 6) {
    return `${numbers.slice(0, 3)}-${numbers.slice(3)}`
  } else if (numbers.length <= 9) {
    return `${numbers.slice(0, 3)}-${numbers.slice(3, 6)}-${numbers.slice(6, 9)}`
  } else {
    // 10자리: 031-xxxx-xxxx
    return `${numbers.slice(0, 3)}-${numbers.slice(3, 7)}-${numbers.slice(7, 11)}`
  }
}
