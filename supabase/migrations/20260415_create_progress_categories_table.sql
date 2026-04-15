-- 진행구분 관리 테이블 생성
CREATE TABLE IF NOT EXISTS progress_categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 기존 진행구분 데이터 초기 삽입
INSERT INTO progress_categories (name, sort_order, is_active) VALUES
  ('자비', 1, true),
  ('보조금', 2, true),
  ('보조금 동시진행', 3, true),
  ('보조금 추가승인', 4, true),
  ('대리점', 5, true),
  ('외주설치', 6, true),
  ('AS', 7, true),
  ('진행불가', 8, true),
  ('확인필요', 9, true)
ON CONFLICT (name) DO NOTHING;

-- RLS 설정
ALTER TABLE progress_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "progress_categories_select_all" ON progress_categories
  FOR SELECT USING (true);

CREATE POLICY "progress_categories_insert_admin" ON progress_categories
  FOR INSERT WITH CHECK (true);

CREATE POLICY "progress_categories_update_admin" ON progress_categories
  FOR UPDATE USING (true);

CREATE POLICY "progress_categories_delete_admin" ON progress_categories
  FOR DELETE USING (true);
