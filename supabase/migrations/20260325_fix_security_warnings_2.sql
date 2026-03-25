-- Migration: 보안 경고(WARN) 잔여 6개 해소
-- Created: 2026-03-25

-- uploaded_files
DROP POLICY IF EXISTS "모든 작업 허용 - uploaded_files" ON public.uploaded_files;
CREATE POLICY "uploaded_files: server only access"
  ON public.uploaded_files FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

-- user_activity_logs
DROP POLICY IF EXISTS "System can insert activity logs" ON public.user_activity_logs;
CREATE POLICY "user_activity_logs: server only access"
  ON public.user_activity_logs FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

-- user_notification_reads
DROP POLICY IF EXISTS "service_role_full_access" ON public.user_notification_reads;
CREATE POLICY "user_notification_reads: server only access"
  ON public.user_notification_reads FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

-- user_notifications
DROP POLICY IF EXISTS "Users can manage own notification records" ON public.user_notifications;
CREATE POLICY "user_notifications: server only access"
  ON public.user_notifications FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

-- weekly_reports
DROP POLICY IF EXISTS "System can insert reports" ON public.weekly_reports;
DROP POLICY IF EXISTS "System can update reports" ON public.weekly_reports;
CREATE POLICY "weekly_reports: server only access"
  ON public.weekly_reports FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);
