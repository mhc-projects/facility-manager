-- 공휴일·회사 휴무일을 저장하는 테이블 (휴가 근무일 계산·캘린더가 공유하는 단일 소스)
-- 공공 공휴일(kasi/google/nager)은 /api/cron/sync-holidays가 주 1회 연도 단위로 갈아끼우고,
-- 회사 지정 휴무일(company)은 동기화가 건드리지 않는다.

CREATE TABLE IF NOT EXISTS public_holidays (
  id           BIGSERIAL PRIMARY KEY,
  holiday_date DATE NOT NULL,
  name         TEXT NOT NULL,
  source       TEXT NOT NULL CHECK (source IN ('kasi', 'google', 'nager', 'company')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (holiday_date, name, source)
);

CREATE INDEX IF NOT EXISTS idx_public_holidays_date ON public_holidays (holiday_date);

COMMENT ON TABLE public_holidays IS '공휴일(kasi=한국천문연구원 특일정보, google/nager=대체 출처) + 회사 지정 휴무일(company)';
COMMENT ON COLUMN public_holidays.source IS 'kasi | google | nager | company — company 행은 자동 동기화가 삭제하지 않음';

-- RLS: 로그인 사용자는 조회만 가능. 쓰기는 서버(supabase-direct, RLS 우회)에서만 한다
ALTER TABLE public_holidays ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public_holidays_read" ON public_holidays;
CREATE POLICY "public_holidays_read" ON public_holidays
  FOR SELECT USING (auth.role() = 'authenticated');
