-- ============================================
-- 회의록 부서 목록 테이블 생성
-- 부서 목록을 DB에 저장하여 모든 환경에서 공유
-- ============================================

CREATE TABLE IF NOT EXISTS meeting_departments (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- 정렬 순서 인덱스
CREATE INDEX IF NOT EXISTS idx_meeting_departments_sort ON meeting_departments (sort_order, created_at);

-- RLS 비활성화 (서비스 롤 키 사용)
ALTER TABLE meeting_departments DISABLE ROW LEVEL SECURITY;

-- 확인 쿼리
SELECT 'meeting_departments 테이블 생성 완료' AS status;
