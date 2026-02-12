-- =====================================================
-- 최종 영문 패턴 제거 스크립트
-- =====================================================
-- 문제: NOT LIKE 조건이 너무 엄격해서 일부만 한글인 레코드를 놓침
-- 해결: NOT LIKE 조건 제거하고 무조건 REPLACE 실행
-- =====================================================

BEGIN;

-- 1. final_document_submit → 보조금지급신청서 제출
-- 조건 없이 모든 final_document_submit을 치환
UPDATE business_memos
SET content = REPLACE(content, 'final_document_submit', '보조금지급신청서 제출')
WHERE content LIKE '%final_document_submit%';

-- 2. completion_supplement 변형 처리 (구체적 → 일반적 순서)
UPDATE business_memos
SET content = REPLACE(content, 'completion_supplement_3rd', '준공 보완 3차')
WHERE content LIKE '%completion_supplement_3rd%';

UPDATE business_memos
SET content = REPLACE(content, 'completion_supplement_2nd', '준공 보완 2차')
WHERE content LIKE '%completion_supplement_2nd%';

UPDATE business_memos
SET content = REPLACE(content, 'completion_supplement_1st', '준공 보완 1차')
WHERE content LIKE '%completion_supplement_1st%';

-- 일반 completion_supplement (위에서 처리 안 된 것)
UPDATE business_memos
SET content = REPLACE(content, 'completion_supplement', '준공 보완')
WHERE content LIKE '%completion_supplement%';

-- 3. pre_construction_supplement 변형 처리 (구체적 → 일반적 순서)
UPDATE business_memos
SET content = REPLACE(content, 'pre_construction_supplement_2nd', '착공 보완 2차')
WHERE content LIKE '%pre_construction_supplement_2nd%';

UPDATE business_memos
SET content = REPLACE(content, 'pre_construction_supplement_1st', '착공 보완 1차')
WHERE content LIKE '%pre_construction_supplement_1st%';

-- 일반 pre_construction_supplement (위에서 처리 안 된 것)
UPDATE business_memos
SET content = REPLACE(content, 'pre_construction_supplement', '착공 보완')
WHERE content LIKE '%pre_construction_supplement%';

-- =====================================================
-- 검증
-- =====================================================

-- 1. 남은 영문 개수 확인
SELECT COUNT(*) as remaining_english
FROM business_memos
WHERE content ~ '[a-z_]+_[a-z_]+';

-- 2. 변환된 샘플 확인
SELECT id, content, created_at
FROM business_memos
WHERE content LIKE '%보조금지급신청서 제출%'
   OR content LIKE '%준공 보완%'
   OR content LIKE '%착공 보완%'
ORDER BY created_at DESC
LIMIT 10;

-- 3. 혹시 아직도 남아있다면 어떤 패턴인지 확인
SELECT
  id,
  content,
  created_at
FROM business_memos
WHERE content ~ '[a-z_]+_[a-z_]+'
ORDER BY created_at DESC
LIMIT 10;

-- =====================================================
-- 결과가 0이면 COMMIT
-- =====================================================
-- COMMIT;

-- 중요: 검증 완료 후 위의 COMMIT 주석 제거하고 실행!
