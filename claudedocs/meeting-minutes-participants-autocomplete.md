# 회의록 참석자 자동완성 개선

## 🎯 개선 목표

회의록 작성 시 참석자 입력을 개선하여:
- ✅ DB의 employees 테이블 활용 (내부 직원 자동완성)
- ✅ 외부 참석자도 수동 입력 가능 (유연성 유지)
- ✅ 안건 담당자와 동일한 UX 제공 (일관성)

## 📋 구현 내용

### 1. 타입 확장

**파일**: [types/meeting-minutes.ts:8-14](../types/meeting-minutes.ts#L8-L14)

```typescript
export interface MeetingParticipant {
  id: string
  name: string
  role: string
  attended: boolean
  employee_id?: string   // 🆕 내부 직원 ID (선택)
  is_internal: boolean   // 🆕 내부/외부 구분
}
```

**변경 사항**:
- `employee_id`: 내부 직원 선택 시 employees 테이블의 ID 저장
- `is_internal`: 내부 직원(true) vs 외부 참석자(false) 구분

### 2. AutocompleteSelectInput 컴포넌트 개선

**파일**: [components/ui/AutocompleteSelectInput.tsx](../components/ui/AutocompleteSelectInput.tsx)

**추가된 기능**:
```typescript
interface AutocompleteSelectInputProps {
  // ... 기존 속성들
  allowCustomValue?: boolean // 🆕 수동 입력 허용
}
```

**동작 방식**:

1. **내부 직원 선택**:
   ```
   사용자 입력: "최문호"
   → 드롭다운: "최문호 (개발팀 팀장)" 표시
   → 선택 시: employee_id, name, role 자동 설정
   ```

2. **외부 참석자 수동 입력**:
   ```
   사용자 입력: "김고객"
   → 드롭다운: "김고객 입력" 표시
   → 선택 시: name만 설정, employee_id는 undefined
   → 직책은 별도 입력 필드에서 입력
   ```

3. **키보드 단축키**:
   - `Enter`: 하이라이트된 항목 선택 또는 수동 입력 확정
   - `Esc`: 드롭다운 닫기 및 입력값 확정
   - `↑/↓`: 항목 네비게이션

### 3. 참석자 UI 개선

**파일**: [app/admin/meeting-minutes/create/page.tsx:390-468](../app/admin/meeting-minutes/create/page.tsx#L390-L468)

**새로운 구조**:
```tsx
<div className="space-y-2">
  {/* 첫 번째 행: 이름 자동완성 + 참석 여부 + 삭제 */}
  <div className="flex items-center gap-3">
    <AutocompleteSelectInput
      value={participant.employee_id || participant.name}
      onChange={(selectedId, selectedName) => {
        const selectedEmployee = employees.find(e => e.id === selectedId)
        if (selectedEmployee) {
          // 내부 직원 선택
          updateParticipant({
            name: selectedEmployee.name,
            role: selectedEmployee.position || department,
            employee_id: selectedEmployee.id,
            is_internal: true
          })
        } else {
          // 수동 입력 (외부 참석자)
          updateParticipant({
            name: selectedName,
            is_internal: false
          })
        }
      }}
      options={employees.map(e => ({
        id: e.id,
        name: `${e.name} (${e.department} ${e.position})`
      }))}
      allowCustomValue={true}
    />
    <label>
      <input type="checkbox" checked={attended} />
      참석
    </label>
    <button onClick={remove}>삭제</button>
  </div>

  {/* 두 번째 행: 외부 참석자 직책 입력 */}
  {!is_internal && (
    <input
      value={role}
      onChange={updateRole}
      placeholder="직책 입력 (선택사항)"
    />
    <span className="badge">외부</span>
  )}

  {/* 내부 직원 정보 표시 */}
  {is_internal && role && (
    <div>
      <span className="badge">내부</span>
      <span>{role}</span>
    </div>
  )}
</div>
```

**UI 개선 포인트**:

1. **2행 레이아웃**:
   - 1행: 이름 자동완성 + 참석 체크 + 삭제 버튼
   - 2행: 조건부 표시 (외부 참석자: 직책 입력 / 내부 직원: 정보 표시)

2. **배지 표시**:
   - 내부 직원: 파란색 "내부" 배지
   - 외부 참석자: 회색 "외부" 배지

3. **스마트 폼**:
   - 내부 직원 선택 시: 직책 자동 입력 (수정 불필요)
   - 외부 참석자: 직책 수동 입력 (선택사항)

## 🎨 사용자 경험 개선

### 시나리오 1: 내부 직원 추가

```
1. "추가" 버튼 클릭
2. 이름 필드에 "최" 입력
   → 드롭다운에 "최문호 (개발팀 팀장)", "최관리 (관리팀 팀장)" 표시
3. "최문호 (개발팀 팀장)" 선택
   → 이름: "최문호", 직책: "팀장", 내부 배지 표시
4. 완료 ✅
```

### 시나리오 2: 외부 참석자 추가

```
1. "추가" 버튼 클릭
2. 이름 필드에 "김고객" 입력
   → 드롭다운에 '"김고객" 입력' 표시
3. 클릭 또는 Enter
   → 이름: "김고객", 외부 배지 표시
4. 직책 필드에 "대표이사" 입력 (선택사항)
5. 완료 ✅
```

### 시나리오 3: 혼합 참석자

```
내부 직원:
- 최문호 (개발팀 팀장) [내부]
- 정회계 (관리팀 대리) [내부]

외부 참석자:
- 김고객 (ABC사 대표이사) [외부]
- 이협력 (XYZ사 과장) [외부]

→ 모두 동일한 입력 방식으로 추가 가능
```

## 📊 데이터 흐름

### 내부 직원 선택

```
1. 사용자 입력: "최문호"
   ↓
2. AutocompleteSelectInput 필터링
   employees.filter(e => e.name.includes("최문호"))
   ↓
3. 드롭다운 표시:
   "최문호 (개발팀 팀장)"
   ↓
4. 선택 시 onChange 호출:
   onChange(employee.id, "최문호 (개발팀 팀장)")
   ↓
5. 참석자 업데이트:
   {
     id: "uuid",
     name: "최문호",
     role: "팀장",
     employee_id: "employee-uuid",
     is_internal: true,
     attended: true
   }
```

### 외부 참석자 입력

```
1. 사용자 입력: "김고객"
   ↓
2. AutocompleteSelectInput 필터링
   employees.filter(e => ...) → 결과 없음
   ↓
3. 드롭다운 표시:
   '"김고객" 입력'
   ↓
4. 선택 시 onChange 호출:
   onChange('', "김고객")
   ↓
5. 참석자 업데이트:
   {
     id: "uuid",
     name: "김고객",
     role: "",  // 별도 입력
     employee_id: undefined,
     is_internal: false,
     attended: true
   }
   ↓
6. 사용자가 직책 필드에 "대표이사" 입력
   → role: "대표이사" 업데이트
```

## 🔍 구현 세부사항

### handleAddParticipant 수정

**파일**: [app/admin/meeting-minutes/create/page.tsx:88-98](../app/admin/meeting-minutes/create/page.tsx#L88-L98)

```typescript
const handleAddParticipant = () => {
  setParticipants([
    ...participants,
    {
      id: crypto.randomUUID(),
      name: '',
      role: '',
      attended: true,
      is_internal: false  // 🆕 기본값: 외부 참석자
    }
  ])
}
```

**변경 이유**: 새로운 `is_internal` 필드의 기본값 설정

### AutocompleteSelectInput onChange 로직

```typescript
onChange={(selectedId, selectedName) => {
  const selectedEmployee = employees.find(e => e.id === selectedId)

  if (selectedEmployee) {
    // 내부 직원 선택 (selectedId가 employees에 존재)
    const updated = [...participants]
    updated[index] = {
      ...updated[index],
      name: selectedEmployee.name,
      role: selectedEmployee.position || selectedEmployee.department || '',
      employee_id: selectedEmployee.id,
      is_internal: true
    }
    setParticipants(updated)
  } else {
    // 수동 입력 (selectedId가 비어있음)
    const updated = [...participants]
    updated[index] = {
      ...updated[index],
      name: selectedName,
      employee_id: undefined,
      is_internal: false
    }
    setParticipants(updated)
  }
}}
```

**핵심 로직**:
1. `selectedId`로 employees에서 직원 검색
2. 있으면 → 내부 직원, 직책 자동 설정
3. 없으면 → 외부 참석자, 수동 입력

## ✅ 테스트 방법

### 1. 개발 서버 실행
```bash
npm run dev
```

### 2. 회의록 작성 페이지 접속
```
http://localhost:3000/admin/meeting-minutes/create
```

### 3. 참석자 추가 테스트

#### 내부 직원 추가:
1. "참석자" 섹션 → "추가" 버튼 클릭
2. 이름 필드 클릭
3. "최" 입력 → 직원 목록 표시 확인
4. "최문호 (개발팀 팀장)" 선택
5. ✅ 이름, 직책 자동 입력 확인
6. ✅ "내부" 배지 표시 확인

#### 외부 참석자 추가:
1. "참석자" 섹션 → "추가" 버튼 클릭
2. 이름 필드에 "김고객" 입력
3. '"김고객" 입력' 클릭 또는 Enter
4. ✅ 이름만 입력되고 직책 입력 필드 표시 확인
5. ✅ "외부" 배지 표시 확인
6. 직책 필드에 "대표이사" 입력
7. ✅ 직책 저장 확인

#### 혼합 참석자:
1. 내부 직원 2명 + 외부 참석자 2명 추가
2. ✅ 각각 올바른 배지 표시 확인
3. ✅ 내부 직원은 직책 자동, 외부는 수동 입력 확인

### 4. 저장 및 조회 확인

1. 회의록 작성 완료
2. "완료" 버튼 클릭 → 저장
3. 상세 페이지에서 참석자 정보 확인
4. ✅ 내부/외부 구분 유지 확인
5. ✅ 직책 정보 정확히 표시 확인

## 🎯 개선 효과

### 개선 전

❌ **문제점**:
- 이름, 직책 모두 수동 입력
- 오타 가능성 높음
- 내부 직원 정보와 연결 없음
- 검색/필터링 어려움

```
참석자:
[이름 입력] [직책 입력] [참석 ✓] [삭제]
```

### 개선 후

✅ **장점**:
- 내부 직원 자동완성 (빠른 입력)
- 직책 자동 입력 (정확성)
- 외부 참석자 유연하게 추가
- employee_id 연결 (검색/필터링 가능)
- 내부/외부 명확한 구분

```
참석자:
[자동완성] [참석 ✓] [삭제]
[내부] 개발팀 팀장
```

## 📈 성능 영향

- **API 호출**: 기존 employees API 재사용 (추가 호출 없음)
- **렌더링**: 조건부 렌더링 추가 (최소 영향)
- **번들 크기**: AutocompleteSelectInput 기존 컴포넌트 수정 (증가 없음)

## 🔧 향후 개선 가능사항

1. **참석자 이력 저장**:
   - 자주 참석하는 외부 참석자 목록 관리
   - 최근 사용한 참석자 우선 표시

2. **벌크 추가**:
   - 팀 단위로 여러 내부 직원 한번에 추가
   - 템플릿에서 참석자 목록 불러오기

3. **참석자 통계**:
   - 회의 참석률 분석
   - 직원별 회의 참여 현황

4. **알림 연동**:
   - 내부 직원 선택 시 회의 알림 자동 발송
   - 캘린더 연동

---

**작성일**: 2025-02-01
**담당자**: Claude Code
**상태**: ✅ 구현 완료
**빌드**: ✅ 성공
