-- guideline_uploads 테이블에 domain 컬럼 추가 (dpf/iot 구분)
ALTER TABLE guideline_uploads
  ADD COLUMN IF NOT EXISTS domain TEXT NOT NULL DEFAULT 'dpf'
  CHECK (domain IN ('dpf', 'iot'));

-- wiki_nodes.tags 는 이미 TEXT[] 타입으로 존재 — 별도 마이그레이션 불필요
-- 업로드 시 tags 배열에 'dpf' 또는 'iot' 값이 저장됨

-- 기존 wiki_nodes에 dpf 태그 일괄 적용 (기존 데이터가 DPF 지침이므로)
UPDATE wiki_nodes
SET tags = array_append(COALESCE(tags, '{}'), 'dpf')
WHERE NOT ('dpf' = ANY(COALESCE(tags, '{}')))
  AND is_published = true;
