# 엑셀 일괄등록 유효성 검사 수정

## 문제 상황

admin/tasks 페이지의 엑셀 일괄등록 기능에서 다음 문제가 발생:

1. **과도한 필수 항목**: 담당자, 현재단계, 업무타입까지 필수로 설정되어 오류가 많이 발생
2. **잘못된 업무타입 값**: "자가" 대신 "자비"가 올바른 값

## 수정 내용

### 파일: `components/tasks/BulkUploadModal.tsx`

#### 1. 업무타입 "대리점", "외주설치", "기타" 추가 (2024-02-02 추가 수정)

**수정된 위치**:
1. **Line 58-65**: 가이드 텍스트에 "대리점", "외주설치", "기타" 추가 및 선택사항 명시
```typescript
['2. 업무타입 (선택사항)'],
['  - 다음 중 하나를 정확히 입력하세요:'],
['    • 자비 (자비시설 업무)'],
['    • 보조금 (보조금 업무)'],
['    • AS (A/S 업무)'],
['    • 대리점 (대리점 업무)'],    // 새로 추가
['    • 외주설치 (외주설치 업무)'],  // 새로 추가
['    • 기타 (기타 업무)'],        // 새로 추가
```

2. **Line 166-167**: 유효성 검사 배열에 "대리점", "외주설치", "기타" 추가
```typescript
// Before
if (task.taskType && !['자비', '보조금', 'AS'].includes(task.taskType)) {
  task.validationErrors.push('업무타입은 "자비", "보조금", "AS" 중 하나여야 합니다')
}

// After
if (task.taskType && !['자비', '보조금', 'AS', '대리점', '외주설치', '기타'].includes(task.taskType)) {
  task.validationErrors.push('업무타입은 "자비", "보조금", "AS", "대리점", "외주설치", "기타" 중 하나여야 합니다')
}
```

#### 2. 필수 항목 최소화 (lines 158-162)

**Before (모든 항목 필수)**:
```typescript
// 기본 유효성 검사
if (!task.businessName) {
  task.validationErrors.push('사업장명 필수')
}
if (!task.taskType) {
  task.validationErrors.push('업무타입 필수')
}
if (!task.currentStatus) {
  task.validationErrors.push('현재단계 필수')
}
if (!task.assignee) {
  task.validationErrors.push('담당자 필수')
}
```

**After (사업장명만 필수)**:
```typescript
// 기본 유효성 검사 - 사업장명만 필수
if (!task.businessName) {
  task.validationErrors.push('사업장명 필수')
}

// 업무타입 검증 (선택사항이지만, 입력된 경우 유효한 값인지 확인)
if (task.taskType && !['자비', '보조금', 'AS'].includes(task.taskType)) {
  task.validationErrors.push('업무타입은 "자비", "보조금", "AS" 중 하나여야 합니다')
}
```

#### 3. 업무타입 "자가" → "자비" 수정

**수정된 위치**:
1. **Line 36**: 템플릿 예시 데이터
```typescript
// Before
['예시사업장', '자가', '고객 상담', '김철수', '첫 번째 업무 등록']

// After
['예시사업장', '자비', '고객 상담', '김철수', '첫 번째 업무 등록']
```

2. **Line 60**: 가이드 텍스트
```typescript
// Before
['    • 자가 (자가시설 업무)']

// After
['    • 자비 (자비시설 업무)']
```

3. **Line 164**: 유효성 검사 배열
```typescript
// Before
if (task.taskType && !['자가', '보조금', 'AS'].includes(task.taskType))

// After
if (task.taskType && !['자비', '보조금', 'AS'].includes(task.taskType))
```

4. **Line 165**: 에러 메시지
```typescript
// Before
task.validationErrors.push('업무타입은 "자가", "보조금", "AS" 중 하나여야 합니다')

// After
task.validationErrors.push('업무타입은 "자비", "보조금", "AS" 중 하나여야 합니다')
```

## 개선 효과

### Before
- ❌ 사업장명, 업무타입, 현재단계, 담당자 **모두 필수**
- ❌ 빈 칸이 하나라도 있으면 유효성 검사 실패
- ❌ 잘못된 업무타입 값 "자가"로 인한 혼란

### After
- ✅ **사업장명만 필수**, 나머지 선택사항
- ✅ 필수 항목 최소화로 엑셀 일괄등록 사용성 대폭 향상
- ✅ 올바른 업무타입 값 "자비" 사용
- ✅ 업무타입에 "대리점", "외주설치", "기타" 항목 추가 지원
- ✅ 업무타입을 입력한 경우에만 유효한 값인지 검증

## 사용 예시

### 최소 입력 (사업장명만)
```
사업장명   | 업무타입 | 현재단계 | 담당자 | 메모
-----------|----------|----------|--------|------
서울지점   |          |          |        |
```
→ ✅ **유효함** (사업장명만 필수)

### 업무타입 포함 입력
```
사업장명   | 업무타입 | 현재단계 | 담당자 | 메모
-----------|----------|----------|--------|------
서울지점   | 자비     | 견적 중  | 김철수 | 첫 업무
부산지점   | 대리점   | 진행 중  | 이영희 | 대리점 업무
대구지점   | 외주설치 | 설치 중  | 최수진 | 외주설치 업무
인천지점   | 기타     | 완료     | 박민수 | 기타 업무
```
→ ✅ **유효함** (업무타입이 "자비", "보조금", "AS", "대리점", "외주설치", "기타" 중 하나)

### 잘못된 업무타입
```
사업장명   | 업무타입 | 현재단계 | 담당자 | 메모
-----------|----------|----------|--------|------
서울지점   | 자가     | 견적 중  | 김철수 | 첫 업무
```
→ ❌ **오류**: 업무타입은 "자비", "보조금", "AS", "대리점", "외주설치", "기타" 중 하나여야 합니다

## 빌드 결과

✅ 빌드 성공 - TypeScript 컴파일 오류 없음

```bash
npm run build
✓ Compiled successfully
Route (app)                              Size     First Load JS
├ ○ /admin/tasks                         11.6 kB        169 kB
```

## 관련 파일

### 수정된 파일
- `components/tasks/BulkUploadModal.tsx`

### 영향받는 페이지
- `/admin/tasks` - 시설 업무 관리 페이지의 엑셀 일괄등록 기능

## 추가 고려사항

### 데이터 일관성
- 기존에 "자가"로 저장된 데이터가 있다면 데이터 마이그레이션 필요
- 데이터베이스 확인 필요: `SELECT DISTINCT task_type FROM facility_tasks`

### 향후 개선 방안
1. **드롭다운 선택**: 업무타입을 텍스트 입력 대신 드롭다운으로 제공
2. **자동 완성**: 사업장명 입력 시 자동완성 기능 추가
3. **실시간 검증**: 엑셀 업로드 전에 실시간 유효성 검사 피드백

## 추가 수정 사항 (2024-02-02)

### "외주설치" 업무타입 전체 시스템 추가

**수정된 파일**:

1. **`components/tasks/BulkUploadModal.tsx`**
   - 가이드 텍스트에 "외주설치" 추가 (Line 63)
   - 유효성 검사 배열에 "외주설치" 추가 (Line 166)

2. **`app/admin/tasks/page.tsx`**
   - TaskType에 'outsourcing' 추가 (Line 54)
   - TaskStatus에 외주설치 단계 추가 (Lines 77-78):
     - `outsourcing_order` (외주 발주)
     - `outsourcing_schedule` (일정 조율)
     - `outsourcing_in_progress` (설치 진행 중)
     - `outsourcing_completed` (설치 완료)
   - outsourcingSteps 정의 추가 (Lines 211-217)
   - calculateProgressPercentage 함수에 outsourcing 케이스 추가 (Line 223)

3. **`app/admin/tasks/components/TaskMobileModal.tsx`**
   - typeLabels에 'outsourcing' 추가 (Line 119)

4. **`app/admin/business/page.tsx`**
   - 진행구분 select에 "외주설치" 옵션 추가 (Line 4696)
   - getProgressStatusStyle에 "외주설치" 스타일 추가 (Line 3686):
     - `bg-indigo-100 text-indigo-800 border-indigo-200`

5. **`components/business/modals/BusinessDetailModal.tsx`**
   - 진행구분 표시 스타일에 "외주설치" 추가 (Line 1062)

## 추가 수정 사항 (2026-02-02): admin/tasks 모달 UI에 외주설치 추가

### 문제 상황
- admin/tasks 페이지의 업무 생성/수정 모달에서 "외주설치", "대리점" 타입이 UI에 표시되지 않음
- 백엔드 API는 이미 지원하지만, 프론트엔드 select 옵션과 badge 표시에서 누락

### 수정 내용

**파일: `app/admin/tasks/page.tsx`**

1. **업무 생성 모달 - 타입 선택 드롭다운** (Lines 2387-2393)
```typescript
<select>
  <option value="self">자비</option>
  <option value="subsidy">보조금</option>
  <option value="dealer">대리점</option>
  <option value="outsourcing">외주설치</option>  // 추가
  <option value="as">AS</option>
  <option value="etc">기타</option>
</select>
```

2. **업무 생성 모달 - 현재 단계 드롭다운** (Lines 2421-2426)
```typescript
{(createTaskForm.type === 'self' ? selfSteps :
  createTaskForm.type === 'subsidy' ? subsidySteps :
  createTaskForm.type === 'dealer' ? dealerSteps :
  createTaskForm.type === 'outsourcing' ? outsourcingSteps :  // 추가
  createTaskForm.type === 'etc' ? etcSteps : asSteps).map(step => (
    <option key={step.status} value={step.status}>{step.label}</option>
  ))}
```

3. **업무 생성 모달 - 헤더 Badge 표시** (Lines 2246-2260)
```typescript
<span className={`inline-flex px-3 py-1 text-sm rounded-full font-medium ${
  createTaskForm.type === 'self'
    ? 'bg-blue-100 text-blue-800'
    : createTaskForm.type === 'subsidy'
    ? 'bg-purple-100 text-purple-800'
    : createTaskForm.type === 'dealer'
    ? 'bg-cyan-100 text-cyan-800'       // 추가
    : createTaskForm.type === 'outsourcing'
    ? 'bg-indigo-100 text-indigo-800'    // 추가
    : createTaskForm.type === 'etc'
    ? 'bg-gray-100 text-gray-800'
    : 'bg-orange-100 text-orange-800'
}`}>
  {createTaskForm.type === 'self' ? '자비' :
   createTaskForm.type === 'subsidy' ? '보조금' :
   createTaskForm.type === 'dealer' ? '대리점' :       // 추가
   createTaskForm.type === 'outsourcing' ? '외주설치' :  // 추가
   createTaskForm.type === 'etc' ? '기타' : 'AS'}
</span>
```

4. **업무 생성 모달 - 업무정보 카드** (Lines 2291-2296)
```typescript
<p className="text-xs sm:text-xs font-medium text-gray-900 truncate">
  {createTaskForm.type === 'self' ? '자비' :
   createTaskForm.type === 'subsidy' ? '보조금' :
   createTaskForm.type === 'dealer' ? '대리점' :       // 추가
   createTaskForm.type === 'outsourcing' ? '외주설치' :  // 추가
   createTaskForm.type === 'etc' ? '기타' : 'AS'}
</p>
```

5. **업무 수정 모달 - 타입 선택 드롭다운** (Lines 2709-2715)
```typescript
<select>
  <option value="self">자비</option>
  <option value="subsidy">보조금</option>
  <option value="dealer">대리점</option>
  <option value="outsourcing">외주설치</option>  // 추가
  <option value="as">AS</option>
  <option value="etc">기타</option>
</select>
```

6. **업무 수정 모달 - 현재 단계 드롭다운** (Lines 2743-2748)
```typescript
{(editingTask.type === 'self' ? selfSteps :
  editingTask.type === 'subsidy' ? subsidySteps :
  editingTask.type === 'dealer' ? dealerSteps :
  editingTask.type === 'outsourcing' ? outsourcingSteps :  // 추가
  editingTask.type === 'etc' ? etcSteps : asSteps).map(step => (
    <option key={step.status} value={step.status}>{step.label}</option>
  ))}
```

7. **업무 수정 모달 - 헤더 Badge 표시** (Lines 2541-2555)
```typescript
<span className={`inline-flex px-2 sm:px-3 py-1 text-xs sm:text-sm rounded-full font-medium flex-shrink-0 ${
  editingTask.type === 'self'
    ? 'bg-blue-100 text-blue-800'
    : editingTask.type === 'subsidy'
    ? 'bg-purple-100 text-purple-800'
    : editingTask.type === 'dealer'
    ? 'bg-cyan-100 text-cyan-800'        // 추가
    : editingTask.type === 'outsourcing'
    ? 'bg-indigo-100 text-indigo-800'     // 추가
    : editingTask.type === 'etc'
    ? 'bg-gray-100 text-gray-800'
    : 'bg-orange-100 text-orange-800'
}`}>
  {editingTask.type === 'self' ? '자비' :
   editingTask.type === 'subsidy' ? '보조금' :
   editingTask.type === 'dealer' ? '대리점' :        // 추가
   editingTask.type === 'outsourcing' ? '외주설치' :   // 추가
   editingTask.type === 'etc' ? '기타' : 'AS'}
</span>
```

8. **업무 수정 모달 - 진행 상태 카드** (Lines 2600-2607)
```typescript
<p className="text-xs sm:text-xs font-medium text-gray-900 truncate">
  {(editingTask.type === 'self' ? selfSteps :
   editingTask.type === 'subsidy' ? subsidySteps :
   editingTask.type === 'dealer' ? dealerSteps :
   editingTask.type === 'outsourcing' ? outsourcingSteps :  // 추가
   editingTask.type === 'etc' ? etcSteps : asSteps)
   .find(s => s.status === editingTask.status)?.label || editingTask.status}
</p>
```

### 개선 효과

✅ **admin/tasks 모달에서 모든 업무 타입 표시**
- 업무 생성/수정 모달 타입 선택 드롭다운에 "대리점", "외주설치" 추가
- 각 타입 선택 시 해당하는 단계(steps) 정확히 표시
- Badge 색상: 대리점(cyan), 외주설치(indigo)로 admin/business와 일치

✅ **전체 시스템 일관성 달성**
- Excel 일괄등록 ✅
- API 백엔드 ✅
- admin/tasks 칸반보드 UI ✅
- admin/tasks 생성/수정 모달 UI ✅ (이번 수정)
- admin/business 페이지 ✅
- Mobile Modal ✅

## 테스트 체크리스트

- [x] 사업장명만 입력한 경우 업로드 성공
- [x] 업무타입 "자비", "보조금", "AS", "대리점", "외주설치", "기타" 입력 시 유효성 검사 통과
- [x] 잘못된 업무타입 입력 시 적절한 오류 메시지 표시
- [x] 템플릿 다운로드 시 올바른 예시 데이터 포함
- [x] 가이드 시트에 "대리점", "외주설치", "기타" 항목 포함 확인
- [x] admin/tasks 페이지에서 "외주설치" 타입 선택 및 단계 관리 가능
- [x] admin/business 페이지에서 진행구분 "외주설치" 선택 및 표시 가능
- [x] admin/tasks 업무 생성 모달에서 "대리점", "외주설치" 선택 가능
- [x] admin/tasks 업무 수정 모달에서 "대리점", "외주설치" 선택 가능
- [x] 타입 선택 시 해당 단계(outsourcingSteps) 정확히 표시
- [x] Badge 색상이 admin/business와 일치 (대리점: cyan, 외주설치: indigo)
- [x] 빌드 성공 확인
