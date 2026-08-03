-- sql/20260803_menu_required_level_overrides.sql
-- 시스템관리자가 메뉴별 필요 권한 레벨(requiredLevel)을 전역으로 조정할 수 있게 하는 테이블.
-- 행이 없는 메뉴는 코드의 기본값(navigationConfig의 requiredLevel)을 그대로 쓴다.

CREATE TABLE IF NOT EXISTS menu_required_level_overrides (
  menu_href TEXT PRIMARY KEY,
  required_level INTEGER NOT NULL CHECK (required_level BETWEEN 0 AND 4),
  updated_by UUID REFERENCES employees(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE menu_required_level_overrides IS '시스템관리자가 설정하는 메뉴별 필요 권한 레벨 전역 재정의';
