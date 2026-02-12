-- ============================================================================
-- 업무 메모 상태 한글 치환 마이그레이션 스크립트
-- ============================================================================
-- 목적: business_memos 테이블의 content 필드에 포함된 영문 상태 코드를 한글로 치환
-- 대상: 업무 자동 생성/변경 시 생성된 메모 (source_type = 'task_sync' 또는 시스템 메모)
-- 실행 시점: 코드 수정 후 기존 데이터 정리용
--
-- 주의사항:
-- 1. 프로덕션 실행 전 백업 필수!
-- 2. 트랜잭션으로 실행 (문제 시 롤백 가능)
-- 3. 테스트 환경에서 먼저 검증 필수
-- ============================================================================

-- ============================================================================
-- 백업 권장 명령어 (실행 전 수동으로 실행)
-- ============================================================================
-- CREATE TABLE business_memos_backup AS SELECT * FROM business_memos;

-- ============================================================================
-- 트랜잭션 시작
-- ============================================================================
BEGIN;

-- ============================================================================
-- 1. 자비(Self) 업무 상태 치환 (14개)
-- ============================================================================

-- 공통 단계 (4개)
UPDATE business_memos
SET content = REPLACE(content, 'self_customer_contact', '고객 상담')
WHERE content LIKE '%self_customer_contact%';

UPDATE business_memos
SET content = REPLACE(content, 'self_site_inspection', '현장 실사')
WHERE content LIKE '%self_site_inspection%';

UPDATE business_memos
SET content = REPLACE(content, 'self_quotation', '견적서 작성')
WHERE content LIKE '%self_quotation%';

UPDATE business_memos
SET content = REPLACE(content, 'self_contract', '계약 체결')
WHERE content LIKE '%self_contract%';

-- 전용 단계 (7개)
UPDATE business_memos
SET content = REPLACE(content, 'self_deposit_confirm', '계약금 확인')
WHERE content LIKE '%self_deposit_confirm%';

UPDATE business_memos
SET content = REPLACE(content, 'self_product_order', '제품 발주')
WHERE content LIKE '%self_product_order%';

UPDATE business_memos
SET content = REPLACE(content, 'self_product_shipment', '제품 출고')
WHERE content LIKE '%self_product_shipment%';

UPDATE business_memos
SET content = REPLACE(content, 'self_installation_schedule', '설치 협의')
WHERE content LIKE '%self_installation_schedule%';

UPDATE business_memos
SET content = REPLACE(content, 'self_installation', '제품 설치')
WHERE content LIKE '%self_installation%';

UPDATE business_memos
SET content = REPLACE(content, 'self_balance_payment', '잔금 입금')
WHERE content LIKE '%self_balance_payment%';

UPDATE business_memos
SET content = REPLACE(content, 'self_document_complete', '서류 발송 완료')
WHERE content LIKE '%self_document_complete%';

-- 특수 상태 (1개)
UPDATE business_memos
SET content = REPLACE(content, 'self_needs_check', '확인필요')
WHERE content LIKE '%self_needs_check%';

-- 레거시 호환성 (2개 - prefix 없는 버전)
UPDATE business_memos
SET content = REPLACE(content, 'deposit_confirm', '계약금 확인')
WHERE content LIKE '%deposit_confirm%'
  AND content NOT LIKE '%self_deposit_confirm%';

UPDATE business_memos
SET content = REPLACE(content, 'installation_schedule', '설치예정')
WHERE content LIKE '%installation_schedule%'
  AND content NOT LIKE '%self_installation_schedule%'
  AND content NOT LIKE '%subsidy_installation_schedule%';

-- ============================================================================
-- 2. 보조금(Subsidy) 업무 상태 치환 (27개)
-- ============================================================================

-- 공통 단계 (4개)
UPDATE business_memos
SET content = REPLACE(content, 'subsidy_customer_contact', '고객 상담')
WHERE content LIKE '%subsidy_customer_contact%';

UPDATE business_memos
SET content = REPLACE(content, 'subsidy_site_inspection', '현장 실사')
WHERE content LIKE '%subsidy_site_inspection%';

UPDATE business_memos
SET content = REPLACE(content, 'subsidy_quotation', '견적서 작성')
WHERE content LIKE '%subsidy_quotation%';

UPDATE business_memos
SET content = REPLACE(content, 'subsidy_contract', '계약 체결')
WHERE content LIKE '%subsidy_contract%';

-- 신청 단계 (5개)
UPDATE business_memos
SET content = REPLACE(content, 'subsidy_document_preparation', '신청서 작성 필요')
WHERE content LIKE '%subsidy_document_preparation%';

UPDATE business_memos
SET content = REPLACE(content, 'subsidy_application_submit', '신청서 제출')
WHERE content LIKE '%subsidy_application_submit%';

UPDATE business_memos
SET content = REPLACE(content, 'subsidy_approval_pending', '보조금 승인대기')
WHERE content LIKE '%subsidy_approval_pending%';

UPDATE business_memos
SET content = REPLACE(content, 'subsidy_approved', '보조금 승인')
WHERE content LIKE '%subsidy_approved%';

UPDATE business_memos
SET content = REPLACE(content, 'subsidy_rejected', '보조금 탈락')
WHERE content LIKE '%subsidy_rejected%';

-- 착공 단계 (5개)
UPDATE business_memos
SET content = REPLACE(content, 'subsidy_document_supplement', '신청서 보완')
WHERE content LIKE '%subsidy_document_supplement%';

UPDATE business_memos
SET content = REPLACE(content, 'subsidy_pre_construction_inspection', '착공 전 실사')
WHERE content LIKE '%subsidy_pre_construction_inspection%';

UPDATE business_memos
SET content = REPLACE(content, 'subsidy_pre_construction_supplement_1st', '착공 보완 1차')
WHERE content LIKE '%subsidy_pre_construction_supplement_1st%';

UPDATE business_memos
SET content = REPLACE(content, 'subsidy_pre_construction_supplement_2nd', '착공 보완 2차')
WHERE content LIKE '%subsidy_pre_construction_supplement_2nd%';

UPDATE business_memos
SET content = REPLACE(content, 'subsidy_construction_report_submit', '착공신고서 제출')
WHERE content LIKE '%subsidy_construction_report_submit%';

-- 설치 단계 (4개)
UPDATE business_memos
SET content = REPLACE(content, 'subsidy_product_order', '제품 발주')
WHERE content LIKE '%subsidy_product_order%';

UPDATE business_memos
SET content = REPLACE(content, 'subsidy_product_shipment', '제품 출고')
WHERE content LIKE '%subsidy_product_shipment%';

UPDATE business_memos
SET content = REPLACE(content, 'subsidy_installation_schedule', '설치예정')
WHERE content LIKE '%subsidy_installation_schedule%';

UPDATE business_memos
SET content = REPLACE(content, 'subsidy_installation', '설치완료')
WHERE content LIKE '%subsidy_installation%';

-- 준공 단계 (6개)
UPDATE business_memos
SET content = REPLACE(content, 'subsidy_pre_completion_document_submit', '준공도서 작성 필요')
WHERE content LIKE '%subsidy_pre_completion_document_submit%';

UPDATE business_memos
SET content = REPLACE(content, 'subsidy_completion_inspection', '준공 실사')
WHERE content LIKE '%subsidy_completion_inspection%';

UPDATE business_memos
SET content = REPLACE(content, 'subsidy_completion_supplement_1st', '준공 보완 1차')
WHERE content LIKE '%subsidy_completion_supplement_1st%';

UPDATE business_memos
SET content = REPLACE(content, 'subsidy_completion_supplement_2nd', '준공 보완 2차')
WHERE content LIKE '%subsidy_completion_supplement_2nd%';

UPDATE business_memos
SET content = REPLACE(content, 'subsidy_completion_supplement_3rd', '준공 보완 3차')
WHERE content LIKE '%subsidy_completion_supplement_3rd%';

UPDATE business_memos
SET content = REPLACE(content, 'subsidy_final_document_submit', '보조금지급신청서 제출')
WHERE content LIKE '%subsidy_final_document_submit%';

-- 완료 단계 (1개)
UPDATE business_memos
SET content = REPLACE(content, 'subsidy_payment', '보조금 입금')
WHERE content LIKE '%subsidy_payment%';

-- 특수 상태 (1개)
UPDATE business_memos
SET content = REPLACE(content, 'subsidy_needs_check', '확인필요')
WHERE content LIKE '%subsidy_needs_check%';

-- 레거시 호환성 (10개 - prefix 없는 버전)
UPDATE business_memos
SET content = REPLACE(content, 'document_preparation', '신청서 작성 필요')
WHERE content LIKE '%document_preparation%'
  AND content NOT LIKE '%subsidy_document_preparation%'
  AND content NOT LIKE '%pre_completion_document%';

UPDATE business_memos
SET content = REPLACE(content, 'application_submit', '신청서 제출')
WHERE content LIKE '%application_submit%'
  AND content NOT LIKE '%subsidy_application_submit%';

UPDATE business_memos
SET content = REPLACE(content, 'approval_pending', '보조금 승인대기')
WHERE content LIKE '%approval_pending%'
  AND content NOT LIKE '%subsidy_approval_pending%';

UPDATE business_memos
SET content = REPLACE(content, 'document_supplement', '신청서 보완')
WHERE content LIKE '%document_supplement%'
  AND content NOT LIKE '%subsidy_document_supplement%';

UPDATE business_memos
SET content = REPLACE(content, 'pre_construction_inspection', '착공 전 실사')
WHERE content LIKE '%pre_construction_inspection%'
  AND content NOT LIKE '%subsidy_pre_construction_inspection%';

UPDATE business_memos
SET content = REPLACE(content, 'pre_construction_supplement_1st', '착공 보완 1차')
WHERE content LIKE '%pre_construction_supplement_1st%'
  AND content NOT LIKE '%subsidy_pre_construction_supplement_1st%';

UPDATE business_memos
SET content = REPLACE(content, 'pre_construction_supplement_2nd', '착공 보완 2차')
WHERE content LIKE '%pre_construction_supplement_2nd%'
  AND content NOT LIKE '%subsidy_pre_construction_supplement_2nd%';

UPDATE business_memos
SET content = REPLACE(content, 'construction_report_submit', '착공신고서 제출')
WHERE content LIKE '%construction_report_submit%'
  AND content NOT LIKE '%subsidy_construction_report_submit%';

UPDATE business_memos
SET content = REPLACE(content, 'pre_completion_document_submit', '준공도서 작성 필요')
WHERE content LIKE '%pre_completion_document_submit%'
  AND content NOT LIKE '%subsidy_pre_completion_document_submit%';

UPDATE business_memos
SET content = REPLACE(content, 'completion_inspection', '준공 실사')
WHERE content LIKE '%completion_inspection%'
  AND content NOT LIKE '%subsidy_completion_inspection%';

-- ============================================================================
-- 3. AS 업무 상태 치환 (7개)
-- ============================================================================

UPDATE business_memos
SET content = REPLACE(content, 'as_customer_contact', 'AS 고객 상담')
WHERE content LIKE '%as_customer_contact%';

UPDATE business_memos
SET content = REPLACE(content, 'as_site_inspection', 'AS 현장 확인')
WHERE content LIKE '%as_site_inspection%';

UPDATE business_memos
SET content = REPLACE(content, 'as_quotation', 'AS 견적 작성')
WHERE content LIKE '%as_quotation%';

UPDATE business_memos
SET content = REPLACE(content, 'as_contract', 'AS 계약 체결')
WHERE content LIKE '%as_contract%';

UPDATE business_memos
SET content = REPLACE(content, 'as_part_order', 'AS 부품 발주')
WHERE content LIKE '%as_part_order%';

UPDATE business_memos
SET content = REPLACE(content, 'as_completed', 'AS 완료')
WHERE content LIKE '%as_completed%';

UPDATE business_memos
SET content = REPLACE(content, 'as_needs_check', '확인필요')
WHERE content LIKE '%as_needs_check%';

-- ============================================================================
-- 4. 대리점(Dealer) 업무 상태 치환 (5개)
-- ============================================================================

UPDATE business_memos
SET content = REPLACE(content, 'dealer_order_received', '발주 수신')
WHERE content LIKE '%dealer_order_received%';

UPDATE business_memos
SET content = REPLACE(content, 'dealer_invoice_issued', '계산서 발행')
WHERE content LIKE '%dealer_invoice_issued%';

UPDATE business_memos
SET content = REPLACE(content, 'dealer_payment_confirmed', '입금 확인')
WHERE content LIKE '%dealer_payment_confirmed%';

UPDATE business_memos
SET content = REPLACE(content, 'dealer_product_ordered', '제품 발주')
WHERE content LIKE '%dealer_product_ordered%';

UPDATE business_memos
SET content = REPLACE(content, 'dealer_needs_check', '확인필요')
WHERE content LIKE '%dealer_needs_check%';

-- ============================================================================
-- 5. 외주설치(Outsourcing) 업무 상태 치환 (5개)
-- ============================================================================

UPDATE business_memos
SET content = REPLACE(content, 'outsourcing_order', '외주 발주')
WHERE content LIKE '%outsourcing_order%';

UPDATE business_memos
SET content = REPLACE(content, 'outsourcing_schedule', '일정 조율')
WHERE content LIKE '%outsourcing_schedule%';

UPDATE business_memos
SET content = REPLACE(content, 'outsourcing_in_progress', '설치 진행 중')
WHERE content LIKE '%outsourcing_in_progress%';

UPDATE business_memos
SET content = REPLACE(content, 'outsourcing_completed', '설치 완료')
WHERE content LIKE '%outsourcing_completed%';

UPDATE business_memos
SET content = REPLACE(content, 'outsourcing_needs_check', '확인필요')
WHERE content LIKE '%outsourcing_needs_check%';

-- ============================================================================
-- 6. 기타(Etc) 업무 상태 치환 (2개)
-- ============================================================================

UPDATE business_memos
SET content = REPLACE(content, 'etc_status', '기타')
WHERE content LIKE '%etc_status%';

UPDATE business_memos
SET content = REPLACE(content, 'etc_needs_check', '확인필요')
WHERE content LIKE '%etc_needs_check%';

-- ============================================================================
-- 7. 범용 상태 치환 (5개)
-- ============================================================================

UPDATE business_memos
SET content = REPLACE(content, 'pending', '대기')
WHERE content LIKE '%pending%'
  AND content NOT LIKE '%approval_pending%'
  AND content NOT LIKE '%subsidy_approval_pending%';

UPDATE business_memos
SET content = REPLACE(content, 'in_progress', '진행중')
WHERE content LIKE '%in_progress%'
  AND content NOT LIKE '%outsourcing_in_progress%';

UPDATE business_memos
SET content = REPLACE(content, 'on_hold', '보류')
WHERE content LIKE '%on_hold%';

UPDATE business_memos
SET content = REPLACE(content, 'cancelled', '취소')
WHERE content LIKE '%cancelled%';

-- 주의: 'completed'는 'as_completed', 'outsourcing_completed', 'document_complete' 등과 구분 필요
-- 이미 특정 prefix가 있는 경우는 위에서 처리되었으므로, 단독 'completed'만 처리
UPDATE business_memos
SET content = REPLACE(content, 'completed', '완료')
WHERE content LIKE '%completed%'
  AND content NOT LIKE '%as_completed%'
  AND content NOT LIKE '%outsourcing_completed%'
  AND content NOT LIKE '%document_complete%';

-- ============================================================================
-- 8. 레거시 공통 단계 치환 (prefix 없는 버전)
-- ============================================================================

-- 주의: 이미 prefix가 있는 것들은 위에서 처리되었으므로 조건 추가
UPDATE business_memos
SET content = REPLACE(content, 'customer_contact', '고객 상담')
WHERE content LIKE '%customer_contact%'
  AND content NOT LIKE '%self_customer_contact%'
  AND content NOT LIKE '%subsidy_customer_contact%'
  AND content NOT LIKE '%as_customer_contact%';

UPDATE business_memos
SET content = REPLACE(content, 'site_inspection', '현장 실사')
WHERE content LIKE '%site_inspection%'
  AND content NOT LIKE '%self_site_inspection%'
  AND content NOT LIKE '%subsidy_site_inspection%'
  AND content NOT LIKE '%as_site_inspection%';

UPDATE business_memos
SET content = REPLACE(content, 'quotation', '견적서 작성')
WHERE content LIKE '%quotation%'
  AND content NOT LIKE '%self_quotation%'
  AND content NOT LIKE '%subsidy_quotation%'
  AND content NOT LIKE '%as_quotation%';

UPDATE business_memos
SET content = REPLACE(content, 'contract', '계약 체결')
WHERE content LIKE '%contract%'
  AND content NOT LIKE '%self_contract%'
  AND content NOT LIKE '%subsidy_contract%'
  AND content NOT LIKE '%as_contract%';

UPDATE business_memos
SET content = REPLACE(content, 'product_order', '제품 발주')
WHERE content LIKE '%product_order%'
  AND content NOT LIKE '%self_product_order%'
  AND content NOT LIKE '%subsidy_product_order%'
  AND content NOT LIKE '%dealer_product_ordered%';

UPDATE business_memos
SET content = REPLACE(content, 'product_shipment', '제품 출고')
WHERE content LIKE '%product_shipment%'
  AND content NOT LIKE '%self_product_shipment%'
  AND content NOT LIKE '%subsidy_product_shipment%';

UPDATE business_memos
SET content = REPLACE(content, 'installation', '설치완료')
WHERE content LIKE '%installation%'
  AND content NOT LIKE '%self_installation%'
  AND content NOT LIKE '%subsidy_installation%'
  AND content NOT LIKE '%installation_schedule%';

UPDATE business_memos
SET content = REPLACE(content, 'balance_payment', '잔금 입금')
WHERE content LIKE '%balance_payment%'
  AND content NOT LIKE '%self_balance_payment%';

UPDATE business_memos
SET content = REPLACE(content, 'document_complete', '서류 발송 완료')
WHERE content LIKE '%document_complete%'
  AND content NOT LIKE '%self_document_complete%';

-- ============================================================================
-- 검증 쿼리 (변경 전후 비교)
-- ============================================================================

-- 영문 상태가 남아있는 메모 확인
SELECT
  id,
  business_id,
  content,
  created_at
FROM business_memos
WHERE content LIKE '%_site_inspection%'
   OR content LIKE '%_customer_contact%'
   OR content LIKE '%_quotation%'
   OR content LIKE '%_contract%'
   OR content LIKE '%_order%'
   OR content LIKE '%_completed%'
ORDER BY created_at DESC
LIMIT 20;

-- 영문 상태가 포함된 메모 개수 확인
SELECT COUNT(*) as remaining_english_memos
FROM business_memos
WHERE content ~ '[a-z_]+_[a-z_]+'; -- 영문과 언더스코어 패턴

-- ============================================================================
-- 트랜잭션 종료
-- ============================================================================

-- 문제 없으면 커밋
COMMIT;

-- 문제 발생 시 롤백 (수동 실행)
-- ROLLBACK;

-- ============================================================================
-- 마이그레이션 완료 후 확인
-- ============================================================================

-- 업데이트된 메모 샘플 확인
SELECT
  id,
  business_id,
  content,
  created_at
FROM business_memos
WHERE content LIKE '%상태:%'
ORDER BY created_at DESC
LIMIT 10;

-- 총 업데이트된 메모 수 (히스토리 테이블이 있다면)
-- SELECT COUNT(*) FROM business_memos WHERE updated_at > NOW() - INTERVAL '5 minutes';
