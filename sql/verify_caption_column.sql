-- ============================================================
-- Caption 컬럼 존재 여부 확인
-- ============================================================

-- 1. uploaded_files 테이블의 caption 컬럼 확인
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'uploaded_files'
  AND column_name = 'caption';

-- 예상 결과: caption 컬럼이 있어야 함
-- column_name | data_type | is_nullable | column_default
-- ------------+-----------+-------------+----------------
-- caption     | text      | YES         | NULL

-- 2. 실제 데이터 확인 (최근 10개 파일의 caption)
SELECT
  id,
  filename,
  original_filename,
  caption,
  created_at
FROM uploaded_files
ORDER BY created_at DESC
LIMIT 10;

-- 3. Caption이 있는 파일 개수 확인
SELECT
  COUNT(*) as total_files,
  COUNT(caption) as files_with_caption,
  COUNT(*) - COUNT(caption) as files_without_caption
FROM uploaded_files;
