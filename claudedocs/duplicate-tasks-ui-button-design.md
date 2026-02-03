# 중복 업무 관리 UI 버튼 설계

## 📋 요구사항

**목표**: admin/tasks 페이지 헤더에 중복 업무 조회 및 삭제 버튼 추가

**위치**: 헤더 액션 영역 (엑셀 일괄 등록 버튼 옆)

**권한**: permission_level === 4 (관리자만 접근)

**크기**: 작게 (다른 헤더 버튼과 동일한 크기)

## 🎨 UI 설계

### 버튼 위치 및 레이아웃

```tsx
{/* 핵심 액션 - 모든 화면에서 표시 */}
<div className="flex items-center gap-2">
  {user?.permission_level === 4 && (
    <>
      {/* 🆕 중복 업무 관리 버튼 */}
      <button
        onClick={() => setShowDuplicateModal(true)}
        className="flex items-center gap-2 bg-orange-600 text-white px-3 py-1.5 md:px-3 rounded-lg hover:bg-orange-700 transition-colors text-sm"
        title="중복 업무 조회 및 삭제"
      >
        <FileX className="w-4 h-4" />
        <span className="hidden md:inline">중복 관리</span>
      </button>

      {/* 기존 엑셀 일괄 등록 버튼 */}
      <button
        onClick={() => setShowBulkUploadModal(true)}
        className="flex items-center gap-2 bg-green-600 text-white px-3 py-1.5 md:px-3 rounded-lg hover:bg-green-700 transition-colors text-sm"
      >
        <Upload className="w-4 h-4" />
        <span className="hidden md:inline">엑셀 일괄 등록</span>
      </button>
    </>
  )}

  {/* 새 업무 추가 버튼 */}
  <button
    onClick={handleOpenCreateModal}
    className="flex items-center gap-2 bg-blue-600 text-white px-3 py-1.5 md:px-3 rounded-lg hover:bg-blue-700 transition-colors text-sm"
  >
    <Plus className="w-4 h-4" />
    <span className="sm:hidden">추가</span>
    <span className="hidden sm:inline">새 업무</span>
  </button>
</div>
```

### 버튼 디자인 스펙

**색상**: `bg-orange-600` (주황색)
- ⚠️ 주의가 필요한 작업임을 시각적으로 표현
- 삭제 작업의 중요성 강조
- 기존 버튼들과 명확히 구분

**아이콘**: `FileX` (lucide-react)
- 중복 업무 관리를 직관적으로 표현
- 삭제 작업을 시각화

**레이블**:
- 모바일: 아이콘만 (`hidden md:inline`)
- 데스크톱: "중복 관리"

**호버 효과**: `hover:bg-orange-700`

## 🔧 기술 구현

### 1. State 추가

```typescript
// app/admin/tasks/page.tsx
const [showDuplicateModal, setShowDuplicateModal] = useState(false)
const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>([])
const [isDuplicateLoading, setIsDuplicateLoading] = useState(false)
```

### 2. 타입 정의

```typescript
interface DuplicateGroup {
  key: string
  business_name: string
  task_type: TaskType
  status: TaskStatus
  count: number
  tasks: Array<{
    id: string
    title: string
    created_at: string
    assignee?: string
    due_date?: string
    keep: boolean  // 최신 업무는 true
  }>
}

interface DuplicateSummary {
  totalGroups: number
  totalDuplicates: number
  toDelete: number
}
```

### 3. API 함수 (Client-side)

```typescript
// 중복 업무 조회
async function fetchDuplicates(): Promise<{
  duplicates: DuplicateGroup[]
  summary: DuplicateSummary
}> {
  setIsDuplicateLoading(true)
  try {
    const response = await fetch('/api/admin/tasks/duplicates', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${TokenManager.getToken()}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      throw new Error('중복 업무 조회 실패')
    }

    const data = await response.json()
    setDuplicateGroups(data.duplicates)
    return data
  } catch (error) {
    console.error('중복 조회 오류:', error)
    alert('중복 업무를 조회하는 중 오류가 발생했습니다.')
    return { duplicates: [], summary: { totalGroups: 0, totalDuplicates: 0, toDelete: 0 } }
  } finally {
    setIsDuplicateLoading(false)
  }
}

// 중복 업무 삭제
async function deleteDuplicates(taskIds: string[]): Promise<{
  success: number
  failed: number
  errors?: any[]
}> {
  try {
    const response = await fetch('/api/admin/tasks/duplicates', {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${TokenManager.getToken()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ taskIds })
    })

    if (!response.ok) {
      throw new Error('중복 업무 삭제 실패')
    }

    const result = await response.json()

    // 성공 시 업무 목록 새로고침
    if (result.success > 0) {
      await fetchTasks()
    }

    return result
  } catch (error) {
    console.error('중복 삭제 오류:', error)
    alert('중복 업무를 삭제하는 중 오류가 발생했습니다.')
    return { success: 0, failed: taskIds.length }
  }
}
```

### 4. 버튼 핸들러

```typescript
const handleOpenDuplicateModal = useCallback(async () => {
  const { duplicates, summary } = await fetchDuplicates()

  if (summary.totalGroups === 0) {
    alert('중복된 업무가 없습니다.')
    return
  }

  setShowDuplicateModal(true)
}, [])
```

## 📱 중복 업무 관리 모달

### 모달 컴포넌트 구조

```tsx
// components/admin/DuplicateTasksModal.tsx
import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { FileX, AlertCircle, Trash2, X, Loader2 } from 'lucide-react'

interface DuplicateTasksModalProps {
  isOpen: boolean
  onClose: () => void
  duplicates: DuplicateGroup[]
  summary: DuplicateSummary
  onDelete: (taskIds: string[]) => Promise<{ success: number; failed: number }>
}

export default function DuplicateTasksModal({
  isOpen,
  onClose,
  duplicates,
  summary,
  onDelete
}: DuplicateTasksModalProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [isDeleting, setIsDeleting] = useState(false)

  // 삭제 대상 자동 선택 (keep: false인 항목들)
  useEffect(() => {
    if (isOpen && duplicates.length > 0) {
      const toDelete = duplicates
        .flatMap(group => group.tasks)
        .filter(task => !task.keep)
        .map(task => task.id)
      setSelectedIds(toDelete)
    }
  }, [isOpen, duplicates])

  const handleDelete = async () => {
    if (selectedIds.length === 0) {
      alert('삭제할 업무를 선택해주세요.')
      return
    }

    const confirmed = confirm(
      `총 ${selectedIds.length}개의 중복 업무를 삭제하시겠습니까?\n\n` +
      `이 작업은 되돌릴 수 있습니다 (soft delete).`
    )

    if (!confirmed) return

    setIsDeleting(true)
    try {
      const result = await onDelete(selectedIds)

      if (result.success > 0) {
        alert(`${result.success}개의 중복 업무가 성공적으로 삭제되었습니다.`)
        onClose()
      }

      if (result.failed > 0) {
        alert(`${result.failed}개의 업무 삭제에 실패했습니다.`)
      }
    } finally {
      setIsDeleting(false)
    }
  }

  const handleSelectAll = () => {
    const allToDelete = duplicates
      .flatMap(group => group.tasks)
      .filter(task => !task.keep)
      .map(task => task.id)
    setSelectedIds(allToDelete)
  }

  const handleDeselectAll = () => {
    setSelectedIds([])
  }

  const toggleTaskSelection = (taskId: string) => {
    setSelectedIds(prev =>
      prev.includes(taskId)
        ? prev.filter(id => id !== taskId)
        : [...prev, taskId]
    )
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileX className="w-5 h-5 text-orange-600" />
            중복 업무 관리
          </DialogTitle>
          <div className="flex items-center gap-4 text-sm text-gray-600 mt-2">
            <span>중복 그룹: {summary.totalGroups}개</span>
            <span>전체 중복: {summary.totalDuplicates}개</span>
            <span className="text-orange-600 font-medium">
              삭제 대상: {summary.toDelete}개
            </span>
          </div>
        </DialogHeader>

        {/* 안내 메시지 */}
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 flex items-start gap-2">
          <AlertCircle className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-orange-900">
            <p className="font-medium mb-1">중복 업무 삭제 안내</p>
            <ul className="list-disc list-inside space-y-1 text-xs">
              <li>각 그룹에서 <strong>가장 최근 업무</strong>는 자동으로 보존됩니다.</li>
              <li>삭제는 <strong>Soft Delete</strong> 방식으로 진행되어 복구 가능합니다.</li>
              <li>삭제 후 업무 목록이 자동으로 새로고침됩니다.</li>
            </ul>
          </div>
        </div>

        {/* 중복 그룹 목록 */}
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {duplicates.map((group, index) => (
            <DuplicateGroupCard
              key={group.key}
              index={index}
              group={group}
              selectedIds={selectedIds}
              onToggle={toggleTaskSelection}
            />
          ))}
        </div>

        <DialogFooter className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={handleSelectAll}
              className="text-sm text-blue-600 hover:text-blue-700"
            >
              전체 선택
            </button>
            <span className="text-gray-300">|</span>
            <button
              onClick={handleDeselectAll}
              className="text-sm text-blue-600 hover:text-blue-700"
            >
              전체 해제
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              disabled={isDeleting}
            >
              취소
            </button>
            <button
              onClick={handleDelete}
              disabled={selectedIds.length === 0 || isDeleting}
              className="flex items-center gap-2 px-4 py-2 text-sm text-white bg-orange-600 rounded-lg hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  삭제 중...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4" />
                  선택한 {selectedIds.length}개 삭제
                </>
              )}
            </button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

### 중복 그룹 카드 컴포넌트

```tsx
// components/admin/DuplicateGroupCard.tsx
interface DuplicateGroupCardProps {
  index: number
  group: DuplicateGroup
  selectedIds: string[]
  onToggle: (taskId: string) => void
}

function DuplicateGroupCard({ index, group, selectedIds, onToggle }: DuplicateGroupCardProps) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      {/* 그룹 헤더 */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-900">
            [{index + 1}] {group.business_name}
          </span>
          <span className="px-2 py-0.5 text-xs rounded-full bg-purple-100 text-purple-700">
            {getTaskTypeLabel(group.task_type)}
          </span>
          <span className="px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-700">
            {getStatusLabel(group.task_type, group.status)}
          </span>
        </div>
        <span className="text-xs text-gray-600">
          중복: {group.count}개
        </span>
      </div>

      {/* 업무 목록 */}
      <div className="space-y-2">
        {group.tasks.map((task, taskIndex) => (
          <div
            key={task.id}
            className={`flex items-center justify-between p-3 rounded-lg border ${
              task.keep
                ? 'bg-green-50 border-green-300'
                : selectedIds.includes(task.id)
                ? 'bg-orange-50 border-orange-300'
                : 'bg-gray-50 border-gray-200'
            }`}
          >
            <div className="flex items-center gap-3 flex-1">
              {/* 체크박스 (보존 대상은 비활성화) */}
              {task.keep ? (
                <div className="w-4 h-4 flex items-center justify-center">
                  <Check className="w-4 h-4 text-green-600" />
                </div>
              ) : (
                <input
                  type="checkbox"
                  checked={selectedIds.includes(task.id)}
                  onChange={() => onToggle(task.id)}
                  className="w-4 h-4 text-orange-600 rounded focus:ring-orange-500"
                />
              )}

              {/* 업무 정보 */}
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium text-gray-900">
                    {taskIndex + 1}. {task.title || '(제목 없음)'}
                  </span>
                  {task.keep && (
                    <span className="px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-700 font-medium">
                      ✅ 보존
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-600">
                  <span>생성: {new Date(task.created_at).toLocaleString('ko-KR')}</span>
                  {task.assignee && <span>담당: {task.assignee}</span>}
                  {task.due_date && <span>마감: {task.due_date}</span>}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function getTaskTypeLabel(type: TaskType): string {
  const labels: Record<TaskType, string> = {
    self: '자비',
    subsidy: '보조금',
    as: 'AS',
    dealer: '대리점',
    outsourcing: '외주설치',
    etc: '기타'
  }
  return labels[type] || type
}
```

## 🔌 API 엔드포인트 설계

### GET /api/admin/tasks/duplicates

**목적**: 중복 업무 그룹 조회

**요청**:
```typescript
GET /api/admin/tasks/duplicates
Headers:
  Authorization: Bearer {token}
```

**응답**:
```typescript
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
          assignee: "최문호",
          due_date: null,
          keep: true  // 최신 업무
        },
        {
          id: "a44cac1c...",
          title: "한일전동지게차 - 보조금 입금",
          created_at: "2026-02-02T14:09:45",
          assignee: "최문호",
          due_date: null,
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
```

**로직**:
```typescript
// app/api/admin/tasks/duplicates/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  try {
    // 1. 인증 확인
    const token = request.headers.get('authorization')?.replace('Bearer ', '')
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createClient()

    // 2. 모든 활성 업무 조회
    const { data: tasks, error } = await supabase
      .from('facility_tasks')
      .select('id, business_name, task_type, status, title, created_at, assignee, due_date')
      .eq('is_active', true)
      .eq('is_deleted', false)
      .order('business_name')
      .order('task_type')
      .order('status')
      .order('created_at')

    if (error) throw error

    // 3. 중복 그룹 생성
    const groups: Record<string, any[]> = {}
    tasks.forEach(task => {
      const key = `${task.business_name}|${task.task_type}|${task.status}`
      if (!groups[key]) groups[key] = []
      groups[key].push(task)
    })

    // 4. 중복만 필터링 (2개 이상)
    const duplicates = Object.entries(groups)
      .filter(([_, tasks]) => tasks.length > 1)
      .map(([key, tasks]) => {
        const [business_name, task_type, status] = key.split('|')

        // 생성일 기준 정렬 (최신순)
        const sorted = tasks.sort((a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )

        return {
          key,
          business_name,
          task_type,
          status,
          count: tasks.length,
          tasks: sorted.map((task, index) => ({
            ...task,
            keep: index === 0  // 첫 번째(최신)만 보존
          }))
        }
      })

    // 5. 요약 통계
    const summary = {
      totalGroups: duplicates.length,
      totalDuplicates: duplicates.reduce((sum, group) => sum + group.count, 0),
      toDelete: duplicates.reduce((sum, group) => sum + (group.count - 1), 0)
    }

    return NextResponse.json({ duplicates, summary })
  } catch (error) {
    console.error('중복 조회 오류:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
```

### DELETE /api/admin/tasks/duplicates

**목적**: 선택된 중복 업무 삭제 (soft delete)

**요청**:
```typescript
DELETE /api/admin/tasks/duplicates
Headers:
  Authorization: Bearer {token}
Body:
{
  taskIds: ["a44cac1c...", "99a75407..."]
}
```

**응답**:
```typescript
{
  success: 45,
  failed: 2,
  errors: [
    { id: "...", error: "..." }
  ]
}
```

**로직**:
```typescript
export async function DELETE(request: NextRequest) {
  try {
    // 1. 인증 확인
    const token = request.headers.get('authorization')?.replace('Bearer ', '')
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 2. 요청 파싱
    const { taskIds } = await request.json()
    if (!Array.isArray(taskIds) || taskIds.length === 0) {
      return NextResponse.json(
        { error: 'taskIds must be a non-empty array' },
        { status: 400 }
      )
    }

    const supabase = createClient()

    // 3. Soft delete 실행
    let successCount = 0
    let failedCount = 0
    const errors: any[] = []

    for (const taskId of taskIds) {
      const { error } = await supabase
        .from('facility_tasks')
        .update({
          is_deleted: true,
          updated_at: new Date().toISOString()
        })
        .eq('id', taskId)

      if (error) {
        failedCount++
        errors.push({ id: taskId, error: error.message })
      } else {
        successCount++
      }
    }

    return NextResponse.json({
      success: successCount,
      failed: failedCount,
      errors: errors.length > 0 ? errors : undefined
    })
  } catch (error) {
    console.error('중복 삭제 오류:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
```

## 📊 구현 순서

### Phase 1: API 엔드포인트 구현
1. `app/api/admin/tasks/duplicates/route.ts` 생성
   - GET: 중복 조회
   - DELETE: 중복 삭제

### Phase 2: UI 컴포넌트 구현
1. `components/admin/DuplicateTasksModal.tsx` 생성
2. `components/admin/DuplicateGroupCard.tsx` 생성

### Phase 3: 페이지 통합
1. `app/admin/tasks/page.tsx` 수정
   - State 추가
   - 버튼 추가
   - API 함수 추가
   - 모달 통합

### Phase 4: 테스트
1. 권한 체크 (permission_level === 4)
2. 중복 조회 기능
3. 중복 삭제 기능
4. 삭제 후 목록 새로고침
5. 에러 처리

## 🔗 관련 파일

### 생성 필요
- `app/api/admin/tasks/duplicates/route.ts` - API 엔드포인트
- `components/admin/DuplicateTasksModal.tsx` - 중복 관리 모달
- `components/admin/DuplicateGroupCard.tsx` - 중복 그룹 카드

### 수정 필요
- `app/admin/tasks/page.tsx` - 버튼 및 기능 통합

### 참조
- `scripts/find-duplicate-tasks.js` - 로직 참조
- `scripts/delete-duplicate-tasks.js` - 로직 참조
- `claudedocs/duplicate-tasks-deletion-design.md` - 전체 설계

## ✅ 검증 체크리스트

- [ ] 권한 4만 버튼 보임
- [ ] 버튼 클릭 시 중복 조회
- [ ] 중복 없을 때 알림
- [ ] 중복 있을 때 모달 표시
- [ ] 삭제 대상 자동 선택
- [ ] 보존 대상은 선택 불가
- [ ] 삭제 실행 및 확인
- [ ] 삭제 후 목록 새로고침
- [ ] 에러 처리 및 사용자 알림
- [ ] 모바일 반응형 동작

## 🎨 디자인 스크린샷 (예상)

### 헤더 버튼
```
┌─────────────────────────────────────────────────────┐
│ 업무 관리                              🔄 새로고침   │
│                                                      │
│ [🗑️ 중복 관리] [📤 엑셀 일괄 등록] [+ 새 업무]    │
└─────────────────────────────────────────────────────┘
```

### 중복 관리 모달
```
┌──────────────────────────────────────────────────────┐
│ 🗑️ 중복 업무 관리                             ✕     │
├──────────────────────────────────────────────────────┤
│ 중복 그룹: 40개 | 전체 중복: 87개 | 삭제 대상: 47개  │
├──────────────────────────────────────────────────────┤
│ ⚠️ 안내: 최신 업무는 보존, Soft Delete 방식         │
├──────────────────────────────────────────────────────┤
│ [1] 한일전동지게차 [대리점] [제품 발주] 중복: 2개    │
│   ✅ 1. 한일전동지게차 - 제품 발주 (보존)            │
│      생성: 2026-02-02 16:13:58                       │
│   ☐ 2. 한일전동지게차 - 보조금 입금                 │
│      생성: 2026-02-02 14:09:45                       │
├──────────────────────────────────────────────────────┤
│ 전체 선택 | 전체 해제           [취소] [선택한 47개 삭제] │
└──────────────────────────────────────────────────────┘
```
