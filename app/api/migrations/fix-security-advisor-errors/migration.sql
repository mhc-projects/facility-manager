-- ============================================================
-- Security Advisor 오류 수정
-- 1. Security Definer View → Security Invoker로 변환 (9개)
-- 2. RLS 미활성화 테이블 처리 (7개)
-- ============================================================

-- ============================================================
-- PART 1: SECURITY DEFINER VIEW → SECURITY INVOKER 변환
-- 대상: vw_url_health_summary, vw_ai_disagreements,
--       meeting_minutes_statistics, crawl_stats_by_region,
--       vw_recent_crawl_runs, crawl_logs_detailed,
--       crawl_stats_recent, order_management_timeline,
--       problem_urls
-- ============================================================

DO $$
DECLARE
    v TEXT;
    view_def TEXT;
    view_exists BOOLEAN;
    success_count INT := 0;
    skip_count INT := 0;
    fail_count INT := 0;
    views_to_fix TEXT[] := ARRAY[
        'vw_url_health_summary',
        'vw_ai_disagreements',
        'meeting_minutes_statistics',
        'crawl_stats_by_region',
        'vw_recent_crawl_runs',
        'crawl_logs_detailed',
        'crawl_stats_recent',
        'order_management_timeline',
        'problem_urls'
    ];
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '=== Security Definer View 변환 시작 ===';

    FOREACH v IN ARRAY views_to_fix
    LOOP
        SELECT EXISTS (
            SELECT 1 FROM pg_views
            WHERE schemaname = 'public' AND viewname = v
        ) INTO view_exists;

        IF NOT view_exists THEN
            RAISE NOTICE '[SKIP] % - 존재하지 않음', v;
            skip_count := skip_count + 1;
            CONTINUE;
        END IF;

        SELECT pg_get_viewdef(c.oid, true)
        INTO view_def
        FROM pg_class c
        JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE n.nspname = 'public' AND c.relname = v;

        IF view_def IS NULL THEN
            RAISE NOTICE '[FAIL] % - 정의를 가져올 수 없음', v;
            fail_count := fail_count + 1;
            CONTINUE;
        END IF;

        BEGIN
            EXECUTE format('DROP VIEW IF EXISTS public.%I CASCADE', v);
            EXECUTE format(
                'CREATE VIEW public.%I WITH (security_invoker = true) AS %s',
                v, view_def
            );
            EXECUTE format('GRANT SELECT ON public.%I TO anon', v);
            EXECUTE format('GRANT SELECT ON public.%I TO authenticated', v);
            EXECUTE format('GRANT ALL ON public.%I TO service_role', v);

            RAISE NOTICE '[OK] % - Security Invoker로 변환 완료', v;
            success_count := success_count + 1;

        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE '[FAIL] % - %', v, SQLERRM;
            fail_count := fail_count + 1;
        END;
    END LOOP;

    RAISE NOTICE '';
    RAISE NOTICE '=== 변환 결과: 성공 %, 스킵 %, 실패 % ===',
        success_count, skip_count, fail_count;
END $$;


-- ============================================================
-- PART 2: RLS 미활성화 테이블 처리
-- 각 테이블 용도에 맞게 RLS 활성화 + 정책 추가
-- ============================================================

-- -------------------------------------------------------
-- 2-1. backup_snapshots
-- 용도: 전체 교체 업로드 시 자동 백업 스냅샷
-- 정책: service_role만 읽기/쓰기, authenticated는 읽기 가능
-- -------------------------------------------------------
ALTER TABLE public.backup_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all_backup_snapshots" ON public.backup_snapshots;
DROP POLICY IF EXISTS "authenticated_read_backup_snapshots" ON public.backup_snapshots;

CREATE POLICY "service_role_all_backup_snapshots"
    ON public.backup_snapshots
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "authenticated_read_backup_snapshots"
    ON public.backup_snapshots
    FOR SELECT
    TO authenticated
    USING (true);


-- -------------------------------------------------------
-- 2-2. meeting_departments
-- 용도: 회의록 부서 목록 (공통 참조 데이터)
-- 정책: authenticated 읽기, service_role 전체
-- -------------------------------------------------------
ALTER TABLE public.meeting_departments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all_meeting_departments" ON public.meeting_departments;
DROP POLICY IF EXISTS "authenticated_read_meeting_departments" ON public.meeting_departments;

CREATE POLICY "service_role_all_meeting_departments"
    ON public.meeting_departments
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "authenticated_read_meeting_departments"
    ON public.meeting_departments
    FOR SELECT
    TO authenticated
    USING (true);


-- -------------------------------------------------------
-- 2-3. data_history
-- 용도: 데이터 변경 이력 로그
-- 정책: service_role 전체, authenticated 읽기
-- -------------------------------------------------------
ALTER TABLE public.data_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all_data_history" ON public.data_history;
DROP POLICY IF EXISTS "authenticated_read_data_history" ON public.data_history;

CREATE POLICY "service_role_all_data_history"
    ON public.data_history
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "authenticated_read_data_history"
    ON public.data_history
    FOR SELECT
    TO authenticated
    USING (true);


-- -------------------------------------------------------
-- 2-4. miscellaneous_costs
-- 용도: 월별 기타 비용 항목 (monthly_closings 참조)
-- 정책: service_role 전체, authenticated 읽기/쓰기
-- -------------------------------------------------------
ALTER TABLE public.miscellaneous_costs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all_miscellaneous_costs" ON public.miscellaneous_costs;
DROP POLICY IF EXISTS "authenticated_all_miscellaneous_costs" ON public.miscellaneous_costs;

CREATE POLICY "service_role_all_miscellaneous_costs"
    ON public.miscellaneous_costs
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "authenticated_all_miscellaneous_costs"
    ON public.miscellaneous_costs
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);


-- -------------------------------------------------------
-- 2-5. monthly_closings
-- 용도: 월별 재무 마감 데이터
-- 정책: service_role 전체, authenticated 읽기/쓰기
-- -------------------------------------------------------
ALTER TABLE public.monthly_closings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all_monthly_closings" ON public.monthly_closings;
DROP POLICY IF EXISTS "authenticated_all_monthly_closings" ON public.monthly_closings;

CREATE POLICY "service_role_all_monthly_closings"
    ON public.monthly_closings
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "authenticated_all_monthly_closings"
    ON public.monthly_closings
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);


-- -------------------------------------------------------
-- 2-6. business_memos_backup_20260212
-- 용도: 임시 백업 테이블 (데이터 마이그레이션용)
-- 정책: service_role만 접근 (백업 데이터이므로 제한적)
-- -------------------------------------------------------
ALTER TABLE public.business_memos_backup_20260212 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all_business_memos_backup" ON public.business_memos_backup_20260212;

CREATE POLICY "service_role_all_business_memos_backup"
    ON public.business_memos_backup_20260212
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);


-- -------------------------------------------------------
-- 2-7. invoice_records
-- 용도: 계산서 발행 이력 관리
-- 정책: service_role 전체, authenticated 읽기/쓰기
-- -------------------------------------------------------
ALTER TABLE public.invoice_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all_invoice_records" ON public.invoice_records;
DROP POLICY IF EXISTS "authenticated_all_invoice_records" ON public.invoice_records;

CREATE POLICY "service_role_all_invoice_records"
    ON public.invoice_records
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "authenticated_all_invoice_records"
    ON public.invoice_records
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);


-- ============================================================
-- 검증: 수정된 뷰의 보안 모드 확인
-- ============================================================

SELECT
    c.relname AS view_name,
    CASE
        WHEN c.reloptions::text LIKE '%security_invoker=true%' THEN 'Security Invoker (OK)'
        ELSE 'Security Definer (STILL BROKEN)'
    END AS security_mode
FROM pg_class c
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname = 'public'
AND c.relkind = 'v'
AND c.relname IN (
    'vw_url_health_summary',
    'vw_ai_disagreements',
    'meeting_minutes_statistics',
    'crawl_stats_by_region',
    'vw_recent_crawl_runs',
    'crawl_logs_detailed',
    'crawl_stats_recent',
    'order_management_timeline',
    'problem_urls'
)
ORDER BY c.relname;

-- RLS 활성화 확인
SELECT
    tablename,
    rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
AND tablename IN (
    'backup_snapshots',
    'meeting_departments',
    'data_history',
    'miscellaneous_costs',
    'monthly_closings',
    'business_memos_backup_20260212',
    'invoice_records'
)
ORDER BY tablename;
