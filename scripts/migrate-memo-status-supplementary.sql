-- =====================================================
-- 업무 메모 상태 한글 치환 보완 마이그레이션
-- =====================================================
--
-- 목적: 초기 마이그레이션에서 누락된 레거시 상태 코드 23개 처리
--
-- 실행 전 확인:
-- SELECT COUNT(*) FROM business_memos WHERE content ~ '[a-z_]+_[a-z_]+';
--
-- 예상 결과: 23개 → 0개
-- =====================================================

BEGIN;

-- =====================================================
-- 1. 레거시 "final_document_submit" 패턴 (7개)
-- =====================================================
-- 이 패턴은 subsidy_final_document_submit의 축약형으로 사용됨
UPDATE business_memos
SET content = REPLACE(content, 'final_document_submit', '보조금지급신청서 제출')
WHERE content LIKE '%final_document_submit%'
  AND content NOT LIKE '%보조금지급신청서 제출%';

-- =====================================================
-- 2. 레거시 "completion_supplement" 패턴 (11개)
-- =====================================================
-- 이 패턴은 준공 보완의 일반적인 형태 (1차/2차/3차 구분 없음)
-- 먼저 가장 구체적인 패턴부터 처리
UPDATE business_memos
SET content = REPLACE(content, 'completion_supplement_3rd', '준공 보완 3차')
WHERE content LIKE '%completion_supplement_3rd%'
  AND content NOT LIKE '%준공 보완 3차%';

UPDATE business_memos
SET content = REPLACE(content, 'completion_supplement_2nd', '준공 보완 2차')
WHERE content LIKE '%completion_supplement_2nd%'
  AND content NOT LIKE '%준공 보완 2차%';

UPDATE business_memos
SET content = REPLACE(content, 'completion_supplement_1st', '준공 보완 1차')
WHERE content LIKE '%completion_supplement_1st%'
  AND content NOT LIKE '%준공 보완 1차%';

-- 이제 일반적인 completion_supplement 처리 (위에서 처리되지 않은 것들)
UPDATE business_memos
SET content = REPLACE(content, 'completion_supplement', '준공 보완')
WHERE content LIKE '%completion_supplement%'
  AND content NOT LIKE '%준공 보완%';

-- =====================================================
-- 3. 레거시 "pre_construction_supplement" 패턴 (5개)
-- =====================================================
-- 이 패턴은 착공 보완의 일반적인 형태 (1차/2차 구분 없음)
-- 먼저 가장 구체적인 패턴부터 처리
UPDATE business_memos
SET content = REPLACE(content, 'pre_construction_supplement_2nd', '착공 보완 2차')
WHERE content LIKE '%pre_construction_supplement_2nd%'
  AND content NOT LIKE '%착공 보완 2차%';

UPDATE business_memos
SET content = REPLACE(content, 'pre_construction_supplement_1st', '착공 보완 1차')
WHERE content LIKE '%pre_construction_supplement_1st%'
  AND content NOT LIKE '%착공 보완 1차%';

-- 이제 일반적인 pre_construction_supplement 처리 (위에서 처리되지 않은 것들)
UPDATE business_memos
SET content = REPLACE(content, 'pre_construction_supplement', '착공 보완')
WHERE content LIKE '%pre_construction_supplement%'
  AND content NOT LIKE '%착공 보완%';

-- =====================================================
-- 검증 쿼리
-- =====================================================
-- 실행 후 이 쿼리로 확인하세요:
--
-- 1. 남은 영문 패턴 개수 확인 (0개가 목표)
-- SELECT COUNT(*) as remaining_english
-- FROM business_memos
-- WHERE content ~ '[a-z_]+_[a-z_]+';
--
-- 2. 변환된 샘플 확인
-- SELECT id, content, created_at
-- FROM business_memos
-- WHERE content LIKE '%보조금지급신청서 제출%'
--    OR content LIKE '%준공 보완%'
--    OR content LIKE '%착공 보완%'
-- ORDER BY created_at DESC
-- LIMIT 10;
--
-- 3. 특정 패턴이 남아있는지 확인
-- SELECT id, content, created_at
-- FROM business_memos
-- WHERE content LIKE '%final_document_submit%'
--    OR content LIKE '%completion_supplement%'
--    OR content LIKE '%pre_construction_supplement%'
-- ORDER BY created_at DESC;

-- =====================================================
-- 롤백 방법
-- =====================================================
-- 문제가 발생하면 즉시:
-- ROLLBACK;
--
-- 그리고 백업 테이블에서 복원:
-- UPDATE business_memos m
-- SET content = b.content
-- FROM business_memos_backup_20260212 b
-- WHERE m.id = b.id
--   AND (
--     m.content LIKE '%보조금지급신청서 제출%' OR
--     m.content LIKE '%준공 보완%' OR
--     m.content LIKE '%착공 보완%'
--   );
-- =====================================================

-- 트랜잭션 커밋 (검증 완료 후 실행)
-- COMMIT;

-- 중요: 검증 완료 전까지 COMMIT 주석 처리 유지!
