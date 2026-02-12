-- =====================================================
-- 남은 영문 패턴 진단 쿼리
-- =====================================================

-- 1. 정확히 어떤 영문 패턴들이 남아있는지 추출
SELECT
  DISTINCT
  regexp_matches(content, '([a-z_]{3,})', 'g') as english_pattern,
  COUNT(*) as occurrence_count
FROM business_memos
WHERE content ~ '[a-z_]+_[a-z_]+'
GROUP BY english_pattern
ORDER BY occurrence_count DESC;

-- 2. final_document_submit가 있는 레코드들 상세 확인
SELECT
  id,
  content,
  created_at,
  CASE
    WHEN content LIKE '%상태: final_document_submit%' THEN '상태 필드에 영문'
    WHEN content LIKE '%final_document_submit%' THEN '다른 위치에 영문'
    ELSE '패턴 불명확'
  END as pattern_location
FROM business_memos
WHERE content LIKE '%final_document_submit%'
ORDER BY created_at DESC;

-- 3. 실제로 UPDATE가 필요한 레코드 수 확인
SELECT COUNT(*) as needs_update
FROM business_memos
WHERE content LIKE '%final_document_submit%'
  AND content NOT LIKE '%보조금지급신청서 제출%';

SELECT COUNT(*) as needs_update
FROM business_memos
WHERE content LIKE '%completion_supplement%'
  AND content NOT LIKE '%준공 보완%';

SELECT COUNT(*) as needs_update
FROM business_memos
WHERE content LIKE '%pre_construction_supplement%'
  AND content NOT LIKE '%착공 보완%';

-- 4. 영문 패턴이 있는 모든 레코드 샘플
SELECT
  id,
  LEFT(content, 200) as content_preview,
  created_at
FROM business_memos
WHERE content ~ '[a-z_]+_[a-z_]+'
ORDER BY created_at DESC
LIMIT 30;
