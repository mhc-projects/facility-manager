-- AS 관리 테이블 마이그레이션
-- Created: 2026-03-09

-- 1. AS 건 메인 테이블
CREATE TABLE IF NOT EXISTS as_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- 사업장 연결
    business_id UUID NOT NULL REFERENCES business_info(id) ON DELETE CASCADE,

    -- AS 기본 정보
    receipt_date DATE,                              -- 접수일
    work_date DATE,                                 -- AS 작업일
    receipt_content TEXT,                           -- 접수내용
    work_content TEXT,                              -- 작업내용
    outlet_description TEXT,                        -- 배출구 정보 (자유 텍스트)

    -- AS 담당자 (외부인 포함, 자유 입력)
    as_manager_name VARCHAR(200),                   -- AS 담당자 이름
    as_manager_contact VARCHAR(50),                 -- 담당자 연락처
    as_manager_affiliation VARCHAR(200),            -- 소속/회사

    -- 유상/무상 (delivery_date 기준 2년 2개월 자동 계산, 수동 override 가능)
    is_paid_override BOOLEAN DEFAULT NULL,          -- NULL: 자동계산, true: 유상(수동), false: 무상(수동)

    -- 업무 진행 상태
    status VARCHAR(30) DEFAULT 'received' CHECK (status IN (
        'received',       -- 접수
        'scheduled',      -- 일정조율중
        'in_progress',    -- 진행중
        'parts_waiting',  -- 부품대기
        'on_hold',        -- 보류
        'completed',      -- 완료
        'cancelled'       -- 취소
    )),

    -- 진행 메모 타임라인 (JSONB 배열)
    -- 구조: [{ id, timestamp, author, content, status_at_time }]
    progress_notes JSONB DEFAULT '[]',

    -- 소프트 삭제
    is_deleted BOOLEAN DEFAULT false
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_as_records_business_id ON as_records(business_id) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_as_records_work_date ON as_records(work_date) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_as_records_status ON as_records(status) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_as_records_manager_name ON as_records(as_manager_name) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_as_records_receipt_date ON as_records(receipt_date) WHERE is_deleted = false;

-- updated_at 트리거
CREATE TRIGGER update_as_records_updated_at
    BEFORE UPDATE ON as_records
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- 2. AS 유상 단가표
CREATE TABLE IF NOT EXISTS as_price_list (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- 분류 및 항목
    category VARCHAR(100),                          -- 분류 (예: PH계, 온도계, 출장비 등)
    item_name VARCHAR(200) NOT NULL,                -- 항목명

    -- 단가 정보
    unit_price DECIMAL(10,2) NOT NULL,              -- 단가 (원)
    unit VARCHAR(20) DEFAULT '개',                  -- 단위

    -- 부가 정보
    description TEXT,                               -- 항목 설명/비고
    sort_order INTEGER DEFAULT 0,                   -- 정렬 순서

    is_active BOOLEAN DEFAULT true
);

CREATE TRIGGER update_as_price_list_updated_at
    BEFORE UPDATE ON as_price_list
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- 3. AS 사용자재 (측정기기별)
CREATE TABLE IF NOT EXISTS as_material_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    as_record_id UUID NOT NULL REFERENCES as_records(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- 기기 분류
    device_type VARCHAR(50),                        -- 'ph_meter', 'temperature_meter' 등
    device_label VARCHAR(100),                      -- UI 표시용 (예: 'PH계', '온도계')

    -- 단가표 참조 (선택, 직접 입력도 가능)
    price_list_id UUID REFERENCES as_price_list(id) ON DELETE SET NULL,

    -- 자재 정보 (스냅샷: 단가표 변경 영향 없음)
    material_name VARCHAR(200) NOT NULL,            -- 자재명
    quantity DECIMAL(10,2) DEFAULT 1,               -- 수량
    unit VARCHAR(20) DEFAULT '개',                  -- 단위
    unit_price DECIMAL(10,2) DEFAULT 0,             -- 단가 (스냅샷)

    notes TEXT                                      -- 자재별 비고
);

CREATE INDEX IF NOT EXISTS idx_as_material_record_id ON as_material_usage(as_record_id);

COMMENT ON TABLE as_records IS 'AS 관리 메인 테이블 - AS 건 접수/진행/완료 관리';
COMMENT ON TABLE as_price_list IS 'AS 유상 단가표 - 유상 AS 시 자재/작업 단가 관리';
COMMENT ON TABLE as_material_usage IS 'AS 사용자재 - AS 건별 측정기기 자재 사용 내역';
COMMENT ON COLUMN as_records.is_paid_override IS 'NULL: delivery_date 기준 자동 계산(2년 2개월), true: 유상(수동), false: 무상(수동)';
COMMENT ON COLUMN as_records.progress_notes IS 'JSONB 배열: [{id, timestamp, author, content, status_at_time}]';
