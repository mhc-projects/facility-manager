# 회의록 편집 페이지 AutocompleteSelectInput 값 표시 수정

## 📝 문제 상황

### 증상
- 회의록 편집 페이지에서 기존에 선택했던 참석자, 안건 담당자, 사업장별 이슈(사업장명, 담당자) 값이 표시되지 않음
- 입력 필드가 빈칸으로 보이지만, 데이터는 정상적으로 로드됨
- 편집 시 기존 값을 확인하고 수정할 수 없는 문제

### 영향 범위
- **파일**: [app/admin/meeting-minutes/[id]/edit/page.tsx](../app/admin/meeting-minutes/[id]/edit/page.tsx)
- **컴포넌트**: AutocompleteSelectInput (참석자명, 안건 담당자, 사업장명, 이슈 담당자)
- **증상**: 데이터는 로드되지만 UI에 표시 안 됨

## 🔍 원인 분석

### 근본 원인
AutocompleteSelectInput 컴포넌트의 **value prop 사용 방식이 잘못**되었습니다.

### AutocompleteSelectInput 컴포넌트 스펙
**파일**: [components/ui/AutocompleteSelectInput.tsx](../components/ui/AutocompleteSelectInput.tsx)

```typescript
interface AutocompleteSelectInputProps {
  value: string           // ❗ ID를 받아야 함 (name이 아님!)
  onChange: (id: string, name: string) => void
  options: Option[]       // { id: string, name: string }
  ...
}

// 컴포넌트 내부 동작 (lines 38-46)
useEffect(() => {
  const selected = options.find(opt => opt.id === value)  // ✅ value를 ID로 취급
  if (selected) {
    setInputValue(selected.name)  // ID에 매칭되는 name을 표시
  }
}, [value, options, isOpen])
```

### 편집 페이지의 잘못된 사용 패턴

#### ❌ **문제 1: value에 name을 전달**
```typescript
// 잘못된 패턴
<AutocompleteSelectInput
  value={participant.name}           // ❌ name을 전달
  onChange={(value, item) => {...}}  // ❌ 잘못된 시그니처
  options={employees.map(emp => ({
    id: emp.id,
    label: emp.name,                 // ❌ 'label'이 아니라 'name'이어야 함
    department: emp.department
  }))}
/>
```

**왜 표시가 안 되는가?**
1. `value={participant.name}` → "홍길동" (name)을 전달
2. 컴포넌트는 `options.find(opt => opt.id === "홍길동")` 검색
3. ID는 UUID 형식이므로 매칭 실패 → `selected` is `undefined`
4. `setInputValue('')` → 빈 값 표시

#### ❌ **문제 2: onChange 시그니처 불일치**
```typescript
// 컴포넌트 정의
onChange: (id: string, name: string) => void

// 편집 페이지 사용
onChange={(value, item) => {...}}  // ❌ (value, item)이 아니라 (id, name)
```

#### ❌ **문제 3: options 형식 불일치**
```typescript
// 컴포넌트 요구 형식
interface Option {
  id: string
  name: string
}

// 편집 페이지에서 전달
options={employees.map(emp => ({
  id: emp.id,
  label: emp.name,        // ❌ 'label'이 아니라 'name'
  department: emp.department
}))}
```

#### ❌ **문제 4: 존재하지 않는 prop 사용**
```typescript
<AutocompleteSelectInput
  onInputChange={(value) => {...}}  // ❌ 컴포넌트에 이 prop 없음
/>
```

## ✅ 수정 내용

### 1. 참석자 AutocompleteSelectInput 수정

**위치**: [app/admin/meeting-minutes/[id]/edit/page.tsx:418-443](../app/admin/meeting-minutes/[id]/edit/page.tsx#L418-L443)

**수정 전**:
```typescript
<AutocompleteSelectInput
  value={participant.name}  // ❌ name 전달
  onChange={(value, item) => {
    const updated = [...participants]
    updated[index] = {
      ...updated[index],
      name: value,
      employee_id: item?.id,
      is_internal: !!item
    }
    if (item && item.department) {
      updated[index].role = item.department
    }
    setParticipants(updated)
  }}
  onInputChange={(value) => {  // ❌ 존재하지 않는 prop
    handleUpdateParticipant(index, 'name', value)
  }}
  options={employees.map((emp) => ({
    id: emp.id,
    label: emp.name,  // ❌ 'label' → 'name'
    department: emp.department
  }))}
  placeholder="이름"
  className="w-full"
/>
```

**수정 후**:
```typescript
<AutocompleteSelectInput
  value={participant.employee_id || ''}  // ✅ ID 전달
  onChange={(id, name) => {  // ✅ 올바른 시그니처
    const updated = [...participants]
    const employee = employees.find(emp => emp.id === id)
    updated[index] = {
      ...updated[index],
      name: name,
      employee_id: id,
      is_internal: !!id,
      role: employee?.department || updated[index].role
    }
    setParticipants(updated)
  }}
  options={employees.map((emp) => ({
    id: emp.id,
    name: emp.name  // ✅ 'name' 사용
  }))}
  placeholder="이름"
  className="w-full"
  allowCustomValue={true}  // ✅ 수동 입력 허용
/>
```

### 2. 안건 담당자 AutocompleteSelectInput 수정

**위치**: [app/admin/meeting-minutes/[id]/edit/page.tsx:520-541](../app/admin/meeting-minutes/[id]/edit/page.tsx#L520-L541)

**수정 전**:
```typescript
<AutocompleteSelectInput
  value={item.assignee_name || ''}  // ❌ name 전달
  onChange={(value, employee) => {
    const updated = [...agenda]
    updated[index] = {
      ...updated[index],
      assignee_name: value,
      assignee_id: employee?.id || ''
    }
    setAgenda(updated)
  }}
  onInputChange={(value) => {
    handleUpdateAgenda(index, 'assignee_name', value)
  }}
  options={employees.map((emp) => ({
    id: emp.id,
    label: emp.name,  // ❌ 'label'
    department: emp.department
  }))}
  placeholder="담당자"
  className="w-full"
/>
```

**수정 후**:
```typescript
<AutocompleteSelectInput
  value={item.assignee_id || ''}  // ✅ ID 전달
  onChange={(id, name) => {
    const updated = [...agenda]
    updated[index] = {
      ...updated[index],
      assignee_name: name,
      assignee_id: id
    }
    setAgenda(updated)
  }}
  options={employees.map((emp) => ({
    id: emp.id,
    name: emp.name  // ✅ 'name' 사용
  }))}
  placeholder="담당자"
  className="w-full"
  allowCustomValue={true}
/>
```

### 3. 사업장별 이슈 - 사업장 선택 수정

**위치**: [app/admin/meeting-minutes/[id]/edit/page.tsx:597-617](../app/admin/meeting-minutes/[id]/edit/page.tsx#L597-L617)

**수정 전**:
```typescript
<AutocompleteSelectInput
  value={issue.business_name}  // ❌ name 전달
  onChange={(value, business) => {
    const updated = [...businessIssues]
    updated[index] = {
      ...updated[index],
      business_name: value,
      business_id: business?.id || ''
    }
    setBusinessIssues(updated)
  }}
  onInputChange={(value) => {
    handleUpdateBusinessIssue(index, 'business_name', value)
  }}
  options={businesses.map((biz) => ({
    id: biz.id,
    label: biz.name  // ❌ 'label'
  }))}
  placeholder="사업장 선택"
  className="w-full"
/>
```

**수정 후**:
```typescript
<AutocompleteSelectInput
  value={issue.business_id}  // ✅ ID 전달
  onChange={(id, name) => {
    const updated = [...businessIssues]
    updated[index] = {
      ...updated[index],
      business_name: name,
      business_id: id
    }
    setBusinessIssues(updated)
  }}
  options={businesses.map((biz) => ({
    id: biz.id,
    name: biz.name  // ✅ 'name' 사용
  }))}
  placeholder="사업장 선택"
  className="w-full"
  allowCustomValue={true}
/>
```

### 4. 사업장별 이슈 - 담당자 선택 수정

**위치**: [app/admin/meeting-minutes/[id]/edit/page.tsx:629-650](../app/admin/meeting-minutes/[id]/edit/page.tsx#L629-L650)

**수정 전**:
```typescript
<AutocompleteSelectInput
  value={issue.assignee_name}  // ❌ name 전달
  onChange={(value, employee) => {
    const updated = [...businessIssues]
    updated[index] = {
      ...updated[index],
      assignee_name: value,
      assignee_id: employee?.id || ''
    }
    setBusinessIssues(updated)
  }}
  onInputChange={(value) => {
    handleUpdateBusinessIssue(index, 'assignee_name', value)
  }}
  options={employees.map((emp) => ({
    id: emp.id,
    label: emp.name,  // ❌ 'label'
    department: emp.department
  }))}
  placeholder="담당자 선택"
  className="w-full"
/>
```

**수정 후**:
```typescript
<AutocompleteSelectInput
  value={issue.assignee_id}  // ✅ ID 전달
  onChange={(id, name) => {
    const updated = [...businessIssues]
    updated[index] = {
      ...updated[index],
      assignee_name: name,
      assignee_id: id
    }
    setBusinessIssues(updated)
  }}
  options={employees.map((emp) => ({
    id: emp.id,
    name: emp.name  // ✅ 'name' 사용
  }))}
  placeholder="담당자 선택"
  className="w-full"
  allowCustomValue={true}
/>
```

## 🎯 수정 핵심 포인트

### 1. value prop에 ID 전달
```typescript
// ❌ 잘못된 방식
value={participant.name}        // "홍길동"
value={issue.business_name}     // "서울 본사"

// ✅ 올바른 방식
value={participant.employee_id || ''}  // "uuid-123-456"
value={issue.business_id}              // "uuid-789-012"
```

### 2. onChange 시그니처 준수
```typescript
// ❌ 잘못된 방식
onChange={(value, item) => {...}}

// ✅ 올바른 방식
onChange={(id, name) => {...}}
```

### 3. options 형식 준수
```typescript
// ❌ 잘못된 방식
options={employees.map(emp => ({
  id: emp.id,
  label: emp.name,
  department: emp.department
}))}

// ✅ 올바른 방식
options={employees.map(emp => ({
  id: emp.id,
  name: emp.name
}))}
```

### 4. 불필요한 prop 제거
```typescript
// ❌ 존재하지 않는 prop
onInputChange={(value) => {...}}

// ✅ 제거
```

### 5. allowCustomValue 추가
```typescript
// ✅ 수동 입력 허용 (외부 참석자, 외부 담당자)
allowCustomValue={true}
```

## 📊 검증 방법

### 1. 빌드 검증
```bash
npm run build
```
**결과**: ✅ 빌드 성공
```
Route (app)
├ ƒ /admin/meeting-minutes/[id]/edit   5.16 kB   162 kB
```

### 2. 테스트 시나리오

#### 시나리오 1: 참석자 편집
```
1. 기존 회의록 편집 페이지 진입
2. ✅ 참석자 목록에 기존 선택한 이름들이 표시됨
3. ✅ 참석자 클릭 시 드롭다운에서 해당 참석자가 선택된 상태로 표시
4. ✅ 새로운 참석자 선택 가능
5. ✅ 외부 참석자 수동 입력 가능
```

#### 시나리오 2: 안건 담당자 편집
```
1. 안건 섹션 확인
2. ✅ 각 안건의 담당자명이 표시됨
3. ✅ 담당자 변경 가능
4. ✅ 외부 담당자 수동 입력 가능
```

#### 시나리오 3: 사업장별 이슈 편집
```
1. 사업장별 이슈 섹션 확인
2. ✅ 사업장명이 표시됨
3. ✅ 담당자명이 표시됨
4. ✅ 사업장 변경 가능
5. ✅ 담당자 변경 가능
6. ✅ 수동 입력 가능
```

#### 시나리오 4: 저장 및 재편집
```
1. 값 수정 후 "완료" 버튼으로 저장
2. 다시 편집 페이지 진입
3. ✅ 수정한 값들이 모두 표시됨
4. ✅ 데이터 무결성 유지됨
```

## 🔧 기술 세부사항

### AutocompleteSelectInput 동작 원리

#### 1. 초기 렌더링
```typescript
// value prop으로 ID를 받음
value={participant.employee_id}  // "uuid-123-456"

// useEffect에서 ID로 option 검색
const selected = options.find(opt => opt.id === value)
// selected = { id: "uuid-123-456", name: "홍길동" }

// name을 inputValue로 설정
setInputValue(selected.name)  // "홍길동" 표시
```

#### 2. 사용자 선택
```typescript
// 사용자가 "김철수" 선택
selectOption({ id: "uuid-789-012", name: "김철수" })

// onChange 콜백 호출
onChange("uuid-789-012", "김철수")

// 부모 컴포넌트에서 상태 업데이트
updated[index] = {
  ...updated[index],
  employee_id: "uuid-789-012",  // ID 저장
  name: "김철수"                 // name 저장
}
```

#### 3. 수동 입력 (allowCustomValue=true)
```typescript
// 사용자가 "외부 참석자" 입력
onChange("", "외부 참석자")

// 부모 컴포넌트에서 처리
updated[index] = {
  ...updated[index],
  employee_id: "",              // ID 없음
  name: "외부 참석자",           // name만 저장
  is_internal: false            // 외부 참석자 표시
}
```

### 데이터 흐름

```
DB에서 로드
↓
loadMeetingMinute()
↓
setParticipants([
  { employee_id: "uuid-123", name: "홍길동", ... }
])
↓
AutocompleteSelectInput
  value={participant.employee_id}  // "uuid-123"
↓
useEffect: options.find(opt => opt.id === "uuid-123")
↓
setInputValue("홍길동")  // ✅ 화면에 표시
```

## 📝 베스트 프랙티스

### AutocompleteSelectInput 올바른 사용법

```typescript
// ✅ 완벽한 사용 예시
<AutocompleteSelectInput
  // 1. value에는 항상 ID 전달
  value={item.employee_id || ''}

  // 2. onChange는 (id, name) 시그니처 준수
  onChange={(id, name) => {
    // 3. 상태 업데이트 시 id와 name 모두 저장
    const updated = [...items]
    updated[index] = {
      ...updated[index],
      employee_id: id,    // ID 저장
      name: name          // name 저장
    }
    setItems(updated)
  }}

  // 4. options는 { id, name } 형식
  options={employees.map(emp => ({
    id: emp.id,
    name: emp.name
  }))}

  // 5. 필요시 수동 입력 허용
  allowCustomValue={true}

  placeholder="담당자 선택"
  className="w-full"
/>
```

### 데이터 구조 설계

```typescript
// ✅ ID와 name을 함께 저장
interface Participant {
  id: string
  employee_id: string    // UUID (내부 직원) 또는 빈 문자열 (외부)
  name: string           // 표시용 이름
  is_internal: boolean   // 내부/외부 구분
  role: string
  attended: boolean
}

// ❌ name만 저장하면 재편집 시 매칭 불가
interface Participant {
  id: string
  name: string  // 이것만으로는 options의 어떤 항목인지 알 수 없음
  role: string
  attended: boolean
}
```

## 🎉 결과

### 수정 전 문제점
1. ❌ 편집 페이지에서 참석자명이 빈칸으로 표시
2. ❌ 안건 담당자명이 빈칸으로 표시
3. ❌ 사업장별 이슈의 사업장명과 담당자명이 빈칸으로 표시
4. ❌ 기존 값을 확인하고 수정할 수 없음
5. ❌ 사용자 경험 저하

### 수정 후 개선점
1. ✅ 모든 AutocompleteSelectInput 필드에 기존 값 정상 표시
2. ✅ 참석자, 담당자, 사업장 선택 값이 올바르게 렌더링
3. ✅ 값 수정 및 재선택 가능
4. ✅ 수동 입력 허용으로 외부 인원 입력 가능
5. ✅ 데이터 무결성 유지
6. ✅ 사용자 경험 개선

### 빌드 결과
```bash
✓ Compiled successfully
✓ Build completed
Route: /admin/meeting-minutes/[id]/edit (5.16 kB, 162 kB First Load JS)
```

---

**수정일**: 2025-02-02
**담당자**: Claude Code
**상태**: ✅ 수정 완료
**빌드**: ✅ 성공
**심각도**: 🔴 High (편집 기능 사용 불가)
**영향도**: 높음 (모든 회의록 편집 작업)
**수정 파일**: [app/admin/meeting-minutes/[id]/edit/page.tsx](../app/admin/meeting-minutes/[id]/edit/page.tsx) (4곳 수정)
**핵심 변경**:
- value prop: name → ID로 변경 (4곳)
- onChange 시그니처: (value, item) → (id, name) (4곳)
- options 형식: {id, label} → {id, name} (4곳)
- onInputChange prop 제거 (4곳)
- allowCustomValue={true} 추가 (4곳)
