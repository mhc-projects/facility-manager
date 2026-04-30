# DPF 섹션 최종 설계 문서

> 작성일: 2026-04-23 / 수정: 2026-04-24  
> 상태: 구현 준비 완료

---

## 1. 개요

후지노 차량 데이터(18,789건)를 기반으로 DPF(매연저감장치) 업무를 통합 관리하는 섹션.
기후에너지환경부 '26년 업무처리지침에 맞는 서식 자동작성·출력, Wiki, AI Q&A 포함.

### UI 표시 컬럼 확정 (노란색 헤더 9개)

엑셀 파일에서 노란색으로 표시된 컬럼만 UI에 표시한다.
나머지 43개 컬럼은 DB에 `raw_data JSONB`로 보관하되 UI에는 노출하지 않는다.

| 순서 | 엑셀 컬럼명 | DB 컬럼 | 소속 테이블 |
|---|---|---|---|
| 1 | 차대번호 | `vin` | `dpf_vehicles` |
| 2 | 차량번호 | `plate_number` | `dpf_vehicles` |
| 3 | 차명 | `vehicle_name` | `dpf_vehicles` |
| 4 | 소유자성명 | `owner_name` | `dpf_vehicles` |
| 5 | 주소 | `owner_address` | `dpf_vehicles` |
| 6 | 연락처 | `owner_contact` | `dpf_vehicles` |
| 7 | 접수지자체명 | `local_government` | `dpf_vehicles` (비정규화) |
| 8 | 장치시리얼번호 | `device_serial` | `dpf_vehicles` (비정규화) |
| 9 | 구변일자 | `installation_date` | `dpf_vehicles` (비정규화) |

> **비정규화 이유**: 접수지자체명·장치시리얼번호·구변일자는 원래 별도 테이블 소속이나,
> 목록/검색에서 항상 함께 표시되므로 `dpf_vehicles`에 중복 저장해 JOIN 없이 조회.

---

## 2. 기술 스택

| 항목 | 선택 | 비고 |
|---|---|---|
| Frontend | React + TypeScript (기존) | |
| Backend | Supabase (기존) | |
| 임베딩 | HuggingFace multilingual-e5-large | 무료 |
| LLM (Q&A) | Google Gemini Flash | 무료 1,500회/일 |
| PDF 파싱 | pdf-parse | npm 설치 필요 |
| 엑셀 파싱 | xlsx | npm 설치 필요 |
| 벡터 DB | Supabase pgvector | 기존 Supabase |

### 추가 패키지
```bash
npm install xlsx pdf-parse @google/generative-ai
```

### 환경변수 추가 (.env.local)
```
HF_API_KEY=hf_...          # huggingface.co/settings/tokens (무료)
GEMINI_API_KEY=AIza...     # aistudio.google.com/apikey (무료)
```

---

## 3. DB 스키마 (전체)

### 3-1. 차량 관리 (7개 테이블)

```sql
-- pgvector 확장 (1회만)
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 민감 개인정보 (관리자 전용)
CREATE TABLE dpf_owner_sensitive (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resident_number_hash  TEXT,
  resident_number_enc   TEXT,
  corporation_number_enc TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

-- 차량 마스터
-- UI 표시 컬럼 (★): 노란색 헤더 9개 — 목록/검색/상세 모든 화면에 표시
-- 나머지 컬럼은 raw_data JSONB에 보관, UI 미표시
CREATE TABLE dpf_vehicles (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- ★ UI 표시 컬럼 (9개)
  vin                 VARCHAR(17) NOT NULL UNIQUE,  -- 차대번호
  plate_number        VARCHAR(20) NOT NULL,          -- 차량번호
  vehicle_name        VARCHAR(100),                  -- 차명
  owner_name          VARCHAR(100),                  -- 소유자성명
  owner_address       TEXT,                          -- 주소
  owner_contact       VARCHAR(50),                   -- 연락처
  local_government    VARCHAR(100),                  -- 접수지자체명 (비정규화)
  device_serial       VARCHAR(100),                  -- 장치시리얼번호 (비정규화)
  installation_date   DATE,                          -- 구변일자 (비정규화)

  -- 나머지 컬럼 (UI 미표시, 원본 보관용)
  raw_data            JSONB DEFAULT '{}',

  -- 시스템 컬럼
  is_active           BOOLEAN NOT NULL DEFAULT true,
  is_deleted          BOOLEAN NOT NULL DEFAULT false,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_dpf_vehicles_vin ON dpf_vehicles(vin);
CREATE INDEX idx_dpf_vehicles_plate ON dpf_vehicles(plate_number);
CREATE INDEX idx_dpf_vehicles_owner ON dpf_vehicles(owner_name);
CREATE INDEX idx_dpf_vehicles_status ON dpf_vehicles(processing_status);

-- 번호판 변경 이력
CREATE TABLE dpf_vehicle_plate_history (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id    UUID NOT NULL REFERENCES dpf_vehicles(id),
  plate_number  VARCHAR(20) NOT NULL,
  valid_from    DATE NOT NULL,
  valid_to      DATE,
  change_reason VARCHAR(200),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 장치 설치/탈착 이력
CREATE TABLE dpf_device_installations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id        UUID NOT NULL REFERENCES dpf_vehicles(id),
  serial_number     VARCHAR(100),
  installer_company VARCHAR(100),
  installation_date DATE,
  management_number VARCHAR(100),
  sales_office      VARCHAR(100),
  action_type       VARCHAR(20) NOT NULL CHECK (action_type IN ('install','remove','replace')),
  notes             TEXT,
  created_by        UUID REFERENCES employees(id),
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_dpf_install_vehicle ON dpf_device_installations(vehicle_id);
CREATE INDEX idx_dpf_install_serial ON dpf_device_installations(serial_number);

-- 성능검사 이력
CREATE TABLE dpf_performance_inspections (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id       UUID NOT NULL REFERENCES dpf_vehicles(id),
  installation_id  UUID REFERENCES dpf_device_installations(id),
  inspection_date  DATE,
  inspection_agency VARCHAR(200),
  kd147_before     NUMERIC(6,2),
  kd147_after      NUMERIC(6,2),
  lugdown_before   NUMERIC(6,2),
  lugdown_after    NUMERIC(6,2),
  free_accel_before NUMERIC(6,2),
  free_accel_after  NUMERIC(6,2),
  inspection_type  VARCHAR(50) CHECK (inspection_type IN ('initial','confirmation','periodic')),
  pass_yn          BOOLEAN,
  notes            TEXT,
  created_by       UUID REFERENCES employees(id),
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- 보조금 신청/처리 이력
CREATE TABLE dpf_subsidy_applications (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id            UUID NOT NULL REFERENCES dpf_vehicles(id),
  local_government      VARCHAR(100),
  reception_date        DATE,
  approval_status       VARCHAR(20) CHECK (approval_status IN ('pending','approved','rejected','cancelled')),
  subsidy_payment_date  DATE,
  subsidy_claim_amount  NUMERIC(12,0),
  subsidy_expected_date DATE,
  self_payment_removal  NUMERIC(12,0),
  deposit_date_removal  DATE,
  offset_date           DATE,
  notes                 TEXT,
  created_by            UUID REFERENCES employees(id),
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_dpf_subsidy_vehicle ON dpf_subsidy_applications(vehicle_id);
CREATE INDEX idx_dpf_subsidy_status ON dpf_subsidy_applications(approval_status);

-- 콜모니터링 이력
CREATE TABLE dpf_call_monitoring (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id         UUID NOT NULL REFERENCES dpf_vehicles(id),
  monitoring_yn      BOOLEAN,
  monitoring_date    DATE,
  satisfaction_score INTEGER CHECK (satisfaction_score BETWEEN 1 AND 5),
  memo               TEXT,
  call_agent         VARCHAR(100),
  created_by         UUID REFERENCES employees(id),
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

-- 엑셀 임포트 스테이징
CREATE TABLE dpf_import_staging (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_batch_id UUID NOT NULL,
  row_index       INTEGER,
  raw_data        JSONB NOT NULL,
  vin             VARCHAR(17),
  status          VARCHAR(20) DEFAULT 'pending'
                  CHECK (status IN ('pending','processing','done','error')),
  error_message   TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_staging_batch ON dpf_import_staging(import_batch_id);
CREATE INDEX idx_staging_status ON dpf_import_staging(status);
```

### 3-2. Wiki / 지침 관리 (5개 테이블)

```sql
-- Wiki 노드 트리 (챕터/섹션/서식 공통)
CREATE TABLE wiki_nodes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id           UUID REFERENCES wiki_nodes(id) ON DELETE CASCADE,
  node_type           TEXT NOT NULL CHECK (node_type IN ('root','chapter','section','subsection','form','attachment')),
  sort_order          SMALLINT NOT NULL DEFAULT 0,
  title               TEXT NOT NULL,
  slug                TEXT UNIQUE,
  content_md          TEXT,
  metadata            JSONB DEFAULT '{}',
  tags                TEXT[] DEFAULT '{}',
  is_published        BOOLEAN DEFAULT false,
  current_revision_id UUID,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX ON wiki_nodes USING GIN (tags);
CREATE INDEX ON wiki_nodes USING GIN (to_tsvector('simple', COALESCE(title,'') || ' ' || COALESCE(content_md,'')));
CREATE INDEX ON wiki_nodes USING GIN (title gin_trgm_ops);

-- 개정 이력
CREATE TABLE wiki_revisions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id     UUID NOT NULL REFERENCES wiki_nodes(id) ON DELETE CASCADE,
  revision_no SMALLINT NOT NULL,
  title       TEXT NOT NULL,
  content_md  TEXT,
  metadata    JSONB DEFAULT '{}',
  change_note TEXT,
  changed_by  UUID REFERENCES employees(id),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (node_id, revision_no)
);

-- AI 임베딩 청크
CREATE TABLE wiki_chunks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id     UUID NOT NULL REFERENCES wiki_nodes(id) ON DELETE CASCADE,
  chunk_index SMALLINT NOT NULL,
  chunk_text  TEXT NOT NULL,
  embedding   vector(768),  -- multilingual-e5-large 차원
  token_count INT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (node_id, chunk_index)
);

CREATE INDEX ON wiki_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- 서식 템플릿 (14종)
CREATE TABLE form_templates (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wiki_node_id     UUID REFERENCES wiki_nodes(id),
  code             TEXT UNIQUE NOT NULL,   -- 'annex_2', 'annex_7' 등
  name             TEXT NOT NULL,
  version          TEXT NOT NULL DEFAULT '2026.1',
  schema           JSONB NOT NULL,          -- 필드 정의 배열
  layout           JSONB NOT NULL DEFAULT '{}',
  vehicle_field_map JSONB DEFAULT '{}',    -- 차량 DB 컬럼 → 서식 필드 매핑
  source_file_url  TEXT,                   -- 업로드된 원본 서식 파일 URL
  source_file_type TEXT CHECK (source_file_type IN ('pdf','docx')),
  ai_extracted     BOOLEAN DEFAULT FALSE,
  upload_note      TEXT,
  is_active        BOOLEAN DEFAULT true,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- 서식 제출 이력
CREATE TABLE form_submissions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES form_templates(id),
  vehicle_id  UUID REFERENCES dpf_vehicles(id),
  business_id UUID REFERENCES business_info(id),
  values      JSONB NOT NULL,
  status      TEXT DEFAULT 'draft' CHECK (status IN ('draft','submitted','printed')),
  submitted_by UUID REFERENCES employees(id),
  pdf_url     TEXT,
  submitted_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 지침서 업로드 이력
CREATE TABLE guideline_uploads (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_url       TEXT NOT NULL,
  version_label  TEXT NOT NULL,
  status         TEXT DEFAULT 'analyzing'
                 CHECK (status IN ('analyzing','review_needed','applied','rejected')),
  diff_summary   TEXT,
  wiki_changes   JSONB DEFAULT '[]',
  form_changes   JSONB DEFAULT '[]',
  applied_by     UUID REFERENCES employees(id),
  applied_at     TIMESTAMPTZ,
  created_by     UUID REFERENCES employees(id),
  created_at     TIMESTAMPTZ DEFAULT NOW()
);
```

### 3-3. RLS 정책

```sql
-- dpf_vehicles: 로그인 사용자 조회, permission_level >= 2 수정
ALTER TABLE dpf_vehicles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dpf_vehicles_read" ON dpf_vehicles FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "dpf_vehicles_write" ON dpf_vehicles FOR ALL USING (
  EXISTS (SELECT 1 FROM employees WHERE id = auth.uid() AND permission_level >= 2)
);

-- dpf_owner_sensitive: permission_level >= 3만 접근
ALTER TABLE dpf_owner_sensitive ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dpf_sensitive_admin_only" ON dpf_owner_sensitive FOR ALL USING (
  EXISTS (SELECT 1 FROM employees WHERE id = auth.uid() AND permission_level >= 3)
);

-- wiki_nodes: 로그인 사용자 조회, permission_level >= 3 수정
ALTER TABLE wiki_nodes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wiki_read" ON wiki_nodes FOR SELECT USING (auth.role() = 'authenticated' AND is_published = true);
CREATE POLICY "wiki_write" ON wiki_nodes FOR ALL USING (
  EXISTS (SELECT 1 FROM employees WHERE id = auth.uid() AND permission_level >= 3)
);
```

---

## 4. 페이지/라우팅 구조

```
app/
├── dpf/
│   ├── page.tsx                          # 차량 목록 + 통합 검색
│   ├── [vin]/
│   │   └── page.tsx                      # 차량 상세 (6개 탭)
│   ├── import/
│   │   └── page.tsx                      # 엑셀 18,789건 임포트 (관리자)
│   ├── wiki/
│   │   ├── page.tsx                      # Wiki 목차 (챕터 트리)
│   │   ├── [slug]/
│   │   │   └── page.tsx                  # 챕터/섹션 상세
│   │   ├── forms/
│   │   │   ├── page.tsx                  # 서식 14종 목록
│   │   │   ├── [code]/
│   │   │   │   ├── page.tsx              # 서식 작성 + 제출
│   │   │   │   └── edit/page.tsx         # 서식 편집기 (관리자)
│   │   │   └── upload/page.tsx           # 서식 파일 업로드 (관리자)
│   │   ├── search/
│   │   │   └── page.tsx                  # 검색 결과
│   │   ├── qa/
│   │   │   └── page.tsx                  # AI Q&A 채팅
│   │   └── admin/
│   │       └── page.tsx                  # 지침서 업로드 + 개정 관리

app/api/dpf/
├── search/route.ts                       # 차량 검색 (VIN/번호판)
├── vehicles/route.ts                     # 차량 CRUD
├── vehicles/[vin]/route.ts               # 단일 차량 + 전체 이력
├── import/route.ts                       # 엑셀 스테이징 업로드
├── import/process/route.ts              # 스테이징 → 본 테이블 처리

app/api/wiki/
├── qa/route.ts                           # AI Q&A (RAG + Gemini 스트리밍)
├── search/route.ts                       # 전문검색 + 벡터검색 병합
├── reindex/route.ts                      # 임베딩 재생성 (관리자)
├── nodes/[id]/route.ts                   # Wiki 노드 CRUD
├── upload-guideline/route.ts            # 지침서 PDF 업로드 + AI 분석
├── apply-guideline/[id]/route.ts        # 개정 내용 적용
└── forms/
    ├── [code]/submit/route.ts            # 서식 제출 + PDF 생성
    └── upload/route.ts                   # 서식 파일 업로드
```

---

## 5. 컴포넌트 구조

```
components/
├── dpf/
│   ├── DpfSearchBar.tsx          # VIN/번호판 통합 검색
│   ├── DpfVehicleTable.tsx       # 차량 목록 테이블
│   ├── DpfFilterPanel.tsx        # 처리상태/지자체 필터
│   ├── DpfVehicleDetailTabs.tsx  # 상세 탭 컨테이너
│   │   ├── DpfBasicInfoTab.tsx
│   │   ├── DpfInstallationTab.tsx
│   │   ├── DpfInspectionTab.tsx
│   │   ├── DpfSubsidyTab.tsx
│   │   ├── DpfDocumentTab.tsx
│   │   └── DpfCallMonitoringTab.tsx
│   ├── DpfImportUploader.tsx     # 엑셀 청크 업로드
│   └── DpfImportProgress.tsx     # 임포트 진행률
│
├── wiki/
│   ├── WikiLayout.tsx            # 좌측 트리 + 우측 본문
│   ├── WikiNodeTree.tsx          # 재귀 챕터 트리
│   ├── WikiContent.tsx           # Markdown 렌더링
│   ├── WikiSearch.tsx            # 검색창 (debounce 300ms)
│   ├── WikiSearchResults.tsx     # 검색 결과 (키워드+의미 병합)
│   ├── WikiBreadcrumb.tsx
│   └── WikiRevisionHistory.tsx   # 개정 이력 타임라인
│
├── forms/
│   ├── FormRenderer.tsx          # JSONB 스키마 → 동적 폼
│   ├── FormField.tsx             # 필드 타입별 입력 (text/date/checklist)
│   ├── FormPrintView.tsx         # 인쇄 전용 레이아웃
│   ├── FormUploader.tsx          # 서식 파일 업로드
│   ├── FormFieldEditor.tsx       # AI 추출 결과 수정
│   └── FormTemplateList.tsx      # 서식 목록 + 상태 표시
│
└── qa/
    ├── QAChat.tsx                # AI Q&A 채팅 인터페이스
    ├── QAChatMessage.tsx         # 메시지 버블 + Markdown
    └── QACitation.tsx            # 인용 출처 → Wiki 노드 링크
```

---

## 6. AI 스택 구현 상세

### 임베딩 (HuggingFace - 무료)
```typescript
// lib/embedding.ts
export async function getEmbedding(text: string): Promise<number[]> {
  const res = await fetch(
    'https://api-inference.huggingface.co/models/intfloat/multilingual-e5-large',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.HF_API_KEY}` },
      body: JSON.stringify({ inputs: `query: ${text}` }),
    }
  );
  if (!res.ok) throw new Error('HuggingFace API error');
  return res.json();
}
```

### Q&A API (Gemini Flash - 무료)
```typescript
// app/api/wiki/qa/route.ts
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function POST(req: Request) {
  const { question } = await req.json();

  // 1. 임베딩 생성
  const queryEmbedding = await getEmbedding(question);

  // 2. pgvector 검색 (top-8 청크)
  const { data: chunks } = await supabase.rpc('search_wiki_chunks', {
    query_embedding: queryEmbedding,
    match_count: 8,
    similarity_threshold: 0.5,
  });

  // 유사도 임계값 미달 시 Claude 호출 없이 반환
  if (!chunks?.length) {
    return Response.json({ answer: '해당 지침에서 관련 내용을 찾지 못했습니다.' });
  }

  // 3. Gemini 스트리밍 답변
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
  const context = chunks.map((c: any) => c.chunk_text).join('\n\n---\n\n');

  const result = await model.generateContentStream(
    `다음 DPF 업무지침 내용만을 근거로 답변하세요.
참고자료에 없는 내용은 "해당 지침에서 확인되지 않습니다"라고 답하세요.

[참고자료]
${context}

[질문]
${question}`
  );

  // 스트리밍 응답 반환
  const stream = new ReadableStream({
    async start(controller) {
      for await (const chunk of result.stream) {
        controller.enqueue(new TextEncoder().encode(chunk.text()));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
```

### pgvector 검색 함수 (Supabase SQL)
```sql
CREATE OR REPLACE FUNCTION search_wiki_chunks(
  query_embedding vector(768),
  match_count int DEFAULT 8,
  similarity_threshold float DEFAULT 0.5
)
RETURNS TABLE (
  chunk_text text,
  node_id uuid,
  similarity float
)
LANGUAGE sql STABLE AS $$
  SELECT
    wc.chunk_text,
    wc.node_id,
    1 - (wc.embedding <=> query_embedding) AS similarity
  FROM wiki_chunks wc
  WHERE 1 - (wc.embedding <=> query_embedding) > similarity_threshold
  ORDER BY wc.embedding <=> query_embedding
  LIMIT match_count;
$$;
```

---

## 7. 엑셀 임포트 전략

```
18,789행 / 1,000행 청크 = 약 19청크 / 총 ~30-40초

브라우저:
  xlsx.utils.sheet_to_json() → 행 배열
  batchId = crypto.randomUUID()
  청크 루프: POST /api/dpf/import { batchId, rows: chunk }
  진행률: completedChunks / totalChunks * 100

서버:
  청크 → dpf_import_staging 배치 INSERT
  전체 완료 후 → /api/dpf/import/process 호출
  PostgreSQL 함수 process_dpf_staging(batchId) 실행
  → dpf_vehicles upsert (ON CONFLICT vin DO UPDATE)
  → 이력 테이블 INSERT
  → 민감정보 분리 저장
```

### 엑셀 컬럼 매핑
```typescript
// lib/dpf-column-map.ts

// ★ UI에 표시되는 노란색 헤더 9개 → dpf_vehicles 컬럼으로 직접 매핑
export const DPF_PRIMARY_COLUMNS: Record<string, string> = {
  '차대번호':     'vin',
  '차량번호':     'plate_number',
  '차명':        'vehicle_name',
  '소유자성명':   'owner_name',
  '주소':        'owner_address',
  '연락처':      'owner_contact',
  '접수지자체명': 'local_government',
  '장치시리얼번호': 'device_serial',
  '구변일자':    'installation_date',
};

// 나머지 43개 컬럼 → raw_data JSONB에 그대로 보관 (UI 미표시)
// 별도 매핑 불필요 — 임포트 시 PRIMARY_COLUMNS 외 나머지를 raw_data에 통째로 저장
```

### 임포트 로직 핵심
```typescript
// 엑셀 한 행 처리 예시
function transformRow(row: Record<string, any>) {
  const primary: Record<string, any> = {};
  const rawData: Record<string, any> = {};

  for (const [excelCol, value] of Object.entries(row)) {
    const dbCol = DPF_PRIMARY_COLUMNS[excelCol];
    if (dbCol) {
      primary[dbCol] = value;   // dpf_vehicles 컬럼으로
    } else {
      rawData[excelCol] = value; // raw_data JSONB로
    }
  }

  return { ...primary, raw_data: rawData };
}
```

---

## 8. 공식 서식 14종 코드명

| code | 서식명 | 차량 자동입력 |
|---|---|---|
| annex_1 | 국고보조금 교부신청서 | X |
| annex_2 | DPF 부착 및 저공해엔진 개조·교체 확인서 | O (핵심) |
| annex_2_2 | 건설기계 엔진교체·개조 확인서 | O |
| annex_3 | 보조금 지급 청구서 + 위임장 (소유자→제작사) | O |
| annex_3_2 | 보조금 지급 청구서 (제작사→지자체) | O |
| annex_4 | 보조사업 수행 및 예산집행 실적보고서 | X |
| annex_5 | 유지관리비용 집행실적 | X |
| annex_6 | 저공해조치 신청서 | O |
| annex_7 | 차량상태 및 저감장치 부착 품질 확인서 | O |
| annex_7_2 | 건설기계 엔진교체 전/후 점검표(지게차) | O |
| annex_7_3 | 건설기계 엔진교체 전/후 점검표(굴착기·로더) | O |
| annex_7_4 | 건설기계 엔진교체 전/후 점검표(롤러) | O |
| annex_7_5 | 건설기계 전동화 개조 전/후 점검표(지게차) | O |
| annex_7_6 | 자동차 전동화 개조 전/후 점검표(1톤 화물차) | O |

---

## 9. 구현 순서 (단계별)

### Phase 1 — DB + 차량 임포트 (1~2주)
- [ ] DB 마이그레이션 SQL 실행 (차량 7개 + Wiki 5개 테이블)
- [ ] `lib/dpf-column-map.ts` 작성
- [ ] `app/api/dpf/import/route.ts` + process API
- [ ] `app/dpf/import/page.tsx` + `DpfImportUploader.tsx`
- [ ] 실제 엑셀 파일 18,789건 임포트 테스트

### Phase 2 — 차량 조회 화면 (1주)
- [ ] `app/dpf/page.tsx` (목록 + 검색)
- [ ] `app/dpf/[vin]/page.tsx` (상세 6개 탭)
- [ ] `app/api/dpf/search/route.ts`
- [ ] `DpfVehicleTable`, `DpfSearchBar`, `DpfFilterPanel` 컴포넌트

### Phase 3 — Wiki + 서식 (1~2주)
- [ ] `pgvector` 함수 `search_wiki_chunks` 생성
- [ ] 지침 8개 챕터 + 별지 14종 초기 데이터 입력
- [ ] `app/dpf/wiki/` 라우팅 + `WikiLayout`, `WikiContent`
- [ ] 전문검색 API (`wiki/search/route.ts`)
- [ ] `form_templates` 초기 JSONB 데이터 (annex_2, annex_7 우선)
- [ ] `FormRenderer`, `FormPrintView` 컴포넌트

### Phase 4 — AI Q&A (1주)
- [ ] HuggingFace 임베딩 + wiki_chunks 채우기
- [ ] `app/api/wiki/qa/route.ts` (Gemini 스트리밍)
- [ ] `app/dpf/wiki/qa/page.tsx` + `QAChat` 컴포넌트
- [ ] 자주 묻는 질문 퀵버튼 (보조금 마감일, 의무운행기간 등)

### Phase 5 — 지침서/서식 업로드 관리 (1주)
- [ ] `app/api/wiki/upload-guideline/route.ts` (PDF → Gemini 분석)
- [ ] `app/dpf/wiki/admin/page.tsx` (개정 검토 화면)
- [ ] `app/dpf/wiki/forms/upload/page.tsx` (서식 파일 업로드)
- [ ] `FormUploader`, `FormFieldEditor` 컴포넌트

---

## 10. 자주 묻는 질문 퀵버튼 (AI Q&A 초기 세팅)

지침서 기반 자주 찾는 규정:
- "보조금 지급 청구 마감일은 언제인가요?" → 12월 24일
- "보조금 지급 기한이 얼마나 되나요?" → 청구서 접수 후 1개월 이내
- "DPF 보증기간은 얼마나 되나요?" → 3년
- "클리닝은 얼마나 자주 해야 하나요?" → 연 1회 또는 10만km마다
- "생계형 차량 기준이 무엇인가요?" → 기초생활수급자, 차상위계층, 소상공인
- "의무운행기간이 얼마나 되나요?" → 튜닝검사일로부터 2년
- "저공해조치 기한이 얼마나 되나요?" → 안내 후 2개월 이내

---

*이 문서를 기반으로 Phase 1부터 순차 구현합니다.*
