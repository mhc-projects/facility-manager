-- ============================================================
-- notifications 테이블 Supabase Realtime 완전 설정
-- 반려/승인 알림 실시간 전달 문제 해결
-- ============================================================

-- 1. REPLICA IDENTITY FULL 설정 (변경 전 전체 행 정보 전달)
ALTER TABLE notifications REPLICA IDENTITY FULL;

-- 2. supabase_realtime publication에 notifications 테이블 추가
--    (이미 추가된 경우 오류 무시)
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
    RAISE NOTICE '✅ notifications 테이블이 supabase_realtime publication에 추가됨';
  EXCEPTION
    WHEN duplicate_object THEN
      RAISE NOTICE '⚠️ notifications 테이블이 이미 publication에 존재함 (정상)';
    WHEN others THEN
      RAISE NOTICE '❌ 오류: %', SQLERRM;
  END;
END $$;

-- 3. RLS 정책 확인 및 재설정
--    anon role이 Realtime 이벤트를 받으려면 SELECT 정책이 필요
DROP POLICY IF EXISTS "notifications_read_all" ON notifications;
CREATE POLICY "notifications_read_all" ON notifications
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "notifications_insert" ON notifications;
CREATE POLICY "notifications_insert" ON notifications
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "notifications_update" ON notifications;
CREATE POLICY "notifications_update" ON notifications
  FOR UPDATE USING (true);

-- 4. 현재 상태 확인
SELECT
  tablename,
  '✅ Realtime 활성화됨' as realtime_status
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
  AND tablename = 'notifications';

-- 5. RLS 정책 확인
SELECT policyname, cmd, qual
FROM pg_policies
WHERE tablename = 'notifications'
ORDER BY cmd, policyname;

-- 결과: notifications 행이 1개 나와야 Realtime 작동
-- 결과가 없으면 publication 등록이 안 된 것 → 위 SQL 재실행 필요
