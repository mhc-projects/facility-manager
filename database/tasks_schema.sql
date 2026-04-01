-- 업무 관리 시스템 데이터베이스 스키마
-- Tasks Management System Database Schema

-- 1. 업무 타입 enum 생성/업데이트
DO $$
BEGIN
    -- task_type enum이 존재하지 않으면 생성
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_type') THEN
        CREATE TYPE task_type AS ENUM ('self', 'subsidy', 'etc', 'as');
    ELSE
        -- 기존 enum에 새로운 값 추가
        ALTER TYPE task_type ADD VALUE IF NOT EXISTS 'etc';
        ALTER TYPE task_type ADD VALUE IF NOT EXISTS 'as';
    END IF;
END $$;

-- 2. 업무 상태 enum 생성/업데이트
DO $$
BEGIN
    -- task_status enum이 존재하지 않으면 생성
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_status') THEN
        CREATE TYPE task_status AS ENUM (
            -- 공통 단계
            'customer_contact', 'site_inspection', 'quotation', 'contract',
            'deposit_confirm', 'product_order', 'product_shipment', 'installation_schedule',
            'installation', 'balance_payment', 'document_complete',
            -- 보조금 전용 단계
            'application_submit', 'document_supplement', 'pre_construction_inspection',
            'pre_construction_supplement', 'completion_inspection', 'completion_supplement',
            'final_document_submit', 'subsidy_payment',
            -- 기타 단계
            'etc_status'
        );
    ELSE
        -- 기존 enum에 새로운 값 추가
        ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'etc_status';
    END IF;
END $$;

-- 3. 우선순위 enum 생성
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'priority_level') THEN
        CREATE TYPE priority_level AS ENUM ('high', 'medium', 'low');
    END IF;
END $$;

-- 4. tasks 테이블 생성
CREATE TABLE IF NOT EXISTS tasks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    business_name VARCHAR(255), -- 기타 타입일 때는 NULL 허용
    business_id UUID, -- 사업장 ID 참조 (선택사항)
    type task_type NOT NULL DEFAULT 'etc',
    status task_status NOT NULL DEFAULT 'etc_status',
    priority priority_level NOT NULL DEFAULT 'medium',
    assignee VARCHAR(100),
    due_date DATE,
    description TEXT,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID, -- 생성자 ID
    updated_by UUID  -- 수정자 ID
);

-- 5. 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_tasks_type ON tasks(type);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_business_name ON tasks(business_name);
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at);

-- 6. 업데이트 시간 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 트리거 생성
DROP TRIGGER IF EXISTS update_tasks_updated_at ON tasks;
CREATE TRIGGER update_tasks_updated_at
    BEFORE UPDATE ON tasks
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 7. RLS (Row Level Security) 활성화 (필요시)
-- ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

-- 8. 기본 정책 설정 예시 (필요시 활성화)
/*
CREATE POLICY "Users can view their assigned tasks" ON tasks
    FOR SELECT USING (assignee = auth.email());

CREATE POLICY "Users can update their assigned tasks" ON tasks
    FOR UPDATE USING (assignee = auth.email());

CREATE POLICY "Managers can view all tasks" ON tasks
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM user_roles
            WHERE user_id = auth.uid()
            AND role IN ('admin', 'manager')
        )
    );
*/

-- 9. 샘플 데이터 삽입 (테스트용)
INSERT INTO tasks (title, business_name, type, status, priority, assignee, description) VALUES
    ('일반 업무 테스트', '테스트 사업장', 'etc', 'etc_status', 'medium', '담당자1', '기타 타입 업무 테스트'),
    ('AS 업무 테스트', 'AS 고객사', 'as', 'customer_contact', 'high', '기술팀', 'AS 업무 처리'),
    ('자비 업무 테스트', '자비 고객사', 'self', 'customer_contact', 'low', '영업팀', '자비 고객 상담'),
    ('보조금 업무 테스트', '보조금 고객사', 'subsidy', 'application_submit', 'medium', '보조금팀', '보조금 신청서 제출')
ON CONFLICT DO NOTHING;

-- 10. 뷰 생성 - 업무 통계
CREATE OR REPLACE VIEW task_statistics AS
SELECT
    type,
    status,
    priority,
    COUNT(*) as task_count,
    COUNT(CASE WHEN due_date < CURRENT_DATE THEN 1 END) as overdue_count,
    COUNT(CASE WHEN assignee IS NOT NULL THEN 1 END) as assigned_count
FROM tasks
GROUP BY type, status, priority;

-- 11. 뷰 생성 - 업무 요약
CREATE OR REPLACE VIEW task_summary AS
SELECT
    DATE_TRUNC('day', created_at) as date,
    type,
    COUNT(*) as daily_count,
    COUNT(CASE WHEN status IN ('document_complete', 'subsidy_payment', 'installation') THEN 1 END) as completed_count
FROM tasks
GROUP BY DATE_TRUNC('day', created_at), type
ORDER BY date DESC;

-- 12. 함수 생성 - 업무 타입별 단계 가져오기
CREATE OR REPLACE FUNCTION get_task_steps(task_type_param task_type)
RETURNS TABLE(status_value task_status, status_label TEXT, status_order INTEGER) AS $$
BEGIN
    CASE task_type_param
        WHEN 'self' THEN
            RETURN QUERY VALUES
                ('customer_contact'::task_status, '고객 상담', 1),
                ('site_inspection'::task_status, '현장 실사', 2),
                ('quotation'::task_status, '견적서 작성', 3),
                ('contract'::task_status, '계약 체결', 4),
                ('deposit_confirm'::task_status, '계약금 확인', 5),
                ('product_order'::task_status, '제품 발주', 6),
                ('product_shipment'::task_status, '제품 출고', 7),
                ('installation_schedule'::task_status, '설치예정', 8),
                ('installation'::task_status, '제품 설치', 9),
                ('balance_payment'::task_status, '잔금 입금', 10),
                ('document_complete'::task_status, '서류 발송 완료', 11);
        WHEN 'subsidy' THEN
            RETURN QUERY VALUES
                ('customer_contact'::task_status, '고객 상담', 1),
                ('site_inspection'::task_status, '현장 실사', 2),
                ('quotation'::task_status, '견적서 작성', 3),
                ('application_submit'::task_status, '신청서 제출', 4),
                ('document_supplement'::task_status, '서류 보완', 5),
                ('pre_construction_inspection'::task_status, '착공 전 실사', 6),
                ('pre_construction_supplement'::task_status, '착공 보완', 7),
                ('product_order'::task_status, '제품 발주', 8),
                ('product_shipment'::task_status, '제품 출고', 9),
                ('installation_schedule'::task_status, '설치예정', 10),
                ('installation'::task_status, '제품 설치', 11),
                ('completion_inspection'::task_status, '준공 실사', 12),
                ('completion_supplement'::task_status, '준공 보완', 13),
                ('final_document_submit'::task_status, '서류 제출', 14),
                ('subsidy_payment'::task_status, '보조금 입금', 15);
        WHEN 'etc' THEN
            RETURN QUERY VALUES
                ('etc_status'::task_status, '기타', 1);
        WHEN 'as' THEN
            RETURN QUERY VALUES
                ('customer_contact'::task_status, '고객 상담', 1),
                ('site_inspection'::task_status, '현장 확인', 2),
                ('quotation'::task_status, 'AS 견적', 3),
                ('contract'::task_status, 'AS 계약', 4),
                ('product_order'::task_status, '부품 발주', 5),
                ('installation'::task_status, 'AS 완료', 6);
        ELSE
            RETURN QUERY VALUES
                ('etc_status'::task_status, '알 수 없음', 1);
    END CASE;
END;
$$ LANGUAGE plpgsql;

-- 13. 코멘트 추가
COMMENT ON TABLE tasks IS '업무 관리 테이블 - 자비, 보조금, 기타, AS 업무 관리';
COMMENT ON COLUMN tasks.business_name IS '사업장명 - 기타 타입일 때는 NULL 허용';
COMMENT ON COLUMN tasks.type IS '업무 타입 - self(자비), subsidy(보조금), etc(기타), as(AS)';
COMMENT ON COLUMN tasks.status IS '업무 상태 - 타입별로 다른 진행 단계';
COMMENT ON COLUMN tasks.priority IS '우선순위 - high(높음), medium(보통), low(낮음)';