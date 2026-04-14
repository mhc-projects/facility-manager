-- 업무관리 사업장명을 사업장관리의 현재 이름으로 동기화
-- facility_tasks_with_business 뷰에서 t.business_name 대신
-- b.business_name(business_info의 현재 사업장명)을 우선 사용하도록 수정
-- business_id 미연결 시 t.business_name으로 fallback

DROP VIEW IF EXISTS facility_tasks_with_business;

CREATE VIEW facility_tasks_with_business AS
SELECT
  t.id,
  t.created_at,
  t.updated_at,
  t.title,
  t.description,
  -- 사업장명: business_info의 현재 이름 우선, 연결 안 된 경우 저장된 이름 사용
  COALESCE(b.business_name, t.business_name) AS business_name,
  t.business_id,
  -- task_type: business_info.progress_status에서 실시간 파생
  CASE
    WHEN b.progress_status ILIKE '%보조금%'  THEN 'subsidy'
    WHEN b.progress_status ILIKE '%자비%'    THEN 'self'
    WHEN b.progress_status = 'AS'            THEN 'as'
    WHEN b.progress_status ILIKE '%외주%'    THEN 'outsourcing'
    WHEN b.progress_status ILIKE '%대리점%'  THEN 'dealer'
    WHEN b.progress_status IN ('진행불가', '확인필요') THEN 'etc'
    ELSE 'etc'
  END::varchar(20) AS task_type,
  b.progress_status,
  t.status,
  t.priority,
  t.assignee,
  t.assignees,
  t.primary_assignee_id,
  t.assignee_updated_at,
  t.start_date,
  t.due_date,
  t.completed_at,
  t.notes,
  t.created_by,
  t.created_by_name,
  t.last_modified_by,
  t.last_modified_by_name,
  t.is_active,
  t.is_deleted,
  -- business_info에서 JOIN
  b.address,
  b.manager_name,
  b.manager_contact,
  b.local_government,
  b.construction_report_submitted_at AS construction_report_date,
  -- 업무관리 테이블용 추가 필드 (설치완료/부착통보/그린링크)
  b.installation_date,
  b.order_date,
  b.attachment_completion_submitted_at,
  b.greenlink_confirmation_submitted_at,
  -- 생성자/수정자 정보
  creator.name  AS created_by_user_name,
  creator.email AS created_by_user_email,
  creator.permission_level AS created_by_permission_level,
  modifier.name  AS last_modified_by_user_name,
  modifier.email AS last_modified_by_user_email,
  modifier.permission_level AS last_modified_by_permission_level
FROM facility_tasks t
LEFT JOIN business_info b
  ON t.business_id = b.id
  OR (t.business_id IS NULL AND t.business_name = b.business_name)
LEFT JOIN employees creator  ON t.created_by      = creator.id
LEFT JOIN employees modifier ON t.last_modified_by = modifier.id
WHERE t.is_active = true AND t.is_deleted = false;

COMMENT ON VIEW facility_tasks_with_business IS
  'task_type은 business_info.progress_status에서 실시간 파생됨. business_name은 business_info의 현재 사업장명을 우선 반영함 (동기화).';
