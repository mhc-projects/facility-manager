// lib/auth/menu-access-override.ts - 관리자설정 "메뉴 노출 설정"에서 지정한 팀/사용자 규칙을
// 사이드바 표시뿐 아니라, 그 메뉴 뒤의 실제 API가 자체적으로 갖고 있는 팀 기반 하드 체크(예: 메일함의
// 영업팀 전용 제한)에도 반영하고 싶을 때 쓰는 헬퍼. requireSalesOrAdmin처럼 "특정 팀만 접근 가능"류의
// 개별 가드에서, 원래 조건을 통과 못 했을 때 이걸로 한 번 더 확인해 명시적으로 허용된 경우만 통과시킨다.
//
// 오직 "허용 추가"만 한다 - visible=false 규칙이 있다고 해서 원래 자격이 있는 사용자(예: 진짜 영업팀
// 직원)의 접근을 막지는 않는다. 그건 사이드바 노출 여부에만 영향을 준다.
import { queryOne } from '@/lib/supabase-direct';

export async function hasMenuAccessOverride(
  menuHref: string,
  userId: string,
  userTeam: string | null
): Promise<boolean> {
  const row = await queryOne(
    `SELECT visible FROM menu_visibility_overrides
     WHERE menu_href = $1 AND visible = true AND (
       (scope_type = 'user' AND scope_value = $2)
       OR (scope_type = 'team' AND scope_value = $3)
     )
     LIMIT 1`,
    [menuHref, userId, userTeam]
  );
  return !!row;
}
