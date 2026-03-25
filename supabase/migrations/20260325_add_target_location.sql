-- Add target_location column to dev_work_log table
ALTER TABLE dev_work_log
  ADD COLUMN IF NOT EXISTS target_location TEXT;

COMMENT ON COLUMN dev_work_log.target_location IS '진행 위치 - 파일 경로, 페이지명, URL 등 작업 대상 위치';
