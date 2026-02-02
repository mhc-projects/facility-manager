-- ============================================
-- 회의록 논의사항 필드 제거 마이그레이션
-- ============================================
--
-- 목적: meeting_minutes 테이블의 content JSONB에서 discussions 필드 제거
--
-- 변경사항:
-- 1. 기존 회의록의 content에서 discussions 필드 제거 (빈 배열로 변경)
-- 2. 타입 정의는 하위 호환성을 위해 optional로 유지
--
-- 참고:
-- - 이 마이그레이션은 기존 데이터를 변경하므로 실행 전 백업 권장
-- - discussions 필드는 타입 정의에서 @deprecated로 표시됨
-- ============================================

-- 모든 회의록의 content에서 discussions 필드를 빈 배열로 업데이트
UPDATE meeting_minutes
SET content = jsonb_set(
  content,
  '{discussions}',
  '[]'::jsonb,
  true
)
WHERE content ? 'discussions'  -- discussions 키가 있는 경우에만 업데이트
  AND jsonb_typeof(content->'discussions') != 'null';  -- null이 아닌 경우만

-- ✅ 완료: 기존 회의록의 discussions 필드가 빈 배열로 초기화되었습니다.
--
-- 확인 쿼리:
-- SELECT id, title, content->'discussions' as discussions FROM meeting_minutes LIMIT 10;
