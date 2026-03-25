-- Migration: 공개 테이블 RLS 활성화 및 보안 정책 설정
-- Created: 2026-03-25
--
-- 배경:
--   이 프로젝트의 모든 DB 접근은 Next.js API Routes를 통해
--   service_role key 또는 PostgreSQL 직접 연결로만 이루어집니다.
--   클라이언트가 PostgREST(anon/authenticated)로 직접 접근하지 않으므로
--   RLS를 활성화 + 접근 차단 정책을 추가해도 앱 동작에 영향 없습니다.
--
-- 대상 테이블 (Supabase 보안 linter ERROR):
--   1. as_records
--   2. dev_work_log
--   3. api_keys              (sensitive: api_key 컬럼)
--   4. push_subscriptions    (sensitive: auth_key 컬럼)
--   5. settings
--   6. as_price_adjustments
--   7. as_price_list
--   8. as_material_usage

-- ============================================================
-- 1. as_records
-- ============================================================
ALTER TABLE public.as_records ENABLE ROW LEVEL SECURITY;

-- anon/authenticated 롤의 직접 접근 차단 (서버만 service_role로 접근)
CREATE POLICY "as_records: server only access"
  ON public.as_records
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- ============================================================
-- 2. dev_work_log
-- ============================================================
ALTER TABLE public.dev_work_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dev_work_log: server only access"
  ON public.dev_work_log
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- ============================================================
-- 3. api_keys (민감 데이터: api_key 컬럼)
-- ============================================================
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "api_keys: server only access"
  ON public.api_keys
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- ============================================================
-- 4. push_subscriptions (민감 데이터: auth_key 컬럼)
-- ============================================================
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "push_subscriptions: server only access"
  ON public.push_subscriptions
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- ============================================================
-- 5. settings
-- ============================================================
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "settings: server only access"
  ON public.settings
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- ============================================================
-- 6. as_price_adjustments
-- ============================================================
ALTER TABLE public.as_price_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "as_price_adjustments: server only access"
  ON public.as_price_adjustments
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- ============================================================
-- 7. as_price_list
-- ============================================================
ALTER TABLE public.as_price_list ENABLE ROW LEVEL SECURITY;

CREATE POLICY "as_price_list: server only access"
  ON public.as_price_list
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- ============================================================
-- 8. as_material_usage
-- ============================================================
ALTER TABLE public.as_material_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "as_material_usage: server only access"
  ON public.as_material_usage
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);
