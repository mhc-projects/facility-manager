# 로그인 후 화면 멈춤 이슈 분석

## 📋 문제 상황

**발생 환경**: 배포 환경 (Production)
**증상**:
1. 로그인 성공 후 화면이 멈춤 (리다이렉트 안 됨)
2. 여러 번 반복해도 동일한 문제 발생
3. **개발자 콘솔을 열면 정상 동작** ⚠️
4. 로그인 데이터는 정상적으로 저장됨

## 🔍 근본 원인 분석

### 1. "개발자 콘솔을 열면 정상 동작"의 의미

이 증상은 **JavaScript 에러가 발생했지만 try-catch로 잡히지 않아 무한 대기 상태**에 빠졌음을 의미합니다.

**왜 콘솔을 열면 해결될까?**:
- 콘솔을 열면 → 페이지가 **일시적으로 멈춤** → JavaScript 실행 컨텍스트 리셋
- 또는 콘솔 열기로 인한 **브라우저 리플로우** → 대기 중인 타이머/Promise 재실행
- **실제 에러는 콘솔에 출력되지만 사용자는 못 봄** (콘솔 닫혀있음)

### 2. 로그인 흐름 분석

**파일**: [app/login/page.tsx:113-141](app/login/page.tsx#L113-L141)

```typescript
// 로그인 성공 후
const authResult = await emailLogin(result.data.token, result.data)

if (authResult.success) {
  setSuccessMessage('로그인되었습니다!')

  // ⚠️ 쿠키 확인 폴링 시작
  let attempts = 0
  const maxAttempts = 10  // 최대 5초 대기

  const checkCookieAndRedirect = () => {
    attempts++
    console.log(`🍪 쿠키 확인 시도 ${attempts}/${maxAttempts}`)

    // auth_ready 쿠키 확인
    const authReady = document.cookie.split('; ').find(row => row.startsWith('auth_ready='))

    if (authReady) {
      window.location.replace(redirectTo)  // ✅ 정상 리다이렉트
      return
    }

    if (attempts < maxAttempts) {
      setTimeout(checkCookieAndRedirect, 500)  // ⏳ 500ms 후 재시도
    } else {
      console.error('❌ 쿠키 설정 시간 초과')
      window.location.replace(redirectTo)  // 🆘 최후의 수단
    }
  }

  // 초기 500ms 대기 후 확인 시작
  setTimeout(checkCookieAndRedirect, 500)  // ⚠️ 첫 실행
}
```

### 3. AuthContext의 emailLogin 함수

**파일**: [contexts/AuthContext.tsx:57-86](contexts/AuthContext.tsx#L57-L86)

```typescript
const emailLogin = async (token: string, userData: any) => {
  try {
    setLoading(true);

    // 토큰 저장
    TokenManager.setToken(token);

    // 사용자 정보 설정
    setUser(userData.user);
    setPermissions(userData.permissions);
    setSocialAccounts([]);

    // 🚀 Realtime 연결 백그라운드 시작
    setTimeout(() => {
      import('@/lib/realtime-manager')
        .then(({ initializeRealtimeConnection }) => {
          initializeRealtimeConnection()
            .then(() => console.log('⚡ Realtime 연결 성공'))
            .catch((err) => console.warn('⚠️ Realtime 연결 실패:', err.message));
        })
        .catch((err) => console.warn('⚠️ Realtime 모듈 로드 실패:', err.message));
    }, 100);

    return { success: true };
  } catch (error) {
    // ... 에러 핸들링
  } finally {
    setLoading(false);  // ❌ 문제 발생 지점!
  }
};
```

### 4. 문제 발생 시퀀스

1. **로그인 API 성공** → `emailLogin()` 호출
2. **AuthContext 처리**:
   - `setLoading(true)` → 로딩 상태 시작
   - `setUser()`, `setPermissions()` → 사용자 정보 설정
   - **Realtime 연결 시작** (비동기, 100ms 후)
   - `setLoading(false)` → 로딩 상태 종료 ⚠️
3. **로그인 페이지로 돌아옴**:
   - `useEffect` 24-59번 라인 실행:
   ```typescript
   useEffect(() => {
     if (user && !authLoading) {  // ✅ user 있음, authLoading false
       // 쿠키 확인 폴링 시작
       checkCookieAndRedirect()
     }
   }, [user, authLoading, searchParams])
   ```
4. **쿠키 폴링 시작** (113-141번 라인)
5. **Realtime 연결 시도** (100ms 후):
   - `import('@/lib/realtime-manager')` → 청크 로딩
   - `initializeRealtimeConnection()` → Supabase 연결
   - **에러 발생 가능 지점**:
     - Supabase 연결 실패
     - 네트워크 타임아웃
     - 청크 로딩 실패

### 5. 두 개의 폴링 루프 충돌

**문제**: 두 곳에서 각각 쿠키 폴링이 실행됩니다!

1. **로그인 성공 후** (113-141번 라인):
   ```typescript
   const checkCookieAndRedirect = () => {
     // ... 폴링 로직
     setTimeout(checkCookieAndRedirect, 500)
   }
   setTimeout(checkCookieAndRedirect, 500)  // 첫 실행
   ```

2. **useEffect (24-59번 라인)**:
   ```typescript
   useEffect(() => {
     if (user && !authLoading) {
       const checkCookieAndRedirect = () => {
         // ... 폴링 로직
         setTimeout(checkCookieAndRedirect, 500)
       }
       setTimeout(checkCookieAndRedirect, 500)  // 첫 실행
     }
   }, [user, authLoading, searchParams])
   ```

**결과**: **2개의 독립적인 폴링 루프가 동시에 실행** ⚠️
- 각각 500ms마다 실행
- 서로 간섭 가능
- Race condition 발생

### 6. Realtime 연결 에러와 무한 대기

**lib/realtime-manager.ts의 establishConnection()**:

```typescript
private async establishConnection(): Promise<void> {
  try {
    // ...
    const subscriptionStatus = await this.channel.subscribe((status, error) => {
      switch (status) {
        case 'SUBSCRIBED':
          this.connectionState = 'connected';
          break;
        case 'CLOSED':
          this.connectionState = 'disconnected';
          break;
        case 'CHANNEL_ERROR':
          // ⚠️ 에러 처리는 있지만 catch는 없음
          break;
      }
    });
  } catch (error) {
    // ⚠️ catch에 도달하지 못할 수 있음
  }
}
```

**문제점**:
- Supabase 연결 에러 시 **Promise가 resolve되지 않고 pending 상태 유지**
- AuthContext의 `catch`는 에러를 무시(`console.warn`)
- **폴링 루프는 계속 실행되지만 리다이렉트는 안 됨**

## 🎯 화면이 멈추는 정확한 이유

### 시나리오 A: Realtime 연결 실패 + 쿠키 미설정

1. 로그인 성공
2. Realtime 연결 시도 → **실패 (또는 타임아웃)**
3. 쿠키 폴링 시작 → `auth_ready` 쿠키 없음
4. 10회 시도 (5초) → 모두 실패
5. 최후의 수단 리다이렉트 시도:
   ```typescript
   window.location.replace(redirectTo)
   ```
6. **하지만 Realtime 에러가 페이지 스크립트를 블로킹** → 리다이렉트 실행 안 됨

### 시나리오 B: 이중 폴링 루프 충돌

1. 로그인 성공 후 폴링 시작 (113번 라인)
2. `setUser()` 호출 → useEffect 트리거 (24번 라인)
3. **두 번째 폴링도 시작**
4. 첫 번째 폴링이 리다이렉트 시도 → `window.location.replace()`
5. 하지만 두 번째 폴링이 **동시에 실행 중** → 페이지 상태 불일치
6. **리다이렉트 취소되거나 무시됨**

### 시나리오 C: auth_ready 쿠키가 설정되지 않음

**쿠키 설정 위치**: API `/api/auth/login`에서 설정되어야 하는데...

- 클라이언트 측에서만 쿠키 확인
- **서버에서 쿠키를 설정하지 않았을 가능성**
- 또는 쿠키 설정 후 **클라이언트로 전달 실패**

## 🔧 해결 방안

### 옵션 1: 이중 폴링 제거 (권장)

로그인 성공 후 폴링을 제거하고, useEffect의 폴링만 사용:

```typescript
// app/login/page.tsx:100-141 수정
if (result.success) {
  // AuthContext의 emailLogin 함수 호출
  const authResult = await emailLogin(result.data.token, result.data)

  if (authResult.success) {
    setSuccessMessage('로그인되었습니다!')

    // ✅ 폴링 제거! useEffect가 자동으로 처리
    // setTimeout(checkCookieAndRedirect, 500) ← 삭제
  } else {
    setError(authResult.error || '인증 처리 중 오류가 발생했습니다.')
  }
}
```

**장점**:
- 이중 폴링 문제 해결
- 코드 중복 제거
- 더 간단하고 예측 가능

### 옵션 2: Realtime 연결을 로그인 흐름에서 분리

```typescript
// contexts/AuthContext.tsx:73-83 수정
const emailLogin = async (token: string, userData: any) => {
  try {
    setLoading(true);

    // 토큰 저장
    TokenManager.setToken(token);

    // 사용자 정보 설정
    setUser(userData.user);
    setPermissions(userData.permissions);
    setSocialAccounts([]);

    // ✅ Realtime 연결을 완전히 분리 (로그인 후 페이지에서 처리)
    // setTimeout(() => { ... }) ← 삭제

    return { success: true };
  } finally {
    setLoading(false);
  }
};
```

**다른 페이지 (예: layout.tsx)에서 Realtime 연결**:
```typescript
useEffect(() => {
  if (user && !loading) {
    // 로그인 완료 후 Realtime 연결
    initializeRealtimeConnection();
  }
}, [user, loading]);
```

### 옵션 3: 쿠키 의존성 제거

`auth_ready` 쿠키에 의존하지 않고, `emailLogin` 성공 시 즉시 리다이렉트:

```typescript
const authResult = await emailLogin(result.data.token, result.data)

if (authResult.success) {
  setSuccessMessage('로그인되었습니다!')

  // ✅ 즉시 리다이렉트 (쿠키 폴링 제거)
  const redirectTo = searchParams?.get('redirect') || '/'

  // 약간의 딜레이로 성공 메시지 표시
  setTimeout(() => {
    window.location.replace(redirectTo)
  }, 500)
}
```

### 옵션 4: 에러 바운더리 추가

Realtime 연결 에러가 페이지를 블로킹하지 않도록:

```typescript
// lib/realtime-manager.ts
async initializeConnection(): Promise<void> {
  try {
    // ... 연결 로직
  } catch (error) {
    console.error('Realtime 연결 실패:', error);
    // ✅ 에러를 던지지 않고 무시
    this.connectionState = 'disconnected';
    this.connectionError = error.message;
    return;  // 조용히 실패
  }
}
```

## 💡 권장 수정 사항 (조합)

### 1. 이중 폴링 제거

```typescript
// app/login/page.tsx
const handleEmailLogin = async (e: React.FormEvent) => {
  e.preventDefault()
  setLoading(true)
  setError(null)

  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData),
      credentials: 'same-origin',
    })

    const result = await response.json()

    if (result.success) {
      const authResult = await emailLogin(result.data.token, result.data)

      if (authResult.success) {
        setSuccessMessage('로그인되었습니다!')
        // ✅ useEffect가 처리하도록 위임
      } else {
        setError(authResult.error || '인증 처리 중 오류가 발생했습니다.')
      }
    } else {
      // 에러 처리...
    }
  } catch (error) {
    console.error('로그인 오류:', error)
    setError('로그인 처리 중 오류가 발생했습니다.')
  } finally {
    setLoading(false)
  }
}
```

### 2. useEffect 폴링 타임아웃 추가

```typescript
useEffect(() => {
  if (user && !authLoading) {
    const redirectTo = searchParams?.get('redirect') || '/'
    console.log('✅ 이미 로그인됨, 쿠키 확인 후 리다이렉트:', redirectTo)

    let attempts = 0
    const maxAttempts = 10
    let timeoutId: NodeJS.Timeout | null = null

    const checkCookieAndRedirect = () => {
      attempts++
      console.log(`🍪 쿠키 확인 시도 ${attempts}/${maxAttempts}`)

      const authReady = document.cookie.split('; ').find(row => row.startsWith('auth_ready='))

      if (authReady) {
        console.log('✅ 쿠키 확인 완료, 안전한 리다이렉트:', redirectTo)
        window.location.replace(redirectTo)
        return
      }

      if (attempts < maxAttempts) {
        timeoutId = setTimeout(checkCookieAndRedirect, 500)
      } else {
        console.error('❌ 쿠키 설정 시간 초과, 강제 리다이렉트')
        window.location.replace(redirectTo)
      }
    }

    timeoutId = setTimeout(checkCookieAndRedirect, 500)

    // ✅ 클린업 함수 추가
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
    }
  }
}, [user, authLoading, searchParams])
```

### 3. Realtime 연결 에러 처리 강화

```typescript
// contexts/AuthContext.tsx
const emailLogin = async (token: string, userData: any) => {
  try {
    setLoading(true);

    TokenManager.setToken(token);
    setUser(userData.user);
    setPermissions(userData.permissions);
    setSocialAccounts([]);

    console.log('✅ [AUTH-CONTEXT] 일반 로그인 성공');

    // ✅ Realtime 연결을 try-catch로 완전히 격리
    setTimeout(() => {
      import('@/lib/realtime-manager')
        .then(({ initializeRealtimeConnection }) => {
          // ✅ 타임아웃 설정 (5초)
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Realtime 연결 타임아웃')), 5000)
          );

          Promise.race([initializeRealtimeConnection(), timeoutPromise])
            .then(() => console.log('⚡ Realtime 연결 성공'))
            .catch((err) => {
              console.warn('⚠️ Realtime 연결 실패 (무시):', err.message);
              // ✅ 에러를 무시하고 계속 진행
            });
        })
        .catch((err) => console.warn('⚠️ Realtime 모듈 로드 실패 (무시):', err.message));
    }, 100);

    return { success: true };
  } catch (error) {
    console.error('[AUTH-CONTEXT] 일반 로그인 실패:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '로그인 처리 실패'
    };
  } finally {
    setLoading(false);
  }
};
```

## 📊 테스트 시나리오

1. **정상 로그인 테스트**:
   - [ ] 로그인 → 성공 메시지 → 리다이렉트
   - [ ] 콘솔 확인: Realtime 연결 성공 로그

2. **네트워크 오프라인 테스트**:
   - [ ] 개발자 도구 → Network → Offline
   - [ ] 로그인 → Realtime 연결 실패해도 리다이렉트 정상

3. **연속 로그인 테스트**:
   - [ ] 로그인 → 로그아웃 → 재로그인
   - [ ] 이중 폴링 없이 정상 동작

4. **쿠키 없는 환경 테스트**:
   - [ ] 쿠키 차단 → 로그인
   - [ ] 5초 후 강제 리다이렉트 정상 동작

## 🔗 관련 파일

- [app/login/page.tsx:24-59](app/login/page.tsx#L24-L59) - useEffect 폴링
- [app/login/page.tsx:113-141](app/login/page.tsx#L113-L141) - 로그인 성공 후 폴링
- [contexts/AuthContext.tsx:57-86](contexts/AuthContext.tsx#L57-L86) - emailLogin 함수
- [lib/realtime-manager.ts](lib/realtime-manager.ts) - Realtime 연결 관리

## 📌 결론

이 문제는 **이중 폴링 루프 + Realtime 연결 에러 + 에러 핸들링 부재**의 조합으로 발생합니다.

**핵심 원인**:
1. 로그인 성공 후 폴링과 useEffect 폴링이 **동시 실행** (이중 폴링)
2. Realtime 연결 실패 시 **에러가 조용히 무시되지만 페이지 블로킹**
3. `auth_ready` 쿠키가 설정되지 않으면 **무한 대기**

**해결책**:
- 이중 폴링 제거
- Realtime 연결 타임아웃 및 에러 격리
- 폴링 클린업 함수 추가
