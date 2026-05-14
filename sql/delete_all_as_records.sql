-- AS 데이터 전체 삭제
-- 연관 테이블(as_material_usage, as_price_adjustments)은 ON DELETE CASCADE로 자동 삭제됨
-- 실행 전 반드시 확인:
--   SELECT COUNT(*) FROM as_records;
--   SELECT COUNT(*) FROM as_material_usage;
--   SELECT COUNT(*) FROM as_price_adjustments;

BEGIN;

-- 삭제 전 카운트 확인
DO $$
DECLARE
  v_as_count INTEGER;
  v_mat_count INTEGER;
  v_adj_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_as_count FROM as_records;
  SELECT COUNT(*) INTO v_mat_count FROM as_material_usage;
  SELECT COUNT(*) INTO v_adj_count FROM as_price_adjustments WHERE is_deleted = false;
  RAISE NOTICE '삭제 예정: as_records=% 건, as_material_usage=% 건, as_price_adjustments=% 건', v_as_count, v_mat_count, v_adj_count;
END $$;

-- 전체 삭제 (CASCADE로 as_material_usage, as_price_adjustments 함께 삭제)
DELETE FROM as_records;

-- 삭제 후 확인
DO $$
DECLARE
  v_as_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_as_count FROM as_records;
  RAISE NOTICE '삭제 완료: as_records 잔여=% 건', v_as_count;
END $$;

COMMIT;
