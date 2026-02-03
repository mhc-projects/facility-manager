-- =====================================================
-- 배출구별 게이트웨이 설정 기능 - DB 마이그레이션
-- =====================================================
--
-- 목적: discharge_outlets 테이블에 게이트웨이 정보 컬럼 추가
--      - gateway_number: 배출구별 게이트웨이 번호 (gateway1-gateway50)
--      - vpn_type: VPN 연결 방식 (유선/무선)
--
-- 작성일: 2025-02-03
-- =====================================================

-- 1. 게이트웨이 정보 컬럼 추가
ALTER TABLE discharge_outlets
ADD COLUMN IF NOT EXISTS gateway_number VARCHAR(20),
ADD COLUMN IF NOT EXISTS vpn_type VARCHAR(10);

-- 2. VPN 타입 제약조건 추가 (유선/무선만 허용)
ALTER TABLE discharge_outlets
ADD CONSTRAINT check_vpn_type
CHECK (vpn_type IN ('유선', '무선', NULL));

-- 3. 게이트웨이 번호 형식 제약조건 추가 (gateway1 ~ gateway50)
ALTER TABLE discharge_outlets
ADD CONSTRAINT check_gateway_number_format
CHECK (
  gateway_number IS NULL OR
  gateway_number ~ '^gateway([1-9]|[1-4][0-9]|50)$'
);

-- 4. 검색 성능 향상을 위한 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_discharge_outlets_gateway
ON discharge_outlets(gateway_number)
WHERE gateway_number IS NOT NULL;

-- 5. 컬럼 설명 추가 (문서화)
COMMENT ON COLUMN discharge_outlets.gateway_number IS '배출구별 게이트웨이 번호 (gateway1-gateway50). 각 배출구가 사용하는 IoT 게이트웨이 번호.';
COMMENT ON COLUMN discharge_outlets.vpn_type IS 'VPN 연결 방식 (유선/무선). 게이트웨이의 네트워크 연결 타입.';

-- 6. 마이그레이션 완료 확인
SELECT
  'Migration completed successfully!' AS status,
  COUNT(*) AS total_outlets,
  COUNT(gateway_number) AS outlets_with_gateway,
  COUNT(vpn_type) AS outlets_with_vpn_type
FROM discharge_outlets;

-- =====================================================
-- 롤백 스크립트 (필요시 사용)
-- =====================================================
/*
-- 제약조건 제거
ALTER TABLE discharge_outlets DROP CONSTRAINT IF EXISTS check_vpn_type;
ALTER TABLE discharge_outlets DROP CONSTRAINT IF EXISTS check_gateway_number_format;

-- 인덱스 제거
DROP INDEX IF EXISTS idx_discharge_outlets_gateway;

-- 컬럼 제거
ALTER TABLE discharge_outlets DROP COLUMN IF EXISTS gateway_number;
ALTER TABLE discharge_outlets DROP COLUMN IF EXISTS vpn_type;
*/

-- =====================================================
-- 테스트 쿼리 예제
-- =====================================================
/*
-- 배출구별 게이트웨이 설정 업데이트 테스트
UPDATE discharge_outlets
SET gateway_number = 'gateway1',
    vpn_type = '유선',
    updated_at = NOW()
WHERE outlet_number = 1
  AND air_permit_id = '특정_대기필증_ID';

-- 게이트웨이별 배출구 개수 확인
SELECT
  gateway_number,
  vpn_type,
  COUNT(*) AS outlet_count
FROM discharge_outlets
WHERE gateway_number IS NOT NULL
GROUP BY gateway_number, vpn_type
ORDER BY gateway_number;

-- 특정 대기필증의 배출구별 게이트웨이 설정 확인
SELECT
  outlet_number,
  outlet_name,
  gateway_number,
  vpn_type
FROM discharge_outlets
WHERE air_permit_id = '특정_대기필증_ID'
ORDER BY outlet_number;
*/
