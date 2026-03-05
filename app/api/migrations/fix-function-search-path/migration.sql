-- ============================================================
-- Function Search Path Mutable 경고 수정
-- 19개 함수에 SET search_path = '' 추가
--
-- 방식: pg_get_functiondef()로 현재 정의를 가져온 뒤
--       SECURITY DEFINER + SET search_path = '' 옵션으로 재생성
-- ============================================================

DO $$
DECLARE
    func_name TEXT;
    func_schema TEXT := 'public';
    success_count INT := 0;
    skip_count INT := 0;
    fail_count INT := 0;

    -- 수정 대상 함수 목록 (이름만, 오버로딩 없음)
    functions_to_fix TEXT[] := ARRAY[
        'update_equipment_field_checks_updated_at',
        'update_uploaded_files_updated_at',
        'update_invoice_records_updated_at',
        'update_miscellaneous_costs_updated_at',
        'update_monthly_closings_updated_at',
        'update_updated_at_column',
        'update_meeting_minutes_updated_at',
        'update_direct_url_sources_updated_at',
        'calculate_assignee_count',
        'get_urls_for_crawling',
        'import_urls_from_csv',
        'get_running_crawls',
        'log_data_history',
        'reactivate_url',
        'record_crawl_failure',
        'record_crawl_success',
        'record_order_management_changes',
        'create_task_assignment_notifications',
        'update_task_assignment_notifications'
    ];
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '=== Function Search Path 수정 시작 ===';

    FOREACH func_name IN ARRAY functions_to_fix
    LOOP
        DECLARE
            func_exists BOOLEAN;
            func_oid OID;
        BEGIN
            -- 함수 존재 확인
            SELECT EXISTS(
                SELECT 1 FROM pg_proc p
                JOIN pg_namespace n ON p.pronamespace = n.oid
                WHERE n.nspname = func_schema AND p.proname = func_name
            ) INTO func_exists;

            IF NOT func_exists THEN
                RAISE NOTICE '[SKIP] % - 존재하지 않음', func_name;
                skip_count := skip_count + 1;
                CONTINUE;
            END IF;

            -- search_path 설정 (ALTER FUNCTION 사용 - 가장 안전한 방법)
            -- pg_proc에서 OID 가져오기
            SELECT p.oid INTO func_oid
            FROM pg_proc p
            JOIN pg_namespace n ON p.pronamespace = n.oid
            WHERE n.nspname = func_schema AND p.proname = func_name
            LIMIT 1;

            -- ALTER FUNCTION으로 search_path만 변경
            EXECUTE format(
                'ALTER FUNCTION %I.%I SET search_path = ''''',
                func_schema, func_name
            );

            RAISE NOTICE '[OK] % - search_path 설정 완료', func_name;
            success_count := success_count + 1;

        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE '[FAIL] % - %', func_name, SQLERRM;
            fail_count := fail_count + 1;
        END;
    END LOOP;

    RAISE NOTICE '';
    RAISE NOTICE '=== 수정 결과: 성공 %, 스킵 %, 실패 % ===',
        success_count, skip_count, fail_count;
END $$;


-- ============================================================
-- 검증: search_path가 설정된 함수 목록 확인
-- ============================================================

SELECT
    p.proname AS function_name,
    CASE
        WHEN p.proconfig IS NOT NULL AND p.proconfig::text LIKE '%search_path%' THEN 'OK (search_path 설정됨)'
        ELSE 'WARN (search_path 미설정)'
    END AS status,
    p.proconfig AS config
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
AND p.proname IN (
    'update_equipment_field_checks_updated_at',
    'update_uploaded_files_updated_at',
    'update_invoice_records_updated_at',
    'update_miscellaneous_costs_updated_at',
    'update_monthly_closings_updated_at',
    'update_updated_at_column',
    'update_meeting_minutes_updated_at',
    'update_direct_url_sources_updated_at',
    'calculate_assignee_count',
    'get_urls_for_crawling',
    'import_urls_from_csv',
    'get_running_crawls',
    'log_data_history',
    'reactivate_url',
    'record_crawl_failure',
    'record_crawl_success',
    'record_order_management_changes',
    'create_task_assignment_notifications',
    'update_task_assignment_notifications'
)
ORDER BY p.proname;
