// lib/auth/menu-config-for-user.ts - 로그인 시점에 사이드바에 실어 보낼 메뉴 설정을 한 번에 모아주는 헬퍼.
// /api/auth/verify와 /api/auth/login 양쪽에서 똑같이 써야 해서 여기 하나로 모아둔다 - 로직이 두 곳에
// 복붙돼 있으면 한쪽만 고치고 다른 쪽을 깜빡하는 사고가 나기 쉽다 (이 프로젝트에서 이미 겪은 패턴).
import { queryAll } from '@/lib/supabase-direct';

export interface MenuConfigForUser {
  // scope_type='user'인 규칙만. requiredLevel까지 뚫을 수 있는 쪽 - 관리자가 특정 개인을 콕 집어 승인.
  userMenuOverrides: Record<string, boolean>;
  // scope_type='team'인 규칙만. requiredLevel은 통과한 사람에게만 추가로 적용된다 (권한 상승 불가).
  teamMenuOverrides: Record<string, boolean>;
  // 메뉴별 필요 권한 레벨 전역 재정의 (사용자 개인과 무관, 전사 공통).
  requiredLevelOverrides: Record<string, number>;
}

const EMPTY: MenuConfigForUser = { userMenuOverrides: {}, teamMenuOverrides: {}, requiredLevelOverrides: {} };

export async function loadMenuConfigForUser(userId: string, userTeam: string | null): Promise<MenuConfigForUser> {
  try {
    const [userRows, teamRows, levelRows] = await Promise.all([
      queryAll(`SELECT menu_href, visible FROM menu_visibility_overrides WHERE scope_type = 'user' AND scope_value = $1`, [userId]),
      userTeam
        ? queryAll(`SELECT menu_href, visible FROM menu_visibility_overrides WHERE scope_type = 'team' AND scope_value = $1`, [userTeam])
        : Promise.resolve([]),
      queryAll(`SELECT menu_href, required_level FROM menu_required_level_overrides`),
    ]);

    const userMenuOverrides: Record<string, boolean> = {};
    for (const row of userRows) userMenuOverrides[row.menu_href] = row.visible;

    const teamMenuOverrides: Record<string, boolean> = {};
    for (const row of teamRows) teamMenuOverrides[row.menu_href] = row.visible;

    const requiredLevelOverrides: Record<string, number> = {};
    for (const row of levelRows) requiredLevelOverrides[row.menu_href] = row.required_level;

    return { userMenuOverrides, teamMenuOverrides, requiredLevelOverrides };
  } catch (error) {
    // 마이그레이션 전이거나 일시적 오류여도 로그인/인증 자체는 막지 않는다
    console.warn('⚠️ [AUTH] 메뉴 설정 조회 실패 (인증은 계속 진행):', error);
    return EMPTY;
  }
}
