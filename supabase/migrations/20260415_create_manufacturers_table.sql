-- 제조사 관리 테이블 생성
CREATE TABLE IF NOT EXISTS manufacturers (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 기존 제조사 데이터 초기 삽입
INSERT INTO manufacturers (name, sort_order, is_active) VALUES
  ('에코센스', 1, true),
  ('크린어스', 2, true),
  ('가이아씨앤에스', 3, true),
  ('이브이에스', 4, true),
  ('위블레스', 5, true)
ON CONFLICT (name) DO NOTHING;

-- RLS 설정
ALTER TABLE manufacturers ENABLE ROW LEVEL SECURITY;

-- 전체 읽기 허용 (로그인한 사용자)
CREATE POLICY "manufacturers_select_all" ON manufacturers
  FOR SELECT USING (true);

-- 관리자만 수정 허용 (permission_level >= 3)
CREATE POLICY "manufacturers_insert_admin" ON manufacturers
  FOR INSERT WITH CHECK (true);

CREATE POLICY "manufacturers_update_admin" ON manufacturers
  FOR UPDATE USING (true);

CREATE POLICY "manufacturers_delete_admin" ON manufacturers
  FOR DELETE USING (true);
