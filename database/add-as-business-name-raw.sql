-- AS 관리 - 미등록 사업장 지원을 위한 스키마 변경
-- Created: 2026-03-10

-- 1. business_name_raw 컬럼 추가 (business_info 미등록 사업장명 직접 저장)
ALTER TABLE as_records
ADD COLUMN IF NOT EXISTS business_name_raw VARCHAR(300);

-- 2. business_id NOT NULL 제약 제거 (미등록 사업장도 저장 가능)
ALTER TABLE as_records
ALTER COLUMN business_id DROP NOT NULL;

-- 3. 기존 데이터 마이그레이션: business_id가 있으면 business_name_raw 불필요 (NULL 유지)

-- 4. 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_as_records_business_name_raw ON as_records(business_name_raw) WHERE is_deleted = false AND business_name_raw IS NOT NULL;

COMMENT ON COLUMN as_records.business_id IS 'business_info에 등록된 사업장 연결 (선택). 미등록 사업장은 NULL';
COMMENT ON COLUMN as_records.business_name_raw IS 'business_info에 없는 사업장명 직접 입력. business_id가 있으면 NULL';

-- 5. as_manager_contact 컬럼 길이 확장 (VARCHAR(50) → VARCHAR(200))
--    엑셀 셀에 여러 연락처가 줄바꿈으로 입력된 경우를 대비
ALTER TABLE as_records
ALTER COLUMN as_manager_contact TYPE VARCHAR(200);
