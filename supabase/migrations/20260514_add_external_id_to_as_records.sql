-- as_records에 외부 시스템 ID 컬럼 추가
-- 에코센스 등 외부 시스템에서 자체 ID를 전달하면 중복 방지(upsert) 가능
-- external_id가 없으면 기존 방식(INSERT)으로 동작

ALTER TABLE as_records
  ADD COLUMN IF NOT EXISTS external_id VARCHAR(200) DEFAULT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_as_records_external_id
  ON as_records(external_id)
  WHERE external_id IS NOT NULL;

COMMENT ON COLUMN as_records.external_id IS '외부 시스템(에코센스 등) 자체 ID. 제공 시 upsert로 중복 방지.';
