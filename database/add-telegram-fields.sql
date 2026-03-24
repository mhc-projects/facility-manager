-- 텔레그램 알림 연동을 위한 컬럼 추가
-- Supabase SQL Editor 또는 psql에서 실행

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS telegram_chat_id TEXT,
  ADD COLUMN IF NOT EXISTS telegram_connect_token TEXT;

-- 인덱스 (토큰 조회 최적화)
CREATE INDEX IF NOT EXISTS idx_employees_telegram_connect_token
  ON employees (telegram_connect_token)
  WHERE telegram_connect_token IS NOT NULL;
