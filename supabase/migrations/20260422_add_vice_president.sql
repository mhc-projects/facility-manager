-- 부사장(vice_president) 결재 역할 추가 마이그레이션
-- 결재 순서: 담당 → 팀장 → 중역 → 부사장 → 대표이사

-- 1. employees.role CHECK 제약 업데이트 (vice_president 추가)
ALTER TABLE employees DROP CONSTRAINT IF EXISTS employees_role_check;
ALTER TABLE employees ADD CONSTRAINT employees_role_check
  CHECK (role IN ('staff', 'team_leader', 'executive', 'vice_president', 'ceo'));

COMMENT ON COLUMN employees.role IS '결재 역할: staff(일반), team_leader(팀장), executive(중역), vice_president(부사장), ceo(대표이사)';

-- 2. approval_documents에 vice_president_id 컬럼 추가
ALTER TABLE approval_documents ADD COLUMN IF NOT EXISTS vice_president_id UUID REFERENCES employees(id);

COMMENT ON COLUMN approval_documents.vice_president_id IS '부사장 결재자 (role=''vice_president'' 계정 선택)';

-- 3. resubmitted_at 컬럼 추가 (재상신 시각 추적, 보류 이슈 #2)
ALTER TABLE approval_documents ADD COLUMN IF NOT EXISTS resubmitted_at TIMESTAMPTZ;

COMMENT ON COLUMN approval_documents.resubmitted_at IS '최근 재상신 시각 (감사 추적용)';

-- 4. 기존 데이터 마이그레이션: step_order 4(대표이사) → 5
UPDATE approval_steps
SET step_order = 5
WHERE step_order = 4 AND role_label = '대표이사';

-- 5. 기존 approval_documents current_step 마이그레이션
-- 순서 중요: 4(완료) → 5 먼저, 그다음 3(대표이사 결재중) → 4
UPDATE approval_documents SET current_step = 5 WHERE current_step = 4;
UPDATE approval_documents SET current_step = 4 WHERE current_step = 3;

-- 6. current_step / step_order 코멘트 업데이트
COMMENT ON COLUMN approval_documents.current_step IS '0=미상신, 1=팀장결재중, 2=중역결재중, 3=부사장결재중, 4=대표이사결재중, 5=완료';
COMMENT ON COLUMN approval_steps.step_order IS '1=담당, 2=팀장, 3=중역, 4=부사장, 5=대표이사';
