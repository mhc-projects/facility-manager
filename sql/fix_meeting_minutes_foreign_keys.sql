-- ============================================
-- 회의록 테이블 외래키 수정
-- auth.users → employees 테이블 참조로 변경
-- ============================================

-- 1. 기존 외래키 제약조건 삭제 (auth.users 참조)
ALTER TABLE meeting_minutes DROP CONSTRAINT IF EXISTS meeting_minutes_organizer_id_fkey;
ALTER TABLE meeting_minutes DROP CONSTRAINT IF EXISTS meeting_minutes_created_by_fkey;
ALTER TABLE meeting_minutes DROP CONSTRAINT IF EXISTS meeting_minutes_updated_by_fkey;
ALTER TABLE meeting_templates DROP CONSTRAINT IF EXISTS meeting_templates_created_by_fkey;

-- 2. employees 테이블을 참조하는 새로운 외래키 제약조건 추가
ALTER TABLE meeting_minutes ADD CONSTRAINT meeting_minutes_organizer_id_fkey FOREIGN KEY (organizer_id) REFERENCES employees(id) ON DELETE SET NULL;
ALTER TABLE meeting_minutes ADD CONSTRAINT meeting_minutes_created_by_fkey FOREIGN KEY (created_by) REFERENCES employees(id) ON DELETE SET NULL;
ALTER TABLE meeting_minutes ADD CONSTRAINT meeting_minutes_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES employees(id) ON DELETE SET NULL;
ALTER TABLE meeting_templates ADD CONSTRAINT meeting_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES employees(id) ON DELETE SET NULL;

-- 3. RLS 정책도 employees 테이블 기준으로 업데이트 (auth.uid() 대신 JWT 토큰 기반)
-- 참고: RLS는 현재 서비스 역할 키로 우회하고 있으므로, 정책은 참고용으로 유지

-- ✅ 완료: 회의록 테이블 외래키가 employees 테이블을 참조하도록 수정되었습니다.
