-- ============================================================
-- 영업팀 메일함 열람 기능 - Gmail 읽기전용 OAuth 토큰 저장 테이블
-- 작성일: 2026-07-07
-- ============================================================

CREATE TABLE IF NOT EXISTS gmail_readonly_credentials (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email          TEXT NOT NULL UNIQUE,
  refresh_token  TEXT NOT NULL,
  connected_by   UUID REFERENCES employees(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE gmail_readonly_credentials IS 'Gmail API 읽기전용(gmail.readonly) OAuth 리프레시 토큰 저장 - 영업팀 메일함 열람 기능';

-- 이 프로젝트의 모든 DB 접근은 API Routes에서 service_role/직접 연결로만 이루어짐
-- (참고: 20260325_enable_rls_on_public_tables.sql의 api_keys 테이블과 동일한 패턴)
ALTER TABLE gmail_readonly_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gmail_readonly_credentials: server only access"
  ON gmail_readonly_credentials
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);
