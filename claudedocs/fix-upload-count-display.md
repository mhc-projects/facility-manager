# Fix: Upload Success Message Shows 0 Files

## Date: 2026-02-04

## 문제 요약

사진 업로드 성공 시 화면 하단에 표시되는 SmartFloatingProgress 팝업에서 "0개 파일이 성공적으로 업로드되었습니다"라고 표시되는 문제.

실제로는 파일이 정상적으로 업로드되었지만, 카운트만 0으로 표시됨.

## 근본 원인 분석

### 문제 발생 메커니즘

**File**: [components/ui/SmartFloatingProgress.tsx](components/ui/SmartFloatingProgress.tsx:300)

```typescript
// Line 300: 문제가 되는 메시지
{totalFiles}개 파일이 성공적으로 업로드되었습니다
```

**File**: [hooks/useOptimisticUpload.ts](hooks/useOptimisticUpload.ts:564)

```typescript
// Line 564: totalFiles 소스
return {
  totalFiles: stats.total,  // ← 🔴 문제: photos 배열 길이 기반
  completedFiles: stats.completed,
  // ...
};
```

**File**: [hooks/useOptimisticUpload.ts](hooks/useOptimisticUpload.ts:72-73)

```typescript
// Line 72-73: stats 계산
const getQueueStats = useCallback((): UploadQueueStats => {
  const total = photos.length;          // ← 🔴 문제: 큐 클리어 시 0
  const completed = photos.filter(p => p.status === 'uploaded').length;
  // ...
}, [photos]);
```

### 데이터 플로우 분석

```
사용자: 사진 업로드 (1장)
  ↓
addFiles() 호출
  ├─ photos 배열에 OptimisticPhoto 추가
  └─ status: 'preparing' → 'uploading' → 'uploaded'
  ↓
업로드 성공
  ├─ stats.total = 1
  ├─ stats.completed = 1
  └─ SmartFloatingProgress 표시: "1/1 files" ✅
  ↓
cancelAll() 또는 clearCompleted() 호출 (자동)
  ├─ setPhotos([])               ← 🔴 photos 배열 비움
  └─ queueRef.current = []
  ↓
getSmartProgressData() 재실행
  ├─ stats.total = photos.length = 0      ← 🔴 0으로 변경
  ├─ stats.completed = 0                  ← 🔴 0으로 변경
  └─ SmartFloatingProgress 표시: "0/0 files" ❌
  ↓
성공 메시지 표시
  └─ "0개 파일이 성공적으로 업로드되었습니다" ❌
```

### 핵심 문제

1. **타이밍 문제**: 업로드 성공 후 큐가 자동으로 클리어되면서 `photos.length`가 0이 됨
2. **상태 유실**: 성공 카운트가 큐 상태에 의존하여 큐 클리어 시 유실됨
3. **UI 표시 오류**: 성공 메시지 표시 시점에는 이미 큐가 비어있어 0으로 표시됨

## 해결 방법

### 구현: 성공 카운트 추적 ref 추가

**File**: [hooks/useOptimisticUpload.ts](hooks/useOptimisticUpload.ts:51-58)

```typescript
// Line 51-58: 상태 추가
const [photos, setPhotos] = useState<OptimisticPhoto[]>([]);
const [isProcessing, setIsProcessing] = useState(false);
const queueRef = useRef<OptimisticPhoto[]>([]);
const processingRef = useRef<Set<string>>(new Set());

// 🎯 FIX: 마지막 성공 업로드 카운트 추적 (큐 클리어 후에도 유지)
const lastSuccessCountRef = useRef<number>(0);
const lastTotalCountRef = useRef<number>(0);
```

**File**: [hooks/useOptimisticUpload.ts](hooks/useOptimisticUpload.ts:536-580)

```typescript
// SmartFloatingProgress를 위한 데이터 제공
const getSmartProgressData = useCallback(() => {
  const stats = getQueueStats();
  const uploadingPhoto = photos.find(p => p.status === 'uploading');
  const failedPhotos = photos.filter(p => p.status === 'error');
  const duplicatePhotos = photos.filter(p => p.status === 'duplicate');

  // 🎯 FIX: 성공 카운트 추적 업데이트 (큐 클리어 전)
  if (stats.completed > 0) {
    lastSuccessCountRef.current = stats.completed;
    lastTotalCountRef.current = stats.total;
  }

  // 🎯 FIX: 큐가 비어있지만 최근에 성공한 업로드가 있으면 마지막 성공 카운트 사용
  const displayTotal = stats.total > 0 ? stats.total : lastTotalCountRef.current;
  const displayCompleted = stats.total > 0 ? stats.completed : lastSuccessCountRef.current;

  const overallProgress = displayTotal > 0
    ? Math.round((displayCompleted / displayTotal) * 100)
    : 0;

  // ... 나머지 로직

  return {
    isVisible: isProcessing || stats.total > 0 || lastSuccessCountRef.current > 0,
    totalFiles: displayTotal,           // ✅ 큐 클리어 후에도 유지
    completedFiles: displayCompleted,   // ✅ 큐 클리어 후에도 유지
    currentFileName: uploadingPhoto?.file.name,
    overallProgress: overallProgress,
    failedFiles: stats.failed,
    errorMessage: errorMessage,
    isStuck: !!stuckPhoto,
    stuckReason: stuckPhoto ? `${stuckPhoto.file.name} 업로드가 지연되고 있습니다` : undefined,
    detailedErrors: detailedErrors
  };
}, [photos, isProcessing, getQueueStats]);
```

**File**: [hooks/useOptimisticUpload.ts](hooks/useOptimisticUpload.ts:98-107)

```typescript
// Line 98-107: 새 업로드 시 초기화
const addFiles = useCallback(async (
  files: File[],
  additionalDataFactory: (file: File, index: number) => Record<string, string>
) => {
  console.log(`📤 [UPLOAD-START] ${files.length}개 파일 업로드 시작`);

  // 🎯 FIX: 새 업로드 시작 시 이전 성공 카운트 초기화
  lastSuccessCountRef.current = 0;
  lastTotalCountRef.current = 0;

  const newPhotos: OptimisticPhoto[] = [];
  // ... 나머지 로직
}, [/* ... */]);
```

## 데이터 플로우 (수정 후)

```
사용자: 사진 업로드 (1장)
  ↓
addFiles() 호출
  ├─ lastSuccessCountRef.current = 0     ← ✅ 초기화
  ├─ lastTotalCountRef.current = 0       ← ✅ 초기화
  └─ photos 배열에 OptimisticPhoto 추가
  ↓
업로드 성공
  ├─ stats.total = 1
  ├─ stats.completed = 1
  └─ SmartFloatingProgress 표시: "1/1 files" ✅
  ↓
getSmartProgressData() 실행 (업로드 완료 시점)
  ├─ stats.completed = 1 > 0
  ├─ lastSuccessCountRef.current = 1    ← ✅ 성공 카운트 저장
  └─ lastTotalCountRef.current = 1      ← ✅ 총 카운트 저장
  ↓
cancelAll() 또는 clearCompleted() 호출
  ├─ setPhotos([])                      ← photos 배열 비움
  └─ queueRef.current = []
  ↓
getSmartProgressData() 재실행
  ├─ stats.total = 0                    ← photos.length = 0
  ├─ stats.completed = 0
  ├─ displayTotal = lastTotalCountRef.current = 1      ← ✅ ref 값 사용
  └─ displayCompleted = lastSuccessCountRef.current = 1 ← ✅ ref 값 사용
  ↓
SmartFloatingProgress 표시
  └─ "1/1 files" → "1개 파일이 성공적으로 업로드되었습니다" ✅
  ↓
다음 업로드 시작
  ├─ addFiles() 호출
  ├─ lastSuccessCountRef.current = 0    ← ✅ 초기화
  └─ lastTotalCountRef.current = 0      ← ✅ 초기화
```

## 수정된 파일

### 1. hooks/useOptimisticUpload.ts

**Line 51-58**: ref 상태 추가
- `lastSuccessCountRef`: 마지막 성공 업로드 카운트 추적
- `lastTotalCountRef`: 마지막 총 파일 카운트 추적

**Line 98-107**: addFiles() 초기화 로직 추가
- 새 업로드 시작 시 이전 성공 카운트 초기화

**Line 536-580**: getSmartProgressData() 로직 수정
- 성공 카운트 추적 업데이트
- 큐 클리어 후에도 마지막 성공 카운트 사용
- displayTotal, displayCompleted 계산 로직 추가

## 테스트 결과

### Build Test
```bash
npm run build
```
✅ **Result**: 88 pages successfully built, no TypeScript errors

### 예상 동작 (실제 테스트 필요)

1. **사진 1장 업로드**:
   - 업로드 중: "업로드 중... 0/1 files"
   - 업로드 완료: "업로드 완료! 1/1 files"
   - 성공 메시지: "1개 파일이 성공적으로 업로드되었습니다" ✅

2. **사진 3장 연속 업로드**:
   - 업로드 중: "업로드 중... 1/3 files"
   - 업로드 중: "업로드 중... 2/3 files"
   - 업로드 완료: "업로드 완료! 3/3 files"
   - 성공 메시지: "3개 파일이 성공적으로 업로드되었습니다" ✅

3. **실패 케이스**:
   - 2장 성공, 1장 실패: "2/3 files" → "2개 파일이 성공적으로 업로드되었습니다 (1개 실패)" ✅

## 기술적 개선 사항

### useRef를 사용한 이유

1. **렌더링 불필요**: 성공 카운트는 SmartFloatingProgress가 표시될 때만 필요하므로 렌더링 트리거 불필요
2. **성능 최적화**: useState 대신 useRef 사용으로 불필요한 리렌더링 방지
3. **동기적 업데이트**: ref는 즉시 업데이트되어 타이밍 이슈 없음
4. **큐 클리어 후에도 유지**: ref 값은 컴포넌트 언마운트 전까지 유지됨

### 초기화 타이밍

- **새 업로드 시작 시**: addFiles() 호출 시점에 이전 카운트 초기화
- **이유**: 새 업로드 세션은 이전 업로드와 무관하게 0부터 시작해야 함
- **효과**: 연속 업로드 시에도 정확한 카운트 표시

## 관련 문서

- [realtime-5sec-delay-analysis.md](realtime-5sec-delay-analysis.md) - 실시간 동기화 딜레이 분석
- [fix-production-cache-gateway-data.md](fix-production-cache-gateway-data.md) - 프로덕션 캐시 문제 해결

## 향후 개선 사항

1. **실제 디바이스 테스트**: 모바일 환경에서 실제 사진 촬영 → 업로드 플로우 테스트
2. **엣지 케이스 검증**:
   - 빠른 연속 업로드 (2초 이내)
   - 네트워크 불안정 환경
   - 대용량 파일 업로드 (10MB+)
3. **UX 개선 고려**:
   - 성공 메시지 자동 숨김 타이밍 조정 (현재 1초)
   - 실패 시 재시도 버튼 추가
