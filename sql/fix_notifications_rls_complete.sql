-- ============================================================
-- notifications RLS 완전 수정
-- authenticated role이 personal 알림을 받을 수 있도록
-- ============================================================

-- 기존 정책 모두 제거
DROP POLICY IF EXISTS "Users can view company notifications" ON notifications;
DROP POLICY IF EXISTS "Users can view personal notifications" ON notifications;
DROP POLICY IF EXISTS "Users can view team notifications" ON notifications;
DROP POLICY IF EXISTS "anon_select_access" ON notifications;
DROP POLICY IF EXISTS "notifications_select_all" ON notifications;
DROP POLICY IF EXISTS "notifications_select" ON notifications;
DROP POLICY IF EXISTS "allow_select_notifications" ON notifications;

-- 단일 SELECT 정책: 모든 role이 읽기 가능 (Realtime 작동 보장)
CREATE POLICY "notifications_read_all" ON notifications
  FOR SELECT USING (true);

-- INSERT 정책 (없으면 추가)
DROP POLICY IF EXISTS "notifications_insert" ON notifications;
CREATE POLICY "notifications_insert" ON notifications
  FOR INSERT WITH CHECK (true);

-- UPDATE 정책
DROP POLICY IF EXISTS "notifications_update" ON notifications;
CREATE POLICY "notifications_update" ON notifications
  FOR UPDATE USING (true);

-- REPLICA IDENTITY FULL 재확인
ALTER TABLE notifications REPLICA IDENTITY FULL;

-- 결과 확인
SELECT policyname, cmd, qual
FROM pg_policies
WHERE tablename = 'notifications'
ORDER BY cmd, policyname;
