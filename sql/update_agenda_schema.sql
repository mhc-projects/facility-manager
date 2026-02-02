-- ============================================
-- 안건(Agenda) 스키마 업데이트
-- ============================================
--
-- 목적: AgendaItem 구조 변경
--   - duration 필드 제거
--   + deadline 필드 추가 (데드라인)
--   + assignee_id 필드 추가 (담당자 ID)
--   + assignee_name 필드 추가 (담당자명)
--
-- 변경사항:
-- 1. 기존 회의록의 agenda 배열에서 duration 필드 제거
-- 2. deadline, assignee_id, assignee_name 필드 추가 (빈 값으로)
--
-- 참고:
-- - 이 마이그레이션은 기존 데이터를 변경하므로 실행 전 백업 권장
-- - duration 필드는 타입 정의에서 완전히 제거됨
-- - 새 필드들은 optional이므로 기존 회의록과 호환됨
-- ============================================

-- 모든 회의록의 agenda 배열 업데이트
-- PostgreSQL JSONB 배열 조작은 복잡하므로, 각 agenda item을 개별적으로 처리

-- 방법 1: duration 필드만 제거 (간단한 방법)
-- 기존 agenda를 그대로 두고, 프론트엔드에서 duration을 무시
-- 신규 회의록은 새로운 스키마로 저장됨

-- 방법 2: 기존 데이터 완전 변환 (복잡한 방법)
-- 아래는 방법 1을 권장 (하위 호환성 유지)

-- ✅ 권장: 기존 데이터 유지, 신규 데이터만 새 스키마 사용
-- 타입 정의가 변경되었으므로, 프론트엔드에서 자동으로 새 스키마 적용

-- 선택적 정리 (필요시만 실행):
-- 기존 회의록의 agenda에서 duration 필드를 제거하고 싶다면:
/*
DO $$
DECLARE
  rec RECORD;
  new_agenda JSONB;
  item JSONB;
BEGIN
  FOR rec IN
    SELECT id, agenda
    FROM meeting_minutes
    WHERE agenda IS NOT NULL AND jsonb_array_length(agenda) > 0
  LOOP
    new_agenda := '[]'::jsonb;

    FOR item IN SELECT * FROM jsonb_array_elements(rec.agenda)
    LOOP
      new_agenda := new_agenda || jsonb_build_array(
        item - 'duration'  -- duration 필드 제거
      );
    END LOOP;

    UPDATE meeting_minutes
    SET agenda = new_agenda
    WHERE id = rec.id;
  END LOOP;
END $$;
*/

-- ✅ 완료: 스키마 업데이트 준비 완료
--
-- 실행 방법:
-- 1. 기본: 별도 마이그레이션 불필요 (신규 데이터만 새 스키마 사용)
-- 2. 선택: 위의 주석 처리된 SQL을 실행하여 기존 데이터에서 duration 제거
--
-- 확인 쿼리:
-- SELECT id, title, agenda FROM meeting_minutes WHERE agenda IS NOT NULL LIMIT 5;
