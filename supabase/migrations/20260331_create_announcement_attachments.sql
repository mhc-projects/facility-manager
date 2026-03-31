-- 공지사항 첨부파일 테이블 생성
CREATE TABLE IF NOT EXISTS announcement_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    announcement_id UUID NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    original_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    mime_type TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_announcement_attachments_announcement_id
    ON announcement_attachments(announcement_id);

-- RLS 활성화
ALTER TABLE announcement_attachments ENABLE ROW LEVEL SECURITY;

-- RLS 정책: 읽기 (Level 1+)
CREATE POLICY "announcement_attachments_read_policy"
    ON announcement_attachments FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM employees
            WHERE employees.employee_id::text = auth.uid()::text
            AND employees.permission_level >= 1
        )
    );

-- RLS 정책: 쓰기 (Level 3+)
CREATE POLICY "announcement_attachments_insert_policy"
    ON announcement_attachments FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM employees
            WHERE employees.employee_id::text = auth.uid()::text
            AND employees.permission_level >= 3
        )
    );

-- RLS 정책: 삭제 (Level 3+)
CREATE POLICY "announcement_attachments_delete_policy"
    ON announcement_attachments FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM employees
            WHERE employees.employee_id::text = auth.uid()::text
            AND employees.permission_level >= 3
        )
    );
