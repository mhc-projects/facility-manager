# 중복 업무 삭제 기능 설계

## 📋 요구사항

**목표**: /admin/tasks 페이지에서 동일한 사업장, 동일한 업무단계, 동일한 업무타입으로 등록된 중복 업무 삭제

**중복 판단 기준**:
- `business_name` (사업장명)
- `status` (업무단계)
- `task_type` (업무타입)

## 🔍 현황 분석

### 중복 업무 통계 (2026-02-03 기준)
- **전체 업무**: 3,114개
- **중복 그룹**: 40개
- **중복 업무 총 개수**: 87개
- **삭제 대상**: 47개 (각 그룹에서 최신 1개 제외)

### 중복 패턴
```
모든 중복이 동일한 패턴:
- task_type: dealer
- status: dealer_product_ordered
- 구버전 title: "보조금 입금" (잘못된 매핑)
- 신버전 title: "제품 발주" (올바른 매핑)
- 생성 시간: 2026-02-02 오후 2시대 vs 오후 3-4시대
```

**대표 사례: 한일전동지게차**
```javascript
// 보존 (최신)
{
  id: 'f5b19cfc-f4f3-4b0c-a381-ae8993579494',
  title: '한일전동지게차 - 제품 발주',
  created_at: '2026-02-02 16:13:58'
}

// 삭제 대상 (구버전)
{
  id: 'a44cac1c-1fb3-4a6f-89ea-b13462f00273',
  title: '한일전동지게차 - 보조금 입금',
  created_at: '2026-02-02 14:09:45'
}
```

## 🎯 설계 방안

### 옵션 1: CLI 스크립트 방식 (권장 - 즉시 사용 가능)

**장점**:
- ✅ 즉시 실행 가능 (구현 완료)
- ✅ 안전한 미리보기 제공
- ✅ Soft delete로 복구 가능
- ✅ 상세한 로그 출력

**단점**:
- ❌ 서버 접근 필요
- ❌ 비개발자에게 어려움

**실행 방법**:
```bash
# 1단계: 중복 확인
node scripts/find-duplicate-tasks.js

# 2단계: 중복 삭제 (soft delete)
node scripts/delete-duplicate-tasks.js
```

**출력 예시**:
```
🔍 중복 업무 조회 중...
✅ 전체 업무: 3114개
🔍 중복 그룹 수: 40개

[1] 한일전동지게차 / dealer / dealer_product_ordered
    중복 수: 2개
    ---
    1. ✅ 보존 - 한일전동지게차 - 제품 발주
       ID: f5b19cfc-f4f3-4b0c-a381-ae8993579494
       생성일: 2026. 2. 2. 오후 4:13:58
    2. ❌ 삭제 대상 - 한일전동지게차 - 보조금 입금
       ID: a44cac1c-1fb3-4a6f-89ea-b13462f00273
       생성일: 2026. 2. 2. 오후 2:09:45

📊 요약:
   삭제 대상: 47개 (각 그룹에서 최신 1개 제외)
```

### 옵션 2: UI 기능 추가 (향후 구현 검토)

**위치**: `/app/admin/tasks/page.tsx`

**UI 컴포넌트**:
```typescript
// 1. 중복 감지 버튼
<button onClick={findDuplicates}>
  🔍 중복 업무 찾기
</button>

// 2. 중복 목록 모달
<DuplicateTasksModal
  duplicates={duplicateGroups}
  onDelete={handleDelete}
/>
```

**기능 흐름**:
```
1. "중복 업무 찾기" 버튼 클릭
   ↓
2. API 호출: GET /api/admin/tasks/duplicates
   ↓
3. 중복 그룹 목록 표시 (모달)
   - 사업장별 그룹핑
   - 각 그룹의 업무 목록 (생성일 순)
   - 보존/삭제 대상 표시
   ↓
4. 사용자 확인 및 선택
   - 전체 선택/해제
   - 개별 그룹 선택
   ↓
5. "삭제" 버튼 클릭
   ↓
6. API 호출: DELETE /api/admin/tasks/duplicates
   - Soft delete (is_deleted=true)
   ↓
7. 결과 표시 및 목록 갱신
```

**API 설계**:

```typescript
// GET /api/admin/tasks/duplicates
// 중복 업무 그룹 조회
{
  duplicates: [
    {
      key: "한일전동지게차|dealer|dealer_product_ordered",
      business_name: "한일전동지게차",
      task_type: "dealer",
      status: "dealer_product_ordered",
      count: 2,
      tasks: [
        {
          id: "f5b19cfc...",
          title: "한일전동지게차 - 제품 발주",
          created_at: "2026-02-02T16:13:58",
          keep: true  // 최신 업무
        },
        {
          id: "a44cac1c...",
          title: "한일전동지게차 - 보조금 입금",
          created_at: "2026-02-02T14:09:45",
          keep: false  // 삭제 대상
        }
      ]
    }
  ],
  summary: {
    totalGroups: 40,
    totalDuplicates: 87,
    toDelete: 47
  }
}

// DELETE /api/admin/tasks/duplicates
// 선택된 중복 업무 삭제
Request:
{
  taskIds: ["a44cac1c...", "99a75407..."]  // 삭제할 업무 ID 배열
}

Response:
{
  success: 45,
  failed: 2,
  errors: [...]
}
```

**UI 컴포넌트 설계**:

```typescript
// components/admin/DuplicateTasksModal.tsx
interface DuplicateGroup {
  key: string;
  business_name: string;
  task_type: string;
  status: string;
  count: number;
  tasks: Task[];
}

export function DuplicateTasksModal({
  isOpen,
  onClose,
  duplicates
}: Props) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  return (
    <Dialog open={isOpen} onClose={onClose}>
      <DialogTitle>
        🔍 중복 업무 관리
        <span className="text-sm text-gray-600">
          {duplicates.length}개 그룹, {totalToDelete}개 삭제 대상
        </span>
      </DialogTitle>

      <DialogContent>
        {duplicates.map(group => (
          <DuplicateGroupCard
            key={group.key}
            group={group}
            selectedIds={selectedIds}
            onSelect={handleSelect}
          />
        ))}
      </DialogContent>

      <DialogActions>
        <Button onClick={handleSelectAll}>전체 선택</Button>
        <Button onClick={handleDelete} variant="destructive">
          선택한 {selectedIds.length}개 삭제
        </Button>
      </DialogActions>
    </Dialog>
  );
}
```

## 🛡️ 안전장치

### 1. Soft Delete
```sql
-- 실제 삭제가 아닌 플래그 변경
UPDATE facility_tasks
SET is_deleted = true, updated_at = NOW()
WHERE id IN (...)
```

### 2. 복구 방법
```sql
-- 개별 복구
UPDATE facility_tasks
SET is_deleted = false
WHERE id = 'task_id';

-- 일괄 복구 (특정 시간 이후 삭제된 항목)
UPDATE facility_tasks
SET is_deleted = false
WHERE is_deleted = true
  AND updated_at > '2026-02-03 10:00:00';
```

### 3. 삭제 전 확인
- CLI: 3초 + 5초 대기 시간 (총 8초)
- UI: 확인 모달 + "정말 삭제하시겠습니까?" 다이얼로그

### 4. 상세 로그
```javascript
// 삭제 로그 기록
console.log({
  action: 'delete_duplicates',
  timestamp: new Date().toISOString(),
  user: currentUser,
  deletedIds: [...],
  success: 45,
  failed: 2
});
```

## 📊 실행 계획

### Phase 1: CLI 스크립트 실행 (즉시 가능)

**목표**: 현재 존재하는 47개 중복 업무 정리

**스크립트**:
1. `scripts/find-duplicate-tasks.js` - 중복 확인
2. `scripts/delete-duplicate-tasks.js` - 중복 삭제

**검증**:
```bash
# 삭제 전 카운트
SELECT COUNT(*) FROM facility_tasks WHERE is_deleted = false;  -- 3114

# 삭제 실행
node scripts/delete-duplicate-tasks.js

# 삭제 후 카운트
SELECT COUNT(*) FROM facility_tasks WHERE is_deleted = false;  -- 3067 (3114 - 47)

# 중복 재확인
node scripts/find-duplicate-tasks.js  -- 0개 그룹
```

### Phase 2: UI 기능 추가 (향후 검토)

**개발 범위**:
1. API 엔드포인트 생성
   - `GET /api/admin/tasks/duplicates`
   - `DELETE /api/admin/tasks/duplicates`

2. UI 컴포넌트 개발
   - DuplicateTasksModal
   - DuplicateGroupCard

3. 기존 페이지 통합
   - admin/tasks/page.tsx에 "중복 찾기" 버튼 추가
   - 상태 관리 및 API 연동

**예상 소요 시간**: 2-3시간

## 🔗 관련 파일

### 생성된 스크립트
- `scripts/find-duplicate-tasks.js` - 중복 업무 조회
- `scripts/delete-duplicate-tasks.js` - 중복 업무 삭제 (soft delete)

### 향후 작업 대상
- `app/api/admin/tasks/duplicates/route.ts` - API 엔드포인트
- `components/admin/DuplicateTasksModal.tsx` - UI 컴포넌트
- `app/admin/tasks/page.tsx` - 기능 통합

### 참조
- `claudedocs/fix-bulk-upload-task-type-mapping.md` - 중복 발생 원인
- `sql/tasks_table.sql` - DB 스키마

## 💡 권장사항

**즉시 실행**:
```bash
# 중복 확인
node scripts/find-duplicate-tasks.js

# 결과 확인 후 삭제 진행
node scripts/delete-duplicate-tasks.js
```

**장점**:
- ✅ 안전한 soft delete
- ✅ 상세한 미리보기 제공
- ✅ 5초 대기로 실수 방지
- ✅ 복구 가능 (is_deleted=true)

**UI 기능은 향후 필요시 추가 검토**:
- 현재 중복이 정리되면 당분간 발생하지 않을 것으로 예상
- 추가 중복 발생 시 UI 기능 개발 고려
