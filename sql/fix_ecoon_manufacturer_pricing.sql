-- Migration: 에코온(Eco-On) 제조사별 원가 교정 + 신규 입력 (전류계 100A/400A 스펙 포함)
-- Date: 2026-07-29
-- Purpose:
--   1) 기존 에코온 행 2개가 equipment_type을 표의 순번("1","3")으로 잘못 입력해
--      시스템 표준 코드(ph_meter, gateway_1_2 등)와 매칭되지 않고 있음 → 교정
--   2) 누락된 차압계/온도계/확장디바이스/게이트웨이(3,4) 원가 입력
--   3) 전류계(배출/송풍/펌프) 100A/400A 스펙별 원가 신설
--      - 레거시 키(discharge_current_meter 등)는 100A와 동일값으로 유지 → 코드 배포 전/후, 롤백 시 안전망
--      - _100a/_400a 접미사 키는 코드 배포(별도 PR) 전까지는 시스템에서 완전히 무시됨(무해)
--
-- 실행 전 확인 권장 (Step 0):
--   - manufacturer_pricing에 CHECK 제약(manufacturer IN ('ecosense',...))이 남아있으면 실패할 수 있으나,
--     기존 '에코온' 행이 이미 존재하므로(Step 0 조회로 확인) 제약은 문제되지 않을 것으로 판단됨.

-- ============================================================================
-- STEP 0: 실행 전 현황 확인 (참고용, 실행 결과를 보고 다음 단계 진행)
-- ============================================================================
SELECT id, equipment_type, equipment_name, manufacturer, cost_price, effective_from, effective_to, is_active
  FROM manufacturer_pricing
 WHERE manufacturer = '에코온'
 ORDER BY equipment_type;

-- ============================================================================
-- STEP 1: 잘못 입력된 equipment_type 교정
-- ============================================================================

-- 1-1. "1" (PH센서, 490,000원 그대로 유지) → 표준 코드 ph_meter
UPDATE manufacturer_pricing
   SET equipment_type = 'ph_meter',
       equipment_name = 'PH센서'
 WHERE manufacturer = '에코온'
   AND equipment_type = '1';

-- 1-2. "3" (게이트웨이, 610,000원) → 표준 코드 gateway_1_2 (1,2/3,4 공통가격)
UPDATE manufacturer_pricing
   SET equipment_type = 'gateway_1_2',
       equipment_name = '게이트웨이(1,2)',
       cost_price = 610000
 WHERE manufacturer = '에코온'
   AND equipment_type = '3';

-- ============================================================================
-- STEP 2: 누락 원가 입력 (게이트웨이 3,4 / 차압계 / 온도계 / 확장디바이스)
-- ============================================================================

INSERT INTO manufacturer_pricing
  (equipment_type, equipment_name, manufacturer, cost_price, effective_from, effective_to, is_active, notes)
VALUES
  ('gateway_3_4', '게이트웨이(3,4)', '에코온', 610000, '2025-01-01', NULL, true, '게이트웨이(1,2)와 동일가 - 스크린샷 확인'),
  ('differential_pressure_meter', '차압계', '에코온', 105000, '2025-01-01', NULL, true, 'NP-D0500'),
  ('temperature_meter', '온도계', '에코온', 70000, '2025-01-01', NULL, true, 'NT-50400'),
  ('expansion_device', '확장디바이스', '에코온', 280000, '2025-01-01', NULL, true, NULL)
ON CONFLICT (equipment_type, manufacturer, effective_from) DO UPDATE
SET cost_price = EXCLUDED.cost_price,
    equipment_name = EXCLUDED.equipment_name,
    effective_to = NULL,
    is_active = true,
    notes = EXCLUDED.notes;

-- ============================================================================
-- STEP 3: 전류계(배출/송풍/펌프) - 레거시 키(=100A 단가로 유지, 하위호환용)
-- ============================================================================

INSERT INTO manufacturer_pricing
  (equipment_type, equipment_name, manufacturer, cost_price, effective_from, effective_to, is_active, notes)
VALUES
  ('discharge_current_meter', '배출전류계', '에코온', 28000, '2025-01-01', NULL, true, 'NC16-100 (100A) 단가와 동일 - 스펙 미분리 코드용 하위호환'),
  ('fan_current_meter',       '송풍전류계', '에코온', 28000, '2025-01-01', NULL, true, 'NC16-100 (100A) 단가와 동일 - 스펙 미분리 코드용 하위호환'),
  ('pump_current_meter',      '펌프전류계', '에코온', 28000, '2025-01-01', NULL, true, 'NC16-100 (100A) 단가와 동일 - 스펙 미분리 코드용 하위호환')
ON CONFLICT (equipment_type, manufacturer, effective_from) DO UPDATE
SET cost_price = EXCLUDED.cost_price,
    equipment_name = EXCLUDED.equipment_name,
    effective_to = NULL,
    is_active = true,
    notes = EXCLUDED.notes;

-- ============================================================================
-- STEP 4: 전류계 100A/400A 스펙별 원가 (신규 - 코드 배포 후에만 실제 계산에 반영됨)
-- ============================================================================

INSERT INTO manufacturer_pricing
  (equipment_type, equipment_name, manufacturer, cost_price, effective_from, effective_to, is_active, notes)
VALUES
  ('discharge_current_meter_100a', '배출전류계(100A)', '에코온', 28000, '2025-01-01', NULL, true, 'NC16-100'),
  ('discharge_current_meter_400a', '배출전류계(400A)', '에코온', 32000, '2025-01-01', NULL, true, 'NC24-400'),
  ('fan_current_meter_100a',       '송풍전류계(100A)', '에코온', 28000, '2025-01-01', NULL, true, 'NC16-100'),
  ('fan_current_meter_400a',       '송풍전류계(400A)', '에코온', 32000, '2025-01-01', NULL, true, 'NC24-400'),
  ('pump_current_meter_100a',      '펌프전류계(100A)', '에코온', 28000, '2025-01-01', NULL, true, 'NC16-100'),
  ('pump_current_meter_400a',      '펌프전류계(400A)', '에코온', 32000, '2025-01-01', NULL, true, 'NC24-400')
ON CONFLICT (equipment_type, manufacturer, effective_from) DO UPDATE
SET cost_price = EXCLUDED.cost_price,
    equipment_name = EXCLUDED.equipment_name,
    effective_to = NULL,
    is_active = true,
    notes = EXCLUDED.notes;

-- ============================================================================
-- STEP 5: 검증
-- ============================================================================

-- 5-1. 에코온 전체 원가 목록 (총 15행 예상: ph_meter, gateway_1_2, gateway_3_4,
--      differential_pressure_meter, temperature_meter, expansion_device,
--      discharge/fan/pump_current_meter(레거시 3) + _100a/_400a(6) = 2+4+3+6 = 15)
SELECT equipment_type, equipment_name, cost_price, effective_from, effective_to, is_active, notes
  FROM manufacturer_pricing
 WHERE manufacturer = '에코온'
 ORDER BY equipment_type;

-- 5-2. (제조사, equipment_type) 조합당 effective_to IS NULL 활성 행이 정확히 1개인지 확인
--      2개 이상이면 발주서 등 일부 조회 경로에서 단가가 비결정적이 될 수 있음
SELECT manufacturer, equipment_type, count(*)
  FROM manufacturer_pricing
 WHERE effective_to IS NULL AND is_active
 GROUP BY 1, 2
HAVING count(*) > 1;
