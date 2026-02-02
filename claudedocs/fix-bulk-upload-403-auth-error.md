# 엑셀 일괄등록 403 인증 오류 수정

## 문제 상황

admin/tasks 페이지의 엑셀 일괄 등록 기능에서 업무 등록 버튼 클릭 시 다음 오류 발생:

**서버 로그**:
```
POST /api/admin/tasks/bulk-upload 403 in 87ms
```

**브라우저 로그**:
```
BulkUploadModal.tsx:208  POST http://localhost:3000/api/admin/tasks/bulk-upload 403 (Forbidden)
Upload error: Error: 업로드 실패
```

**증상**:
- ❌ 엑셀 파일 파싱은 성공
- ❌ API 요청이 403 Forbidden으로 차단됨
- ❌ 업무가 등록되지 않음

## 원인 분석

### API 인증 요구사항
`/app/api/admin/tasks/bulk-upload/route.ts`는 **권한 레벨 4 이상**을 요구합니다:

```typescript
// Line 14-55
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
    return { authorized: false, user: null }; // ← 문제!
  }

  // JWT 검증 및 권한 레벨 4 체크
  const result = await verifyTokenHybrid(token);
  if (result.user.permission_level < 4) {
    return { authorized: false, user: result.user };
  }

  return { authorized: true, user: result.user };
}
```

### 프론트엔드 문제
`components/tasks/BulkUploadModal.tsx` (Line 208-214)에서 **JWT 토큰을 전혀 보내지 않음**:

```typescript
// Before (잘못된 코드)
const response = await fetch('/api/admin/tasks/bulk-upload', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'  // ❌ Authorization 헤더 없음
  },
  body: JSON.stringify({ tasks: parsedTasks })
})
```

### 올바른 패턴
같은 페이지의 다른 API 호출 (`app/admin/tasks/page.tsx:317-324`)은 올바르게 구현되어 있음:

```typescript
// 올바른 패턴
const token = TokenManager.getToken()
const headers: HeadersInit = {
  'Content-Type': 'application/json',
}

if (token) {
  headers['Authorization'] = `Bearer ${token}`  // ✅ JWT 토큰 포함
}

const response = await fetch('/api/facility-tasks', {
  method: 'GET',
  headers
})
```

## 해결 방법

### 파일: `components/tasks/BulkUploadModal.tsx`

#### 1. TokenManager Import 추가 (Line 6)
```typescript
// Before
import { X, Upload, Download, FileSpreadsheet, AlertCircle, CheckCircle } from 'lucide-react'
import * as XLSX from 'xlsx'

// After
import { X, Upload, Download, FileSpreadsheet, AlertCircle, CheckCircle } from 'lucide-react'
import * as XLSX from 'xlsx'
import { TokenManager } from '@/lib/api-client'  // ← 추가
```

#### 2. JWT 토큰을 Authorization 헤더에 추가 (Lines 205-217)
```typescript
// Before
setIsUploading(true)

try {
  const response = await fetch('/api/admin/tasks/bulk-upload', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ tasks: parsedTasks })
  })

// After
setIsUploading(true)

try {
  const token = TokenManager.getToken()
  const headers: HeadersInit = {
    'Content-Type': 'application/json'
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const response = await fetch('/api/admin/tasks/bulk-upload', {
    method: 'POST',
    headers,
    body: JSON.stringify({ tasks: parsedTasks })
  })
```

## 동작 원리

### JWT 인증 플로우
```
1. 사용자 로그인
   ↓
2. localStorage에 auth_token 저장 (TokenManager.setToken)
   ↓
3. API 호출 시 TokenManager.getToken()으로 토큰 조회
   ↓
4. Authorization: Bearer {token} 헤더로 전송
   ↓
5. 서버에서 JWT 검증 (verifyTokenHybrid)
   ↓
6. 권한 레벨 확인 (permission_level >= 4)
   ↓
7. 인증 성공 → 업무 등록 처리 ✅
```

### TokenManager 역할
`lib/api-client.ts`에 정의된 유틸리티:

```typescript
export class TokenManager {
  private static readonly TOKEN_KEY = 'auth_token';

  static getToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(this.TOKEN_KEY);
  }

  static setToken(token: string): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(this.TOKEN_KEY, token);
  }

  static removeTokens(): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.REFRESH_TOKEN_KEY);
  }
}
```

## 보안 검증

### 인증 계층
1. ✅ **JWT 토큰 검증**: verifyTokenHybrid로 서명 및 만료 확인
2. ✅ **권한 레벨 검증**: permission_level >= 4 (관리자만 접근)
3. ✅ **CSRF 보호 제외**: `/api/admin/tasks/*`는 JWT로 충분히 보호됨

### 보안 Best Practice
- **Never trust client**: 서버에서 항상 JWT 재검증
- **Principle of Least Privilege**: 권한 레벨 4 이상만 접근
- **Defense in Depth**: JWT + HTTPS + 권한 검증 3중 보호

## 테스트 시나리오

### ✅ 정상 작동 확인

1. **로그인된 관리자 (권한 4 이상)**
   - 엑셀 파일 업로드
   - 업무 등록 버튼 클릭
   - ✅ JWT 토큰이 Authorization 헤더로 전송
   - ✅ 서버에서 권한 검증 통과
   - ✅ 업무 일괄 등록 성공

### ❌ 보안 검증 확인

1. **비로그인 사용자**
   - ❌ localStorage에 auth_token 없음
   - ❌ Authorization 헤더 없이 요청
   - → 403 Forbidden

2. **권한 부족 사용자 (권한 < 4)**
   - ✅ JWT 토큰은 유효
   - ❌ permission_level < 4
   - → 403 Forbidden

3. **만료된 토큰**
   - ✅ Authorization 헤더 포함
   - ❌ JWT 만료됨
   - → 401 Unauthorized

## 빌드 결과

✅ **빌드 성공** - TypeScript 컴파일 오류 없음

```bash
npm run build
✓ Compiled successfully
```

## 관련 파일

### 수정된 파일
- `components/tasks/BulkUploadModal.tsx` (Lines 6, 205-217)

### 연관 파일 (변경 없음)
- `app/api/admin/tasks/bulk-upload/route.ts` - API 엔드포인트 (권한 검증)
- `lib/api-client.ts` - TokenManager 정의
- `lib/secure-jwt.ts` - JWT 검증 로직
- `app/admin/tasks/page.tsx` - 올바른 인증 패턴 참고

## 이전 수정 사항과의 관계

### claudedocs/fix-bulk-upload-csrf-validation.md (이전 수정)
- CSRF 보호 제외 목록에 `/api/admin/tasks/*` 추가
- JWT 인증만으로 충분한 보안 제공
- ✅ CSRF 검증은 통과하도록 수정됨

### 이번 수정 (403 인증 오류)
- **JWT 토큰 자체를 전송하지 않았던 문제** 해결
- CSRF 보호는 이미 제외되었지만, **인증 토큰이 없어서 403 발생**
- TokenManager로 JWT 토큰을 가져와 Authorization 헤더에 추가

### 전체 플로우
```
1. CSRF 보호 제외 (이전 수정) ✅
   ↓
2. JWT 토큰 전송 (이번 수정) ✅
   ↓
3. 권한 레벨 검증 (기존 로직) ✅
   ↓
4. 업무 등록 성공 ✅
```

## 결론

**한 줄 요약**: 프론트엔드에서 JWT 인증 토큰을 Authorization 헤더로 전송하지 않아 403 오류가 발생했으며, TokenManager를 사용하여 토큰을 포함하도록 수정했습니다.

**핵심 교훈**:
- 관리자 API 호출 시 반드시 JWT 토큰을 포함해야 함
- TokenManager.getToken()으로 토큰 조회 → Authorization 헤더 추가
- 기존 코드 패턴을 참고하여 일관성 유지 필수
- CSRF 보호와 JWT 인증은 별개의 보안 계층임

**보안 체크리스트**:
- ✅ JWT 토큰 전송 (Authorization: Bearer)
- ✅ 서버에서 JWT 검증 (verifyTokenHybrid)
- ✅ 권한 레벨 검증 (permission_level >= 4)
- ✅ CSRF 보호 제외 (JWT로 충분)
- ✅ HTTPS 전송 (프로덕션 환경)
