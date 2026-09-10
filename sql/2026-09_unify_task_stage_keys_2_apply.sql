-- sql/2026-09_unify_task_stage_keys_2_apply.sql
-- 카테고리 간 같은 라벨·다른 stage_key 통일 — 2단계: 실제 반영
--
-- 반드시 1_preview.sql을 먼저 실행해 B_SUMMARY의 conflict_rows_must_be_0 이 전부 0인지 확인한다.
-- Supabase SQL 에디터는 문장을 같은 세션에서 실행한다는 보장이 없어(임시 테이블·DO 블록·BEGIN/COMMIT 사용 불가)
-- 모든 문장을 독립적으로, 그리고 다시 실행해도 안전하게(멱등) 작성했다. 중간에 실패하면 파일 전체를 다시 실행하면 된다.
--   - 매핑 테이블은 일반 테이블로 만들고 마지막에 삭제한다.
--   - 백업은 CREATE TABLE IF NOT EXISTS ... AS 로 최초 1회만 생성된다.
--   - 새 키 충돌은 task_stages의 unique(progress_category_id, stage_key) 제약이 막는다(충돌 시 STEP 2에서 오류로 중단).
-- 마지막 결과의 remaining_* 세 값이 모두 0이어야 정상이다.
-- 되돌리기: 백업 테이블(task_stages_backup_20260909_keys, facility_tasks_backup_20260909_keys,
--          task_status_history_backup_20260909_keys)에서 id 기준으로 stage_key/status를 복원한다.

-- STEP 0. 매핑 테이블
DROP TABLE IF EXISTS task_stage_key_mapping_20260909;
CREATE TABLE task_stage_key_mapping_20260909 AS
SELECT * FROM (VALUES
    (10, 'subsidy_installation',   'subsidy_pre_completion_document_submit'), -- [보조금]설치완료(준공도서 작성 필요)
    (10, 'custom_1778201850667',   'custom_1778201843963'),                   -- [보조금]진행불가
    (10, 'custom_1778198486933',   'custom_1777968825327'),                   -- [보조금]승인(착공신청서제출필요)
    (10, 'custom_1778198741057',   'subsidy_completion_supplement_2nd'),      -- [보조금]준공 보완 2차
    (15, 'custom_1788503069483',   'custom_1788770925586'),                   -- 실사완료(견적서 작성중)
    (15, 'custom_1788503054458',   'custom_1788770912696'),                   -- 실사필요(고객상담)
    (15, 'custom_1788503059615',   'custom_1788770918679'),                   -- 실사예정
    (15, 'custom_1788503083670',   'custom_1788770933682'),                   -- 진행확인필요(견적서 송부 완료)
    (15, 'custom_1788503088199',   'custom_1788770936276')                    -- 수주완료
) v(category_id, old_key, new_key);

-- STEP 1. 백업 (영향받는 행만, 최초 1회)
CREATE TABLE IF NOT EXISTS task_stages_backup_20260909_keys AS
SELECT s.* FROM task_stages s
JOIN task_stage_key_mapping_20260909 m ON m.category_id = s.progress_category_id AND m.old_key = s.stage_key;

CREATE TABLE IF NOT EXISTS facility_tasks_backup_20260909_keys AS
SELECT t.* FROM facility_tasks t
JOIN task_stage_key_mapping_20260909 m ON m.old_key = t.status
WHERE EXISTS (
        SELECT 1 FROM business_info b
        JOIN progress_categories pc ON pc.name = b.progress_status
        WHERE pc.id = m.category_id
          AND (t.business_id = b.id OR (t.business_id IS NULL AND t.business_name = b.business_name))
      );

CREATE TABLE IF NOT EXISTS task_status_history_backup_20260909_keys AS
SELECT h.* FROM task_status_history h
JOIN facility_tasks t ON t.id = h.task_id
JOIN task_stage_key_mapping_20260909 m ON m.old_key = h.status
WHERE EXISTS (
        SELECT 1 FROM business_info b
        JOIN progress_categories pc ON pc.name = b.progress_status
        WHERE pc.id = m.category_id
          AND (t.business_id = b.id OR (t.business_id IS NULL AND t.business_name = b.business_name))
      );

-- STEP 2. task_stages 키 변경 (라벨·순서·is_forecast_target은 그대로)
UPDATE task_stages s
SET stage_key = m.new_key, updated_at = NOW()
FROM task_stage_key_mapping_20260909 m
WHERE s.progress_category_id = m.category_id AND s.stage_key = m.old_key;

-- STEP 3. facility_tasks.status 치환 (업무 뷰와 같은 조인 규칙, 비활성·삭제 업무 포함)
UPDATE facility_tasks t
SET status = m.new_key
FROM task_stage_key_mapping_20260909 m
WHERE t.status = m.old_key
  AND EXISTS (
        SELECT 1 FROM business_info b
        JOIN progress_categories pc ON pc.name = b.progress_status
        WHERE pc.id = m.category_id
          AND (t.business_id = b.id OR (t.business_id IS NULL AND t.business_name = b.business_name))
      );

-- STEP 4. task_status_history.status 치환 (단계 이력 화면 일치)
UPDATE task_status_history h
SET status = m.new_key
FROM task_stage_key_mapping_20260909 m, facility_tasks t
WHERE t.id = h.task_id
  AND h.status = m.old_key
  AND EXISTS (
        SELECT 1 FROM business_info b
        JOIN progress_categories pc ON pc.name = b.progress_status
        WHERE pc.id = m.category_id
          AND (t.business_id = b.id OR (t.business_id IS NULL AND t.business_name = b.business_name))
      );

-- STEP 5. 검증: remaining_* 는 모두 0이어야 한다
SELECT
  (SELECT count(*) FROM task_stages s JOIN task_stage_key_mapping_20260909 m ON m.category_id = s.progress_category_id AND m.old_key = s.stage_key) AS remaining_stage_rows,
  (SELECT count(*) FROM facility_tasks t JOIN task_stage_key_mapping_20260909 m ON m.old_key = t.status WHERE EXISTS (
        SELECT 1 FROM business_info b
        JOIN progress_categories pc ON pc.name = b.progress_status
        WHERE pc.id = m.category_id
          AND (t.business_id = b.id OR (t.business_id IS NULL AND t.business_name = b.business_name))
      )) AS remaining_task_rows,
  (SELECT count(*) FROM task_status_history h JOIN facility_tasks t ON t.id = h.task_id JOIN task_stage_key_mapping_20260909 m ON m.old_key = h.status
     WHERE EXISTS (
        SELECT 1 FROM business_info b
        JOIN progress_categories pc ON pc.name = b.progress_status
        WHERE pc.id = m.category_id
          AND (t.business_id = b.id OR (t.business_id IS NULL AND t.business_name = b.business_name))
      )) AS remaining_history_rows,
  (SELECT count(*) FROM task_stages_backup_20260909_keys) AS backup_stage_rows,
  (SELECT count(*) FROM facility_tasks_backup_20260909_keys) AS backup_task_rows,
  (SELECT count(*) FROM task_status_history_backup_20260909_keys) AS backup_history_rows;

-- STEP 6. 매핑 테이블 정리 (백업 테이블은 남긴다)
DROP TABLE IF EXISTS task_stage_key_mapping_20260909;
