-- ============================================================
-- AS 레코드 상태값 마이그레이션
-- 기존 7개 상태 → 새 8개 상태로 변경
--
-- 기존 → 새
-- received       → scheduled   (접수됨 → 진행예정)
-- scheduled      → scheduled   (그대로 유지)
-- in_progress    → completed   (진행중 → 진행완료)
-- parts_waiting  → on_hold     (부품대기 → 보류)
-- on_hold        → on_hold     (그대로 유지)
-- completed      → finished    (완료 → 완료)
-- cancelled      → finished    (취소 → 완료)
-- ============================================================

-- 1. 기존 제약 조건 제거 (status 컬럼에 CHECK 제약이 있는 경우)
ALTER TABLE as_records DROP CONSTRAINT IF EXISTS as_records_status_check;

-- 2. 기존 데이터 변환
UPDATE as_records SET status = 'scheduled'   WHERE status = 'received';
UPDATE as_records SET status = 'completed'   WHERE status = 'in_progress';
UPDATE as_records SET status = 'on_hold'     WHERE status = 'parts_waiting';
UPDATE as_records SET status = 'finished'    WHERE status = 'completed';
UPDATE as_records SET status = 'finished'    WHERE status = 'cancelled';
-- scheduled, on_hold 은 새 값과 동일하므로 변환 불필요

-- 3. 새 CHECK 제약 조건 추가
ALTER TABLE as_records
  ADD CONSTRAINT as_records_status_check
  CHECK (status IN (
    'completed',      -- 진행완료
    'scheduled',      -- 진행예정
    'finished',       -- 완료
    'on_hold',        -- 보류
    'site_check',     -- 현장확인
    'installation',   -- 포설
    'completion_fix', -- 준공보완
    'modem_check'     -- 모뎀확인
  ));

-- 4. 확인
SELECT status, COUNT(*) as count
FROM as_records
WHERE is_deleted = false
GROUP BY status
ORDER BY status;
