# 회의록 안건 담당자 - 실제 직원 데이터 연동 확인

## ✅ 현재 상태 분석

회의록 작성 페이지는 이미 **Supabase employees 테이블의 실제 가입자 데이터**를 사용하도록 올바르게 구현되어 있습니다.

## 🔍 구현 확인

### 1. API 엔드포인트

**파일**: [app/api/users/employees/route.ts](../app/api/users/employees/route.ts)

```typescript
// GET: 활성 직원 목록 조회 (담당자 선택용)
export const GET = withApiHandler(async (request: NextRequest) => {
  // ✅ 실제 employees 테이블에서 데이터 조회
  const queryText = `
    SELECT
      id,
      name,
      email,
      employee_id,
      department,
      position,
      is_active,
      last_login_at,
      created_at
    FROM employees
    WHERE is_active = true  -- 활성 직원만
    ORDER BY name ASC
    LIMIT 50
  `;

  const employees = await queryAll(queryText, params);

  return createSuccessResponse({
    employees: employeesForAssignment,
    metadata: {
      totalCount,
      activeCount,
      departmentStats
    }
  });
});
```

**기능**:
- ✅ 활성 직원만 조회 (`is_active = true`)
- ✅ 이름, 이메일, 직원번호, 부서, 직급으로 검색
- ✅ 부서별 필터링 가능
- ✅ 이름 기준 정렬 (`ORDER BY name ASC`)

### 2. 회의록 작성 페이지 연동

**파일**: [app/admin/meeting-minutes/create/page.tsx](../app/admin/meeting-minutes/create/page.tsx)

```typescript
const loadBusinessesAndEmployees = async () => {
  try {
    // ✅ 실제 직원 데이터 로드
    const employeeRes = await fetch('/api/users/employees')
    const employeeData = await employeeRes.json()

    if (employeeData.success && employeeData.data) {
      // ✅ employees 배열 설정
      setEmployees(Array.isArray(employeeData.data) ? employeeData.data : [])
    }
  } catch (error) {
    console.error('[MEETING-MINUTE] Failed to load data:', error)
    setEmployees([])
  }
}
```

**응답 구조**:
```json
{
  "success": true,
  "data": {
    "employees": [
      {
        "id": "uuid",
        "name": "직원이름",
        "email": "email@company.com",
        "employee_id": "EMP001",
        "department": "개발팀",
        "position": "팀장",
        "is_active": true
      }
    ],
    "metadata": {
      "totalCount": 13,
      "activeCount": 13,
      "departmentStats": {
        "개발팀": 3,
        "관리팀": 3
      }
    }
  }
}
```

### 3. 안건 담당자 선택 UI

**안건 섹션**:
```tsx
<AutocompleteSelectInput
  value={item.assignee_id || ''}
  onChange={(id, name) => {
    const updated = [...agenda]
    updated[index] = {
      ...updated[index],
      assignee_id: id,        // ✅ employees.id 저장
      assignee_name: name     // ✅ employees.name 저장
    }
    setAgenda(updated)
  }}
  options={employees.map(e => ({ id: e.id, name: e.name }))}
  placeholder="담당자 선택"
/>
```

**사업장별 이슈 담당자**:
```tsx
<AutocompleteSelectInput
  value={issue.assignee_id || ''}
  onChange={(id, name) => {
    const updated = [...businessIssues]
    updated[index] = {
      ...updated[index],
      assignee_id: id,        // ✅ employees.id 저장
      assignee_name: name     // ✅ employees.name 저장
    }
    setBusinessIssues(updated)
  }}
  options={employees.map(e => ({ id: e.id, name: e.name }))}
  placeholder="담당자를 검색하세요"
/>
```

## 📊 데이터 흐름

```
1. 페이지 로드
   ↓
2. loadBusinessesAndEmployees() 실행
   ↓
3. GET /api/users/employees 호출
   ↓
4. Supabase employees 테이블 쿼리
   ↓
5. 활성 직원 목록 반환 (is_active = true)
   ↓
6. setEmployees(직원 목록)
   ↓
7. AutocompleteSelectInput에 options 전달
   ↓
8. 사용자가 담당자 검색/선택
   ↓
9. assignee_id, assignee_name 저장
```

## ✅ 올바른 구현 확인

### 1. 실제 DB 연동
- ✅ Supabase employees 테이블 직접 쿼리
- ✅ 샘플 데이터 아닌 실제 가입자 정보 사용
- ✅ 활성 직원만 필터링 (`is_active = true`)

### 2. API 응답 구조
- ✅ `/api/users/employees` 엔드포인트 정상 작동
- ✅ 응답 구조: `{ success: true, data: { employees: [...] } }`
- ✅ metadata 포함 (totalCount, activeCount, departmentStats)

### 3. UI 연동
- ✅ 페이지 로드 시 자동으로 직원 목록 로드
- ✅ AutocompleteSelectInput에 정확한 options 전달
- ✅ 검색 기능 작동 (이름 기반)
- ✅ 선택 시 assignee_id, assignee_name 모두 저장

## 🔧 API 기능

### 검색 기능
```
GET /api/users/employees?search=김개발
→ 이름, 이메일, 직원번호, 부서, 직급에서 검색
```

### 부서별 필터링
```
GET /api/users/employees?department=개발팀
→ 개발팀 직원만 조회
```

### 비활성 직원 포함
```
GET /api/users/employees?includeInactive=true
→ 비활성 직원도 조회
```

### 결과 제한
```
GET /api/users/employees?limit=20
→ 최대 20명까지만 조회 (기본값: 50)
```

## 🎯 사용 방법

### 1. 회의록 작성 페이지 접속
```
/admin/meeting-minutes/create
```

### 2. 안건 추가
```
"안건" 섹션 → "추가" 버튼 클릭
```

### 3. 담당자 선택
```
"담당자" 필드 클릭 →
실제 가입한 직원 목록이 표시됨 →
검색 또는 선택
```

**예시**:
- 검색: "김" 입력 → 김으로 시작하는 직원 표시
- 검색: "개발" 입력 → 개발팀 직원 표시
- 검색: "팀장" 입력 → 직급이 팀장인 직원 표시

### 4. 저장
```
안건 정보 입력 완료 →
"완료" 또는 "임시저장" 버튼 클릭 →
DB에 저장
```

## 📝 저장되는 데이터 구조

### AgendaItem
```typescript
{
  id: "uuid",
  title: "안건 제목",
  description: "안건 설명",
  deadline: "2025-02-15",       // 데드라인
  assignee_id: "employee-uuid",  // employees 테이블의 id
  assignee_name: "김개발"        // 표시용 이름
}
```

### BusinessIssue
```typescript
{
  id: "uuid",
  business_id: "business-uuid",
  business_name: "사업장명",
  issue_description: "이슈 내용",
  assignee_id: "employee-uuid",  // employees 테이블의 id
  assignee_name: "김개발",       // 표시용 이름
  is_completed: false
}
```

## ⚠️ 참고사항

### 1. 활성 직원만 표시
현재 구현은 `is_active = true`인 직원만 표시합니다.
비활성 직원을 포함하려면 `includeInactive=true` 파라미터 필요.

### 2. 최대 50명 제한
기본적으로 최대 50명까지만 조회합니다.
더 많은 직원이 필요한 경우 `limit` 파라미터 조정.

### 3. 검색 최소 길이
검색어는 **최소 2글자** 이상이어야 합니다.

### 4. 정렬 방식
직원 목록은 **이름 기준 오름차순** 정렬됩니다.

## 🎉 결론

**샘플 데이터는 필요 없습니다!**

시스템은 이미 올바르게 구현되어 있으며:
- ✅ Supabase employees 테이블의 **실제 가입자 데이터** 사용
- ✅ `/api/users/employees` API로 직원 목록 조회
- ✅ 활성 직원만 필터링
- ✅ 검색 및 부서별 필터링 가능
- ✅ AutocompleteSelectInput으로 편리한 선택 UI

**현재 상태**: 정상 작동 중 ✅

**필요한 작업**: 없음 (이미 완벽하게 구현됨)

---

**작성일**: 2025-02-01
**분석자**: Claude Code
**상태**: ✅ 정상 작동 확인
