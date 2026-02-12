# 업무 상태 한글화 설계 문서

## 📋 요구사항 분석

### 문제 정의
- **위치**: `admin/business` 페이지 → 상세모달 → 업무진행현황 → 메모및업무 섹션
- **현상**: 업무 자동 생성 시 상태가 영문으로 표시 (예: `subsidy_site_inspection`)
- **요구사항**: 업무 단계를 한글로 치환하여 사용자 경험 개선

### 영향 범위
1. **직접 영향**: `BusinessInfoPanel.tsx` (메모 표시 컴포넌트)
2. **간접 영향**: 업무 상태 표시가 있는 모든 컴포넌트

## 🏗️ 아키텍처 설계

### 기존 구조 분석

#### 1. 상태 매핑 유틸리티
**파일**: `lib/task-status-utils.ts`

```typescript
// ✅ 이미 완벽한 한글 매핑이 존재함
export const TASK_STATUS_KR: { [key: string]: string } = {
  // 보조금 공통 단계
  'subsidy_customer_contact': '고객 상담',
  'subsidy_site_inspection': '현장 실사',
  'subsidy_quotation': '견적서 작성',
  'subsidy_contract': '계약 체결',

  // ... 50+ 개의 상태 매핑

  // AS 업무
  'as_customer_contact': 'AS 고객 상담',

  // 대리점 업무
  'dealer_order_received': '발주 수신',

  // 외주설치
  'outsourcing_order': '외주 발주',

  // 기타
  'etc_status': '기타',
}

// 헬퍼 함수
export function getTaskStatusLabel(status: string): string
export function getTaskTypeLabel(taskType: string): string
```

#### 2. 메모 표시 컴포넌트
**파일**: `components/tasks/BusinessInfoPanel.tsx` (라인 215-246)

```typescript
function MemoSection({ memos }: { memos: Memo[] }) {
  return (
    <div className="bg-white rounded-lg p-4 border border-gray-200">
      <h4 className="text-sm font-semibold text-gray-700 mb-3">
        📝 업무진행현황 메모
      </h4>
      <div className="space-y-2 max-h-60 overflow-y-auto">
        {memos.map((memo) => (
          <div key={memo.id} className="bg-gray-50 p-2 rounded">
            {/* 🔴 문제: 원문 상태값이 그대로 표시됨 */}
            <p>{memo.content}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
```

#### 3. Memo 인터페이스
```typescript
interface Memo {
  id: string
  content: string
  author: string | null
  created_at: string
  source_type?: string // 'manual' or 'task_sync'
  task_status?: string | null  // 🎯 핵심: 영문 상태값
  task_type?: string | null    // 업무 타입
}
```

### 설계 방향

#### Option 1: 프론트엔드에서 실시간 변환 (✅ 권장)
**장점**:
- 백엔드 수정 불필요
- 기존 데이터 마이그레이션 불필요
- 즉시 적용 가능
- 유지보수 간단

**구현 방법**:
```typescript
import { getTaskStatusLabel, getTaskTypeLabel } from '@/lib/task-status-utils'

function MemoSection({ memos }: { memos: Memo[] }) {
  // 메모 컨텐츠를 포맷팅하는 헬퍼 함수
  const formatMemoContent = (memo: Memo): string => {
    let content = memo.content

    // task_sync 소스인 경우, 상태값을 한글로 치환
    if (memo.source_type === 'task_sync' && memo.task_status) {
      const statusLabel = getTaskStatusLabel(memo.task_status)

      // 영문 상태값을 한글로 치환
      // 예: "subsidy_site_inspection" → "현장 실사"
      content = content.replace(
        memo.task_status,
        statusLabel
      )
    }

    return content
  }

  return (
    <div>
      {memos.map((memo) => (
        <div key={memo.id}>
          <p>{formatMemoContent(memo)}</p>
        </div>
      ))}
    </div>
  )
}
```

#### Option 2: 백엔드에서 변환 후 저장 (❌ 비권장)
**단점**:
- 기존 데이터 마이그레이션 필요
- 영문 원본 손실
- 검색/필터링 복잡도 증가

## 🎨 상세 설계

### 1. 컴포넌트 수정

#### A. MemoSection 컴포넌트 개선
```typescript
// components/tasks/BusinessInfoPanel.tsx

import { getTaskStatusLabel } from '@/lib/task-status-utils'

function MemoSection({ memos }: { memos: Memo[] }) {
  /**
   * 메모 컨텐츠를 사용자 친화적으로 포맷팅
   * - task_sync 소스: 영문 상태를 한글로 자동 변환
   * - manual 소스: 원문 그대로 표시
   */
  const formatMemoContent = (memo: Memo): string => {
    let content = memo.content

    // 업무 동기화 메모인 경우만 상태값 변환
    if (memo.source_type === 'task_sync' && memo.task_status) {
      const statusLabel = getTaskStatusLabel(memo.task_status)

      // 정규식을 사용하여 상태값을 안전하게 치환
      // 단어 경계를 사용하여 부분 문자열 오치환 방지
      const statusPattern = new RegExp(`\\b${memo.task_status}\\b`, 'g')
      content = content.replace(statusPattern, statusLabel)
    }

    return content
  }

  return (
    <div className="bg-white rounded-lg p-4 border border-gray-200">
      <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
        <span>📝</span>
        <span>업무진행현황 메모</span>
      </h4>
      <div className="space-y-2 max-h-60 overflow-y-auto">
        {memos.length === 0 ? (
          <p className="text-xs text-gray-500 italic">
            등록된 메모가 없습니다.
          </p>
        ) : (
          memos.map((memo, idx) => (
            <div
              key={memo.id || idx}
              className="bg-gray-50 p-2 rounded text-xs border border-gray-100"
            >
              <div className="flex justify-between items-start mb-1">
                <div className="flex items-center gap-1.5">
                  {memo.source_type === 'task_sync' && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-700 border border-blue-200">
                      업무
                    </span>
                  )}
                  <span className="font-medium text-gray-700">
                    {memo.author || '작성자'}
                  </span>
                </div>
                <span className="text-gray-500 text-[10px]">
                  {formatDate(memo.created_at)}
                </span>
              </div>
              {/* 🎯 핵심: 포맷팅된 컨텐츠 표시 */}
              <p className="text-gray-600 whitespace-pre-wrap">
                {formatMemoContent(memo)}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
```

### 2. 유틸리티 함수 강화 (선택사항)

#### A. 다중 상태값 변환 지원
```typescript
// lib/task-status-utils.ts

/**
 * 텍스트 내의 모든 상태값을 한글로 변환
 * @param text - 변환할 텍스트
 * @param knownStatus - 알려진 상태값 (옵션, 성능 최적화용)
 * @returns 한글로 변환된 텍스트
 */
export function translateTaskStatusInText(
  text: string,
  knownStatus?: string
): string {
  let result = text

  // 알려진 상태값이 있으면 해당 값만 변환 (빠름)
  if (knownStatus && TASK_STATUS_KR[knownStatus]) {
    const pattern = new RegExp(`\\b${knownStatus}\\b`, 'g')
    result = result.replace(pattern, TASK_STATUS_KR[knownStatus])
    return result
  }

  // 알려진 상태값이 없으면 모든 가능한 상태값 스캔 (느림)
  Object.entries(TASK_STATUS_KR).forEach(([status, label]) => {
    // 언더스코어가 포함된 상태값만 변환 (일반 단어 오치환 방지)
    if (status.includes('_')) {
      const pattern = new RegExp(`\\b${status}\\b`, 'g')
      result = result.replace(pattern, label)
    }
  })

  return result
}
```

### 3. 타입 안전성 강화

```typescript
// types/memo.ts

export interface Memo {
  id: string
  content: string
  author: string | null
  created_at: string
  source_type?: 'manual' | 'task_sync'
  task_status?: string | null
  task_type?: string | null
}

export interface FormattedMemo extends Memo {
  formattedContent: string // 한글 변환된 컨텐츠
  statusLabel?: string // 상태 한글 라벨
}
```

## 🔄 마이그레이션 전략

### Phase 1: 즉시 적용 (Low Risk)
1. `BusinessInfoPanel.tsx`의 `MemoSection` 컴포넌트 수정
2. `formatMemoContent` 헬퍼 함수 추가
3. 기존 `lib/task-status-utils.ts` 활용

### Phase 2: 점진적 확장 (Optional)
1. 다른 컴포넌트에도 동일한 패턴 적용
   - `TaskCard.tsx`
   - `TaskModal.tsx`
   - `BusinessDetailModal.tsx`
2. 공통 훅으로 추상화
   ```typescript
   // hooks/useMemoFormatter.ts
   export function useMemoFormatter() {
     return useCallback((memo: Memo) => {
       return formatMemoContent(memo)
     }, [])
   }
   ```

### Phase 3: 성능 최적화 (Future)
1. 메모 표시 시 포맷팅 캐싱
2. 대량 메모 처리 시 가상화 적용

## ✅ 검증 계획

### 테스트 시나리오

#### 1. 기본 변환 테스트
```typescript
describe('Memo Status Localization', () => {
  it('should convert English status to Korean', () => {
    const memo: Memo = {
      id: '1',
      content: '[자동] 보조금 업무 "현장 실사"이 생성되었습니다. (상태: subsidy_site_inspection, 담당자: 미배정)',
      source_type: 'task_sync',
      task_status: 'subsidy_site_inspection',
      created_at: '2026-02-12',
      author: 'system'
    }

    const formatted = formatMemoContent(memo)

    expect(formatted).toContain('현장 실사')
    expect(formatted).not.toContain('subsidy_site_inspection')
  })

  it('should not modify manual memos', () => {
    const memo: Memo = {
      id: '2',
      content: '고객이 subsidy_site_inspection을 언급했습니다',
      source_type: 'manual',
      created_at: '2026-02-12',
      author: 'John'
    }

    const formatted = formatMemoContent(memo)

    // 수동 메모는 변환하지 않음
    expect(formatted).toBe(memo.content)
  })
})
```

#### 2. UI 통합 테스트
- [ ] 보조금 업무 생성 → 메모 자동 생성 → 한글 상태 확인
- [ ] AS 업무 생성 → 메모 자동 생성 → 한글 상태 확인
- [ ] 대리점 업무 생성 → 메모 자동 생성 → 한글 상태 확인
- [ ] 기존 메모 (영문 상태) → 브라우저 새로고침 → 한글 표시 확인

#### 3. Edge Cases
- [ ] 메모에 여러 상태값이 포함된 경우
- [ ] 상태값이 없는 task_sync 메모
- [ ] task_status가 null/undefined인 경우
- [ ] 알 수 없는 상태값인 경우 (fallback)

## 📊 성능 고려사항

### 현재 구현
- **시간복잡도**: O(n) - n은 메모 개수
- **공간복잡도**: O(1) - 추가 메모리 최소
- **렌더링 영향**: 매우 낮음 (문자열 치환만 수행)

### 최적화 필요 조건
- 메모 개수 > 100개
- 실시간 업데이트 빈도 > 1초당 10회

### 최적화 방법 (필요시)
```typescript
// 메모이제이션 적용
import { useMemo } from 'react'

function MemoSection({ memos }: { memos: Memo[] }) {
  const formattedMemos = useMemo(
    () => memos.map(formatMemoContent),
    [memos]
  )

  return (
    <div>
      {formattedMemos.map((content, idx) => (
        <div key={memos[idx].id}>
          <p>{content}</p>
        </div>
      ))}
    </div>
  )
}
```

## 🔧 구현 체크리스트

### 필수 작업
- [ ] `BusinessInfoPanel.tsx` 파일 수정
  - [ ] `formatMemoContent` 함수 추가
  - [ ] `getTaskStatusLabel` import 추가
  - [ ] `MemoSection` 컴포넌트 업데이트
- [ ] 로컬 환경에서 테스트
  - [ ] 보조금 업무 생성 시나리오
  - [ ] 기존 메모 표시 확인
- [ ] 코드 리뷰

### 선택 작업
- [ ] 유틸리티 함수 강화 (`translateTaskStatusInText`)
- [ ] 타입 정의 개선 (`FormattedMemo`)
- [ ] 단위 테스트 작성
- [ ] 다른 컴포넌트에 동일 패턴 적용

## 🎯 기대 효과

### 사용자 경험
- ✅ **가독성 향상**: 영문 코드 → 한글 상태명
- ✅ **직관성 증가**: 업무 단계를 즉시 이해 가능
- ✅ **전문성 향상**: 시스템 완성도 증가

### 기술적 이점
- ✅ **유지보수성**: 중앙 집중식 상태 매핑 활용
- ✅ **확장성**: 새로운 상태 추가 시 `task-status-utils.ts`만 수정
- ✅ **일관성**: 전체 시스템에서 동일한 한글 표기 사용

## 📚 참고 자료

### 관련 파일
- `lib/task-status-utils.ts` - 상태 매핑 유틸리티
- `lib/task-type-mappings.ts` - 업무 타입 매핑
- `components/tasks/BusinessInfoPanel.tsx` - 메모 표시 컴포넌트
- `lib/task-memo-sync.ts` - 메모 자동 생성 로직 (백엔드)

### 참고 이슈
- 이미지에서 확인된 문제: `subsidy_site_inspection` 영문 표시
- 기존 한글화 작업: `task-status-utils.ts`에 이미 완벽한 매핑 존재

## 🚀 배포 계획

### 배포 단계
1. **개발 환경**: 로컬에서 기능 확인
2. **스테이징**: 실제 데이터로 통합 테스트
3. **프로덕션**: 점진적 롤아웃

### 롤백 계획
- 변경사항이 프론트엔드 표시 로직만 수정
- 데이터베이스 영향 없음
- 즉시 롤백 가능 (git revert)

### 모니터링
- [ ] 메모 표시 오류 로그 모니터링
- [ ] 사용자 피드백 수집
- [ ] 성능 메트릭 확인 (렌더링 시간)
