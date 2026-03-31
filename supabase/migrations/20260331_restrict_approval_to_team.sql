-- teams 테이블에 is_management_support 플래그 추가
-- 경영지원부 내 '총무팀'만 전자결재 전체 열람/처리확인 권한을 갖도록 제한
-- 부서 단위(departments.is_management_support) → 팀 단위(teams.is_management_support)로 권한 이관

ALTER TABLE teams ADD COLUMN IF NOT EXISTS is_management_support BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN teams.is_management_support IS '전자결재 전체 열람 및 처리확인 권한을 갖는 팀 여부 (기존 경영지원부 부서 단위 권한을 팀 단위로 이관)';

-- 경영지원부 내 총무팀에 플래그 설정
UPDATE teams
SET is_management_support = TRUE
WHERE name = '총무팀'
  AND department_id = (SELECT id FROM departments WHERE name = '경영지원부' LIMIT 1);
