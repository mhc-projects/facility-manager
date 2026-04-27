-- dpf_vehicles / dpf_import_staging에 vendor 컬럼 추가
-- vendor: 'fujino' (후지노, 사후관리+설치) | 'mz' (엠즈, 사후관리만)

ALTER TABLE dpf_vehicles
  ADD COLUMN IF NOT EXISTS vendor VARCHAR(20) NOT NULL DEFAULT 'fujino'
  CHECK (vendor IN ('fujino', 'mz'));

ALTER TABLE dpf_import_staging
  ADD COLUMN IF NOT EXISTS vendor VARCHAR(20) NOT NULL DEFAULT 'fujino';

CREATE INDEX IF NOT EXISTS idx_dpf_vehicles_vendor ON dpf_vehicles(vendor);

-- 벤더 + VIN 포함 벌크 UPSERT 함수 교체
CREATE OR REPLACE FUNCTION process_dpf_staging(p_batch_id UUID)
RETURNS TABLE (processed_count int, error_count int)
LANGUAGE plpgsql AS $$
DECLARE
  v_processed int := 0;
  v_errors    int := 0;
  v_vendor    VARCHAR(20);
BEGIN
  -- 배치의 벤더 값 조회 (모든 행 동일)
  SELECT vendor INTO v_vendor
  FROM dpf_import_staging
  WHERE import_batch_id = p_batch_id LIMIT 1;

  INSERT INTO dpf_vehicles (
    vin, plate_number, vehicle_name,
    owner_name, owner_address, owner_contact,
    local_government, device_serial, installation_date,
    vendor, raw_data
  )
  SELECT DISTINCT ON (SUBSTRING(raw_data->>'vin', 1, 20))
    SUBSTRING(raw_data->>'vin', 1, 20),
    COALESCE(SUBSTRING(raw_data->>'plate_number', 1, 50), ''),
    raw_data->>'vehicle_name',
    raw_data->>'owner_name',
    raw_data->>'owner_address',
    raw_data->>'owner_contact',
    raw_data->>'local_government',
    raw_data->>'device_serial',
    CASE
      WHEN raw_data->>'installation_date' IS NOT NULL AND raw_data->>'installation_date' <> ''
      THEN (raw_data->>'installation_date')::DATE
      ELSE NULL
    END,
    COALESCE(s.vendor, 'fujino'),
    COALESCE(raw_data->'raw_data', '{}'::jsonb)
  FROM dpf_import_staging s
  WHERE import_batch_id = p_batch_id
    AND status = 'pending'
    AND raw_data->>'vin' IS NOT NULL
    AND raw_data->>'vin' <> ''
  ORDER BY SUBSTRING(raw_data->>'vin', 1, 20), row_index DESC
  ON CONFLICT (vin) DO UPDATE SET
    plate_number      = EXCLUDED.plate_number,
    vehicle_name      = EXCLUDED.vehicle_name,
    owner_name        = EXCLUDED.owner_name,
    owner_address     = EXCLUDED.owner_address,
    owner_contact     = EXCLUDED.owner_contact,
    local_government  = EXCLUDED.local_government,
    device_serial     = EXCLUDED.device_serial,
    installation_date = EXCLUDED.installation_date,
    vendor            = EXCLUDED.vendor,
    raw_data          = EXCLUDED.raw_data,
    updated_at        = NOW();

  GET DIAGNOSTICS v_processed = ROW_COUNT;

  UPDATE dpf_import_staging SET status = 'done'
  WHERE import_batch_id = p_batch_id AND status = 'pending'
    AND raw_data->>'vin' IS NOT NULL AND raw_data->>'vin' <> '';

  UPDATE dpf_import_staging SET status = 'error', error_message = 'VIN 없음'
  WHERE import_batch_id = p_batch_id AND status = 'pending';

  RETURN QUERY SELECT v_processed, v_errors;
END;
$$;
