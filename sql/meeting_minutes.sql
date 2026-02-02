-- ============================================
-- 회의록 관리 시스템 데이터베이스 스키마
-- ============================================

-- 1. meeting_minutes 테이블 생성
CREATE TABLE IF NOT EXISTS meeting_minutes (
  -- 기본 정보
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title VARCHAR(255) NOT NULL,
  meeting_date TIMESTAMP WITH TIME ZONE NOT NULL,
  meeting_type VARCHAR(50) NOT NULL,

  -- 참석자 정보
  organizer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  participants JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- 장소 정보
  location VARCHAR(255),
  location_type VARCHAR(50),

  -- 안건 정보
  agenda JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- 회의록 내용
  content JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- 첨부파일
  attachments JSONB DEFAULT '[]'::jsonb,

  -- 상태 관리
  status VARCHAR(20) DEFAULT 'draft',
  visibility VARCHAR(20) DEFAULT 'private',

  -- 메타데이터
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- 제약조건
  CONSTRAINT valid_status CHECK (status IN ('draft', 'completed', 'archived')),
  CONSTRAINT valid_visibility CHECK (visibility IN ('private', 'team', 'public'))
);

-- 2. 인덱스 생성 (성능 최적화)
CREATE INDEX IF NOT EXISTS idx_meeting_minutes_date ON meeting_minutes(meeting_date DESC);
CREATE INDEX IF NOT EXISTS idx_meeting_minutes_status ON meeting_minutes(status);
CREATE INDEX IF NOT EXISTS idx_meeting_minutes_organizer ON meeting_minutes(organizer_id);
CREATE INDEX IF NOT EXISTS idx_meeting_minutes_created_by ON meeting_minutes(created_by);
CREATE INDEX IF NOT EXISTS idx_meeting_minutes_meeting_type ON meeting_minutes(meeting_type);

-- JSONB 인덱스 (참석자 검색 최적화)
CREATE INDEX IF NOT EXISTS idx_meeting_minutes_participants ON meeting_minutes USING GIN (participants);

-- 3. Updated_at 자동 업데이트 트리거
CREATE OR REPLACE FUNCTION update_meeting_minutes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_meeting_minutes_updated_at ON meeting_minutes;
CREATE TRIGGER trigger_update_meeting_minutes_updated_at
BEFORE UPDATE ON meeting_minutes
FOR EACH ROW
EXECUTE FUNCTION update_meeting_minutes_updated_at();

-- 4. meeting_templates 테이블 생성 (템플릿 관리)
CREATE TABLE IF NOT EXISTS meeting_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  meeting_type VARCHAR(50) NOT NULL,

  -- 템플릿 구조
  template_structure JSONB NOT NULL,

  -- 메타데이터
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  is_public BOOLEAN DEFAULT false,
  usage_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. 템플릿 테이블 인덱스
CREATE INDEX IF NOT EXISTS idx_meeting_templates_type ON meeting_templates(meeting_type);
CREATE INDEX IF NOT EXISTS idx_meeting_templates_created_by ON meeting_templates(created_by);
CREATE INDEX IF NOT EXISTS idx_meeting_templates_is_public ON meeting_templates(is_public);

-- 6. RLS (Row Level Security) 정책

-- meeting_minutes RLS 활성화
ALTER TABLE meeting_minutes ENABLE ROW LEVEL SECURITY;

-- 읽기 권한: 본인이 참석자로 포함된 회의록 또는 공개 회의록
DROP POLICY IF EXISTS "Users can view their meetings or public meetings" ON meeting_minutes;
CREATE POLICY "Users can view their meetings or public meetings"
ON meeting_minutes FOR SELECT
USING (
  auth.uid() = created_by
  OR auth.uid() = organizer_id
  OR visibility = 'public'
  OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(participants) AS p
    WHERE (p->>'id')::uuid = auth.uid()
  )
);

-- 생성 권한: 인증된 모든 사용자
DROP POLICY IF EXISTS "Authenticated users can create meetings" ON meeting_minutes;
CREATE POLICY "Authenticated users can create meetings"
ON meeting_minutes FOR INSERT
WITH CHECK (auth.uid() = created_by);

-- 수정 권한: 작성자 또는 주관자
DROP POLICY IF EXISTS "Users can update their meetings" ON meeting_minutes;
CREATE POLICY "Users can update their meetings"
ON meeting_minutes FOR UPDATE
USING (
  auth.uid() = created_by
  OR auth.uid() = organizer_id
);

-- 삭제 권한: 작성자만
DROP POLICY IF EXISTS "Users can delete their meetings" ON meeting_minutes;
CREATE POLICY "Users can delete their meetings"
ON meeting_minutes FOR DELETE
USING (auth.uid() = created_by);

-- meeting_templates RLS 활성화
ALTER TABLE meeting_templates ENABLE ROW LEVEL SECURITY;

-- 템플릿 읽기: 공개 템플릿 또는 본인이 생성한 템플릿
DROP POLICY IF EXISTS "Users can view public or own templates" ON meeting_templates;
CREATE POLICY "Users can view public or own templates"
ON meeting_templates FOR SELECT
USING (is_public = true OR auth.uid() = created_by);

-- 템플릿 생성: 인증된 사용자
DROP POLICY IF EXISTS "Authenticated users can create templates" ON meeting_templates;
CREATE POLICY "Authenticated users can create templates"
ON meeting_templates FOR INSERT
WITH CHECK (auth.uid() = created_by);

-- 템플릿 수정: 작성자만
DROP POLICY IF EXISTS "Users can update their templates" ON meeting_templates;
CREATE POLICY "Users can update their templates"
ON meeting_templates FOR UPDATE
USING (auth.uid() = created_by);

-- 템플릿 삭제: 작성자만
DROP POLICY IF EXISTS "Users can delete their templates" ON meeting_templates;
CREATE POLICY "Users can delete their templates"
ON meeting_templates FOR DELETE
USING (auth.uid() = created_by);

-- 7. 기본 템플릿 데이터 삽입
INSERT INTO meeting_templates (name, description, meeting_type, template_structure, is_public, created_by)
VALUES
  (
    '정기 주간 회의',
    '주간 업무 진행 상황 공유 및 이슈 논의',
    '정기회의',
    '{
      "agenda": [
        {"title": "지난주 업무 리뷰", "description": "완료된 업무 및 성과 공유", "duration": 15},
        {"title": "이번주 계획", "description": "주요 업무 계획 및 목표 설정", "duration": 15},
        {"title": "이슈 및 논의사항", "description": "해결이 필요한 이슈 논의", "duration": 20},
        {"title": "기타 안건", "description": "추가 논의사항", "duration": 10}
      ],
      "default_participants": [],
      "checklist": ["회의록 작성", "액션 아이템 할당", "다음 회의 일정 확정"]
    }'::jsonb,
    true,
    NULL
  ),
  (
    '프로젝트 킥오프 미팅',
    '신규 프로젝트 시작을 위한 킥오프 회의',
    '프로젝트회의',
    '{
      "agenda": [
        {"title": "프로젝트 개요 소개", "description": "프로젝트 목표 및 배경 설명", "duration": 20},
        {"title": "팀 소개 및 역할 분담", "description": "팀원 소개 및 담당 업무 할당", "duration": 15},
        {"title": "일정 및 마일스톤", "description": "프로젝트 일정 및 주요 마일스톤 설정", "duration": 20},
        {"title": "리스크 및 이슈", "description": "예상 리스크 식별 및 대응 방안", "duration": 15},
        {"title": "커뮤니케이션 계획", "description": "협업 도구 및 보고 체계 확립", "duration": 10}
      ],
      "default_participants": [],
      "checklist": ["프로젝트 문서 공유", "협업 도구 설정", "첫 스프린트 계획"]
    }'::jsonb,
    true,
    NULL
  ),
  (
    '고객 미팅',
    '고객과의 요구사항 논의 및 진행 현황 공유',
    '고객미팅',
    '{
      "agenda": [
        {"title": "고객사 소개 및 인사", "description": "참석자 소개 및 미팅 목적 공유", "duration": 10},
        {"title": "요구사항 청취", "description": "고객의 요구사항 및 기대사항 파악", "duration": 30},
        {"title": "제안 및 솔루션 설명", "description": "우리 측 제안 및 해결 방안 제시", "duration": 20},
        {"title": "일정 및 다음 단계", "description": "향후 일정 및 액션 아이템 합의", "duration": 10}
      ],
      "default_participants": [],
      "checklist": ["고객 요구사항 문서화", "제안서 작성", "후속 미팅 일정 확정"]
    }'::jsonb,
    true,
    NULL
  ),
  (
    '임시 회의',
    '긴급 이슈 논의를 위한 임시 회의',
    '임시회의',
    '{
      "agenda": [
        {"title": "긴급 이슈 개요", "description": "발생한 이슈 상황 설명", "duration": 10},
        {"title": "원인 분석", "description": "문제 발생 원인 분석", "duration": 15},
        {"title": "해결 방안 논의", "description": "가능한 해결책 및 대응 방안 모색", "duration": 20},
        {"title": "액션 플랜 수립", "description": "구체적인 실행 계획 및 담당자 할당", "duration": 15}
      ],
      "default_participants": [],
      "checklist": ["이슈 해결", "후속 조치 모니터링", "재발 방지 대책 수립"]
    }'::jsonb,
    true,
    NULL
  )
ON CONFLICT DO NOTHING;

-- 8. 유용한 뷰 생성

-- 회의록 통계 뷰
CREATE OR REPLACE VIEW meeting_minutes_statistics AS
SELECT
  COUNT(*) FILTER (WHERE status = 'draft') AS draft_count,
  COUNT(*) FILTER (WHERE status = 'completed') AS completed_count,
  COUNT(*) FILTER (WHERE status = 'archived') AS archived_count,
  COUNT(*) FILTER (WHERE meeting_date >= DATE_TRUNC('month', CURRENT_DATE)) AS this_month_count,
  COUNT(*) AS total_count
FROM meeting_minutes;

-- 9. 댓글 기능 (선택사항)
COMMENT ON TABLE meeting_minutes IS '회의록 정보를 저장하는 테이블';
COMMENT ON COLUMN meeting_minutes.participants IS 'JSON 배열: [{ id: uuid, name: string, role: string, attended: boolean }]';
COMMENT ON COLUMN meeting_minutes.agenda IS 'JSON 배열: [{ id: uuid, title: string, description: string, duration: number }]';
COMMENT ON COLUMN meeting_minutes.content IS 'JSON 객체: { summary: string, discussions: [], action_items: [] }';
COMMENT ON COLUMN meeting_minutes.attachments IS 'JSON 배열: [{ id: uuid, name: string, url: string, type: string, size: number }]';
