-- sql/20260803_menu_visibility_overrides.sql
-- 팀별/사용자별 사이드바 메뉴 노출 설정 (시스템관리자 전용 기능)

CREATE TABLE IF NOT EXISTS menu_visibility_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_href TEXT NOT NULL,                          -- 사이드바 navigationConfig의 item.href (예: '/admin/mail')
  scope_type TEXT NOT NULL CHECK (scope_type IN ('team', 'user')),
  scope_value TEXT NOT NULL,                         -- team이면 employees.team 문자열, user면 employees.id(uuid 문자열)
  visible BOOLEAN NOT NULL,                          -- true=강제 표시, false=강제 숨김
  created_by UUID REFERENCES employees(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (menu_href, scope_type, scope_value)
);

CREATE INDEX IF NOT EXISTS idx_menu_visibility_overrides_lookup
  ON menu_visibility_overrides (scope_type, scope_value);

COMMENT ON TABLE menu_visibility_overrides IS '시스템관리자가 설정하는 팀별/사용자별 사이드바 메뉴 노출 규칙';
