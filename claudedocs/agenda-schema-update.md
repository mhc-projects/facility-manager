# 회의록 안건 스키마 업데이트

## 📋 작업 요약

회의록(Meeting Minutes) 시스템의 안건(Agenda) 섹션에서 시간(duration) 필드를 제거하고, 데드라인(deadline)과 담당자(assignee) 필드를 추가했습니다.

## 🎯 변경 목적

- **불필요한 필드 제거**: 15분 디폴트로 표시되던 duration 필드 삭제
- **데드라인 관리**: 각 안건의 마감일 설정 기능 추가
- **담당자 지정**: 안건별 담당자 할당 기능 추가
- **실용성 향상**: 실제 업무에 필요한 정보만 수집

## 📝 주요 변경사항

### 1. 타입 정의 변경

**파일**: [types/meeting-minutes.ts](../types/meeting-minutes.ts)

```typescript
// ❌ 이전 스키마
export interface AgendaItem {
  id: string
  title: string
  description: string
  duration: number  // 분 단위
}

// ✅ 새로운 스키마
export interface AgendaItem {
  id: string
  title: string
  description: string
  deadline?: string      // 데드라인 (ISO 날짜, optional)
  assignee_id?: string   // 담당자 ID (employees 참조, optional)
  assignee_name?: string // 담당자명 (표시용, optional)
}
```

**변경사항:**
- `duration: number` 제거
- `deadline?: string` 추가 (optional)
- `assignee_id?: string` 추가 (optional)
- `assignee_name?: string` 추가 (optional)

### 2. UI 변경

**파일**: [app/admin/meeting-minutes/create/page.tsx](../app/admin/meeting-minutes/create/page.tsx)

**제거된 UI:**
```tsx
{/* ❌ 제거됨 */}
<div className="flex items-center gap-2">
  <Clock className="w-4 h-4 text-gray-400" />
  <input
    type="number"
    value={item.duration}
    onChange={(e) => handleUpdateAgenda(index, 'duration', parseInt(e.target.value))}
    min="5"
    step="5"
  />
  <span className="text-sm text-gray-600">분</span>
</div>
```

**추가된 UI:**
```tsx
{/* ✅ 추가됨 */}
<div className="flex gap-3">
  {/* 데드라인 */}
  <div className="flex-1">
    <label>데드라인</label>
    <input
      type="date"
      value={item.deadline || ''}
      onChange={(e) => handleUpdateAgenda(index, 'deadline', e.target.value)}
    />
  </div>

  {/* 담당자 */}
  <div className="flex-1">
    <label>담당자</label>
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
    />
  </div>
</div>
```

### 3. 초기값 변경

**파일**: [app/admin/meeting-minutes/create/page.tsx:111-121](../app/admin/meeting-minutes/create/page.tsx)

```typescript
// ❌ 이전
const handleAddAgenda = () => {
  setAgenda([
    ...agenda,
    {
      id: crypto.randomUUID(),
      title: '',
      description: '',
      duration: 15  // 기본값 15분
    }
  ])
}

// ✅ 변경 후
const handleAddAgenda = () => {
  setAgenda([
    ...agenda,
    {
      id: crypto.randomUUID(),
      title: '',
      description: '',
      deadline: '',
      assignee_id: '',
      assignee_name: ''
    }
  ])
}
```

### 4. Import 정리

**파일**: [app/admin/meeting-minutes/create/page.tsx:10-18](../app/admin/meeting-minutes/create/page.tsx)

```typescript
// Clock 아이콘 import 제거
import {
  ArrowLeft,
  Save,
  Plus,
  Trash2,
  Calendar as CalendarIcon,
  Users as UsersIcon,
  // Clock,  ❌ 제거됨
  MapPin
} from 'lucide-react'
```

## 🎨 UI 스크린샷 (예상)

### 이전 (duration 필드)
```
┌──────────────────────────────────┐
│ 1  안건 제목: [          ]      │
│    안건 설명: [          ]      │
│    🕐 [15] 분                   │
└──────────────────────────────────┘
```

### 변경 후 (deadline + assignee)
```
┌──────────────────────────────────┐
│ 1  안건 제목: [          ]      │
│    안건 설명: [          ]      │
│    데드라인: [2025-02-10]       │
│    담당자: [홍길동 ▼]           │
└──────────────────────────────────┘
```

## 📊 영향 범위

### 영향 받는 파일

| 파일 | 변경 사항 |
|------|-----------|
| [types/meeting-minutes.ts](../types/meeting-minutes.ts) | AgendaItem 인터페이스 업데이트 |
| [app/admin/meeting-minutes/create/page.tsx](../app/admin/meeting-minutes/create/page.tsx) | UI 업데이트, 핸들러 수정, import 정리 |
| [sql/update_agenda_schema.sql](../sql/update_agenda_schema.sql) | DB 마이그레이션 참고용 SQL |

### 영향 받지 않는 기능

- ✅ 회의록 목록 조회
- ✅ 회의록 상세 보기 (기존 데이터 호환)
- ✅ 기타 회의록 기능

## ⚠️ 주의사항

### 1. 하위 호환성

**기존 회의록:**
- `duration` 필드가 있는 기존 데이터는 유지됨
- 프론트엔드에서 `duration` 필드 무시
- 상세 보기/수정 시 정상 작동

**신규 회의록:**
- `duration` 필드 없이 저장됨
- `deadline`, `assignee_id`, `assignee_name` 사용

### 2. Optional 필드

모든 새 필드가 optional이므로:
- 데드라인 미설정 가능
- 담당자 미지정 가능
- 기존 코드와 완벽 호환

### 3. DB 마이그레이션

**마이그레이션 불필요:**
- JSONB 구조이므로 스키마 변경 불필요
- 기존 데이터 유지
- 신규 데이터만 새 스키마 사용

**선택적 정리:**
- 기존 데이터에서 `duration` 제거 원하면
- [sql/update_agenda_schema.sql](../sql/update_agenda_schema.sql) 참고

## 🔧 담당자 자동완성 기능

### AutocompleteSelectInput 재사용

사업장별 이슈에서 구현한 `AutocompleteSelectInput` 컴포넌트를 안건 담당자 선택에도 동일하게 사용:

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
/>
```

**기능:**
- ✅ 키보드 검색 (타이핑으로 필터링)
- ✅ 드롭다운 자동완성
- ✅ 키보드 네비게이션 (↑↓, Enter, Esc)
- ✅ 마우스 클릭 선택
- ✅ 선택된 값 표시

## 🎉 완료된 작업

- ✅ AgendaItem 타입 정의 업데이트
- ✅ duration 필드 UI 제거
- ✅ deadline 날짜 선택 UI 추가
- ✅ assignee 자동완성 UI 추가
- ✅ handleAddAgenda 초기값 변경
- ✅ Clock 아이콘 import 제거
- ✅ 빌드 테스트 통과
- ✅ DB 마이그레이션 SQL 작성 (참고용)

## 📚 다음 단계

### 선택사항 1: Edit 페이지 업데이트

```bash
# Edit 페이지도 동일하게 업데이트 필요
# app/admin/meeting-minutes/[id]/edit/page.tsx
```

### 선택사항 2: 상세 보기 페이지 업데이트

```bash
# 상세 보기에서 duration 대신 deadline/assignee 표시
# app/admin/meeting-minutes/[id]/page.tsx
```

### 선택사항 3: 기존 데이터 정리

```bash
# 기존 회의록에서 duration 필드 제거
# sql/update_agenda_schema.sql 주석 부분 참고
```

## 🔍 테스트 체크리스트

- [x] 빌드 성공 확인
- [ ] 회의록 작성 페이지 UI 확인
  - [ ] 안건 추가 버튼 클릭
  - [ ] 데드라인 날짜 선택
  - [ ] 담당자 자동완성 검색
  - [ ] 담당자 선택 후 표시 확인
- [ ] 신규 회의록 저장 테스트
- [ ] 저장된 안건 데이터 확인 (deadline, assignee_id, assignee_name)
- [ ] 기존 회의록 조회 테스트 (하위 호환성)
- [ ] Edit 페이지 업데이트 (선택)

## 💡 사용 예시

### 안건 작성 예시

**안건 1:**
- 제목: "2025년 1분기 목표 설정"
- 설명: "분기별 KPI 및 목표 수립"
- 데드라인: 2025-02-15
- 담당자: 홍길동

**안건 2:**
- 제목: "신규 프로젝트 검토"
- 설명: "A사 제안서 검토 및 의사결정"
- 데드라인: 2025-02-20
- 담당자: 김영희

**안건 3:**
- 제목: "팀 워크샵 기획"
- 설명: "분기 워크샵 일정 및 장소 논의"
- 데드라인: (미설정)
- 담당자: (미지정)

## 📞 문의

문제 발생 시:
1. 빌드 에러 → 타입 정의 확인 (AgendaItem 인터페이스)
2. 담당자 선택 안됨 → AutocompleteSelectInput stale closure 이슈 확인
3. 저장 에러 → agenda 구조 확인

---

**작성일**: 2025-02-01
**담당자**: Claude Code
**상태**: ✅ 완료
