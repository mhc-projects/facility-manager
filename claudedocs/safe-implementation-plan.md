# 안전한 실시간 동기화 구현 계획

## ✅ 즉시 적용 가능 (안전 보장)

### 1. Phase 1.1: 연결 시점 최적화 (15분)

**파일**: `contexts/FileContext.tsx`

```typescript
// Line 203 수정
// ❌ 기존
autoConnect: !!businessName,

// ✅ 개선
autoConnect: !!businessName && !!currentBusinessId,
```

**효과**:
- 잘못된 business_id로 필터링 방지
- 다른 사업장 파일 표시/삭제 방지
- 연결 안정성 향상

**위험도**: 없음

---

### 2. Phase 1.2: 중복 방지 윈도우 확대 (10분)

**파일**: `contexts/FileContext.tsx`

```typescript
// Line 17 수정
// ❌ 기존
const DEDUP_WINDOW_MS = 2000;

// ✅ 개선
const DEDUP_WINDOW_MS = 5000; // 네트워크 지연 대응
```

**효과**:
- 느린 네트워크에서도 중복 이벤트 방지
- 모바일 환경 안정성 향상

**위험도**: 없음 (ID 기반 필터링이므로 다른 사용자 영향 없음)

---

### 3. Phase 2.1: 동기화 상태 표시 (30분)

**새 파일**: `components/RealtimeSyncIndicator.tsx`

```typescript
'use client';

import { useFileContext } from '@/contexts/FileContext';
import { Wifi, WifiOff } from 'lucide-react';

export function RealtimeSyncIndicator() {
  const { realtimeConnected } = useFileContext();

  // 연결 중일 때만 표시
  if (realtimeConnected) return null;

  return (
    <div className="fixed bottom-20 right-4 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2 shadow-sm flex items-center gap-2 z-40">
      <WifiOff className="w-4 h-4 text-yellow-600 animate-pulse" />
      <span className="text-xs text-yellow-700">실시간 동기화 연결 중...</span>
    </div>
  );
}
```

**통합**: `components/ImprovedFacilityPhotoSection.tsx`

```typescript
import { RealtimeSyncIndicator } from '@/components/RealtimeSyncIndicator';

// JSX 내부 추가
<>
  {/* 기존 컴포넌트들 */}
  <RealtimeSyncIndicator />
</>
```

**효과**:
- 사용자에게 동기화 상태 명확히 전달
- 네트워크 문제 인지 가능

**위험도**: 없음 (UI만 추가)

---

### 4. Phase 2.2: 실시간 알림 (30분)

**파일**: `contexts/FileContext.tsx`

**설치 필요**:
```bash
npm install sonner
```

**수정**:
```typescript
import { toast } from 'sonner';

// handleRealtimeNotification 내부 수정 (Line 145-193)
switch (eventType) {
  case 'INSERT':
    if (newRecord && newRecord.file_path) {
      // ... 기존 파일 추가 로직 ...

      // ✅ 추가: 로컬 업데이트가 아닌 경우만 알림
      if (!recentLocalUpdatesRef.current.has(recordId) && !exists) {
        toast.info('새 사진이 추가되었습니다', {
          description: newFile.originalName,
          duration: 2000,
          icon: '📷'
        });
      }
    }
    break;

  case 'DELETE':
    if (oldRecord) {
      // ... 기존 삭제 로직 ...

      // ✅ 추가: 로컬 업데이트가 아닌 경우만 알림
      if (!recentLocalUpdatesRef.current.has(recordId)) {
        toast.info('사진이 삭제되었습니다', {
          description: oldRecord.original_filename,
          duration: 2000,
          icon: '🗑️'
        });
      }
    }
    break;
}
```

**Toaster 추가**: `app/layout.tsx`

```typescript
import { Toaster } from 'sonner';

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {children}
        <Toaster position="bottom-center" />
      </body>
    </html>
  );
}
```

**효과**:
- 다른 사용자의 업로드/삭제 즉시 인지
- 협업 효율성 향상

**위험도**: 없음 (알림만 추가, 로직 변경 없음)

---

## ⚠️ 재설계 후 적용 (현재 보류)

### Phase 1.3: 초기 동기화 개선

**문제**:
- 원래 설계의 `syncMissedChanges()`는 optimistic updates와 충돌
- 업로드 중인 파일이 사라지거나 삭제한 파일이 부활할 수 있음

**안전한 수정안**:

```typescript
const syncMissedChanges = async () => {
  try {
    console.log(`🔄 [REALTIME-SYNC] 초기 동기화 시작`);

    // 1. 서버에서 최신 파일 목록 가져오기
    const response = await fetch(
      `/api/uploaded-files-supabase?businessName=${businessName}&systemType=${systemType}`
    );
    const data = await response.json();

    if (!data.success || !data.data?.files) {
      console.warn('⚠️ [REALTIME-SYNC] 서버 응답 없음, 동기화 건너뜀');
      return;
    }

    const serverFiles = data.data.files;
    const currentPhotos = getPhotosFromStore();

    // 2. 🔑 핵심: 현재 업로드/삭제 중인 optimistic photos 보존
    const optimisticPhotos = currentPhotos.filter(p => {
      const isUploading = p.uploadStatus === 'uploading' ||
                         p.uploadStatus === 'pending' ||
                         p.uploadStatus === 'preparing';

      const isOptimistic = !p.id || p.id.startsWith('optimistic-');

      return isUploading || isOptimistic;
    });

    // 3. 서버 파일과 optimistic 병합 (중복 제거)
    const serverIds = new Set(serverFiles.map(f => f.id));
    const preservedOptimistic = optimisticPhotos.filter(p =>
      !p.id || !serverIds.has(p.id)
    );

    // 4. 안전한 병합
    const merged = [...serverFiles, ...preservedOptimistic];
    rawSetPhotos(merged);

    console.log(`✅ [REALTIME-SYNC] 동기화 완료`, {
      서버: serverFiles.length,
      optimistic보존: preservedOptimistic.length,
      총합: merged.length
    });

  } catch (error) {
    console.error('❌ [REALTIME-SYNC] 동기화 실패:', error);
    // 에러 발생 시 현재 상태 유지 (덮어쓰지 않음)
  }
};

// Realtime 연결 시 호출
onConnect: () => {
  console.log(`📡 [FILE-REALTIME] Realtime 연결됨 - 초기 동기화 시작`);
  syncMissedChanges();
},
```

**적용 조건**:
- Phase 1.1, 1.2가 안정적으로 동작한 후
- 충분한 테스트 완료 후
- 사용자가 업로드 중 깜빡임 없는지 확인 후

---

## ❌ 적용하지 않음

### Phase 3.1: 배치 업데이트

**이유**:
1. 500ms 지연으로 즉각적 피드백 사라짐
2. 설계 목표 "1초 이내 반영"과 충돌
3. 순서 보장 문제로 파일 삭제 위험
4. 현재 시스템이 이미 충분히 빠름

**대안**:
- 현재 즉시 업데이트 방식 유지
- React 18의 자동 배칭 활용 (이미 적용됨)
- 필요 시 react-window의 가상화로 성능 해결 (이미 적용됨)

---

## 📋 구현 순서

### Step 1: 안전한 변경사항 적용 (1.5시간)

```bash
# 1. Phase 1.1 + 1.2 적용 (25분)
# contexts/FileContext.tsx 수정

# 2. Phase 2.1 적용 (30분)
# components/RealtimeSyncIndicator.tsx 생성
# components/ImprovedFacilityPhotoSection.tsx 통합

# 3. Phase 2.2 적용 (30분)
npm install sonner
# contexts/FileContext.tsx에 토스트 추가
# app/layout.tsx에 Toaster 추가

# 4. 테스트 (15분)
# - 다중 디바이스 동시 업로드/삭제
# - 네트워크 끊김/재연결
# - 동기화 상태 표시 확인
```

### Step 2: Phase 1.3 재설계 버전 준비 (나중)

```bash
# 1. 충분한 로컬 테스트
# 2. 프로덕션 배포 전 스테이징 환경 검증
# 3. 사용자 피드백 수집
# 4. 안정성 확인 후 적용
```

---

## 🧪 필수 테스트 시나리오

### Test 1: 다중 디바이스 동시 업로드
```
Device A: 사진 3개 업로드
Device B: 1초 이내 3개 모두 표시 확인
Device C: 1초 이내 3개 모두 표시 확인
```

### Test 2: 중복 방지
```
Device A: 사진 업로드
→ 로컬 즉시 표시
→ Realtime 이벤트 수신 (중복 무시 확인)
→ 사진이 두 번 추가되지 않음 확인
```

### Test 3: 네트워크 재연결
```
Device A: WiFi 끊김 (5초)
→ "실시간 동기화 연결 중..." 표시 확인
→ WiFi 복구
→ 자동 재연결 확인
→ 인디케이터 사라짐 확인
```

### Test 4: 다른 사용자 알림
```
Device A: 사진 업로드
Device B: 토스트 "📷 새 사진이 추가되었습니다" 확인
Device A: 사진 삭제
Device B: 토스트 "🗑️ 사진이 삭제되었습니다" 확인
```

---

## 🎯 예상 효과

### Phase 1.1 + 1.2 적용 후:
- ✅ 잘못된 필터링으로 인한 오작동 제거
- ✅ 네트워크 지연 시 중복 이벤트 방지
- ✅ 안정성 향상

### Phase 2 적용 후:
- ✅ 사용자가 동기화 상태 명확히 인지
- ✅ 다른 사용자의 작업 실시간 확인
- ✅ 협업 효율성 향상

---

**작성일**: 2026-02-05
**버전**: 1.0 (안전성 검증 완료)
**상태**: Phase 1.1, 1.2, Phase 2 즉시 적용 가능
