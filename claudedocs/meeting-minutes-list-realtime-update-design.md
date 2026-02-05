# 회의록 목록 페이지 실시간 업데이트 설계

## 🎯 문제 정의

### 현재 상황
**위치**: `/app/admin/meeting-minutes/page.tsx`

**문제점**:
사용자가 회의록 목록 페이지에서 회의록 카드를 클릭하여 상세 페이지로 이동한 후, 편집하고 저장한 뒤 브라우저 뒤로가기로 돌아왔을 때 변경사항이 즉시 반영되지 않음.

### 사용자 시나리오

```
1. 사용자가 회의록 목록 페이지를 봄 (회의록 A: 진행중 상태)
2. 회의록 A 카드를 클릭 → 상세 페이지 진입
3. 편집 버튼 클릭 → 편집 페이지 진입
4. 상태를 "완료"로 변경하고 저장
5. 상세 페이지로 돌아감 ✅ (최근 구현: 실시간 반영됨)
6. 브라우저 뒤로가기 버튼으로 목록으로 돌아감
7. ❌ 회의록 A가 여전히 "진행중"으로 표시됨 (캐시된 데이터)

기대: 회의록 A가 "완료"로 표시되어야 함
```

## 🔍 현재 코드 분석

### 1. 목록 페이지 구조 (Line 29-66)

```typescript
export default function MeetingMinutesPage() {
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  const [loading, setLoading] = useState(true)

  // 데이터 상태
  const [minutes, setMinutes] = useState<MeetingMinute[]>([])
  const [statistics, setStatistics] = useState<MeetingStatistics>({...})
  const [pagination, setPagination] = useState<Pagination>({...})

  // 필터 상태
  const [filters, setFilters] = useState<MeetingFilters>({
    status: 'all',
    search: ''
  })

  useEffect(() => {
    setMounted(true)
    loadMeetingMinutes()
  }, [])  // ⚠️ 빈 의존성 배열: 초기 마운트 시에만 실행

  useEffect(() => {
    if (mounted) {
      loadMeetingMinutes()
    }
  }, [filters, pagination.page])  // filters와 pagination 변경 시에만 재실행
```

### 2. 데이터 로딩 함수 (Line 68-106)

```typescript
const loadMeetingMinutes = async () => {
  try {
    setLoading(true)

    // 쿼리 파라미터 구성
    const params = new URLSearchParams({
      page: pagination.page.toString(),
      limit: pagination.limit.toString()
    })

    if (filters.status && filters.status !== 'all') {
      params.append('status', filters.status)
    }
    if (filters.meeting_type) {
      params.append('meeting_type', filters.meeting_type)
    }
    if (filters.search) {
      params.append('search', filters.search)
    }

    // API 호출 (이미 cache: 'no-store' 적용됨)
    const response = await fetch(`/api/meeting-minutes?${params}`, {
      cache: 'no-store'  // ✅ 캐시 비활성화는 이미 적용되어 있음
    })
    const result = await response.json()

    if (result.success) {
      setMinutes(result.data.items)
      setPagination(result.data.pagination)
      setStatistics(result.data.statistics)
    }
  } catch (error) {
    console.error('[MEETING-MINUTES] Load error:', error)
  } finally {
    setLoading(false)
  }
}
```

### 3. 카드 클릭 핸들러 (Line 385)

```typescript
<div
  onClick={() => router.push(`/admin/meeting-minutes/${minute.id}`)}
  className="..."
>
  {/* 회의록 카드 내용 */}
</div>
```

## 🧩 근본 원인

### 문제 1: 브라우저 히스토리 네비게이션 시 재렌더링 없음
- 브라우저 뒤로가기는 컴포넌트를 다시 마운트하지 않음
- useEffect의 의존성 배열(`[]`, `[filters, pagination.page]`)이 변경되지 않음
- 따라서 `loadMeetingMinutes()`가 호출되지 않음

### 문제 2: Next.js Router Cache
- Next.js App Router는 클라이언트 사이드 라우팅 시 캐싱 전략 사용
- `router.push()`로 이동했던 페이지는 캐시에서 복원될 수 있음
- 상세 페이지에서 돌아올 때 목록 페이지가 캐시된 상태로 복원됨

### 문제 3: 네비게이션 트리거 부재
- 상세 페이지와 편집 페이지는 URL 쿼리 파라미터로 업데이트 트리거
- 목록 페이지는 이런 트리거 메커니즘이 없음
- 상세 페이지에서 목록으로 돌아갈 때 "데이터가 변경되었다"는 신호가 없음

## ✅ 해결 방안

### Option 1: URL 쿼리 파라미터 트리거 (권장)

**장점**:
- 상세/편집 페이지와 동일한 패턴 사용 (일관성)
- 명시적인 업데이트 트리거
- 브라우저 히스토리와 잘 작동
- 구현 복잡도 낮음

**단점**:
- URL에 타임스탬프 파라미터 노출 (사용자 경험에 큰 영향 없음)

**구현 방법**:

#### 1. 목록 페이지에 useSearchParams 추가 (Line 7, 30-31)
```typescript
import { useRouter, useSearchParams } from 'next/navigation'

export default function MeetingMinutesPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const refreshTrigger = searchParams.get('refresh')  // 업데이트 트리거 감지
```

#### 2. useEffect 의존성 배열 수정 (Line 57-60)
```typescript
useEffect(() => {
  setMounted(true)
  loadMeetingMinutes()
}, [refreshTrigger])  // refreshTrigger 변경 시 재실행
```

#### 3. 상세 페이지에서 목록으로 돌아갈 때 파라미터 추가

**위치**: `/app/admin/meeting-minutes/[id]/page.tsx` (Line 125-127)

현재:
```typescript
const handleBack = () => {
  router.push('/admin/meeting-minutes')
}
```

수정:
```typescript
const handleBack = () => {
  const timestamp = Date.now()
  router.push(`/admin/meeting-minutes?refresh=${timestamp}`)
}
```

#### 4. API 호출에 캐시 버스팅 추가 (선택사항, 이미 cache: 'no-store' 적용됨)

현재 코드는 이미 `cache: 'no-store'`가 적용되어 있으므로 추가 작업 불필요. 만약 더 명시적으로 하려면:

```typescript
const timestamp = Date.now()
const response = await fetch(`/api/meeting-minutes?${params}&_t=${timestamp}`, {
  cache: 'no-store'
})
```

### Option 2: Router Events 사용

**장점**:
- URL 파라미터 없이 깔끔한 URL 유지
- 브라우저 뒤로가기 자동 감지

**단점**:
- Next.js App Router에서는 router events API 제한적
- `popstate` 이벤트 직접 핸들링 필요 (복잡도 증가)
- 페이지 간 데이터 동기화 로직 필요

**구현 예시** (권장하지 않음):
```typescript
useEffect(() => {
  const handlePopState = () => {
    loadMeetingMinutes()
  }

  window.addEventListener('popstate', handlePopState)
  return () => window.removeEventListener('popstate', handlePopState)
}, [])
```

### Option 3: Supabase Realtime Subscription

**장점**:
- 진정한 실시간 동기화 (다른 사용자의 변경사항도 반영)
- 자동 업데이트 (사용자 액션 불필요)

**단점**:
- 구현 복잡도 높음
- Supabase Realtime 설정 필요
- 네트워크 오버헤드
- 현재 프로젝트 구조와 맞지 않음 (API 기반)

**구현 예시** (참고용):
```typescript
useEffect(() => {
  const channel = supabase
    .channel('meeting-minutes-changes')
    .on('postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'meeting_minutes'
      },
      () => {
        loadMeetingMinutes()
      }
    )
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}, [])
```

## 🎯 권장 솔루션: Option 1 (URL 쿼리 파라미터)

### 이유
1. **패턴 일관성**: 상세/편집 페이지에서 이미 검증된 패턴
2. **구현 간결성**: 4개 위치만 수정하면 됨
3. **신뢰성**: Next.js App Router와 잘 작동
4. **디버깅 용이성**: URL에서 업데이트 시점 확인 가능

### 구현 체크리스트

- [ ] 목록 페이지에 `useSearchParams` import 추가
- [ ] `refreshTrigger` 변수 추가하여 쿼리 파라미터 감지
- [ ] 첫 번째 useEffect 의존성을 `[refreshTrigger]`로 변경
- [ ] 상세 페이지 `handleBack` 함수에 `?refresh=${timestamp}` 추가
- [ ] 빌드 및 테스트
- [ ] 커밋 및 푸시

## 📊 데이터 흐름

### Before (현재)
```
목록 페이지 (초기 로드) → 상태 캐시됨
  ↓ (카드 클릭)
상세 페이지 → 편집 페이지 → 저장 → 상세 페이지 (✅ 실시간 반영)
  ↓ (뒤로가기)
목록 페이지 (❌ 캐시된 데이터 표시, 변경사항 없음)
```

### After (개선)
```
목록 페이지 (초기 로드) → 상태 캐시됨
  ↓ (카드 클릭)
상세 페이지 → 편집 페이지 → 저장 → 상세 페이지 (✅ 실시간 반영)
  ↓ (뒤로가기 with ?refresh=timestamp)
목록 페이지 (✅ refreshTrigger 감지 → useEffect 재실행 → 최신 데이터 로드)
```

## 🔬 테스트 시나리오

### Test Case 1: 상세 페이지에서 뒤로가기
```
1. 목록 페이지 진입 (회의록 A: 진행중)
2. 회의록 A 클릭 → 상세 페이지
3. 뒤로가기 버튼 클릭
4. ✅ 목록 페이지에서 최신 데이터 로드됨 (refresh 파라미터로 인해)
```

### Test Case 2: 편집 후 목록으로 복귀
```
1. 목록 페이지 진입 (회의록 A: 진행중)
2. 회의록 A 클릭 → 상세 페이지
3. 편집 버튼 클릭 → 편집 페이지
4. 상태를 "완료"로 변경하고 저장
5. 상세 페이지로 돌아감 (✅ "완료" 표시됨)
6. 뒤로가기로 목록 복귀
7. ✅ 회의록 A가 "완료"로 표시됨
```

### Test Case 3: 다른 사용자의 변경사항
```
시나리오: 사용자 A가 목록을 보는 동안 사용자 B가 회의록을 수정
1. 사용자 A: 목록 페이지 진입
2. 사용자 B: 회의록 A 수정 및 저장
3. 사용자 A: 다른 회의록 B를 클릭하여 상세 페이지로 이동
4. 사용자 A: 뒤로가기로 목록 복귀
5. ✅ 사용자 B의 변경사항(회의록 A)이 반영되어 표시됨
```

### Test Case 4: 필터/검색 사용 중 업데이트
```
1. 목록 페이지 진입
2. "완료" 필터 적용 (5개 회의록 표시)
3. 회의록 A 클릭 → 상세 → 편집 → 상태를 "보관"으로 변경 → 저장
4. 뒤로가기로 목록 복귀
5. ✅ 회의록 A가 목록에서 사라짐 (필터에 맞지 않음)
6. ✅ 통계 숫자가 업데이트됨 (완료: 4개)
```

## 🔗 관련 파일

### 수정 필요 파일
- `/app/admin/meeting-minutes/page.tsx` (목록 페이지)
  - Line 7: import 수정
  - Line 30-31: searchParams 추가
  - Line 57-60: useEffect 의존성 수정

- `/app/admin/meeting-minutes/[id]/page.tsx` (상세 페이지)
  - Line 125-127: handleBack 함수 수정

### 참고 파일 (이미 구현된 패턴)
- `/app/admin/meeting-minutes/[id]/page.tsx` - 상세 페이지 실시간 업데이트 (Line 26-27, 33-36, 43-46)
- `/app/admin/meeting-minutes/[id]/edit/page.tsx` - 편집 페이지 새로고침 (Line 32-33, 63, 103-106)

## 📈 영향 분석

### 변경 범위
- **최소 침습적**: 2개 파일, 약 6-8줄 수정
- **하위 호환성**: 기존 URL 동작 유지 (파라미터 없어도 정상 작동)
- **성능 영향**: 없음 (기존과 동일한 API 호출 횟수)

### 사용자 경험 개선
- ✅ 편집 후 목록 복귀 시 변경사항 즉시 확인 가능
- ✅ 데이터 일관성 보장 (통계, 카드 상태 등)
- ✅ 새로고침 불필요 (사용자 액션 감소)

### 유지보수성
- ✅ 프로젝트 전체에서 일관된 패턴 사용
- ✅ 명시적이고 예측 가능한 동작
- ✅ 추후 다른 목록 페이지에도 동일 패턴 적용 가능

## 💡 추가 개선 제안 (선택사항)

### 1. 로딩 상태 개선
목록 새로고침 시 전체 로딩 스피너 대신 부드러운 전환:

```typescript
const [isRefreshing, setIsRefreshing] = useState(false)

const loadMeetingMinutes = async (isRefresh = false) => {
  try {
    if (isRefresh) {
      setIsRefreshing(true)  // 부드러운 리프레시 인디케이터
    } else {
      setLoading(true)  // 초기 로딩
    }
    // ... API 호출
  } finally {
    setLoading(false)
    setIsRefreshing(false)
  }
}
```

### 2. 토스트 알림 (선택사항)
목록이 업데이트되었음을 사용자에게 알림:

```typescript
useEffect(() => {
  if (mounted && refreshTrigger) {
    loadMeetingMinutes()
    // toast.success('목록이 업데이트되었습니다.')
  }
}, [refreshTrigger])
```

## 🎨 예상 결과

구현 후 사용자는:
1. 회의록을 편집하고 저장
2. 뒤로가기로 목록 복귀
3. **즉시** 변경된 상태/내용 확인 가능 (새로고침 불필요)
4. 통계 카드도 자동으로 업데이트됨

### 일관된 실시간 업데이트 경험
```
목록 페이지 ←→ 상세 페이지 ←→ 편집 페이지
   ✅           ✅            ✅
(모든 페이지에서 실시간 데이터 반영)
```
