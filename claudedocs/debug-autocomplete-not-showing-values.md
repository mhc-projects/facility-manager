# AutocompleteSelectInput 값 표시 안되는 문제 - 심층 디버깅 분석

## 📝 현재 상황

### 증상
- **안건 담당자**: ✅ 정상 작동 (값 표시됨)
- **참석자 이름**: ❌ 빈칸 표시
- **사업장별 이슈 - 사업장명**: ❌ 빈칸 표시
- **사업장별 이슈 - 담당자**: ❌ 빈칸 표시

### 이미 적용된 수정사항
1. ✅ AutocompleteSelectInput value prop을 name → ID로 변경
2. ✅ onChange 시그니처 수정: `(value, item)` → `(id, name)`
3. ✅ options 형식 수정: `{id, label}` → `{id, name}`
4. ✅ 데이터 로딩 순서 수정: 순차 실행 (loadBusinessesAndEmployees → loadMeetingMinute)

## 🔍 심층 분석 방법

### 디버깅 로그 추가 위치

#### 1. 데이터 로딩 시점 (loadBusinessesAndEmployees)
**파일**: [app/admin/meeting-minutes/[id]/edit/page.tsx:63-87](../app/admin/meeting-minutes/[id]/edit/page.tsx#L63-L87)

```typescript
const loadBusinessesAndEmployees = async () => {
  try {
    // 사업장 목록 로드
    const businessRes = await fetch('/api/business-list?includeAll=true')
    const businessData = await businessRes.json()
    if (businessData.success && businessData.data) {
      const businessArray = Array.isArray(businessData.data.businesses) ? businessData.data.businesses : []
      setBusinesses(businessArray)
      console.log('🏢 사업장 목록 로드됨:', businessArray.length, '개')
      console.log('첫 번째 사업장:', businessArray[0])  // ✅ 구조 확인
    }

    // 담당자 목록 로드
    const employeeRes = await fetch('/api/users/employees')
    const employeeData = await employeeRes.json()
    if (employeeData.success && employeeData.data && employeeData.data.employees) {
      const employeeArray = Array.isArray(employeeData.data.employees) ? employeeData.data.employees : []
      setEmployees(employeeArray)
      console.log('👥 직원 목록 로드됨:', employeeArray.length, '명')
      console.log('첫 번째 직원:', employeeArray[0])  // ✅ 구조 확인
    }
  } catch (error) {
    console.error('[MEETING-MINUTE] Failed to load data:', error)
  }
}
```

**확인 사항**:
- `businessArray[0]`의 구조: `{id: string, name: string}` 형식인지 확인
- `employeeArray[0]`의 구조: `{id: string, name: string}` 형식인지 확인

#### 2. 회의록 데이터 로딩 시점 (loadMeetingMinute)
**파일**: [app/admin/meeting-minutes/[id]/edit/page.tsx:96-128](../app/admin/meeting-minutes/[id]/edit/page.tsx#L96-L128)

```typescript
if (result.success) {
  const minute: MeetingMinute = result.data

  console.log('📋 =====회의록 데이터 로드=====')
  console.log('참석자 원본:', minute.participants)
  console.log('안건 원본:', minute.agenda)
  console.log('사업장별 이슈 원본:', minute.content?.business_issues)

  // ... 상태 설정 ...

  console.log('✅ 상태 설정 완료')
  console.log('참석자 state:', participantsData)
  console.log('안건 state:', agendaData)
  console.log('사업장별 이슈 state:', businessIssuesData)
}
```

**확인 사항**:
- `minute.participants`의 각 항목에 `employee_id`가 있는지 확인
- `minute.content.business_issues`의 각 항목에 `business_id`, `assignee_id`가 있는지 확인

#### 3. 참석자 렌더링 시점
**파일**: [app/admin/meeting-minutes/[id]/edit/page.tsx:441-463](../app/admin/meeting-minutes/[id]/edit/page.tsx#L441-L463)

```typescript
{participants.map((participant, index) => {
  // 🔍 디버깅: 참석자 렌더링 시 데이터 확인
  if (index === 0) {
    console.log(`👤 참석자 #${index} 렌더링:`, {
      name: participant.name,
      employee_id: participant.employee_id,
      role: participant.role,
      is_internal: participant.is_internal
    })
    console.log('직원 options 개수:', employees.length)
    console.log('value prop:', participant.employee_id || '')
  }

  return (
    <div key={participant.id}>
      <AutocompleteSelectInput
        value={participant.employee_id || ''}
        options={employees.map(emp => ({id: emp.id, name: emp.name}))}
        // ...
      />
    </div>
  )
})}
```

**확인 사항**:
- `participant.employee_id`가 존재하는지 확인
- `employees.length`가 0보다 큰지 확인
- value prop이 실제 ID 값인지 확인

#### 4. 사업장별 이슈 렌더링 시점
**파일**: [app/admin/meeting-minutes/[id]/edit/page.tsx:631-653](../app/admin/meeting-minutes/[id]/edit/page.tsx#L631-L653)

```typescript
{businessIssues.map((issue, index) => {
  if (index === 0) {
    console.log(`🏢 사업장별 이슈 #${index} 렌더링:`, {
      business_id: issue.business_id,
      business_name: issue.business_name,
      assignee_id: issue.assignee_id,
      assignee_name: issue.assignee_name
    })
    console.log('사업장 options 개수:', businesses.length)
    console.log('직원 options 개수:', employees.length)
  }

  return (
    <div key={issue.id}>
      <AutocompleteSelectInput
        value={issue.business_id}  // 사업장
        options={businesses.map(biz => ({id: biz.id, name: biz.name}))}
      />
      <AutocompleteSelectInput
        value={issue.assignee_id}  // 담당자
        options={employees.map(emp => ({id: emp.id, name: emp.name}))}
      />
    </div>
  )
})}
```

**확인 사항**:
- `issue.business_id`가 존재하는지 확인
- `issue.assignee_id`가 존재하는지 확인
- options 배열이 비어있지 않은지 확인

## 🧪 테스트 절차

### 1. 개발 서버 실행
```bash
npm run dev
```

### 2. 브라우저에서 회의록 편집 페이지 접속
```
http://localhost:3000/admin/meeting-minutes/[id]/edit
```

### 3. 브라우저 개발자 도구 콘솔 확인 (F12)

#### 예상되는 로그 순서:
```
1️⃣ 사업장과 직원 로딩:
   🏢 사업장 목록 로드됨: N개
   첫 번째 사업장: {id: "...", name: "..."}
   👥 직원 목록 로드됨: N명
   첫 번째 직원: {id: "...", name: "..."}

2️⃣ 회의록 데이터 로딩:
   📋 =====회의록 데이터 로드=====
   참석자 원본: [{...}, {...}]
   안건 원본: [{...}, {...}]
   사업장별 이슈 원본: [{...}, {...}]

   ✅ 상태 설정 완료
   참석자 state: [{...}, {...}]
   안건 state: [{...}, {...}]
   사업장별 이슈 state: [{...}, {...}]

3️⃣ 참석자 렌더링:
   👤 참석자 #0 렌더링: {name: "...", employee_id: "...", ...}
   직원 options 개수: N
   value prop: "uuid-..."

4️⃣ 사업장별 이슈 렌더링:
   🏢 사업장별 이슈 #0 렌더링: {business_id: "...", assignee_id: "...", ...}
   사업장 options 개수: N
   직원 options 개수: N
```

## 🔎 문제 진단 체크리스트

### Case A: employee_id나 business_id가 `undefined`
**증상**:
```
value prop: ""  // 빈 문자열
```

**원인**:
- 데이터베이스에 ID가 저장되지 않았음
- API 응답에서 필드가 누락됨

**해결 방법**:
1. 데이터베이스 확인:
   ```sql
   SELECT id, participants, content
   FROM meeting_minutes
   WHERE id = '[회의록 ID]';
   ```
2. `participants` JSON에 `employee_id` 필드가 있는지 확인
3. `content.business_issues` JSON에 `business_id`, `assignee_id` 필드가 있는지 확인

### Case B: options 배열이 비어있음
**증상**:
```
직원 options 개수: 0
사업장 options 개수: 0
```

**원인**:
- API 호출 실패
- 데이터 형식이 예상과 다름

**해결 방법**:
1. API 응답 확인:
   ```
   /api/business-list?includeAll=true
   /api/users/employees
   ```
2. 응답 구조 확인:
   - 사업장: `{success: true, data: {businesses: [...]}}`
   - 직원: `{success: true, data: {employees: [...]}}`

### Case C: ID와 options의 불일치
**증상**:
```
value prop: "uuid-123-456"
직원 options 개수: 10
// 하지만 options에 "uuid-123-456"가 없음
```

**원인**:
- 저장된 ID와 현재 options의 ID가 다름
- 직원이 삭제되었거나 비활성화됨

**해결 방법**:
1. options와 value 비교:
   ```javascript
   const found = employees.find(emp => emp.id === participant.employee_id)
   console.log('Found employee:', found)  // undefined면 불일치
   ```
2. 비활성화된 직원도 options에 포함하도록 수정

### Case D: 데이터 타입 불일치
**증상**:
```
첫 번째 직원: {id: 123, name: "홍길동"}  // ❌ id가 number
```

**원인**:
- API에서 ID를 number로 반환
- AutocompleteSelectInput은 string을 기대

**해결 방법**:
```typescript
options={employees.map(emp => ({
  id: String(emp.id),  // ✅ 명시적 변환
  name: emp.name
}))}
```

## 🎯 예상되는 문제 시나리오

### 시나리오 1: 참석자에 employee_id가 저장 안 됨
**콘솔 출력**:
```
참석자 원본: [
  {id: "uuid-abc", name: "홍길동", role: "팀장", attended: true, is_internal: true}
  // ❌ employee_id 필드 없음!
]
```

**원인**:
- 회의록 생성 시 employee_id를 저장하지 않음
- create 페이지에서 participants를 구성할 때 employee_id 누락

**해결**: create 페이지 수정 필요

### 시나리오 2: API 응답 구조 문제
**콘솔 출력**:
```
첫 번째 직원: {employee_id: "uuid-123", employee_name: "홍길동"}
// ❌ 'id'와 'name'이 아니라 'employee_id'와 'employee_name'
```

**원인**:
- API가 다른 필드명 사용

**해결**:
```typescript
options={employees.map(emp => ({
  id: emp.employee_id || emp.id,  // ✅ 유연한 매핑
  name: emp.employee_name || emp.name
}))}
```

### 시나리오 3: 순차 로딩이 실제로 작동하지 않음
**콘솔 출력**:
```
👤 참석자 #0 렌더링: {employee_id: "uuid-123", ...}
직원 options 개수: 0  // ❌ 아직 로드 안됨!
```

**원인**:
- useEffect 의존성 문제
- setState가 비동기라서 즉시 반영 안 됨

**해결**:
```typescript
useEffect(() => {
  const init = async () => {
    await loadBusinessesAndEmployees()
    await loadMeetingMinute()
  }
  init()
}, [])  // ✅ 의존성 배열 비어있음
```

## 📋 다음 단계

### 1단계: 브라우저 콘솔 로그 확인
사용자가 편집 페이지에 접속하여 콘솔 로그를 확인합니다.

### 2단계: 로그 분석
위의 체크리스트를 기반으로 문제 원인을 파악합니다.

### 3단계: 추가 정보 수집
필요한 경우 더 자세한 로그를 추가하여 정확한 원인 파악:

```typescript
// AutocompleteSelectInput 내부에 로그 추가
useEffect(() => {
  console.log('🔍 AutocompleteSelectInput useEffect:', {
    value,
    options_length: options.length,
    found: options.find(opt => opt.id === value)
  })
  const selected = options.find(opt => opt.id === value)
  if (selected) {
    setInputValue(selected.name)
  }
}, [value, options])
```

## 🎉 성공 조건

모든 로그가 다음과 같이 출력되어야 합니다:

```
✅ 사업장 목록 로드됨: 10개
✅ 직원 목록 로드됨: 50명
✅ 참석자 원본: [{..., employee_id: "uuid-123", ...}]
✅ 참석자 렌더링: {employee_id: "uuid-123", ...}
✅ 직원 options 개수: 50
✅ value prop: "uuid-123"  // 빈 문자열이 아님!
```

---

**작성일**: 2025-02-02
**담당자**: Claude Code
**상태**: 🔍 디버깅 중
**다음 단계**: 브라우저 콘솔 로그 확인 필요
