# Realtime Photo Sync Analysis - business/[사업장명] 페이지

## Date: 2026-02-04

## 문제 요약

business/[사업장명] 페이지에서 사진 업로드/삭제 시 **완벽한 실시간 동기화가 작동하지 않는** 문제 발생:
- ❌ 사진 업로드 후 다른 기기에서 즉시 보이지 않음
- ❌ 사진 삭제 후 다른 기기에서 즉시 사라지지 않음
- ❌ 새로고침을 해야만 최신 사진 목록 확인 가능

## 현재 구조 분석

### 1. Supabase Realtime 구독 메커니즘

**FileContext.tsx** (Line 195-206):
```typescript
const { isConnected: realtimeConnected } = useSupabaseRealtime({
  tableName: 'uploaded_files',
  eventTypes: ['INSERT', 'UPDATE', 'DELETE'],
  autoConnect: !!businessName && !!currentBusinessId, // ⚠️ 문제 가능성
  onNotification: handleRealtimeNotification,
});
```

**구현된 기능**:
- ✅ Supabase Realtime으로 `uploaded_files` 테이블 변경 감지
- ✅ INSERT/UPDATE/DELETE 이벤트 수신
- ✅ business_id 기반 필터링 (Line 123)
- ✅ 로컬 업데이트 중복 방지 (Line 130-133)

### 2. 자동 새로고침 제거

**ImprovedFacilityPhotoSection.tsx** (Line 433-440):
```typescript
// 🚫 자동 새로고침 제거: Optimistic update로 모든 변경사항이 즉시 반영되므로 불필요
// 필요시 수동 새로고침 버튼 또는 verify-uploads 이벤트 사용
// useEffect(() => {
//   const interval = setInterval(() => {
//     loadUploadedFiles(true, true);
//   }, 30000);
//   return () => clearInterval(interval);
// }, [loadUploadedFiles]);
```

**문제점**:
- ❌ 30초 주기 자동 새로고침이 주석 처리됨
- ❌ Realtime만으로는 모든 케이스를 커버하지 못할 수 있음
- ❌ Fallback 메커니즘 부재

### 3. Realtime 필터링 로직

**FileContext.tsx** (Line 111-127):
```typescript
// DELETE 이벤트: business_id가 없으므로 로컬 배열에서 확인
if (eventType === 'DELETE') {
  const currentPhotos = getPhotosFromStore();
  const existsLocally = currentPhotos.some(f => f.id === recordId);
  if (!existsLocally) {
    console.log(`📡 [FILE-REALTIME] DELETE 무시 - 로컬에 없는 파일: ${recordId}`);
    return; // ⚠️ 다른 기기의 사진은 무시됨
  }
}

// INSERT/UPDATE: business_id로 필터링
if (!currentBusinessId || recordBusinessId !== currentBusinessId) {
  console.log(`📡 [FILE-REALTIME] 다른 사업장 이벤트 무시`);
  return; // ⚠️ business_id 불일치 시 무시
}
```

**잠재적 문제**:
1. **currentBusinessId 설정 타이밍**: 페이지 로드 시 즉시 설정되지 않으면 초기 이벤트 누락
2. **DELETE 필터링 오류**: 로컬에 없는 파일의 DELETE는 무시 (다른 기기가 업로드한 사진 삭제 시)
3. **business_id 불일치**: Realtime 이벤트의 business_id와 로컬 currentBusinessId가 다르면 무시

## 근본 원인 분석

### 🔴 Critical Issue #1: currentBusinessId 초기화 지연

**File**: [contexts/FileContext.tsx](contexts/FileContext.tsx) Line 198

```typescript
autoConnect: !!businessName && !!currentBusinessId,
```

**문제**:
- `currentBusinessId`는 API 호출 후에야 설정됨
- 페이지 로드 직후에는 `null`이므로 Realtime 연결 안 됨
- 연결되기 전에 발생한 이벤트는 영구 누락

**시나리오**:
```
1. 사용자 A: business/사업장명 페이지 접속
2. currentBusinessId = null (API 응답 대기 중)
3. autoConnect = false (연결 안 됨)
4. 사용자 B: 사진 업로드 (Realtime 이벤트 발생)
5. 사용자 A: 이벤트 수신 못 함 (연결 안 되어 있음)
6. 사용자 A: API 응답 도착, currentBusinessId 설정됨
7. autoConnect = true (이제 연결됨)
8. 사용자 A: 이전 업로드는 보이지 않음 ❌
```

### 🔴 Critical Issue #2: DELETE 이벤트 필터링 오류

**File**: [contexts/FileContext.tsx](contexts/FileContext.tsx) Line 111-120

```typescript
if (eventType === 'DELETE') {
  const currentPhotos = getPhotosFromStore();
  const existsLocally = currentPhotos.some(f => f.id === recordId);
  if (!existsLocally) {
    return; // ⚠️ 다른 기기가 업로드한 사진 삭제는 감지 못 함
  }
}
```

**문제**:
- 다른 기기(B)가 업로드한 사진을 B가 삭제
- 기기 A는 해당 사진을 로컬에 가지고 있지 않음
- DELETE 이벤트를 무시함
- 기기 A는 계속 삭제된 사진을 표시 ❌

**시나리오**:
```
1. 기기 B: 사진 업로드 (photo_123)
2. 기기 A: Realtime INSERT 수신 → 로컬에 추가 ✅
3. 기기 B: 사진 삭제 (photo_123)
4. 기기 A: Realtime DELETE 수신
5. 기기 A: existsLocally 확인 → true (있음)
6. 기기 A: 삭제 진행 ✅

BUT 만약:
1. 기기 A: 페이지 로드 후 Realtime 연결 전
2. 기기 B: 사진 업로드 후 바로 삭제
3. 기기 A: Realtime 연결됨
4. 기기 A: INSERT 이벤트 누락 (연결 전 발생)
5. 기기 A: DELETE 이벤트 수신
6. 기기 A: existsLocally 확인 → false (없음)
7. 기기 A: DELETE 무시 ✅ (올바른 동작)

결론: 현재 로직은 **일부 케이스에서는 올바르나, Realtime 연결 지연으로 인한 이벤트 누락 문제가 있음**
```

### 🟡 Important Issue #3: 자동 새로고침 Fallback 부재

**File**: [components/ImprovedFacilityPhotoSection.tsx](components/ImprovedFacilityPhotoSection.tsx) Line 433-440

**문제**:
- Realtime만으로는 100% 신뢰성 보장 어려움
- 네트워크 불안정, 연결 지연, 이벤트 누락 시 Fallback 없음
- 30초 polling이 제거되어 self-healing 메커니즘 없음

**Realtime의 한계**:
1. **네트워크 불안정**: 일시적 연결 끊김 시 이벤트 누락
2. **연결 지연**: 페이지 로드 직후 이벤트 수신 못 함
3. **순서 보장 없음**: INSERT → DELETE 순서가 뒤바뀔 수 있음
4. **재연결 시 복구 없음**: 재연결 후 누락된 이벤트 복구 안 됨

## 해결 방안

### ✅ Solution #1: businessName 기반 즉시 Realtime 연결

**currentBusinessId 대신 businessName 사용**:

```typescript
// FileContext.tsx - Line 198 수정
autoConnect: !!businessName, // ✅ 즉시 연결 (API 응답 대기 불필요)
```

**필터링 로직 수정**:

```typescript
// FileContext.tsx - Line 100-127 수정
const handleRealtimeNotification = useCallback((payload: any) => {
  const eventType = payload.eventType;
  const newRecord = payload.new;
  const oldRecord = payload.old;
  const recordId = newRecord?.id || oldRecord?.id;

  // business_name 기반 필터링 (즉시 가능)
  const recordBusinessName = newRecord?.business_name || oldRecord?.business_name;

  if (eventType === 'DELETE') {
    // DELETE는 business_name으로만 필터링 (로컬 존재 여부 체크 제거)
    // ✅ 다른 기기가 업로드한 사진 삭제도 감지
    if (recordBusinessName !== businessName) {
      console.log(`📡 [FILE-REALTIME] 다른 사업장 DELETE 무시`);
      return;
    }
    // business_name이 일치하면 무조건 삭제 진행
    rawRemoveFile(recordId);
    console.log(`📡 [FILE-REALTIME] 파일 삭제됨: ${recordId}`);
    return;
  }

  // INSERT/UPDATE: business_name 필터링
  if (recordBusinessName !== businessName) {
    console.log(`📡 [FILE-REALTIME] 다른 사업장 이벤트 무시`);
    return;
  }

  // ... 기존 로직
}, [businessName, rawAddFiles, rawRemoveFile]);
```

**장점**:
- ✅ 즉시 Realtime 연결 (API 응답 대기 불필요)
- ✅ business_name은 URL에서 즉시 획득 가능
- ✅ DELETE 필터링 간소화 및 정확도 향상

**전제 조건**:
- ⚠️ `uploaded_files` 테이블에 `business_name` 컬럼 존재 필요
- ⚠️ 모든 INSERT/UPDATE에서 business_name 설정 필요

### ✅ Solution #2: Hybrid Approach - Realtime + Polling

**Realtime을 primary로, polling을 fallback으로**:

```typescript
// ImprovedFacilityPhotoSection.tsx - Line 435-440 수정
useEffect(() => {
  // 📡 Realtime이 연결된 상태에서도 안전장치로 60초마다 검증
  const interval = setInterval(() => {
    // Realtime 연결 상태 확인
    if (!realtimeConnected) {
      console.log('⚠️ [PHOTO-SYNC] Realtime 연결 끊김 - 폴링으로 복구');
      loadUploadedFiles(true, true);
    } else {
      // Realtime 연결 정상이어도 60초마다 한 번씩 검증 (silent refresh)
      loadUploadedFiles(true, false); // forceRefresh=true, silent=false
    }
  }, 60000); // 60초 (기존 30초 → 60초로 완화)

  return () => clearInterval(interval);
}, [loadUploadedFiles, realtimeConnected]);
```

**장점**:
- ✅ Realtime 연결 끊김 시 자동 복구
- ✅ 누락된 이벤트 자동 보정 (60초 이내)
- ✅ 사용자 경험: Realtime으로 즉시 반영 + Polling으로 보정

### ✅ Solution #3: Realtime 연결 후 초기 동기화

**연결 즉시 최신 데이터 로드**:

```typescript
// FileContext.tsx - Line 200-205 수정
const { isConnected: realtimeConnected } = useSupabaseRealtime({
  tableName: 'uploaded_files',
  eventTypes: ['INSERT', 'UPDATE', 'DELETE'],
  autoConnect: !!businessName, // ✅ 즉시 연결
  onNotification: handleRealtimeNotification,
  onConnect: () => {
    console.log(`📡 [FILE-REALTIME] Realtime 연결됨 - 초기 동기화 시작`);
    // ✅ 연결 즉시 최신 데이터 로드 (연결 전 누락 이벤트 복구)
    rawRefreshFiles();
  },
  onDisconnect: () => {
    console.log(`📡 [FILE-REALTIME] Realtime 연결 해제`);
  },
});
```

**장점**:
- ✅ 연결 전 누락된 이벤트 복구
- ✅ 연결 직후 최신 상태로 동기화
- ✅ 재연결 시에도 자동 동기화

### ✅ Solution #4: Server-Sent Events (SSE) 추가 고려

**Supabase Realtime 대신 또는 함께 SSE 사용**:

```typescript
// /api/photo-stream/[businessName]/route.ts (신규)
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const businessName = searchParams.get('businessName');

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      // PostgreSQL LISTEN/NOTIFY 사용
      const client = await pool.connect();
      await client.query(`LISTEN photo_changes_${businessName}`);

      client.on('notification', (msg) => {
        const data = `data: ${JSON.stringify(msg.payload)}\n\n`;
        controller.enqueue(encoder.encode(data));
      });

      // Keep-alive
      const keepAlive = setInterval(() => {
        controller.enqueue(encoder.encode(': keep-alive\n\n'));
      }, 30000);

      request.signal.addEventListener('abort', () => {
        clearInterval(keepAlive);
        client.release();
      });
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
```

**장점**:
- ✅ Supabase 의존성 감소
- ✅ 더 안정적인 연결 (HTTP 기반)
- ✅ 재연결 자동 처리 (브라우저 기본 기능)

**단점**:
- ❌ 추가 구현 필요
- ❌ PostgreSQL LISTEN/NOTIFY 설정 필요
- ❌ 복잡도 증가

## 권장 구현 방안

### 🎯 Phase 1: 즉시 적용 가능한 개선 (Quick Win)

1. **businessName 기반 즉시 연결** (Solution #1)
   - FileContext.tsx 수정
   - autoConnect 조건 변경
   - 필터링 로직 간소화

2. **Hybrid Polling 재활성화** (Solution #2)
   - ImprovedFacilityPhotoSection.tsx 수정
   - 60초 polling 활성화
   - Realtime 상태 기반 adaptive polling

3. **onConnect 초기 동기화** (Solution #3)
   - FileContext.tsx 수정
   - 연결 직후 자동 새로고침

### 🎯 Phase 2: 장기적 개선 (Future Enhancement)

1. **SSE 구현** (Solution #4)
   - 별도 API 엔드포인트 생성
   - PostgreSQL LISTEN/NOTIFY 설정
   - Fallback chain: SSE → Realtime → Polling

2. **Optimistic Update 강화**
   - 업로드/삭제 즉시 UI 반영
   - 서버 응답 대기 없이 즉시 표시
   - 실패 시 자동 롤백

3. **Conflict Resolution**
   - 동시 업데이트 충돌 해결
   - Last-Write-Wins 전략
   - 타임스탬프 기반 정렬

## 데이터베이스 스키마 확인 필요

**uploaded_files 테이블 확인**:
```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'uploaded_files'
  AND column_name IN ('business_name', 'business_id');
```

**필요한 컬럼**:
- `business_name` (VARCHAR) - 즉시 필터링용
- `business_id` (UUID) - 정확한 필터링용
- `created_at` (TIMESTAMP) - 순서 보장용

## 테스트 시나리오

### Test Case 1: 동시 업로드
```
1. 기기 A: business/사업장1 페이지 접속
2. 기기 B: business/사업장1 페이지 접속
3. 기기 A: 사진 3장 업로드
4. ✅ 기기 B: 즉시 3장 표시되어야 함 (5초 이내)
5. 기기 B: 사진 2장 업로드
6. ✅ 기기 A: 즉시 총 5장 표시되어야 함
```

### Test Case 2: 동시 삭제
```
1. 기기 A, B: 각각 5장 사진 보유
2. 기기 A: 사진 2장 삭제
3. ✅ 기기 B: 즉시 3장으로 업데이트
4. 기기 B: 사진 1장 삭제
5. ✅ 기기 A: 즉시 2장으로 업데이트
```

### Test Case 3: Realtime 연결 지연
```
1. 기기 A: 페이지 접속 (Realtime 연결 전)
2. 기기 B: 사진 업로드 (Realtime 이벤트 발생)
3. 기기 A: Realtime 연결 완료 (1-2초 후)
4. ✅ 기기 A: onConnect에서 초기 동기화 → 사진 표시
```

### Test Case 4: 네트워크 불안정
```
1. 기기 A: 페이지 접속, Realtime 연결
2. 네트워크 일시적 끊김 (10초)
3. 기기 B: 사진 업로드 (이벤트 누락)
4. 네트워크 복구, Realtime 재연결
5. ✅ 기기 A: 60초 polling으로 자동 동기화
```

## 관련 파일

### 수정 필요 파일

1. **[contexts/FileContext.tsx](contexts/FileContext.tsx)**
   - Line 100-127: handleRealtimeNotification 필터링 로직
   - Line 195-206: useSupabaseRealtime 연결 조건
   - 필요: business_name 기반 필터링으로 변경

2. **[components/ImprovedFacilityPhotoSection.tsx](components/ImprovedFacilityPhotoSection.tsx)**
   - Line 433-440: 자동 새로고침 주석 해제 및 수정
   - 필요: 60초 hybrid polling 활성화

3. **[hooks/useSupabaseRealtime.ts](hooks/useSupabaseRealtime.ts)**
   - Line 136-201: 연결 상태 콜백
   - 필요: onConnect에서 초기 동기화 트리거

### 확인 필요 사항

1. **Database Schema**:
   - `uploaded_files.business_name` 컬럼 존재 여부
   - `uploaded_files.business_id` 컬럼 존재 여부

2. **API Endpoints**:
   - `/api/upload-supabase`: business_name 설정 여부
   - `/api/facility-photos`: business_name 기반 조회 지원 여부

## 예상 개선 효과

### Before (현재)
- ❌ 실시간 동기화: 불안정 (연결 지연, 이벤트 누락)
- ❌ 자동 복구: 없음 (새로고침 필요)
- ❌ 사용자 경험: 혼란 (왜 안 보이지?)

### After (개선 후)
- ✅ 실시간 동기화: 안정적 (즉시 연결 + 초기 동기화)
- ✅ 자동 복구: 60초 polling으로 self-healing
- ✅ 사용자 경험: 매끄러움 (즉시 반영)

## 관련 문서

- [fix-production-cache-gateway-data.md](fix-production-cache-gateway-data.md) - 캐시 문제 해결
- [hooks/useSupabaseRealtime.ts](hooks/useSupabaseRealtime.ts) - Realtime 구현
- [contexts/FileContext.tsx](contexts/FileContext.tsx) - 파일 컨텍스트
