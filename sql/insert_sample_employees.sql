-- ============================================
-- 회의록 안건 담당자 선택용 샘플 직원 데이터
-- ============================================
-- 목적: 회의록 작성 시 안건 담당자를 선택할 수 있도록 기본 직원 데이터 추가
-- 실행: Supabase SQL Editor에서 실행 또는 npm run migrate:sample-employees

-- 샘플 직원 데이터 삽입
-- ON CONFLICT (email) DO UPDATE 사용으로 중복 실행 시 안전

-- 1. 개발팀
INSERT INTO public.employees (
    name,
    email,
    phone,
    department,
    position,
    permission_level,
    is_active
) VALUES
(
    '김개발',
    'kim.dev@company.com',
    '010-1234-5001',
    '개발팀',
    '팀장',
    3,
    true
),
(
    '이프론트',
    'lee.frontend@company.com',
    '010-1234-5002',
    '개발팀',
    '선임개발자',
    2,
    true
),
(
    '박백엔드',
    'park.backend@company.com',
    '010-1234-5003',
    '개발팀',
    '주임개발자',
    2,
    true
)
ON CONFLICT (email) DO UPDATE SET
    name = EXCLUDED.name,
    department = EXCLUDED.department,
    position = EXCLUDED.position,
    permission_level = EXCLUDED.permission_level,
    is_active = EXCLUDED.is_active,
    updated_at = NOW();

-- 2. 관리팀
INSERT INTO public.employees (
    name,
    email,
    phone,
    department,
    position,
    permission_level,
    is_active
) VALUES
(
    '최관리',
    'choi.admin@company.com',
    '010-1234-5010',
    '관리팀',
    '팀장',
    3,
    true
),
(
    '정회계',
    'jung.accounting@company.com',
    '010-1234-5011',
    '관리팀',
    '대리',
    2,
    true
),
(
    '한인사',
    'han.hr@company.com',
    '010-1234-5012',
    '관리팀',
    '주임',
    1,
    true
)
ON CONFLICT (email) DO UPDATE SET
    name = EXCLUDED.name,
    department = EXCLUDED.department,
    position = EXCLUDED.position,
    permission_level = EXCLUDED.permission_level,
    is_active = EXCLUDED.is_active,
    updated_at = NOW();

-- 3. 영업팀
INSERT INTO public.employees (
    name,
    email,
    phone,
    department,
    position,
    permission_level,
    is_active
) VALUES
(
    '강영업',
    'kang.sales@company.com',
    '010-1234-5020',
    '영업팀',
    '팀장',
    3,
    true
),
(
    '오마케팅',
    'oh.marketing@company.com',
    '010-1234-5021',
    '영업팀',
    '선임',
    2,
    true
),
(
    '윤고객',
    'yoon.cs@company.com',
    '010-1234-5022',
    '영업팀',
    '사원',
    1,
    true
)
ON CONFLICT (email) DO UPDATE SET
    name = EXCLUDED.name,
    department = EXCLUDED.department,
    position = EXCLUDED.position,
    permission_level = EXCLUDED.permission_level,
    is_active = EXCLUDED.is_active,
    updated_at = NOW();

-- 4. 기술지원팀
INSERT INTO public.employees (
    name,
    email,
    phone,
    department,
    position,
    permission_level,
    is_active
) VALUES
(
    '임기술',
    'lim.tech@company.com',
    '010-1234-5030',
    '기술지원팀',
    '팀장',
    2,
    true
),
(
    '서지원',
    'seo.support@company.com',
    '010-1234-5031',
    '기술지원팀',
    '주임',
    1,
    true
)
ON CONFLICT (email) DO UPDATE SET
    name = EXCLUDED.name,
    department = EXCLUDED.department,
    position = EXCLUDED.position,
    permission_level = EXCLUDED.permission_level,
    is_active = EXCLUDED.is_active,
    updated_at = NOW();

-- 5. 경영지원팀
INSERT INTO public.employees (
    name,
    email,
    phone,
    department,
    position,
    permission_level,
    is_active
) VALUES
(
    '조경영',
    'jo.management@company.com',
    '010-1234-5040',
    '경영지원팀',
    '이사',
    3,
    true
),
(
    '신전략',
    'shin.strategy@company.com',
    '010-1234-5041',
    '경영지원팀',
    '과장',
    2,
    true
)
ON CONFLICT (email) DO UPDATE SET
    name = EXCLUDED.name,
    department = EXCLUDED.department,
    position = EXCLUDED.position,
    permission_level = EXCLUDED.permission_level,
    is_active = EXCLUDED.is_active,
    updated_at = NOW();

-- 삽입된 직원 목록 확인
SELECT
    name AS "이름",
    email AS "이메일",
    department AS "부서",
    position AS "직급",
    CASE
        WHEN permission_level = 1 THEN '일반'
        WHEN permission_level = 2 THEN '매출조회'
        WHEN permission_level = 3 THEN '관리자'
    END AS "권한",
    CASE WHEN is_active THEN '활성' ELSE '비활성' END AS "상태"
FROM public.employees
WHERE email LIKE '%@company.com'
ORDER BY department, position;

-- 통계 출력
SELECT
    department AS "부서",
    COUNT(*) AS "인원수",
    COUNT(CASE WHEN permission_level >= 3 THEN 1 END) AS "관리자수"
FROM public.employees
WHERE email LIKE '%@company.com'
AND is_active = TRUE
GROUP BY department
ORDER BY department;
