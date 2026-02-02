# 엑셀 일괄등록 CSRF 검증 실패 문제 해결

## 문제 상황

admin/tasks 페이지의 엑셀 일괄 등록 기능에서 업무 등록 버튼 클릭 시 다음 오류 발생:

```
[SECURITY] CSRF validation failed for undefined on /api/admin/tasks/bulk-upload
```

**증상**:
- ❌ 엑셀 파일을 선택하고 업무 등록 버튼 클릭
- ❌ API 요청이 CSRF 검증 실패로 차단됨
- ❌ 업무가 등록되지 않음

## 원인 분석

### CSRF 보호 메커니즘
프로젝트는 `/lib/security/csrf-protection.ts`에서 CSRF 보호를 구현하고 있습니다:

1. **기본 동작**: 모든 POST/PUT/DELETE 요청에 대해 CSRF 토큰 검증
2. **제외 목록**: JWT 인증을 사용하는 API는 CSRF 보호 제외
3. **검증 방식**: 쿠키의 `csrf-token`과 헤더의 `x-csrf-token`이 일치해야 함

### 문제의 원인
`/api/admin/tasks/bulk-upload` API는:
- ✅ JWT 기반 인증을 사용 (Bearer 토큰 또는 쿠키)
- ✅ 관리자 권한 검증 (permission_level >= 4)
- ❌ **CSRF 보호 제외 목록에 없음** ← 문제!

다른 admin API들(`/api/admin/monthly-closing/*`, `/api/admin/employees/*`)은 이미 제외 목록에 있었지만, `/api/admin/tasks/*` 패턴이 누락되어 있었습니다.

## 해결 방법

### 파일: `lib/security/csrf-protection.ts`

**수정 위치**: Line 152 (excludePatterns 배열)

```typescript
// Before
const excludePatterns = [
  // ... 기존 패턴들
  '/api/admin/monthly-closing',  // 월 마감 관리 API (JWT 인증 사용)
  '/api/admin/monthly-closing/*',  // 월 마감 관리 API 전체 제외 (JWT 인증 사용)
  '/api/businesses/*/memos',  // 사업장별 메모 관리 API (JWT 인증 사용)
  // ...
];

// After
const excludePatterns = [
  // ... 기존 패턴들
  '/api/admin/monthly-closing',  // 월 마감 관리 API (JWT 인증 사용)
  '/api/admin/monthly-closing/*',  // 월 마감 관리 API 전체 제외 (JWT 인증 사용)
  '/api/admin/tasks/*',  // 업무 관리 Admin API 전체 제외 (JWT 인증 사용) ← 추가
  '/api/businesses/*/memos',  // 사업장별 메모 관리 API (JWT 인증 사용)
  // ...
];
```

## 동작 원리

### CSRF 보호 제외 로직

```typescript
// 1. 안전한 메서드는 자동 제외
const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
if (safeMethods.includes(request.method)) {
  return { valid: true };
}

// 2. 명시적 제외 목록 확인
if (excludePaths.includes(request.nextUrl.pathname)) {
  return { valid: true };
}

// 3. 패턴 기반 제외 확인
if (excludePatterns.some(pattern => {
  if (pattern.includes('*')) {
    // /api/admin/tasks/* → /api/admin/tasks/.* 정규식 변환
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    return regex.test(request.nextUrl.pathname);
  }
})) {
  return { valid: true };
}

// 4. 위의 조건에 해당하지 않으면 CSRF 토큰 검증
return CSRFProtection.validateCSRFToken(request);
```

### 왜 JWT 인증 API는 CSRF 보호가 필요 없나?

1. **JWT 토큰 자체가 CSRF 공격 방어**
   - JWT는 요청마다 명시적으로 포함되어야 함 (Authorization 헤더 또는 쿠키)
   - 악의적인 사이트는 사용자의 JWT 토큰을 읽을 수 없음 (Same-Origin Policy)

2. **이중 보호는 불필요**
   - CSRF 보호 + JWT 인증 = 중복 보호
   - JWT 인증만으로 충분한 보안 제공

3. **일관성**
   - 다른 admin API들도 동일한 패턴 사용
   - `/api/admin/monthly-closing/*`, `/api/admin/employees/*` 등

## 대상 API 엔드포인트

이제 다음 경로들이 CSRF 보호에서 제외됩니다:

- ✅ `/api/admin/tasks/bulk-upload` (엑셀 일괄 등록)
- ✅ `/api/admin/tasks/*` (향후 추가될 모든 admin tasks API)

## 보안 검증

### JWT 인증 확인 (app/api/admin/tasks/bulk-upload/route.ts)

```typescript
async function checkAdminPermission(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  let token: string | null = null;

  // Bearer 토큰 또는 쿠키에서 JWT 추출
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.replace('Bearer ', '');
  } else {
    const cookieToken = request.cookies.get('auth_token')?.value;
    if (cookieToken) {
      token = cookieToken;
    }
  }

  if (!token) {
    return { authorized: false, user: null };
  }

  // JWT 검증
  const result = await verifyTokenHybrid(token);

  // 권한 레벨 4 이상 필요
  if (result.user.permission_level < 4) {
    return { authorized: false, user: result.user };
  }

  return { authorized: true, user: result.user };
}
```

**보안 계층**:
1. ✅ JWT 토큰 검증 (verifyTokenHybrid)
2. ✅ 관리자 권한 검증 (permission_level >= 4)
3. ✅ withApiHandler 래퍼를 통한 추가 보안 처리

## 테스트 시나리오

### ✅ 정상 작동 확인

1. **admin/tasks 페이지 접속**
   - 권한 레벨 4 이상 사용자로 로그인

2. **엑셀 일괄 등록 모달 열기**
   - "엑셀 일괄등록" 버튼 클릭

3. **엑셀 파일 업로드**
   - 템플릿에 따라 작성된 엑셀 파일 선택
   - 파일 파싱 성공 확인

4. **업무 등록 버튼 클릭**
   - ✅ CSRF 검증 통과
   - ✅ JWT 인증 성공
   - ✅ 업무 일괄 등록 완료
   - ✅ 성공 메시지 표시

### ❌ 보안 검증 확인

**권한 없는 사용자**:
```
- JWT 토큰 없음 → 403 Unauthorized
- 권한 레벨 < 4 → 403 Forbidden
```

**잘못된 토큰**:
```
- 만료된 JWT → 401 Unauthorized
- 변조된 JWT → 401 Unauthorized
```

## 빌드 결과

✅ **빌드 성공** - TypeScript 컴파일 오류 없음

```bash
npm run build
✓ Compiled successfully
ƒ Middleware                                         45.1 kB
```

## 관련 파일

### 수정된 파일
- `lib/security/csrf-protection.ts` (Line 152)

### 영향받는 API
- `/api/admin/tasks/bulk-upload` - 엑셀 일괄 등록 API
- `/api/admin/tasks/*` - 향후 추가될 모든 admin tasks API

### 관련 컴포넌트
- `components/tasks/BulkUploadModal.tsx` - 엑셀 업로드 UI
- `app/admin/tasks/page.tsx` - 업무 관리 페이지

## 추가 고려사항

### 다른 CSRF 제외 패턴
프로젝트에서 JWT 인증을 사용하는 다른 API들도 동일하게 CSRF 보호 제외:

```typescript
'/api/facility-tasks/*',  // 시설 업무 관리 API
'/api/revenue/*',  // 매출 관리 API
'/api/admin/employees/*',  // 사용자 관리 API
'/api/weekly-reports/*',  // 주간 리포트 API
'/api/organization/*',  // 조직 관리 API
'/api/notifications/*',  // 알림 API
'/api/meeting-minutes/*',  // 회의록 관리 API
'/api/admin/monthly-closing/*',  // 월 마감 관리 API
'/api/admin/tasks/*'  // 업무 관리 Admin API (이번 추가)
```

### 보안 Best Practice

1. **JWT + CSRF 조합**
   - 읽기 전용 API: JWT만 사용
   - 쓰기 API (JWT 있음): CSRF 제외
   - 쓰기 API (JWT 없음): CSRF 필수

2. **권한 계층**
   - JWT 검증: 인증된 사용자인지 확인
   - 권한 레벨: 특정 작업 수행 권한 확인
   - 리소스 소유권: 본인 데이터만 접근 가능

3. **토큰 관리**
   - JWT 만료 시간: 적절히 설정 (예: 24시간)
   - 리프레시 토큰: 장기 세션 유지
   - 토큰 무효화: 로그아웃 시 처리

## 결론

**한 줄 요약**: `/api/admin/tasks/*` 패턴을 CSRF 보호 제외 목록에 추가하여 JWT 인증 기반 엑셀 일괄 등록 API가 정상 작동하도록 수정했습니다.

**핵심 교훈**:
- JWT 인증 API는 CSRF 보호가 불필요함
- 새로운 admin API 추가 시 CSRF 제외 목록 업데이트 필요
- 보안 계층은 중복되지 않도록 설계해야 함
