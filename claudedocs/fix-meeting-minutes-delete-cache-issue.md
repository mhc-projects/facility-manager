# 회의록 삭제 후 UI 미갱신 버그 수정

## 문제 상황

admin/meeting-minutes 페이지에서 회의록 삭제 버튼을 클릭하면:
- ✅ DELETE API 호출 성공
- ✅ "회의록이 삭제되었습니다." 알림 표시
- ❌ UI에서 삭제된 항목이 사라지지 않음

## 원인 분석

### 1. DELETE API는 정상 작동
`app/api/meeting-minutes/[id]/route.ts`의 DELETE 메서드는 정상적으로 데이터베이스에서 회의록을 삭제했습니다.

### 2. onRefresh 콜백도 정상 호출
```typescript
// app/admin/meeting-minutes/page.tsx (line 371)
if (result.success) {
  alert('회의록이 삭제되었습니다.')
  onRefresh() // ✅ loadMeetingMinutes 함수 호출됨
}
```

### 3. 실제 문제: 브라우저 캐시
`loadMeetingMinutes` 함수가 호출되었지만, **fetch API가 캐시된 응답을 반환**하여 삭제 전 데이터를 다시 표시했습니다.

```typescript
// 문제가 있던 코드 (line 88-89)
const response = await fetch(`/api/meeting-minutes?${params}`)
// ❌ 브라우저가 캐시된 응답 반환 가능
```

## 해결 방법

### fetch 옵션에 `cache: 'no-store'` 추가

**파일**: `app/admin/meeting-minutes/page.tsx:88-91`

```typescript
// Before (캐시 사용)
const response = await fetch(`/api/meeting-minutes?${params}`)

// After (캐시 비활성화)
const response = await fetch(`/api/meeting-minutes?${params}`, {
  cache: 'no-store'
})
```

## 동작 원리

### cache: 'no-store' 옵션
- **브라우저 캐시 완전 비활성화**: 항상 서버에서 새로운 데이터를 가져옴
- **Next.js 캐시도 비활성화**: Next.js의 Data Cache도 우회
- **실시간 데이터 보장**: 삭제/수정 후 즉시 최신 상태 반영

### 데이터 플로우
```
1. 사용자가 삭제 버튼 클릭
   ↓
2. DELETE /api/meeting-minutes/[id] 호출 → DB에서 삭제
   ↓
3. onRefresh() 콜백 호출 → loadMeetingMinutes() 실행
   ↓
4. fetch(..., { cache: 'no-store' }) → 캐시 무시하고 서버 요청
   ↓
5. 최신 데이터 수신 (삭제된 항목 제외)
   ↓
6. setMinutes(result.data.items) → UI 업데이트 ✅
```

## 다른 캐시 옵션 비교

| 옵션 | 설명 | 적합한 경우 |
|------|------|------------|
| `'no-store'` | 캐시 완전 비활성화, 매번 서버 요청 | **실시간 데이터 필수** (이번 케이스) |
| `'force-cache'` | 캐시 우선, 없으면 서버 요청 | 정적 데이터, 변경 빈도 낮음 |
| `'reload'` | 항상 서버 요청, 응답은 캐시에 저장 | 주기적 업데이트 필요 |
| `'no-cache'` | 재검증 필수, 변경 없으면 캐시 사용 | 조건부 캐싱 |

## 테스트 시나리오

### ✅ 카드 뷰에서 삭제
1. admin/meeting-minutes 페이지 접속 (카드 뷰)
2. 회의록 카드 우측 상단 삭제 버튼 클릭
3. 확인 다이얼로그에서 "확인" 클릭
4. **즉시 UI에서 카드가 사라짐** ← 수정 완료

### ✅ 테이블 뷰에서 삭제
1. admin/meeting-minutes 페이지 접속
2. 테이블 뷰로 전환
3. "작업" 열의 삭제 버튼 클릭
4. 확인 다이얼로그에서 "확인" 클릭
5. **즉시 UI에서 행이 사라짐** ← 수정 완료

### ✅ 통계 카운트 업데이트
- 삭제 후 상단 통계 카드의 숫자도 즉시 업데이트됨
- 예: "전체 10" → "전체 9"

## 관련 파일

### 수정된 파일
- `app/admin/meeting-minutes/page.tsx` (line 88-91)

### 관련 파일 (변경 없음)
- `app/api/meeting-minutes/[id]/route.ts` - DELETE API (정상 작동)
- `app/api/meeting-minutes/route.ts` - GET API (정상 작동)

## 빌드 결과

✅ **빌드 성공** - TypeScript 컴파일 오류 없음

```bash
npm run build
✓ Compiled successfully
Route (app)                              Size     First Load JS
├ ○ /admin/meeting-minutes               4.02 kB         161 kB
```

## 추가 고려사항

### 성능 최적화
현재 `cache: 'no-store'`로 모든 요청이 서버로 전달됩니다. 만약 성능이 문제가 된다면:

1. **낙관적 UI 업데이트** 고려:
```typescript
// 삭제 즉시 로컬 상태에서 제거
setMinutes(prev => prev.filter(m => m.id !== minute.id))
// 백그라운드에서 서버 동기화
```

2. **SWR 또는 React Query** 도입:
- 자동 재검증과 캐시 무효화 기능
- 낙관적 업데이트 내장 지원

### 다른 페이지 확인
비슷한 패턴이 있는 페이지도 확인 필요:
- `app/admin/tasks/page.tsx` (시설 업무 관리)
- 기타 CRUD 작업이 있는 관리 페이지

## 결론

**한 줄 요약**: 브라우저 캐시 때문에 삭제 후에도 구 데이터가 표시되었으며, `cache: 'no-store'` 옵션으로 해결했습니다.

**핵심 교훈**:
- 실시간 데이터가 중요한 곳에서는 캐시 전략을 신중히 선택해야 함
- DELETE/POST/PUT 후 목록을 다시 불러올 때는 `cache: 'no-store'` 필수
