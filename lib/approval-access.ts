// 전자결재 접근 제어 공통 유틸 - 결재라인 미포함자의 전체 문서 열람 예외 판정

// 결재라인에 없어도 모든 결재 문서를 열람할 수 있는 예외 허용 이메일
// (권한4 슈퍼관리자와 달리 열람 전용 - 삭제/강제취소/결재완료 탭 등 관리 기능은 부여하지 않음)
export const APPROVAL_FULL_ACCESS_EMAILS = ['tubealba@naver.com']

export function isApprovalFullAccessEmail(email?: string | null): boolean {
  return APPROVAL_FULL_ACCESS_EMAILS.includes(email || '')
}
