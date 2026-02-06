-- ============================================================
-- Supabase Realtime Publication 최종 설정
-- ============================================================
-- 작성일: 2026-02-05
-- 기준: check_realtime_tables_exist.sql 실행 결과
--
-- 설정 대상 (존재하는 테이블만):
-- 1. business_memos ✅
-- 2. employees ✅
-- 3. task_notifications ✅
--
-- 제외:
-- - uploaded_files (이미 설정됨)
-- - social_login_approvals (테이블 없음 + 기능 불필요)
-- - user_login_history (테이블 없음)
-- ============================================================

-- business_memos (사업장 메모)
-- 위치: app/admin/business/page.tsx:1223
ALTER PUBLICATION supabase_realtime ADD TABLE business_memos;

-- employees (직원 관리)
-- 위치: app/admin/users/page.tsx:858
ALTER PUBLICATION supabase_realtime ADD TABLE employees;

-- task_notifications (작업 알림)
-- 위치: contexts/NotificationContext.tsx:136
ALTER PUBLICATION supabase_realtime ADD TABLE task_notifications;

-- ============================================================
-- 검증: 설정된 테이블 확인
-- ============================================================
SELECT
  tablename,
  '✅ Publication 설정됨' as status
FROM
  pg_publication_tables
WHERE
  pubname = 'supabase_realtime'
  AND tablename IN (
    'uploaded_files',
    'business_memos',
    'employees',
    'task_notifications'
  )
ORDER BY
  tablename;

-- 예상 결과 (4개):
-- business_memos
-- employees
-- task_notifications
-- uploaded_files

-- ============================================================
-- 완료
-- ============================================================
