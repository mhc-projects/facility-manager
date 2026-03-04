// lib/auth/special-accounts.ts
// 특별 접근 제어 계정 설정
// permission_level 변경과 완전히 독립적으로 동작하는 하드코딩 설정

const SPECIAL_ACCOUNT_CONFIG: Record<string, { hiddenPaths: readonly string[]; exactHiddenPaths: readonly string[] }> = {
  'wns310503@naver.com': {
    // 이 경로들은 항상 숨김 (navigation + 직접 URL 접근 모두 차단)
    // hiddenPaths: prefix 매칭 (해당 경로 및 하위 경로 모두 차단)
    hiddenPaths: [
      '/admin/meeting-minutes',               // 회의록 관리
      '/admin/revenue',                       // 매출 관리
      '/admin/users',                         // 사용자 관리
      '/admin/weekly-reports',               // 전체 리포트 관리 (직접 URL 접근 차단용)
      '/admin/data-history',                 // 데이터 이력
      '/admin/settings',                     // 관리자 설정
      '/admin/first-setup',                  // 시스템 초기 설정
      '/admin/subsidy/monitoring-dashboard', // 크롤링 통합 모니터링
      '/admin/subsidy/monitoring',           // 크롤링 실행 상세
      '/admin/subsidy/regional-stats',       // 지자체별 크롤링 통계
      '/admin/subsidy/url-health',           // URL 건강도
      '/admin/order-management',             // 발주 관리
      '/admin/document-automation',          // 문서 자동화
    ] as const,
    // exactHiddenPaths: 정확한 경로만 매칭 (하위 경로는 차단하지 않음)
    exactHiddenPaths: [
      '/admin',          // 관리자 대시보드 (정확히 /admin만 차단, /admin/business 등은 허용)
      '/weekly-reports', // 주간 리포트 nav 항목 (AdminLayout sidebar href)
    ] as const,
  },
} as const;

/**
 * 특별 계정 설정 반환. 설정이 없으면 null.
 */
export function getSpecialAccountConfig(email: string) {
  return SPECIAL_ACCOUNT_CONFIG[email] ?? null;
}

/**
 * 해당 계정에서 이 경로가 숨겨져야 하는지 확인.
 * permission_level과 무관하게 동작함.
 * - hiddenPaths: prefix 매칭 (해당 경로 및 하위 경로 차단)
 * - exactHiddenPaths: 정확히 일치하는 경로만 차단
 */
export function isPathHiddenForAccount(email: string, pathname: string): boolean {
  const config = getSpecialAccountConfig(email);
  if (!config) return false;
  const prefixMatch = config.hiddenPaths.some(
    hidden => pathname === hidden || pathname.startsWith(hidden + '/')
  );
  if (prefixMatch) return true;
  const exactMatch = config.exactHiddenPaths.some(hidden => pathname === hidden);
  return exactMatch;
}

/**
 * 특별 접근 제어가 적용되는 계정인지 확인
 */
export function isSpecialAccount(email: string): boolean {
  return email in SPECIAL_ACCOUNT_CONFIG;
}
