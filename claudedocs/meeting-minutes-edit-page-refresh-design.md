# 회의록 편집 페이지 새로고침 기능 설계

## 🎯 요구사항

**배경**: 상세 페이지에서 편집 페이지로 이동 시, 다른 사용자가 수정한 최신 데이터가 반영되지 않을 수 있음

**목적**: 편집 페이지 진입 시 항상 최신 회의록 데이터를 로드하여 편집 충돌 방지

## 📊 현재 상태 분석

### 기존 데이터 흐름

```
상세 페이지
  ↓ "편집" 버튼 클릭
편집 페이지 마운트
  ↓
useEffect(() => { loadMeetingMinute() }, [])  ← 초기 마운트 시에만 실행
  ↓
회의록 데이터 로드 (한 번만)
```

### 현재 코드 (edit/page.tsx)

**Line 53-61**:
```typescript
useEffect(() => {
  setMounted(true)
  // 먼저 사업장과 직원 목록을 로드한 후, 회의록을 로드
  const initializeData = async () => {
    await loadBusinessesAndEmployees()
    await loadMeetingMinute()
  }
  initializeData()
}, [])  // 빈 의존성 배열 - 초기 마운트 시에만 실행
```

**Line 97-102**:
```typescript
const loadMeetingMinute = async () => {
  try {
    setLoading(true)

    const response = await fetch(`/api/meeting-minutes/${params.id}`)
    const result = await response.json()
    // ... 데이터 처리
  }
}
```

## 🔍 문제 시나리오

### 시나리오 1: 다중 사용자 편집 충돌
```
시간 T0: 사용자 A가 회의록 상세 페이지 진입
시간 T1: 사용자 B가 회의록 편집 후 저장 (안건 3개 → 5개)
시간 T2: 사용자 A가 편집 버튼 클릭
  ↓
문제: 사용자 A는 여전히 안건 3개만 보임 (캐시된 데이터)
  ↓
사용자 A가 저장하면 사용자 B의 변경사항 덮어쓰기 위험 ⚠️
```

### 시나리오 2: 상세 → 편집 → 상세 → 편집 반복
```
상세 페이지 진입 (데이터 로드: v1)
  ↓
편집 페이지 진입 (데이터 로드: v1, 캐시 사용 가능)
  ↓
취소 후 상세 페이지로 돌아감
  ↓
다시 편집 페이지 진입
  ↓
문제: useEffect 의존성이 없어 재로드 안 됨 (여전히 v1)
```

## ✅ 해결 방안

### Solution 1: URL Query Parameter + useEffect 의존성 (권장)

**상세 페이지와 동일한 패턴 적용**

#### 상세 페이이지에서 편집 버튼 수정

```typescript
// 상세 페이지 (page.tsx) - Line 60-62
const handleEdit = () => {
  // 타임스탬프 파라미터 추가로 편집 페이지 강제 리로드 트리거
  const timestamp = Date.now()
  router.push(`/admin/meeting-minutes/${params.id}/edit?refresh=${timestamp}`)
}
```

#### 편집 페이지 수정

```typescript
// 편집 페이지 (edit/page.tsx)
import { useRouter, useSearchParams } from 'next/navigation'

export default function EditMeetingMinutePage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const refresh = searchParams.get('refresh')  // 리프레시 트리거 감지

  // ... 기존 상태들

  useEffect(() => {
    setMounted(true)
    // 먼저 사업장과 직원 목록을 로드한 후, 회의록을 로드
    const initializeData = async () => {
      await loadBusinessesAndEmployees()
      await loadMeetingMinute()
    }
    initializeData()
  }, [refresh])  // refresh 파라미터 변경 시 재실행

  const loadMeetingMinute = async () => {
    try {
      setLoading(true)

      // 캐시 우회를 위한 타임스탬프 추가
      const timestamp = Date.now()
      const response = await fetch(`/api/meeting-minutes/${params.id}?_t=${timestamp}`)
      const result = await response.json()
      // ... 기존 로직
    }
  }

  // ... 나머지 코드
}
```

**장점**:
- 상세 페이지와 동일한 패턴으로 일관성 유지
- 명확한 리프레시 트리거
- Next.js 라우터 캐시 우회
- 디버깅 용이

**단점**:
- URL에 파라미터 노출 (미미함)

---

### Solution 2: 항상 최신 데이터 로드 (useEffect 의존성에 params.id 추가)

```typescript
useEffect(() => {
  setMounted(true)
  const initializeData = async () => {
    await loadBusinessesAndEmployees()
    await loadMeetingMinute()
  }
  initializeData()
}, [params.id])  // params.id 의존성 추가
```

**장점**:
- 간단한 수정 (1줄)
- URL 파라미터 불필요

**단점**:
- params.id가 같을 때는 재로드 안 됨 (동일 페이지 재진입 시)
- 캐시 이슈 여전히 존재 가능

---

### Solution 3: 로컬 스토리지 플래그

```typescript
// 상세 페이지에서 편집 버튼 클릭 시
const handleEdit = () => {
  localStorage.setItem('meeting-minute-edit-refresh', params.id)
  router.push(`/admin/meeting-minutes/${params.id}/edit`)
}

// 편집 페이지
useEffect(() => {
  const shouldRefresh = localStorage.getItem('meeting-minute-edit-refresh')
  if (shouldRefresh === params.id) {
    localStorage.removeItem('meeting-minute-edit-refresh')
    // 강제 리로드
  }

  setMounted(true)
  // ... 기존 로직
}, [])
```

**장점**:
- URL 파라미터 불필요

**단점**:
- 로컬 스토리지 의존
- 복잡도 증가
- 여러 탭에서 오동작 가능

---

## 🎯 권장 솔루션: Solution 1 (URL Query Parameter)

### 구현 상세

#### 1. 상세 페이지 수정 (page.tsx Line 60-62)

```typescript
// ❌ 현재
const handleEdit = () => {
  router.push(`/admin/meeting-minutes/${params.id}/edit`)
}

// ✅ 개선
const handleEdit = () => {
  const timestamp = Date.now()
  router.push(`/admin/meeting-minutes/${params.id}/edit?refresh=${timestamp}`)
}
```

#### 2. 편집 페이지 수정 (edit/page.tsx)

**Import 추가 (Line 7)**:
```typescript
// Before:
import { useRouter } from 'next/navigation'

// After:
import { useRouter, useSearchParams } from 'next/navigation'
```

**변수 추가 (Line 32)**:
```typescript
const searchParams = useSearchParams()
const refresh = searchParams.get('refresh')
```

**useEffect 의존성 수정 (Line 53-61)**:
```typescript
// Before:
useEffect(() => {
  setMounted(true)
  const initializeData = async () => {
    await loadBusinessesAndEmployees()
    await loadMeetingMinute()
  }
  initializeData()
}, [])

// After:
useEffect(() => {
  setMounted(true)
  const initializeData = async () => {
    await loadBusinessesAndEmployees()
    await loadMeetingMinute()
  }
  initializeData()
}, [refresh])  // refresh 파라미터 변경 시 재실행
```

**API 호출 캐시 우회 (Line 101)**:
```typescript
// Before:
const response = await fetch(`/api/meeting-minutes/${params.id}`)

// After:
const timestamp = Date.now()
const response = await fetch(`/api/meeting-minutes/${params.id}?_t=${timestamp}`)
```

---

## 📊 구현 변경 사항 요약

### 파일 1: `/app/admin/meeting-minutes/[id]/page.tsx`

**Line 60-62 수정**:
```typescript
const handleEdit = () => {
  const timestamp = Date.now()
  router.push(`/admin/meeting-minutes/${params.id}/edit?refresh=${timestamp}`)
}
```

### 파일 2: `/app/admin/meeting-minutes/[id]/edit/page.tsx`

**Line 7 수정**:
```typescript
import { useRouter, useSearchParams } from 'next/navigation'
```

**Line 32 추가**:
```typescript
const searchParams = useSearchParams()
const refresh = searchParams.get('refresh')
```

**Line 61 수정**:
```typescript
}, [refresh])  // 의존성 추가
```

**Line 101 수정**:
```typescript
const timestamp = Date.now()
const response = await fetch(`/api/meeting-minutes/${params.id}?_t=${timestamp}`)
```

---

## 🧪 테스트 시나리오

### Test Case 1: 상세 → 편집 진입
```
1. 회의록 상세 페이지 진입 (안건 3개)
2. 편집 버튼 클릭
3. URL 확인: ?refresh=1234567890 파라미터 있음 ✅
4. 편집 페이지에서 안건 3개 로드됨 ✅
```

### Test Case 2: 다중 사용자 편집 시나리오
```
1. 사용자 A: 회의록 상세 페이지 진입 (안건 3개)
2. 사용자 B: 편집 후 저장 (안건 3개 → 5개)
3. 사용자 A: 편집 버튼 클릭
4. 확인: 사용자 A도 안건 5개 로드됨 ✅ (최신 데이터)
```

### Test Case 3: 편집 취소 후 재진입
```
1. 회의록 편집 페이지 진입
2. 취소 버튼 클릭 → 상세 페이지로 이동
3. 다시 편집 버튼 클릭
4. URL 파라미터 변경됨 (?refresh=다른타임스탬프)
5. 확인: useEffect 재실행으로 최신 데이터 로드 ✅
```

### Test Case 4: 캐시 우회 검증
```
1. 브라우저 개발자 도구 Network 탭 열기
2. 편집 페이지 진입
3. API 요청 URL 확인: /api/meeting-minutes/[id]?_t=1234567890
4. 새로고침 시 타임스탬프 변경 확인
5. 캐시 사용 안 함 (항상 서버 요청) ✅
```

---

## 🔄 데이터 흐름 (개선 후)

```
상세 페이지
  ↓
"편집" 버튼 클릭 (timestamp 생성)
  ↓
URL: /edit?refresh=1234567890
  ↓
편집 페이지 마운트
  ↓
useEffect 실행 (refresh 의존성)
  ↓
loadMeetingMinute() 호출
  ↓
API: /api/meeting-minutes/[id]?_t=1234567890 (캐시 우회)
  ↓
최신 데이터 로드 ✅
  ↓
폼 필드 채우기
```

**상세 → 편집 → 상세 → 편집 반복 시**:
```
상세 페이지 (v1 데이터)
  ↓
편집 (?refresh=100) → 최신 로드 ✅
  ↓
취소 → 상세 페이지
  ↓
편집 (?refresh=200, 다른 값!) → 재로드 트리거 ✅
  ↓
최신 데이터 로드
```

---

## 🎨 UX 개선 제안

### 1. 로딩 상태 표시 개선

현재는 전체 페이지 로딩만 표시하지만, 리프레시 시에는 데이터만 갱신:

```typescript
const [refreshing, setRefreshing] = useState(false)

useEffect(() => {
  setMounted(true)
  const initializeData = async () => {
    // 초기 마운트가 아니고 refresh 파라미터가 있으면
    if (mounted && refresh) {
      setRefreshing(true)  // 리프레시 표시
    }

    await loadBusinessesAndEmployees()
    await loadMeetingMinute()

    setRefreshing(false)
  }
  initializeData()
}, [refresh])

// 렌더링
{refreshing && (
  <div className="fixed top-4 right-4 bg-blue-500 text-white px-4 py-2 rounded-lg shadow-lg">
    <div className="flex items-center gap-2">
      <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
      최신 데이터 불러오는 중...
    </div>
  </div>
)}
```

### 2. 데이터 변경 알림 (선택사항)

편집 페이지 진입 시 데이터가 업데이트되었음을 알림:

```typescript
const [dataUpdated, setDataUpdated] = useState(false)

useEffect(() => {
  if (refresh && mounted) {
    setDataUpdated(true)
    // 3초 후 알림 숨김
    setTimeout(() => setDataUpdated(false), 3000)
  }
}, [refresh])

// 렌더링
{dataUpdated && (
  <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
    <div className="flex items-center gap-2 text-blue-800">
      <CheckCircle2 className="w-5 h-5" />
      최신 데이터가 로드되었습니다.
    </div>
  </div>
)}
```

---

## 📋 구현 체크리스트

**상세 페이지 (page.tsx)**:
- [ ] Line 60-62: `handleEdit`에 타임스탬프 파라미터 추가
- [ ] 빌드 테스트

**편집 페이지 (edit/page.tsx)**:
- [ ] Line 7: `useSearchParams` import 추가
- [ ] Line 32: `searchParams` 및 `refresh` 변수 추가
- [ ] Line 61: `useEffect` 의존성에 `refresh` 추가
- [ ] Line 101: API 호출 URL에 `?_t=${timestamp}` 추가
- [ ] 빌드 테스트

**통합 테스트**:
- [ ] Test Case 1-4 모두 통과 확인
- [ ] 브라우저 개발자 도구에서 네트워크 요청 확인
- [ ] URL 파라미터 업데이트 확인
- [ ] 다중 사용자 시나리오 테스트 (가능하면)

**배포**:
- [ ] 커밋 메시지 작성
- [ ] 푸시

---

## 🔗 관련 파일

- **상세 페이지**: `/app/admin/meeting-minutes/[id]/page.tsx` (Line 60-62)
- **편집 페이지**: `/app/admin/meeting-minutes/[id]/edit/page.tsx` (Line 7, 32, 61, 101)
- **API 엔드포인트**: `/app/api/meeting-minutes/[id]/route.ts` (GET 메서드)

## 📊 영향 분석

**영향 범위**: 회의록 편집 페이지 진입 로직만 영향

**장점**:
- ✅ 항상 최신 데이터로 편집 가능
- ✅ 다중 사용자 편집 충돌 방지
- ✅ 데이터 일관성 향상
- ✅ 상세 페이지와 동일한 패턴 (일관성)
- ✅ 최소한의 코드 변경

**단점**:
- ⚠️ URL에 `?refresh=` 파라미터 노출 (미미한 단점)
- ⚠️ 매번 편집 진입 시 네트워크 요청 (필요한 동작)

**우선순위**: 🟡 Medium
- 다중 사용자 환경에서 중요
- 데이터 일관성 향상
- 간단한 수정으로 구현 가능

## 💡 추가 고려사항

### 편집 충돌 감지 (향후 개선)

Optimistic Locking 패턴 적용:

```typescript
// 회의록 데이터에 version 필드 추가
interface MeetingMinute {
  // ... 기존 필드
  version: number  // 수정마다 증가
}

// 저장 시 version 체크
const handleSave = async () => {
  const response = await fetch(`/api/meeting-minutes/${params.id}`, {
    method: 'PUT',
    body: JSON.stringify({
      ...formData,
      version: currentVersion  // 로드 시 받은 version
    })
  })

  const result = await response.json()

  if (!result.success && result.error === 'VERSION_CONFLICT') {
    // 다른 사용자가 먼저 수정함
    alert('다른 사용자가 이 회의록을 수정했습니다. 최신 데이터를 다시 불러옵니다.')
    loadMeetingMinute()  // 재로드
  }
}
```

### 자동 저장 기능 (향후 개선)

일정 시간마다 자동 저장으로 데이터 손실 방지:

```typescript
useEffect(() => {
  const autoSaveInterval = setInterval(() => {
    // 변경사항이 있으면 자동 저장 (draft 상태로)
    if (hasChanges) {
      handleAutoSave()
    }
  }, 60000)  // 1분마다

  return () => clearInterval(autoSaveInterval)
}, [hasChanges])
```
