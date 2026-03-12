-- AS 매출/매입 금액 조정 이력 테이블
-- 생성일: 2026-03-12

CREATE TABLE IF NOT EXISTS as_price_adjustments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  as_record_id     UUID NOT NULL REFERENCES as_records(id) ON DELETE CASCADE,

  -- 조정 대상: 'revenue'=매출, 'cost'=매입
  adjustment_type  TEXT NOT NULL CHECK (adjustment_type IN ('revenue', 'cost')),

  -- 조정 금액 (양수: 증가, 음수: 감소), 정수 원 단위
  amount           BIGINT NOT NULL,

  -- 조정 사유 (필수)
  reason           TEXT NOT NULL,

  -- 작성자 이름 스냅샷
  created_by_name  TEXT,

  -- 타임스탬프
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- 소프트 삭제 (조정 취소)
  is_deleted       BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at       TIMESTAMPTZ,
  deleted_by_name  TEXT
);

-- 조회 성능 인덱스
CREATE INDEX IF NOT EXISTS idx_as_price_adjustments_record_id
  ON as_price_adjustments(as_record_id)
  WHERE is_deleted = FALSE;

-- RLS 비활성화 (서버사이드 API에서만 접근)
ALTER TABLE as_price_adjustments DISABLE ROW LEVEL SECURITY;
