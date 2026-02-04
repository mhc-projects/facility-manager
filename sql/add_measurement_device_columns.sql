-- Add measurement device columns to discharge_facilities and prevention_facilities tables
-- This fixes the schema mismatch where INSERT statements include these columns but they don't exist in the database
-- Date: 2026-02-04

-- ============================================================================
-- 1. Add measurement device columns to discharge_facilities table
-- ============================================================================

-- 배출CT 개수
ALTER TABLE discharge_facilities
ADD COLUMN IF NOT EXISTS discharge_ct INTEGER;

-- 면제사유
ALTER TABLE discharge_facilities
ADD COLUMN IF NOT EXISTS exemption_reason TEXT;

-- 비고
ALTER TABLE discharge_facilities
ADD COLUMN IF NOT EXISTS remarks TEXT;

-- ============================================================================
-- 2. Add measurement device columns to prevention_facilities table
-- ============================================================================

-- pH계 개수
ALTER TABLE prevention_facilities
ADD COLUMN IF NOT EXISTS ph INTEGER;

-- 차압계 개수
ALTER TABLE prevention_facilities
ADD COLUMN IF NOT EXISTS pressure INTEGER;

-- 온도계 개수
ALTER TABLE prevention_facilities
ADD COLUMN IF NOT EXISTS temperature INTEGER;

-- 펌프CT 개수
ALTER TABLE prevention_facilities
ADD COLUMN IF NOT EXISTS pump INTEGER;

-- 송풍CT 개수
ALTER TABLE prevention_facilities
ADD COLUMN IF NOT EXISTS fan INTEGER;

-- 비고
ALTER TABLE prevention_facilities
ADD COLUMN IF NOT EXISTS remarks TEXT;

-- ============================================================================
-- 3. Add column comments for documentation
-- ============================================================================

COMMENT ON COLUMN discharge_facilities.discharge_ct IS '배출CT 개수';
COMMENT ON COLUMN discharge_facilities.exemption_reason IS '측정기기 면제사유';
COMMENT ON COLUMN discharge_facilities.remarks IS '비고(특이사항)';

COMMENT ON COLUMN prevention_facilities.ph IS 'pH계 개수';
COMMENT ON COLUMN prevention_facilities.pressure IS '차압계 개수';
COMMENT ON COLUMN prevention_facilities.temperature IS '온도계 개수';
COMMENT ON COLUMN prevention_facilities.pump IS '펌프CT 개수';
COMMENT ON COLUMN prevention_facilities.fan IS '송풍CT 개수';
COMMENT ON COLUMN prevention_facilities.remarks IS '비고(특이사항)';

-- ============================================================================
-- 4. Verification queries
-- ============================================================================

-- Verify discharge_facilities columns
SELECT
  column_name,
  data_type,
  column_default,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'discharge_facilities'
  AND column_name IN ('discharge_ct', 'exemption_reason', 'remarks')
ORDER BY column_name;

-- Verify prevention_facilities columns
SELECT
  column_name,
  data_type,
  column_default,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'prevention_facilities'
  AND column_name IN ('ph', 'pressure', 'temperature', 'pump', 'fan', 'remarks')
ORDER BY column_name;

-- ============================================================================
-- Migration complete
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ discharge_facilities 테이블에 측정기기 컬럼 추가 완료';
  RAISE NOTICE '   - discharge_ct: 배출CT 개수';
  RAISE NOTICE '   - exemption_reason: 면제사유';
  RAISE NOTICE '   - remarks: 비고';
  RAISE NOTICE '✅ prevention_facilities 테이블에 측정기기 컬럼 추가 완료';
  RAISE NOTICE '   - ph: pH계 개수';
  RAISE NOTICE '   - pressure: 차압계 개수';
  RAISE NOTICE '   - temperature: 온도계 개수';
  RAISE NOTICE '   - pump: 펌프CT 개수';
  RAISE NOTICE '   - fan: 송풍CT 개수';
  RAISE NOTICE '   - remarks: 비고';
END $$;
