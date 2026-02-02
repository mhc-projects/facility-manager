-- ============================================
-- 회의록 반복 이슈 조회 성능 최적화 인덱스
-- ============================================
-- 작성일: 2025-02-02
-- 목적: 정기회의에서 미해결 이슈 조회 성능 향상

-- 1. meeting_type과 status를 이용한 복합 인덱스
-- 정기회의이면서 archived가 아닌 회의록 빠르게 조회
CREATE INDEX IF NOT EXISTS idx_meeting_minutes_type_status
ON meeting_minutes (meeting_type, status)
WHERE status != 'archived';

-- 2. meeting_date 인덱스
-- 날짜별 정렬 및 days_since 필터링 성능 향상
CREATE INDEX IF NOT EXISTS idx_meeting_minutes_date
ON meeting_minutes (meeting_date DESC)
WHERE meeting_type = '정기회의' AND status != 'archived';

-- 3. JSONB 이슈 검색을 위한 GIN 인덱스
-- content->business_issues 배열 내부 검색 성능 향상
CREATE INDEX IF NOT EXISTS idx_meeting_minutes_business_issues_gin
ON meeting_minutes USING GIN ((content->'business_issues'))
WHERE meeting_type = '정기회의';

-- 4. business_id 검색을 위한 인덱스 (JSONB 경로 표현식)
-- 특정 사업장의 이슈 빠르게 찾기
CREATE INDEX IF NOT EXISTS idx_meeting_minutes_business_id
ON meeting_minutes USING GIN ((content->'business_issues'))
WHERE meeting_type = '정기회의';

-- ============================================
-- 인덱스 생성 확인 쿼리
-- ============================================
-- SELECT
--   indexname,
--   indexdef
-- FROM pg_indexes
-- WHERE tablename = 'meeting_minutes'
--   AND indexname LIKE 'idx_meeting%';

-- ============================================
-- 성능 테스트 쿼리
-- ============================================

-- 1. 정기회의에서 미해결 이슈 조회 (인덱스 사용 확인)
-- EXPLAIN ANALYZE
-- SELECT id, title, meeting_date, content->'business_issues' as issues
-- FROM meeting_minutes
-- WHERE meeting_type = '정기회의'
--   AND status != 'archived'
-- ORDER BY meeting_date DESC;

-- 2. 특정 사업장의 모든 이슈 조회
-- EXPLAIN ANALYZE
-- SELECT id, title, meeting_date,
--        jsonb_array_elements(content->'business_issues') as issue
-- FROM meeting_minutes
-- WHERE meeting_type = '정기회의'
--   AND status != 'archived'
--   AND content->'business_issues' @> '[{"business_id": "your-business-id"}]';

-- 3. N일 이전부터의 미해결 이슈 조회
-- EXPLAIN ANALYZE
-- SELECT id, title, meeting_date
-- FROM meeting_minutes
-- WHERE meeting_type = '정기회의'
--   AND status != 'archived'
--   AND meeting_date >= CURRENT_DATE - INTERVAL '30 days'
-- ORDER BY meeting_date DESC;

-- ============================================
-- 인덱스 삭제 (롤백용)
-- ============================================
-- DROP INDEX IF EXISTS idx_meeting_minutes_type_status;
-- DROP INDEX IF EXISTS idx_meeting_minutes_date;
-- DROP INDEX IF EXISTS idx_meeting_minutes_business_issues_gin;
-- DROP INDEX IF EXISTS idx_meeting_minutes_business_id;
