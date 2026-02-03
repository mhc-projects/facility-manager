-- sql/migrate-status-prefix.sql
-- 구버전 status 코드 → 신버전 prefix 적용 마이그레이션
-- 작성일: 2026-02-03
-- 목적: task_type별 prefix가 없는 구버전 status를 신버전으로 변환

-- 🔍 마이그레이션 전 현황 확인
SELECT
  task_type,
  status,
  COUNT(*) as count
FROM facility_tasks
WHERE is_active = true AND is_deleted = false
  AND status NOT IN ('pending', 'in_progress', 'completed', 'cancelled', 'on_hold') -- 공통 status 제외
  AND status NOT LIKE 'self_%'
  AND status NOT LIKE 'subsidy_%'
  AND status NOT LIKE 'dealer_%'
  AND status NOT LIKE 'outsourcing_%'
  AND status NOT LIKE 'as_%'
  AND status NOT LIKE 'etc_%'
GROUP BY task_type, status
ORDER BY task_type, status;

-- ⚠️ 예상 결과: dealer 타입의 product_order 등 prefix 없는 status 목록

-- 🔄 마이그레이션 실행 (트랜잭션)
BEGIN;

-- 1. dealer 타입: product_order → dealer_product_ordered
UPDATE facility_tasks
SET status = 'dealer_product_ordered',
    updated_at = NOW()
WHERE task_type = 'dealer'
  AND status = 'product_order'
  AND is_active = true
  AND is_deleted = false;

-- 2. self 타입: product_order → self_product_order
UPDATE facility_tasks
SET status = 'self_product_order',
    updated_at = NOW()
WHERE task_type = 'self'
  AND status = 'product_order'
  AND is_active = true
  AND is_deleted = false;

-- 3. subsidy 타입: product_order → subsidy_product_order
UPDATE facility_tasks
SET status = 'subsidy_product_order',
    updated_at = NOW()
WHERE task_type = 'subsidy'
  AND status = 'product_order'
  AND is_active = true
  AND is_deleted = false;

-- 4. 기타 공통 status에 prefix 추가 (필요시)
-- customer_contact, site_inspection, quotation, contract는 여러 타입에서 공통으로 사용
-- 이들은 그대로 유지 (공통 status로 간주)

-- 5. product_shipment: prefix 추가
UPDATE facility_tasks
SET status = 'self_product_shipment',
    updated_at = NOW()
WHERE task_type = 'self'
  AND status = 'product_shipment'
  AND is_active = true
  AND is_deleted = false;

UPDATE facility_tasks
SET status = 'subsidy_product_shipment',
    updated_at = NOW()
WHERE task_type = 'subsidy'
  AND status = 'product_shipment'
  AND is_active = true
  AND is_deleted = false;

-- 6. installation_schedule: prefix 추가
UPDATE facility_tasks
SET status = 'self_installation_schedule',
    updated_at = NOW()
WHERE task_type = 'self'
  AND status = 'installation_schedule'
  AND is_active = true
  AND is_deleted = false;

UPDATE facility_tasks
SET status = 'subsidy_installation_schedule',
    updated_at = NOW()
WHERE task_type = 'subsidy'
  AND status = 'installation_schedule'
  AND is_active = true
  AND is_deleted = false;

-- 7. installation: prefix 추가
UPDATE facility_tasks
SET status = 'self_installation',
    updated_at = NOW()
WHERE task_type = 'self'
  AND status = 'installation'
  AND is_active = true
  AND is_deleted = false;

UPDATE facility_tasks
SET status = 'subsidy_installation',
    updated_at = NOW()
WHERE task_type = 'subsidy'
  AND status = 'installation'
  AND is_active = true
  AND is_deleted = false;

-- 8. deposit_confirm: prefix 추가 (자비 전용)
UPDATE facility_tasks
SET status = 'self_deposit_confirm',
    updated_at = NOW()
WHERE task_type = 'self'
  AND status = 'deposit_confirm'
  AND is_active = true
  AND is_deleted = false;

-- 9. balance_payment: prefix 추가 (자비 전용)
UPDATE facility_tasks
SET status = 'self_balance_payment',
    updated_at = NOW()
WHERE task_type = 'self'
  AND status = 'balance_payment'
  AND is_active = true
  AND is_deleted = false;

-- 10. document_complete: prefix 추가 (자비 전용)
UPDATE facility_tasks
SET status = 'self_document_complete',
    updated_at = NOW()
WHERE task_type = 'self'
  AND status = 'document_complete'
  AND is_active = true
  AND is_deleted = false;

-- 🔍 마이그레이션 후 확인
SELECT
  task_type,
  status,
  COUNT(*) as count
FROM facility_tasks
WHERE is_active = true AND is_deleted = false
  AND status NOT IN ('pending', 'in_progress', 'completed', 'cancelled', 'on_hold')
  AND status NOT LIKE 'self_%'
  AND status NOT LIKE 'subsidy_%'
  AND status NOT LIKE 'dealer_%'
  AND status NOT LIKE 'outsourcing_%'
  AND status NOT LIKE 'as_%'
  AND status NOT LIKE 'etc_%'
  AND status NOT IN ('customer_contact', 'site_inspection', 'quotation', 'contract') -- 공통 status는 제외
GROUP BY task_type, status
ORDER BY task_type, status;

-- ⚠️ 결과가 0건이면 성공

-- ✅ 변경 내역 확인
SELECT
  task_type,
  status,
  COUNT(*) as count
FROM facility_tasks
WHERE is_active = true
  AND is_deleted = false
  AND updated_at > NOW() - INTERVAL '1 minute' -- 방금 업데이트된 것들
GROUP BY task_type, status
ORDER BY task_type, status;

COMMIT;

-- 🔄 롤백이 필요한 경우:
-- ROLLBACK;
