-- Migration: 개발 업무 일지 테이블 생성
-- Created: 2026-03-25

CREATE TABLE IF NOT EXISTS dev_work_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'feature'
    CHECK (type IN ('feature', 'bugfix', 'infra', 'other')),
  priority TEXT NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('high', 'medium', 'low')),
  status TEXT NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress', 'completed', 'on_hold', 'cancelled')),
  description TEXT,
  received_date DATE NOT NULL,
  expected_date DATE,
  completed_date DATE,
  assignee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  progress_notes JSONB DEFAULT '[]'::jsonb,
  progress_percent INTEGER DEFAULT 0 CHECK (progress_percent BETWEEN 0 AND 100),
  created_by UUID REFERENCES employees(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 자동 updated_at 업데이트 트리거
CREATE OR REPLACE FUNCTION update_dev_work_log_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER dev_work_log_updated_at
  BEFORE UPDATE ON dev_work_log
  FOR EACH ROW
  EXECUTE FUNCTION update_dev_work_log_updated_at();

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_dev_work_log_status ON dev_work_log(status);
CREATE INDEX IF NOT EXISTS idx_dev_work_log_assignee ON dev_work_log(assignee_id);
CREATE INDEX IF NOT EXISTS idx_dev_work_log_received_date ON dev_work_log(received_date DESC);
CREATE INDEX IF NOT EXISTS idx_dev_work_log_created_by ON dev_work_log(created_by);

-- RLS 비활성화 (서비스 롤 키로 접근)
ALTER TABLE dev_work_log DISABLE ROW LEVEL SECURITY;

COMMENT ON TABLE dev_work_log IS '개발부서 전용 업무 일지';
COMMENT ON COLUMN dev_work_log.type IS 'feature=기능개발, bugfix=버그수정, infra=인프라, other=기타';
COMMENT ON COLUMN dev_work_log.priority IS 'high=높음, medium=보통, low=낮음';
COMMENT ON COLUMN dev_work_log.status IS 'in_progress=진행중, completed=완료, on_hold=보류, cancelled=취소';
COMMENT ON COLUMN dev_work_log.progress_notes IS '[{note: string, created_at: ISO string, author_name: string}]';
