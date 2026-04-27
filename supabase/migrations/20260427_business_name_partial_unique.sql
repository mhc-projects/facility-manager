-- business_name unique constraint를 partial unique index로 교체
-- 기존 제약: ALL rows (is_deleted=true 포함)
-- 변경 후: is_deleted=false 행에만 적용 (soft-delete된 이름 재사용 가능)

-- 1. 기존 unique constraint 제거
ALTER TABLE business_info DROP CONSTRAINT IF EXISTS business_info_business_name_key;

-- 2. partial unique index 생성 (활성 행에만 적용)
CREATE UNIQUE INDEX IF NOT EXISTS business_info_business_name_active_unique
  ON business_info (business_name)
  WHERE is_deleted = false;
