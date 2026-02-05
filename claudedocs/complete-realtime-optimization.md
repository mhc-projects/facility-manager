# 완전한 실시간 동기화 최적화 계획

## 📋 개요

안전한 기본 구현(Phase 1.1, 1.2, Phase 2) 이후, 완전한 실시간 동기화를 달성하기 위한 8가지 핵심 최적화 방안입니다.

## 🎯 완전한 실시간 동기화의 정의

1. **데이터 무결성**: 어떤 상황에서도 파일 손실 없음
2. **즉각성**: 1초 이내 모든 디바이스 반영
3. **일관성**: 모든 디바이스가 같은 상태 유지
4. **복원력**: 네트워크 단절/재연결 시에도 안정적
5. **확장성**: 대용량 파일(1000개+)에도 성능 유지

---

## 🔴 Phase A: 필수 최적화 (데이터 무결성)

### 1. 상태 레이어 분리 ⭐⭐⭐⭐⭐

**문제**: Optimistic updates와 Server state 충돌로 파일 사라짐/부활

**해결**: 두 레이어를 명확히 분리하고 지능적으로 병합

#### 구현 계획

**1.1 상태 구조 재설계**

```typescript
// hooks/usePhotoStore.ts 확장

interface PhotoStoreState {
  // 서버 확인된 사진 (Source of Truth)
  serverPhotos: UploadedFile[];

  // 진행 중인 작업 (Optimistic)
  pendingOperations: Map<string, PendingOperation>;

  // 계산된 상태 (Derived State)
  displayPhotos: UploadedFile[]; // serverPhotos + pendingOperations 병합 결과
}

interface PendingOperation {
  id: string;
  type: 'upload' | 'delete' | 'update';
  status: 'pending' | 'processing' | 'confirmed' | 'failed';
  timestamp: number;
  data: UploadedFile | { fileId: string };
  retryCount: number;
}
```

**1.2 Smart Merge 로직**

```typescript
// 두 레이어를 병합하여 최종 표시 상태 계산
const computeDisplayPhotos = (
  serverPhotos: UploadedFile[],
  pendingOperations: Map<string, PendingOperation>
): UploadedFile[] => {
  const result = new Map<string, UploadedFile>();

  // 1. 서버 사진으로 시작
  serverPhotos.forEach(photo => {
    result.set(photo.id, photo);
  });

  // 2. Pending operations 적용
  pendingOperations.forEach(operation => {
    switch (operation.type) {
      case 'upload':
        // 업로드 중인 파일 추가 (아직 서버에 없음)
        if (operation.status !== 'confirmed') {
          const optimisticPhoto = operation.data as UploadedFile;
          result.set(optimisticPhoto.id, {
            ...optimisticPhoto,
            uploadStatus: operation.status
          });
        }
        break;

      case 'delete':
        // 삭제 중인 파일 제거 (아직 서버에서 안 지워짐)
        if (operation.status !== 'confirmed') {
          const { fileId } = operation.data as { fileId: string };
          result.delete(fileId);
        }
        break;

      case 'update':
        // 업데이트 중인 파일 반영
        if (operation.status !== 'confirmed') {
          const updatedPhoto = operation.data as UploadedFile;
          if (result.has(updatedPhoto.id)) {
            result.set(updatedPhoto.id, {
              ...result.get(updatedPhoto.id)!,
              ...updatedPhoto
            });
          }
        }
        break;
    }
  });

  return Array.from(result.values());
};
```

**1.3 Realtime 이벤트 처리 개선**

```typescript
// contexts/FileContext.tsx 수정

const handleRealtimeNotification = useCallback((payload: any) => {
  const { eventType, new: newRecord, old: oldRecord } = payload;
  const recordId = newRecord?.id || oldRecord?.id;

  // ... 기존 필터링 로직 ...

  switch (eventType) {
    case 'INSERT':
      // 서버 사진 추가
      rawAddServerPhoto(newFile);

      // 해당 pending operation 확인 처리
      const uploadOp = pendingOperations.get(recordId);
      if (uploadOp && uploadOp.type === 'upload') {
        confirmOperation(recordId);
      }
      break;

    case 'DELETE':
      // 서버 사진 제거
      rawRemoveServerPhoto(oldRecord.id);

      // 해당 pending operation 확인 처리
      const deleteOp = pendingOperations.get(oldRecord.id);
      if (deleteOp && deleteOp.type === 'delete') {
        confirmOperation(oldRecord.id);
      }
      break;
  }

  // displayPhotos 재계산 (자동으로 UI 업데이트)
  recomputeDisplayPhotos();
}, [...]);
```

**1.4 업로드/삭제 API 호출 수정**

```typescript
// 업로드 시작
const startUpload = (file: File, optimisticPhoto: UploadedFile) => {
  // Pending operation 추가
  addPendingOperation({
    id: optimisticPhoto.id,
    type: 'upload',
    status: 'pending',
    timestamp: Date.now(),
    data: optimisticPhoto,
    retryCount: 0
  });

  // API 호출
  uploadFile(file)
    .then(() => {
      updateOperationStatus(optimisticPhoto.id, 'processing');
    })
    .catch((error) => {
      updateOperationStatus(optimisticPhoto.id, 'failed');
    });
};

// 삭제 시작
const startDelete = (fileId: string) => {
  // Pending operation 추가
  addPendingOperation({
    id: `delete-${fileId}`,
    type: 'delete',
    status: 'pending',
    timestamp: Date.now(),
    data: { fileId },
    retryCount: 0
  });

  // API 호출
  deleteFile(fileId)
    .then(() => {
      updateOperationStatus(`delete-${fileId}`, 'processing');
    })
    .catch((error) => {
      updateOperationStatus(`delete-${fileId}`, 'failed');
    });
};
```

**효과**:
- ✅ 업로드 중인 파일이 절대 사라지지 않음
- ✅ 삭제한 파일이 절대 부활하지 않음
- ✅ 서버 상태와 로컬 상태의 완벽한 분리

**작업 시간**: 4-6시간

---

### 2. Event Sourcing (이벤트 소싱) ⭐⭐⭐⭐⭐

**문제**: 네트워크 재연결 시 누락된 이벤트 복구 불가능

**해결**: 서버에서 이벤트 로그 유지, 재연결 시 catch-up

#### 구현 계획

**2.1 데이터베이스 이벤트 로그 테이블**

```sql
-- 이벤트 로그 테이블 생성
CREATE TABLE file_event_log (
  event_id BIGSERIAL PRIMARY KEY,
  event_type TEXT NOT NULL, -- 'INSERT', 'UPDATE', 'DELETE'
  business_id UUID NOT NULL,
  file_id UUID NOT NULL,
  event_data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스 생성 (빠른 조회)
CREATE INDEX idx_event_log_business_time ON file_event_log(business_id, event_id);
CREATE INDEX idx_event_log_created_at ON file_event_log(created_at);

-- 오래된 이벤트 자동 삭제 (7일 보관)
CREATE OR REPLACE FUNCTION cleanup_old_events()
RETURNS void AS $$
BEGIN
  DELETE FROM file_event_log
  WHERE created_at < NOW() - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql;

-- 매일 자동 실행
SELECT cron.schedule('cleanup-events', '0 2 * * *', 'SELECT cleanup_old_events()');
```

**2.2 트리거로 자동 이벤트 기록**

```sql
-- uploaded_files 테이블 변경 시 이벤트 로그 자동 생성
CREATE OR REPLACE FUNCTION log_file_event()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO file_event_log (event_type, business_id, file_id, event_data)
    VALUES ('INSERT', NEW.business_id, NEW.id, row_to_json(NEW));
    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO file_event_log (event_type, business_id, file_id, event_data)
    VALUES ('UPDATE', NEW.business_id, NEW.id, row_to_json(NEW));
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO file_event_log (event_type, business_id, file_id, event_data)
    VALUES ('DELETE', OLD.business_id, OLD.id, row_to_json(OLD));
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER file_event_logger
AFTER INSERT OR UPDATE OR DELETE ON uploaded_files
FOR EACH ROW EXECUTE FUNCTION log_file_event();
```

**2.3 Catch-up API 엔드포인트**

```typescript
// app/api/file-events/route.ts (신규 파일)

import { NextRequest } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { createSuccessResponse, createErrorResponse } from '@/lib/api-utils';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const sinceEventId = url.searchParams.get('since');
  const businessId = url.searchParams.get('businessId');

  if (!businessId) {
    return createErrorResponse('businessId 필수', 400);
  }

  const adminClient = getSupabaseAdminClient();

  let query = adminClient
    .from('file_event_log')
    .select('*')
    .eq('business_id', businessId)
    .order('event_id', { ascending: true })
    .limit(100); // 한 번에 최대 100개

  if (sinceEventId) {
    query = query.gt('event_id', parseInt(sinceEventId));
  }

  const { data: events, error } = await query;

  if (error) {
    return createErrorResponse(`이벤트 조회 실패: ${error.message}`, 500);
  }

  return createSuccessResponse({
    events,
    hasMore: events.length === 100
  });
}
```

**2.4 클라이언트 Catch-up 로직**

```typescript
// contexts/FileContext.tsx 추가

const lastEventIdRef = useRef<number>(0);

const catchUpMissedEvents = async () => {
  if (!currentBusinessId) return;

  console.log(`🔄 [CATCH-UP] 누락된 이벤트 복구 시작: since=${lastEventIdRef.current}`);

  try {
    const response = await fetch(
      `/api/file-events?businessId=${currentBusinessId}&since=${lastEventIdRef.current}`
    );

    const data = await response.json();

    if (!data.success || !data.data.events) {
      console.warn('⚠️ [CATCH-UP] 이벤트 없음');
      return;
    }

    const events = data.data.events;
    console.log(`✅ [CATCH-UP] ${events.length}개 이벤트 복구 시작`);

    // 이벤트 순차 재생
    for (const event of events) {
      await applyEvent(event);
      lastEventIdRef.current = event.event_id;
    }

    console.log(`✅ [CATCH-UP] 복구 완료: lastEventId=${lastEventIdRef.current}`);

    // 더 있으면 재귀 호출
    if (data.data.hasMore) {
      await catchUpMissedEvents();
    }

  } catch (error) {
    console.error('❌ [CATCH-UP] 복구 실패:', error);
  }
};

const applyEvent = async (event: FileEvent) => {
  const { event_type, event_data } = event;

  switch (event_type) {
    case 'INSERT':
      rawAddServerPhoto(event_data);
      break;
    case 'DELETE':
      rawRemoveServerPhoto(event_data.id);
      break;
    case 'UPDATE':
      rawUpdateServerPhoto(event_data.id, event_data);
      break;
  }

  recomputeDisplayPhotos();
};

// Realtime 연결 시 호출
onConnect: () => {
  console.log(`📡 [FILE-REALTIME] Realtime 연결됨 - Catch-up 시작`);
  catchUpMissedEvents();
},

// Realtime 이벤트 수신 시 event_id 업데이트
const handleRealtimeNotification = useCallback((payload: any) => {
  // ... 기존 로직 ...

  // 이벤트 ID 업데이트 (Realtime 이벤트에 event_id 포함 필요)
  if (payload.eventId) {
    lastEventIdRef.current = Math.max(lastEventIdRef.current, payload.eventId);
  }
}, [...]);
```

**효과**:
- ✅ 네트워크 끊김 중 발생한 모든 변경사항 복구
- ✅ 순차적 이벤트 재생으로 데이터 일관성 보장
- ✅ 7일간 이벤트 보관으로 장기 오프라인도 지원

**작업 시간**: 6-8시간

---

### 3. 보안 강화 ⭐⭐⭐⭐⭐

**문제**: RLS 미적용, Rate Limiting 없음, 파일 검증 부족

**해결**: 다층 보안 시스템 구축

#### 구현 계획

**3.1 Row Level Security (RLS) 강화**

```sql
-- uploaded_files 테이블 RLS 활성화
ALTER TABLE uploaded_files ENABLE ROW LEVEL SECURITY;

-- 읽기 정책: 자신의 사업장만
CREATE POLICY "Users can view own business files"
ON uploaded_files FOR SELECT
USING (
  business_id IN (
    SELECT id FROM business_info
    WHERE business_name = current_setting('app.current_business', true)
  )
);

-- 쓰기 정책: 인증된 사용자만
CREATE POLICY "Authenticated users can upload"
ON uploaded_files FOR INSERT
WITH CHECK (
  auth.role() = 'authenticated' AND
  business_id IN (
    SELECT id FROM business_info
    WHERE business_name = current_setting('app.current_business', true)
  )
);

-- 삭제 정책: 자신의 사업장 파일만
CREATE POLICY "Users can delete own business files"
ON uploaded_files FOR DELETE
USING (
  business_id IN (
    SELECT id FROM business_info
    WHERE business_name = current_setting('app.current_business', true)
  )
);

-- file_event_log 테이블도 동일하게
ALTER TABLE file_event_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own business events"
ON file_event_log FOR SELECT
USING (
  business_id IN (
    SELECT id FROM business_info
    WHERE business_name = current_setting('app.current_business', true)
  )
);
```

**3.2 Rate Limiting (API 레벨)**

```typescript
// lib/rate-limiter.ts (신규 파일)

import { LRUCache } from 'lru-cache';

interface RateLimitConfig {
  windowMs: number;  // 시간 윈도우 (밀리초)
  maxRequests: number; // 최대 요청 수
}

class RateLimiter {
  private cache: LRUCache<string, number[]>;

  constructor(private config: RateLimitConfig) {
    this.cache = new LRUCache({
      max: 500,
      ttl: config.windowMs
    });
  }

  check(identifier: string): { allowed: boolean; resetAt: number } {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    // 현재 윈도우 내 요청 목록
    const requests = this.cache.get(identifier) || [];
    const recentRequests = requests.filter(time => time > windowStart);

    if (recentRequests.length >= this.config.maxRequests) {
      return {
        allowed: false,
        resetAt: Math.min(...recentRequests) + this.config.windowMs
      };
    }

    // 요청 기록
    recentRequests.push(now);
    this.cache.set(identifier, recentRequests);

    return { allowed: true, resetAt: 0 };
  }
}

// 업로드 제한: 1분당 10개
export const uploadLimiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 10
});

// 삭제 제한: 1분당 20개
export const deleteLimiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 20
});

// 이벤트 조회 제한: 1분당 30회
export const eventFetchLimiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 30
});
```

**API에 적용**:

```typescript
// app/api/uploaded-files-supabase/route.ts 수정

import { uploadLimiter, deleteLimiter } from '@/lib/rate-limiter';

export async function POST(request: NextRequest) {
  const clientIp = request.ip || 'unknown';
  const businessName = await getBusinessName(request);
  const identifier = `${businessName}-${clientIp}`;

  // Rate limiting 체크
  const { allowed, resetAt } = uploadLimiter.check(identifier);
  if (!allowed) {
    return createErrorResponse(
      `업로드 제한 초과. ${new Date(resetAt).toLocaleTimeString()} 이후 재시도하세요.`,
      429
    );
  }

  // ... 기존 업로드 로직 ...
}

export async function DELETE(request: NextRequest) {
  const clientIp = request.ip || 'unknown';
  const businessName = await getBusinessName(request);
  const identifier = `${businessName}-${clientIp}`;

  // Rate limiting 체크
  const { allowed, resetAt } = deleteLimiter.check(identifier);
  if (!allowed) {
    return createErrorResponse(
      `삭제 제한 초과. ${new Date(resetAt).toLocaleTimeString()} 이후 재시도하세요.`,
      429
    );
  }

  // ... 기존 삭제 로직 ...
}
```

**3.3 파일 검증**

```typescript
// utils/file-validator.ts (신규 파일)

export const FILE_VALIDATION = {
  MAX_SIZE: 10 * 1024 * 1024, // 10MB
  ALLOWED_TYPES: [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif'
  ],
  MAX_DIMENSION: 8000, // 8000x8000 픽셀
  MIN_DIMENSION: 100   // 100x100 픽셀
};

export interface ValidationError {
  field: string;
  message: string;
}

export class FileValidator {
  static async validate(file: File): Promise<ValidationError[]> {
    const errors: ValidationError[] = [];

    // 1. 파일 크기 검증
    if (file.size > FILE_VALIDATION.MAX_SIZE) {
      errors.push({
        field: 'size',
        message: `파일 크기는 ${FILE_VALIDATION.MAX_SIZE / 1024 / 1024}MB 이하여야 합니다`
      });
    }

    if (file.size === 0) {
      errors.push({
        field: 'size',
        message: '빈 파일은 업로드할 수 없습니다'
      });
    }

    // 2. MIME 타입 검증
    if (!FILE_VALIDATION.ALLOWED_TYPES.includes(file.type)) {
      errors.push({
        field: 'type',
        message: `지원하지 않는 파일 형식입니다. (${file.type})`
      });
    }

    // 3. 이미지 차원 검증
    try {
      const dimensions = await this.getImageDimensions(file);

      if (dimensions.width > FILE_VALIDATION.MAX_DIMENSION ||
          dimensions.height > FILE_VALIDATION.MAX_DIMENSION) {
        errors.push({
          field: 'dimensions',
          message: `이미지 크기는 ${FILE_VALIDATION.MAX_DIMENSION}x${FILE_VALIDATION.MAX_DIMENSION} 이하여야 합니다`
        });
      }

      if (dimensions.width < FILE_VALIDATION.MIN_DIMENSION ||
          dimensions.height < FILE_VALIDATION.MIN_DIMENSION) {
        errors.push({
          field: 'dimensions',
          message: `이미지 크기는 ${FILE_VALIDATION.MIN_DIMENSION}x${FILE_VALIDATION.MIN_DIMENSION} 이상이어야 합니다`
        });
      }
    } catch (error) {
      errors.push({
        field: 'image',
        message: '이미지를 읽을 수 없습니다'
      });
    }

    // 4. 파일명 검증
    if (!/^[\w\-. ]+$/.test(file.name)) {
      errors.push({
        field: 'filename',
        message: '파일명에 특수문자를 사용할 수 없습니다'
      });
    }

    return errors;
  }

  private static getImageDimensions(file: File): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);

      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve({ width: img.width, height: img.height });
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('이미지 로드 실패'));
      };

      img.src = url;
    });
  }
}
```

**업로드 시 적용**:

```typescript
// hooks/useOptimisticUpload.ts 수정

const validateAndUpload = async (file: File) => {
  // 클라이언트 검증
  const errors = await FileValidator.validate(file);
  if (errors.length > 0) {
    console.error('❌ [VALIDATION] 파일 검증 실패:', errors);
    throw new Error(errors.map(e => e.message).join(', '));
  }

  // 업로드 진행
  await uploadFile(file);
};
```

**효과**:
- ✅ 사업장 간 데이터 격리 (RLS)
- ✅ 악의적 대량 업로드 방지 (Rate Limiting)
- ✅ 잘못된 파일 업로드 차단 (Validation)
- ✅ 시스템 안정성 및 보안 강화

**작업 시간**: 4-6시간

---

## 🟡 Phase B: 중요 최적화 (일관성 및 복원력)

### 4. 동시성 제어 (Concurrency Control) ⭐⭐⭐⭐

**문제**: 여러 디바이스에서 같은 파일 동시 수정 시 충돌

**해결**: 버전 관리 + 충돌 감지

#### 구현 계획

**4.1 데이터베이스 스키마 확장**

```sql
-- uploaded_files 테이블에 버전 컬럼 추가
ALTER TABLE uploaded_files
ADD COLUMN version INTEGER DEFAULT 1,
ADD COLUMN last_modified_by TEXT,
ADD COLUMN last_modified_at TIMESTAMPTZ DEFAULT NOW();

-- 버전 자동 증가 트리거
CREATE OR REPLACE FUNCTION increment_version()
RETURNS TRIGGER AS $$
BEGIN
  NEW.version = OLD.version + 1;
  NEW.last_modified_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER auto_increment_version
BEFORE UPDATE ON uploaded_files
FOR EACH ROW EXECUTE FUNCTION increment_version();
```

**4.2 낙관적 잠금 (Optimistic Locking)**

```typescript
// API에서 버전 체크
export async function PUT(request: NextRequest) {
  const { fileId, updates, expectedVersion } = await request.json();

  const adminClient = getSupabaseAdminClient();

  // 현재 버전 확인
  const { data: current } = await adminClient
    .from('uploaded_files')
    .select('version')
    .eq('id', fileId)
    .single();

  if (!current || current.version !== expectedVersion) {
    return createErrorResponse(
      '다른 사용자가 이 파일을 수정했습니다. 새로고침 후 다시 시도하세요.',
      409 // Conflict
    );
  }

  // 업데이트 실행 (트리거가 자동으로 version 증가)
  const { data, error } = await adminClient
    .from('uploaded_files')
    .update({
      ...updates,
      last_modified_by: userId
    })
    .eq('id', fileId)
    .eq('version', expectedVersion) // 조건부 업데이트
    .select()
    .single();

  if (error || !data) {
    return createErrorResponse('동시 수정 충돌', 409);
  }

  return createSuccessResponse(data);
}
```

**4.3 클라이언트 충돌 처리**

```typescript
// 충돌 UI
const ConflictDialog = ({
  localVersion,
  remoteVersion,
  onResolve
}: ConflictDialogProps) => {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md">
        <div className="flex items-center gap-2 text-yellow-600 mb-4">
          <AlertTriangle className="w-6 h-6" />
          <h3 className="text-lg font-semibold">충돌 감지됨</h3>
        </div>

        <p className="text-gray-600 mb-4">
          다른 사용자가 이 파일을 수정했습니다.
        </p>

        <div className="space-y-4">
          <button
            onClick={() => onResolve('keep-local')}
            className="w-full py-2 bg-blue-500 text-white rounded"
          >
            내 변경 사항 유지
          </button>

          <button
            onClick={() => onResolve('accept-remote')}
            className="w-full py-2 bg-gray-200 text-gray-700 rounded"
          >
            최신 버전 수용
          </button>

          <button
            onClick={() => onResolve('merge')}
            className="w-full py-2 bg-gray-100 text-gray-600 rounded"
          >
            병합 시도
          </button>
        </div>
      </div>
    </div>
  );
};
```

**효과**:
- ✅ 동시 수정 충돌 감지
- ✅ 사용자 선택으로 충돌 해결
- ✅ 데이터 손실 방지

**작업 시간**: 3-4시간

---

### 5. 오프라인 지원 (Offline-First) ⭐⭐⭐⭐

**문제**: 네트워크 없으면 작업 불가

**해결**: IndexedDB + Sync Queue

#### 구현 계획

**5.1 IndexedDB 설정**

```typescript
// lib/offline-db.ts (신규 파일)

import Dexie, { Table } from 'dexie';

interface OfflineOperation {
  id: string;
  type: 'upload' | 'delete' | 'update';
  timestamp: number;
  data: any;
  retryCount: number;
  status: 'pending' | 'syncing' | 'failed';
  error?: string;
}

interface CachedFile {
  id: string;
  file: Blob;
  metadata: UploadedFile;
  cachedAt: number;
}

class OfflineDatabase extends Dexie {
  operations!: Table<OfflineOperation, string>;
  cachedFiles!: Table<CachedFile, string>;

  constructor() {
    super('FacilityManagerOffline');

    this.version(1).stores({
      operations: 'id, timestamp, status, type',
      cachedFiles: 'id, cachedAt'
    });
  }
}

export const offlineDB = new OfflineDatabase();
```

**5.2 오프라인 큐 관리자**

```typescript
// lib/offline-queue.ts (신규 파일)

class OfflineQueue {
  private isProcessing = false;

  async addOperation(operation: Omit<OfflineOperation, 'retryCount' | 'status'>) {
    await offlineDB.operations.add({
      ...operation,
      retryCount: 0,
      status: 'pending'
    });

    console.log(`📥 [OFFLINE-QUEUE] 작업 추가: ${operation.type} - ${operation.id}`);

    // 온라인이면 즉시 처리
    if (navigator.onLine) {
      this.processPendingOperations();
    }
  }

  async processPendingOperations() {
    if (this.isProcessing) return;

    this.isProcessing = true;
    console.log(`🔄 [OFFLINE-QUEUE] 대기 중인 작업 처리 시작`);

    try {
      const pending = await offlineDB.operations
        .where('status').equals('pending')
        .toArray();

      for (const operation of pending) {
        await this.processOperation(operation);
      }

      console.log(`✅ [OFFLINE-QUEUE] 모든 작업 처리 완료`);
    } finally {
      this.isProcessing = false;
    }
  }

  private async processOperation(operation: OfflineOperation) {
    try {
      // 상태 업데이트
      await offlineDB.operations.update(operation.id, { status: 'syncing' });

      // 작업 실행
      switch (operation.type) {
        case 'upload':
          await this.syncUpload(operation);
          break;
        case 'delete':
          await this.syncDelete(operation);
          break;
        case 'update':
          await this.syncUpdate(operation);
          break;
      }

      // 성공 시 제거
      await offlineDB.operations.delete(operation.id);
      console.log(`✅ [OFFLINE-QUEUE] 작업 완료: ${operation.id}`);

    } catch (error) {
      const newRetryCount = operation.retryCount + 1;

      if (newRetryCount >= 3) {
        // 3회 실패 시 failed 상태로
        await offlineDB.operations.update(operation.id, {
          status: 'failed',
          retryCount: newRetryCount,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        console.error(`❌ [OFFLINE-QUEUE] 작업 실패 (최종): ${operation.id}`, error);
      } else {
        // 재시도
        await offlineDB.operations.update(operation.id, {
          status: 'pending',
          retryCount: newRetryCount
        });
        console.warn(`⚠️ [OFFLINE-QUEUE] 재시도 예정 (${newRetryCount}/3): ${operation.id}`);
      }
    }
  }

  private async syncUpload(operation: OfflineOperation) {
    const { fileId } = operation.data;
    const cachedFile = await offlineDB.cachedFiles.get(fileId);

    if (!cachedFile) {
      throw new Error('캐시된 파일을 찾을 수 없습니다');
    }

    const formData = new FormData();
    formData.append('file', cachedFile.file, cachedFile.metadata.originalName);
    formData.append('metadata', JSON.stringify(cachedFile.metadata));

    const response = await fetch('/api/uploaded-files-supabase', {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      throw new Error('업로드 실패');
    }

    // 캐시 제거
    await offlineDB.cachedFiles.delete(fileId);
  }

  private async syncDelete(operation: OfflineOperation) {
    const { fileId } = operation.data;

    const response = await fetch(
      `/api/uploaded-files-supabase?fileId=${fileId}`,
      { method: 'DELETE' }
    );

    if (!response.ok) {
      throw new Error('삭제 실패');
    }
  }

  private async syncUpdate(operation: OfflineOperation) {
    const response = await fetch('/api/uploaded-files-supabase', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(operation.data)
    });

    if (!response.ok) {
      throw new Error('업데이트 실패');
    }
  }
}

export const offlineQueue = new OfflineQueue();
```

**5.3 온라인/오프라인 감지**

```typescript
// hooks/useOfflineSync.ts (신규 파일)

export function useOfflineSync() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const updateOnlineStatus = () => {
      setIsOnline(navigator.onLine);

      if (navigator.onLine) {
        console.log(`🌐 [OFFLINE-SYNC] 온라인 복구 - 동기화 시작`);
        offlineQueue.processPendingOperations();
      }
    };

    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);

    return () => {
      window.removeEventListener('online', updateOnlineStatus);
      window.removeEventListener('offline', updateOnlineStatus);
    };
  }, []);

  useEffect(() => {
    const updatePendingCount = async () => {
      const count = await offlineDB.operations
        .where('status').equals('pending')
        .count();
      setPendingCount(count);
    };

    updatePendingCount();
    const interval = setInterval(updatePendingCount, 5000);

    return () => clearInterval(interval);
  }, []);

  return { isOnline, pendingCount };
}
```

**5.4 오프라인 인디케이터**

```typescript
// components/OfflineIndicator.tsx

export function OfflineIndicator() {
  const { isOnline, pendingCount } = useOfflineSync();

  if (isOnline && pendingCount === 0) return null;

  return (
    <div className="fixed top-4 right-4 bg-white border rounded-lg shadow-lg p-3 z-50">
      {!isOnline ? (
        <div className="flex items-center gap-2 text-orange-600">
          <WifiOff className="w-5 h-5" />
          <span className="text-sm font-medium">오프라인 모드</span>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-blue-600">
          <RefreshCw className="w-5 h-5 animate-spin" />
          <span className="text-sm">{pendingCount}개 작업 동기화 중...</span>
        </div>
      )}
    </div>
  );
}
```

**효과**:
- ✅ 오프라인 시에도 작업 가능
- ✅ 온라인 복구 시 자동 동기화
- ✅ 사용자 경험 대폭 향상

**작업 시간**: 6-8시간

---

### 6. 테스트 전략 (Testing Strategy) ⭐⭐⭐⭐

**목적**: 완전한 실시간 동기화의 안정성 검증

#### 구현 계획

**6.1 E2E 테스트 (Playwright)**

```typescript
// tests/e2e/realtime-sync.spec.ts (신규 파일)

import { test, expect } from '@playwright/test';

test.describe('실시간 동기화', () => {
  test('다중 디바이스 업로드 동기화', async ({ browser }) => {
    // 두 브라우저 컨텍스트 생성
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();

    const page1 = await context1.newPage();
    const page2 = await context2.newPage();

    // 같은 사업장 접속
    await page1.goto('/business/테스트사업장');
    await page2.goto('/business/테스트사업장');

    // Page1에서 파일 업로드
    const startTime = Date.now();
    await page1.setInputFiles('input[type=file]', 'tests/fixtures/test.jpg');
    await page1.click('button:has-text("업로드")');

    // Page2에서 1초 이내 파일 표시 확인
    await page2.waitForSelector('img[alt*="test.jpg"]', { timeout: 1000 });
    const syncTime = Date.now() - startTime;

    console.log(`✅ 동기화 시간: ${syncTime}ms`);
    expect(syncTime).toBeLessThan(1000);

    // Page2에서 파일 삭제
    await page2.click('button[aria-label="파일 삭제"]');

    // Page1에서 1초 이내 파일 사라짐 확인
    await page1.waitForSelector('img[alt*="test.jpg"]', {
      state: 'hidden',
      timeout: 1000
    });
  });

  test('네트워크 재연결 시 catch-up', async ({ page, context }) => {
    await page.goto('/business/테스트사업장');

    // 초기 파일 수 확인
    const initialCount = await page.locator('img').count();

    // 네트워크 차단
    await context.setOffline(true);
    await page.waitForSelector('text=실시간 동기화 연결 중');

    // 오프라인 상태에서 API를 통해 파일 3개 추가
    // (다른 디바이스가 업로드했다고 가정)
    await addFilesViaAPI(['file1.jpg', 'file2.jpg', 'file3.jpg']);

    // 5초 대기
    await page.waitForTimeout(5000);

    // 네트워크 복구
    await context.setOffline(false);

    // 3개 파일이 자동으로 표시되는지 확인 (catch-up)
    await page.waitForTimeout(2000); // catch-up 완료 대기
    const finalCount = await page.locator('img').count();
    expect(finalCount).toBe(initialCount + 3);
  });

  test('동시 삭제 충돌 방지', async ({ browser }) => {
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();

    const page1 = await context1.newPage();
    const page2 = await context2.newPage();

    await page1.goto('/business/테스트사업장');
    await page2.goto('/business/테스트사업장');

    // 두 디바이스에서 동시에 같은 파일 삭제 시도
    await Promise.all([
      page1.click('button[data-file-id="test-file-123"]'),
      page2.click('button[data-file-id="test-file-123"]')
    ]);

    // 에러 없이 파일이 한 번만 삭제됨을 확인
    // (중복 삭제 시도가 무시됨)
    await page1.waitForSelector('button[data-file-id="test-file-123"]', {
      state: 'hidden'
    });
  });

  test('오프라인 업로드 후 동기화', async ({ page, context }) => {
    await page.goto('/business/테스트사업장');

    // 네트워크 차단
    await context.setOffline(true);

    // 오프라인 상태에서 파일 업로드
    await page.setInputFiles('input[type=file]', 'tests/fixtures/offline-test.jpg');
    await page.click('button:has-text("업로드")');

    // "오프라인 모드" 인디케이터 확인
    await page.waitForSelector('text=오프라인 모드');

    // 파일이 로컬에 표시됨 (optimistic)
    await page.waitForSelector('img[alt*="offline-test.jpg"]');

    // 네트워크 복구
    await context.setOffline(false);

    // "동기화 중" 인디케이터 확인
    await page.waitForSelector('text=동기화 중');

    // 동기화 완료 후 인디케이터 사라짐
    await page.waitForSelector('text=동기화 중', { state: 'hidden', timeout: 10000 });

    // 파일이 서버에 실제로 저장되었는지 확인
    const fileExists = await checkFileExistsOnServer('offline-test.jpg');
    expect(fileExists).toBe(true);
  });
});

// 헬퍼 함수
async function addFilesViaAPI(filenames: string[]) {
  // Supabase Admin API를 통해 직접 파일 추가
  for (const filename of filenames) {
    await fetch('/api/test-helpers/add-file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename })
    });
  }
}

async function checkFileExistsOnServer(filename: string): Promise<boolean> {
  const response = await fetch(`/api/test-helpers/check-file?filename=${filename}`);
  const data = await response.json();
  return data.exists;
}
```

**6.2 Chaos Testing (혼돈 테스트)**

```typescript
// tests/chaos/network-chaos.spec.ts

test.describe('네트워크 혼돈 테스트', () => {
  test('간헐적 네트워크 끊김', async ({ page, context }) => {
    await page.goto('/business/테스트사업장');

    // 30초 동안 랜덤하게 네트워크 on/off
    const duration = 30000;
    const startTime = Date.now();

    const chaosInterval = setInterval(async () => {
      const isOffline = Math.random() > 0.5;
      await context.setOffline(isOffline);
      console.log(`${Date.now() - startTime}ms: ${isOffline ? 'OFFLINE' : 'ONLINE'}`);
    }, 2000);

    // 혼돈 중에 파일 업로드 시도
    for (let i = 0; i < 5; i++) {
      await page.setInputFiles('input[type=file]', `tests/fixtures/chaos-${i}.jpg`);
      await page.click('button:has-text("업로드")');
      await page.waitForTimeout(3000);
    }

    // 30초 후 혼돈 중지
    await page.waitForTimeout(duration);
    clearInterval(chaosInterval);

    // 네트워크 복구
    await context.setOffline(false);
    await page.waitForTimeout(5000);

    // 모든 파일이 최종적으로 업로드되었는지 확인
    const uploadedCount = await page.locator('img').count();
    expect(uploadedCount).toBeGreaterThanOrEqual(5);
  });
});
```

**효과**:
- ✅ 실제 사용자 시나리오 검증
- ✅ 네트워크 장애 상황 테스트
- ✅ 다중 디바이스 동기화 검증
- ✅ 시스템 안정성 보장

**작업 시간**: 8-10시간

---

## 🟢 Phase C: 성능 최적화 (확장성)

### 7. 성능 최적화 ⭐⭐⭐

**목적**: 대용량 파일(1000개+)에도 부드러운 성능 유지

#### 구현 계획

**7.1 Web Worker로 Realtime 처리**

```typescript
// workers/realtime-processor.worker.ts (신규 파일)

interface RealtimeEvent {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new?: any;
  old?: any;
}

interface ProcessedEvent {
  action: 'add' | 'remove' | 'update';
  data: any;
}

self.onmessage = (event: MessageEvent<RealtimeEvent>) => {
  const processed = processRealtimeEvent(event.data);
  self.postMessage(processed);
};

function processRealtimeEvent(event: RealtimeEvent): ProcessedEvent {
  switch (event.eventType) {
    case 'INSERT':
      return {
        action: 'add',
        data: transformPhotoData(event.new)
      };

    case 'DELETE':
      return {
        action: 'remove',
        data: { id: event.old.id }
      };

    case 'UPDATE':
      return {
        action: 'update',
        data: transformPhotoData(event.new)
      };
  }
}

function transformPhotoData(raw: any) {
  // 무거운 데이터 변환 작업
  const supabaseUrl = 'https://your-project.supabase.co';
  return {
    id: raw.id,
    name: raw.filename || raw.original_filename,
    originalName: raw.original_filename,
    mimeType: raw.mime_type,
    size: raw.file_size,
    createdTime: raw.created_at,
    webViewLink: `${supabaseUrl}/storage/v1/object/public/facility-files/${raw.file_path}`,
    thumbnailUrl: `${supabaseUrl}/storage/v1/object/public/facility-files/${raw.file_path}`,
    folderName: extractFolderName(raw.file_path),
    version: raw.version || 1
  };
}

function extractFolderName(filePath: string): string {
  const parts = filePath.split('/');
  return parts[parts.length - 2] || 'unknown';
}
```

**Worker 사용**:

```typescript
// contexts/FileContext.tsx 수정

const workerRef = useRef<Worker | null>(null);

useEffect(() => {
  // Worker 생성
  workerRef.current = new Worker(
    new URL('../workers/realtime-processor.worker.ts', import.meta.url)
  );

  workerRef.current.onmessage = (event) => {
    const { action, data } = event.data;

    switch (action) {
      case 'add':
        rawAddServerPhoto(data);
        break;
      case 'remove':
        rawRemoveServerPhoto(data.id);
        break;
      case 'update':
        rawUpdateServerPhoto(data.id, data);
        break;
    }

    recomputeDisplayPhotos();
  };

  return () => {
    workerRef.current?.terminate();
  };
}, []);

const handleRealtimeNotification = useCallback((payload: any) => {
  // Worker로 처리 위임
  workerRef.current?.postMessage(payload);
}, []);
```

**7.2 Incremental Loading (점진적 로딩)**

```typescript
// hooks/useIncrementalPhotoLoad.ts

export function useIncrementalPhotoLoad(businessName: string, systemType: string) {
  const [photos, setPhotos] = useState<UploadedFile[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const offsetRef = useRef(0);

  const BATCH_SIZE = 50;

  const loadMore = async () => {
    if (loading || !hasMore) return;

    setLoading(true);

    try {
      const response = await fetch(
        `/api/uploaded-files-supabase?businessName=${businessName}&systemType=${systemType}&offset=${offsetRef.current}&limit=${BATCH_SIZE}`
      );

      const data = await response.json();

      if (data.success && data.data.files) {
        const newFiles = data.data.files;
        setPhotos(prev => [...prev, ...newFiles]);
        offsetRef.current += BATCH_SIZE;
        setHasMore(newFiles.length === BATCH_SIZE);
      }
    } finally {
      setLoading(false);
    }
  };

  // 초기 로드
  useEffect(() => {
    loadMore();
  }, []);

  return { photos, loadMore, hasMore, loading };
}
```

**Intersection Observer로 무한 스크롤**:

```typescript
// components/InfinitePhotoGrid.tsx

export function InfinitePhotoGrid() {
  const { photos, loadMore, hasMore, loading } = useIncrementalPhotoLoad(
    businessName,
    systemType
  );

  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!loadMoreRef.current) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading) {
          loadMore();
        }
      },
      { threshold: 0.1 }
    );

    observerRef.current.observe(loadMoreRef.current);

    return () => observerRef.current?.disconnect();
  }, [hasMore, loading]);

  return (
    <div>
      <PhotoGrid photos={photos} />

      {hasMore && (
        <div ref={loadMoreRef} className="h-20 flex items-center justify-center">
          {loading && <Spinner />}
        </div>
      )}
    </div>
  );
}
```

**효과**:
- ✅ 메인 스레드 부담 감소
- ✅ 대용량 파일도 부드러운 스크롤
- ✅ 초기 로딩 속도 개선

**작업 시간**: 4-6시간

---

### 8. 모니터링 및 디버깅 ⭐⭐⭐

**목적**: 실시간 동기화 시스템의 상태 추적 및 문제 진단

#### 구현 계획

**8.1 개발 환경 디버거**

```typescript
// lib/realtime-debugger.ts (신규 파일)

interface DebugEvent {
  timestamp: number;
  type: 'realtime' | 'operation' | 'sync' | 'error';
  data: any;
  latency?: number;
}

class RealtimeDebugger {
  private events: DebugEvent[] = [];
  private enabled: boolean;

  constructor() {
    this.enabled = process.env.NODE_ENV === 'development';
  }

  logEvent(type: DebugEvent['type'], data: any, latency?: number) {
    if (!this.enabled) return;

    this.events.push({
      timestamp: Date.now(),
      type,
      data,
      latency
    });

    // 최근 1000개만 유지
    if (this.events.length > 1000) {
      this.events = this.events.slice(-1000);
    }
  }

  getMetrics() {
    const realtimeEvents = this.events.filter(e => e.type === 'realtime');
    const errors = this.events.filter(e => e.type === 'error');

    const latencies = realtimeEvents
      .map(e => e.latency)
      .filter((l): l is number => l !== undefined);

    return {
      totalEvents: this.events.length,
      realtimeEvents: realtimeEvents.length,
      errors: errors.length,
      avgLatency: latencies.length > 0
        ? latencies.reduce((a, b) => a + b, 0) / latencies.length
        : 0,
      maxLatency: Math.max(...latencies, 0),
      minLatency: Math.min(...latencies, Infinity),
      errorRate: errors.length / this.events.length,
      lastSync: realtimeEvents[realtimeEvents.length - 1]?.timestamp
    };
  }

  exportLogs() {
    const blob = new Blob([JSON.stringify(this.events, null, 2)], {
      type: 'application/json'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `realtime-debug-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  clear() {
    this.events = [];
  }
}

export const realtimeDebugger = new RealtimeDebugger();
```

**8.2 디버그 UI**

```typescript
// components/RealtimeDebugPanel.tsx

export function RealtimeDebugPanel() {
  const [metrics, setMetrics] = useState(realtimeDebugger.getMetrics());
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setMetrics(realtimeDebugger.getMetrics());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  if (process.env.NODE_ENV !== 'development') return null;

  return (
    <>
      {/* 토글 버튼 */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-4 left-4 bg-purple-500 text-white p-3 rounded-full shadow-lg z-50"
        title="디버그 패널"
      >
        <Bug className="w-5 h-5" />
      </button>

      {/* 디버그 패널 */}
      {isOpen && (
        <div className="fixed bottom-20 left-4 bg-white border rounded-lg shadow-xl p-4 w-96 z-50">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Realtime Debug</h3>
            <button onClick={() => setIsOpen(false)}>
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span>Total Events:</span>
              <span className="font-mono">{metrics.totalEvents}</span>
            </div>

            <div className="flex justify-between">
              <span>Realtime Events:</span>
              <span className="font-mono">{metrics.realtimeEvents}</span>
            </div>

            <div className="flex justify-between">
              <span>Errors:</span>
              <span className={`font-mono ${metrics.errors > 0 ? 'text-red-600' : ''}`}>
                {metrics.errors}
              </span>
            </div>

            <div className="flex justify-between">
              <span>Avg Latency:</span>
              <span className="font-mono">{metrics.avgLatency.toFixed(0)}ms</span>
            </div>

            <div className="flex justify-between">
              <span>Max Latency:</span>
              <span className="font-mono">{metrics.maxLatency.toFixed(0)}ms</span>
            </div>

            <div className="flex justify-between">
              <span>Error Rate:</span>
              <span className={`font-mono ${metrics.errorRate > 0.1 ? 'text-red-600' : ''}`}>
                {(metrics.errorRate * 100).toFixed(1)}%
              </span>
            </div>

            <div className="flex justify-between">
              <span>Last Sync:</span>
              <span className="font-mono text-xs">
                {metrics.lastSync ? new Date(metrics.lastSync).toLocaleTimeString() : 'N/A'}
              </span>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            <button
              onClick={() => realtimeDebugger.exportLogs()}
              className="w-full py-2 bg-blue-500 text-white rounded text-sm"
            >
              Export Logs
            </button>

            <button
              onClick={() => {
                realtimeDebugger.clear();
                setMetrics(realtimeDebugger.getMetrics());
              }}
              className="w-full py-2 bg-gray-200 text-gray-700 rounded text-sm"
            >
              Clear Logs
            </button>
          </div>
        </div>
      )}
    </>
  );
}
```

**8.3 프로덕션 에러 리포팅**

```typescript
// lib/error-reporter.ts

interface ErrorReport {
  error: string;
  stack?: string;
  context: any;
  timestamp: number;
  userAgent: string;
  url: string;
}

export async function reportSyncError(error: Error, context: any) {
  // 프로덕션에서만 실행
  if (process.env.NODE_ENV !== 'production') {
    console.error('[SYNC-ERROR]', error, context);
    return;
  }

  const report: ErrorReport = {
    error: error.message,
    stack: error.stack,
    context,
    timestamp: Date.now(),
    userAgent: navigator.userAgent,
    url: window.location.href
  };

  try {
    await fetch('/api/error-reporting', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(report)
    });
  } catch (reportError) {
    // 에러 리포팅 실패는 조용히 무시
    console.error('Failed to report error:', reportError);
  }
}
```

**효과**:
- ✅ 개발 중 실시간 성능 모니터링
- ✅ 프로덕션 에러 자동 수집
- ✅ 문제 진단 및 디버깅 용이

**작업 시간**: 3-4시간

---

## 📊 구현 로드맵

### Phase A (필수 - 데이터 무결성)
**예상 기간**: 2-3주

1. **상태 레이어 분리** (4-6시간)
   - Week 1, Day 1-2
   - 즉시 구현 시작

2. **Event Sourcing** (6-8시간)
   - Week 1, Day 3-5
   - 데이터베이스 변경 포함

3. **보안 강화** (4-6시간)
   - Week 2, Day 1-2
   - RLS + Rate Limiting

**검증**: Week 2, Day 3-5
- 다중 디바이스 테스트
- 네트워크 재연결 테스트
- 보안 테스트

### Phase B (중요 - 일관성 및 복원력)
**예상 기간**: 2-3주

4. **동시성 제어** (3-4시간)
   - Week 3, Day 1-2
   - 충돌 감지 및 해결

5. **오프라인 지원** (6-8시간)
   - Week 3, Day 3-5
   - IndexedDB + Sync Queue

6. **테스트 전략** (8-10시간)
   - Week 4, Day 1-5
   - E2E + Chaos Testing

**검증**: Week 4, Day 3-5
- 오프라인 시나리오 테스트
- 동시성 충돌 테스트
- 전체 통합 테스트

### Phase C (개선 - 확장성)
**예상 기간**: 1-2주

7. **성능 최적화** (4-6시간)
   - Week 5, Day 1-3
   - Web Worker + Incremental Loading

8. **모니터링** (3-4시간)
   - Week 5, Day 4-5
   - 디버그 도구 + 에러 리포팅

**검증**: Week 6
- 성능 벤치마크
- 대용량 데이터 테스트
- 최종 통합 테스트

---

## 🎯 예상 효과

### 데이터 무결성 (Phase A 후)
- ✅ 파일 사라짐/부활 문제 완전 해결
- ✅ 네트워크 재연결 시 누락 없음
- ✅ 다층 보안으로 안정성 극대화

### 일관성 및 복원력 (Phase B 후)
- ✅ 동시 수정 충돌 자동 감지
- ✅ 오프라인에서도 작업 가능
- ✅ 완전 자동화된 테스트

### 확장성 (Phase C 후)
- ✅ 1000개+ 파일에도 부드러운 성능
- ✅ 실시간 모니터링 및 디버깅
- ✅ 프로덕션 안정성 보장

---

## 📋 체크리스트

### Phase A (필수)
- [ ] 상태 레이어 분리 구현
- [ ] Event Sourcing 데이터베이스 설정
- [ ] Catch-up API 엔드포인트 구현
- [ ] RLS 정책 적용
- [ ] Rate Limiting 구현
- [ ] 파일 검증 로직 추가

### Phase B (중요)
- [ ] 버전 관리 시스템 구현
- [ ] 충돌 감지 UI 구현
- [ ] IndexedDB 설정
- [ ] 오프라인 큐 관리자 구현
- [ ] E2E 테스트 작성
- [ ] Chaos Testing 구현

### Phase C (개선)
- [ ] Web Worker 구현
- [ ] Incremental Loading 구현
- [ ] 디버그 패널 구현
- [ ] 에러 리포팅 시스템 구현

---

**작성일**: 2026-02-05
**작성자**: Claude Sonnet 4.5
**버전**: 1.0
**상태**: 설계 완료, Phase A부터 순차 구현 권장
