# 회의록 작성 UX 개선 설계

**날짜**: 2026-02-12
**페이지**: app/admin/meeting-minutes/create/page.tsx
**목적**: 참석자 및 안건 담당자 입력 방식 개선

## 🎯 개선 목표

### 1. 참석자 섹션 개선
- **현재**: 모든 참석자를 AutocompleteSelectInput으로 입력 (타이핑 필요)
- **개선**:
  - 내부 직원: 클릭 가능한 체크박스/버튼 리스트로 표시
  - 외부 참석자: 별도 입력 필드로 추가
  - 활성 사용자만 표시 (게스트 제외)

### 2. 안건 담당자 개선
- **현재**: 안건당 담당자 1명만 선택 가능
- **개선**: 안건당 여러 명의 담당자 선택 가능

## 📐 설계 상세

### 개선 1: 참석자 섹션 리디자인

#### 데이터 구조
```typescript
// 기존 유지
interface Participant {
  name: string
  role: string
  is_present: boolean
  employee_id?: string
  is_internal: boolean
}

// 새로운 필터 타입
type UserStatus = 'active' | 'inactive' | 'guest'
```

#### UI 구조
```
┌─────────────────────────────────────────────────────────┐
│ 참석자                                    [외부 참석자 추가] │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ ✅ 김경수 (미입력 차장)                      [참석] [불참]  │
│ ⬜ 김서해 (영업관리부 주임)                  [참석] [불참]  │
│ ✅ 박수진 (영업부 실장)                      [참석] [불참]  │
│ ⬜ 최문호 ( 차장)                           [참석] [불참]  │
│                                                         │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                                         │
│ 외부 참석자 (2명)                                        │
│ • 홍길동 대리                               [삭제]       │
│ • 이순신 고문                               [삭제]       │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

#### 컴포넌트 구조
```typescript
// 참석자 섹션
<div className="참석자-섹션">
  {/* 헤더 */}
  <div className="flex justify-between items-center">
    <h2>참석자</h2>
    <button onClick={addExternalParticipant}>
      외부 참석자 추가
    </button>
  </div>

  {/* 내부 직원 리스트 */}
  <div className="내부-직원-리스트">
    {activeEmployees.map(employee => (
      <div className="직원-행" key={employee.id}>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={isParticipant(employee.id)}
            onChange={() => toggleParticipant(employee.id)}
          />
          <span>{employee.name} ({employee.department} {employee.position})</span>
        </label>

        {isParticipant(employee.id) && (
          <div className="참석-여부">
            <button
              className={participant.is_present ? 'active' : ''}
              onClick={() => setPresence(employee.id, true)}
            >
              참석
            </button>
            <button
              className={!participant.is_present ? 'active' : ''}
              onClick={() => setPresence(employee.id, false)}
            >
              불참
            </button>
          </div>
        )}
      </div>
    ))}
  </div>

  {/* 외부 참석자 리스트 */}
  {externalParticipants.length > 0 && (
    <div className="외부-참석자-리스트">
      <h3>외부 참석자 ({externalParticipants.length}명)</h3>
      {externalParticipants.map((participant, index) => (
        <div className="외부-참석자-행" key={index}>
          <span>• {participant.name}</span>
          <button onClick={() => removeExternalParticipant(index)}>
            삭제
          </button>
        </div>
      ))}
    </div>
  )}
</div>
```

#### 상태 관리
```typescript
// 내부 직원 필터링
const activeEmployees = employees.filter(e =>
  e.status === 'active' && e.role !== 'guest'
)

// 참석자 상태
const [participants, setParticipants] = useState<Participant[]>([])
const [externalParticipants, setExternalParticipants] = useState<Participant[]>([])

// 유틸리티 함수
const isParticipant = (employeeId: string) => {
  return participants.some(p => p.employee_id === employeeId)
}

const toggleParticipant = (employeeId: string) => {
  const employee = activeEmployees.find(e => e.id === employeeId)
  if (!employee) return

  if (isParticipant(employeeId)) {
    // 제거
    setParticipants(prev => prev.filter(p => p.employee_id !== employeeId))
  } else {
    // 추가 (기본값: 참석)
    setParticipants(prev => [...prev, {
      name: `${employee.name} (${employee.department} ${employee.position})`.trim(),
      role: employee.position || employee.department || '',
      is_present: true,
      employee_id: employee.id,
      is_internal: true
    }])
  }
}

const setPresence = (employeeId: string, isPresent: boolean) => {
  setParticipants(prev => prev.map(p =>
    p.employee_id === employeeId ? { ...p, is_present: isPresent } : p
  ))
}

const addExternalParticipant = () => {
  // 모달 또는 인라인 입력 폼 표시
  const name = prompt('외부 참석자 이름을 입력하세요:')
  if (name && name.trim()) {
    setExternalParticipants(prev => [...prev, {
      name: name.trim(),
      role: '',
      is_present: true,
      is_internal: false
    }])
  }
}

const removeExternalParticipant = (index: number) => {
  setExternalParticipants(prev => prev.filter((_, i) => i !== index))
}
```

### 개선 2: 안건 담당자 다중 선택

#### 데이터 구조
```typescript
// 현재
interface AgendaItem {
  title: string
  description: string
  assignee_id: string | null  // 단일 담당자
  assignee_name: string
  status: 'pending' | 'in_progress' | 'completed'
  priority: 'low' | 'medium' | 'high'
}

// 개선
interface AgendaItem {
  title: string
  description: string
  assignee_ids: string[]      // 다중 담당자 (배열로 변경)
  assignees: {                // 담당자 정보 배열
    id: string
    name: string
  }[]
  status: 'pending' | 'in_progress' | 'completed'
  priority: 'low' | 'medium' | 'high'
}
```

#### UI 구조
```
┌─────────────────────────────────────────────────────────┐
│ 안건 1                                          [삭제]    │
├─────────────────────────────────────────────────────────┤
│ 제목: [입력 필드]                                         │
│                                                         │
│ 담당자:                                                  │
│ ┌───────────────────────────────────────────────────┐  │
│ │ ✅ 김경수 (미입력 차장)                             │  │
│ │ ✅ 박수진 (영업부 실장)                             │  │
│ │ ⬜ 최문호 ( 차장)                                   │  │
│ └───────────────────────────────────────────────────┘  │
│                                                         │
│ 내용: [텍스트영역]                                        │
│                                                         │
│ 상태: [드롭다운]  우선순위: [드롭다운]                    │
└─────────────────────────────────────────────────────────┘
```

#### 컴포넌트 구조
```typescript
<div className="안건-아이템">
  <input
    type="text"
    placeholder="안건 제목"
    value={agenda.title}
    onChange={(e) => updateAgenda(index, 'title', e.target.value)}
  />

  {/* 담당자 다중 선택 */}
  <div className="담당자-선택">
    <label>담당자</label>
    <div className="담당자-체크박스-리스트">
      {activeEmployees.map(employee => (
        <label key={employee.id} className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={agenda.assignee_ids.includes(employee.id)}
            onChange={() => toggleAssignee(index, employee.id)}
          />
          <span>{employee.name} ({employee.department} {employee.position})</span>
        </label>
      ))}
    </div>

    {/* 선택된 담당자 표시 */}
    {agenda.assignees.length > 0 && (
      <div className="선택된-담당자">
        {agenda.assignees.map(assignee => (
          <span key={assignee.id} className="badge">
            {assignee.name}
            <button onClick={() => removeAssignee(index, assignee.id)}>×</button>
          </span>
        ))}
      </div>
    )}
  </div>

  <textarea
    placeholder="안건 내용"
    value={agenda.description}
    onChange={(e) => updateAgenda(index, 'description', e.target.value)}
  />

  {/* 상태 및 우선순위 */}
  <div className="flex gap-4">
    <select
      value={agenda.status}
      onChange={(e) => updateAgenda(index, 'status', e.target.value)}
    >
      <option value="pending">예정</option>
      <option value="in_progress">진행중</option>
      <option value="completed">완료</option>
    </select>

    <select
      value={agenda.priority}
      onChange={(e) => updateAgenda(index, 'priority', e.target.value)}
    >
      <option value="low">낮음</option>
      <option value="medium">보통</option>
      <option value="high">높음</option>
    </select>
  </div>
</div>
```

#### 상태 관리
```typescript
const [agendaItems, setAgendaItems] = useState<AgendaItem[]>([])

const toggleAssignee = (agendaIndex: number, employeeId: string) => {
  setAgendaItems(prev => prev.map((agenda, idx) => {
    if (idx !== agendaIndex) return agenda

    const employee = activeEmployees.find(e => e.id === employeeId)
    if (!employee) return agenda

    const isSelected = agenda.assignee_ids.includes(employeeId)

    if (isSelected) {
      // 제거
      return {
        ...agenda,
        assignee_ids: agenda.assignee_ids.filter(id => id !== employeeId),
        assignees: agenda.assignees.filter(a => a.id !== employeeId)
      }
    } else {
      // 추가
      return {
        ...agenda,
        assignee_ids: [...agenda.assignee_ids, employeeId],
        assignees: [...agenda.assignees, {
          id: employee.id,
          name: employee.name
        }]
      }
    }
  }))
}

const removeAssignee = (agendaIndex: number, employeeId: string) => {
  setAgendaItems(prev => prev.map((agenda, idx) => {
    if (idx !== agendaIndex) return agenda

    return {
      ...agenda,
      assignee_ids: agenda.assignee_ids.filter(id => id !== employeeId),
      assignees: agenda.assignees.filter(a => a.id !== employeeId)
    }
  }))
}
```

## 🗄️ 데이터베이스 마이그레이션

### 안건 담당자 테이블 변경

#### 현재 스키마 (추정)
```sql
CREATE TABLE meeting_agendas (
  id UUID PRIMARY KEY,
  meeting_id UUID REFERENCES meetings(id),
  title TEXT,
  description TEXT,
  assignee_id UUID REFERENCES employees(id),  -- 단일 담당자
  status TEXT,
  priority TEXT
);
```

#### 개선된 스키마 (옵션 1: 배열 사용)
```sql
ALTER TABLE meeting_agendas
  DROP COLUMN assignee_id,
  ADD COLUMN assignee_ids UUID[] DEFAULT '{}';  -- 다중 담당자 배열
```

#### 개선된 스키마 (옵션 2: 관계 테이블 - 권장)
```sql
-- 담당자 관계를 별도 테이블로 관리 (정규화)
CREATE TABLE meeting_agenda_assignees (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agenda_id UUID REFERENCES meeting_agendas(id) ON DELETE CASCADE,
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(agenda_id, employee_id)  -- 중복 방지
);

-- 기존 assignee_id 데이터 마이그레이션
INSERT INTO meeting_agenda_assignees (agenda_id, employee_id)
SELECT id, assignee_id
FROM meeting_agendas
WHERE assignee_id IS NOT NULL;

-- assignee_id 컬럼 제거
ALTER TABLE meeting_agendas DROP COLUMN assignee_id;
```

## 🎨 UI/UX 디자인 가이드

### 참석자 섹션
```css
/* 내부 직원 체크박스 행 */
.employee-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem;
  border-bottom: 1px solid #e5e7eb;
  transition: background-color 0.2s;
}

.employee-row:hover {
  background-color: #f9fafb;
}

.employee-row.selected {
  background-color: #eff6ff;
}

/* 참석/불참 토글 버튼 */
.presence-toggle {
  display: flex;
  gap: 0.5rem;
}

.presence-button {
  padding: 0.25rem 0.75rem;
  font-size: 0.875rem;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  background-color: white;
  cursor: pointer;
  transition: all 0.2s;
}

.presence-button.active {
  background-color: #3b82f6;
  color: white;
  border-color: #3b82f6;
}

/* 외부 참석자 리스트 */
.external-participants {
  margin-top: 1.5rem;
  padding-top: 1.5rem;
  border-top: 2px solid #e5e7eb;
}

.external-participant-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem;
  background-color: #f3f4f6;
  border-radius: 0.375rem;
  margin-bottom: 0.5rem;
}
```

### 안건 담당자 섹션
```css
/* 담당자 체크박스 리스트 */
.assignee-checkbox-list {
  max-height: 200px;
  overflow-y: auto;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  padding: 0.5rem;
  background-color: white;
}

.assignee-checkbox-item {
  padding: 0.5rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  transition: background-color 0.2s;
}

.assignee-checkbox-item:hover {
  background-color: #f9fafb;
}

/* 선택된 담당자 배지 */
.selected-assignees {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.75rem;
}

.assignee-badge {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.75rem;
  background-color: #dbeafe;
  color: #1e40af;
  border-radius: 9999px;
  font-size: 0.875rem;
}

.assignee-badge button {
  background: none;
  border: none;
  color: #1e40af;
  font-weight: bold;
  cursor: pointer;
  padding: 0;
  margin-left: 0.25rem;
}
```

## 📋 구현 체크리스트

### Phase 1: 참석자 섹션 개선
- [ ] activeEmployees 필터링 로직 구현 (status='active', role!='guest')
- [ ] 내부 직원 체크박스 UI 구현
- [ ] 참석/불참 토글 버튼 구현
- [ ] 외부 참석자 추가/삭제 기능 구현
- [ ] participants 상태 관리 리팩토링
- [ ] 기존 AutocompleteSelectInput 제거
- [ ] UI 스타일링 적용

### Phase 2: 안건 담당자 다중 선택
- [ ] 데이터베이스 스키마 변경 (meeting_agenda_assignees 테이블 생성)
- [ ] 기존 데이터 마이그레이션 스크립트 작성
- [ ] AgendaItem 인터페이스 업데이트
- [ ] 담당자 다중 선택 체크박스 UI 구현
- [ ] 선택된 담당자 배지 UI 구현
- [ ] toggleAssignee, removeAssignee 함수 구현
- [ ] API 엔드포인트 업데이트 (assignee_ids 배열 처리)
- [ ] 회의록 조회 시 담당자 정보 조인 쿼리 수정

### Phase 3: 테스트 및 검증
- [ ] 내부 직원 선택/해제 동작 테스트
- [ ] 외부 참석자 추가/삭제 동작 테스트
- [ ] 안건 담당자 다중 선택 동작 테스트
- [ ] 회의록 저장 및 조회 E2E 테스트
- [ ] 데이터베이스 마이그레이션 테스트
- [ ] 모바일 반응형 레이아웃 테스트

## 🎯 예상 효과

### 참석자 섹션
✅ **효율성 향상**: 타이핑 없이 클릭만으로 내부 직원 선택
✅ **직관성**: 전체 직원 목록을 한눈에 확인
✅ **명확성**: 내부/외부 참석자 구분 명확화
✅ **빠른 입력**: 체크박스 클릭으로 다수 참석자 빠르게 선택

### 안건 담당자
✅ **협업 지원**: 여러 담당자가 함께 작업하는 안건 표현 가능
✅ **책임 공유**: 팀 단위 안건에 여러 팀원 배정
✅ **추적 개선**: 각 담당자별 진행 상황 관리 가능

## 🔄 마이그레이션 전략

### 단계별 배포
1. **Phase 1**: 참석자 섹션만 먼저 배포 (기존 호환성 유지)
2. **Phase 2**: 데이터베이스 마이그레이션 실행 (다운타임 최소화)
3. **Phase 3**: 안건 담당자 다중 선택 기능 활성화
4. **Phase 4**: 기존 AutocompleteSelectInput 코드 정리

### 롤백 계획
- Phase 1 실패 시: 기존 AutocompleteSelectInput으로 복원
- Phase 2 실패 시: 데이터베이스 마이그레이션 롤백 스크립트 실행
- Phase 3 실패 시: 단일 담당자 모드로 전환 (assignee_ids[0] 사용)

## 📝 참고 사항

- 기존 회의록 데이터와의 호환성 유지 필요
- 외부 참석자 입력 시 유효성 검증 추가 권장
- 담당자 다중 선택 시 최대 인원 제한 고려 (예: 최대 5명)
- 모바일에서는 체크박스 리스트를 드롭다운 모달로 표시 고려
