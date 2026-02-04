# 회의록 상세 페이지 실시간 업데이트 설계

## 🐛 문제 현상

**보고**: admin/meeting-minutes/[id] 상세 페이지에서 편집 후 저장 시 변경사항이 즉시 반영되지 않음

**영향 범위**:
- 완료 상태 (status) 변경
- 안건 (agenda) 추가/수정/삭제
- 사업장별 이슈 (business_issues) 추가/수정/삭제
- 회의 요약 (summary) 수정

## 🔍 원인 분석

### 현재 동작 흐름

```
편집 페이지 (edit/page.tsx)
  ↓ 수정 완료 후 저장
PUT /api/meeting-minutes/[id]
  ↓ 성공 응답
router.push(`/admin/meeting-minutes/${params.id}`)  ← Line 285
router.refresh()  ← Line 286
  ↓
상세 페이지 (page.tsx) 마운트
  ↓
useEffect(() => { loadMeetingMinute() }, [])  ← Line 32
```

### 근본 원인

**❌ 문제 1: router.refresh()의 타이밍 이슈**
- `router.push()` 직후 `router.refresh()` 호출
- push가 완료되기 전에 refresh 실행
- 상세 페이지가 마운트되기 전 캐시 갱신으로 효과 없음

**❌ 문제 2: useEffect 의존성 배열 부재**
- `useEffect(() => { loadMeetingMinute() }, [])`는 초기 마운트 시에만 실행
- URL이나 다른 상태 변화 시 재실행 안 됨
- 편집 → 상세 페이지 전환 시 새로운 데이터 fetch 안 함

**❌ 문제 3: Next.js 라우터 캐시**
- `cache: 'no-store'` 설정했지만 (Line 40)
- Next.js의 클라이언트 라우터 캐시는 별도 처리 필요
- 같은 경로로 돌아갈 때 캐시된 컴포넌트 재사용

**❌ 문제 4: 페이지 간 상태 공유 없음**
- 편집 페이지와 상세 페이지가 독립적으로 데이터 관리
- 편집 완료 시 상세 페이지에 변경 사실 전달 안 됨

## ✅ 해결 방안

### Solution 1: URL Query Parameter로 새로고침 트리거 (권장)

**원리**: URL에 타임스탬프 추가 → useEffect 의존성으로 감지 → 자동 재로딩

#### 편집 페이지 수정 (edit/page.tsx Line 285-286)

```typescript
// ❌ 현재 (동작 안 함)
router.push(`/admin/meeting-minutes/${params.id}`)
router.refresh()

// ✅ 개선 (타임스탬프 파라미터 추가)
const timestamp = Date.now()
router.push(`/admin/meeting-minutes/${params.id}?updated=${timestamp}`)
```

#### 상세 페이지 수정 (page.tsx)

```typescript
// ❌ 현재 (의존성 없음)
useEffect(() => {
  setMounted(true)
  loadMeetingMinute()
}, [])

// ✅ 개선 (searchParams 의존성 추가)
import { useSearchParams } from 'next/navigation'

export default function MeetingMinuteDetailPage({ params }: { params: { id: string } }) {
  const searchParams = useSearchParams()
  const updated = searchParams.get('updated')  // 타임스탬프 감지

  useEffect(() => {
    setMounted(true)
    loadMeetingMinute()
  }, [updated])  // updated 변경 시 재실행

  // ... 기존 코드
}
```

**장점**:
- 간단한 구현 (2줄 수정)
- Next.js 라우터 캐시 우회
- URL 변화로 명확한 재로딩 트리거
- 디버깅 용이 (URL에서 업데이트 확인 가능)

**단점**:
- URL에 불필요한 파라미터 노출 (미미함)

---

### Solution 2: Router Events + Force Reload

**원리**: 라우터 이벤트 감지 → 강제 데이터 리로드

#### 상세 페이지 수정

```typescript
import { useRouter, usePathname } from 'next/navigation'

export default function MeetingMinuteDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    // 페이지 진입 시마다 강제 리로드
    const handleRouteChange = () => {
      console.log('[MEETING-MINUTE] Route changed, reloading...')
      loadMeetingMinute()
    }

    // 초기 로드
    setMounted(true)
    loadMeetingMinute()

    // 라우터 이벤트 리스너는 Next.js 13 App Router에서 직접 지원 안 함
    // pathname 변화 감지로 대체
    return () => {
      // cleanup
    }
  }, [pathname])  // pathname 의존성
}
```

**장점**:
- URL 파라미터 불필요

**단점**:
- Next.js 13+ App Router에서 라우터 이벤트 API 제한적
- pathname이 같을 때 감지 어려움

---

### Solution 3: window.location.href 강제 새로고침

**원리**: 전체 페이지 새로고침으로 완전한 데이터 갱신

#### 편집 페이지 수정

```typescript
// ❌ 현재
router.push(`/admin/meeting-minutes/${params.id}`)
router.refresh()

// ✅ 개선
window.location.href = `/admin/meeting-minutes/${params.id}`
```

**장점**:
- 가장 확실한 방법
- 모든 캐시 무효화
- 구현 극히 간단

**단점**:
- 전체 페이지 리로드 (성능 저하)
- 사용자 경험 약간 저하 (깜빡임)
- SPA 장점 상실

---

### Solution 4: 편집 완료 시 데이터 직접 전달

**원리**: 편집 완료된 데이터를 상세 페이지로 직접 전달

#### 1. 편집 페이지에서 데이터 반환

```typescript
const handleSave = async () => {
  // ... 기존 저장 로직

  if (result.success) {
    alert('회의록이 수정되었습니다.')

    // 수정된 데이터를 state로 전달
    router.push(
      `/admin/meeting-minutes/${params.id}`,
      { state: { updatedData: result.data } }  // ❌ Next.js App Router에서 미지원
    )
  }
}
```

**문제**: Next.js App Router는 `router.push`에서 state 전달 미지원

#### 2. 로컬 스토리지 활용

```typescript
// 편집 페이지
const handleSave = async () => {
  if (result.success) {
    // 로컬 스토리지에 업데이트 플래그 저장
    localStorage.setItem('meeting-minute-updated', params.id)
    router.push(`/admin/meeting-minutes/${params.id}`)
  }
}

// 상세 페이지
useEffect(() => {
  const wasUpdated = localStorage.getItem('meeting-minute-updated')
  if (wasUpdated === params.id) {
    localStorage.removeItem('meeting-minute-updated')
    loadMeetingMinute()  // 강제 리로드
  }
}, [])
```

**장점**:
- 명확한 업데이트 신호

**단점**:
- 로컬 스토리지 의존
- 여러 탭에서 오동작 가능

---

## 🎯 권장 솔루션: Solution 1 + Solution 3 조합

### 구현 전략

**편집 페이지 (edit/page.tsx)**:
```typescript
const handleSave = async () => {
  try {
    const response = await fetch(`/api/meeting-minutes/${params.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData)
    })
    const result = await response.json()

    if (result.success) {
      alert('회의록이 수정되었습니다.')

      // 🎯 해결책: 타임스탬프 파라미터 추가
      const timestamp = Date.now()
      router.push(`/admin/meeting-minutes/${params.id}?updated=${timestamp}`)
    } else {
      alert(`수정 실패: ${result.error}`)
    }
  } catch (error) {
    console.error('[MEETING-MINUTE] Update error:', error)
    alert('회의록 수정에 실패했습니다.')
  }
}
```

**상세 페이지 (page.tsx)**:
```typescript
'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
// ... 기타 imports

export default function MeetingMinuteDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const updated = searchParams.get('updated')  // 🎯 타임스탬프 감지

  const [mounted, setMounted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [minute, setMinute] = useState<MeetingMinute | null>(null)

  useEffect(() => {
    setMounted(true)
    loadMeetingMinute()
  }, [updated])  // 🎯 updated 파라미터 변경 시 재실행

  const loadMeetingMinute = async () => {
    try {
      setLoading(true)

      // 🎯 캐시 우회: 타임스탬프 추가
      const timestamp = Date.now()
      const response = await fetch(
        `/api/meeting-minutes/${params.id}?_t=${timestamp}`,
        { cache: 'no-store' }
      )
      const result = await response.json()

      if (result.success) {
        setMinute(result.data)
      } else {
        console.error('[MEETING-MINUTE] Load failed:', result.error)
        alert('회의록을 불러오는데 실패했습니다.')
        router.push('/admin/meeting-minutes')
      }
    } catch (error) {
      console.error('[MEETING-MINUTE] Load error:', error)
      alert('회의록을 불러오는데 실패했습니다.')
      router.push('/admin/meeting-minutes')
    } finally {
      setLoading(false)
    }
  }

  // ... 나머지 코드 동일
}
```

---

## 📊 구현 변경 사항 요약

### 파일 1: `/app/admin/meeting-minutes/[id]/edit/page.tsx`

**Line 285 수정**:
```typescript
// Before:
router.push(`/admin/meeting-minutes/${params.id}`)
router.refresh()

// After:
const timestamp = Date.now()
router.push(`/admin/meeting-minutes/${params.id}?updated=${timestamp}`)
```

### 파일 2: `/app/admin/meeting-minutes/[id]/page.tsx`

**Import 추가 (Line 6)**:
```typescript
import { useRouter, useSearchParams } from 'next/navigation'  // useSearchParams 추가
```

**상태 및 변수 추가 (Line 25)**:
```typescript
const searchParams = useSearchParams()
const updated = searchParams.get('updated')
```

**useEffect 의존성 수정 (Line 30-33)**:
```typescript
// Before:
useEffect(() => {
  setMounted(true)
  loadMeetingMinute()
}, [])

// After:
useEffect(() => {
  setMounted(true)
  loadMeetingMinute()
}, [updated])  // updated 의존성 추가
```

**API 호출 캐시 우회 (Line 39)**:
```typescript
// Before:
const response = await fetch(`/api/meeting-minutes/${params.id}`, {
  cache: 'no-store'
})

// After:
const timestamp = Date.now()
const response = await fetch(
  `/api/meeting-minutes/${params.id}?_t=${timestamp}`,
  { cache: 'no-store' }
)
```

---

## 🧪 테스트 시나리오

### Test Case 1: 상태 변경 (draft → completed)
```
1. 회의록 상세 페이지 진입 (status: draft)
2. 편집 버튼 클릭 → 편집 페이지로 이동
3. 상태를 '완료'로 변경 후 저장
4. 자동으로 상세 페이지로 이동
5. 확인: 상태 배지가 '완료' (초록색)로 즉시 표시 ✅
```

### Test Case 2: 안건 추가
```
1. 회의록 상세 페이지 진입 (안건 2개)
2. 편집 페이지에서 안건 1개 추가 (총 3개)
3. 저장 후 상세 페이지로 이동
4. 확인: 새로운 안건 3개 모두 즉시 표시 ✅
```

### Test Case 3: 사업장별 이슈 수정
```
1. 회의록 상세 페이지 진입 (이슈 1개, 미완료)
2. 편집 페이지에서 이슈 완료 처리
3. 저장 후 상세 페이지로 이동
4. 확인: 이슈 체크박스 체크됨, 완료 아이콘 표시 ✅
```

### Test Case 4: 회의 요약 수정
```
1. 회의록 상세 페이지 진입 (요약 내용: "기존 요약")
2. 편집 페이지에서 요약 내용 변경: "새로운 요약 내용"
3. 저장 후 상세 페이지로 이동
4. 확인: "새로운 요약 내용" 즉시 표시 ✅
```

### Test Case 5: 연속 편집
```
1. 회의록 상세 페이지 진입
2. 편집 → 저장 → 상세 페이지 (변경 확인) ✅
3. 다시 편집 → 저장 → 상세 페이지 (변경 확인) ✅
4. URL 파라미터 타임스탬프가 매번 갱신됨 확인
```

---

## 🔧 추가 개선 사항

### 1. 로딩 상태 개선

편집 완료 후 상세 페이지로 돌아갈 때 로딩 인디케이터 표시:

```typescript
const loadMeetingMinute = async () => {
  try {
    setLoading(true)  // 🎯 로딩 시작

    const timestamp = Date.now()
    const response = await fetch(
      `/api/meeting-minutes/${params.id}?_t=${timestamp}`,
      { cache: 'no-store' }
    )
    // ... 기존 로직
  } finally {
    setLoading(false)  // 🎯 로딩 종료
  }
}
```

### 2. Optimistic UI Update (선택사항)

편집 페이지에서 저장 전 미리 UI 업데이트:

```typescript
const handleSave = async () => {
  // Optimistic update: 즉시 UI 업데이트
  setFormData(prev => ({ ...prev, status: 'completed' }))

  try {
    const response = await fetch(...)
    // ... API 호출
  } catch (error) {
    // Rollback on error
    setFormData(originalData)
  }
}
```

### 3. 토스트 알림 (선택사항)

alert 대신 비침투적 토스트 알림:

```typescript
import { toast } from 'sonner'  // or react-hot-toast

const handleSave = async () => {
  // ... 저장 로직

  if (result.success) {
    toast.success('회의록이 수정되었습니다.', {
      duration: 2000
    })
    router.push(`/admin/meeting-minutes/${params.id}?updated=${Date.now()}`)
  } else {
    toast.error(`수정 실패: ${result.error}`)
  }
}
```

---

## 📋 구현 체크리스트

**편집 페이지 (edit/page.tsx)**:
- [ ] Line 285: `router.push`에 타임스탬프 파라미터 추가
- [ ] Line 286: `router.refresh()` 제거 (불필요)
- [ ] 빌드 테스트

**상세 페이지 (page.tsx)**:
- [ ] Line 6: `useSearchParams` import 추가
- [ ] Line 25: `searchParams` 및 `updated` 변수 추가
- [ ] Line 32: `useEffect` 의존성에 `updated` 추가
- [ ] Line 39: API 호출 URL에 `?_t=${timestamp}` 추가
- [ ] 빌드 테스트

**통합 테스트**:
- [ ] Test Case 1-5 모두 통과 확인
- [ ] 브라우저 개발자 도구에서 네트워크 요청 확인
- [ ] URL 파라미터 업데이트 확인
- [ ] 성능 이슈 없는지 확인

**배포**:
- [ ] 커밋 메시지 작성
- [ ] 푸시

---

## 🎨 UX 개선 고려사항

### 전환 애니메이션

```typescript
// 상세 페이지 컴포넌트에 애니메이션 추가
<div className="animate-fadeIn">
  {/* 회의록 내용 */}
</div>

// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' }
        }
      },
      animation: {
        fadeIn: 'fadeIn 0.3s ease-in-out'
      }
    }
  }
}
```

### 변경 하이라이트

수정된 필드를 일시적으로 하이라이트:

```typescript
const [highlightedFields, setHighlightedFields] = useState<string[]>([])

useEffect(() => {
  if (updated) {
    // 변경된 필드 하이라이트 (3초 후 제거)
    setHighlightedFields(['status', 'agenda', 'summary'])
    setTimeout(() => setHighlightedFields([]), 3000)
  }
}, [updated])

// 렌더링 시
<div className={highlightedFields.includes('status') ? 'bg-yellow-100 transition-colors duration-1000' : ''}>
  {/* 상태 배지 */}
</div>
```

---

## 🔗 관련 파일

- **편집 페이지**: `/app/admin/meeting-minutes/[id]/edit/page.tsx` (Line 285-286)
- **상세 페이지**: `/app/admin/meeting-minutes/[id]/page.tsx` (Line 6, 25, 30-33, 39)
- **API 엔드포인트**: `/app/api/meeting-minutes/[id]/route.ts` (GET 메서드)

## 📊 영향 분석

**영향 범위**: 회의록 상세/편집 페이지만 영향

**장점**:
- ✅ 사용자가 수정 내용을 즉시 확인 가능
- ✅ 데이터 일관성 향상
- ✅ 최소한의 코드 변경 (3-4줄)
- ✅ 성능 영향 미미

**단점**:
- ⚠️ URL에 `?updated=` 파라미터 노출 (미미한 단점)

**우선순위**: 🔴 High
- 핵심 기능의 UX 문제
- 사용자 혼란 초래
- 간단한 수정으로 해결 가능
