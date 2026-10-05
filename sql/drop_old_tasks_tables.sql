-- 칸반(facility_tasks) 이전의 옛 업무 표 계열을 지운다 (2026-10-05)
-- 대상: 표 tasks(14행)·task_history(16행)·task_attachments(0행)·task_categories(21행)·task_statuses(11행), 뷰 task_details,
--       tasks에만 붙어 있던 트리거 함수 create_task_history·update_task_updated_at
-- 근거: 이 표들을 쓰던 화면(/admin/tasks/[id], /edit, /create)과 /api/tasks를 같은 날 지움. 모든 표의 마지막 행이 2025-09-16.
--       바깥에서 이 표들을 가리키는 외래키 없음, 다른 뷰·함수 참조 없음.
--       /api/projects·/api/workflows도 tasks를 쓰지만 projects 표가 없어 원래 동작하지 않고 부르는 화면도 없다.
-- 지우지 않는 것(지금 쓰는 표): facility_tasks, task_notifications, task_stages, task_status_history와 그 뷰들
-- 되돌리기: sql/backup_dropped_2026-10-05/old_tasks_functions.sql → old_tasks_tables_and_view.sql 순서로 psql 17로 실행
BEGIN;

DROP VIEW public.task_details;
-- CASCADE를 쓰지 않는다: 확인하지 못한 의존 객체가 있으면 여기서 멈춘다
DROP TABLE public.task_attachments;
DROP TABLE public.task_history;
DROP TABLE public.tasks;
DROP TABLE public.task_categories;
DROP TABLE public.task_statuses;
DROP FUNCTION public.create_task_history();
DROP FUNCTION public.update_task_updated_at();

COMMIT;
