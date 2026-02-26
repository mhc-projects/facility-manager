-- Migration: 위험도 수동 설정 여부 컬럼 추가
-- 설명: 수동 설정된 위험도와 자동 계산 위험도를 구분하기 위한 컬럼
-- 실행일: 2026-02-26

-- 1. risk_is_manual 컬럼 추가 (기본값 false = 자동화 모드)
ALTER TABLE business_info
ADD COLUMN IF NOT EXISTS risk_is_manual BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN business_info.risk_is_manual IS
  '위험도 수동 설정 여부. true이면 receivable_risk 값을 그대로 사용, false이면 installation_date 기준 자동 계산';

-- 2. 기존에 receivable_risk가 설정된 레코드는 수동 설정으로 간주
UPDATE business_info
SET risk_is_manual = true
WHERE receivable_risk IS NOT NULL;

-- 3. 검증
SELECT
  COUNT(*) AS total,
  COUNT(receivable_risk) AS has_risk,
  COUNT(*) FILTER (WHERE risk_is_manual = true) AS manual_count,
  COUNT(*) FILTER (WHERE risk_is_manual = false) AS auto_count
FROM business_info
WHERE is_deleted = false;
