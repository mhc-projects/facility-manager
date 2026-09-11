// 전자결재 작성일(written_date) 한시적 수정 가능 여부 판정 — 프론트/API 공통 단일 소스
// 2026-09-11 도입: 과거 문서의 작성일 오기재를 정정할 수 있도록 약 1개월간만 한시적으로 허용하고, 이후 자동으로 다시 잠긴다.
export const WRITTEN_DATE_EDIT_DEADLINE = new Date('2026-10-11T23:59:59+09:00')

export function isWrittenDateEditWindowOpen(now: Date = new Date()): boolean {
  return now.getTime() <= WRITTEN_DATE_EDIT_DEADLINE.getTime()
}
