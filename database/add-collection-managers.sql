-- Migration: 수금 담당자 컬럼 추가
-- Created: 2026-03-09
-- Purpose: business_info 테이블에 collection_manager_ids 컬럼 추가
--          (수금 담당자 UUID 배열 - employees 테이블 참조, 다중 지정 가능)

ALTER TABLE business_info
  ADD COLUMN IF NOT EXISTS collection_manager_ids UUID[] DEFAULT '{}';

-- GIN 인덱스: 배열 검색 최적화 (ANY, @>, && 연산자)
CREATE INDEX IF NOT EXISTS idx_business_info_collection_manager_ids
  ON business_info USING GIN (collection_manager_ids);

COMMENT ON COLUMN business_info.collection_manager_ids
  IS '수금 담당자 UUID 배열 (employees.id 참조, 다중 지정 가능) - admin/revenue 미수금 관리용';
