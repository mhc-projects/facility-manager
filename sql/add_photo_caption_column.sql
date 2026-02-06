-- ============================================================
-- 사진 설명(Caption) 기능 추가
-- ============================================================
-- 작성일: 2026-02-05
-- 목적: uploaded_files 테이블에 caption 컬럼 추가
--
-- 실행 방법:
-- 1. Supabase Dashboard 접속
-- 2. SQL Editor 메뉴 이동
-- 3. 이 스크립트를 복사하여 실행
-- ============================================================

-- ============================================================
-- 1. caption 컬럼 추가
-- ============================================================

ALTER TABLE uploaded_files
ADD COLUMN IF NOT EXISTS caption TEXT;

COMMENT ON COLUMN uploaded_files.caption IS '사진에 대한 설명 (최대 500자)';

-- ============================================================
-- 2. Full-text search 인덱스 추가 (검색 최적화)
-- ============================================================

-- GIN 인덱스로 빠른 텍스트 검색 지원
CREATE INDEX IF NOT EXISTS idx_uploaded_files_caption_fts
ON uploaded_files
USING gin(to_tsvector('simple', COALESCE(caption, '')));

COMMENT ON INDEX idx_uploaded_files_caption_fts IS 'Caption 전체 텍스트 검색용 인덱스';

-- ============================================================
-- 3. updated_at 컬럼 추가 (변경 이력 트래킹)
-- ============================================================

-- updated_at 컬럼이 없다면 추가
ALTER TABLE uploaded_files
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

COMMENT ON COLUMN uploaded_files.updated_at IS '마지막 수정 시간';

-- ============================================================
-- 4. updated_at 자동 갱신 트리거
-- ============================================================

-- 트리거 함수 생성
CREATE OR REPLACE FUNCTION update_uploaded_files_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 기존 트리거 삭제 (있다면)
DROP TRIGGER IF EXISTS trigger_uploaded_files_updated_at ON uploaded_files;

-- 새 트리거 생성
CREATE TRIGGER trigger_uploaded_files_updated_at
  BEFORE UPDATE ON uploaded_files
  FOR EACH ROW
  EXECUTE FUNCTION update_uploaded_files_updated_at();

COMMENT ON TRIGGER trigger_uploaded_files_updated_at ON uploaded_files IS 'Caption 수정 시 updated_at 자동 갱신';

-- ============================================================
-- 5. 검증: 컬럼 확인
-- ============================================================

SELECT
  column_name,
  data_type,
  is_nullable,
  column_default,
  character_maximum_length
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'uploaded_files'
  AND column_name IN ('caption', 'updated_at')
ORDER BY ordinal_position;

-- 예상 결과:
-- column_name | data_type | is_nullable | column_default | character_maximum_length
-- ------------+-----------+-------------+----------------+-------------------------
-- caption     | text      | YES         | NULL           | NULL
-- updated_at  | timestamp | YES         | now()          | NULL

-- ============================================================
-- 6. 검증: 인덱스 확인
-- ============================================================

SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'uploaded_files'
  AND indexname LIKE '%caption%';

-- 예상 결과:
-- indexname                         | indexdef
-- ----------------------------------+------------------------------------------
-- idx_uploaded_files_caption_fts    | CREATE INDEX ... USING gin(to_tsvector...)

-- ============================================================
-- 7. 샘플 데이터 테스트 (선택사항)
-- ============================================================

-- 샘플 caption 업데이트 (테스트용)
-- UPDATE uploaded_files
-- SET caption = '집진기 필터 교체 전 상태'
-- WHERE id = 'your-file-id-here';

-- Caption 검색 테스트
-- SELECT id, filename, caption
-- FROM uploaded_files
-- WHERE to_tsvector('simple', COALESCE(caption, '')) @@ to_tsquery('simple', '필터')
-- LIMIT 10;

-- ============================================================
-- 완료
-- ============================================================
-- 다음 단계:
-- 1. API 엔드포인트 구현 (PATCH /api/uploaded-files-supabase/[id]/caption)
-- 2. TypeScript 인터페이스 업데이트 (UploadedFile.caption)
-- 3. UI 컴포넌트 개발 (PhotoCaptionInput)
-- 4. 실시간 동기화 테스트
-- ============================================================
