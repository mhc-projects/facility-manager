# 반복 이슈 추적 API 사용 가이드

## 📝 개요

정기회의에서 미해결된 사업장별 이슈를 추적하고 일괄 완료 처리하는 API 엔드포인트입니다.

**구현 완료 날짜**: 2025-02-02
**Phase 1**: API 엔드포인트 및 데이터베이스 인덱스 구현 완료

## 🚀 API 엔드포인트

### 1. GET /api/meeting-minutes/recurring-issues

정기회의에서 미해결된 사업장별 이슈 목록을 조회합니다.

#### Request

**Method**: `GET`
**URL**: `/api/meeting-minutes/recurring-issues`
**Authentication**: JWT 토큰 필요 (Authorization 헤더 또는 session_token 쿠키)

**Query Parameters**:
```
limit (optional): 반환할 최대 이슈 개수 (기본값: 50)
offset (optional): 페이지네이션 오프셋 (기본값: 0)
days_since (optional): N일 이전부터의 이슈만 조회
```

#### Response

**Success (200)**:
```json
{
  "success": true,
  "data": {
    "recurring_issues": [
      {
        "id": "issue-uuid",
        "business_id": "business-uuid",
        "business_name": "(주)엘림테크",
        "issue_content": "소음 민원 발생 - 방음벽 설치 필요",
        "assignee_id": "employee-uuid",
        "assignee_name": "최문호",
        "is_completed": false,
        "priority": "high",
        "original_meeting_id": "meeting-uuid",
        "original_meeting_title": "2025년 1월 정기회의",
        "original_meeting_date": "2025-01-15",
        "days_elapsed": 18,
        "is_recurring": true
      }
    ],
    "total_count": 5,
    "limit": 50,
    "offset": 0
  }
}
```

**Error (401)**:
```json
{
  "success": false,
  "error": "인증이 필요합니다."
}
```

#### cURL 예제

```bash
# 기본 조회
curl -X GET "http://localhost:3000/api/meeting-minutes/recurring-issues" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# 페이지네이션 (10개씩, 2페이지)
curl -X GET "http://localhost:3000/api/meeting-minutes/recurring-issues?limit=10&offset=10" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# 최근 30일 이내 이슈만 조회
curl -X GET "http://localhost:3000/api/meeting-minutes/recurring-issues?days_since=30" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### 2. PUT /api/meeting-minutes/business-issues/complete

동일한 사업장 이슈를 모든 회의록에서 완료 처리합니다.

#### Request

**Method**: `PUT`
**URL**: `/api/meeting-minutes/business-issues/complete`
**Authentication**: JWT 토큰 필요
**Content-Type**: `application/json`

**Body**:
```json
{
  "issue_id": "issue-uuid",
  "business_id": "business-uuid",
  "issue_content": "소음 민원 발생 - 방음벽 설치 필요"
}
```

**필수 필드**:
- `issue_id`: 이슈의 고유 ID
- `business_id`: 사업장 ID
- `issue_content`: 이슈 내용 (동일한 이슈 식별용)

#### Response

**Success (200)**:
```json
{
  "success": true,
  "data": {
    "updated_count": 3,
    "message": "3개의 회의록에서 이슈가 완료 처리되었습니다."
  }
}
```

**Error (400)**:
```json
{
  "success": false,
  "error": "issue_id, business_id, issue_content는 필수입니다."
}
```

**Error (401)**:
```json
{
  "success": false,
  "error": "인증이 필요합니다."
}
```

#### cURL 예제

```bash
curl -X PUT "http://localhost:3000/api/meeting-minutes/business-issues/complete" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "issue_id": "123e4567-e89b-12d3-a456-426614174000",
    "business_id": "0c9e09a8-bf04-440f-b390-aa0e25b70ab1",
    "issue_content": "소음 민원 발생 - 방음벽 설치 필요"
  }'
```

## 🗄️ 데이터베이스 인덱스

성능 최적화를 위한 인덱스가 추가되었습니다.

### 인덱스 설치

```bash
# Supabase SQL Editor에서 실행
psql -h your-supabase-host -U postgres -d postgres < sql/add_recurring_issues_indexes.sql
```

### 생성된 인덱스

1. **idx_meeting_minutes_type_status**: meeting_type과 status 복합 인덱스
2. **idx_meeting_minutes_date**: meeting_date 정렬 인덱스
3. **idx_meeting_minutes_business_issues_gin**: JSONB 이슈 검색 GIN 인덱스
4. **idx_meeting_minutes_business_id**: business_id 검색 인덱스

### 인덱스 확인

```sql
SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'meeting_minutes'
  AND indexname LIKE 'idx_meeting%';
```

## 🔍 동작 원리

### GET recurring-issues 흐름

```
1. JWT 인증 확인
   ↓
2. Query parameters 파싱 (limit, offset, days_since)
   ↓
3. 정기회의 회의록 조회 (meeting_type='정기회의', status!='archived')
   ↓
4. 각 회의록의 content.business_issues 배열 순회
   ↓
5. is_completed=false인 이슈 추출
   ↓
6. days_elapsed 계산 (오늘 - meeting_date)
   ↓
7. RecurringIssue 객체 생성 (original_meeting 메타데이터 포함)
   ↓
8. days_elapsed 기준 정렬 (오래된 순)
   ↓
9. 페이지네이션 적용 후 반환
```

### PUT complete 흐름

```
1. JWT 인증 확인
   ↓
2. Request body 검증 (issue_id, business_id, issue_content)
   ↓
3. 모든 정기회의 회의록 조회
   ↓
4. 각 회의록의 business_issues 배열에서 일치하는 이슈 찾기
   - 조건: (issue.id === issue_id) OR
           (issue.business_id === business_id AND
            issue.issue_content === issue_content AND
            issue.is_completed === false)
   ↓
5. 일치하는 이슈를 is_completed=true로 업데이트
   - completed_date: 현재 시간
   - completed_by: 현재 사용자 ID
   ↓
6. 변경된 content를 데이터베이스에 저장
   ↓
7. 모든 업데이트를 병렬로 실행 (Promise.all)
   ↓
8. 업데이트된 회의록 개수 반환
```

## 📊 사용 예시

### Frontend에서 사용 (React)

```typescript
// 1. 미해결 이슈 조회
const fetchRecurringIssues = async () => {
  try {
    const response = await fetch('/api/meeting-minutes/recurring-issues?limit=20')
    const data = await response.json()

    if (data.success) {
      setRecurringIssues(data.data.recurring_issues)
      setTotalCount(data.data.total_count)
    }
  } catch (error) {
    console.error('Failed to fetch recurring issues:', error)
  }
}

// 2. 이슈 완료 처리
const completeIssue = async (issue: RecurringIssue) => {
  try {
    const response = await fetch('/api/meeting-minutes/business-issues/complete', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        issue_id: issue.id,
        business_id: issue.business_id,
        issue_content: issue.issue_content
      })
    })

    const data = await response.json()

    if (data.success) {
      alert(`${data.data.updated_count}개의 회의록에서 완료 처리되었습니다.`)
      // 목록 새로고침
      fetchRecurringIssues()
    }
  } catch (error) {
    console.error('Failed to complete issue:', error)
  }
}
```

## 🎨 UI 구현 (다음 단계)

Phase 2에서 구현할 UI 컴포넌트:

1. **RecurringIssuesPanel.tsx**: 미해결 이슈 패널
2. **RecurringIssueCard.tsx**: 개별 이슈 카드
3. **색상 코드**:
   - 🟢 녹색: 7일 미만
   - 🟡 노란색: 7-30일
   - 🔴 빨간색: 30일 이상

## ⚠️ 주의사항

1. **인증 필수**: 모든 API는 JWT 토큰 인증이 필요합니다.
2. **권한 확인**: RLS(Row Level Security) 정책에 따라 접근 권한이 제한될 수 있습니다.
3. **JSONB 성능**: 대량의 회의록이 있는 경우 인덱스가 필수입니다.
4. **동일 이슈 판별**: business_id와 issue_content가 모두 일치해야 동일한 이슈로 간주됩니다.
5. **병렬 업데이트**: complete API는 Promise.all을 사용하여 병렬 업데이트를 수행합니다.

## 🐛 문제 해결

### 인증 실패 (401)
```bash
# JWT 토큰 확인
curl -X GET "http://localhost:3000/api/meeting-minutes/recurring-issues" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -v
```

### 이슈가 조회되지 않음
1. meeting_type이 '정기회의'인지 확인
2. status가 'archived'가 아닌지 확인
3. is_completed가 false인지 확인

### 완료 처리가 안됨
1. issue_id, business_id, issue_content가 정확한지 확인
2. 동일한 이슈가 다른 회의록에도 존재하는지 확인

## 📈 성능 최적화

### 인덱스 효과 확인

```sql
EXPLAIN ANALYZE
SELECT id, title, meeting_date, content->'business_issues' as issues
FROM meeting_minutes
WHERE meeting_type = '정기회의'
  AND status != 'archived'
ORDER BY meeting_date DESC;
```

**기대 결과**:
- Index Scan 사용
- Execution time < 50ms (회의록 1000개 기준)

### 캐싱 전략 (Phase 3)

- Redis 캐싱: 반복 이슈 목록 (TTL: 5분)
- React Query: Frontend 캐싱 및 자동 재검증

## 🔜 다음 단계

**Phase 2: UI 구현** (예정)
- RecurringIssuesPanel 컴포넌트
- RecurringIssueCard 컴포넌트
- 색상 코드 및 아이콘
- 로딩 상태 및 에러 처리

**Phase 3: UX 개선** (예정)
- 캐싱 및 성능 최적화
- 필터링 및 정렬 기능
- 이슈 해결 이력 추적
- 알림 기능

---

**작성일**: 2025-02-02
**담당자**: Claude Code
**상태**: ✅ Phase 1 완료 (API 엔드포인트 구현)
**다음**: Phase 2 UI 구현 시작
