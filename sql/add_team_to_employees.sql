-- employees 테이블에 team 컬럼 추가
-- 부서(department) 하위 팀 정보를 저장하기 위한 마이그레이션

ALTER TABLE employees ADD COLUMN IF NOT EXISTS team VARCHAR(100);

-- 코멘트
COMMENT ON COLUMN employees.team IS '소속 팀명 (teams 테이블의 name 기준)';
