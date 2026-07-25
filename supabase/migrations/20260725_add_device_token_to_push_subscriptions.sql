-- Migration: push_subscriptions에 device_token 컬럼 추가
-- Created: 2026-07-25
--
-- 배경:
--   lib/push-notifications.ts / app/api/push-subscription/route.ts가
--   iOS APNs endpoint 만료 대응(세션 만료 상태에서도 device_token으로
--   기존 구독 레코드를 갱신하는 용도)으로 device_token 컬럼을 참조하는데,
--   원래 스키마(sql/05_phase3_notifications_schema.sql)에는 이 컬럼이
--   없어서 모든 푸시 구독 등록이
--   "Could not find the 'device_token' column of 'push_subscriptions'
--   in the schema cache" 에러로 실패하고 있었다(브라우저 콘솔/네트워크
--   탭에서 직접 확인).

-- ============================================================

ALTER TABLE push_subscriptions
  ADD COLUMN IF NOT EXISTS device_token TEXT;

-- 세션 만료 상태에서 device_token 단독 조회(WHERE device_token = $1)에 쓰이므로 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_device_token
  ON push_subscriptions (device_token)
  WHERE device_token IS NOT NULL;

-- PostgREST가 캐시해둔 스키마를 즉시 갱신 (에러 메시지에 "schema cache"로 명시된 원인)
NOTIFY pgrst, 'reload schema';
