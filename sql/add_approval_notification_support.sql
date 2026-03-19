-- ============================================================
-- 전자결재 알림 시스템 지원 추가
-- notifications 테이블에 결재 카테고리 추가
-- ============================================================

-- 1. category 컬럼이 ENUM이면 VARCHAR로 변환, 결재 카테고리 추가
DO $$
DECLARE
  col_type TEXT;
BEGIN
  SELECT data_type INTO col_type
  FROM information_schema.columns
  WHERE table_name = 'notifications' AND column_name = 'category';

  IF col_type = 'USER-DEFINED' THEN
    -- ENUM 타입인 경우: 결재 카테고리 값 추가
    BEGIN
      ALTER TYPE notification_category ADD VALUE IF NOT EXISTS 'report_submitted';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      ALTER TYPE notification_category ADD VALUE IF NOT EXISTS 'report_approved';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      ALTER TYPE notification_category ADD VALUE IF NOT EXISTS 'report_rejected';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    RAISE NOTICE '✅ ENUM에 결재 카테고리 추가 완료';

  ELSIF col_type IN ('character varying', 'text') THEN
    RAISE NOTICE '✅ category 컬럼이 VARCHAR/TEXT - 별도 작업 불필요';

  ELSE
    RAISE NOTICE 'category 컬럼 타입: %', col_type;
  END IF;
END $$;

-- 2. notification_tier 컬럼이 없으면 추가 (결재 API에서 사용)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notifications' AND column_name = 'notification_tier'
  ) THEN
    ALTER TABLE notifications ADD COLUMN notification_tier VARCHAR(20) DEFAULT 'global';
    RAISE NOTICE '✅ notification_tier 컬럼 추가 완료';
  ELSE
    RAISE NOTICE '✅ notification_tier 컬럼 이미 존재';
  END IF;
END $$;

-- 3. target_user_id 컬럼이 없으면 추가 (이미 hybrid_notifications_schema.sql에서 추가됐을 수 있음)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notifications' AND column_name = 'target_user_id'
  ) THEN
    ALTER TABLE notifications ADD COLUMN target_user_id UUID;
    RAISE NOTICE '✅ target_user_id 컬럼 추가 완료';
  ELSE
    RAISE NOTICE '✅ target_user_id 컬럼 이미 존재';
  END IF;
END $$;

-- 4. target_user_id 인덱스 추가 (Realtime 필터 성능)
CREATE INDEX IF NOT EXISTS idx_notifications_target_user
  ON notifications(target_user_id, created_at DESC)
  WHERE target_user_id IS NOT NULL;

-- 5. Supabase Realtime을 위한 REPLICA IDENTITY 설정 확인
-- (postgres_changes가 전체 row 데이터를 Realtime으로 전송하려면 필요)
ALTER TABLE notifications REPLICA IDENTITY FULL;

-- 6. notifications 테이블 RLS 확인 (anon 또는 authenticated role이 SELECT 가능해야 Realtime 작동)
DO $$
DECLARE
  rls_enabled BOOLEAN;
BEGIN
  SELECT relrowsecurity INTO rls_enabled
  FROM pg_class
  WHERE relname = 'notifications';

  IF rls_enabled THEN
    RAISE NOTICE 'notifications RLS 활성화됨 - SELECT 정책 확인 필요';
  ELSE
    RAISE NOTICE 'notifications RLS 비활성화됨 - Realtime 정상 작동 예상';
  END IF;
END $$;

-- 7. notifications SELECT 정책이 없으면 추가 (Realtime은 RLS를 따름)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'notifications' AND cmd = 'SELECT'
  ) THEN
    CREATE POLICY "notifications_select_all" ON notifications
      FOR SELECT USING (true);
    RAISE NOTICE '✅ notifications SELECT 정책 추가';
  ELSE
    RAISE NOTICE '✅ notifications SELECT 정책 이미 존재';
  END IF;
END $$;

SELECT
  '전자결재 알림 지원 설정 완료' as status,
  '다음을 Supabase Dashboard에서 확인하세요:' as action,
  'Database > Replication > notifications 테이블 Realtime 활성화' as realtime_check;
