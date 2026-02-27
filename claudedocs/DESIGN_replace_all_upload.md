# 전체 교체(Replace-All) 업로드 설계 문서 (최종 확정)

**작성일**: 2026-02-24
**상태**: ✅ 확정 - 구현 준비 완료
**대상**: 사업장 관리(admin/business) + 업무 관리(admin/tasks) 엑셀 업로드
**목적**: 기존 데이터 전체 삭제 후 새 엑셀 데이터로 교체 (데이터 초기화/마이그레이션)

---

## 확정된 결정 사항

| 항목 | 결정 |
|------|------|
| 복원(restore) API | ✅ 이번 구현에 포함 |
| 대기필증 유실 경고 표시 시점 | 업로드 후 결과에만 표시 (dry-run 없음) |
| 설계 방식 | Option C: 백업 JSON + 삭제 + 재삽입 + 재연결 |

---

## 1. DB 구조 및 제약 조건 (검증 완료)

```
business_info (사업장, UNIQUE: business_name)
├── air_permit_info          NOT NULL, ON DELETE CASCADE → 보존 필요
│   ├── discharge_outlets    NOT NULL, ON DELETE CASCADE
│   │   ├── discharge_facilities   ON DELETE CASCADE
│   │   └── prevention_facilities  ON DELETE CASCADE
├── facility_tasks           ON DELETE SET NULL (orphan 안전)
├── revenue_calculations     NULLABLE business_id → NULL 처리 가능 ✅
└── survey_cost_adjustments  NULLABLE business_id → NULL 처리 가능 ✅
```

**검증 완료 항목**:
- `revenue_calculations.business_id` → nullable → SET NULL 가능
- `survey_cost_adjustments.business_id` → nullable → SET NULL 가능
- `transaction()` 헬퍼 → `lib/supabase-direct.ts:65`에 존재
- `business-info-direct` API → `NextResponse` 직접 사용 (withApiHandler 미사용)
- 복원 API → `withApiHandler` + `verifyTokenHybrid` 패턴 사용 예정

---

## 2. 구현 파일 목록 (7개)

| # | 파일 | 유형 | 작업 |
|---|------|------|------|
| 1 | `sql/create_backup_snapshots.sql` | 신규 | 백업 테이블 생성 SQL |
| 2 | `app/api/business-info-direct/route.ts` | 수정 | `replaceAll` 모드 + `executeReplaceAll()` 함수 추가 |
| 3 | `app/api/admin/tasks/bulk-upload/route.ts` | 수정 | `clearBeforeUpload` 옵션 추가 |
| 4 | `app/api/admin/restore-snapshot/route.ts` | 신규 | 백업 복원 API |
| 5 | `components/business/modals/BusinessUploadModal.tsx` | 수정 | 전체 교체 라디오 옵션 + 경고 UI + 복원 버튼 |
| 6 | `components/tasks/BulkUploadModal.tsx` | 수정 | 전체 삭제 체크박스 + 경고 UI |
| 7 | `app/admin/business/page.tsx` | 수정 | `uploadMode` 타입 확장 (`replaceAll` 추가) |

---

## 3. 백업 테이블 스키마

```sql
-- sql/create_backup_snapshots.sql
CREATE TABLE IF NOT EXISTS backup_snapshots (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  snapshot_type VARCHAR(50) NOT NULL,
  -- 값: 'business_replace_all' | 'tasks_replace_all'
  created_by    VARCHAR(100),
  data          JSONB NOT NULL,
  expires_at    TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '7 days'),
  is_restored   BOOLEAN DEFAULT false,
  restored_at   TIMESTAMP WITH TIME ZONE,
  record_count  INTEGER
);

CREATE INDEX idx_backup_snapshots_type_date
  ON backup_snapshots(snapshot_type, created_at DESC);
CREATE INDEX idx_backup_snapshots_expires
  ON backup_snapshots(expires_at)
  WHERE is_restored = false;
```

### 백업 JSON 구조 (사업장용)

```jsonc
// snapshot_type: 'business_replace_all'
// data 필드 내용:
{
  "businesses": [
    {
      "business_name": "한국산업",
      "air_permits": [
        {
          "business_type": "제조업",
          "annual_pollutant_emission": 10.5,
          "first_report_date": "2020-01-01",
          "operation_start_date": "2020-03-01",
          "additional_info": {},
          "outlets": [
            {
              "outlet_number": 1,
              "outlet_name": "1호 배출구",
              "additional_info": {},
              "facilities": [
                { "facility_name": "배출시설명", "capacity": "100m3/h", "quantity": 1 }
              ],
              "prevention_facilities": [
                { "facility_name": "방지시설명", "capacity": "100m3/h", "quantity": 1 }
              ]
            }
          ]
        }
      ]
    }
  ]
}
```

### 백업 JSON 구조 (업무용)

```jsonc
// snapshot_type: 'tasks_replace_all'
// data 필드 내용:
{
  "tasks": [
    {
      "title": "...",
      "business_name": "...",
      "task_type": "self",
      "status": "customer_contact",
      "priority": "medium",
      "assignee": "...",
      "notes": "...",
      "due_date": "2026-01-01"
      // ... facility_tasks의 전체 컬럼
    }
  ]
}
```

---

## 4. API 명세

### 4-1. business-info-direct POST (수정)

**엔드포인트**: `POST /api/business-info-direct`

**기존 uploadMode**: `'overwrite' | 'merge' | 'skip'`
**추가**: `'replaceAll'`

```typescript
// 요청 바디 (replaceAll 모드)
{
  isBatchUpload: true,
  uploadMode: 'replaceAll',
  businesses: BusinessData[]   // 새로 업로드할 사업장 배열
}

// 응답
{
  success: true,
  data: {
    snapshotId: string,          // 복원용 백업 키
    created: number,             // 신규 삽입된 사업장 수
    airPermitRestored: number,   // 대기필증 재연결 성공 수
    airPermitNotRestored: string[], // 대기필증 유실된 사업장명 목록
    elapsedMs: number
  }
}
```

**executeReplaceAll 내부 로직**:

```
1. 백업 단계 (트랜잭션 외부)
   a) SELECT business_info + air_permit + outlets + facilities JOIN
   b) JSON 직렬화 → backup_snapshots INSERT
   c) snapshotId 보관

2. 트랜잭션 시작
   a) UPDATE revenue_calculations SET business_id = NULL
      WHERE business_id IN (SELECT id FROM business_info)
   b) UPDATE survey_cost_adjustments SET business_id = NULL
      WHERE business_id IN (SELECT id FROM business_info)
   c) DELETE FROM business_info
      (→ air_permit_info CASCADE, facility_tasks.business_id SET NULL 자동)
   d) INSERT INTO business_info (새 데이터, ON CONFLICT 없음)
      → 새 UUID 발급
   e) 대기필증 재연결:
      - 새 business_info에서 business_name → new_uuid 맵 생성
      - 백업 JSON 순회하며 매칭되는 사업장 → air_permit INSERT
      - discharge_outlets INSERT → facilities INSERT
      - 매칭 안 된 사업장명 → notRestored 목록에 추가
   f) COMMIT

3. 응답 반환 (snapshotId 포함)
```

---

### 4-2. tasks/bulk-upload POST (수정)

**엔드포인트**: `POST /api/admin/tasks/bulk-upload`

**추가 필드**:

```typescript
// 요청 바디
{
  tasks: ParsedTask[],
  clearBeforeUpload?: boolean   // true이면 전체 교체
}

// 응답 (clearBeforeUpload=true 시 추가 필드)
{
  success: true,
  data: {
    snapshotId: string,          // 복원용 백업 키
    deletedCount: number,        // 삭제된 기존 업무 수
    totalCount: number,
    successCount: number,
    // ... 기존 필드 그대로
  }
}
```

**clearBeforeUpload 처리 로직**:

```
1. 백업 (트랜잭션 외부)
   - SELECT * FROM facility_tasks WHERE is_deleted = false
   - backup_snapshots INSERT

2. 트랜잭션
   - DELETE FROM facility_tasks WHERE is_deleted = false
   - INSERT 새 업무 (기존 insertQuery 재활용)
   - COMMIT
```

---

### 4-3. 복원 API (신규)

**엔드포인트**: `POST /api/admin/restore-snapshot`
**권한**: permission_level ≥ 4 (관리자)
**패턴**: `withApiHandler` + `verifyTokenHybrid` (bulk-upload와 동일)

```typescript
// 요청
{
  snapshotId: string
}

// 응답
{
  success: true,
  data: {
    snapshotType: string,
    restoredCount: number,
    message: string
  }
}
```

**복원 로직**:

```
1. backup_snapshots에서 snapshotId 조회
   → is_restored=true이면 오류 ("이미 복원된 백업입니다")
   → expires_at 지났으면 오류 ("만료된 백업입니다")

2. snapshot_type에 따라 분기:

   [business_replace_all]
   트랜잭션:
   a) UPDATE revenue_calculations SET business_id = NULL
   b) UPDATE survey_cost_adjustments SET business_id = NULL
   c) DELETE FROM business_info (현재 데이터 제거)
   d) INSERT 백업 JSON의 businesses
   e) INSERT 백업 JSON의 air_permits + outlets + facilities
   f) COMMIT

   [tasks_replace_all]
   트랜잭션:
   a) DELETE FROM facility_tasks WHERE is_deleted = false
   b) INSERT 백업 JSON의 tasks
   c) COMMIT

3. UPDATE backup_snapshots SET is_restored=true, restored_at=NOW()
4. 응답 반환
```

**주의**: 복원 시 현재 데이터도 삭제되므로 **"복원 전 현재 상태를 백업하지 않음"**을 UI에 명시.
연속 복원이 필요한 경우 별도 스냅샷 생성 권고.

---

## 5. 프론트엔드 UI 명세

### 5-1. BusinessUploadModal.tsx 변경

**타입 확장**:
```typescript
uploadMode: 'overwrite' | 'merge' | 'skip' | 'replaceAll'
setUploadMode: (mode: 'overwrite' | 'merge' | 'skip' | 'replaceAll') => void
```

**새 라디오 버튼 UI**:
```
○ 덮어쓰기    기존 데이터를 새 값으로 교체합니다
○ 병합        빈 필드만 채웁니다
○ 건너뛰기    중복 사업장은 무시합니다
● 전체 교체   ⚠️ 기존 데이터를 모두 삭제하고 새 파일로 교체합니다.
              대기필증은 사업장명이 일치하면 유지됩니다.
```

**전체 교체 선택 시 경고 배너** (라디오 아래에 표시):
```
┌─────────────────────────────────────────────┐
│ ⚠️ 주의: 전체 교체 모드                      │
│ 기존 사업장 데이터가 모두 삭제됩니다.          │
│ 업로드 전 자동 백업이 생성되며,               │
│ 필요 시 복원할 수 있습니다.                   │
└─────────────────────────────────────────────┘
```

**업로드 결과 화면 추가 섹션** (replaceAll 성공 시):
```
✅ 완료: N개 사업장 교체됨
📋 대기필증 재연결: M건 성공

[⚠️ 대기필증 유실 목록] (airPermitNotRestored.length > 0인 경우만)
  - 서울공장: 새 파일에 사업장명 없음 → 대기필증 유실
  - ...

🔑 백업 ID: xxxx-xxxx   [복원하기 →]
```

**복원하기 버튼** → `POST /api/admin/restore-snapshot` 호출 + 확인창

---

### 5-2. BulkUploadModal.tsx 변경

**새 체크박스** (파일 선택 후 표시):
```
☐ 업로드 전 기존 업무 전체 삭제 (전체 교체 모드)
```

**체크 시 경고 배너**:
```
┌─────────────────────────────────────────────┐
│ ⚠️ 주의: 기존 업무 M개가 모두 삭제됩니다.    │
│ 업로드 전 자동 백업이 생성됩니다.             │
└─────────────────────────────────────────────┘
```

**업로드 결과 화면 추가**:
```
✅ N개 업무 등록 완료
🗑️ 기존 M개 업무 삭제됨
🔑 백업 ID: xxxx   [복원하기 →]
```

---

### 5-3. admin/business/page.tsx 변경

```typescript
// 기존
const [uploadMode, setUploadMode] = useState<'overwrite' | 'merge' | 'skip'>('overwrite')

// 변경
const [uploadMode, setUploadMode] = useState<'overwrite' | 'merge' | 'skip' | 'replaceAll'>('overwrite')
```

`handleFileUpload` 내 API 호출부에 `uploadMode: 'replaceAll'` 케이스 처리 추가.

---

## 6. 엣지 케이스 처리

| 케이스 | 처리 방식 |
|--------|-----------|
| 엑셀이 비어있음 | 파싱 단계에서 차단, DB 접근 없음 |
| 엑셀에 동일 사업장명 중복 | 마지막 행 우선 (INSERT 순서상 나중 값이 UNIQUE 충돌로 덮어씀) → 사전 클라이언트 중복 검사로 경고 |
| 대기필증 없는 사업장 | 정상 처리 (재연결 로직 스킵) |
| 사업장명이 변경된 경우 | airPermitNotRestored 목록에 추가, 업로드는 계속 진행 |
| 트랜잭션 중 연결 끊김 | 자동 ROLLBACK, 백업은 보존됨 |
| 백업 용량 | Supabase JSONB 최대 1GB, 수천 개 사업장도 문제없음 |
| 복원 후 재복원 시도 | "이미 복원된 백업" 오류 반환 |
| 만료된 백업 복원 시도 | "만료된 백업" 오류 반환 |

---

## 7. 구현 순서 (의존성 기반)

```
[Step 1] sql/create_backup_snapshots.sql 작성
         → Supabase 대시보드 또는 마이그레이션으로 실행
         ↓
[Step 2] app/api/business-info-direct/route.ts
         → executeReplaceAll() 함수 추가
         → uploadMode 'replaceAll' 분기 추가
         ↓
[Step 3] app/api/admin/tasks/bulk-upload/route.ts
         → clearBeforeUpload 옵션 처리 추가
         ↓
[Step 4] app/api/admin/restore-snapshot/route.ts 신규 생성
         ↓
[Step 5] components/business/modals/BusinessUploadModal.tsx
         → replaceAll 라디오 옵션 + 경고 배너 + 결과 표시
         ↓
[Step 6] components/tasks/BulkUploadModal.tsx
         → clearBeforeUpload 체크박스 + 경고 배너 + 결과 표시
         ↓
[Step 7] app/admin/business/page.tsx
         → uploadMode 타입 확장
```

---

## 8. 위험 요소 및 대응 (최종)

| 위험 | 대응 |
|------|------|
| 트랜잭션 실패 시 데이터 손실 | 백업이 트랜잭션 외부에 생성되어 보존 |
| 복원 API 오남용 | permission_level ≥ 4 + 확인창 |
| 대기필증 유실 (사업장명 변경) | 업로드 결과에 명시적 유실 목록 표시 |
| 동시 접근 중 삭제 실행 | 트랜잭션 락으로 일관성 보장, UI에 "진행 중" 상태 표시 |
