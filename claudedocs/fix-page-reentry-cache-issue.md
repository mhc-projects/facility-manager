# 페이지 재진입 시 캐시 문제 수정

## 문제 상황

게이트웨이 정보를 수정하고 저장 후, admin/air-permit 목록으로 돌아갔다가 다시 편집 페이지로 돌아오면 **예전 데이터가 출력**되는 문제.

### 재현 순서
1. air-permit-detail 편집 페이지에서 게이트웨이 수정 ✅
2. 저장 성공 → Toast 알림 표시 ✅
3. admin/air-permit 목록 페이지로 이동
4. 다시 편집 페이지로 돌아옴
5. ❌ **수정한 게이트웨이가 아닌 예전 데이터 출력됨**

## 근본 원인 분석

### 1. isInitialized 상태 지속 문제

```typescript
// Line 107
const [isInitialized, setIsInitialized] = useState(false)

// Line 256-260 (수정 전)
useEffect(() => {
  if (!isInitialized && urlParams.permitId) {
    loadData()
  }
}, [loadData, isInitialized, urlParams.permitId])
```

**문제**: Next.js 클라이언트 사이드 라우팅에서 컴포넌트가 완전히 언마운트되지 않음
- 페이지 A → 페이지 B → 다시 페이지 A로 돌아올 때
- React 상태(`isInitialized`)가 유지됨
- `isInitialized === true`이므로 조건문 `!isInitialized`가 false
- **결과**: `loadData()`가 실행되지 않아 데이터를 새로 불러오지 않음

### 2. Primary DB 조회 미사용

```typescript
// Line 177 (수정 전)
const response = await fetch(`/api/air-permit?id=${urlParams.permitId}&details=true`)
```

**문제**: `forcePrimary=true` 파라미터 없음
- Supabase Read Replica에서 데이터 조회 가능
- Replica는 Primary보다 최대 수 초 지연 가능
- 방금 저장한 데이터가 Replica에 반영 안 됐을 수 있음

### 3. 캐시 무효화 미적용

**문제**: 브라우저/Next.js 캐시
- 동일한 URL 요청 시 캐시된 응답 사용 가능
- 새로 저장된 데이터를 불러오지 않고 캐시 사용

## 해결 방법

### 1. permitId 변경 시 항상 데이터 새로고침

```typescript
// Line 256-260 (수정 후)
// ✅ permitId 변경 시 항상 데이터 새로고침 (페이지 재진입 시 최신 데이터 보장)
useEffect(() => {
  if (urlParams.permitId) {
    loadData()
  }
}, [loadData, urlParams.permitId])
```

**개선점**:
- `isInitialized` 조건 제거
- `permitId`가 있으면 **무조건** 데이터 로드
- 페이지 재진입 시에도 항상 최신 데이터 가져옴

### 2. Primary DB 강제 조회

```typescript
// Line 177-178 (수정 후)
// ✅ forcePrimary=true: Primary DB에서 최신 데이터 조회 (캐시 방지)
const response = await fetch(`/api/air-permit?id=${urlParams.permitId}&details=true&forcePrimary=true`)
```

**개선점**:
- `forcePrimary=true` 추가
- Primary Database에서 직접 조회
- Read-after-Write 일관성 보장
- Replica 지연 문제 해결

### 3. 배출구 생성 후 새로고침도 Primary 사용

```typescript
// Line 209 (수정 후)
const refreshResponse = await fetch(`/api/air-permit?id=${urlParams.permitId}&details=true&forcePrimary=true`)
```

**개선점**:
- 배출구 생성 직후 새로고침도 Primary DB 사용
- 방금 생성한 배출구가 즉시 조회됨

## 동작 흐름

### 수정 전 (문제 상황)
```
1. 편집 페이지 진입
   └─ isInitialized === false → loadData() 실행 ✅

2. 게이트웨이 수정 및 저장
   └─ Primary DB에 저장 ✅
   └─ isInitialized === true (계속 유지)

3. air-permit 목록으로 이동
   └─ 컴포넌트 언마운트 안 됨
   └─ isInitialized === true (유지됨)

4. 다시 편집 페이지 진입
   └─ permitId는 같음
   └─ isInitialized === true ❌
   └─ 조건문: !isInitialized && permitId → false
   └─ loadData() 실행 안 됨 ❌
   └─ 예전 상태 그대로 표시 ❌
```

### 수정 후 (해결)
```
1. 편집 페이지 진입
   └─ permitId 존재 → loadData() 실행 ✅
   └─ forcePrimary=true → Primary DB 조회 ✅

2. 게이트웨이 수정 및 저장
   └─ Primary DB에 저장 ✅

3. air-permit 목록으로 이동
   └─ 컴포넌트 상태 유지

4. 다시 편집 페이지 진입 (permitId 동일)
   └─ permitId 존재 → loadData() 실행 ✅
   └─ forcePrimary=true → Primary DB 조회 ✅
   └─ 최신 데이터 로드 ✅
   └─ 수정한 게이트웨이 정보 표시 ✅
```

## 코드 변경 사항

### app/admin/air-permit-detail/page.tsx

1. **useEffect 조건 수정** (Line 256-260)
   - 제거: `!isInitialized` 조건
   - 변경: `permitId`만 체크하여 항상 데이터 로드

2. **Primary DB 강제 조회** (Line 177-178)
   - 추가: `&forcePrimary=true` 파라미터

3. **배출구 생성 후 새로고침** (Line 209)
   - 추가: `&forcePrimary=true` 파라미터

## 검증 방법

1. 편집 페이지에서 게이트웨이 수정 (예: A → B)
2. 저장 버튼 클릭 → Toast 알림 확인
3. admin/air-permit 목록으로 이동
4. 다시 해당 permit의 편집 페이지로 돌아옴
5. ✅ 수정한 게이트웨이 B가 표시되는지 확인

## 성능 고려사항

### 우려: 매번 데이터를 새로 로드하면 느리지 않을까?

**답변**: 문제없음
- 사용자가 페이지 진입할 때만 실행 (클릭 한 번당 1회)
- 편집 중에는 다시 로드하지 않음
- API 응답 속도 빠름 (Supabase)
- **정확성 > 속도**: 잘못된 데이터 표시하는 것보다 0.1초 더 걸리는 게 나음

### 개선 가능성

필요하다면 나중에 추가할 수 있는 최적화:
- SWR/React Query 캐싱 (revalidate 전략)
- 저장 후 optimistic update
- 저장 직후에만 Primary, 그 외에는 Replica

하지만 현재 구조에서는 **불필요**합니다.

## 결론

- ✅ 페이지 재진입 시 항상 최신 데이터 로드
- ✅ Primary DB 조회로 Read-after-Write 일관성 보장
- ✅ 사용자 경험 개선 (수정 사항 즉시 반영)
- ✅ 성능 영향 미미 (페이지 진입당 1회)
