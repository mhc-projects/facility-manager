-- 결재완료 문서 처리확인 기능을 위한 필드 추가
-- 경영지원부 또는 권한4 사용자가 결재 완료된 문서를 확인 처리할 수 있는 기능

ALTER TABLE approval_documents
  ADD COLUMN IF NOT EXISTS is_processed       BOOLEAN       DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS processed_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS processed_by       UUID          REFERENCES employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS processed_by_name  VARCHAR(100),
  ADD COLUMN IF NOT EXISTS process_note       TEXT;

-- 결재완료 탭 쿼리 성능을 위한 인덱스
CREATE INDEX IF NOT EXISTS idx_approval_docs_completed_tab
  ON approval_documents(status, is_deleted, completed_at DESC)
  WHERE status = 'approved' AND is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_approval_docs_processed
  ON approval_documents(is_processed, status)
  WHERE status = 'approved' AND is_deleted = FALSE;

-- 컬럼 주석
COMMENT ON COLUMN approval_documents.is_processed IS '경영지원부/권한4 사용자의 처리확인 여부';
COMMENT ON COLUMN approval_documents.processed_at IS '처리확인 완료 일시';
COMMENT ON COLUMN approval_documents.processed_by IS '처리확인한 직원 ID';
COMMENT ON COLUMN approval_documents.processed_by_name IS '처리확인한 직원 이름 (비정규화)';
COMMENT ON COLUMN approval_documents.process_note IS '처리 메모 (선택)';
