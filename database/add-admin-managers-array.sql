-- 관리책임자 복수 지정 지원을 위한 JSONB 배열 컬럼 추가
-- 기존 admin_manager_id / admin_manager_name 두 컬럼을 대체

ALTER TABLE business_info
  ADD COLUMN IF NOT EXISTS admin_managers JSONB NOT NULL DEFAULT '[]'::jsonb;

-- 기존 단일 값 데이터를 배열로 마이그레이션
UPDATE business_info
SET admin_managers = jsonb_build_array(
  jsonb_build_object(
    'id',   COALESCE(admin_manager_id::text, ''),
    'name', COALESCE(admin_manager_name, '')
  )
)
WHERE admin_manager_name IS NOT NULL
  AND admin_manager_name != ''
  AND admin_managers = '[]'::jsonb;

-- GIN 인덱스: admin_managers 배열 내부 조회 최적화
CREATE INDEX IF NOT EXISTS idx_business_info_admin_managers
  ON business_info USING gin (admin_managers);

-- (선택) 기존 단일 컬럼은 하위 호환을 위해 남겨두거나 제거 가능
-- ALTER TABLE business_info DROP COLUMN admin_manager_id;
-- ALTER TABLE business_info DROP COLUMN admin_manager_name;
