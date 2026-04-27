-- process_dpf_staging 함수를 벌크 UPSERT로 교체
-- 기존: 행 단위 루프 (18,000행 × 개별 INSERT = timeout)
-- 변경: 단일 INSERT ... ON CONFLICT 벌크 처리

CREATE OR REPLACE FUNCTION process_dpf_staging(p_batch_id UUID)
RETURNS TABLE (
  processed_count int,
  error_count     int
)
LANGUAGE plpgsql AS $$
DECLARE
  v_processed int := 0;
  v_errors    int := 0;
BEGIN
  -- 벌크 UPSERT: 스테이징 → dpf_vehicles
  INSERT INTO dpf_vehicles (
    vin, plate_number, vehicle_name,
    owner_name, owner_address, owner_contact,
    local_government, device_serial, installation_date,
    raw_data
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
      WHEN raw_data->>'installation_date' IS NOT NULL
           AND raw_data->>'installation_date' <> ''
      THEN (raw_data->>'installation_date')::DATE
      ELSE NULL
    END,
    COALESCE(raw_data->'raw_data', '{}'::jsonb)
  FROM dpf_import_staging
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
    raw_data          = EXCLUDED.raw_data,
    updated_at        = NOW();

  GET DIAGNOSTICS v_processed = ROW_COUNT;

  -- 처리된 행 상태 업데이트 (bulk)
  UPDATE dpf_import_staging
  SET status = 'done'
  WHERE import_batch_id = p_batch_id
    AND status = 'pending'
    AND raw_data->>'vin' IS NOT NULL
    AND raw_data->>'vin' <> '';

  -- VIN 없는 행은 skip 처리
  UPDATE dpf_import_staging
  SET status = 'error',
      error_message = 'VIN 없음'
  WHERE import_batch_id = p_batch_id
    AND status = 'pending';

  RETURN QUERY SELECT v_processed, v_errors;
END;
$$;
