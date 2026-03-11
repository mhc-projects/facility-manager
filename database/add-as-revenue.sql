-- AS 매출관리 마이그레이션
-- Created: 2026-03-11
-- 목적: AS 단가표에 단가 유형 추가, AS 레코드에 출동 정보 추가, 자재에 매출단가 정보 추가

-- ============================================================
-- 1. as_price_list 테이블: 단가 유형(price_type) 컬럼 추가
-- ============================================================
ALTER TABLE as_price_list
ADD COLUMN IF NOT EXISTS price_type VARCHAR(20) NOT NULL DEFAULT 'cost'
  CHECK (price_type IN (
    'cost',               -- 자재 원가단가 (기존)
    'revenue',            -- 자재 매출단가 (고객 청구)
    'dispatch_cost',      -- 출동 원가단가 (기사 매입가)
    'dispatch_revenue'    -- 출동 매출단가 (고객 출동비 청구가)
  ));

COMMENT ON COLUMN as_price_list.price_type IS '단가 유형: cost=자재원가, revenue=자재매출, dispatch_cost=출동원가, dispatch_revenue=출동매출';

-- ============================================================
-- 2. as_records 테이블: 출동 정보 컬럼 추가
-- ============================================================
ALTER TABLE as_records
ADD COLUMN IF NOT EXISTS dispatch_count INTEGER NOT NULL DEFAULT 1,
ADD COLUMN IF NOT EXISTS dispatch_cost_price_id UUID REFERENCES as_price_list(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS dispatch_revenue_price_id UUID REFERENCES as_price_list(id) ON DELETE SET NULL;

COMMENT ON COLUMN as_records.dispatch_count IS '출동 횟수 (재방문 포함)';
COMMENT ON COLUMN as_records.dispatch_cost_price_id IS '적용 출동 원가단가 (as_price_list.price_type=dispatch_cost)';
COMMENT ON COLUMN as_records.dispatch_revenue_price_id IS '적용 출동 매출단가 (as_price_list.price_type=dispatch_revenue)';

-- ============================================================
-- 3. as_material_usage 테이블: 매출단가 수동 조정 컬럼 추가
-- ============================================================
ALTER TABLE as_material_usage
ADD COLUMN IF NOT EXISTS revenue_price_list_id UUID REFERENCES as_price_list(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS revenue_unit_price DECIMAL(10,2) DEFAULT NULL;

COMMENT ON COLUMN as_material_usage.revenue_price_list_id IS '수동 지정 매출단가 항목 (NULL이면 item_name 자동 매핑)';
COMMENT ON COLUMN as_material_usage.revenue_unit_price IS '직접 입력 매출단가 override (NULL이면 단가표 참조)';

-- ============================================================
-- 4. 기본 출동단가 데이터 삽입 (필요 시 삭제/수정 후 사용)
-- ============================================================
INSERT INTO as_price_list (category, item_name, unit_price, unit, description, sort_order, price_type)
VALUES
  ('출동비', '기본 출동비', 50000, '건', 'AS 기사 기본 출동 원가', 1, 'dispatch_cost'),
  ('출동비', '기본 출동비', 80000, '건', 'AS 기사 기본 출동 고객청구', 1, 'dispatch_revenue')
ON CONFLICT DO NOTHING;

-- ============================================================
-- 5. 인덱스 추가
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_as_price_list_price_type ON as_price_list(price_type) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_as_records_dispatch ON as_records(dispatch_cost_price_id, dispatch_revenue_price_id) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_as_material_revenue ON as_material_usage(revenue_price_list_id);
