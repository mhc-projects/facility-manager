-- DPF 후지노테크 전산반영 리스트 신규 컬럼 추가
-- 엑셀 17개 컬럼 중 기존 9개 외 추가 6개를 구조화 컬럼으로 승격

ALTER TABLE dpf_vehicles
  ADD COLUMN IF NOT EXISTS engine_type           VARCHAR(50),    -- 엔진형식 (D4BH, D6DA 등)
  ADD COLUMN IF NOT EXISTS device_type           VARCHAR(50),    -- 장치 (복합중형/복합소형/2종 파샬/1종 대형/정보없음)
  ADD COLUMN IF NOT EXISTS trust_grade           VARCHAR(100),   -- 신뢰등급 (A/B/C/탈거·폐차·반납)
  ADD COLUMN IF NOT EXISTS plate_number_original VARCHAR(20),    -- 보정 전 차량번호 (차량번호 보정된 경우만 존재)
  ADD COLUMN IF NOT EXISTS grade_management      VARCHAR(50),    -- 등급관리 (A-완전일치/B-차대번호 매칭/C-전산 단독/D-이력보관)
  ADD COLUMN IF NOT EXISTS management_direction  VARCHAR(20);    -- 관리방향 (운영관리/이력보관)

-- 필터·검색에 사용되는 카테고리 컬럼 인덱스
CREATE INDEX IF NOT EXISTS idx_dpf_vehicles_device_type     ON dpf_vehicles(device_type);
CREATE INDEX IF NOT EXISTS idx_dpf_vehicles_grade_mgmt      ON dpf_vehicles(grade_management);
CREATE INDEX IF NOT EXISTS idx_dpf_vehicles_mgmt_direction  ON dpf_vehicles(management_direction);
CREATE INDEX IF NOT EXISTS idx_dpf_vehicles_trust_grade     ON dpf_vehicles(trust_grade);
