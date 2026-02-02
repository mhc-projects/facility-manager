# 미해결 반복 이슈 패널 접기/펼치기 UX 개선

## 문제점

기존에는 X 버튼으로 패널을 접으면 다시 펼칠 방법이 없었습니다:
- ❌ 패널 접기 후 헤더가 완전히 사라짐
- ❌ 다시 펼치기 위한 UI가 없음
- ❌ X 아이콘이 접기/펼치기 동작을 직관적으로 표현하지 못함

## 해결 방법

### 1. 아이콘 변경
**변경 전**: X (닫기) 아이콘
**변경 후**: ChevronUp/ChevronDown (접기/펼치기) 아이콘

```typescript
// Before
import { AlertCircle, RefreshCw, X } from 'lucide-react'
<X className="w-3 h-3" />

// After
import { AlertCircle, RefreshCw, ChevronUp, ChevronDown } from 'lucide-react'
{isExpanded ? (
  <ChevronUp className="w-3 h-3" />
) : (
  <ChevronDown className="w-3 h-3" />
)}
```

### 2. 헤더 클릭 영역 확장
헤더 전체를 클릭 가능하게 만들어 접기/펼치기 조작성 향상:

```typescript
<div
  className="flex items-center justify-between p-2 bg-blue-100 cursor-pointer hover:bg-blue-200 transition-colors"
  onClick={() => setIsExpanded(!isExpanded)}
>
```

**추가된 클래스**:
- `cursor-pointer`: 클릭 가능함을 시각적으로 표시
- `hover:bg-blue-200`: 호버 시 배경색 변경으로 인터랙션 피드백
- `transition-colors`: 부드러운 색상 전환

### 3. 이벤트 전파 방지
헤더를 클릭 가능하게 만들면서 버튼 클릭 시 이벤트 전파를 방지:

```typescript
// 새로고침 버튼
<button
  onClick={(e) => {
    e.stopPropagation() // 헤더 클릭 이벤트 전파 방지
    fetchRecurringIssues()
  }}
>

// 접기/펼치기 버튼
<button
  onClick={(e) => {
    e.stopPropagation() // 헤더 클릭 이벤트 전파 방지
    setIsExpanded(!isExpanded)
  }}
>
```

### 4. 새로고침 버튼 조건부 표시
접힌 상태에서는 새로고침 버튼 숨김 (심플한 UI 유지):

```typescript
{isExpanded && (
  <button
    onClick={(e) => {
      e.stopPropagation()
      fetchRecurringIssues()
    }}
    disabled={loading}
    className="p-1 text-blue-600 hover:bg-blue-300 rounded transition-colors disabled:opacity-50"
    title="새로고침"
  >
    <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
  </button>
)}
```

## 사용자 경험 개선

### Before
1. 사용자가 X 버튼 클릭
2. 패널이 완전히 사라짐
3. ❌ 다시 펼칠 방법이 없음
4. ❌ 페이지 새로고침 필요

### After
1. 사용자가 ChevronUp 아이콘 또는 헤더 클릭
2. 패널 내용만 접히고 헤더는 유지됨
3. ✅ 헤더에 ChevronDown 아이콘 표시
4. ✅ 헤더 또는 ChevronDown 클릭으로 다시 펼침

## UI 상태별 동작

### 펼쳐진 상태 (isExpanded = true)
```
┌─────────────────────────────────────────┐
│ 🔵 미해결 반복 이슈 [3]  🔄  ⬆️         │ ← 클릭 가능한 헤더
├─────────────────────────────────────────┤
│ 💡 이전 정기회의에서 미해결된...        │
│ ┌───────┐ ┌───────┐ ┌───────┐          │
│ │이슈 1 │ │이슈 2 │ │이슈 3 │          │
│ └───────┘ └───────┘ └───────┘          │
└─────────────────────────────────────────┘
```

### 접힌 상태 (isExpanded = false)
```
┌─────────────────────────────────────────┐
│ 🔵 미해결 반복 이슈 [3]       ⬇️         │ ← 클릭 가능한 헤더
└─────────────────────────────────────────┘
```

## 인터랙션 개선

### 클릭 가능 영역
- **헤더 전체**: 접기/펼치기 토글
- **새로고침 버튼**: 이슈 목록 새로고침 (펼쳐진 상태에서만 표시)
- **ChevronUp/Down 버튼**: 접기/펼치기 토글

### 시각적 피드백
- **호버 시**: 헤더 배경색 변경 (`bg-blue-100` → `bg-blue-200`)
- **버튼 호버**: 버튼 배경색 변경 (`hover:bg-blue-300`)
- **커서 변경**: `cursor-pointer`로 클릭 가능함을 표시
- **아이콘 변화**: 상태에 따라 ChevronUp ↔ ChevronDown

## 접근성 개선

### title 속성
```typescript
title={isExpanded ? '접기' : '펼치기'}
```
- 상태에 따라 동적으로 툴팁 텍스트 변경
- 스크린 리더 사용자에게 명확한 정보 제공

### 키보드 접근성
- 헤더 전체가 클릭 가능하여 큰 타겟 영역 제공
- 버튼 요소로 키보드 네비게이션 지원

## 관련 파일

### 수정된 파일
- `components/admin/meeting-minutes/RecurringIssuesPanel.tsx`
  - Line 6: 아이콘 import 변경 (X → ChevronUp, ChevronDown)
  - Line 117-166: 헤더 UI 전면 개선

## 빌드 결과

✅ **빌드 성공** - TypeScript 컴파일 오류 없음

```bash
npm run build
✓ Compiled successfully
Route (app)                                    Size     First Load JS
├ ○ /admin/meeting-minutes/create             6.94 kB         164 kB
```

## 테스트 시나리오

### ✅ 패널 접기
1. 정기회의 생성 페이지 접속
2. 미해결 반복 이슈 섹션 확인
3. ChevronUp 버튼 또는 헤더 클릭
4. **패널 내용이 접히고 헤더는 유지됨**

### ✅ 패널 펼치기
1. 접힌 상태에서 ChevronDown 버튼 또는 헤더 클릭
2. **패널 내용이 다시 나타남**

### ✅ 새로고침 버튼
1. 펼쳐진 상태에서 새로고침 버튼 표시 확인
2. 접힌 상태에서 새로고침 버튼 숨김 확인

### ✅ 호버 피드백
1. 헤더 위에 마우스 올리기
2. **배경색이 bg-blue-100 → bg-blue-200으로 변경**
3. **커서가 pointer로 변경**

## UX 원칙 적용

### 1. 일관성 (Consistency)
- Chevron 아이콘은 업계 표준 접기/펼치기 UI 패턴
- 다른 아코디언 컴포넌트와 동일한 인터랙션

### 2. 피드백 (Feedback)
- 호버 시 시각적 피드백 제공
- 아이콘이 현재 상태를 명확히 표현

### 3. 가시성 (Visibility)
- 항상 헤더가 표시되어 기능 존재를 알 수 있음
- 이슈 개수 배지로 중요도 표시

### 4. 허용 오차 (Error Prevention)
- 큰 클릭 영역으로 조작 실수 방지
- 이벤트 전파 방지로 의도하지 않은 동작 방지

## 결론

**한 줄 요약**: 헤더 클릭 영역 확장과 Chevron 아이콘으로 직관적인 아코디언 UI 구현

**핵심 개선사항**:
- ✅ 접힌 상태에서도 헤더 유지로 다시 펼칠 수 있음
- ✅ Chevron 아이콘으로 동작 의도 명확화
- ✅ 헤더 전체 클릭으로 조작성 향상
- ✅ 호버 피드백으로 인터랙션 가이드
