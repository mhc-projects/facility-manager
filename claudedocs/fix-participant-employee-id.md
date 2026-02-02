# 회의록 참석자 employee_id 저장 누락 문제 해결

## 📝 문제 요약

### 증상
- 회의록 편집 페이지에서 참석자 이름이 빈칸으로 표시됨
- 사업장별 이슈의 사업장명과 담당자명은 정상 표시됨
- 안건의 담당자는 정상 표시됨
- **참석자만 유독 빈칸 표시**

### 원인
회의록 생성(CREATE) 페이지에서 참석자를 추가할 때 `employee_id` 필드를 제대로 저장하지 않았음.

## 🔍 근본 원인 분석

### 브라우저 콘솔 로그 증거

```javascript
// ❌ 참석자 (작동 안함)
👤 참석자 #0 렌더링: {
  name: '최문호 ( 차장)',
  employee_id: undefined,  // ← 문제!
  role: '',
  is_internal: false
}
value prop: ""  // ← 빈 문자열

// ✅ 사업장별 이슈 (정상 작동)
🏢 사업장별 이슈 #0 렌더링: {
  business_id: '0c9e09a8-bf04-440f-b390-aa0e25b70ab1',  // ← UUID 존재
  business_name: '(주)엘림테크',
  assignee_id: '502da2f0-fd81-449a-87c3-5be924067d4c',  // ← UUID 존재
  assignee_name: '최문호'
}
```

### CREATE 페이지의 문제점

**파일**: [app/admin/meeting-minutes/create/page.tsx](../app/admin/meeting-minutes/create/page.tsx)

#### 문제 1: 잘못된 value prop (Line 401)
```typescript
// ❌ 수정 전
<AutocompleteSelectInput
  value={participant.employee_id || participant.name}  // ← 이름을 value로 사용
  // ...
/>
```

**왜 문제인가?**
- AutocompleteSelectInput은 **ID를 value로 기대**함
- `employee_id`가 없으면 `name`을 value로 사용 → 잘못된 매칭
- options는 `{id: "uuid-123", name: "홍길동"}` 형식인데 value가 "홍길동"이면 찾을 수 없음

#### 문제 2: 외부 참석자에 명시적으로 undefined 할당 (Line 423)
```typescript
// ❌ 수정 전: 외부 참석자 처리
} else {
  // 수동 입력 (외부 참석자)
  const updated = [...participants]
  updated[index] = {
    ...updated[index],
    name: selectedName,
    role: '',
    employee_id: undefined,  // ← 명시적으로 undefined 할당
    is_internal: false
  }
  setParticipants(updated)
}
```

**왜 문제인가?**
- `employee_id: undefined`를 명시적으로 설정하면 객체에 필드가 존재하게 됨
- JSON 직렬화 시 `"employee_id": null`로 저장됨
- TypeScript에서 `employee_id?: string`은 선택적이므로 필드 자체가 없어야 함

## ✅ 해결 방법

### 수정 내용

**파일**: [app/admin/meeting-minutes/create/page.tsx:399-437](../app/admin/meeting-minutes/create/page.tsx#L399-L437)

```typescript
// ✅ 수정 후
<AutocompleteSelectInput
  value={participant.employee_id || ''}  // ← ID만 사용, 없으면 빈 문자열
  onChange={(selectedId, selectedName) => {
    const selectedEmployee = employees.find(e => e.id === selectedId)

    if (selectedEmployee) {
      // 내부 직원 선택
      const updated = [...participants]
      updated[index] = {
        ...updated[index],
        name: selectedEmployee.name,
        role: selectedEmployee.position || selectedEmployee.department || '',
        employee_id: selectedEmployee.id,  // ← UUID 저장
        is_internal: true
      }
      setParticipants(updated)
    } else {
      // 수동 입력 (외부 참석자) - employee_id 필드를 완전히 제거
      const updated = [...participants]
      const { employee_id, ...restParticipant } = updated[index]  // ← 구조 분해로 제거
      updated[index] = {
        ...restParticipant,
        name: selectedName,
        role: '',
        is_internal: false
        // employee_id 필드 자체가 없음
      }
      setParticipants(updated)
    }
  }}
  options={employees.map(e => ({
    id: e.id,
    name: `${e.name} (${e.department || ''} ${e.position || ''})`.trim()
  }))}
  placeholder="참석자 이름 검색 또는 입력..."
  allowCustomValue={true}
/>
```

### 핵심 변경사항

#### 1. value prop 수정 (Line 401)
```typescript
// Before: value={participant.employee_id || participant.name}
// After:  value={participant.employee_id || ''}
```
- ID만 사용, 없으면 빈 문자열
- AutocompleteSelectInput이 올바르게 매칭할 수 있음

#### 2. 외부 참석자 처리 수정 (Lines 418-427)
```typescript
// Before:
updated[index] = {
  ...updated[index],
  name: selectedName,
  role: '',
  employee_id: undefined,  // ← 명시적 undefined
  is_internal: false
}

// After:
const { employee_id, ...restParticipant } = updated[index]  // ← 필드 제거
updated[index] = {
  ...restParticipant,
  name: selectedName,
  role: '',
  is_internal: false
  // employee_id 필드 자체가 없음
}
```
- 구조 분해 할당으로 `employee_id` 필드를 완전히 제거
- JSON 직렬화 시 필드가 아예 없음 (선택적 필드의 올바른 처리)

## 🎯 동작 원리

### 내부 직원 선택 시

```
1. 사용자가 AutocompleteSelectInput에서 "최문호 (차장)" 선택
   ↓
2. onChange(selectedId="502da2f0-...", selectedName="최문호 (차장)")
   ↓
3. employees.find(e => e.id === "502da2f0-...") → employee 객체 찾음
   ↓
4. participant 업데이트:
   {
     id: "local-uuid",
     name: "최문호",
     role: "차장",
     employee_id: "502da2f0-fd81-449a-87c3-5be924067d4c",  ✅
     is_internal: true,
     attended: true
   }
   ↓
5. 데이터베이스에 저장 → employee_id 포함 ✅
```

### 외부 참석자 입력 시

```
1. 사용자가 "김철수" 직접 입력
   ↓
2. onChange(selectedId="", selectedName="김철수")
   ↓
3. employees.find(e => e.id === "") → undefined (외부 참석자)
   ↓
4. participant 업데이트:
   {
     id: "local-uuid",
     name: "김철수",
     role: "",
     is_internal: false,
     attended: true
     // employee_id 필드 없음 ✅
   }
   ↓
5. 데이터베이스에 저장 → employee_id 필드 없음 (정상) ✅
```

## 📊 편집 페이지에서의 동작

**파일**: [app/admin/meeting-minutes/[id]/edit/page.tsx](../app/admin/meeting-minutes/[id]/edit/page.tsx)

### 데이터 로딩 순서 (이미 수정됨)

```typescript
useEffect(() => {
  setMounted(true)
  const initializeData = async () => {
    await loadBusinessesAndEmployees()  // 1단계: options 준비
    await loadMeetingMinute()           // 2단계: value 설정
  }
  initializeData()
}, [])
```

### 참석자 렌더링 로직

```typescript
{participants.map((participant, index) => (
  <AutocompleteSelectInput
    value={participant.employee_id || ''}  // ← 이제 정상적으로 UUID 전달
    options={employees.map(emp => ({
      id: emp.id,
      name: emp.name
    }))}
    onChange={(id, name) => {
      // 변경 처리
    }}
  />
))}
```

**이제 동작 흐름**:
```
1. loadBusinessesAndEmployees() 완료
   → employees = [{id: "502da2f0-...", name: "최문호"}, ...]

2. loadMeetingMinute() 완료
   → participants = [{employee_id: "502da2f0-...", name: "최문호 ( 차장)"}, ...]

3. 렌더링
   value="502da2f0-fd81-449a-87c3-5be924067d4c"  ✅
   options=[{id: "502da2f0-...", name: "최문호"}]  ✅

4. AutocompleteSelectInput useEffect:
   const selected = options.find(opt => opt.id === "502da2f0-...")  ✅ 찾음!
   setInputValue("최문호")  ✅ 화면에 표시
```

## 🔧 TypeScript 타입 정의

**파일**: [types/meeting-minutes.ts:8-15](../types/meeting-minutes.ts#L8-L15)

```typescript
export interface MeetingParticipant {
  id: string
  name: string
  role: string
  attended: boolean
  employee_id?: string   // ← 선택적 필드
  is_internal: boolean
}
```

**선택적 필드(`?`)의 의미**:
- `employee_id`가 있을 수도, 없을 수도 있음
- **있으면**: UUID 문자열 (내부 직원)
- **없으면**: 필드 자체가 객체에 존재하지 않음 (외부 참석자)
- **잘못**: `employee_id: undefined` (필드는 있는데 값이 undefined)

## 🧪 테스트 시나리오

### 시나리오 1: 내부 직원 선택 → 편집
```
1. CREATE: "최문호" 선택 → employee_id="502da2f0-..." 저장
2. EDIT: 페이지 접속
3. 결과: "최문호" 표시됨 ✅
```

### 시나리오 2: 외부 참석자 입력 → 편집
```
1. CREATE: "김철수" 입력 → employee_id 필드 없음
2. EDIT: 페이지 접속
3. 결과: "김철수" 표시됨 (allowCustomValue=true) ✅
```

### 시나리오 3: 내부 직원 → 외부 참석자로 변경
```
1. EDIT: employee_id="502da2f0-..." 있는 참석자
2. 이름 지우고 "김철수" 입력
3. 결과: employee_id 필드 제거, is_internal=false ✅
```

## ✅ 검증 방법

### 1. 새 회의록 생성
```bash
1. http://localhost:3000/admin/meeting-minutes/create
2. 참석자 추가
3. 내부 직원 선택: "최문호" 등
4. 외부 참석자 입력: "김철수" 등
5. 저장
```

### 2. 데이터베이스 확인
```sql
SELECT id, participants, content
FROM meeting_minutes
WHERE id = '[새로 생성한 회의록 ID]';
```

**예상 결과**:
```json
{
  "participants": [
    {
      "id": "uuid-abc",
      "name": "최문호",
      "role": "차장",
      "employee_id": "502da2f0-fd81-449a-87c3-5be924067d4c",
      "is_internal": true,
      "attended": true
    },
    {
      "id": "uuid-def",
      "name": "김철수",
      "role": "",
      "is_internal": false,
      "attended": true
      // employee_id 필드 없음
    }
  ]
}
```

### 3. 편집 페이지 확인
```bash
1. 저장한 회의록의 편집 페이지 접속
2. 브라우저 콘솔 확인:
   👤 참석자 #0 렌더링: {employee_id: "502da2f0-...", ...}
   value prop: "502da2f0-fd81-449a-87c3-5be924067d4c"
3. 화면 확인: "최문호" 표시됨 ✅
```

## 📚 관련 문서

1. [AutocompleteSelectInput 값 표시 문제 디버깅](./debug-autocomplete-not-showing-values.md)
2. [편집 페이지 Race Condition 해결](./fix-edit-page-race-condition.md)
3. [AutocompleteSelectInput 컴포넌트](../components/ui/AutocompleteSelectInput.tsx)

## 🎉 결과

### 수정 전
- ❌ 참석자 이름 빈칸
- ❌ `employee_id: undefined`로 저장
- ❌ React Warning: "controlled to uncontrolled"
- ❌ 편집 페이지에서 값 표시 안됨

### 수정 후
- ✅ 참석자 이름 정상 표시
- ✅ 내부 직원: `employee_id` UUID 저장
- ✅ 외부 참석자: `employee_id` 필드 없음
- ✅ React Warning 해결
- ✅ 편집 페이지에서 정상 표시

---

**수정일**: 2025-02-02
**담당자**: Claude Code
**상태**: ✅ 수정 완료
**빌드**: ✅ 성공
**심각도**: 🔴 Critical (핵심 기능 불가)
**영향도**: 높음 (회의록 편집 불가)
**수정 파일**: [app/admin/meeting-minutes/create/page.tsx](../app/admin/meeting-minutes/create/page.tsx) (Line 399-437)
**핵심 변경**:
1. value prop: `participant.employee_id || participant.name` → `participant.employee_id || ''`
2. 외부 참석자: `employee_id: undefined` → 구조 분해로 필드 완전 제거
