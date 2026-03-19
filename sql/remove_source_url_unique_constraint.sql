-- Remove unique constraint on source_url to allow duplicate URLs
-- Reason: 지자체 페이지는 동일 URL로 내용이 업데이트되는 경우가 있어
--         동일 URL 재등록을 허용하고 경고만 표시하는 방식으로 변경

DROP INDEX IF EXISTS idx_announcements_source_url;
