-- ============================================================
-- Realtime Publication 설정 전 테이블 존재 여부 확인
-- ============================================================
-- 목적: SQL 실행 전에 각 테이블이 실제로 존재하는지 확인
-- ============================================================

-- 코드에서 사용 중인 Realtime 테이블 목록 확인
SELECT
  table_name,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name = t.table_name
    ) THEN '✅ 존재함'
    ELSE '❌ 테이블 없음'
  END as status,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
      AND tablename = t.table_name
    ) THEN '✅ Publication 설정됨'
    ELSE '⚠️ Publication 미설정'
  END as publication_status
FROM (
  VALUES
    ('uploaded_files'),
    ('employees'),
    ('social_login_approvals'),
    ('user_login_history'),
    ('business_memos'),
    ('task_notifications')
) AS t(table_name)
ORDER BY table_name;

-- ============================================================
-- 해석 가이드:
-- ============================================================
-- ✅ 존재함 + ✅ Publication 설정됨 → 정상 작동 중
-- ✅ 존재함 + ⚠️ Publication 미설정 → SQL 실행 필요
-- ❌ 테이블 없음 + ⚠️ Publication 미설정 → 코드 수정 또는 테이블 생성 필요
-- ============================================================
