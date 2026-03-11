-- AS 건 사업장 주소/담당자/연락처 필드 추가 (타업체 사업장 입력용)
-- 블루온 사업장은 business_info에서 JOIN하여 표시
-- 타업체 사업장은 이 필드에 직접 저장

ALTER TABLE as_records
  ADD COLUMN IF NOT EXISTS site_address TEXT,
  ADD COLUMN IF NOT EXISTS site_manager VARCHAR(100),
  ADD COLUMN IF NOT EXISTS site_contact VARCHAR(50);

COMMENT ON COLUMN as_records.site_address IS '타업체 사업장 주소 (블루온 사업장은 business_info.address 사용)';
COMMENT ON COLUMN as_records.site_manager IS '타업체 사업장 담당자 (블루온 사업장은 business_info.manager_name 사용)';
COMMENT ON COLUMN as_records.site_contact IS '타업체 사업장 연락처 (블루온 사업장은 business_info.manager_contact 사용)';
