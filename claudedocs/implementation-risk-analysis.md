# 실시간 동기화 구현 시 발생 가능한 문제점 분석

## 📋 분석 개요

제안된 모든 구현 단계를 진행했을 때 발생할 수 있는 잠재적 문제들을 체계적으로 분석한 문서입니다.

**분석 범위**:
- Phase 1: 안전한 부분 (1.5시간)
- Phase A: 필수 최적화 (2-3주)
- Phase B: 중요 최적화 (2-3주)
- Phase C: 개선 최적화 (1-2주)

---

## 🚨 Phase 1: 안전한 부분 구현 시 문제들

### 1.1 Connection Timing 최적화

**변경 내용**: `autoConnect: !!businessName && !!currentBusinessId`

**문제점 1: 연결 지연**
```
심각도: 🟡 낮음
발생 확률: 중간

시나리오:
1. 페이지 로드 → businessName은 URL에서 즉시 파싱됨
2. currentBusinessId는 API 호출로 가져와야 함 (200-500ms 소요)
3. businessName은 있지만 currentBusinessId 대기 중
4. Realtime 연결이 지연됨
5. 이 시간 동안 다른 디바이스의 업로드가 반영 안 됨

영향:
- 초기 로드 시 0.2-0.5초 동안 실시간 동기화 안 됨
- currentBusinessId 로드 완료되면 자동 연결됨

해결책:
✅ 무시 가능 (자동 복구됨)
⚠️ 또는 로딩 인디케이터 표시
```

---

### 1.2 Dedup Window 확대

**변경 내용**: `DEDUP_WINDOW_MS: 2000 → 5000`

**문제점 1: 실제 재업로드 무시**
```
심각도: 🟠 중간
발생 확률: 낮음

시나리오:
1. 사용자가 파일 업로드 시도
2. 네트워크 오류로 업로드 실패
3. 3초 후 사용자가 같은 파일 재업로드 시도
4. 같은 파일 ID라면 5초 윈도우 내라 중복으로 판단
5. 두 번째 업로드가 무시됨

영향:
- 사용자가 의도한 재업로드가 차단됨
- 업로드 실패했는데 재시도도 안 됨

해결책:
✅ 업로드 실패 시 다른 ID 생성하도록 수정
⚠️ 또는 실패한 operation은 dedup 대상에서 제외
```

**문제점 2: 빠른 연속 작업 차단**
```
심각도: 🟡 낮음
발생 확률: 매우 낮음

시나리오:
1. Device A에서 파일 업로드 → 즉시 삭제
2. 5초 이내에 같은 파일 다시 업로드
3. 첫 번째 INSERT 이벤트가 아직 dedup 윈도우에 있음
4. 두 번째 INSERT가 무시될 수 있음

해결책:
✅ 실제로 이렇게 빠르게 작업하는 경우는 거의 없음
```

---

### 2.1 RealtimeSyncIndicator 추가

**문제점 1: UI 깜빡임**
```
심각도: 🟡 낮음
발생 확률: 높음 (불안정한 네트워크)

시나리오:
1. 모바일 네트워크가 불안정함
2. 연결 ↔ 끊김이 1분에 5번씩 반복
3. 인디케이터가 계속 나타났다 사라짐
4. 사용자 짜증

영향:
- UX 저하
- 기능 자체는 정상 작동

해결책:
✅ debounce 추가 (3초 이상 끊겼을 때만 표시)
⚠️ fade in/out 애니메이션으로 부드럽게
```

**문제점 2: 모바일 Positioning**
```
심각도: 🟡 낮음
발생 확률: 중간

문제:
- fixed positioning이 Safari iOS에서 문제 있을 수 있음
- 특히 주소창 숨김/표시 시 위치 깨짐

해결책:
✅ position: sticky 또는 absolute 고려
⚠️ 모바일 환경 테스트 필수
```

---

### 2.2 Toast 알림 추가

**문제점 1: 🔥 알림 폭탄**
```
심각도: 🔴 높음
발생 확률: 높음 (실제 사용 환경)

시나리오:
1. 현장 작업자 3명이 동시에 작업 중
2. 각자 20개씩 사진 업로드
3. 60개 파일 × 3명 = 총 180개 toast 발생
4. 화면이 toast로 가득 참
5. 실제 작업 UI 안 보임

영향:
- 심각한 UX 저해
- 사용자 불만 폭발

해결책:
✅ 배치 알림: "3개의 새 사진이 추가되었습니다"
✅ 최대 표시 개수 제한 (3개)
✅ 알림 그룹핑 (같은 사용자의 연속 업로드)
✅ 사용자 설정으로 알림 끄기 옵션
```

**문제점 2: 성능 영향**
```
심각도: 🟠 중간
발생 확률: 중간

시나리오:
1. 100개 파일 동시 업로드 이벤트 수신
2. 100개 toast 컴포넌트 생성
3. DOM 조작 100번
4. 브라우저 렌더링 느려짐

해결책:
✅ 배치 알림으로 DOM 조작 최소화
✅ Virtual toast queue (최대 3개만 DOM에)
```

---

## 🚨 Phase A-1: State Layer Separation 문제들

### 문제점 1: 🔥 마이그레이션 복잡도

```
심각도: 🔴 높음
영향 범위: 전체 코드베이스

현재 구조:
interface PhotoStoreState {
  photos: UploadedFile[];  // 단일 소스
}

새 구조:
interface PhotoStoreState {
  serverPhotos: UploadedFile[];           // DB 데이터
  pendingOperations: Map<string, PendingOp>;  // 로컬 작업
  displayPhotos: UploadedFile[];          // Computed
}

영향받는 파일:
1. hooks/usePhotoStore.ts (핵심 변경)
2. contexts/FileContext.tsx (photos → displayPhotos)
3. components/ImprovedFacilityPhotoSection.tsx
4. components/ui/UploadQueue.tsx
5. components/ui/ProgressUploadCard.tsx
6. components/ui/SmartFloatingProgress.tsx
... (20개 이상 파일)

위험:
- 한 곳이라도 수정 누락 시 버그
- photos 직접 접근 코드 모두 찾아서 수정 필요
- 타입 에러 대량 발생 가능

예상 작업량:
- 코드 수정: 20-30개 파일
- 테스트: 모든 업로드/삭제 시나리오
- 디버깅: 2-3일

해결책:
✅ 단계적 마이그레이션:
  1단계: 새 구조 추가하되 기존 photos도 유지
  2단계: 하나씩 새 구조로 이동
  3단계: 완전 검증 후 기존 코드 제거
⚠️ Feature flag로 새/구 시스템 전환 가능하게
```

### 문제점 2: Computed State 성능

```
심각도: 🟠 중간
발생 확률: 높음 (파일 많을 때)

const computeDisplayPhotos = (serverPhotos, pendingOps) => {
  const result = new Map();

  // 1. serverPhotos 순회 (O(n))
  serverPhotos.forEach(photo => result.set(photo.id, photo));

  // 2. pendingOperations 순회 (O(m))
  pendingOps.forEach(op => {
    // 복잡한 로직
  });

  return Array.from(result.values());  // O(n+m)
};

문제:
- 파일 1000개 + pending 10개 = 1010번 순회
- 상태 변경마다 재계산 (Zustand의 경우)
- 불필요한 재계산 발생 가능

벤치마크:
- 100개 파일: ~1ms (무시 가능)
- 1000개 파일: ~5-10ms (눈에 띔)
- 5000개 파일: ~30-50ms (느림)

해결책:
✅ useMemo로 memoization
✅ Zustand의 selector 최적화
✅ 변경된 부분만 재계산 (incremental update)
```

### 문제점 3: 🔥 Race Condition

```
심각도: 🔴 높음
발생 확률: 매우 높음

타임라인:
T0: User uploads file
    → pendingOperations.set('file-123', { type: 'upload', status: 'pending' })

T1: Upload API 호출

T2: Server responds (200 OK)
    → serverPhotos.push({ id: 'file-123', ... })
    → pendingOperations.delete('file-123')  // ⚠️ Critical section

T3: Realtime event arrives (INSERT for 'file-123')
    → serverPhotos에 file-123가 이미 있음
    → 중복 체크 필요

문제 시나리오 1: Delete too early
T2에서 pendingOperations.delete 했는데
T3에서 Realtime이 또 serverPhotos에 추가 시도
→ 파일이 두 번 표시됨

문제 시나리오 2: Delete too late
T3가 T2보다 먼저 도착
→ pendingOperations에 아직 있어서 displayPhotos에서 제외
→ 깜빡임 발생

해결책:
✅ ID 기반 중복 제거 (Map 사용)
✅ pendingOperations를 'confirmed' 상태로 먼저 변경
✅ Realtime 이벤트 받으면 그때 최종 삭제
✅ Transaction-like 처리:
  1. pending → confirming
  2. Realtime event 확인
  3. confirming → confirmed → delete
```

### 문제점 4: 메모리 누수

```
심각도: 🟠 중간
발생 확률: 중간 (네트워크 불안정 시)

시나리오:
1. 사용자가 파일 업로드
2. pendingOperations.set('file-123', { ... })
3. 네트워크 오류로 업로드 실패
4. 재시도도 계속 실패
5. pendingOperations에 계속 쌓임
6. 하루 100번 실패하면 100개 쌓임

현재 설계:
- cleanup 로직이 명시되어 있지 않음
- 언제 pendingOperations를 비울지 불명확

영향:
- 메모리 증가
- displayPhotos 계산 느려짐
- 앱 전체 성능 저하

해결책:
✅ 타임아웃 설정 (5분 후 자동 제거)
✅ 최대 재시도 횟수 (3번)
✅ 실패한 operation은 별도 failedOperations로 이동
✅ 주기적 cleanup (10분마다)

코드 예시:
setInterval(() => {
  const now = Date.now();
  pendingOperations.forEach((op, id) => {
    if (now - op.timestamp > 5 * 60 * 1000) {
      pendingOperations.delete(id);
      console.warn(`Cleanup expired operation: ${id}`);
    }
  });
}, 10 * 60 * 1000);
```

---

## 🚨 Phase A-2: Event Sourcing 문제들

### 문제점 1: Database 부하

```
심각도: 🟠 중간
발생 확률: 높음 (규모 증가 시)

예상 이벤트 수:
- 사업장 100개
- 각 사업장 평균 500개 파일
- 하루 평균 각 사업장 10개 업로드/삭제
- 100 × 10 × 2 (INSERT+DELETE) = 2,000 events/day
- 1년 = 730,000 events
- 7일 retention = 14,000 events 상시 유지

쿼리 성능:
SELECT * FROM file_event_log
WHERE business_id = ? AND event_id > ?
ORDER BY event_id

문제:
- 인덱스 없으면 Full Table Scan
- 14,000개 행 스캔 = 느림

해결책:
✅ 복합 인덱스 필수:
CREATE INDEX idx_event_log_business_id_event_id
ON file_event_log(business_id, event_id);

✅ Partitioning (PostgreSQL 12+):
CREATE TABLE file_event_log_2024_01
PARTITION OF file_event_log
FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');

✅ 자동 retention cron job:
DELETE FROM file_event_log
WHERE created_at < NOW() - INTERVAL '7 days';
```

### 문제점 2: 🔥 Catch-up Protocol Edge Case

```
심각도: 🔴 높음
발생 확률: 중간 (오래 오프라인)

시나리오:
Day 1, 09:00: Device A 오프라인 (마지막 본 event_id: 1000)
Day 1-7:      오프라인 동안 event 1001~1500 발생
Day 8, 09:00: 7일 retention 트리거
              → event 1~1020 삭제됨
Day 8, 10:00: Device A 온라인 복귀
              → catchUp(since=1000) 호출
              → event 1001~1020은 이미 삭제됨
              → 누락 발생!

영향:
- 데이터 불일치
- 사용자가 안 보이는 파일이 있을 수 있음

해결책 1: Full sync fallback
if (catchUpResponse.incomplete) {
  // 전체 동기화
  const allFiles = await fetchAllFiles();
  serverPhotos = allFiles;
}

해결책 2: Retention 여유 주기
- 7일 대신 14일
- 또는 lastEventId 추적해서 모든 클라이언트가 본 것만 삭제

해결책 3: Snapshot 저장
- 하루 1번 전체 상태 스냅샷 저장
- event_log와 함께 제공
- 오래된 클라이언트는 스냅샷 기준으로 catch-up
```

### 문제점 3: Trigger 성능

```
심각도: 🟠 중간
발생 확률: 높음 (대량 업로드)

CREATE TRIGGER file_event_logger
AFTER INSERT OR UPDATE OR DELETE ON uploaded_files
FOR EACH ROW EXECUTE FUNCTION log_file_event();

문제:
- 파일 50개 동시 업로드
- 50번 INSERT → 50번 trigger 실행
- 각 trigger마다 file_event_log에 INSERT
- 트랜잭션 지연 발생

벤치마크:
- 1개 파일 업로드: +5ms (trigger overhead)
- 10개 파일: +50ms
- 50개 파일: +250ms (눈에 띔)

해결책:
✅ 비동기 로깅:
  - Main INSERT는 빠르게 처리
  - Event log는 별도 worker에서 처리

✅ Batch logging:
  - AFTER STATEMENT trigger 사용
  - 여러 행을 한번에 로깅

⚠️ 트레이드오프:
  - 비동기는 실패 시 복구 어려움
  - 배치는 구현 복잡도 증가
```

---

## 🚨 Phase A-3: Security Enhancement 문제들

### 문제점 1: 🔥 RLS 정책 오류

```
심각도: 🔴 매우 높음
발생 확률: 높음 (설정 실수)

CREATE POLICY "Users can view own business files"
ON uploaded_files FOR SELECT
USING (
  business_id IN (
    SELECT id FROM business_info
    WHERE business_name = current_setting('app.current_business', true)
  )
);

문제 시나리오 1: Setting 누락
API route에서 current_setting 설정 안 함
→ 모든 쿼리가 빈 결과 반환
→ 사용자는 아무 파일도 못 봄
→ 서비스 전체 다운

문제 시나리오 2: Setting 잘못된 값
current_setting('app.current_business', true) = 'undefined'
→ business_name = 'undefined' 인 사업장 없음
→ 403 Forbidden 폭탄

영향:
- 프로덕션 장애
- 모든 사용자 영향
- 빠른 롤백 필요

해결책:
✅ API route 템플릿:
export async function GET(req: Request) {
  const businessName = getBusinessName(req);

  // 필수: RLS setting
  await supabase.rpc('set_current_business', {
    business_name: businessName
  });

  const { data } = await supabase
    .from('uploaded_files')
    .select('*');
}

✅ 미들웨어로 자동화:
async function withRLS(businessName: string, callback: Function) {
  await supabase.rpc('set_current_business', { business_name: businessName });
  return await callback();
}

✅ 테스트 필수:
- RLS 활성화 상태에서 모든 API 테스트
- 다른 business_name으로 접근 시도 (403 확인)
```

### 문제점 2: 🔥 Rate Limiter 부작용

```
심각도: 🔴 높음
발생 확률: 매우 높음 (현장 사용)

export const uploadLimiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 10  // 1분당 10개
});

문제 시나리오:
1. 현장 작업자가 20개 사진 촬영
2. 모두 선택해서 업로드 시도
3. 처음 10개는 성공
4. 나머지 10개는 429 Too Many Requests
5. 사용자는 이유를 모름
6. 계속 재시도 → 계속 429
7. 영원히 업로드 안 됨

실제 사용 패턴:
- 현장: 10-30개 사진 한번에 업로드
- 여러 시설 촬영: 50-100개 가능
- 1분당 10개는 너무 적음

영향:
- 실제 업무 차단
- 사용자 불만
- 앱 사용 불가

해결책:
✅ 제한 완화:
  windowMs: 60 * 1000,
  maxRequests: 50  // 1분당 50개

✅ Business별 제한 (전역 제한 아님):
  key: `upload:${businessId}:${userId}`

✅ Progressive retry with backoff:
  재시도 시 429면 자동으로 대기 후 재시도

✅ UI 피드백:
  "업로드 제한 도달. 1분 후 자동 재시도합니다."

✅ Batch upload:
  클라이언트에서 10개씩 나눠서 업로드
```

### 문제점 3: File Validator 오탐

```
심각도: 🟠 중간
발생 확률: 중간

export class FileValidator {
  static async validate(file: File): Promise<ValidationError[]> {
    if (file.size > 10 * 1024 * 1024) {
      errors.push({ field: 'size', message: '10MB 초과' });
    }
  }
}

문제:
- 현대 스마트폰 사진:
  - iPhone 14 Pro Max (ProRAW): ~25-50MB
  - Samsung S23 Ultra: ~12-20MB
  - DSLR: ~15-30MB
- 고화질 사진이 정당하게 거부됨

영향:
- 사용자 불만
- "왜 내 사진은 안 되나요?"

해결책:
✅ 제한 상향:
  - 일반 사진: 20MB
  - ProRAW/DSLR: 50MB

✅ 자동 압축:
  - 10MB 초과 시 클라이언트에서 압축
  - Browser Image Compression API 사용

✅ Progressive upload:
  - 큰 파일은 chunk 단위로 업로드

✅ 설정 가능:
  - 관리자가 business별로 제한 설정
```

---

## 🚨 Phase B-4: Concurrency Control 문제들

### 문제점 1: 🔥 Version Conflict 처리

```
심각도: 🔴 높음
발생 확률: 중간 (다중 사용자)

시나리오:
09:00: Device A가 파일 메타데이터 조회
       → file_123 { version: 1, tags: ['시설A'] }

09:01: Device B가 같은 파일 조회
       → file_123 { version: 1, tags: ['시설A'] }

09:02: Device A가 태그 수정
       UPDATE uploaded_files
       SET tags = ['시설A', '점검완료'], version = 2
       WHERE id = 'file_123' AND version = 1
       → 성공! version: 1 → 2

09:03: Device B도 태그 수정 시도
       UPDATE uploaded_files
       SET tags = ['시설A', '긴급'], version = 2
       WHERE id = 'file_123' AND version = 1
       → 실패! (version이 이미 2임)

문제:
- Device B의 사용자는 왜 실패했는지 모름
- 어떻게 해야 할지 불명확
- UI에 아무 메시지도 없음

현재 설계의 부족한 점:
- Conflict resolution UI 없음
- 사용자에게 선택권 없음
- 자동 병합 로직 없음

해결책 1: 사용자에게 선택권
toast.error('다른 사용자가 이 파일을 수정했습니다', {
  action: {
    label: '최신 버전 보기',
    onClick: () => fetchLatestVersion()
  }
});

해결책 2: 자동 병합 (가능한 경우)
if (conflict.type === 'tags') {
  // 두 버전의 태그 합치기
  merged.tags = [...new Set([...versionA.tags, ...versionB.tags])];
}

해결책 3: Last Write Wins (간단하지만 위험)
// 그냥 덮어쓰기 (데이터 손실 가능)
UPDATE uploaded_files
SET tags = ['시설A', '긴급'], version = version + 1
WHERE id = 'file_123'

권장:
✅ 해결책 1 (사용자 선택) + 해결책 2 (자동 병합)
⚠️ 해결책 3은 중요하지 않은 필드만
```

---

## 🚨 Phase B-5: Offline Support 문제들

### 문제점 1: IndexedDB 호환성

```
심각도: 🟠 중간
발생 확률: 높음 (iOS Safari)

문제:
- iOS Safari Private Mode: IndexedDB 완전 차단
- iOS Safari 일반: 50MB 제한 (사용자 확인 필요)
- Firefox Private: IndexedDB 세션 종료 시 삭제

시나리오:
1. 사용자가 Private Mode로 앱 접속
2. IndexedDB 초기화 시도
3. SecurityError 발생
4. 오프라인 기능 전체 작동 안 함
5. 앱이 깨짐

영향:
- iOS 사용자 비율 높으면 심각
- Private Mode 사용자 전원 영향

해결책:
✅ Fallback 체계:
try {
  offlineDB = new OfflineDatabase();
  await offlineDB.open();
} catch (error) {
  console.warn('IndexedDB not available, using memory fallback');
  offlineDB = new InMemoryDatabase();
}

✅ 기능 저하 모드:
- IndexedDB 없으면 오프라인 기능만 비활성화
- 나머지 기능은 정상 작동
- 사용자에게 알림: "오프라인 모드를 사용할 수 없습니다"

✅ Quota 관리:
if (navigator.storage && navigator.storage.estimate) {
  const { quota, usage } = await navigator.storage.estimate();
  if (usage / quota > 0.9) {
    alert('저장 공간이 부족합니다');
  }
}
```

### 문제점 2: 🔥 Sync Queue 폭발

```
심각도: 🔴 높음
발생 확률: 높음 (오프라인 환경)

시나리오:
1. 사용자가 지하철에서 50개 파일 업로드 시도 (오프라인)
2. 모두 IndexedDB queue에 저장됨
3. 지상으로 나와 온라인 복귀
4. 50개 파일 동시 업로드 시작
5. Rate limiter: 1분당 10개 제한
6. 처음 10개만 성공, 나머지 40개는 429
7. 실패한 40개를 다시 queue에 추가?
8. 1분 후 재시도 → 또 10개만 성공
9. 무한 루프?

추가 문제:
- 배터리 소모
- 데이터 사용량 폭증
- 사용자는 언제 끝날지 모름

해결책:
✅ 스마트 배치:
async processSyncQueue() {
  const pending = await this.getPending();

  // 10개씩 나눠서 처리
  for (let i = 0; i < pending.length; i += 10) {
    const batch = pending.slice(i, i + 10);
    await Promise.all(batch.map(op => this.process(op)));

    if (i + 10 < pending.length) {
      await sleep(60000);  // 1분 대기
    }
  }
}

✅ Progress 표시:
"오프라인 중 업로드한 50개 파일을 동기화 중입니다... (10/50)"

✅ 실패 재시도 제한:
operation.retryCount++;
if (operation.retryCount > 3) {
  operation.status = 'failed';
  // 사용자에게 알림
}

✅ 사용자 제어:
"50개 파일이 대기 중입니다. 지금 동기화하시겠습니까? (데이터 요금 발생)"
[나중에] [Wi-Fi 연결 시만] [지금 동기화]
```

### 문제점 3: 파일 크기 문제

```
심각도: 🟠 중간
발생 확률: 중간

시나리오:
1. 사용자가 오프라인에서 고화질 사진 10개 업로드 (각 10MB)
2. 100MB가 IndexedDB에 저장됨
3. 브라우저 quota 초과 가능

브라우저 Quota:
- Chrome: min(10% of disk, 최소 1GB)
- Safari: 1GB (사용자 확인 후 추가 가능)
- Firefox: 2GB

저사양 기기:
- 32GB 스마트폰 → Chrome quota: 3.2GB (괜찮음)
- 16GB 스마트폰 → Chrome quota: 1.6GB (위험)

해결책:
✅ Quota 체크:
const estimate = await navigator.storage.estimate();
const available = estimate.quota - estimate.usage;
if (fileSize > available) {
  alert('저장 공간이 부족합니다. 일부 파일을 먼저 동기화해주세요.');
}

✅ 파일 압축:
- IndexedDB에 저장 전 압축
- 동기화 시 원본 업로드

✅ 우선순위:
- 작은 파일 먼저 동기화
- 큰 파일은 Wi-Fi 연결 시

✅ 자동 정리:
- 동기화 완료된 파일은 IndexedDB에서 즉시 삭제
```

---

## 🚨 Phase B-6: Testing Strategy 문제들

### 문제점 1: Playwright E2E Test Flakiness

```
심각도: 🟠 중간
발생 확률: 매우 높음 (CI 환경)

test('multi-device realtime sync', async ({ browser }) => {
  const page1 = await context1.newPage();
  const page2 = await context2.newPage();

  await page1.setInputFiles('input[type=file]', 'test.jpg');
  await page1.click('button:has-text("업로드")');

  // 1초 이내 동기화 확인
  await page2.waitForSelector('img[alt*="test.jpg"]', {
    timeout: 1000  // ⚠️ Flaky!
  });
});

문제:
- 로컬: 0.5초 걸림 → 테스트 통과
- CI: 1.2초 걸림 → 테스트 실패
- 다시 실행: 0.8초 걸림 → 통과
- 신뢰성 저하

원인:
- 네트워크 지연
- CI 서버 성능
- Supabase Realtime 지연
- 브라우저 렌더링 시간

해결책:
✅ Retry 로직:
await page2.waitForSelector('img[alt*="test.jpg"]', {
  timeout: 2000,  // 여유있게
  retry: 3
});

✅ Polling 대신 Event:
// page2에서 이벤트 리스너
await page2.evaluate(() => {
  return new Promise(resolve => {
    window.addEventListener('photoAdded', resolve, { once: true });
  });
});

✅ 조건부 타임아웃:
const timeout = process.env.CI ? 3000 : 1000;
```

### 문제점 2: Chaos Testing 재현 불가능

```
심각도: 🟡 낮음
발생 확률: 높음

Chaos Testing:
- 랜덤하게 네트워크 끊음
- 랜덤 시간 후 복구
- 버그 발견!

문제:
- 디버깅 시 같은 조건 재현 어려움
- "어떤 타이밍에 끊겼는지" 모름
- 랜덤이라 재현 안 됨

해결책:
✅ Seed 기반 랜덤:
const random = new SeededRandom(12345);
const disconnectTime = random.next() * 1000;

// 재현 시 같은 seed 사용
테스트 실패 시: "Seed: 12345로 재현 가능"

✅ 시나리오 녹화:
{
  "scenario": "chaos_test_001",
  "events": [
    { "time": 0, "action": "upload_start" },
    { "time": 500, "action": "network_disconnect" },
    { "time": 2000, "action": "network_reconnect" },
    { "time": 2500, "action": "upload_complete" }
  ]
}

✅ 재생 모드:
test('replay chaos scenario', async () => {
  await replayScenario('chaos_test_001.json');
});
```

---

## 🚨 Phase C-7: Performance Optimization 문제들

### 문제점 1: Web Worker 통신 오버헤드

```
심각도: 🟡 낮음
발생 확률: 중간

// Main thread
worker.postMessage({
  type: 'processEvents',
  events: largeEventArray
});

문제:
- postMessage는 structured clone
- 얕은 복사가 아님
- 큰 객체는 복사 자체가 느림

벤치마크:
- 100개 이벤트: ~5ms (무시 가능)
- 1000개 이벤트: ~50ms (눈에 띔)
- 10000개 이벤트: ~500ms (느림!)

Worker의 이득:
- 메인 스레드 블로킹 방지
- 복잡한 계산 분리

트레이드오프:
- 통신 오버헤드 vs 메인 스레드 블로킹
- 1000개 이하: 메인 스레드에서
- 1000개 이상: Worker 사용

해결책:
✅ Transferable Objects:
const buffer = new ArrayBuffer(data);
worker.postMessage({ buffer }, [buffer]);  // 소유권 이전

✅ 조건부 Worker:
if (events.length > 1000) {
  worker.postMessage({ events });
} else {
  processEventsSync(events);
}
```

### 문제점 2: Infinite Scroll의 스크롤 점프

```
심각도: 🟠 중간
발생 확률: 높음

시나리오:
1. 사용자가 스크롤 중 (현재 100번째 사진)
2. Intersection Observer 트리거
3. 다음 페이지 로드 (101-150번 사진)
4. DOM에 50개 새 항목 추가
5. 브라우저가 레이아웃 재계산
6. 스크롤 위치가 갑자기 점프

영향:
- UX 불편
- 사용자가 보던 위치 잃어버림

해결책:
✅ 고정 높이:
.photo-item {
  height: 200px;  /* 고정 */
}

✅ Skeleton placeholder:
- 로딩 전에 placeholder 미리 렌더링
- 실제 로드 시 교체

✅ Scroll restoration:
const scrollPos = window.scrollY;
// ... DOM 추가 ...
window.scrollTo(0, scrollPos);

✅ Virtual scrolling (react-window):
// 이미 스크롤 점프 방지 내장
```

---

## 🚨 Phase C-8: Monitoring 문제들

### 문제점 1: 🔥 Debug Panel 보안

```
심각도: 🔴 높음
발생 확률: 높음 (실수)

Debug Panel 내용:
{
  "currentBusiness": "ABC 주식회사",
  "businessId": "550e8400-e29b-41d4-a716-446655440000",
  "serverPhotos": [
    {
      "id": "file-123",
      "file_path": "business/ABC/presurvey/basic/discharge_1_photo1.jpg",
      "uploader": "홍길동",
      "business_id": "550e8400-e29b-41d4-a716-446655440000"
    }
  ]
}

문제:
- 프로덕션에서 접근 가능하면 정보 유출
- business_id 노출
- file_path 노출
- 개인정보 (uploader) 노출

시나리오:
1. 개발자가 실수로 프로덕션에 배포
2. 사용자가 디버그 패널 발견
3. 다른 사업장 정보 조회 시도
4. 보안 사고

해결책:
✅ 환경 변수 체크:
{process.env.NODE_ENV === 'development' && (
  <DebugPanel />
)}

✅ Feature flag:
{process.env.NEXT_PUBLIC_DEBUG_PANEL === 'true' && (
  <DebugPanel />
)}

✅ 인증 필요:
if (!isAdmin()) {
  return null;
}

✅ 민감 정보 마스킹:
{
  "businessId": "550e****-****-****-****-********0000",
  "uploader": "홍**"
}
```

---

## 🔥 전체적인 누적 문제

### 문제 1: 🔥🔥🔥 복잡도 폭발

```
심각도: 🔴🔴🔴 매우 높음
영향: 유지보수 악몽

현재 시스템:
- Zustand: photos[] 단일 배열
- Supabase: uploaded_files 테이블
- 비교적 단순

완전 구현 후:
Layer 1: State Management
  - serverPhotos (Zustand)
  - pendingOperations (Zustand)
  - displayPhotos (computed)

Layer 2: Offline Support
  - IndexedDB: OfflineQueue
  - InMemoryFallback

Layer 3: Event Sourcing
  - file_event_log 테이블
  - lastEventId 추적

Layer 4: Concurrency Control
  - version 필드
  - Conflict resolution

상호작용:
User uploads (offline)
  → pendingOperations.add()
  → IndexedDB.queue.add()

Network reconnects
  → IndexedDB.queue.process()
  → API call
  → file_event_log INSERT
  → Realtime event
  → serverPhotos.add()
  → pendingOperations.confirm()
  → Version check
  → Conflict?
  → Resolve
  → displayPhotos recalculate

디버깅 시나리오:
"파일이 안 보여요"
→ 어디서 문제?
  1. serverPhotos에 없음?
  2. pendingOperations에서 필터링?
  3. IndexedDB queue에서 실패?
  4. Event log에서 누락?
  5. Version conflict?
  6. displayPhotos 계산 오류?

7개 지점을 모두 확인해야 함!

해결책:
✅ 단계적 도입 (한번에 다 구현 X)
✅ 각 레이어별 독립 테스트
✅ Comprehensive logging
✅ 디버그 도구 필수
⚠️ 팀 전체가 아키텍처 이해 필요
```

### 문제 2: 🔥 데이터 정합성 보장의 어려움

```
심각도: 🔴 높음

데이터가 분산된 곳:
1. Zustand (serverPhotos)
2. Zustand (pendingOperations)
3. IndexedDB (OfflineQueue)
4. Supabase (uploaded_files)
5. Supabase (file_event_log)

문제 시나리오:
Step 1: User uploads offline
  → IndexedDB: { file-123: pending }

Step 2: Network reconnects
  → API call starts

Step 3: API fails (network timeout)
  → Supabase: file-123 없음
  → file_event_log: 없음
  → IndexedDB: { file-123: pending } 유지

Step 4: User refreshes page
  → Zustand 초기화
  → IndexedDB에만 file-123 있음
  → 불일치!

불일치 케이스:
- IndexedDB에는 있는데 Supabase에 없음
- Supabase에는 있는데 Zustand에 없음
- event_log에는 있는데 uploaded_files에 없음
- pendingOperations에는 있는데 serverPhotos에 없음

해결책:
✅ Reconciliation 로직:
async function reconcile() {
  const supabaseFiles = await fetchFromSupabase();
  const indexedDBFiles = await fetchFromIndexedDB();
  const zustandFiles = getFromZustand();

  // 3-way merge
  const merged = threeWayMerge(supabaseFiles, indexedDBFiles, zustandFiles);

  // 우선순위: Supabase > IndexedDB > Zustand
}

✅ 주기적 검증:
setInterval(reconcile, 5 * 60 * 1000);  // 5분마다

✅ Transaction-like 처리:
- 모든 레이어 업데이트 성공 또는 모두 롤백
```

### 문제 3: 성능 vs 기능 트레이드오프

```
심각도: 🟠 중간

모든 기능 활성화 시:

Every photo operation:
1. Zustand state update
2. displayPhotos recalculation
3. IndexedDB sync
4. Event log INSERT
5. Version check
6. RLS policy evaluation
7. Rate limit check
8. File validation
9. Realtime event processing
10. Web Worker communication

오버헤드:
- 1개 파일 업로드: ~200-300ms
- 기본 구현: ~50-100ms
- 3-6배 느림!

트레이드오프:
- 완전한 기능 vs 빠른 성능
- 복잡한 시스템 vs 간단한 유지보수

해결책:
✅ Feature flags:
const features = {
  offlineSupport: true,
  eventSourcing: false,  // 필요할 때만
  concurrencyControl: false,  // 필요할 때만
};

✅ 프로파일링:
- 각 기능의 성능 영향 측정
- 80/20 원칙: 20%의 기능이 80%의 이득

✅ 조건부 활성화:
- 단일 사용자: Concurrency control OFF
- 다중 사용자: Concurrency control ON
```

---

## 📊 전체 위험도 요약

### 🔴 높은 위험 (즉시 해결 필요)

1. **Toast 알림 폭탄** - 대량 업로드 시 UX 파괴
2. **State Layer 마이그레이션** - 대규모 리팩토링 위험
3. **Race Condition** - 파일 중복/깜빡임
4. **Event Sourcing Edge Case** - 데이터 누락
5. **RLS 정책 오류** - 서비스 전체 다운
6. **Rate Limiter 부작용** - 실제 업무 차단
7. **Version Conflict 처리** - 사용자 혼란
8. **Sync Queue 폭발** - 무한 재시도
9. **Debug Panel 보안** - 정보 유출
10. **복잡도 폭발** - 유지보수 악몽

### 🟠 중간 위험 (주의 필요)

1. Dedup window 실제 재업로드 무시
2. Computed state 성능
3. 메모리 누수
4. Database 부하
5. Trigger 성능
6. File Validator 오탐
7. IndexedDB 호환성
8. 파일 크기 문제
9. Infinite scroll 점프

### 🟡 낮은 위험 (모니터링)

1. Connection timing 지연
2. UI 깜빡임
3. Web Worker 오버헤드
4. Chaos testing 재현

---

## 🎯 권장 접근 방식

### 1단계: 안전한 것만 (1-2일)
```
✅ Phase 1.1: Connection timing
✅ Phase 1.2: Dedup window (+ 재업로드 허용 로직)
✅ Phase 2.1: Sync indicator (+ debounce)
✅ Phase 2.2: Toast (+ 배치 알림)
```

### 2단계: 검증 후 진행 (1-2주)
```
⚠️ State Layer Separation
  - Feature flag로 on/off
  - 충분한 테스트
  - 단계적 마이그레이션

⚠️ Security (RLS + Rate Limiter)
  - 스테이징 환경 검증
  - Rate limit 완화 (50개/분)
  - RLS 자동 설정
```

### 3단계: 필요 시만 (2-4주)
```
⚠️ Event Sourcing
  - 실제로 catch-up이 필요한지 확인
  - 대부분의 경우 Realtime만으로 충분

⚠️ Offline Support
  - 사용자가 실제로 오프라인에서 작업하는지 확인
  - 필요성 검증 후 구현

⚠️ Concurrency Control
  - 다중 사용자 동시 편집이 실제로 발생하는지 확인
```

### 🚫 구현하지 않기
```
❌ Phase C (Performance Optimization)
  - 성능 문제 실제로 발생할 때
  - 측정 후 필요한 부분만

❌ Full complexity
  - 모든 기능을 한번에 구현 X
  - 80/20 원칙 적용
```

---

**작성일**: 2026-02-05
**버전**: 1.0
**분석 완료**: ✅
