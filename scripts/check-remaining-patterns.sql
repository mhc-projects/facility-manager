-- 남아있는 영문 패턴 상세 확인

-- 1. final_document_submit 패턴
SELECT
  'final_document_submit' as pattern,
  COUNT(*) as count
FROM business_memos
WHERE content LIKE '%final_document_submit%';

-- 2. completion_supplement 패턴 (모든 변형)
SELECT
  'completion_supplement (any)' as pattern,
  COUNT(*) as count
FROM business_memos
WHERE content LIKE '%completion_supplement%';

-- 3. pre_construction_supplement 패턴 (모든 변형)
SELECT
  'pre_construction_supplement (any)' as pattern,
  COUNT(*) as count
FROM business_memos
WHERE content LIKE '%pre_construction_supplement%';

-- 4. 실제 영문 패턴이 남아있는 레코드 샘플 (언더스코어 2개 이상)
SELECT
  id,
  content,
  created_at,
  LENGTH(content) as content_length
FROM business_memos
WHERE content ~ '[a-z]{2,}_[a-z]{2,}'
ORDER BY created_at DESC
LIMIT 25;
