# 참석자 입력창 드롭다운 겹침 이슈 분석

**날짜**: 2026-02-12
**페이지**: app/admin/meeting-minutes/create/page.tsx
**컴포넌트**: AutocompleteSelectInput (참석자 섹션)

## 🎯 사용자 보고 이슈

> "참석자 섹션에서 첫 번째 참석자 입력칸은 외부 클릭 시 잘 닫히는데, 두 번째부터는 외부 클릭을 해도 안 닫히고 있어. 그리고 첫 번째 칸은 외부로 표시되고 있어."

**증상**:
1. ❌ 첫 번째 참석자 드롭다운이 두 번째 입력창 위에 겹침
2. ❌ 두 번째 입력창을 클릭할 수 없음 (드롭다운이 가로막음)
3. ❌ 외부 클릭이 안 되는 것처럼 보임 (실제로는 두 번째 입력창을 클릭할 수 없는 것)
4. ❓ 첫 번째가 "외부"로 표시됨

## 📸 문제 재현

### Playwright 테스트 결과

```
1. 참석자 추가 버튼 클릭 → 첫 번째 참석자 추가 ✅
2. 참석자 추가 버튼 클릭 → 두 번째 참석자 추가 ✅
3. 첫 번째 입력창 클릭 → 드롭다운 열림 ✅
4. 두 번째 입력창 클릭 시도 → ❌ TIMEOUT
   Error: "subtree intercepts pointer events"
   → 첫 번째 드롭다운이 두 번째 입력창을 가로막음
```

**스크린샷**: `participant-dropdown-overlap-issue.png`

## 🔍 근본 원인 분석

### 문제 1: 부모 레이아웃 구조

**현재 코드** ([page.tsx:410-412](app/admin/meeting-minutes/create/page.tsx#L410-L412)):

```tsx
{participants.map((participant, index) => (
  <div key={index} className="flex items-center gap-2 p-2 bg-gray-50 rounded">
    {/* 이름 자동완성 입력 */}
    <div className="flex-1 min-w-0">
      <AutocompleteSelectInput ... />
    </div>
    ...
  </div>
))}
```

**문제점**:
```
<div className="space-y-1.5">  ← 참석자 리스트 컨테이너
  <div className="flex items-center ...">  ← 첫 번째 참석자
    <div className="flex-1 min-w-0">
      <AutocompleteSelectInput>
        <div className="relative">  ← 컴포넌트 내부 relative
          <input />
          <div className="absolute z-50 ...">  ← 드롭다운
            드롭다운 아이템들
          </div>
        </div>
      </AutocompleteSelectInput>
    </div>
  </div>
  <div className="flex items-center ...">  ← 두 번째 참석자 (겹침 발생!)
    ...
  </div>
</div>
```

### 문제 2: z-index와 overflow 설정

**AutocompleteSelectInput 드롭다운** ([AutocompleteSelectInput.tsx:207](components/ui/AutocompleteSelectInput.tsx#L207)):

```tsx
<div className="absolute z-50 w-full mt-1 bg-white border ...">
  {/* 드롭다운 내용 */}
</div>
```

**레이아웃 계산**:
1. 첫 번째 참석자의 `AutocompleteSelectInput`은 `relative` 컨테이너 내부
2. 드롭다운은 `absolute` + `z-50`으로 위치 설정
3. `absolute` 위치는 가장 가까운 `relative` 조상을 기준으로 계산
4. **부모가 `space-y-1.5`이므로 다음 요소와 1.5rem 간격만 유지**
5. **드롭다운이 `absolute`로 떠있어서 공간을 차지하지 않음**
6. **결과**: 드롭다운이 두 번째 참석자 위에 겹침

### 문제 3: "외부"로 표시되는 이유

**현재 코드** ([page.tsx:453-460](app/admin/meeting-minutes/create/page.tsx#L453-L460)):

```tsx
{participant.name && (
  <span className={`text-xs px-1.5 py-0.5 rounded whitespace-nowrap ${
    participant.is_internal
      ? 'text-blue-600 bg-blue-50'  // 내부
      : 'text-gray-600 bg-gray-200'  // 외부
  }`}>
    {participant.is_internal ? '내부' : '외부'}
  </span>
)}
```

**로직 분석**:
- 첫 번째 참석자가 "외부"로 표시됨
- `participant.is_internal === false` 상태

**onChange 핸들러 확인** ([page.tsx:415-440](app/admin/meeting-minutes/create/page.tsx#L415-L440)):

```tsx
onChange={(selectedId, selectedName) => {
  const selectedEmployee = employees.find(e => e.id === selectedId)

  if (selectedEmployee) {
    // 내부 직원 선택 → is_internal: true
    ...
  } else {
    // 수동 입력 (외부 참석자) → is_internal: false
    ...
  }
}}
```

**원인**:
- `AutocompleteSelectInput`이 빈 상태로 시작
- `participant.employee_id || ''` → `''` (빈 문자열)
- 외부 클릭 시 `allowCustomValue=true`이므로 빈 문자열로 `onChange` 호출
- `selectedEmployee === undefined` → `is_internal: false` 설정
- **결과**: 아무것도 입력하지 않았는데 "외부"로 표시됨

## 🛠️ 해결 방안

### 방안 1: 부모 컨테이너에 overflow 설정 ⭐ **추천**

```tsx
{participants.map((participant, index) => (
  <div key={index} className="flex items-center gap-2 p-2 bg-gray-50 rounded relative">
    {/* ↑ relative 추가로 드롭다운 위치 기준점 변경 */}
    <div className="flex-1 min-w-0">
      <AutocompleteSelectInput ... />
    </div>
    ...
  </div>
))}
```

**장점**:
- 간단한 수정 (한 단어 추가)
- 각 참석자 행이 독립적인 위치 기준점 제공
- 드롭다운이 자신의 부모 행 기준으로 위치 계산

**단점**:
- 드롭다운이 너무 길면 잘릴 수 있음 (overflow 문제)

### 방안 2: AutocompleteSelectInput에 Portal 사용 (근본 해결)

```tsx
// AutocompleteSelectInput.tsx
import { createPortal } from 'react-dom'

export default function AutocompleteSelectInput({ ... }) {
  // ... 기존 코드 ...

  return (
    <div ref={containerRef} className="relative">
      {/* 입력 필드 */}
      <div className="relative">
        <input ... />
        <ChevronDown ... />
      </div>

      {/* 드롭다운을 Portal로 렌더링 */}
      {isOpen && (
        createPortal(
          <div
            className="absolute z-50 w-full mt-1 bg-white border ..."
            style={{
              top: inputRef.current?.getBoundingClientRect().bottom + window.scrollY,
              left: inputRef.current?.getBoundingClientRect().left + window.scrollX,
              width: inputRef.current?.getBoundingClientRect().width
            }}
          >
            {/* 드롭다운 내용 */}
          </div>,
          document.body
        )
      )}
    </div>
  )
}
```

**장점**:
- 완전한 해결 (overflow 문제 없음)
- 드롭다운이 항상 다른 요소 위에 표시됨
- 스크롤 시에도 정확한 위치 유지

**단점**:
- 복잡도 증가
- 위치 계산 로직 필요

### 방안 3: z-index 계층 조정

```tsx
{participants.map((participant, index) => (
  <div
    key={index}
    className="flex items-center gap-2 p-2 bg-gray-50 rounded"
    style={{ zIndex: participants.length - index }}
  >
    {/* 위에 있는 참석자일수록 높은 z-index */}
    ...
  </div>
))}
```

**장점**:
- 간단한 구현
- 동적 z-index 할당

**단점**:
- 근본 해결이 아님
- 스크롤이나 다른 상황에서 여전히 문제 가능

### 방안 4: "외부" 표시 문제 해결

```tsx
{participant.name && (  // ← 이름이 있을 때만 표시
  <span className={`text-xs px-1.5 py-0.5 rounded whitespace-nowrap ${
    participant.is_internal
      ? 'text-blue-600 bg-blue-50'
      : 'text-gray-600 bg-gray-200'
  }`}>
    {participant.is_internal ? '내부' : '외부'}
  </span>
)}
```

**현재 문제**:
- `participant.name`이 빈 문자열(`''`)일 때도 truthy로 평가됨
- `allowCustomValue`로 인해 빈 입력값도 `onChange` 호출

**수정안 1**: 빈 이름 체크 강화

```tsx
{participant.name && participant.name.trim() && (
  <span ...>
    {participant.is_internal ? '내부' : '외부'}
  </span>
)}
```

**수정안 2**: onChange 핸들러 개선

```tsx
onChange={(selectedId, selectedName) => {
  const selectedEmployee = employees.find(e => e.id === selectedId)

  if (selectedEmployee) {
    // 내부 직원 선택
    const updated = [...participants]
    updated[index] = {
      ...updated[index],
      name: selectedEmployee.name,
      role: selectedEmployee.position || selectedEmployee.department || '',
      employee_id: selectedEmployee.id,
      is_internal: true
    }
    setParticipants(updated)
  } else if (selectedName && selectedName.trim()) {  // ← 빈 문자열 체크 추가
    // 수동 입력 (외부 참석자)
    const updated = [...participants]
    const { employee_id, ...restParticipant } = updated[index]
    updated[index] = {
      ...restParticipant,
      name: selectedName.trim(),
      role: '',
      is_internal: false
    }
    setParticipants(updated)
  }
  // else: 빈 입력값은 무시
}}
```

## 📊 권장 조치

### 즉시 적용 (방안 1 + 4)

```tsx
// 1. 참석자 행에 relative 추가
<div key={index} className="flex items-center gap-2 p-2 bg-gray-50 rounded relative">
  <div className="flex-1 min-w-0">
    <AutocompleteSelectInput
      value={participant.employee_id || ''}
      onChange={(selectedId, selectedName) => {
        const selectedEmployee = employees.find(e => e.id === selectedId)

        if (selectedEmployee) {
          // 내부 직원 선택
          const updated = [...participants]
          updated[index] = {
            ...updated[index],
            name: selectedEmployee.name,
            role: selectedEmployee.position || selectedEmployee.department || '',
            employee_id: selectedEmployee.id,
            is_internal: true
          }
          setParticipants(updated)
        } else if (selectedName && selectedName.trim()) {  // ← 빈 문자열 체크
          // 수동 입력 (외부 참석자)
          const updated = [...participants]
          const { employee_id, ...restParticipant } = updated[index]
          updated[index] = {
            ...restParticipant,
            name: selectedName.trim(),
            role: '',
            is_internal: false
          }
          setParticipants(updated)
        }
        // 빈 입력값은 무시
      }}
      ...
    />
  </div>

  {/* 2. 이름이 실제로 있을 때만 배지 표시 */}
  {participant.name && participant.name.trim() && (
    <span className={`text-xs px-1.5 py-0.5 rounded whitespace-nowrap ${
      participant.is_internal
        ? 'text-blue-600 bg-blue-50'
        : 'text-gray-600 bg-gray-200'
    }`}>
      {participant.is_internal ? '내부' : '외부'}
    </span>
  )}
  ...
</div>
```

### 장기 개선 (방안 2)

AutocompleteSelectInput에 Portal 적용하여 근본적으로 겹침 문제 해결

## 🎯 결론

**문제 요약**:
1. ❌ 드롭다운 겹침: 부모 레이아웃 구조 문제 (`relative` 부재)
2. ❌ "외부" 표시: 빈 입력값도 onChange 호출되어 `is_internal: false` 설정

**해결책**:
1. ✅ ~~참석자 행에 `relative` 클래스 추가~~ → **실패** (겹침 문제 지속)
2. ✅ **Portal 기반 렌더링 적용** → **성공** (완전한 해결)
3. ✅ onChange 핸들러에 빈 문자열 체크 추가
4. ✅ 배지 표시 조건 강화 (`name.trim()` 체크)

**적용된 해결책 (방안 2 - Portal)**:
- `components/ui/AutocompleteSelectInput.tsx` 수정
- `createPortal`을 사용하여 드롭다운을 `document.body`에 직접 렌더링
- `getBoundingClientRect()`로 정확한 위치 계산
- 스크롤/리사이즈 이벤트 처리로 위치 자동 업데이트

**검증 결과** (Playwright 테스트):
- ✅ 첫 번째 참석자 입력 → 드롭다운 열림
- ✅ 두 번째 참석자 입력 클릭 → **타임아웃 없이 정상 작동**
- ✅ 외부 클릭 → 드롭다운 정상 닫힘
- ✅ 세 번째 참석자도 동일하게 정상 작동

**최종 효과**:
- ✅ 드롭다운이 `document.body`에 Portal로 렌더링되어 절대 겹치지 않음
- ✅ 모든 참석자 입력 필드가 독립적으로 정상 작동
- ✅ 외부 클릭 감지 완벽 동작
- ✅ 빈 입력값은 "외부"로 표시되지 않음

**스크린샷**: `participant-dropdown-portal-fix-success.png`
