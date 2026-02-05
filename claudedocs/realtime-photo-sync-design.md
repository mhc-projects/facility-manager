# 실시간 사진 동기화 시스템 설계

## 📋 개요

사진 업로드/삭제 시 모든 접속한 디바이스에서 즉시 반영되는 실시간 동기화 시스템 설계

## 🎯 목표

- **즉시 반영**: 사진 업로드/삭제 시 1초 이내 모든 디바이스에 반영
- **자동 동기화**: 사용자 액션 없이 자동으로 UI 업데이트
- **충돌 방지**: 동시 편집 시 데이터 무결성 보장
- **효율성**: 불필요한 네트워크 요청 최소화

## 🏗️ 아키텍처

### 1. Supabase Realtime 활용

Supabase는 PostgreSQL의 변경사항을 실시간으로 브로드캐스트하는 기능을 제공합니다.

```typescript
// Supabase Realtime 채널 구독 구조
Browser A                Supabase DB              Browser B
   |                         |                        |
   |--[INSERT photo]-------->|                        |
   |<----[Success]-----------|                        |
   |                         |----[BROADCAST]-------->|
   |                         |                        |--[UI Update]
   |                         |                        |
   |                         |<---[DELETE photo]------|
   |<----[BROADCAST]---------|                        |
   |--[UI Update]            |                        |
```

### 2. 데이터 흐름

```
┌─────────────────────────────────────────────────────────────┐
│ 1. 사진 업로드/삭제 (Device A)                                │
└────────────┬────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Supabase Storage + Database 업데이트                       │
│    - Storage: 파일 저장/삭제                                  │
│    - DB: uploaded_files 테이블 INSERT/UPDATE                  │
└────────────┬────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. PostgreSQL Trigger 발생                                   │
│    - INSERT/UPDATE/DELETE 이벤트 감지                         │
└────────────┬────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. Supabase Realtime Broadcast                              │
│    - 모든 구독자(Devices)에게 변경사항 전송                    │
└────────────┬────────────────────────────────────────────────┘
             │
             ├─────────────────┬─────────────────┬──────────────
             ▼                 ▼                 ▼
        Device A          Device B          Device C
     [UI Auto Update] [UI Auto Update] [UI Auto Update]
```

## 🔧 구현 방법

### Phase 1: Supabase Realtime 설정 (서버 사이드)

#### 1.1 Database Realtime 활성화

```sql
-- Supabase Dashboard에서 실행
-- uploaded_files 테이블에 대한 Realtime 활성화

ALTER PUBLICATION supabase_realtime
ADD TABLE uploaded_files;

-- 또는 모든 테이블에 대해 활성화
ALTER PUBLICATION supabase_realtime
ADD TABLE ALL TABLES;
```

#### 1.2 Row Level Security (RLS) 설정

```sql
-- uploaded_files 테이블 RLS 정책
-- 모든 사용자가 읽기 가능 (실시간 업데이트 수신)
CREATE POLICY "Anyone can view uploaded files"
ON uploaded_files FOR SELECT
USING (true);

-- 인증된 사용자만 INSERT/UPDATE/DELETE 가능
CREATE POLICY "Authenticated users can modify files"
ON uploaded_files FOR ALL
USING (auth.role() = 'authenticated');
```

### Phase 2: 클라이언트 실시간 구독 (프론트엔드)

#### 2.1 Realtime Hook 생성

```typescript
// hooks/useRealtimePhotos.ts
import { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { RealtimeChannel } from '@supabase/supabase-js';

interface RealtimePhotoUpdate {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: any; // 새로운 데이터
  old: any; // 이전 데이터
}

export function useRealtimePhotos(
  businessName: string,
  systemType: string,
  onPhotoChange: (update: RealtimePhotoUpdate) => void
) {
  const [channel, setChannel] = useState<RealtimeChannel | null>(null);
  const supabase = createClientComponentClient();

  useEffect(() => {
    console.log(`🔴 [REALTIME] ${businessName}/${systemType} 실시간 구독 시작`);

    // 채널 생성 및 구독
    const realtimeChannel = supabase
      .channel(`photos:${businessName}:${systemType}`)
      .on(
        'postgres_changes',
        {
          event: '*', // INSERT, UPDATE, DELETE 모두 감지
          schema: 'public',
          table: 'uploaded_files',
          filter: `business_name=eq.${businessName},system_type=eq.${systemType}`
        },
        (payload) => {
          console.log('🔴 [REALTIME] 변경사항 수신:', payload);

          onPhotoChange({
            eventType: payload.eventType as any,
            new: payload.new,
            old: payload.old
          });
        }
      )
      .subscribe((status) => {
        console.log(`🔴 [REALTIME] 구독 상태: ${status}`);
      });

    setChannel(realtimeChannel);

    // 컴포넌트 언마운트 시 구독 해제
    return () => {
      console.log('🔴 [REALTIME] 구독 해제');
      realtimeChannel.unsubscribe();
    };
  }, [businessName, systemType]);

  return { channel };
}
```

#### 2.2 컴포넌트에서 실시간 업데이트 처리

```typescript
// components/ImprovedFacilityPhotoSection.tsx
import { useRealtimePhotos } from '@/hooks/useRealtimePhotos';

export default function ImprovedFacilityPhotoSection({
  businessName,
  currentPhase
}: ImprovedFacilityPhotoSectionProps) {
  const { uploadedFiles, addFile, removeFile, updateFile } = useFileContext();

  // 🔴 실시간 구독 활성화
  useRealtimePhotos(
    businessName,
    mapPhaseToSystemType(currentPhase),
    (update) => {
      console.log('🔴 [REALTIME-UPDATE] 이벤트:', update.eventType);

      switch (update.eventType) {
        case 'INSERT':
          // 새로운 사진 추가
          console.log('📸 [REALTIME] 새 사진 추가:', update.new);
          addFile(update.new);

          // 토스트 알림
          showToast({
            type: 'info',
            message: `${update.new.file_name} 파일이 업로드되었습니다`
          });
          break;

        case 'DELETE':
          // 사진 삭제
          console.log('🗑️ [REALTIME] 사진 삭제:', update.old);
          removeFile(update.old.id);

          showToast({
            type: 'info',
            message: `${update.old.file_name} 파일이 삭제되었습니다`
          });
          break;

        case 'UPDATE':
          // 사진 정보 업데이트
          console.log('✏️ [REALTIME] 사진 업데이트:', update.new);
          updateFile(update.new.id, update.new);
          break;
      }
    }
  );

  // ... 나머지 컴포넌트 로직
}
```

### Phase 3: FileContext 실시간 업데이트 지원

```typescript
// contexts/FileContext.tsx

export function FileProvider({ children }: { children: React.ReactNode }) {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);

  // 🔴 외부에서 파일 추가 (실시간 업데이트용)
  const addFile = useCallback((newFile: UploadedFile) => {
    setUploadedFiles(prev => {
      // 중복 체크 (이미 존재하면 무시)
      if (prev.some(f => f.id === newFile.id)) {
        console.log('⚠️ [REALTIME] 중복 파일 무시:', newFile.id);
        return prev;
      }

      console.log('✅ [REALTIME] 파일 추가:', newFile.file_name);
      return [...prev, newFile];
    });
  }, []);

  // 🔴 외부에서 파일 제거 (실시간 업데이트용)
  const removeFile = useCallback((fileId: string) => {
    setUploadedFiles(prev => {
      const filtered = prev.filter(f => f.id !== fileId);
      console.log(`✅ [REALTIME] 파일 제거: ${fileId}`);
      return filtered;
    });
  }, []);

  // 🔴 외부에서 파일 업데이트 (실시간 업데이트용)
  const updateFile = useCallback((fileId: string, updates: Partial<UploadedFile>) => {
    setUploadedFiles(prev => {
      return prev.map(f =>
        f.id === fileId ? { ...f, ...updates } : f
      );
    });
  }, []);

  return (
    <FileContext.Provider value={{
      uploadedFiles,
      setUploadedFiles,
      addFile,      // 🆕 실시간 추가
      removeFile,   // 🆕 실시간 제거
      updateFile    // 🆕 실시간 업데이트
    }}>
      {children}
    </FileContext.Provider>
  );
}
```

## 🎨 사용자 경험 개선

### 1. 실시간 알림

```typescript
// 다른 사용자의 업로드 시 알림
showToast({
  type: 'info',
  icon: '👤',
  message: '다른 사용자가 사진을 업로드했습니다',
  duration: 3000
});
```

### 2. 애니메이션 효과

```typescript
// 새로 추가된 사진에 하이라이트 효과
<div className={`
  transition-all duration-500
  ${isNewlyAdded ? 'ring-2 ring-blue-500 animate-pulse' : ''}
`}>
  <Image src={photo.url} />
</div>
```

### 3. 충돌 방지 UI

```typescript
// 동시 삭제 시도 시 경고
if (isBeingDeletedByOtherUser) {
  return (
    <div className="bg-yellow-50 border border-yellow-200 p-2 rounded">
      <AlertTriangle className="w-4 h-4 text-yellow-600" />
      <span>다른 사용자가 이 사진을 삭제 중입니다</span>
    </div>
  );
}
```

## 📊 성능 최적화

### 1. 채널 구독 최적화

```typescript
// 필요한 필터만 적용하여 불필요한 업데이트 방지
.on('postgres_changes', {
  event: '*',
  schema: 'public',
  table: 'uploaded_files',
  filter: `business_name=eq.${businessName},system_type=eq.${systemType}`
}, handler)
```

### 2. Debouncing

```typescript
// 짧은 시간 내 여러 업데이트 시 한 번만 처리
const debouncedUpdate = useMemo(
  () => debounce((update) => {
    processRealtimeUpdate(update);
  }, 300),
  []
);
```

### 3. 메모리 관리

```typescript
// 구독 해제 확실히 처리
useEffect(() => {
  return () => {
    channel?.unsubscribe();
  };
}, [channel]);
```

## 🔒 보안 고려사항

### 1. RLS (Row Level Security)

```sql
-- 사용자가 자신의 사업장 데이터만 볼 수 있도록
CREATE POLICY "Users see own business data"
ON uploaded_files FOR SELECT
USING (
  business_name IN (
    SELECT business_name
    FROM user_business_access
    WHERE user_id = auth.uid()
  )
);
```

### 2. 인증 확인

```typescript
// 실시간 구독 전 인증 상태 확인
const { data: { session } } = await supabase.auth.getSession();

if (!session) {
  console.warn('⚠️ [REALTIME] 인증되지 않은 사용자, 구독 불가');
  return;
}
```

## 🧪 테스트 시나리오

### 1. 다중 디바이스 동시 접속

```
Device A: 사진 업로드
Device B: 즉시 새 사진 표시 확인
Device C: 즉시 새 사진 표시 확인
```

### 2. 동시 삭제

```
Device A: 사진 삭제 클릭
Device B: 동시에 같은 사진 삭제 클릭
→ 한 번만 삭제 처리, 충돌 없음
```

### 3. 네트워크 재연결

```
Device A: WiFi 일시 끊김
→ 자동 재구독
→ 놓친 업데이트 자동 동기화
```

## 📈 구현 단계

### Phase 1: 기본 실시간 구독 (1-2일)
- [ ] Supabase Realtime 활성화
- [ ] useRealtimePhotos 훅 생성
- [ ] FileContext에 실시간 메서드 추가

### Phase 2: UI 통합 (1일)
- [ ] ImprovedFacilityPhotoSection 통합
- [ ] 실시간 알림 추가
- [ ] 애니메이션 효과 추가

### Phase 3: 최적화 및 테스트 (1일)
- [ ] 성능 최적화
- [ ] 다중 디바이스 테스트
- [ ] 충돌 시나리오 테스트

## 💡 추가 기능 아이디어

### 1. 사용자 프레즌스 (누가 보고 있는지)

```typescript
// 현재 이 페이지를 보고 있는 사용자 표시
<div className="flex items-center gap-2">
  <Users className="w-4 h-4" />
  <span>3명이 이 페이지를 보고 있습니다</span>
</div>
```

### 2. 실시간 편집 잠금

```typescript
// 누군가 편집 중인 사진은 다른 사람이 편집 불가
if (photo.isBeingEditedBy && photo.isBeingEditedBy !== currentUserId) {
  return <LockedIcon tooltip={`${photo.isBeingEditedBy}님이 편집 중`} />;
}
```

### 3. 업로드 진행률 공유

```typescript
// 다른 사용자의 업로드 진행률도 실시간 표시
<ProgressBar
  progress={otherUserUploadProgress}
  label="홍길동님이 업로드 중..."
/>
```

## 🎯 예상 효과

### 사용성
- ✅ 새로고침 불필요
- ✅ 즉각적인 동기화
- ✅ 협업 효율성 향상

### 기술적
- ✅ WebSocket 기반 실시간 통신
- ✅ 서버 부하 최소화 (Polling 불필요)
- ✅ Supabase 인프라 활용

### 비용
- ✅ 무료 플랜: 월 200,000 Realtime 메시지
- ✅ Pro 플랜: 월 5,000,000 Realtime 메시지
- ✅ 현재 사용량 추정: 월 10,000 메시지 미만

## 📚 참고 자료

- [Supabase Realtime 공식 문서](https://supabase.com/docs/guides/realtime)
- [PostgreSQL Logical Replication](https://www.postgresql.org/docs/current/logical-replication.html)
- [WebSocket Protocol](https://datatracker.ietf.org/doc/html/rfc6455)

---

**작성일**: 2026-02-05
**작성자**: Claude Sonnet 4.5
**버전**: 1.0
**상태**: 설계 완료, 구현 대기
