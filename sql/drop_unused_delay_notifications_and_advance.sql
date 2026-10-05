-- 앱 어디에서도 쓰지 않는 지연 알림 계열(표 4·뷰 4·함수 3)과 업무 완료 함수 등 함수 2개를 지운다 (2026-10-05)
-- 근거: 앱 코드(ts/tsx/js/yml) 전체에 delay_* 참조 0건, pg_cron·엣지 함수 없음, 바깥에서 거는 외래키 없음,
--       delay_notifications는 2025-09-29 설치 테스트 1행뿐, delay_scheduler_logs 0행(스케줄러가 돈 적 없음).
--       advance_task_to_next_step은 부르던 API(/api/facility-tasks/advance)와 화면 연결 코드를 같은 날 지움.
-- 되돌리기: sql/backup_dropped_2026-10-05/ 의 두 파일을 psql로 실행(표·데이터·뷰·정책·권한, 함수 정의).
BEGIN;

DROP FUNCTION public.mark_delay_notification_as_read(bigint, uuid, character varying);
DROP FUNCTION public.cleanup_expired_delay_notifications();
DROP FUNCTION public.cleanup_delay_scheduler_logs();
-- user_notifications.expires_at이 없어 실행하면 항상 실패하던 함수, 부르는 곳 없음
DROP FUNCTION public.cleanup_expired_notifications();
DROP FUNCTION public.advance_task_to_next_step(uuid, text);

DROP VIEW public.v_active_delay_thresholds;
DROP VIEW public.v_delay_notification_stats;
DROP VIEW public.v_user_unread_delay_notifications;
DROP VIEW public.v_task_delay_notifications;

-- CASCADE를 쓰지 않는다: 위에서 확인하지 못한 의존 객체가 있으면 여기서 멈춘다
DROP TABLE public.delay_notification_reads;
DROP TABLE public.delay_notifications;
DROP TABLE public.delay_scheduler_logs;
DROP TABLE public.delay_thresholds;

COMMIT;
