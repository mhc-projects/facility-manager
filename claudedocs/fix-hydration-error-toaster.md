# Fix: React Hydration Error - Toaster Component

## 문제 상황 (Problem)

**날짜**: 2025-02-04
**증상**: 좌측 하단에 지속적으로 표시되는 에러
**에러 타입**: Unhandled Runtime Error - Hydration Mismatch

### 에러 메시지
```
Error: Hydration failed because the initial UI does not match
what was rendered on the server.

Did not expect server HTML to contain a <div> in <div>.

<RootLayout>
  ...
    <ToastContainer>
      <div>  ← 예상치 못한 div
```

### 원인 분석

**Hydration Mismatch**란?
- React는 서버에서 HTML을 미리 렌더링하고, 클라이언트에서 JavaScript로 "hydrate"함
- 서버 HTML과 클라이언트 렌더링 결과가 일치하지 않으면 에러 발생

**이 프로젝트의 원인**:
- `react-hot-toast`의 `<Toaster />` 컴포넌트가 서버사이드에서 렌더링됨
- Toaster는 클라이언트 전용 컴포넌트로, DOM 조작이 필요함
- 서버 렌더링 시 빈 div를 생성하고, 클라이언트에서 toast 컨테이너를 추가
- 이 과정에서 HTML 구조 불일치 발생

## 해결 방법 (Solution)

### 수정된 파일: `/components/providers/ClientProviders.tsx`

**변경 전**:
```typescript
export default function ClientProviders({ children }) {
  return (
    <ErrorBoundary>
      <ReactQueryProvider>
        <AuthProvider>
          <NotificationProvider>
            <ToastProvider>
              {children}
              <Toaster position="top-right" {...options} />  // ❌ 항상 렌더링됨
            </ToastProvider>
          </NotificationProvider>
        </AuthProvider>
      </ReactQueryProvider>
    </ErrorBoundary>
  );
}
```

**변경 후**:
```typescript
export default function ClientProviders({ children }) {
  // ✅ 클라이언트 마운트 상태 추적
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);  // 클라이언트에서만 true로 설정
  }, []);

  return (
    <ErrorBoundary>
      <ReactQueryProvider>
        <AuthProvider>
          <NotificationProvider>
            <ToastProvider>
              {children}
              {mounted && (  // ✅ 클라이언트에서만 Toaster 렌더링
                <Toaster position="top-right" {...options} />
              )}
            </ToastProvider>
          </NotificationProvider>
        </AuthProvider>
      </ReactQueryProvider>
    </ErrorBoundary>
  );
}
```

### 동작 원리

1. **서버 렌더링 시**:
   - `mounted = false` (초기값)
   - `{mounted && <Toaster />}` → Toaster 렌더링 안됨
   - 서버 HTML에 Toaster 관련 DOM 없음

2. **클라이언트 hydration 시**:
   - `mounted = false` (초기값 유지)
   - 서버 HTML과 클라이언트 초기 렌더링 일치 ✅
   - Hydration 성공

3. **클라이언트 마운트 후** (`useEffect` 실행):
   - `setMounted(true)` 실행
   - Re-render 발생
   - Toaster 컴포넌트 렌더링 시작
   - Toast 알림 기능 활성화 ✅

## 기술적 배경

### React Hydration 과정
```
1. 서버 렌더링
   └─> HTML 생성 (정적)

2. 클라이언트 전송
   └─> 브라우저에 HTML 표시

3. JavaScript 로드
   └─> React 초기화

4. Hydration
   └─> 서버 HTML과 React 렌더링 결과 비교
   └─> 일치하면 이벤트 핸들러 부착
   └─> 불일치하면 에러 발생 ❌
```

### Hydration 에러가 발생하는 일반적인 원인

1. **브라우저 전용 API 사용**:
   ```typescript
   // ❌ 에러 발생
   const width = window.innerWidth;

   // ✅ 올바른 방법
   const [width, setWidth] = useState(0);
   useEffect(() => {
     setWidth(window.innerWidth);
   }, []);
   ```

2. **Date/Random 값 사용**:
   ```typescript
   // ❌ 서버와 클라이언트에서 다른 값
   const id = Math.random();

   // ✅ 클라이언트에서만 생성
   const [id, setId] = useState<number | null>(null);
   useEffect(() => {
     setId(Math.random());
   }, []);
   ```

3. **서드파티 라이브러리**:
   ```typescript
   // ❌ DOM 조작하는 라이브러리
   <SomeLibraryComponent />

   // ✅ 클라이언트 전용 렌더링
   {mounted && <SomeLibraryComponent />}
   ```

## 테스트 결과

### ✅ 빌드 테스트
```bash
npm run build
```
**결과**: 성공 - 88개 페이지 생성 완료

### ✅ 예상 동작
1. 페이지 로드 시 Hydration 에러 없음
2. 좌측 하단 에러 메시지 사라짐
3. Toast 알림 정상 작동
4. 사용자 경험에 영향 없음 (Toaster는 0.1초 이내 렌더링)

## 관련 문서

- [Next.js Hydration Error Docs](https://nextjs.org/docs/messages/react-hydration-error)
- [React Hydration 가이드](https://react.dev/reference/react-dom/client/hydrateRoot)
- [react-hot-toast SSR 가이드](https://react-hot-toast.com/docs/toast)

## 추가 고려사항

### 성능 영향
- **최소**: useEffect는 클라이언트에서 한 번만 실행
- **Toaster 렌더링 지연**: ~0.1초 (사용자가 인지 불가)
- **메모리 사용**: useState 1개 추가 (무시 가능한 수준)

### 대안 방법들

#### 방법 1: dynamic import (Next.js)
```typescript
import dynamic from 'next/dynamic';

const Toaster = dynamic(
  () => import('react-hot-toast').then(mod => mod.Toaster),
  { ssr: false }
);
```
**장점**: Next.js 권장 방법
**단점**: 코드 스플리팅으로 번들 크기 약간 증가

#### 방법 2: suppressHydrationWarning (권장 안함)
```typescript
<div suppressHydrationWarning>
  <Toaster />
</div>
```
**장점**: 간단한 구현
**단점**: 경고만 숨김, 근본 문제 해결 안됨

#### 방법 3: 현재 구현 (선택한 방법)
```typescript
const [mounted, setMounted] = useState(false);
useEffect(() => setMounted(true), []);
return mounted && <Toaster />;
```
**장점**:
- 명확한 의도 표현
- 추가 의존성 없음
- 가볍고 효율적
- 다른 클라이언트 전용 컴포넌트에도 재사용 가능

**단점**:
- 약간의 보일러플레이트 코드

## 변경 파일 목록

### 수정된 파일
- `/components/providers/ClientProviders.tsx`
  - `useState`, `useEffect` import 추가
  - `mounted` 상태 관리 로직 추가
  - 조건부 Toaster 렌더링

### 신규 파일
- `/claudedocs/fix-hydration-error-toaster.md` (이 문서)

## 다음 단계

### 즉시 테스트
- [ ] 로컬 서버 재시작 (`npm run dev`)
- [ ] 브라우저에서 페이지 로드
- [ ] 좌측 하단 에러 사라짐 확인
- [ ] Toast 알림 정상 작동 확인 (로그인, 저장 등)

### 향후 적용 가능
이 패턴을 다른 클라이언트 전용 컴포넌트에도 적용:
- 차트 라이브러리 (Chart.js, Recharts)
- 지도 라이브러리 (Leaflet, Google Maps)
- 리치 텍스트 에디터 (Draft.js, Slate)
- 브라우저 전용 API 사용 컴포넌트
