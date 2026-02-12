# AutocompleteSelectInput 드롭다운 외부 클릭 이슈 분석

**날짜**: 2026-02-12
**페이지**: app/admin/meeting-minutes/create/page.tsx
**컴포넌트**: components/ui/AutocompleteSelectInput.tsx

## 🎯 사용자 보고 이슈

> "참석자 섹션에서 참석자 입력창을 활성화한 상태에서 입력하지 않고 다른 작업을 먼저하려고 아래로 펼쳐진 창을 닫고 싶은데 방법이 없어. 다른 영역을 클릭하면 참석자 입력칸이 닫히게 세팅되어야해. 그리고 안건 섹션의 담당자 입력칸도 마찬가지야."

**영향 받는 영역**:
1. **참석자 섹션** (lines 391-486): `AutocompleteSelectInput` for participant name
2. **안건 섹션 - 담당자** (lines 545-564): `AutocompleteSelectInput` for assignee

## 📋 코드 분석 결과

### ✅ 외부 클릭 감지 로직 존재 확인

`AutocompleteSelectInput.tsx` **lines 62-84**에 외부 클릭 감지 로직이 **정상적으로 구현**되어 있음:

```typescript
useEffect(() => {
  const handleClickOutside = (event: MouseEvent) => {
    if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
      setIsOpen(false)

      if (allowCustomValue && inputValue) {
        onChange('', inputValue)
      } else {
        const selected = options.find(opt => opt.id === value)
        if (selected) {
          setInputValue(selected.name)
        } else {
          setInputValue('')
        }
      }
    }
  }

  document.addEventListener('mousedown', handleClickOutside)
  return () => document.removeEventListener('mousedown', handleClickOutside)
}, [value, options, allowCustomValue, inputValue, onChange])
```

**로직 흐름**:
1. `mousedown` 이벤트를 document에 등록
2. 클릭 대상이 `containerRef` 외부인지 확인
3. 외부 클릭 시 `setIsOpen(false)` 호출하여 드롭다운 닫기
4. `allowCustomValue` 여부에 따라 값 처리 분기

### 🔍 의존성 배열 분석

```typescript
[value, options, allowCustomValue, inputValue, onChange]
```

**잠재적 문제점**:
- `onChange` 함수가 재생성될 때마다 이벤트 리스너 재등록
- 부모 컴포넌트에서 `onChange`를 인라인 함수로 전달하면 매 렌더링마다 재생성
- 불필요한 이벤트 리스너 재등록으로 인한 성능 저하 및 메모리 누수 가능성

### 🎯 사용 현황 분석

#### 1. 참석자 섹션 (line 413)
```typescript
<AutocompleteSelectInput
  value={participant.employee_id || ''}
  onChange={(selectedId, selectedName) => {
    const selectedEmployee = employees.find(e => e.id === selectedId)
    // ... 로직
  }}
  options={employees.map(e => ({
    id: e.id,
    name: `${e.name} (${e.department || ''} ${e.position || ''})`.trim()
  }))}
  placeholder="이름..."
  allowCustomValue={true}
  className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
/>
```

**특징**:
- `allowCustomValue={true}`: 수동 입력 허용
- 인라인 `onChange` 함수 사용 (매 렌더링마다 재생성)

#### 2. 안건 담당자 (line 549)
```typescript
<AutocompleteSelectInput
  value={item.assignee_id || ''}
  onChange={(id, name) => {
    const updated = [...agenda]
    updated[index] = {
      ...updated[index],
      assignee_id: id,
      assignee_name: name
    }
    setAgenda(updated)
  }}
  options={employees.map(e => ({ id: e.id, name: e.name }))}
  placeholder="담당자 선택"
  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
/>
```

**특징**:
- `allowCustomValue` 미지정 (기본값 `false`)
- 인라인 `onChange` 함수 사용

## ⚠️ 가설: 문제가 발생하는 경우

### 시나리오 1: onChange 함수 재생성 문제
```
1. 사용자가 입력창 클릭 → 드롭다운 열림 (isOpen=true)
2. participants 또는 agenda 배열 업데이트
3. 부모 컴포넌트 리렌더링
4. onChange 함수 재생성
5. useEffect 의존성 변경 감지
6. 이벤트 리스너 제거 및 재등록
7. [타이밍 이슈] 재등록 전 클릭 이벤트 발생 시 감지 실패
```

### 시나리오 2: React 18 Strict Mode 이중 렌더링
```
1. 개발 환경에서 Strict Mode 활성화
2. useEffect cleanup 함수 실행 → 이벤트 리스너 제거
3. useEffect 재실행 → 이벤트 리스너 재등록
4. [타이밍 이슈] cleanup과 재등록 사이 클릭 이벤트 누락
```

### 시나리오 3: 이벤트 버블링 차단
```
1. 부모 컴포넌트나 다른 요소에서 event.stopPropagation()
2. mousedown 이벤트가 document까지 전파되지 않음
3. handleClickOutside 함수 호출 안 됨
```

## 🛠️ 해결 방안

### 방안 1: useCallback으로 onChange 함수 안정화 ⭐ **추천**

```typescript
// 참석자 섹션
const handleParticipantChange = useCallback((index: number) =>
  (selectedId: string, selectedName: string) => {
    const selectedEmployee = employees.find(e => e.id === selectedId)
    // ... 로직
  }, [employees]
)

// 안건 담당자
const handleAgendaAssigneeChange = useCallback((index: number) =>
  (id: string, name: string) => {
    const updated = [...agenda]
    updated[index] = {
      ...updated[index],
      assignee_id: id,
      assignee_name: name
    }
    setAgenda(updated)
  }, [agenda]
)
```

**장점**:
- onChange 함수가 매 렌더링마다 재생성되지 않음
- useEffect 의존성 안정화
- 이벤트 리스너 불필요한 재등록 방지

### 방안 2: AutocompleteSelectInput 개선 (근본 해결)

#### 2-1. useCallback으로 handleClickOutside 안정화

```typescript
const handleClickOutside = useCallback((event: MouseEvent) => {
  if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
    setIsOpen(false)

    if (allowCustomValue && inputValue) {
      onChange('', inputValue)
    } else {
      const selected = options.find(opt => opt.id === value)
      if (selected) {
        setInputValue(selected.name)
      } else {
        setInputValue('')
      }
    }
  }
}, [value, options, allowCustomValue, inputValue, onChange])

useEffect(() => {
  document.addEventListener('mousedown', handleClickOutside)
  return () => document.removeEventListener('mousedown', handleClickOutside)
}, [handleClickOutside])
```

**문제**: `onChange`가 여전히 의존성에 포함되므로 근본 해결 안 됨

#### 2-2. ref를 사용한 최신 상태 접근 (완전 해결)

```typescript
const onChangeRef = useRef(onChange)

useEffect(() => {
  onChangeRef.current = onChange
}, [onChange])

const handleClickOutside = useCallback((event: MouseEvent) => {
  if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
    setIsOpen(false)

    if (allowCustomValue && inputValue) {
      onChangeRef.current('', inputValue)
    } else {
      const selected = options.find(opt => opt.id === value)
      if (selected) {
        setInputValue(selected.name)
      } else {
        setInputValue('')
      }
    }
  }
}, [value, options, allowCustomValue, inputValue])

useEffect(() => {
  document.addEventListener('mousedown', handleClickOutside)
  return () => document.removeEventListener('mousedown', handleClickOutside)
}, [handleClickOutside])
```

**장점**:
- onChange를 의존성 배열에서 제거
- 이벤트 리스너 재등록 최소화
- 최신 onChange 함수 항상 참조

### 방안 3: 이벤트 타입 변경 (mousedown → click)

**현재**: `mousedown` 이벤트 사용
**대안**: `click` 이벤트 사용

```typescript
document.addEventListener('click', handleClickOutside, true) // capture phase
```

**장점**:
- 이벤트 버블링 차단에도 동작 (capture phase 사용)
- 일부 브라우저에서 더 안정적인 동작

**단점**:
- mousedown과 동작 타이밍이 다름
- 드래그 동작과 혼동 가능

## 🧪 검증 계획

### 1. 브라우저 개발자 도구 디버깅

```javascript
// AutocompleteSelectInput.tsx의 handleClickOutside에 로그 추가
const handleClickOutside = (event: MouseEvent) => {
  console.log('[DEBUG] Click outside detected', {
    target: event.target,
    containerRef: containerRef.current,
    contains: containerRef.current?.contains(event.target as Node)
  })

  if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
    console.log('[DEBUG] Closing dropdown')
    setIsOpen(false)
    // ...
  }
}
```

### 2. useEffect 재등록 추적

```typescript
useEffect(() => {
  console.log('[DEBUG] Event listener registered', { value, inputValue })

  document.addEventListener('mousedown', handleClickOutside)
  return () => {
    console.log('[DEBUG] Event listener cleanup')
    document.removeEventListener('mousedown', handleClickOutside)
  }
}, [value, options, allowCustomValue, inputValue, onChange])
```

### 3. React DevTools Profiler

- 컴포넌트 렌더링 횟수 확인
- onChange 함수 재생성 빈도 측정

## 📊 우선순위 권장

1. **즉시 적용** (방안 2-2): AutocompleteSelectInput의 onChange ref 패턴 적용
   - 근본 원인 해결
   - 모든 사용처에 영향
   - 안정성 향상

2. **보조 적용** (방안 1): 부모 컴포넌트에서 useCallback 사용
   - 성능 최적화
   - 불필요한 리렌더링 방지

3. **검증 단계**: 디버깅 로그 추가 및 실제 동작 확인
   - 문제 재현 가능 여부 확인
   - 특정 시나리오 식별

## 🎯 결론

**외부 클릭 감지 로직은 이미 구현되어 있으나**, `onChange` 함수가 매 렌더링마다 재생성되면서 이벤트 리스너가 불필요하게 재등록되는 **타이밍 이슈**로 인해 간헐적으로 외부 클릭이 감지되지 않을 가능성이 있습니다.

**권장 조치**:
1. `AutocompleteSelectInput.tsx`에서 `onChangeRef` 패턴 적용
2. 부모 컴포넌트에서 `useCallback`으로 `onChange` 함수 안정화
3. 디버깅 로그 추가하여 실제 동작 검증

이 조치를 통해 드롭다운이 외부 클릭 시 **안정적으로 닫히도록** 개선할 수 있습니다.
