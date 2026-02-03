# 게이트웨이 저장 후 alert 렌더링 차단 문제 해결 설계

## 1. 문제 정의

### 현상
- 게이트웨이 정보 수정 후 저장 버튼 클릭
- "변경사항이 저장되었습니다" alert 표시
- **문제**: alert 확인 후 수동으로 새로고침해야만 변경된 게이트웨이가 화면에 반영됨

### 사용자 기대
- 저장 후 alert와 **동시에** 변경된 게이트웨이가 화면에 즉시 반영
- 새로고침 불필요

## 2. 근본 원인 분석

### 2.1 현재 코드 흐름 (Line 717-758)

```typescript
// 1. 상태 업데이트 (flushSync로 동기 업데이트)
flushSync(() => {
  setPermitDetail(refreshData.data)
  setOriginalPermitDetail(refreshData.data)
  setGatewayAssignments(newAssignments)  // ✅ 게이트웨이 업데이트
  setFacilityNumbering(newNumbering)
})
console.log('✅ UI 업데이트 완료')

// 2. DOM 렌더링 완료 대기 (requestAnimationFrame 2회)
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    // 3. alert 표시 (여기서 문제 발생!)
    alert('변경사항이 저장되었습니다')
  })
})
```

### 2.2 문제의 핵심

#### ❌ alert()의 특성
```javascript
alert('메시지')  // 모달 대화상자
```

**alert 동작 방식:**
1. JavaScript 실행 **즉시 중단**
2. 브라우저 렌더링 **완전히 차단**
3. 사용자가 "확인" 클릭할 때까지 **대기**
4. 확인 후 JavaScript 실행 **재개**

**문제:**
- `flushSync()` → state 업데이트 완료
- `requestAnimationFrame()` 2회 → **이론적으로** 렌더링 완료 보장
- **그러나**: `alert()`가 표시되면 브라우저가 렌더링을 **중단**
- 결과: state는 업데이트되었지만 **화면에는 그려지지 않음**

### 2.3 실제 실행 순서

```
1. flushSync() → gatewayAssignments 업데이트 ✅
   └─ React: "리렌더링 예약"

2. requestAnimationFrame #1 예약 ⏳

3. requestAnimationFrame #2 예약 ⏳

4. [여기서 브라우저가 렌더링을 시작하려고 함]

5. alert() 실행 ❌ → 모든 것이 멈춤!
   └─ 렌더링 파이프라인 차단
   └─ 사용자: "확인" 클릭

6. alert 종료 → 브라우저 렌더링 재개
   └─ 이제야 게이트웨이가 화면에 그려짐
```

**왜 새로고침하면 보이는가?**
- 새로고침 시: DB에서 최신 데이터 조회 → 렌더링 (alert 없음)
- 저장 직후: state는 업데이트되었지만 alert가 렌더링 차단

### 2.4 requestAnimationFrame의 한계

```typescript
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    // ❌ 이 시점은 "렌더링 예약"만 완료
    // 실제 화면에 그려진 것은 아님!
    alert('변경사항이 저장되었습니다')
  })
})
```

**오해:**
- `requestAnimationFrame` 2회 = 렌더링 완료 ❌

**실제:**
- `requestAnimationFrame` 2회 = 다음 프레임 콜백 실행
- 하지만 **콜백 실행 ≠ 렌더링 완료**
- alert가 실행되면 렌더링이 **차단**됨

## 3. 해결 방안

### Option 1: Toast 알림으로 대체 (권장 ⭐)
alert 대신 비차단 방식의 Toast 알림 사용

#### 장점
- ✅ 렌더링 차단 없음
- ✅ 더 나은 UX (모던한 디자인)
- ✅ 자동 사라짐 (사용자 액션 불필요)
- ✅ 여러 알림 동시 표시 가능

#### 단점
- Toast 컴포넌트 구현 필요

#### 구현 방법

**1단계: Toast 컴포넌트 생성**
```typescript
// components/ui/Toast.tsx
'use client'

import { useEffect } from 'react'
import { X } from 'lucide-react'

interface ToastProps {
  message: string
  type?: 'success' | 'error' | 'info'
  onClose: () => void
  duration?: number
}

export function Toast({ message, type = 'success', onClose, duration = 3000 }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(onClose, duration)
    return () => clearTimeout(timer)
  }, [duration, onClose])

  const bgColor = {
    success: 'bg-green-500',
    error: 'bg-red-500',
    info: 'bg-blue-500'
  }[type]

  return (
    <div className={`fixed top-20 right-4 ${bgColor} text-white px-6 py-3 rounded-lg shadow-lg flex items-center gap-3 animate-slideIn z-50`}>
      <span>{message}</span>
      <button onClick={onClose} className="hover:opacity-80">
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}
```

**2단계: Toast 상태 관리**
```typescript
// app/admin/air-permit-detail/page.tsx

const [toast, setToast] = useState<{message: string, type: 'success' | 'error'} | null>(null)

// 저장 성공 시 (Line 755)
// alert('변경사항이 저장되었습니다')  // ❌ 제거
setToast({ message: '변경사항이 저장되었습니다', type: 'success' })  // ✅ 추가
```

**3단계: Toast UI 렌더링**
```typescript
// JSX 최상단에 추가
{toast && (
  <Toast
    message={toast.message}
    type={toast.type}
    onClose={() => setToast(null)}
  />
)}
```

### Option 2: alert 타이밍 지연 (임시 해결책)
더 긴 지연 시간으로 렌더링 보장

#### 구현 방법
```typescript
// Line 743-758 수정
flushSync(() => {
  setPermitDetail(refreshData.data)
  setOriginalPermitDetail(refreshData.data)
  setGatewayAssignments(newAssignments)
  setFacilityNumbering(newNumbering)
})

// ✅ setTimeout으로 충분한 렌더링 시간 보장 (100ms)
setTimeout(() => {
  alert('변경사항이 저장되었습니다')
}, 100)
```

#### 장점
- 최소한의 코드 변경
- 즉시 적용 가능

#### 단점
- 여전히 alert 사용 (레거시 UX)
- 렌더링 완료 보장 불가 (기기 성능 의존)
- 100ms가 충분하지 않을 수 있음

### Option 3: 무음 저장 (Silent Save)
저장 성공 시 시각적 피드백만 제공 (alert 없음)

#### 구현 방법
```typescript
// 1. 저장 상태 표시
const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

// 2. 저장 완료 후
flushSync(() => {
  setPermitDetail(refreshData.data)
  setGatewayAssignments(newAssignments)
  setSaveStatus('saved')  // ✅ 저장 완료 상태
})

// 3초 후 상태 초기화
setTimeout(() => setSaveStatus('idle'), 3000)

// 3. UI에 표시
{saveStatus === 'saved' && (
  <div className="fixed top-20 right-4 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg">
    ✅ 저장 완료
  </div>
)}
```

#### 장점
- 렌더링 차단 없음
- 간단한 구현

#### 단점
- 사용자가 놓칠 수 있음
- 중요한 피드백이 약함

## 4. 권장 구현 (Option 1: Toast)

### 4.1 구현 파일

#### 신규 파일
- `components/ui/Toast.tsx` - Toast 컴포넌트
- `styles/animations.css` - Toast 애니메이션 (선택사항)

#### 수정 파일
- `app/admin/air-permit-detail/page.tsx`
  - Line 88: Toast state 추가
  - Line 755, 784, 828: alert → setToast 변경
  - Line 853: 실패 시도 setToast 사용
  - JSX: Toast 컴포넌트 렌더링

### 4.2 상세 구현

**Toast 컴포넌트 (components/ui/Toast.tsx)**
```typescript
'use client'

import { useEffect } from 'react'
import { CheckCircle, XCircle, X } from 'lucide-react'

interface ToastProps {
  message: string
  type?: 'success' | 'error'
  onClose: () => void
  duration?: number
}

export function Toast({ message, type = 'success', onClose, duration = 3000 }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(onClose, duration)
    return () => clearTimeout(timer)
  }, [duration, onClose])

  const styles = {
    success: {
      bg: 'bg-green-500',
      icon: <CheckCircle className="w-5 h-5" />
    },
    error: {
      bg: 'bg-red-500',
      icon: <XCircle className="w-5 h-5" />
    }
  }

  const style = styles[type]

  return (
    <div
      className={`fixed top-20 right-4 ${style.bg} text-white px-6 py-3 rounded-lg shadow-lg flex items-center gap-3 z-50 transition-all duration-300 animate-slideInRight`}
      role="alert"
    >
      {style.icon}
      <span className="font-medium">{message}</span>
      <button
        onClick={onClose}
        className="hover:opacity-80 transition-opacity"
        aria-label="닫기"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}
```

**Toast State (app/admin/air-permit-detail/page.tsx Line 88)**
```typescript
const [toast, setToast] = useState<{message: string, type: 'success' | 'error'} | null>(null)
```

**저장 성공 시 (Line 755, 784, 828)**
```typescript
// ❌ 기존
alert('변경사항이 저장되었습니다')

// ✅ 변경
setToast({ message: '변경사항이 저장되었습니다', type: 'success' })
```

**저장 실패 시 (Line 853)**
```typescript
// ❌ 기존
alert('저장에 실패했습니다')

// ✅ 변경
setToast({ message: '저장에 실패했습니다', type: 'error' })
```

**Toast 렌더링 (JSX 최상단)**
```typescript
{toast && (
  <Toast
    message={toast.message}
    type={toast.type}
    onClose={() => setToast(null)}
  />
)}
```

**Tailwind 애니메이션 (tailwind.config.ts)**
```typescript
module.exports = {
  theme: {
    extend: {
      keyframes: {
        slideInRight: {
          '0%': { transform: 'translateX(100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' }
        }
      },
      animation: {
        slideInRight: 'slideInRight 0.3s ease-out'
      }
    }
  }
}
```

## 5. 테스트 시나리오

### 테스트 1: 게이트웨이 저장 후 즉시 반영
1. 게이트웨이 변경 (Gateway 1 → Gateway 2)
2. 저장 버튼 클릭
3. **예상 결과**:
   - Toast "변경사항이 저장되었습니다" 즉시 표시
   - **동시에** 게이트웨이 "Gateway 2" 화면에 즉시 반영
   - 배출구 배경색도 Gateway 2 색상으로 즉시 변경
   - 3초 후 Toast 자동 사라짐

### 테스트 2: 저장 실패 시 Toast
1. 네트워크 끊기 (개발자 도구 → Offline)
2. 게이트웨이 변경 후 저장
3. **예상 결과**:
   - Toast "저장에 실패했습니다" 빨간색으로 표시
   - 게이트웨이 원래 값으로 롤백
   - 3초 후 Toast 자동 사라짐

### 테스트 3: 연속 저장 시 Toast 누적
1. 게이트웨이 변경 후 저장
2. 즉시 다른 게이트웨이 변경 후 저장
3. **예상 결과**:
   - 두 번째 Toast가 첫 번째 Toast를 대체
   - 화면에 하나의 Toast만 표시

## 6. 구현 우선순위

### High Priority (즉시 구현)
✅ **Option 1: Toast 알림 시스템**
- 근본적 해결책
- 최고의 UX
- 렌더링 차단 완전 제거

### Low Priority (필요시)
- Option 2: alert 타이밍 지연 (임시 해결책, 권장하지 않음)
- Option 3: 무음 저장 (피드백 부족)

## 7. 결론

### 문제 요약
- **원인**: `alert()`가 브라우저 렌더링을 차단
- **증상**: state는 업데이트되지만 화면에 반영 안 됨
- **해결**: Toast 알림으로 대체 (비차단 방식)

### 권장 해결책
**Toast 알림 시스템 구현** - 렌더링 차단 없는 현대적 UX

**구현 시간**: 약 30분
**파일 수정**: 3개 (Toast.tsx 신규, page.tsx 수정, tailwind.config.ts 수정)
**효과**: 즉각적인 UI 반영 + 더 나은 사용자 경험
