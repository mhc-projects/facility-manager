-- sql/2026-09_unify_task_stage_keys_1_preview.sql
-- 카테고리 간 같은 라벨·다른 stage_key 통일 — 1단계: 미리보기 (데이터 변경 없음)
--
-- 기준: sort_order가 앞선 카테고리의 키로 통일한다.
--   보조금(5년경과, id 10) → 보조금(id 2) 키
--   모니터링시스템(PLC포함, id 15) → 인허가(id 11) 키
-- 업무의 카테고리 판정은 facility_tasks_with_business 뷰와 같은 규칙(business_id 또는 business_name 조인)을 쓰되,
-- 뷰와 달리 비활성/삭제 업무도 포함한다(나중에 되살려도 옛 키가 남지 않도록).
-- 이 파일을 먼저 실행해 어떤 업무가 어떻게 바뀌는지 확인한 뒤 2_apply.sql을 실행한다.

-- A. 바뀔 업무 목록 (사업장별)
WITH m(category_id, old_key, new_key) AS (
  VALUES
    (10, 'subsidy_installation',   'subsidy_pre_completion_document_submit'), -- [보조금]설치완료(준공도서 작성 필요)
    (10, 'custom_1778201850667',   'custom_1778201843963'),                   -- [보조금]진행불가
    (10, 'custom_1778198486933',   'custom_1777968825327'),                   -- [보조금]승인(착공신청서제출필요)
    (10, 'custom_1778198741057',   'subsidy_completion_supplement_2nd'),      -- [보조금]준공 보완 2차
    (15, 'custom_1788503069483',   'custom_1788770925586'),                   -- 실사완료(견적서 작성중)
    (15, 'custom_1788503054458',   'custom_1788770912696'),                   -- 실사필요(고객상담)
    (15, 'custom_1788503059615',   'custom_1788770918679'),                   -- 실사예정
    (15, 'custom_1788503083670',   'custom_1788770933682'),                   -- 진행확인필요(견적서 송부 완료)
    (15, 'custom_1788503088199',   'custom_1788770936276')                    -- 수주완료
)
SELECT 'A_TASK' AS section,
       (SELECT name FROM progress_categories WHERE id = m.category_id) AS category,
       t.business_name, t.status AS old_key, m.new_key,
       (SELECT stage_label FROM task_stages s WHERE s.progress_category_id = m.category_id AND s.stage_key = m.old_key) AS label,
       t.is_active, t.is_deleted
FROM facility_tasks t
JOIN m ON m.old_key = t.status
WHERE EXISTS (
        SELECT 1 FROM business_info b
        JOIN progress_categories pc ON pc.name = b.progress_status
        WHERE pc.id = m.category_id
          AND (t.business_id = b.id OR (t.business_id IS NULL AND t.business_name = b.business_name))
      )
ORDER BY category, label, t.business_name;

-- B. 요약 건수 — conflict_rows_must_be_0 이 전부 0이어야 2_apply.sql을 실행할 수 있다
WITH m(category_id, old_key, new_key) AS (
  VALUES
    (10, 'subsidy_installation',   'subsidy_pre_completion_document_submit'), -- [보조금]설치완료(준공도서 작성 필요)
    (10, 'custom_1778201850667',   'custom_1778201843963'),                   -- [보조금]진행불가
    (10, 'custom_1778198486933',   'custom_1777968825327'),                   -- [보조금]승인(착공신청서제출필요)
    (10, 'custom_1778198741057',   'subsidy_completion_supplement_2nd'),      -- [보조금]준공 보완 2차
    (15, 'custom_1788503069483',   'custom_1788770925586'),                   -- 실사완료(견적서 작성중)
    (15, 'custom_1788503054458',   'custom_1788770912696'),                   -- 실사필요(고객상담)
    (15, 'custom_1788503059615',   'custom_1788770918679'),                   -- 실사예정
    (15, 'custom_1788503083670',   'custom_1788770933682'),                   -- 진행확인필요(견적서 송부 완료)
    (15, 'custom_1788503088199',   'custom_1788770936276')                    -- 수주완료
)
SELECT 'B_SUMMARY' AS section, m.category_id, m.old_key, m.new_key,
       (SELECT count(*) FROM task_stages s WHERE s.progress_category_id = m.category_id AND s.stage_key = m.old_key) AS stage_rows,
       (SELECT count(*) FROM task_stages s WHERE s.progress_category_id = m.category_id AND s.stage_key = m.new_key) AS conflict_rows_must_be_0,
       (SELECT count(*) FROM facility_tasks t WHERE t.status = m.old_key AND EXISTS (
        SELECT 1 FROM business_info b
        JOIN progress_categories pc ON pc.name = b.progress_status
        WHERE pc.id = m.category_id
          AND (t.business_id = b.id OR (t.business_id IS NULL AND t.business_name = b.business_name))
      )) AS task_rows,
       (SELECT count(*) FROM task_status_history h JOIN facility_tasks t ON t.id = h.task_id
         WHERE h.status = m.old_key AND EXISTS (
        SELECT 1 FROM business_info b
        JOIN progress_categories pc ON pc.name = b.progress_status
        WHERE pc.id = m.category_id
          AND (t.business_id = b.id OR (t.business_id IS NULL AND t.business_name = b.business_name))
      )) AS history_rows
FROM m
ORDER BY m.category_id, m.old_key;
