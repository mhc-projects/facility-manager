-- ============================================================
-- notifications 테이블 RLS + Realtime 완전 수정
-- Supabase SQL Editor에서 실행
-- ============================================================

-- 1. RLS 활성화 확인
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- 2. 기존 SELECT 정책 모두 제거 후 재생성
DROP POLICY IF EXISTS "notifications_select_all" ON notifications;
DROP POLICY IF EXISTS "notifications_select" ON notifications;
DROP POLICY IF EXISTS "allow_select_notifications" ON notifications;

-- 3. 모든 인증 사용자가 읽을 수 있는 SELECT 정책 (Realtime 작동 필수)
CREATE POLICY "notifications_select_all" ON notifications
  FOR SELECT USING (true);

-- 4. INSERT 정책 (없으면 추가)
DROP POLICY IF EXISTS "notifications_insert" ON notifications;
CREATE POLICY "notifications_insert" ON notifications
  FOR INSERT WITH CHECK (true);

-- 5. REPLICA IDENTITY FULL 재확인 (Realtime이 전체 row 전송하려면 필요)
ALTER TABLE notifications REPLICA IDENTITY FULL;

-- 6. 결과 확인
SELECT
  policyname,
  cmd,
  qual
FROM pg_policies
WHERE tablename = 'notifications'
ORDER BY cmd;
