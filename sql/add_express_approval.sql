-- 전결(專決) 기능 추가 마이그레이션
-- 중역(executive role) 이 결재선의 나머지 단계를 건너뛰고 즉시 최종 완료 처리하는 기능

-- 1. approval_documents 테이블: 전결 관련 컬럼 추가
ALTER TABLE approval_documents
  ADD COLUMN IF NOT EXISTS is_express_approved  BOOLEAN     DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS express_approved_by  UUID        REFERENCES employees(id),
  ADD COLUMN IF NOT EXISTS express_approved_at  TIMESTAMPTZ;

COMMENT ON COLUMN approval_documents.is_express_approved IS '전결 처리 여부 (true = 전결로 완료)';
COMMENT ON COLUMN approval_documents.express_approved_by IS '전결 처리한 중역 ID';
COMMENT ON COLUMN approval_documents.express_approved_at IS '전결 처리 시각';

-- 2. approval_steps 테이블: 건너뜀 사유 컬럼 추가
ALTER TABLE approval_steps
  ADD COLUMN IF NOT EXISTS skipped_reason VARCHAR(30) DEFAULT NULL;

COMMENT ON COLUMN approval_steps.skipped_reason IS '건너뜀 사유: express_approval = 전결로 건너뜀';

-- 3. 인덱스: 전결 처리된 문서 조회용
CREATE INDEX IF NOT EXISTS idx_approval_docs_express
  ON approval_documents(express_approved_by)
  WHERE is_express_approved = TRUE;
