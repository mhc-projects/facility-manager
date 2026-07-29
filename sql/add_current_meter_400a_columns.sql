-- Migration: Add 400A partial-quantity columns for current meters
-- Date: 2026-07-29
-- Purpose: 배출/송풍/펌프전류계는 정격전류(100A/400A)에 따라 매입원가가 다르다.
--          기존 discharge_current_meter 등은 "총 수량" 의미를 그대로 유지하고,
--          그 중 400A 대수만 별도 컬럼으로 추가한다. 100A 수량은 (총수량 - 400a)로 파생한다.
--          매입원가 = (총수량 - 400a) * price100A + 400a * price400A
--          매출(환경부 고시가)은 스펙 무관 동일 — 이 마이그레이션과 무관.
--
-- 기존 discharge_current_meter/fan_current_meter/pump_current_meter는 절대 삭제/이름변경 금지
-- (CLAUDE.md 금지사항 및 하위호환: 구코드가 이 컬럼을 총수량으로 계속 사용함)

-- Step 1: 400A 부분수량 컬럼 추가 (PG11+ 에서 DEFAULT 포함 ADD COLUMN은 메타데이터 변경만 → 락 최소)
ALTER TABLE business_info
ADD COLUMN IF NOT EXISTS discharge_current_meter_400a INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS fan_current_meter_400a       INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS pump_current_meter_400a      INTEGER DEFAULT 0;

-- Step 2: 컬럼 설명 (불변식 명시)
COMMENT ON COLUMN business_info.discharge_current_meter IS
  '배출전류계 총 수량 (100A + 400A). 100A 수량 = 총수량 - discharge_current_meter_400a';
COMMENT ON COLUMN business_info.discharge_current_meter_400a IS
  '배출전류계 중 400A 사양 수량. 0 <= 값 <= discharge_current_meter. 기존 등록 사업장은 전부 0(=100A)으로 간주';
COMMENT ON COLUMN business_info.fan_current_meter IS
  '송풍전류계 총 수량 (100A + 400A). 100A 수량 = 총수량 - fan_current_meter_400a';
COMMENT ON COLUMN business_info.fan_current_meter_400a IS
  '송풍전류계 중 400A 사양 수량. 0 <= 값 <= fan_current_meter. 기존 등록 사업장은 전부 0(=100A)으로 간주';
COMMENT ON COLUMN business_info.pump_current_meter IS
  '펌프전류계 총 수량 (100A + 400A). 100A 수량 = 총수량 - pump_current_meter_400a';
COMMENT ON COLUMN business_info.pump_current_meter_400a IS
  '펌프전류계 중 400A 사양 수량. 0 <= 값 <= pump_current_meter. 기존 등록 사업장은 전부 0(=100A)으로 간주';

-- Step 3: 검증 - 컬럼이 정상 추가됐는지
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_name = 'business_info'
  AND column_name IN (
    'discharge_current_meter', 'discharge_current_meter_400a',
    'fan_current_meter', 'fan_current_meter_400a',
    'pump_current_meter', 'pump_current_meter_400a'
  )
ORDER BY column_name;

-- Step 4: 불변식 상시 감시 쿼리 (지금은 전부 0이므로 0행이 정상)
-- 이후 400A 값을 입력하기 시작하면, 대량 엑셀 업로드 후 주기적으로 다시 실행할 것
SELECT id, business_name, manufacturer,
       discharge_current_meter, discharge_current_meter_400a,
       fan_current_meter, fan_current_meter_400a,
       pump_current_meter, pump_current_meter_400a
  FROM business_info
 WHERE is_deleted = false
   AND ( COALESCE(discharge_current_meter_400a,0) > COALESCE(discharge_current_meter,0)
      OR COALESCE(fan_current_meter_400a,0)       > COALESCE(fan_current_meter,0)
      OR COALESCE(pump_current_meter_400a,0)      > COALESCE(pump_current_meter,0) );
