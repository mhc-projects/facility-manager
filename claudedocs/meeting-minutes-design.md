# 회의록 시스템 설계 명세서

## 📋 프로젝트 개요

**목적**: 시설 관리 시스템에 통합된 프리미엄 디자인의 회의록 작성 및 관리 시스템
**위치**: `/admin/meeting-minutes` 경로에 구현
**레이아웃**: AdminLayout 컴포넌트 기반 (좌측 네비게이션바 포함)

---

## 🎨 디자인 시스템

### 색상 팔레트
```typescript
const meetingMinutesTheme = {
  primary: {
    blue: '#3B82F6',      // 버튼, 강조
    indigo: '#6366F1',    // 그라데이션
    slate: '#64748B'      // 텍스트
  },
  status: {
    draft: '#F59E0B',     // 작성중
    completed: '#10B981', // 완료
    archived: '#6B7280'   // 보관
  },
  background: {
    gradient: 'from-slate-50 to-gray-100',
    card: 'white',
    hover: 'gray-50'
  }
}
```

### 타이포그래피
- **제목**: 2xl/xl/lg font-bold text-gray-900
- **본문**: base/sm font-medium text-gray-700
- **메타정보**: sm/xs text-gray-500
- **강조**: font-semibold text-blue-700

---

## 📐 시스템 아키텍처

### 1. 데이터베이스 스키마 (Supabase)

#### 1.1 meeting_minutes 테이블
```sql
CREATE TABLE meeting_minutes (
  -- 기본 정보
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title VARCHAR(255) NOT NULL,
  meeting_date TIMESTAMP WITH TIME ZONE NOT NULL,
  meeting_type VARCHAR(50) NOT NULL, -- '정기회의', '임시회의', '프로젝트회의', '고객미팅'

  -- 참석자 정보
  organizer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  participants JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- participants structure: [{ id: uuid, name: string, role: string, attended: boolean }]

  -- 장소 정보
  location VARCHAR(255), -- '본사 회의실 A', '온라인 (Zoom)', '고객사'
  location_type VARCHAR(50), -- 'offline', 'online', 'hybrid'

  -- 안건 정보
  agenda JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- agenda structure: [{ id: uuid, title: string, description: string, duration: number }]

  -- 회의록 내용
  content JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- content structure: {
  --   summary: string,
  --   discussions: [{ topic: string, notes: string, decisions: string[] }],
  --   action_items: [{ id: uuid, task: string, assignee_id: uuid, due_date: date, status: string }]
  -- }

  -- 첨부파일
  attachments JSONB DEFAULT '[]'::jsonb,
  -- attachments structure: [{ id: uuid, name: string, url: string, type: string, size: number }]

  -- 상태 관리
  status VARCHAR(20) DEFAULT 'draft', -- 'draft', 'completed', 'archived'
  visibility VARCHAR(20) DEFAULT 'private', -- 'private', 'team', 'public'

  -- 메타데이터
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- 인덱스
  CONSTRAINT valid_status CHECK (status IN ('draft', 'completed', 'archived')),
  CONSTRAINT valid_visibility CHECK (visibility IN ('private', 'team', 'public'))
);

-- 인덱스 생성
CREATE INDEX idx_meeting_minutes_date ON meeting_minutes(meeting_date DESC);
CREATE INDEX idx_meeting_minutes_status ON meeting_minutes(status);
CREATE INDEX idx_meeting_minutes_organizer ON meeting_minutes(organizer_id);
CREATE INDEX idx_meeting_minutes_created_by ON meeting_minutes(created_by);

-- Updated_at 자동 업데이트 트리거
CREATE OR REPLACE FUNCTION update_meeting_minutes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_meeting_minutes_updated_at
BEFORE UPDATE ON meeting_minutes
FOR EACH ROW
EXECUTE FUNCTION update_meeting_minutes_updated_at();
```

#### 1.2 meeting_templates 테이블 (템플릿 관리)
```sql
CREATE TABLE meeting_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  meeting_type VARCHAR(50) NOT NULL,

  -- 템플릿 구조
  template_structure JSONB NOT NULL,
  -- template_structure: { agenda: [], default_participants: [], checklist: [] }

  -- 메타데이터
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  is_public BOOLEAN DEFAULT false,
  usage_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_meeting_templates_type ON meeting_templates(meeting_type);
```

### 2. TypeScript 타입 정의

```typescript
// types/meeting-minutes.ts

export interface MeetingParticipant {
  id: string
  name: string
  role: string
  attended: boolean
}

export interface AgendaItem {
  id: string
  title: string
  description: string
  duration: number // 분 단위
}

export interface Discussion {
  topic: string
  notes: string
  decisions: string[]
}

export interface ActionItem {
  id: string
  task: string
  assignee_id: string
  assignee_name?: string
  due_date: string
  status: 'pending' | 'in_progress' | 'completed'
  priority?: 'low' | 'medium' | 'high'
}

export interface MeetingContent {
  summary: string
  discussions: Discussion[]
  action_items: ActionItem[]
}

export interface Attachment {
  id: string
  name: string
  url: string
  type: string
  size: number
}

export interface MeetingMinute {
  id: string
  title: string
  meeting_date: string
  meeting_type: '정기회의' | '임시회의' | '프로젝트회의' | '고객미팅'

  organizer_id: string
  organizer_name?: string
  participants: MeetingParticipant[]

  location: string
  location_type: 'offline' | 'online' | 'hybrid'

  agenda: AgendaItem[]
  content: MeetingContent
  attachments: Attachment[]

  status: 'draft' | 'completed' | 'archived'
  visibility: 'private' | 'team' | 'public'

  created_by: string
  updated_by: string
  created_at: string
  updated_at: string
}

export interface MeetingTemplate {
  id: string
  name: string
  description: string
  meeting_type: string
  template_structure: {
    agenda: AgendaItem[]
    default_participants: MeetingParticipant[]
    checklist: string[]
  }
  created_by: string
  is_public: boolean
  usage_count: number
  created_at: string
  updated_at: string
}

export interface MeetingFilters {
  status?: 'draft' | 'completed' | 'archived' | 'all'
  meeting_type?: string
  date_from?: string
  date_to?: string
  organizer?: string
  search?: string
}
```

---

## 🖼️ UI/UX 설계

### 1. 페이지 구조

#### 1.1 메인 페이지 (`/admin/meeting-minutes`)

**레이아웃 구성**:
```
┌─────────────────────────────────────────────────────┐
│  AdminLayout (네비게이션바)                           │
├─────────────────────────────────────────────────────┤
│  Header                                              │
│  - 제목: "회의록 관리"                                 │
│  - 액션: [+ 새 회의록] [템플릿 관리] [내보내기]           │
├─────────────────────────────────────────────────────┤
│  통계 대시보드 (4개 카드)                              │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐               │
│  │전체   │ │작성중 │ │완료   │ │이번달 │               │
│  └──────┘ └──────┘ └──────┘ └──────┘               │
├─────────────────────────────────────────────────────┤
│  필터/검색 바                                          │
│  [상태▾] [회의유형▾] [기간▾] [주관자▾] [🔍 검색]        │
├─────────────────────────────────────────────────────┤
│  회의록 리스트 (카드형 + 테이블형 전환 가능)              │
│  ┌─────────────────────────────────────────┐        │
│  │ 📋 정기회의 - 2024년 1월 주간 회의         │        │
│  │ 2024-01-30 (화) 14:00 | 본사 회의실 A      │        │
│  │ 주관자: 홍길동 | 참석: 5명 | 완료           │        │
│  │ [보기] [편집] [복사] [삭제]                 │        │
│  └─────────────────────────────────────────┘        │
│  ... (더 많은 카드)                                   │
├─────────────────────────────────────────────────────┤
│  페이지네이션                                         │
└─────────────────────────────────────────────────────┘
```

**주요 기능**:
- 📊 통계 대시보드: 전체/작성중/완료/이번달 회의록 수
- 🔍 다중 필터: 상태, 회의 유형, 날짜 범위, 주관자
- 🔄 뷰 전환: 카드형 ↔ 테이블형
- 📥 일괄 작업: 선택된 회의록 내보내기/보관/삭제
- 🎯 빠른 액션: 각 회의록 카드에서 즉시 보기/편집/복사

#### 1.2 회의록 작성/편집 페이지

**레이아웃 구성**:
```
┌─────────────────────────────────────────────────────┐
│  AdminLayout                                         │
├─────────────────────────────────────────────────────┤
│  Header                                              │
│  - 제목: "회의록 작성/편집"                            │
│  - 액션: [임시저장] [완료] [미리보기] [취소]            │
├─────────────────────────────────────────────────────┤
│  ┌─────────────────┬───────────────────────┐        │
│  │ 기본 정보       │  진행 단계             │        │
│  │                 │  ① 기본정보 → ② 안건    │        │
│  │ 제목: ______    │  → ③ 내용 → ④ 완료    │        │
│  │ 날짜: [📅]      │                        │        │
│  │ 유형: [▾]       │                        │        │
│  │ 장소: ______    │                        │        │
│  │ 참석자: [추가]  │                        │        │
│  └─────────────────┴───────────────────────┘        │
├─────────────────────────────────────────────────────┤
│  안건 (Agenda) 섹션                                   │
│  ┌─────────────────────────────────────────┐        │
│  │ + 안건 추가                               │        │
│  │ 1. [제목] [설명] [예상시간: 30분] [삭제]   │        │
│  │ 2. [제목] [설명] [예상시간: 15분] [삭제]   │        │
│  └─────────────────────────────────────────┘        │
├─────────────────────────────────────────────────────┤
│  회의 내용 (Rich Text Editor)                         │
│  ┌─────────────────────────────────────────┐        │
│  │ 📝 요약                                   │        │
│  │ [리치 텍스트 에디터]                       │        │
│  │                                          │        │
│  │ 💬 논의사항                               │        │
│  │ + 논의사항 추가                           │        │
│  │ - 주제: ______                           │        │
│  │   내용: [에디터]                          │        │
│  │   결정사항: [항목 추가]                    │        │
│  │                                          │        │
│  │ ✅ 액션 아이템                            │        │
│  │ + 액션 아이템 추가                         │        │
│  │ - 작업: ______                           │        │
│  │   담당자: [선택]                          │        │
│  │   마감일: [📅]                            │        │
│  │   상태: [대기중▾]                         │        │
│  └─────────────────────────────────────────┘        │
├─────────────────────────────────────────────────────┤
│  첨부파일                                             │
│  [📎 파일 선택] [드래그 앤 드롭 영역]                  │
│  - document.pdf (2.3MB) [삭제]                       │
│  - screenshot.png (1.5MB) [삭제]                     │
└─────────────────────────────────────────────────────┘
```

**주요 기능**:
- 📝 Rich Text Editor (Tiptap 또는 Lexical 권장)
- 👥 참석자 자동완성 검색
- 📅 날짜/시간 선택 (react-datepicker)
- ✅ 액션 아이템 진행상황 추적
- 💾 자동 저장 (5분마다)
- 📎 파일 첨부 (드래그 앤 드롭)
- 📋 템플릿 적용 기능

#### 1.3 회의록 상세 보기 페이지

**레이아웃 구성**:
```
┌─────────────────────────────────────────────────────┐
│  AdminLayout                                         │
├─────────────────────────────────────────────────────┤
│  Header                                              │
│  - 제목: [회의록 제목]                                 │
│  - 액션: [편집] [PDF 내보내기] [공유] [삭제]            │
├─────────────────────────────────────────────────────┤
│  상태 배지 및 메타정보                                 │
│  🟢 완료 | 📅 2024-01-30 (화) | ⏰ 14:00-16:00       │
│  👤 주관자: 홍길동 | 📍 본사 회의실 A                  │
├─────────────────────────────────────────────────────┤
│  참석자 (아바타 표시)                                  │
│  👤👤👤👤👤 5명 참석 / 7명 초대                         │
├─────────────────────────────────────────────────────┤
│  안건                                                 │
│  ✓ 1. 프로젝트 진행 현황 (30분)                       │
│  ✓ 2. 다음 분기 계획 (20분)                           │
│  ✓ 3. 기타 논의사항 (10분)                            │
├─────────────────────────────────────────────────────┤
│  회의 요약                                            │
│  [요약 내용 표시]                                      │
├─────────────────────────────────────────────────────┤
│  논의사항                                             │
│  📌 프로젝트 진행 현황                                 │
│     - 현황: [내용]                                    │
│     - 결정사항:                                       │
│       • 결정 1                                       │
│       • 결정 2                                       │
├─────────────────────────────────────────────────────┤
│  액션 아이템                                           │
│  ┌─────────────────────────────────────────┐        │
│  │ ☑ 보고서 작성 | 김철수 | 2024-02-05 | 완료 │        │
│  │ ◻ 고객 미팅 준비 | 이영희 | 2024-02-10 | 대기│        │
│  └─────────────────────────────────────────┘        │
├─────────────────────────────────────────────────────┤
│  첨부파일                                             │
│  📎 document.pdf (2.3MB) [다운로드]                   │
│  📎 screenshot.png (1.5MB) [다운로드]                 │
└─────────────────────────────────────────────────────┘
```

---

## 🔧 API 엔드포인트 설계

### 1. 회의록 CRUD

#### 1.1 GET `/api/meeting-minutes`
**목적**: 회의록 목록 조회 (필터링, 페이지네이션)

**Query Parameters**:
```typescript
{
  page?: number           // 페이지 번호 (기본: 1)
  limit?: number          // 페이지당 항목 수 (기본: 20)
  status?: string         // 'draft' | 'completed' | 'archived' | 'all'
  meeting_type?: string   // 회의 유형 필터
  date_from?: string      // 시작 날짜 (YYYY-MM-DD)
  date_to?: string        // 종료 날짜 (YYYY-MM-DD)
  organizer?: string      // 주관자 UUID
  search?: string         // 제목, 내용 검색
}
```

**Response**:
```typescript
{
  success: boolean
  data: {
    items: MeetingMinute[]
    pagination: {
      total: number
      page: number
      limit: number
      totalPages: number
    }
    statistics: {
      total: number
      draft: number
      completed: number
      archived: number
      thisMonth: number
    }
  }
  error?: string
}
```

#### 1.2 GET `/api/meeting-minutes/[id]`
**목적**: 특정 회의록 상세 조회

**Response**:
```typescript
{
  success: boolean
  data: MeetingMinute
  error?: string
}
```

#### 1.3 POST `/api/meeting-minutes`
**목적**: 새 회의록 생성

**Request Body**:
```typescript
{
  title: string
  meeting_date: string
  meeting_type: string
  organizer_id: string
  participants: MeetingParticipant[]
  location: string
  location_type: 'offline' | 'online' | 'hybrid'
  agenda: AgendaItem[]
  content: MeetingContent
  attachments?: Attachment[]
  status?: 'draft' | 'completed'
  visibility?: 'private' | 'team' | 'public'
}
```

#### 1.4 PUT `/api/meeting-minutes/[id]`
**목적**: 회의록 수정

#### 1.5 DELETE `/api/meeting-minutes/[id]`
**목적**: 회의록 삭제 (soft delete 권장)

### 2. 템플릿 관리

#### 2.1 GET `/api/meeting-templates`
**목적**: 템플릿 목록 조회

#### 2.2 POST `/api/meeting-templates`
**목적**: 새 템플릿 생성

#### 2.3 GET `/api/meeting-templates/[id]`
**목적**: 템플릿 적용 (회의록 생성 시)

### 3. 파일 업로드

#### 3.1 POST `/api/meeting-minutes/upload`
**목적**: 첨부파일 업로드 (Supabase Storage)

**Request**: FormData (multipart/form-data)

**Response**:
```typescript
{
  success: boolean
  data: {
    id: string
    name: string
    url: string
    type: string
    size: number
  }
  error?: string
}
```

### 4. 내보내기

#### 4.1 GET `/api/meeting-minutes/[id]/export`
**목적**: PDF로 회의록 내보내기

**Query Parameters**:
```typescript
{
  format: 'pdf' | 'docx' // 기본: pdf
}
```

---

## 🛠️ 기술 스택 및 라이브러리

### 필수 라이브러리

```json
{
  "dependencies": {
    "@tiptap/react": "^2.1.13",           // Rich Text Editor
    "@tiptap/starter-kit": "^2.1.13",
    "react-datepicker": "^4.25.0",        // 날짜 선택
    "react-select": "^5.8.0",             // 참석자 선택 (자동완성)
    "react-dropzone": "^14.2.3",          // 파일 드래그 앤 드롭
    "jspdf": "^2.5.1",                    // PDF 생성
    "html2canvas": "^1.4.1",              // HTML to Canvas
    "lucide-react": "^0.300.0"            // 아이콘 (이미 사용 중)
  }
}
```

### 컴포넌트 구조

```
app/admin/meeting-minutes/
├── page.tsx                          # 메인 리스트 페이지
├── [id]/
│   ├── page.tsx                      # 상세 보기
│   └── edit/
│       └── page.tsx                  # 편집 페이지
├── create/
│   └── page.tsx                      # 새 회의록 작성
└── templates/
    └── page.tsx                      # 템플릿 관리

components/meeting-minutes/
├── MeetingMinutesList.tsx            # 회의록 리스트 (카드형)
├── MeetingMinutesTable.tsx           # 회의록 테이블
├── MeetingMinuteCard.tsx             # 개별 카드
├── MeetingMinuteFilters.tsx          # 필터 컴포넌트
├── MeetingMinuteStats.tsx            # 통계 대시보드
├── MeetingMinuteEditor/
│   ├── BasicInfoForm.tsx             # 기본 정보 입력
│   ├── AgendaEditor.tsx              # 안건 편집기
│   ├── ContentEditor.tsx             # 내용 에디터 (Tiptap)
│   ├── DiscussionEditor.tsx          # 논의사항 편집기
│   ├── ActionItemsEditor.tsx         # 액션 아이템 편집기
│   ├── ParticipantSelector.tsx       # 참석자 선택기
│   └── AttachmentUploader.tsx        # 파일 첨부
├── MeetingMinuteDetail/
│   ├── DetailHeader.tsx              # 상세 헤더
│   ├── DetailMeta.tsx                # 메타정보
│   ├── DetailParticipants.tsx        # 참석자 표시
│   ├── DetailAgenda.tsx              # 안건 표시
│   ├── DetailContent.tsx             # 내용 표시
│   └── DetailActionItems.tsx         # 액션 아이템 표시
└── ExportDialog.tsx                  # 내보내기 다이얼로그

api/meeting-minutes/
├── route.ts                          # GET (목록), POST (생성)
├── [id]/
│   ├── route.ts                      # GET (상세), PUT (수정), DELETE (삭제)
│   └── export/
│       └── route.ts                  # GET (PDF 내보내기)
└── upload/
    └── route.ts                      # POST (파일 업로드)

api/meeting-templates/
├── route.ts                          # GET (목록), POST (생성)
└── [id]/
    └── route.ts                      # GET (상세)
```

---

## 📱 반응형 디자인 가이드

### 브레이크포인트
- **Mobile**: < 640px (1열 카드)
- **Tablet**: 640px - 1024px (2열 카드)
- **Desktop**: > 1024px (3열 카드 또는 테이블)

### 모바일 최적화
- 상단 고정 헤더
- 터치 친화적 버튼 크기 (최소 44x44px)
- 스와이프 제스처 지원 (카드 액션)
- 하단 플로팅 액션 버튼 (모바일에서 "새 회의록")

---

## ♿ 접근성 (Accessibility)

### ARIA 레이블
- 모든 버튼에 `aria-label` 제공
- 상태 변경 시 `aria-live` 영역 업데이트
- 키보드 네비게이션 완전 지원

### 키보드 단축키
- `Ctrl+N`: 새 회의록 작성
- `Ctrl+S`: 저장
- `Ctrl+E`: 편집 모드
- `Esc`: 다이얼로그 닫기

---

## 🔐 권한 관리

### 권한 레벨 매핑
```typescript
const MEETING_PERMISSIONS = {
  VIEW: 1,          // 일반 사용자 (본인이 참여한 회의록만)
  CREATE: 1,        // 회의록 작성
  EDIT_OWN: 1,      // 본인이 작성한 회의록 편집
  EDIT_ALL: 2,      // 모든 회의록 편집 (관리자)
  DELETE: 3,        // 회의록 삭제 (슈퍼 관리자)
  MANAGE_TEMPLATES: 3  // 템플릿 관리
}
```

### RLS (Row Level Security) 정책
```sql
-- 읽기 권한: 본인이 참석자로 포함된 회의록 또는 공개 회의록
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
CREATE POLICY "Authenticated users can create meetings"
ON meeting_minutes FOR INSERT
WITH CHECK (auth.uid() = created_by);

-- 수정 권한: 작성자 또는 주관자
CREATE POLICY "Users can update their meetings"
ON meeting_minutes FOR UPDATE
USING (
  auth.uid() = created_by
  OR auth.uid() = organizer_id
);

-- 삭제 권한: 작성자만
CREATE POLICY "Users can delete their meetings"
ON meeting_minutes FOR DELETE
USING (auth.uid() = created_by);
```

---

## 📊 성능 최적화

### 1. 데이터베이스 최적화
- JSONB 인덱스 활용
- 페이지네이션으로 대용량 데이터 처리
- 필요한 컬럼만 SELECT (참석자 수, 첨부파일 수 등은 COUNT)

### 2. 프론트엔드 최적화
- 리스트 가상화 (react-window)
- 이미지 최적화 (Next.js Image)
- 코드 스플리팅 (동적 import)
- 리치 텍스트 에디터 지연 로딩

### 3. 캐싱 전략
- 회의록 리스트 캐싱 (SWR 또는 React Query)
- 템플릿 캐싱
- 사용자 정보 캐싱

---

## 🎯 주요 기능 상세

### 1. Rich Text Editor (Tiptap)
**기능**:
- 기본 서식 (굵게, 기울임, 밑줄, 취소선)
- 제목 (H1, H2, H3)
- 목록 (순서 있음/없음)
- 링크 삽입
- 이미지 삽입
- 코드 블록
- 테이블
- 실행 취소/다시 실행

### 2. 자동 저장
- 5분마다 또는 사용자 입력 후 3초 후 자동 저장
- 저장 상태 표시 (저장됨 / 저장 중... / 오류)
- 충돌 감지 및 해결 (낙관적 업데이트)

### 3. 템플릿 시스템
**기본 템플릿**:
- 정기 주간 회의
- 프로젝트 킥오프 미팅
- 고객 미팅
- 임시 회의

**사용자 정의 템플릿**:
- 사용자가 자주 사용하는 구조를 템플릿으로 저장
- 팀 단위로 템플릿 공유

### 4. PDF 내보내기
**레이아웃**:
- 회사 로고 헤더
- 회의록 메타정보 (제목, 날짜, 장소, 참석자)
- 안건 목차
- 내용 본문
- 액션 아이템 요약 테이블
- 페이지 번호 및 생성 날짜 푸터

### 5. 알림 통합
- 회의 시작 1시간 전 알림
- 액션 아이템 마감일 알림
- 회의록 공유 시 참석자에게 알림

---

## 🧪 테스트 시나리오

### 단위 테스트
- [ ] 회의록 CRUD API 테스트
- [ ] 필터링 로직 테스트
- [ ] 권한 검증 테스트
- [ ] 날짜 파싱 및 포맷팅 테스트

### 통합 테스트
- [ ] 회의록 작성 전체 플로우
- [ ] 템플릿 적용 및 회의록 생성
- [ ] PDF 내보내기
- [ ] 파일 업로드 및 첨부

### E2E 테스트
- [ ] 로그인 → 회의록 작성 → 저장 → 확인
- [ ] 필터링 및 검색
- [ ] 모바일 반응형 테스트

---

## 📅 구현 로드맵

### Phase 1: 기본 기능 (1-2주)
- ✅ 데이터베이스 스키마 구현
- ✅ API 엔드포인트 개발
- ✅ 회의록 리스트 페이지
- ✅ 회의록 상세 보기

### Phase 2: 작성/편집 기능 (1-2주)
- ✅ Rich Text Editor 통합
- ✅ 기본 정보 입력 폼
- ✅ 안건 편집기
- ✅ 논의사항 및 액션 아이템 편집기
- ✅ 자동 저장 기능

### Phase 3: 고급 기능 (1주)
- ✅ 템플릿 시스템
- ✅ 파일 첨부
- ✅ PDF 내보내기
- ✅ 알림 통합

### Phase 4: 최적화 및 테스트 (1주)
- ✅ 성능 최적화
- ✅ 반응형 디자인 완성
- ✅ 접근성 개선
- ✅ 테스트 작성 및 버그 수정

**총 예상 기간**: 4-6주

---

## 🎨 UI 컴포넌트 예시 코드

### 회의록 카드 컴포넌트
```typescript
// components/meeting-minutes/MeetingMinuteCard.tsx
'use client'

import { MeetingMinute } from '@/types/meeting-minutes'
import { Calendar, Clock, MapPin, Users, MoreVertical } from 'lucide-react'
import Link from 'next/link'

interface Props {
  minute: MeetingMinute
  onEdit?: () => void
  onDelete?: () => void
}

export default function MeetingMinuteCard({ minute, onEdit, onDelete }: Props) {
  const statusColors = {
    draft: 'bg-amber-100 text-amber-800',
    completed: 'bg-green-100 text-green-800',
    archived: 'bg-gray-100 text-gray-800'
  }

  const statusLabels = {
    draft: '작성중',
    completed: '완료',
    archived: '보관'
  }

  return (
    <div className="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow duration-200 border border-gray-200 overflow-hidden">
      {/* 상태 배지 */}
      <div className="flex items-center justify-between p-4 border-b border-gray-100">
        <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusColors[minute.status]}`}>
          {statusLabels[minute.status]}
        </span>
        <button className="p-1 hover:bg-gray-100 rounded-lg">
          <MoreVertical className="w-4 h-4 text-gray-500" />
        </button>
      </div>

      {/* 메인 내용 */}
      <Link href={`/admin/meeting-minutes/${minute.id}`}>
        <div className="p-4 space-y-3 cursor-pointer hover:bg-gray-50 transition-colors">
          {/* 회의 유형 및 제목 */}
          <div>
            <div className="text-xs text-blue-600 font-medium mb-1">
              📋 {minute.meeting_type}
            </div>
            <h3 className="text-base font-semibold text-gray-900 line-clamp-2">
              {minute.title}
            </h3>
          </div>

          {/* 메타정보 */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Calendar className="w-4 h-4" />
              <span>{new Date(minute.meeting_date).toLocaleDateString('ko-KR')}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <MapPin className="w-4 h-4" />
              <span className="truncate">{minute.location}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Users className="w-4 h-4" />
              <span>참석자 {minute.participants.length}명</span>
            </div>
          </div>

          {/* 액션 아이템 요약 */}
          {minute.content.action_items.length > 0 && (
            <div className="pt-2 border-t border-gray-100">
              <div className="text-xs text-gray-500">
                액션 아이템 {minute.content.action_items.length}개
              </div>
            </div>
          )}
        </div>
      </Link>

      {/* 액션 버튼 */}
      <div className="p-3 bg-gray-50 flex gap-2">
        <button
          onClick={onEdit}
          className="flex-1 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"
        >
          편집
        </button>
        <button className="flex-1 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
          복사
        </button>
      </div>
    </div>
  )
}
```

---

## 📝 결론

이 설계 명세서는 **프리미엄 디자인의 회의록 관리 시스템**을 위한 완전한 가이드입니다.

**핵심 특징**:
✅ AdminLayout 기반의 일관된 UI/UX
✅ Supabase 통합 데이터베이스
✅ Rich Text Editor 기반 콘텐츠 작성
✅ 템플릿 시스템으로 생산성 향상
✅ PDF 내보내기 및 파일 첨부
✅ 반응형 디자인 및 접근성
✅ 권한 기반 보안 (RLS)

**다음 단계**:
1. 데이터베이스 스키마 생성 (`sql/meeting_minutes.sql`)
2. API 라우트 구현 (`app/api/meeting-minutes/`)
3. 타입 정의 추가 (`types/meeting-minutes.ts`)
4. UI 컴포넌트 개발 시작
5. AdminLayout에 네비게이션 항목 추가

**문의 및 피드백**:
설계에 대한 수정사항이나 추가 기능이 필요하시면 말씀해주세요! 🚀
