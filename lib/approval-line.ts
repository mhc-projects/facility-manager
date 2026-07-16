// 전자결재 결재라인 공통 유틸 - 작성자 role 기준 필요 결재 단계 판정 및 결재자 ID 정규화

export type ApprovalRole = 'staff' | 'team_leader' | 'executive' | 'vice_president' | 'ceo' | string | null | undefined

/**
 * 작성자 role에 따라 어떤 결재 단계가 필요한지 판정한다.
 * ApproverSelector.tsx의 getRequiredSteps()와 동일한 규칙을 서버에서도 공유하기 위한 단일 소스.
 */
export function getRequiredApprovalSteps(role: ApprovalRole) {
  if (role === 'vice_president' || role === 'ceo') {
    return { needTeamLeader: false, needExecutive: false, needVicePresident: false }
  }
  if (role === 'executive') {
    return { needTeamLeader: false, needExecutive: false, needVicePresident: true }
  }
  if (role === 'team_leader') {
    return { needTeamLeader: false, needExecutive: true, needVicePresident: true }
  }
  return { needTeamLeader: true, needExecutive: true, needVicePresident: true }
}

/**
 * role상 불필요한 결재자 ID(예: 본인이 팀장인데 팀장란에 값이 남아있는 경우)를 null로 정규화한다.
 * 담당자 본인이 상위 결재자로 중복 표시되는 버그를 저장 시점에 차단한다.
 */
export function normalizeApproverIds(
  role: ApprovalRole,
  ids: { team_leader_id?: string | null; executive_id?: string | null; vice_president_id?: string | null }
) {
  const { needTeamLeader, needExecutive, needVicePresident } = getRequiredApprovalSteps(role)
  return {
    team_leader_id: needTeamLeader ? (ids.team_leader_id || null) : null,
    executive_id: needExecutive ? (ids.executive_id || null) : null,
    vice_president_id: needVicePresident ? (ids.vice_president_id || null) : null,
  }
}
