-- ============================================
-- 회의록 접근 제어: 참석자 기반 필터링 RPC 함수
-- ============================================
-- 적용 규칙:
--   - permission_level >= 4 이거나 특별 허용 이메일인 경우 → 전체 조회
--   - 그 외 → 본인이 organizer, created_by, 또는 participants[].employee_id 인 회의록만 조회

-- 참석자 기반 접근 가능한 회의록 목록 조회
CREATE OR REPLACE FUNCTION get_accessible_meeting_minutes(
  p_user_id        TEXT,
  p_is_full_access BOOLEAN,
  p_status         TEXT    DEFAULT NULL,
  p_meeting_type   TEXT    DEFAULT NULL,
  p_date_from      TEXT    DEFAULT NULL,
  p_date_to        TEXT    DEFAULT NULL,
  p_organizer      TEXT    DEFAULT NULL,
  p_search         TEXT    DEFAULT NULL,
  p_limit          INT     DEFAULT 20,
  p_offset         INT     DEFAULT 0
)
RETURNS TABLE (
  id            UUID,
  title         VARCHAR,
  meeting_date  TIMESTAMPTZ,
  meeting_type  VARCHAR,
  organizer_id  UUID,
  participants  JSONB,
  location      VARCHAR,
  location_type VARCHAR,
  agenda        JSONB,
  content       JSONB,
  attachments   JSONB,
  status        VARCHAR,
  visibility    VARCHAR,
  created_by    UUID,
  updated_by    UUID,
  created_at    TIMESTAMPTZ,
  updated_at    TIMESTAMPTZ,
  total_count   BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id,
    m.title,
    m.meeting_date,
    m.meeting_type,
    m.organizer_id,
    m.participants,
    m.location,
    m.location_type,
    m.agenda,
    m.content,
    m.attachments,
    m.status,
    m.visibility,
    m.created_by,
    m.updated_by,
    m.created_at,
    m.updated_at,
    COUNT(*) OVER() AS total_count
  FROM meeting_minutes m
  WHERE
    -- 접근 제어: 전체 권한 OR 참석자/주관자/생성자
    (
      p_is_full_access
      OR m.organizer_id::TEXT = p_user_id
      OR m.created_by::TEXT  = p_user_id
      OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements(m.participants) AS p
        WHERE p->>'employee_id' = p_user_id
      )
    )
    -- 상태 필터
    AND (p_status IS NULL OR m.status = p_status)
    -- 회의 유형 필터
    AND (p_meeting_type IS NULL OR m.meeting_type = p_meeting_type)
    -- 날짜 범위 필터
    AND (p_date_from IS NULL OR m.meeting_date >= p_date_from::TIMESTAMPTZ)
    AND (p_date_to   IS NULL OR m.meeting_date <= p_date_to::TIMESTAMPTZ)
    -- 주관자 필터
    AND (p_organizer IS NULL OR m.organizer_id::TEXT = p_organizer)
    -- 검색 (제목 또는 내용 요약)
    AND (
      p_search IS NULL
      OR m.title ILIKE '%' || p_search || '%'
      OR m.content->>'summary' ILIKE '%' || p_search || '%'
    )
  ORDER BY m.meeting_date DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- 참석자 기반 접근 가능한 회의록 통계 조회
CREATE OR REPLACE FUNCTION get_accessible_meeting_statistics(
  p_user_id        TEXT,
  p_is_full_access BOOLEAN
)
RETURNS TABLE (
  total      BIGINT,
  draft      BIGINT,
  completed  BIGINT,
  archived   BIGINT,
  this_month BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_month_start TIMESTAMPTZ := date_trunc('month', NOW());
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)                                                              AS total,
    COUNT(*) FILTER (WHERE m.status = 'draft')                           AS draft,
    COUNT(*) FILTER (WHERE m.status = 'completed')                       AS completed,
    COUNT(*) FILTER (WHERE m.status = 'archived')                        AS archived,
    COUNT(*) FILTER (WHERE m.meeting_date >= v_month_start)              AS this_month
  FROM meeting_minutes m
  WHERE
    p_is_full_access
    OR m.organizer_id::TEXT = p_user_id
    OR m.created_by::TEXT   = p_user_id
    OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements(m.participants) AS p
      WHERE p->>'employee_id' = p_user_id
    );
END;
$$;

COMMENT ON FUNCTION get_accessible_meeting_minutes IS
  '참석자 기반 접근 제어가 적용된 회의록 목록 조회. permission_level>=4 또는 특별 허용 계정은 p_is_full_access=true로 호출.';

COMMENT ON FUNCTION get_accessible_meeting_statistics IS
  '참석자 기반 접근 제어가 적용된 회의록 통계 조회.';
