-- Migration: 미수금 위험도 컬럼 추가
-- Created: 2026-02-19
-- Purpose: business_info 테이블에 receivable_risk 컬럼 추가 (미수금 위험도: 상/중/하)

ALTER TABLE business_info
  ADD COLUMN IF NOT EXISTS receivable_risk VARCHAR(2) DEFAULT NULL;

-- 허용값 제약 조건
ALTER TABLE business_info
  ADD CONSTRAINT IF NOT EXISTS check_receivable_risk
  CHECK (receivable_risk IN ('상', '중', '하') OR receivable_risk IS NULL);

-- 인덱스 (위험도 필터링 시 성능 향상)
CREATE INDEX IF NOT EXISTS idx_business_info_receivable_risk
  ON business_info(receivable_risk)
  WHERE receivable_risk IS NOT NULL;

COMMENT ON COLUMN business_info.receivable_risk IS '미수금 위험도 (상/중/하) - admin/revenue 페이지 미수금 관리용';
