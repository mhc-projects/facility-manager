# 회의록 - 미해결 사업장 이슈 추적 기능 설계

## 📋 요구사항 분석

### 핵심 기능
1. **정기회의 작성 시**: 미해결 사업장별 이슈 자동 표시
2. **이슈 정보 표시**: 원본 회의록 링크 + 경과 일수
3. **일괄 완료 처리**: 한 회의록에서 완료하면 모든 회의록에서 동시 완료

### 비즈니스 규칙
- **트리거 조건**: 회의 유형이 "정기회의"일 때만 활성화
- **이슈 범위**: `is_completed: false`인 사업장별 이슈만 표시
- **정렬 순서**: 오래된 이슈부터 표시 (가장 오래된 것이 최우선)
- **중복 제거**: 같은 사업장의 동일한 이슈는 가장 오래된 것만 표시

## 🏗️ 시스템 아키텍처

### 1. 데이터 구조 설계

#### 현재 BusinessIssue 구조 (변경 없음)
```typescript
interface BusinessIssue {
  id: string                    // 회의록 내 고유 ID
  business_id: string           // 사업장 ID
  business_name: string         // 사업장명
  issue_description: string     // 이슈 설명
  assignee_id: string          // 담당자 ID
  assignee_name: string        // 담당자명
  is_completed: boolean        // 완료 여부
  completed_at?: string        // 완료 날짜
}
```

#### 새로운 데이터 구조: RecurringIssue (확장)
```typescript
interface RecurringIssue extends BusinessIssue {
  // 추가 메타데이터
  original_meeting_id: string      // 원본 회의록 ID
  original_meeting_title: string   // 원본 회의록 제목
  original_meeting_date: string    // 원본 회의 날짜 (ISO)
  days_elapsed: number             // 경과 일수
  is_recurring: true               // 반복 이슈 플래그
}
```

### 2. API 설계

#### GET `/api/meeting-minutes/recurring-issues`
**목적**: 미해결 사업장별 이슈 조회

**Query Parameters**:
```typescript
{
  meeting_type?: MeetingType  // 필터: 회의 유형
  limit?: number              // 제한: 최대 개수 (기본값: 50)
}
```

**Response**:
```typescript
{
  success: boolean
  data: {
    recurring_issues: RecurringIssue[]
    total_count: number
    by_business: {
      [business_id: string]: {
        business_name: string
        issue_count: number
        oldest_issue_date: string
      }
    }
  }
}
```

**SQL 쿼리 로직**:
```sql
-- 미해결 사업장별 이슈 조회 (정기회의만)
WITH recurring_issues AS (
  SELECT
    mm.id as meeting_id,
    mm.title as meeting_title,
    mm.meeting_date,
    jsonb_array_elements(mm.content->'business_issues') as issue,
    CURRENT_DATE - mm.meeting_date::date as days_elapsed
  FROM meeting_minutes mm
  WHERE mm.meeting_type = '정기회의'
    AND mm.status != 'archived'
    AND jsonb_array_length(mm.content->'business_issues') > 0
)
SELECT
  issue->>'id' as id,
  issue->>'business_id' as business_id,
  issue->>'business_name' as business_name,
  issue->>'issue_description' as issue_description,
  issue->>'assignee_id' as assignee_id,
  issue->>'assignee_name' as assignee_name,
  (issue->>'is_completed')::boolean as is_completed,
  issue->>'completed_at' as completed_at,
  meeting_id,
  meeting_title,
  meeting_date,
  days_elapsed
FROM recurring_issues
WHERE (issue->>'is_completed')::boolean = false
ORDER BY meeting_date ASC, business_id
LIMIT 50;
```

#### PUT `/api/meeting-minutes/business-issues/complete`
**목적**: 사업장별 이슈 일괄 완료 처리

**Request Body**:
```typescript
{
  business_id: string        // 사업장 ID
  issue_description: string  // 이슈 설명 (매칭용)
}
```

**Response**:
```typescript
{
  success: boolean
  data: {
    updated_count: number           // 업데이트된 회의록 수
    updated_meeting_ids: string[]   // 업데이트된 회의록 ID 목록
  }
  message: string  // "3개 회의록에서 이슈가 완료 처리되었습니다."
}
```

**SQL 업데이트 로직**:
```sql
-- 1단계: 동일한 사업장 + 이슈 설명을 가진 모든 회의록 찾기
WITH target_meetings AS (
  SELECT id, content
  FROM meeting_minutes
  WHERE jsonb_array_length(content->'business_issues') > 0
    AND EXISTS (
      SELECT 1
      FROM jsonb_array_elements(content->'business_issues') as issue
      WHERE issue->>'business_id' = $1
        AND issue->>'issue_description' = $2
        AND (issue->>'is_completed')::boolean = false
    )
)

-- 2단계: JSONB 배열 내 이슈를 업데이트
UPDATE meeting_minutes mm
SET
  content = jsonb_set(
    content,
    '{business_issues}',
    (
      SELECT jsonb_agg(
        CASE
          WHEN issue->>'business_id' = $1
           AND issue->>'issue_description' = $2
          THEN jsonb_set(
            jsonb_set(issue, '{is_completed}', 'true'),
            '{completed_at}', to_jsonb(NOW()::text)
          )
          ELSE issue
        END
      )
      FROM jsonb_array_elements(mm.content->'business_issues') as issue
    )
  ),
  updated_at = NOW()
WHERE mm.id IN (SELECT id FROM target_meetings)
RETURNING mm.id;
```

### 3. UI/UX 설계

#### CREATE 페이지 개선

**위치**: [app/admin/meeting-minutes/create/page.tsx](../app/admin/meeting-minutes/create/page.tsx)

**새 섹션 추가: 미해결 이슈 패널**
```
┌─────────────────────────────────────────────────────┐
│ 회의록 작성                                           │
├─────────────────────────────────────────────────────┤
│                                                       │
│ [기본 정보]                     [회의 요약]          │
│ - 제목                         - 텍스트 영역         │
│ - 날짜: 2026-02-02                                   │
│ - 회의 유형: [정기회의 ▼]     [미해결 이슈 추적] ⭐  │
│                                                       │
│ ┌───────────────────────────────────────────────┐   │
│ │ 🔔 이전 회의의 미해결 이슈 (3건)               │   │
│ │                                                 │   │
│ │ ┌─────────────────────────────────────────┐  │   │
│ │ │ 📍 (주)엘림테크                          │  │   │
│ │ │ 사업장 이슈 설명                         │  │   │
│ │ │ 👤 담당자: 최문호                        │  │   │
│ │ │ 📅 2025-12-15 회의 (49일 경과) 🔗       │  │   │
│ │ │ [✓ 완료] [→ 이월]                       │  │   │
│ │ └─────────────────────────────────────────┘  │   │
│ │                                                 │   │
│ │ ┌─────────────────────────────────────────┐  │   │
│ │ │ 📍 서울 본사                             │  │   │
│ │ │ 환경 개선 필요                           │  │   │
│ │ │ 👤 담당자: 김철수                        │  │   │
│ │ │ 📅 2025-12-20 회의 (44일 경과) 🔗       │  │   │
│ │ │ [✓ 완료] [→ 이월]                       │  │   │
│ │ └─────────────────────────────────────────┘  │   │
│ └───────────────────────────────────────────────┘   │
│                                                       │
│ [사업장별 이슈]                                      │
│ (수동 추가 섹션)                                     │
└─────────────────────────────────────────────────────┘
```

**기능 설명**:
1. **자동 표시**: 회의 유형이 "정기회의"로 선택되면 패널 표시
2. **[✓ 완료] 버튼**:
   - 클릭 시 → API 호출 → 모든 회의록에서 일괄 완료
   - 버튼 텍스트: "완료 처리 중..." → "완료됨 ✓"
   - 완료 후 패널에서 제거
3. **[→ 이월] 버튼**:
   - 클릭 시 → 사업장별 이슈 섹션에 자동 추가
   - 원본 정보 유지 (담당자, 설명 등)
4. **🔗 링크**:
   - 클릭 시 → 원본 회의록 상세 페이지로 이동
   - 새 탭 열기 (`target="_blank"`)

#### 시각적 디자인

**경과 일수 색상 코딩**:
```typescript
const getDaysElapsedStyle = (days: number) => {
  if (days < 7) return 'bg-green-50 text-green-700'      // 1주 미만: 초록
  if (days < 30) return 'bg-yellow-50 text-yellow-700'   // 1달 미만: 노랑
  return 'bg-red-50 text-red-700'                         // 1달 이상: 빨강
}
```

**컴포넌트 구조**:
```tsx
<RecurringIssuesPanel
  meetingType={meetingType}
  onIssueComplete={handleIssueComplete}
  onIssueCarryOver={handleIssueCarryOver}
/>

interface RecurringIssuesPanelProps {
  meetingType: MeetingType
  onIssueComplete: (issue: RecurringIssue) => Promise<void>
  onIssueCarryOver: (issue: RecurringIssue) => void
}
```

### 4. 상태 관리 설계

#### CREATE 페이지 상태 추가

```typescript
// 미해결 이슈 관련 상태
const [recurringIssues, setRecurringIssues] = useState<RecurringIssue[]>([])
const [loadingRecurring, setLoadingRecurring] = useState(false)
const [completingIssues, setCompletingIssues] = useState<Set<string>>(new Set())

// 회의 유형 변경 시 미해결 이슈 로드
useEffect(() => {
  if (meetingType === '정기회의') {
    loadRecurringIssues()
  } else {
    setRecurringIssues([])
  }
}, [meetingType])

const loadRecurringIssues = async () => {
  setLoadingRecurring(true)
  try {
    const response = await fetch('/api/meeting-minutes/recurring-issues?meeting_type=정기회의')
    const result = await response.json()
    if (result.success) {
      setRecurringIssues(result.data.recurring_issues)
    }
  } catch (error) {
    console.error('Failed to load recurring issues:', error)
  } finally {
    setLoadingRecurring(false)
  }
}

const handleIssueComplete = async (issue: RecurringIssue) => {
  setCompletingIssues(prev => new Set(prev).add(issue.id))

  try {
    const response = await fetch('/api/meeting-minutes/business-issues/complete', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_id: issue.business_id,
        issue_description: issue.issue_description
      })
    })

    const result = await response.json()
    if (result.success) {
      // 성공 메시지
      alert(`${result.data.updated_count}개 회의록에서 이슈가 완료 처리되었습니다.`)

      // 목록에서 제거
      setRecurringIssues(prev =>
        prev.filter(i =>
          !(i.business_id === issue.business_id &&
            i.issue_description === issue.issue_description)
        )
      )
    }
  } catch (error) {
    console.error('Failed to complete issue:', error)
    alert('완료 처리 중 오류가 발생했습니다.')
  } finally {
    setCompletingIssues(prev => {
      const next = new Set(prev)
      next.delete(issue.id)
      return next
    })
  }
}

const handleIssueCarryOver = (issue: RecurringIssue) => {
  // 사업장별 이슈 섹션에 추가
  const newIssue: BusinessIssue = {
    id: crypto.randomUUID(),
    business_id: issue.business_id,
    business_name: issue.business_name,
    issue_description: issue.issue_description,
    assignee_id: issue.assignee_id,
    assignee_name: issue.assignee_name,
    is_completed: false
  }

  setBusinessIssues(prev => [...prev, newIssue])

  // 미해결 이슈 목록에서 제거 (이월했으므로)
  setRecurringIssues(prev => prev.filter(i => i.id !== issue.id))

  // 사업장별 이슈 섹션으로 스크롤
  document.getElementById('business-issues-section')?.scrollIntoView({
    behavior: 'smooth'
  })
}
```

### 5. 데이터베이스 고려사항

#### 인덱스 추가 (성능 최적화)
```sql
-- meeting_type과 status에 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_meeting_minutes_type_status
ON meeting_minutes(meeting_type, status);

-- JSONB business_issues의 is_completed에 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_meeting_minutes_business_issues_completed
ON meeting_minutes USING GIN ((content->'business_issues'));
```

#### 트랜잭션 처리
```typescript
// 일괄 완료 처리는 트랜잭션으로 보장
BEGIN;

UPDATE meeting_minutes ...
WHERE id IN (...);

-- 모든 업데이트 성공 시
COMMIT;

-- 하나라도 실패 시
ROLLBACK;
```

### 6. 컴포넌트 파일 구조

```
components/
  meeting-minutes/
    RecurringIssuesPanel.tsx          # 메인 패널
    RecurringIssueCard.tsx            # 개별 이슈 카드

app/
  api/
    meeting-minutes/
      recurring-issues/
        route.ts                       # GET: 미해결 이슈 조회
      business-issues/
        complete/
          route.ts                     # PUT: 일괄 완료 처리
  admin/
    meeting-minutes/
      create/
        page.tsx                       # CREATE 페이지 (수정)
```

### 7. 에러 처리 시나리오

#### 시나리오 1: 동시 완료 처리
**문제**: 두 사용자가 동시에 같은 이슈를 완료 처리
**해결**: PostgreSQL의 트랜잭션 격리 수준 활용 + 낙관적 락

```typescript
// 버전 관리를 위한 updated_at 체크
UPDATE meeting_minutes
SET content = ..., updated_at = NOW()
WHERE id = $1
  AND updated_at = $2  // 마지막 조회 시점의 updated_at
RETURNING *;

// 영향받은 행이 0이면 → 다른 사용자가 먼저 수정
if (result.rowCount === 0) {
  throw new Error('이슈가 이미 다른 사용자에 의해 수정되었습니다.')
}
```

#### 시나리오 2: 네트워크 오류
**문제**: 완료 처리 중 네트워크 끊김
**해결**: Retry 메커니즘 + 멱등성 보장

```typescript
const retryComplete = async (issue: RecurringIssue, maxRetries = 3) => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await completeIssue(issue)
    } catch (error) {
      if (i === maxRetries - 1) throw error
      await sleep(1000 * (i + 1))  // Exponential backoff
    }
  }
}
```

#### 시나리오 3: 부분 실패
**문제**: 10개 회의록 중 8개만 업데이트 성공
**해결**: All-or-nothing 트랜잭션

```typescript
// PostgreSQL 트랜잭션 사용
const { data, error } = await supabase.rpc('complete_business_issue_bulk', {
  p_business_id: businessId,
  p_issue_description: issueDescription
})

// RPC 함수 내부에서 트랜잭션 처리
CREATE OR REPLACE FUNCTION complete_business_issue_bulk(
  p_business_id TEXT,
  p_issue_description TEXT
) RETURNS TABLE(meeting_id UUID, updated BOOLEAN) AS $$
BEGIN
  -- 트랜잭션 자동 처리
  UPDATE meeting_minutes ...;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No matching issues found';
  END IF;

  RETURN QUERY ...;
END;
$$ LANGUAGE plpgsql;
```

### 8. 성능 최적화

#### 쿼리 최적화
```typescript
// 1. 페이지네이션 (무한 스크롤 대비)
const RECURRING_ISSUES_LIMIT = 50

// 2. 사업장별 그룹핑 (중복 제거)
const groupedIssues = recurringIssues.reduce((acc, issue) => {
  const key = `${issue.business_id}_${issue.issue_description}`
  if (!acc[key] || acc[key].days_elapsed < issue.days_elapsed) {
    acc[key] = issue  // 가장 오래된 것만 유지
  }
  return acc
}, {} as Record<string, RecurringIssue>)

// 3. 캐싱 (5분 TTL)
const CACHE_TTL = 5 * 60 * 1000
let cachedIssues: RecurringIssue[] | null = null
let cacheTime = 0

const getCachedRecurringIssues = () => {
  if (cachedIssues && Date.now() - cacheTime < CACHE_TTL) {
    return cachedIssues
  }
  return null
}
```

#### UI 최적화
```typescript
// 1. Virtual scrolling (react-window)
import { FixedSizeList } from 'react-window'

<FixedSizeList
  height={400}
  itemCount={recurringIssues.length}
  itemSize={120}
>
  {({ index, style }) => (
    <RecurringIssueCard
      issue={recurringIssues[index]}
      style={style}
    />
  )}
</FixedSizeList>

// 2. Debounce 검색
const [searchTerm, setSearchTerm] = useState('')
const debouncedSearch = useMemo(
  () => debounce((term: string) => {
    // 필터링 로직
  }, 300),
  []
)
```

### 9. 보안 고려사항

#### 권한 검증
```typescript
// API 라우트에서 권한 체크
const user = await getUserFromToken(request)
if (!user) {
  return NextResponse.json(
    { success: false, error: '인증이 필요합니다.' },
    { status: 401 }
  )
}

// 완료 처리 시 수정 권한 확인
const { data: meetings } = await supabase
  .from('meeting_minutes')
  .select('id, created_by')
  .in('id', meetingIds)

// RLS (Row Level Security) 정책으로 자동 보호
```

#### SQL 인젝션 방지
```typescript
// ❌ 잘못된 방법
const query = `SELECT * FROM meeting_minutes WHERE business_id = '${businessId}'`

// ✅ 올바른 방법 (Prepared Statement)
const { data } = await supabase
  .from('meeting_minutes')
  .select('*')
  .eq('business_id', businessId)  // 자동 이스케이프
```

### 10. 테스트 시나리오

#### 단위 테스트
```typescript
describe('RecurringIssues API', () => {
  it('should return only incomplete issues', async () => {
    const response = await fetch('/api/meeting-minutes/recurring-issues')
    const result = await response.json()

    expect(result.success).toBe(true)
    expect(result.data.recurring_issues.every(
      issue => !issue.is_completed
    )).toBe(true)
  })

  it('should complete issues across all meetings', async () => {
    const response = await fetch('/api/meeting-minutes/business-issues/complete', {
      method: 'PUT',
      body: JSON.stringify({
        business_id: 'test-business-id',
        issue_description: 'test issue'
      })
    })

    const result = await response.json()
    expect(result.data.updated_count).toBeGreaterThan(0)
  })
})
```

#### E2E 테스트
```typescript
describe('Recurring Issues Workflow', () => {
  it('should display recurring issues when meeting type is 정기회의', async () => {
    // 1. 회의록 생성 페이지 이동
    await page.goto('/admin/meeting-minutes/create')

    // 2. 회의 유형을 "정기회의"로 선택
    await page.selectOption('[name="meeting_type"]', '정기회의')

    // 3. 미해결 이슈 패널 표시 확인
    const panel = await page.locator('[data-testid="recurring-issues-panel"]')
    await expect(panel).toBeVisible()

    // 4. 이슈 카드 개수 확인
    const issueCards = await page.locator('[data-testid="recurring-issue-card"]')
    expect(await issueCards.count()).toBeGreaterThan(0)
  })

  it('should complete issue across all meetings', async () => {
    // 1. 완료 버튼 클릭
    await page.click('[data-testid="complete-issue-btn"]')

    // 2. 완료 확인 메시지
    await expect(page.locator('text=완료 처리되었습니다')).toBeVisible()

    // 3. 이슈가 목록에서 제거됨
    const issueCard = page.locator('[data-testid="recurring-issue-card"]').first()
    await expect(issueCard).not.toBeVisible()
  })
})
```

## 📦 구현 우선순위

### Phase 1: 핵심 기능 (1-2일)
1. ✅ API 엔드포인트 구현
   - GET `/api/meeting-minutes/recurring-issues`
   - PUT `/api/meeting-minutes/business-issues/complete`
2. ✅ 데이터베이스 인덱스 추가
3. ✅ 기본 UI 컴포넌트
   - RecurringIssuesPanel
   - RecurringIssueCard

### Phase 2: UX 개선 (1일)
1. ✅ 경과 일수 색상 코딩
2. ✅ 로딩 상태 처리
3. ✅ 에러 처리 및 사용자 피드백
4. ✅ 이월 기능 구현

### Phase 3: 최적화 (선택)
1. ⏳ 캐싱 구현
2. ⏳ Virtual scrolling
3. ⏳ 검색/필터링 기능

## 🎯 성공 지표

### 기능적 목표
- ✅ 정기회의 작성 시 미해결 이슈 자동 표시
- ✅ 이슈 일괄 완료 처리 성공률 > 99%
- ✅ 원본 회의록 링크 정상 작동

### 성능 목표
- ⚡ 미해결 이슈 조회 < 500ms
- ⚡ 일괄 완료 처리 < 2초 (10개 회의록 기준)
- ⚡ UI 렌더링 < 100ms

### 사용성 목표
- 👍 사용자가 3번의 클릭 이내에 이슈 처리 가능
- 👍 경과 일수를 한눈에 파악 가능
- 👍 원본 회의록으로 쉽게 이동 가능

## 📝 다음 단계

1. **설계 검토 및 승인**
2. **Phase 1 구현 시작**
   - API 엔드포인트 개발
   - 데이터베이스 마이그레이션
   - 기본 UI 컴포넌트
3. **테스트 및 QA**
4. **프로덕션 배포**

---

**작성일**: 2025-02-02
**담당자**: Claude Code
**상태**: 🎨 설계 완료
**검토 필요**: API 구조, UI/UX, 성능 최적화 전략
