-- business_memos 테이블 Realtime 활성화
-- Supabase 대시보드 SQL Editor에서 실행하거나 supabase db push로 적용

-- 1. business_memos 테이블을 supabase_realtime publication에 추가
ALTER PUBLICATION supabase_realtime ADD TABLE business_memos;

-- 2. REPLICA IDENTITY FULL 설정 (DELETE 이벤트에서 old row 데이터 포함)
ALTER TABLE business_memos REPLICA IDENTITY FULL;

-- 3. 활성화 확인
SELECT schemaname, tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
  AND tablename = 'business_memos';
