-- 2026-03-05 마이그레이션으로 search_path가 비워져 실패하던 함수 13개를 public으로 되돌리는 수정 (2026-10-05 운영 적용)
--
-- 배경: app/api/migrations/fix-function-search-path/migration.sql 이 함수에 SET search_path = '' 를 넣었고,
--       본문이 테이블을 스키마 없이 쓰는 함수는 실행 때 `relation "..." does not exist` 로 실패했다.
--       조회 함수 2개는 sql/fix_crawler_read_function_search_path.sql 에서 먼저 고쳤다.
-- 적용 전 확인: 함수마다 운영 DB에서 "트랜잭션 열기 → 고치기 → 실제로 불러 보기 → ROLLBACK" 으로 무엇이 쓰이는지 봤다.
-- 되돌리기: ALTER FUNCTION ... SET search_path = '';

-- (1) 트리거 — 이 세 개는 실패하면서 원래 저장까지 막고 있었다
--     발주 관리: 레이아웃 작성일 등 날짜를 넣으면 이력 기록이 실패해 UPDATE 자체가 실패(3/5 이후 모든 행의 날짜가 비어 있음)
ALTER FUNCTION public.record_order_management_changes() SET search_path = public;
--     배송지: 기본 배송지로 지정(또는 기본으로 새로 등록)하면 실패
ALTER FUNCTION public.manage_default_delivery_address() SET search_path = public;
--     실사 일정: survey_events 를 직접 추가·수정하면 실패(사업장 정보 쪽에서 넣는 흐름은 플래그로 건너뛰어 정상이었다)
ALTER FUNCTION public.sync_survey_to_business_info() SET search_path = public;

-- (2) 조회·정리 함수 — 앱·트리거·정책·뷰 어디에서도 부르지 않는다
ALTER FUNCTION public.get_photo_counts(uuid[]) SET search_path = public;
ALTER FUNCTION public.get_assignee_task_stats(text) SET search_path = public;
ALTER FUNCTION public.check_facility_task_permission(uuid, uuid, text) SET search_path = public;
ALTER FUNCTION public.cleanup_delay_scheduler_logs() SET search_path = public;
ALTER FUNCTION public.cleanup_expired_delay_notifications() SET search_path = public;

-- (3) 부를 때만 쓰는 함수 — 크롤러 기록(크롤러 워크플로는 2026-01부터 꺼져 있다), 발주 완료(앱은 자체 SQL을 쓴다)
ALTER FUNCTION public.record_crawl_success(text) SET search_path = public;
ALTER FUNCTION public.record_crawl_failure(text, text) SET search_path = public;
ALTER FUNCTION public.reactivate_url(text) SET search_path = public;
ALTER FUNCTION public.import_urls_from_csv(jsonb) SET search_path = public;
ALTER FUNCTION public.complete_order(uuid, uuid) SET search_path = public;

-- ============================================================
-- 일부러 고치지 않은 것 (search_path = '' 그대로)
-- ============================================================
-- 업무 알림 계열 4개 — notify_facility_task_changes(facility_tasks 트리거), create_task_assignment_notifications,
--   update_task_assignment_notifications, trigger_task_assignment_notifications(어디에도 안 붙어 있음)
--   앱이 2026-09-04부터 task_notifications 를 직접 넣는다(app/api/facility-tasks/route.ts). 트리거를 되살리면 배정·상태 변경 알림이
--   두 번씩 쌓이고, 지금까지 한 번도 없던 전역 알림(task_created·task_status_changed)이 새로 생긴다. 사용자 결정 대기.
-- advance_task_to_next_step — 단계표가 옛 상태값(customer_contact …) 그대로다. 지금 업무는 self_…/subsidy_…/custom_… 이라
--   고쳐도 모든 업무에 "다음 단계가 없다"고 답한다. /admin/tasks 의 "업무 완료" 버튼은 task_stages 기준으로 다시 만들거나 없애야 한다.
-- restore_data_from_history — 경로를 고쳐도 `INSERT has more target columns than expressions` (NULL 값이 빠져 열 수가 안 맞음).
-- mark_delay_notification_as_read — 경로를 고쳐도 `column reference "notification_id" is ambiguous`. 부르는 곳 없음.
-- cleanup_expired_notifications — 경로를 고쳐도 `column "expires_at" does not exist`(user_notifications). 부르는 곳 없음.
-- create_task_history — 옛 tasks 표(14행, 마지막 수정 2025-09)의 트리거. 손대지 않음.
-- log_contract_history_changes, save_data_history, validate_business_id — 트리거 함수지만 어느 표에도 붙어 있지 않다.
