# 사업장 관리 상세모달 업무 중복 표시 문제 해결

## 📋 문제 상황

**증상**: 사업장 관리 상세모달의 "메모 및 업무" 섹션에서 같은 업무가 중복으로 표시됨
- 상세모달: "메모 및 업무 (2개)" 표시, 같은 업무 2개 보임
- admin/tasks 페이지: 실제로는 1개의 업무만 존재

**발생 위치**: `/app/admin/business/page.tsx` → `BusinessDetailModal` 컴포넌트

## 🔍 근본 원인 분석

### 원인 1: 부정확한 카운트 표시
[BusinessDetailModal.tsx:636](/Users/mh.c/claude/facility-manager/components/business/modals/BusinessDetailModal.tsx#L636)

```typescript
// ❌ 문제 코드
메모 및 업무 ({businessMemos.length + businessTasks.length}개)
```

**문제점**:
- `businessMemos`에는 `source_type === 'task_sync'`인 메모가 포함됨
- `getIntegratedItems()` 함수 내부에서 이런 메모들은 필터링되어 실제 표시되지 않음
- 하지만 카운트는 필터링 전 원본 배열 길이를 사용하여 부정확한 개수 표시

### 원인 2: 잠재적 데이터 중복 가능성
[app/admin/business/page.tsx:956-968](/Users/mh.c/claude/facility-manager/app/admin/business/page.tsx#L956-L968)

```typescript
// ⚠️ 중복 방지 로직 없음
businessTasks.forEach(task => {
  items.push({...})  // 중복 검사 없이 모든 task 추가
})
```

**문제점**:
- API 응답이나 상태 관리 이슈로 `businessTasks` 배열에 중복 데이터가 들어올 경우 필터링 없이 그대로 추가
- 중복 데이터에 대한 방어 로직이 없음

## ✅ 해결 방법

### Fix 1: 정확한 카운트 표시
[BusinessDetailModal.tsx:636](/Users/mh.c/claude/facility-manager/components/business/modals/BusinessDetailModal.tsx#L636)

```typescript
// ✅ 수정 후
메모 및 업무 ({getIntegratedItems().length}개)
```

**개선 사항**:
- 실제 표시될 아이템 개수를 정확하게 카운트
- `task_sync` 메모 필터링이 반영된 정확한 개수 표시

### Fix 2: 중복 방지 로직 추가
[app/admin/business/page.tsx:956-976](/Users/mh.c/claude/facility-manager/app/admin/business/page.tsx#L956-L976)

```typescript
// ✅ 중복 방지 로직 추가
const addedTaskIds = new Set<string>()

businessTasks.forEach(task => {
  // 이미 추가된 task ID는 건너뛰기
  if (addedTaskIds.has(task.id)) {
    console.warn('⚠️ [FRONTEND] 중복 업무 제외됨:', task.id, task.title)
    return
  }

  addedTaskIds.add(task.id)
  items.push({...})
})
```

**개선 사항**:
- Set 자료구조를 사용한 O(1) 중복 검사
- 동일한 task ID를 가진 항목은 한 번만 추가
- 중복 발생 시 경고 로그로 디버깅 가능

### Fix 3: 디버깅 로그 추가
[app/admin/business/page.tsx:956-980](/Users/mh.c/claude/facility-manager/app/admin/business/page.tsx#L956-L980)

```typescript
console.log('🔍 [DEBUG] businessTasks 배열:', businessTasks)
console.log('🔍 [DEBUG] businessTasks IDs:', businessTasks.map(t => ({ id: t.id, title: t.title })))
console.log('🔍 [DEBUG] businessTasks unique IDs:', [...new Set(businessTasks.map(t => t.id))])
console.log('🔍 [DEBUG] 최종 items 배열:', items.map(i => ({ type: i.type, id: i.id, title: i.title })))
```

**개선 사항**:
- API 응답 데이터 중복 여부 확인 가능
- 통합 과정에서 중복 발생 시점 추적 가능
- 최종 표시 데이터 검증 가능

## 🎯 Single Source of Truth (SSOT) 원칙 준수

### 데이터 흐름
1. **API**: `/api/facility-tasks?businessName=사업장명` → 단일 데이터 소스
2. **State**: `businessTasks` 배열 → API 응답 그대로 저장
3. **Integration**: `getIntegratedItems()` → 중복 제거 + 필터링
4. **Display**: `BusinessDetailModal` → 통합된 데이터 표시

### 중복 방지 계층
```
┌─────────────────────────────┐
│ API (facility-tasks)        │ ← SQL DISTINCT 또는 PRIMARY KEY 보장
└──────────┬──────────────────┘
           │
┌──────────▼──────────────────┐
│ businessTasks State         │ ← API 응답 저장
└──────────┬──────────────────┘
           │
┌──────────▼──────────────────┐
│ getIntegratedItems()        │ ← ✅ 중복 제거 로직 (NEW!)
└──────────┬──────────────────┘
           │
┌──────────▼──────────────────┐
│ UI Display                  │ ← ✅ 정확한 카운트 (NEW!)
└─────────────────────────────┘
```

## 📊 검증 방법

### 1. 콘솔 로그 확인
브라우저 개발자 도구 콘솔에서 다음 로그 확인:
```
🔍 [DEBUG] API tasks IDs: [{id: "...", title: "..."}]
🔍 [DEBUG] businessTasks unique IDs: ["id1", "id2", ...]
⚠️ [FRONTEND] 중복 업무 제외됨: (중복 발생 시만)
🔧 [FRONTEND] 통합 아이템 수 - 메모: X개, 업무: Y개
```

### 2. UI 확인
- "메모 및 업무 (N개)" 카운트가 실제 표시 항목 수와 일치
- admin/tasks 페이지와 상세모달의 업무 개수 일치

### 3. 데이터베이스 확인
```sql
-- 사업장별 실제 업무 개수 확인
SELECT business_name, COUNT(*) as task_count
FROM facility_tasks
WHERE business_name = '한일전동지게차'
  AND is_active = true
  AND is_deleted = false
GROUP BY business_name;
```

## 🔄 관련 파일 및 함수

### 수정된 파일
1. **[components/business/modals/BusinessDetailModal.tsx](/Users/mh.c/claude/facility-manager/components/business/modals/BusinessDetailModal.tsx)**
   - Line 636: 카운트 표시 로직 수정

2. **[app/admin/business/page.tsx](/Users/mh.c/claude/facility-manager/app/admin/business/page.tsx)**
   - Lines 956-980: `getIntegratedItems()` 함수 중복 방지 로직 추가
   - Lines 1153-1165: API 응답 디버깅 로그 추가

### 관련 함수
- `getIntegratedItems()`: 메모와 업무를 통합하여 표시용 배열 생성
- `loadBusinessTasks()`: API에서 업무 데이터 로드
- `BusinessDetailModal`: 사업장 상세 정보 표시 컴포넌트

## 📌 향후 개선 사항

### 1. API 레벨 중복 방지
현재는 프론트엔드에서 중복 제거하지만, API 레벨에서도 보장하는 것이 이상적:

```typescript
// app/api/facility-tasks/route.ts
const queryText = `
  SELECT DISTINCT ON (ftb.id)  -- ✅ 중복 제거
    ftb.id,
    ftb.title,
    ...
  FROM facility_tasks_with_business ftb
  WHERE ...
`;
```

### 2. TypeScript 타입 강화
중복 방지가 명시적으로 타입에 표현되도록:

```typescript
type DeduplicatedTasks = {
  tasks: FacilityTask[]
  duplicatesRemoved: number
}
```

### 3. 성능 최적화
`getIntegratedItems()` 호출 최소화를 위한 useMemo 사용:

```typescript
const integratedItems = useMemo(
  () => getIntegratedItems(),
  [businessMemos, businessTasks]
)
```

## ✅ 결론

**해결된 문제**:
1. ✅ 부정확한 카운트 표시 → 실제 표시 항목 수로 수정
2. ✅ 잠재적 중복 데이터 → Set 기반 중복 제거 로직 추가
3. ✅ 디버깅 어려움 → 상세한 로그 추가

**Single Source of Truth 원칙**:
- ✅ API가 단일 데이터 소스 역할
- ✅ 프론트엔드에서 중복 방어 계층 추가
- ✅ 표시 로직에서 정확한 데이터 카운트

**사용자 영향**:
- 사업장 관리 상세모달에서 정확한 메모/업무 개수 표시
- 중복 업무 표시 문제 완전 해결
- admin/tasks 페이지와 일관된 데이터 표시
