-- 관리책임자 필드 추가 (admin_manager_id + admin_manager_name)
-- admin_manager_id : employees 테이블 FK (퇴사 시 SET NULL)
-- admin_manager_name: 이름 캐시 — 퇴사 후에도 표시 가능, 엑셀 업로드 fallback

ALTER TABLE business_info
  ADD COLUMN IF NOT EXISTS admin_manager_id   UUID REFERENCES employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS admin_manager_name VARCHAR(100);

-- 인덱스 (관리책임자 기준 필터링·정렬 대비)
CREATE INDEX IF NOT EXISTS idx_business_info_admin_manager_id
  ON business_info(admin_manager_id)
  WHERE admin_manager_id IS NOT NULL;

COMMENT ON COLUMN business_info.admin_manager_id   IS '관리책임자 직원 UUID (employees.id 참조, 퇴사 시 NULL)';
COMMENT ON COLUMN business_info.admin_manager_name IS '관리책임자 이름 캐시 — 퇴사 후에도 이름 유지, 엑셀 업로드 fallback';
