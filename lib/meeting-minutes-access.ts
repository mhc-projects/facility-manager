// 회의록 접근 제어 공통 유틸 - 전체 접근 예외 판정 및 참석자 기반 접근 판정

// 전체 회의록 접근 권한을 가진 특별 허용 이메일 (관리자 permission_level>=4 외 추가 예외)
export const MEETING_MINUTES_FULL_ACCESS_EMAILS = ['dpf@kakao.com', 'tubealba@naver.com']

export function isFullAccessUser(user: { permission_level?: number | null; email?: string | null }): boolean {
  return (
    (user.permission_level ?? 0) >= 4 ||
    MEETING_MINUTES_FULL_ACCESS_EMAILS.includes(user.email || '')
  )
}

export function canAccessMeetingMinute(
  userId: string,
  isFullAccess: boolean,
  minute: { organizer_id?: string | null; created_by?: string | null; participants?: any[] | null }
): boolean {
  if (isFullAccess) return true
  if (minute.organizer_id && String(minute.organizer_id) === userId) return true
  if (minute.created_by && String(minute.created_by) === userId) return true
  if (Array.isArray(minute.participants)) {
    return minute.participants.some((p: any) => p?.employee_id === userId)
  }
  return false
}
