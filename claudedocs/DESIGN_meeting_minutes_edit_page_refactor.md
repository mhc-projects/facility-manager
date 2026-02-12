# 회의록 편집 페이지 UI 리팩토링 설계

## 📋 개요

**목적**: 회의록 편집 페이지를 작성 페이지와 동일한 UI/UX로 통일하여 사용자 경험 일관성 확보

**대상 파일**: `app/admin/meeting-minutes/[id]/edit/page.tsx`

**참조 파일**: `app/admin/meeting-minutes/create/page.tsx`

---

## 🔍 현재 상태 분석

### 편집 페이지 (Edit)
- **참석자 관리**:
  - ❌ 단순 텍스트 입력 기반
  - ❌ AutocompleteSelectInput 사용 (단순 자동완성)
  - ❌ 내부/외부 구분 없음
  - ❌ 참석/불참 체크박스 방식

- **안건 담당자**:
  - ❌ 단일 담당자만 선택 가능 (AutocompleteSelectInput)
  - ❌ `assignee_id`, `assignee_name` 필드 사용 (deprecated)
  - ❌ 다중 담당자 미지원

- **레이아웃**:
  - ✅ 2열 그리드 (3fr-2fr) - 작성 페이지와 동일
  - ✅ 섹션별 카드 구조

### 작성 페이지 (Create)
- **참석자 관리**:
  - ✅ 내부 직원: 5열 그리드 체크박스 방식
  - ✅ 외부 참석자: 별도 입력 폼
  - ✅ 활성 직원 필터링 (게스트 제외: `permission_level !== 0`)
  - ✅ 체크박스 클릭 = 참석 의미 (참석/불참 버튼 없음)

- **안건 담당자**:
  - ✅ 다중 담당자 지원 (`assignee_ids`, `assignees`)
  - ✅ AutocompleteSelectInput으로 담당자 추가
  - ✅ 배지 형태로 선택된 담당자 표시
  - ✅ 이미 선택된 담당자는 옵션에서 제외

- **기타 개선사항**:
  - ✅ RecurringIssuesPanel 통합 (정기회의 시)
  - ✅ Portal 기반 드롭다운 (겹침 방지)
  - ✅ 모바일 반응형 그리드

---

## 🎯 리팩토링 목표

### 1. 참석자 관리 통일
**현재 (Edit)**:
```tsx
{participants.map((participant, index) => (
  <div key={participant.id}>
    {!participant.employee_id ? (
      <input type="text" value={participant.name} />
    ) : (
      <AutocompleteSelectInput
        value={participant.employee_id || ''}
        options={employees}
        allowCustomValue={true}
      />
    )}
    <label>
      <input type="checkbox" checked={participant.attended} />
      참석
    </label>
  </div>
))}
```

**목표 (Create 방식)**:
```tsx
{/* 내부 직원 - 체크박스 그리드 */}
<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
  {activeEmployees.map((employee) => {
    const isSelected = participants.some(p => p.employee_id === employee.id)
    return (
      <label key={employee.id}>
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => toggleInternalParticipant(employee.id)}
        />
        <span>{employee.name}</span>
        <span className="text-gray-500">
          {[employee.department, employee.position].filter(Boolean).join(' · ')}
        </span>
      </label>
    )
  })}
</div>

{/* 외부 참석자 - 별도 입력 */}
<div className="space-y-2">
  {externalParticipants.map((ext, idx) => (
    <div key={ext.id}>
      <input value={ext.name} onChange={...} placeholder="이름" />
      <input value={ext.role} onChange={...} placeholder="소속/직함" />
      <button onClick={() => removeExternalParticipant(idx)}>삭제</button>
    </div>
  ))}
  <button onClick={addExternalParticipant}>외부 참석자 추가</button>
</div>
```

### 2. 안건 담당자 다중 선택
**현재 (Edit)**:
```tsx
<AutocompleteSelectInput
  value={item.assignee_id || ''}
  onChange={(id, name) => {
    updated[index] = {
      ...updated[index],
      assignee_name: name,
      assignee_id: id
    }
  }}
/>
```

**목표 (Create 방식)**:
```tsx
{/* 담당자 입력 */}
<AutocompleteSelectInput
  value=""
  onChange={(selectedId, selectedName) => {
    if (!selectedId) return
    const currentIds = item.assignee_ids || []
    if (currentIds.includes(selectedId)) return

    const updated = [...agenda]
    updated[index] = {
      ...updated[index],
      assignee_ids: [...currentIds, selectedId],
      assignees: [...(item.assignees || []), { id: selectedId, name: selectedEmployee.name }]
    }
    setAgenda(updated)
  }}
  options={activeEmployees
    .filter(e => !(item.assignee_ids || []).includes(e.id))
    .map(e => ({
      id: e.id,
      name: `${e.name}${e.department || e.position ? ` (${[e.department, e.position].filter(Boolean).join(' · ')})` : ''}`
    }))}
  placeholder="담당자 입력하여 추가..."
/>

{/* 선택된 담당자 배지 */}
{(item.assignees || []).map(assignee => (
  <span key={assignee.id} className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs">
    {assignee.name}
    <button onClick={() => removeAssignee(index, assignee.id)}>
      <X className="w-3 h-3" />
    </button>
  </span>
))}
```

### 3. RecurringIssuesPanel 통합
**추가 기능**:
```tsx
{meetingType === '정기회의' && (
  <RecurringIssuesPanel
    onSelectIssue={(issue) => {
      setBusinessIssues([...businessIssues, {
        id: crypto.randomUUID(),
        business_id: issue.business_id,
        business_name: issue.business_name,
        issue_description: issue.issue_description,
        assignee_id: issue.assignee_id,
        assignee_name: issue.assignee_name,
        is_completed: false
      }])
    }}
  />
)}
```

---

## 📐 구현 계획

### Phase 1: 데이터 구조 변경
**1.1 State 추가**
```tsx
const [activeEmployees, setActiveEmployees] = useState<any[]>([]) // 내부 직원 (게스트 제외)
const [externalParticipants, setExternalParticipants] = useState<Array<{
  id: string
  name: string
  role: string
  attended: boolean
}>>([])
```

**1.2 기존 데이터 마이그레이션 로직**
```tsx
const loadMeetingMinute = async () => {
  // ... 기존 로드 로직 ...

  // 참석자 분류
  const internalParts: MeetingParticipant[] = []
  const externalParts: Array<{id: string, name: string, role: string, attended: boolean}> = []

  participantsData.forEach(p => {
    if (p.is_internal && p.employee_id) {
      internalParts.push(p)
    } else {
      externalParts.push({
        id: p.id,
        name: p.name,
        role: p.role,
        attended: p.attended
      })
    }
  })

  setParticipants(internalParts)
  setExternalParticipants(externalParts)
}
```

### Phase 2: 참석자 UI 리팩토링
**2.1 내부 직원 체크박스 그리드**
```tsx
{/* 내부 직원 */}
<div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
  <h2 className="text-base font-semibold text-gray-900 mb-3">
    <UsersIcon className="w-4 h-4 inline mr-1" />
    참석자 - 내부 직원 ({participants.length})
  </h2>

  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
    {activeEmployees.map((employee) => {
      const isSelected = participants.some(p => p.employee_id === employee.id)
      return (
        <label key={employee.id} className="flex items-center gap-2 p-2 bg-gray-50 rounded cursor-pointer hover:bg-gray-100">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => toggleInternalParticipant(employee.id)}
            className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
          />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-gray-900 truncate">
              {employee.name}
            </div>
            {(employee.department || employee.position) && (
              <div className="text-xs text-gray-500 truncate">
                {[employee.department, employee.position].filter(Boolean).join(' · ')}
              </div>
            )}
          </div>
        </label>
      )
    })}
  </div>
</div>
```

**2.2 외부 참석자 입력 폼**
```tsx
{/* 외부 참석자 */}
<div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
  <div className="flex items-center justify-between mb-3">
    <h2 className="text-base font-semibold text-gray-900">
      참석자 - 외부 ({externalParticipants.length})
    </h2>
    <button
      onClick={addExternalParticipant}
      className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
    >
      <Plus className="w-4 h-4" />
      <span>추가</span>
    </button>
  </div>

  {externalParticipants.length === 0 ? (
    <div className="text-center py-4 text-gray-500 text-sm">
      외부 참석자가 없습니다
    </div>
  ) : (
    <div className="space-y-2">
      {externalParticipants.map((ext, idx) => (
        <div key={ext.id} className="flex items-center gap-2 p-2 bg-gray-50 rounded">
          <input
            type="text"
            value={ext.name}
            onChange={(e) => updateExternalParticipant(idx, 'name', e.target.value)}
            placeholder="이름"
            className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
          />
          <input
            type="text"
            value={ext.role}
            onChange={(e) => updateExternalParticipant(idx, 'role', e.target.value)}
            placeholder="소속/직함"
            className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
          />
          <label className="flex items-center gap-1 text-xs">
            <input
              type="checkbox"
              checked={ext.attended}
              onChange={(e) => updateExternalParticipant(idx, 'attended', e.target.checked)}
              className="w-3.5 h-3.5 text-blue-600 rounded"
            />
            참석
          </label>
          <button
            onClick={() => removeExternalParticipant(idx)}
            className="p-1 text-red-600 hover:bg-red-50 rounded"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  )}
</div>
```

### Phase 3: 안건 담당자 다중 선택
**3.1 AgendaItem 구조 변환**
```tsx
const handleUpdateAgenda = (index: number, field: keyof AgendaItem, value: any) => {
  const updated = [...agenda]

  // 다중 담당자 지원을 위한 변환
  if (!updated[index].assignee_ids && updated[index].assignee_id) {
    // 기존 단일 담당자 → 다중 담당자 형식으로 마이그레이션
    updated[index] = {
      ...updated[index],
      assignee_ids: [updated[index].assignee_id!],
      assignees: [{
        id: updated[index].assignee_id!,
        name: updated[index].assignee_name || ''
      }]
    }
  }

  updated[index] = { ...updated[index], [field]: value }
  setAgenda(updated)
}
```

**3.2 담당자 추가/삭제 UI**
```tsx
{/* 담당자 추가 */}
<div className="space-y-2">
  <AutocompleteSelectInput
    value=""
    onChange={(selectedId, selectedName) => {
      if (!selectedId) return
      const selectedEmployee = activeEmployees.find(e => e.id === selectedId)
      if (!selectedEmployee) return

      const currentIds = item.assignee_ids || []
      if (currentIds.includes(selectedId)) return

      const updated = [...agenda]
      updated[index] = {
        ...updated[index],
        assignee_ids: [...currentIds, selectedId],
        assignees: [...(item.assignees || []), {
          id: selectedId,
          name: selectedEmployee.name
        }]
      }
      setAgenda(updated)
    }}
    options={activeEmployees
      .filter(e => !(item.assignee_ids || []).includes(e.id))
      .map(e => ({
        id: e.id,
        name: `${e.name}${e.department || e.position ? ` (${[e.department, e.position].filter(Boolean).join(' · ')})` : ''}`
      }))}
    placeholder="담당자 입력하여 추가..."
    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
  />

  {/* 선택된 담당자 배지 */}
  {(item.assignees || []).length > 0 && (
    <div className="flex flex-wrap gap-1.5">
      {(item.assignees || []).map(assignee => (
        <span
          key={assignee.id}
          className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs"
        >
          {assignee.name}
          <button
            onClick={() => {
              const updated = [...agenda]
              updated[index] = {
                ...updated[index],
                assignee_ids: (item.assignee_ids || []).filter(id => id !== assignee.id),
                assignees: (item.assignees || []).filter(a => a.id !== assignee.id)
              }
              setAgenda(updated)
            }}
            className="hover:bg-blue-200 rounded-full p-0.5"
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}
    </div>
  )}
</div>
```

### Phase 4: RecurringIssuesPanel 통합
```tsx
import RecurringIssuesPanel from '@/components/admin/meeting-minutes/RecurringIssuesPanel'

// JSX 내부
{meetingType === '정기회의' && (
  <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
    <h2 className="text-base font-semibold text-gray-900 mb-3">
      반복 이슈 가져오기
    </h2>
    <RecurringIssuesPanel
      onSelectIssue={(issue) => {
        setBusinessIssues([...businessIssues, {
          id: crypto.randomUUID(),
          business_id: issue.business_id,
          business_name: issue.business_name,
          issue_description: issue.issue_description,
          assignee_id: issue.assignee_id,
          assignee_name: issue.assignee_name,
          is_completed: false
        }])
      }}
    />
  </div>
)}
```

### Phase 5: 저장 로직 통합
**5.1 저장 시 데이터 병합**
```tsx
const handleSave = async (newStatus?: 'draft' | 'completed' | 'archived') => {
  // 내부 + 외부 참석자 병합
  const allParticipants = [
    ...participants, // 내부 직원
    ...externalParticipants.map(ext => ({
      id: ext.id,
      name: ext.name,
      role: ext.role,
      attended: ext.attended,
      employee_id: undefined,
      is_internal: false
    }))
  ]

  const data: UpdateMeetingMinuteRequest = {
    title,
    meeting_date: new Date(meetingDate).toISOString(),
    meeting_type: meetingType,
    participants: allParticipants, // 병합된 참석자
    location,
    location_type: locationType,
    agenda, // 다중 담당자 포함
    content: {
      summary,
      discussions: [],
      business_issues: businessIssues
    },
    status: newStatus || status
  }

  // ... 저장 API 호출 ...
}
```

---

## ✅ 검증 체크리스트

### 기능 검증
- [ ] 기존 회의록 데이터 정상 로드 (내부/외부 참석자 분류)
- [ ] 내부 직원 5열 그리드 체크박스 작동
- [ ] 외부 참석자 추가/수정/삭제
- [ ] 안건 담당자 다중 선택 (추가/삭제)
- [ ] 기존 단일 담당자 데이터 호환성 (마이그레이션)
- [ ] RecurringIssuesPanel 통합 (정기회의 시)
- [ ] 임시저장/완료 저장 정상 작동
- [ ] 저장 후 상세 페이지로 리다이렉션

### UI/UX 검증
- [ ] 작성 페이지와 동일한 레이아웃 구조
- [ ] 모바일 반응형 그리드 (5→4→3→2→1열)
- [ ] Portal 기반 드롭다운 (AutocompleteSelectInput)
- [ ] 게스트 계정 필터링 (`permission_level !== 0`)
- [ ] 선택된 담당자 배지 표시
- [ ] 부서/직급 정보 표시

### 데이터 무결성 검증
- [ ] 기존 회의록 편집 후 데이터 손실 없음
- [ ] deprecated 필드 유지 (하위 호환성)
- [ ] 새로운 다중 담당자 필드 정상 저장
- [ ] 내부/외부 참석자 구분 유지

---

## 🚧 리스크 및 주의사항

### 1. 하위 호환성
**문제**: 기존 단일 담당자 데이터 (`assignee_id`, `assignee_name`)가 있는 회의록
**해결**: 로드 시 자동 변환 로직 추가
```tsx
if (item.assignee_id && !item.assignee_ids) {
  item.assignee_ids = [item.assignee_id]
  item.assignees = [{
    id: item.assignee_id,
    name: item.assignee_name || ''
  }]
}
```

### 2. 참석자 데이터 분류
**문제**: 기존 참석자 데이터에 `is_internal` 필드가 없을 수 있음
**해결**: `employee_id` 유무로 판단
```tsx
const isInternal = !!participant.employee_id
```

### 3. 게스트 계정 필터링
**문제**: API에서 `permission_level` 필드 누락 가능
**해결**: API 응답에 `permission_level` 필드 포함 확인 (이미 수정 완료)

---

## 📝 구현 순서

1. ✅ **Phase 1**: State 추가 및 데이터 로드 로직 수정
2. ✅ **Phase 2**: 참석자 UI 리팩토링 (내부/외부 분리)
3. ✅ **Phase 3**: 안건 담당자 다중 선택 UI
4. ✅ **Phase 4**: RecurringIssuesPanel 통합
5. ✅ **Phase 5**: 저장 로직 통합 및 테스트
6. ✅ **Phase 6**: UI/UX 검증 및 버그 수정

---

## 📊 예상 효과

### 사용자 경험
- ✅ 작성/편집 페이지 UI 일관성 확보
- ✅ 5열 그리드로 내부 직원 빠른 선택
- ✅ 외부 참석자 명확한 구분 및 관리
- ✅ 다중 담당자 선택으로 협업 작업 지원
- ✅ 반복 이슈 패널로 정기회의 효율성 증대

### 개발자 경험
- ✅ 단일 UI 패턴으로 유지보수 용이
- ✅ 타입 안정성 확보 (TypeScript)
- ✅ 재사용 가능한 컴포넌트 활용

### 데이터 무결성
- ✅ 하위 호환성 유지
- ✅ 게스트 계정 필터링으로 데이터 정확성
- ✅ 다중 담당자 구조로 확장 가능성
