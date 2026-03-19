-- ============================================================
-- 전자결재시스템 마이그레이션
-- approval_system.sql
-- ============================================================

-- 1. employees 테이블에 role 컬럼 추가
ALTER TABLE employees
ADD COLUMN IF NOT EXISTS role VARCHAR(50) NOT NULL DEFAULT 'staff';
-- 'staff'       : 일반 직원 (담당)
-- 'team_leader' : 팀장
-- 'executive'   : 중역
-- 'ceo'         : 대표이사

COMMENT ON COLUMN employees.role IS '결재 역할: staff(일반), team_leader(팀장), executive(중역), ceo(대표이사)';

CREATE INDEX IF NOT EXISTS idx_employees_role
  ON employees(role)
  WHERE is_active = TRUE AND is_deleted = FALSE;

-- ============================================================
-- 2. 결재 문서 테이블
-- ============================================================
CREATE TABLE IF NOT EXISTS approval_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 문서 식별
  document_number VARCHAR(80) UNIQUE NOT NULL,
  -- 형식: BLUEON-{TYPE}-YYYYMMDD-{SEQ3}
  -- 예:   BLUEON-EXP-20260318-001
  --       BLUEON-PUR-20260318-002
  --       BLUEON-LVE-20260318-001
  --       BLUEON-PRO-20260318-001
  --       BLUEON-OVT-20260318-001

  document_type VARCHAR(30) NOT NULL,
  -- 'expense_claim'     : 지출결의서
  -- 'purchase_request'  : 구매요청서
  -- 'leave_request'     : 휴가원
  -- 'business_proposal' : 업무품의서
  -- 'overtime_log'      : 연장근무일지

  title VARCHAR(255) NOT NULL,

  -- 작성자 (담당)
  requester_id UUID NOT NULL REFERENCES employees(id),
  department VARCHAR(100),

  -- 결재자 지정 (작성 시 선택)
  team_leader_id UUID REFERENCES employees(id),  -- 팀장 (role='team_leader' 계정 선택)
  executive_id   UUID REFERENCES employees(id),  -- 중역 (role='executive' 계정 선택)
  ceo_id         UUID REFERENCES employees(id),  -- 대표이사 (role='ceo' 계정 자동/선택)

  -- 결재 상태
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  -- 'draft'       : 임시저장 (상신 전, 수정 가능)
  -- 'pending'     : 결재 진행 중
  -- 'approved'    : 최종 승인 완료
  -- 'rejected'    : 반려
  -- 'returned'    : 반려 후 수정 대기 (재상신 가능)
  -- 'cancelled'   : 작성자 취소

  -- 현재 결재 단계 (순서 추적용)
  current_step INT NOT NULL DEFAULT 0,
  -- 0: 미상신, 1: 팀장 결재 중, 2: 중역 결재 중, 3: 대표이사 결재 중, 4: 완료

  -- 양식 데이터 (문서 유형별 JSON)
  form_data JSONB NOT NULL DEFAULT '{}',

  -- 첨부파일
  attachments JSONB DEFAULT '[]',

  -- 반려 이력 (재상신 시 누적)
  rejection_history JSONB DEFAULT '[]',
  -- [{ "rejected_by": "이름", "rejected_by_id": "uuid", "reason": "...", "rejected_at": "..." }]

  -- 소프트 딜리트
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,

  -- 타임스탬프
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  submitted_at TIMESTAMPTZ,   -- 최초 상신 일시
  completed_at TIMESTAMPTZ,   -- 최종 승인/반려 일시
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE approval_documents IS '전자결재 문서';
COMMENT ON COLUMN approval_documents.document_number IS 'BLUEON-{TYPE}-YYYYMMDD-{SEQ3} 형식 자동생성';
COMMENT ON COLUMN approval_documents.current_step IS '0=미상신,1=팀장결재중,2=중역결재중,3=대표이사결재중,4=완료';

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_approval_docs_requester
  ON approval_documents(requester_id, status)
  WHERE is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_approval_docs_status
  ON approval_documents(status, current_step)
  WHERE is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_approval_docs_type
  ON approval_documents(document_type)
  WHERE is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_approval_docs_number
  ON approval_documents(document_number);

CREATE INDEX IF NOT EXISTS idx_approval_docs_team_leader
  ON approval_documents(team_leader_id, status)
  WHERE is_deleted = FALSE AND status = 'pending';

CREATE INDEX IF NOT EXISTS idx_approval_docs_executive
  ON approval_documents(executive_id, status)
  WHERE is_deleted = FALSE AND status = 'pending';

CREATE INDEX IF NOT EXISTS idx_approval_docs_ceo
  ON approval_documents(ceo_id, status)
  WHERE is_deleted = FALSE AND status = 'pending';

-- updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_approval_documents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_approval_documents_updated_at ON approval_documents;
CREATE TRIGGER trg_approval_documents_updated_at
  BEFORE UPDATE ON approval_documents
  FOR EACH ROW EXECUTE FUNCTION update_approval_documents_updated_at();

-- ============================================================
-- 3. 결재 단계 테이블
-- ============================================================
CREATE TABLE IF NOT EXISTS approval_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  document_id UUID NOT NULL REFERENCES approval_documents(id) ON DELETE CASCADE,

  step_order  INT         NOT NULL,  -- 1=담당, 2=팀장, 3=중역, 4=대표이사
  role_label  VARCHAR(20) NOT NULL,  -- '담당' | '팀장' | '중역' | '대표이사'
  approver_id UUID        NOT NULL REFERENCES employees(id),
  approver_name VARCHAR(100),        -- 비정규화 (조회 성능)

  -- 결재 결과
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  -- 'pending'  : 결재 대기
  -- 'approved' : 승인
  -- 'rejected' : 반려
  -- 'skipped'  : (담당 자동 승인 등)

  approved_at TIMESTAMPTZ,  -- 결재 완료 일시 (결재칸 날짜 표시용)
  comment     TEXT,         -- 반려 사유 또는 코멘트

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(document_id, step_order)
);

COMMENT ON TABLE approval_steps IS '결재 단계별 이력';
COMMENT ON COLUMN approval_steps.step_order IS '1=담당, 2=팀장, 3=중역, 4=대표이사';

CREATE INDEX IF NOT EXISTS idx_approval_steps_doc
  ON approval_steps(document_id, step_order);

CREATE INDEX IF NOT EXISTS idx_approval_steps_approver
  ON approval_steps(approver_id, status);

-- 결재 대기 조회 최적화
CREATE INDEX IF NOT EXISTS idx_approval_steps_pending
  ON approval_steps(approver_id, status)
  WHERE status = 'pending';

-- ============================================================
-- 4. 문서번호 자동생성 함수
-- ============================================================
CREATE OR REPLACE FUNCTION generate_document_number(p_type VARCHAR)
RETURNS VARCHAR AS $$
DECLARE
  v_type_code VARCHAR(5);
  v_date      VARCHAR(8);
  v_seq       INT;
  v_seq_str   VARCHAR(3);
  v_prefix    VARCHAR(20);
BEGIN
  -- 유형 코드 매핑
  v_type_code := CASE p_type
    WHEN 'expense_claim'     THEN 'EXP'
    WHEN 'purchase_request'  THEN 'PUR'
    WHEN 'leave_request'     THEN 'LVE'
    WHEN 'business_proposal' THEN 'PRO'
    WHEN 'overtime_log'      THEN 'OVT'
    ELSE 'ETC'
  END;

  v_date   := TO_CHAR(NOW(), 'YYYYMMDD');
  v_prefix := 'BLUEON-' || v_type_code || '-' || v_date || '-';

  -- 당일 해당 유형 문서 시퀀스 최대값 + 1
  SELECT COALESCE(
    MAX(CAST(SUBSTRING(document_number FROM LENGTH(v_prefix) + 1) AS INT)),
    0
  ) + 1
  INTO v_seq
  FROM approval_documents
  WHERE document_number LIKE v_prefix || '%';

  v_seq_str := LPAD(v_seq::TEXT, 3, '0');

  RETURN v_prefix || v_seq_str;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION generate_document_number IS 'BLUEON-{TYPE}-YYYYMMDD-{SEQ3} 형식 문서번호 생성';

-- ============================================================
-- 5. RLS 정책
-- ============================================================
ALTER TABLE approval_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_steps ENABLE ROW LEVEL SECURITY;

-- 모든 인증 사용자가 조회 가능 (API 레벨에서 필터링)
DROP POLICY IF EXISTS "approval_documents_select" ON approval_documents;
CREATE POLICY "approval_documents_select" ON approval_documents
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "approval_documents_insert" ON approval_documents;
CREATE POLICY "approval_documents_insert" ON approval_documents
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "approval_documents_update" ON approval_documents;
CREATE POLICY "approval_documents_update" ON approval_documents
  FOR UPDATE USING (true);

DROP POLICY IF EXISTS "approval_steps_select" ON approval_steps;
CREATE POLICY "approval_steps_select" ON approval_steps
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "approval_steps_insert" ON approval_steps;
CREATE POLICY "approval_steps_insert" ON approval_steps
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "approval_steps_update" ON approval_steps;
CREATE POLICY "approval_steps_update" ON approval_steps
  FOR UPDATE USING (true);

DROP POLICY IF EXISTS "approval_steps_delete" ON approval_steps;
CREATE POLICY "approval_steps_delete" ON approval_steps
  FOR DELETE USING (true);
