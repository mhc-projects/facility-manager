-- approval_documents, approval_steps 테이블 Realtime 활성화
ALTER TABLE approval_documents REPLICA IDENTITY FULL;
ALTER TABLE approval_steps REPLICA IDENTITY FULL;

-- Supabase Realtime publication에 테이블 추가
-- (이미 추가된 경우 오류 무시)
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE approval_documents;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE approval_steps;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

SELECT 'approval_documents, approval_steps Realtime 설정 완료' AS status;
