# Fix: Production Cache Issue - Gateway Data Not Showing

## Date: 2026-02-04

## 문제 요약

개발환경에서는 게이트웨이 설정이 정상 표시되지만, 배포 환경(Production)에서는 수정한 게이트웨이 데이터가 표시되지 않는 문제가 발생했습니다.

## 근본 원인 분석

### Next.js App Router 캐싱 계층 문제

Next.js App Router는 여러 계층의 캐싱을 사용하며, **Production 환경에서 더 aggressive한 캐싱**이 적용됩니다:

1. **Full Route Cache** (Server) - 정적 렌더링 결과 캐싱
2. **Data Cache** (Server) - `fetch()` 요청 결과 캐싱
3. **Router Cache** (Client) - **30초 TTL (Production)**, 0초 (Development)
4. **Request Memoization** (Server) - 동일 요청 중복 제거

### 발견된 문제점

#### 1. API 응답 헤더 누락
**File**: [app/api/air-permit/route.ts](app/api/air-permit/route.ts)

API 응답에 `Cache-Control` 헤더가 없어 브라우저와 CDN이 데이터를 캐싱:

```typescript
// 이전 (❌ 문제)
return NextResponse.json({ data: permit }, {
  headers: { 'Content-Type': 'application/json; charset=utf-8' }
});
```

#### 2. Router Cache 무효화 부재
**File**: [app/admin/air-permit/page.tsx](app/admin/air-permit/page.tsx)

클라이언트의 `cache: 'no-store'` 옵션은 **Data Cache만 무효화**하며, Router Cache는 무효화하지 않음:

```typescript
// 이전 (❌ 문제)
const response = await fetch('/api/air-permit', {
  cache: 'no-store'  // Data Cache만 무효화, Router Cache는 30초간 유지
});
```

#### 3. createSuccessResponse의 기본 캐싱 헤더
**File**: [lib/api-utils.ts](lib/api-utils.ts)

API 유틸리티 함수가 기본적으로 60초 캐싱 헤더 설정:

```typescript
// 이전 (❌ 문제)
headers: {
  'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
  'Content-Type': 'application/json; charset=utf-8'
}
```

이로 인해 Gateway 데이터가 수정되어도 최소 30초(Router Cache) + 60초(API Cache) = 최대 90초간 이전 데이터 표시

## 해결 방법

### 1. API 응답 헤더 강화

**File**: [app/api/air-permit/route.ts](app/api/air-permit/route.ts)

```typescript
// NO_CACHE_HEADERS 상수 추가
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const NO_CACHE_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
  'Pragma': 'no-cache',
  'Expires': '0'
};

// 모든 GET 응답에 적용
return NextResponse.json({ data: permit }, {
  headers: NO_CACHE_HEADERS  // ✅ 브라우저, CDN, 프록시 캐싱 완전 차단
});
```

### 2. Router Cache 무효화

**File**: [app/admin/air-permit/page.tsx](app/admin/air-permit/page.tsx)

Timestamp query parameter로 URL을 매번 unique하게 만들어 Router Cache 우회:

```typescript
// 모든 fetch 호출에 timestamp 추가
const timestamp = Date.now()
const response = await fetch(`/api/air-permit?_t=${timestamp}`, {
  cache: 'no-store'
})
```

**수정된 fetch 호출**:
- Line 316-321: `loadAirPermits()` - 대기필증 목록 조회
- Line 436-438: `loadAirPermitDetails()` - 대기필증 상세 정보 조회
- Line 526-528: `loadAllBusinesses()` - 전체 사업장 목록 조회
- Line 859-865: `handleCreate()` - 대기필증 생성
- Line 915-917: `handleDelete()` - 대기필증 삭제

### 3. API 유틸리티 함수 개선

**File**: [lib/api-utils.ts](lib/api-utils.ts)

`createSuccessResponse` 함수에 `noCache` 옵션 추가:

```typescript
export function createSuccessResponse(
  data?: any,
  message?: string,
  status: number = 200,
  options?: { noCache?: boolean }  // ✅ 캐시 제어 옵션 추가
) {
  const headers = options?.noCache
    ? {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    : {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        'Content-Type': 'application/json; charset=utf-8'
      };

  return NextResponse.json({ success: true, data, message, timestamp }, {
    status,
    headers
  });
}
```

### 4. Business List API 캐시 제거

**File**: [app/api/business-list/route.ts](app/api/business-list/route.ts)

모든 GET 응답에 `noCache: true` 옵션 적용:

```typescript
// 6개 createSuccessResponse 호출 모두 수정
return createSuccessResponse({
  businesses: businessesWithPhotoStats,
  count: businessesWithPhotoStats.length,
  metadata: { ... }
}, undefined, 200, { noCache: true });  // ✅ 캐싱 완전 차단
```

## 데이터 플로우 (수정 후)

```
사용자: 게이트웨이 IP 수정 (192.168.1.1 → 192.168.1.100)
  ↓
POST /api/air-permit/update
  ↓
DB에 즉시 반영 (192.168.1.100 저장)
  ↓
페이지 새로고침
  ↓
GET /api/air-permit?_t=1738658234567  ← ✅ Unique URL (Router Cache 우회)
  ↓
Response Headers:
  Cache-Control: no-store, no-cache, must-revalidate
  Pragma: no-cache
  Expires: 0
  ↓
브라우저/CDN 캐싱 완전 차단
  ↓
UI에 최신 데이터 표시 (192.168.1.100) ✅
```

## 수정된 파일

### API 서버 사이드

1. **[app/api/air-permit/route.ts](app/api/air-permit/route.ts)**
   - Line 6-15: NO_CACHE_HEADERS 상수 추가
   - Line 39-41: GET 응답 헤더 변경
   - Line 55-56: business별 조회 응답 헤더 변경
   - Line 74-78: 모든 GET 응답 헤더 변경

2. **[lib/api-utils.ts](lib/api-utils.ts)**
   - Line 35-63: createSuccessResponse에 noCache 옵션 추가
   - 기존 API 호환성 유지하면서 선택적 캐시 제어 가능

3. **[app/api/business-list/route.ts](app/api/business-list/route.ts)**
   - Line 11-19: NO_CACHE_HEADERS 상수 추가 (사용 안 함, 주석 참고용)
   - Line 107: includeAll=true 응답에 noCache 옵션
   - Line 141: air_permit_info 빈 결과 응답에 noCache 옵션
   - Line 216: fallback 응답에 noCache 옵션
   - Line 229: business_info 빈 결과 응답에 noCache 옵션
   - Line 288: 메인 응답에 noCache 옵션
   - Line 308: 에러 응답에 noCache 옵션

### 클라이언트 사이드

4. **[app/admin/air-permit/page.tsx](app/admin/air-permit/page.tsx)**
   - Line 316-321: loadAirPermits timestamp 추가
   - Line 436-438: loadAirPermitDetails timestamp 추가
   - Line 526-528: loadAllBusinesses timestamp 추가
   - Line 859-865: handleCreate POST timestamp 추가
   - Line 915-917: handleDelete timestamp 추가

## 테스트 결과

### Build Test
```bash
npm run build
```
✅ **Result**: 88 pages successfully built, no TypeScript errors

### 예상 동작 (Production)

1. **게이트웨이 설정 수정**:
   - Admin 페이지에서 Gateway IP 변경 (예: 192.168.1.1 → 192.168.1.100)
   - 저장 버튼 클릭

2. **즉시 반영**:
   - DB에 즉시 저장됨
   - 페이지 새로고침 시 최신 데이터 표시 ✅
   - 캐시 없음, 항상 최신 상태

3. **Admin 모달 확인**:
   - "대기필증 상세 정보" 모달에서 최신 Gateway 데이터 확인
   - 수정 즉시 반영됨

4. **다른 사용자도 즉시 확인**:
   - 다른 사용자가 페이지 접속 시 최신 데이터 표시
   - Router Cache, Browser Cache 모두 무효화됨

## 기술적 개선 사항

### Cache-Control 헤더 설명

```http
Cache-Control: no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0
```

- **no-store**: 브라우저가 응답을 저장하지 않음
- **no-cache**: 저장은 하되 매번 서버에 재검증 요청
- **must-revalidate**: 만료된 캐시는 반드시 재검증
- **proxy-revalidate**: 프록시 서버도 재검증 필요
- **max-age=0**: 즉시 만료 (0초 TTL)

### Pragma와 Expires

```http
Pragma: no-cache
Expires: 0
```

- **Pragma**: HTTP/1.0 호환성 (구형 브라우저)
- **Expires**: 0으로 설정하여 즉시 만료 처리

### Timestamp Query Parameter

```typescript
const timestamp = Date.now()
const url = `/api/air-permit?_t=${timestamp}`
```

- 매 요청마다 unique URL 생성
- Next.js Router Cache는 URL 기반으로 캐싱하므로 완전히 우회
- Development(0초 TTL)와 Production(30초 TTL) 차이 해결

## 관련 문서

- [Next.js Caching Documentation](https://nextjs.org/docs/app/building-your-application/caching)
- [fix-outlet-id-missing-in-post-api.md](fix-outlet-id-missing-in-post-api.md) - outlet_id 누락 문제
- [measurement-device-filtering-realtime-update.md](measurement-device-filtering-realtime-update.md) - 측정기기 필터링 및 실시간 반영
