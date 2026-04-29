-- 업무단계 관리 테이블
CREATE TABLE IF NOT EXISTS task_stages (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  progress_category_id INTEGER NOT NULL REFERENCES progress_categories(id) ON DELETE CASCADE,
  stage_key            VARCHAR(100) NOT NULL,  -- 기존 status 코드 (예: self_customer_contact)
  stage_label          VARCHAR(100) NOT NULL,  -- 한글 표시명
  sort_order           INTEGER      NOT NULL DEFAULT 0,
  is_active            BOOLEAN      NOT NULL DEFAULT true,
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE(progress_category_id, stage_key)
);

-- RLS
ALTER TABLE task_stages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "task_stages_read_all"
  ON task_stages FOR SELECT USING (true);

CREATE POLICY "task_stages_admin_write"
  ON task_stages FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM employees
      WHERE id = auth.uid() AND permission_level >= 3 AND is_active = true
    )
  );

-- updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_task_stages_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER task_stages_updated_at
  BEFORE UPDATE ON task_stages
  FOR EACH ROW EXECUTE FUNCTION update_task_stages_updated_at();

-- Supabase Realtime 등록
ALTER PUBLICATION supabase_realtime ADD TABLE task_stages;
ALTER PUBLICATION supabase_realtime ADD TABLE manufacturers;
ALTER PUBLICATION supabase_realtime ADD TABLE progress_categories;
