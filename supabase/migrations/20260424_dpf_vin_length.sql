-- dpf_vehicles 컬럼 길이 확장
-- vin: 17 → 20 (비표준 VIN 허용)
ALTER TABLE dpf_vehicles ALTER COLUMN vin TYPE VARCHAR(20);
ALTER TABLE dpf_import_staging ALTER COLUMN vin TYPE VARCHAR(20);

-- plate_number: 20 → 50 (지역+번호 합산 포맷 허용)
ALTER TABLE dpf_vehicles ALTER COLUMN plate_number TYPE VARCHAR(50);
ALTER TABLE dpf_vehicle_plate_history ALTER COLUMN plate_number TYPE VARCHAR(50);
