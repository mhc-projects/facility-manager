-- departments 테이블에 경영지원 역할 플래그 추가
-- 부서 이름이 변경되어도 코드 수정 없이 동작하도록 플래그 기반으로 관리

ALTER TABLE departments ADD COLUMN IF NOT EXISTS is_management_support BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN departments.is_management_support IS '결재 완료 통보를 받는 경영지원 역할 부서 여부. 이름이 바뀌어도 이 플래그로 식별.';

-- 경영지원부에 플래그 설정 (최초 1회)
UPDATE departments SET is_management_support = TRUE WHERE name = '경영지원부';
