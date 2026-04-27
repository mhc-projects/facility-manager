-- 엠즈 임포트 시 vendor가 'fujino'로 잘못 저장된 문제 수정
-- 1) dpf_import_staging의 vendor='mz' VIN들을 dpf_vehicles에서 'mz'로 정정
-- 2) process_dpf_staging 함수가 vendor를 올바르게 INSERT/UPDATE하도록 교체

-- ① 기존 잘못 저장된 데이터 수정
UPDATE dpf_vehicles v
SET vendor = 'mz',
    updated_at = NOW()
WHERE v.vin IN (
  SELECT DISTINCT vin
  FROM dpf_import_staging
  WHERE vendor = 'mz'
    AND vin IS NOT NULL
    AND vin <> ''
);

-- ② process_dpf_staging 함수 교체 (vendor 포함)
CREATE OR REPLACE FUNCTION process_dpf_staging(p_batch_id UUID)
RETURNS TABLE (processed_count int, error_count int)
LANGUAGE plpgsql AS $$
DECLARE
  v_processed int := 0;
  v_errors    int := 0;
BEGIN
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
