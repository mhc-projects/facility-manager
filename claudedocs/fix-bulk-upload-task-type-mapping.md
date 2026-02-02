# 엑셀 일괄등록 업무타입 매핑 오류 수정 설계

## 📋 문제 요약

**증상**: 3132개 업무를 엑셀로 일괄 등록했으나 82개만 UI에 표시됨
**원인**: 엑셀 템플릿과 API 백엔드의 업무타입 용어 불일치로 인한 유효성 검사 실패
**영향도**: 🔴 HIGH - 3050개 업무 데이터 손실

---

## 🎯 수정 설계

### Phase 1: Hotfix - 업무타입 매핑 추가 (즉시)

#### 1.1 백엔드 수정
**파일**: `app/api/admin/tasks/bulk-upload/route.ts`
**위치**: Line 58-65
**변경 내용**: `REVERSE_TASK_TYPE_MAP`에 누락된 매핑 추가

**Before:**
```typescript
const REVERSE_TASK_TYPE_MAP: { [key: string]: string } = {
  '자가': 'self',
  '자가시설': 'self',
  '보조금': 'subsidy',
  '대리점': 'dealer',
  'AS': 'as',
  'A/S': 'as'
};
```

**After:**
```typescript
const REVERSE_TASK_TYPE_MAP: { [key: string]: string } = {
  // 기존 매핑
  '자가': 'self',
  '자가시설': 'self',
  '보조금': 'subsidy',
  '대리점': 'dealer',
  'AS': 'as',
  'A/S': 'as',

  // 🆕 템플릿과 일치하도록 추가
  '자비': 'self',          // ← 가장 중요!
  '외주설치': 'outsourcing',
  '기타': 'etc'
};
```

**영향 범위**:
- ✅ 유효성 검사 통과율 3% → 100%
- ✅ 3050개 실패 데이터 재업로드 가능
- ⚠️ 기존 82개 데이터는 영향 없음

---

### Phase 2: 프론트엔드 검증 강화 (단기)

#### 2.1 클라이언트 사이드 유효성 검사
**파일**: `components/tasks/BulkUploadModal.tsx`
**위치**: Line 167-170
**목적**: 서버 전송 전에 클라이언트에서 오류 감지

**변경 내용**:
```typescript
// 현재: 배열에 포함 여부만 확인
if (task.taskType && !['자비', '보조금', 'AS', '대리점', '외주설치', '기타'].includes(task.taskType)) {
  task.validationErrors.push('업무타입은 "자비", "보조금", "AS", "대리점", "외주설치", "기타" 중 하나여야 합니다')
}

// 개선: 백엔드 매핑 테이블과 일치 검증
const VALID_TASK_TYPES = {
  '자비': true,
  '자가': true,
  '자가시설': true,
  '보조금': true,
  '대리점': true,
  'AS': true,
  'A/S': true,
  '외주설치': true,
  '기타': true
};

if (task.taskType && !VALID_TASK_TYPES[task.taskType]) {
  task.validationErrors.push(
    `업무타입 "${task.taskType}"이 유효하지 않습니다. ` +
    `허용된 값: 자비, 보조금, AS, 대리점, 외주설치, 기타`
  );
}
```

#### 2.2 실시간 피드백 개선
**위치**: Line 349-375 (테이블 렌더링)
**추가 기능**: 오류 항목에 상세 툴팁 표시

```typescript
<td className="px-3 py-2">
  {task.validationErrors.length === 0 ? (
    <span className="flex items-center gap-1 text-green-600">
      <CheckCircle className="w-3 h-3" />
      <span className="text-xs">정상</span>
    </span>
  ) : (
    <div className="flex items-start gap-1 text-red-600">
      <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
      <div className="text-xs">
        {task.validationErrors.map((err, i) => (
          <div key={i} className="mb-1">
            {/* 🆕 오류 아이콘으로 타입 구분 */}
            {err.includes('업무타입') && '🏷️ '}
            {err.includes('사업장') && '🏢 '}
            {err.includes('담당자') && '👤 '}
            {err}
          </div>
        ))}
      </div>
    </div>
  )}
</td>
```

---

### Phase 3: 오류 리포팅 개선 (중기)

#### 3.1 성공 메시지 상세화
**파일**: `components/tasks/BulkUploadModal.tsx`
**위치**: Line 230-238
**목적**: 사용자가 실패를 명확히 인지하도록

**Before:**
```typescript
const successMessage = [
  `✅ 총 ${result.successCount || 0}개 업무 처리 완료`,
  result.newCount > 0 ? `   • 신규 생성: ${result.newCount}개` : null,
  result.updateCount > 0 ? `   • 업데이트: ${result.updateCount}개` : null,
  result.skipCount > 0 ? `   • 건너뛰기: ${result.skipCount}개` : null,
  result.failCount > 0 ? `\n⚠️ ${result.failCount}개 업무 실패` : null
].filter(Boolean).join('\n')
```

**After:**
```typescript
const successMessage = [
  `📊 업로드 결과 (총 ${result.totalCount}개)`,
  '',
  `✅ 성공: ${result.successCount}개`,
  result.newCount > 0 ? `   └─ 신규 생성: ${result.newCount}개` : null,
  result.updateCount > 0 ? `   └─ 업데이트: ${result.updateCount}개` : null,
  result.skipCount > 0 ? `⏭️  건너뛰기: ${result.skipCount}개` : null,
  result.failCount > 0 ? `❌ 실패: ${result.failCount}개` : null,
  '',
  result.failCount > 0 ? `⚠️ 실패한 항목은 콘솔(F12)에서 확인하세요` : null
].filter(Boolean).join('\n')

// 🆕 실패 상세 정보를 콘솔에 출력
if (result.failCount > 0) {
  const failedItems = result.results
    .filter(r => r.action === 'failed')
    .map(item => ({
      행번호: item.row,
      사업장: item.businessName,
      업무타입: item.taskType,
      오류내용: Array.isArray(item.errors) ? item.errors.join(', ') : item.error
    }));

  console.group('❌ 업로드 실패 항목 상세');
  console.table(failedItems);
  console.groupEnd();
}
```

#### 3.2 실패 항목 CSV 다운로드 기능
**새 파일**: `components/tasks/FailedItemsDownload.tsx` (선택적)
**목적**: 실패한 항목을 CSV로 다운로드하여 재작업 지원

```typescript
const downloadFailedItems = (results: any[]) => {
  const failedItems = results.filter(r => r.action === 'failed');

  if (failedItems.length === 0) return;

  const csvContent = [
    ['행번호', '사업장명', '업무타입', '현재단계', '담당자', '오류내용'].join(','),
    ...failedItems.map(item => [
      item.row,
      item.businessName,
      item.taskType || '',
      item.currentStatus || '',
      item.assignee || '',
      `"${Array.isArray(item.errors) ? item.errors.join('; ') : item.error}"`
    ].join(','))
  ].join('\n');

  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `실패항목_${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
};
```

---

### Phase 4: 공통 매핑 모듈화 (장기)

#### 4.1 공유 상수 파일 생성
**새 파일**: `lib/task-type-mappings.ts`
**목적**: 프론트엔드와 백엔드에서 동일한 매핑 사용

```typescript
/**
 * 업무 타입 매핑 정의
 * - 프론트엔드: 엑셀 템플릿, 유효성 검사
 * - 백엔드: API 유효성 검사, DB 저장
 */

export const TASK_TYPE_CODES = {
  SELF: 'self',
  SUBSIDY: 'subsidy',
  AS: 'as',
  DEALER: 'dealer',
  OUTSOURCING: 'outsourcing',
  ETC: 'etc'
} as const;

export type TaskTypeCode = typeof TASK_TYPE_CODES[keyof typeof TASK_TYPE_CODES];

// 한글 → 영문 코드 매핑
export const TASK_TYPE_KR_TO_CODE: Record<string, TaskTypeCode> = {
  // 자비 관련 (동일 의미의 다양한 표현)
  '자비': TASK_TYPE_CODES.SELF,
  '자가': TASK_TYPE_CODES.SELF,
  '자가시설': TASK_TYPE_CODES.SELF,

  // 보조금
  '보조금': TASK_TYPE_CODES.SUBSIDY,

  // AS
  'AS': TASK_TYPE_CODES.AS,
  'A/S': TASK_TYPE_CODES.AS,
  'as': TASK_TYPE_CODES.AS,

  // 대리점
  '대리점': TASK_TYPE_CODES.DEALER,

  // 외주설치
  '외주설치': TASK_TYPE_CODES.OUTSOURCING,

  // 기타
  '기타': TASK_TYPE_CODES.ETC
};

// 영문 코드 → 한글 표시명
export const TASK_TYPE_CODE_TO_KR: Record<TaskTypeCode, string> = {
  [TASK_TYPE_CODES.SELF]: '자비',
  [TASK_TYPE_CODES.SUBSIDY]: '보조금',
  [TASK_TYPE_CODES.AS]: 'AS',
  [TASK_TYPE_CODES.DEALER]: '대리점',
  [TASK_TYPE_CODES.OUTSOURCING]: '외주설치',
  [TASK_TYPE_CODES.ETC]: '기타'
};

// 엑셀 템플릿용 허용 값 목록
export const EXCEL_ALLOWED_TASK_TYPES = [
  '자비', '보조금', 'AS', '대리점', '외주설치', '기타'
];

// 유효성 검사 헬퍼
export function isValidTaskType(type: string): boolean {
  return type in TASK_TYPE_KR_TO_CODE;
}

export function convertTaskType(koreanType: string): TaskTypeCode | null {
  return TASK_TYPE_KR_TO_CODE[koreanType] || null;
}
```

#### 4.2 백엔드 적용
**파일**: `app/api/admin/tasks/bulk-upload/route.ts`
**변경**:
```typescript
// Before
const REVERSE_TASK_TYPE_MAP: { [key: string]: string } = { ... };

// After
import { convertTaskType, isValidTaskType } from '@/lib/task-type-mappings';

// 유효성 검사에서 사용
taskTypeCode = convertTaskType(task.taskType);
if (!taskTypeCode) {
  errors.push(`업무타입 "${task.taskType}"이 유효하지 않습니다. ...`);
}
```

#### 4.3 프론트엔드 적용
**파일**: `components/tasks/BulkUploadModal.tsx`
**변경**:
```typescript
import { EXCEL_ALLOWED_TASK_TYPES, isValidTaskType } from '@/lib/task-type-mappings';

// 유효성 검사
if (task.taskType && !isValidTaskType(task.taskType)) {
  task.validationErrors.push(
    `업무타입은 "${EXCEL_ALLOWED_TASK_TYPES.join('", "')}" 중 하나여야 합니다`
  );
}
```

---

## 📝 데이터 복구 계획

### Step 1: 코드 수정 적용
```bash
# 1. Phase 1 Hotfix 적용
git checkout -b hotfix/bulk-upload-task-type-mapping
# (코드 수정)
git commit -m "fix: 엑셀 일괄등록 업무타입 매핑 추가 (자비, 외주설치, 기타)"

# 2. 배포
npm run build
pm2 restart facility-manager

# 3. 동작 확인
# - 엑셀 템플릿 다운로드
# - 테스트 데이터 1개로 업로드 확인
```

### Step 2: 실패 데이터 재업로드
```
1. 원본 엑셀 파일 준비 (3132개)
2. 관리자 페이지 접속 → 업무 일괄등록
3. 업로드 실행
4. 결과 확인:
   - 성공: ~3050개 (이전 실패분)
   - 건너뛰기: 82개 (이미 등록됨)
   - 실패: 0개 (목표)
```

### Step 3: 데이터 검증
```sql
-- 총 업무 개수 확인
SELECT COUNT(*) as total_tasks
FROM facility_tasks
WHERE is_active = true AND is_deleted = false;
-- 예상 결과: 3132

-- 업무 타입별 분포 확인
SELECT task_type, COUNT(*) as count
FROM facility_tasks
WHERE is_active = true AND is_deleted = false
GROUP BY task_type
ORDER BY count DESC;
```

---

## ✅ 체크리스트

### Phase 1: Hotfix (즉시)
- [ ] `bulk-upload/route.ts` REVERSE_TASK_TYPE_MAP 수정
- [ ] 로컬 테스트 (1개 데이터로 검증)
- [ ] 운영 배포
- [ ] 실패 데이터 3050개 재업로드
- [ ] 총 개수 3132개 확인

### Phase 2: 프론트엔드 검증 (1-2일)
- [ ] `BulkUploadModal.tsx` 유효성 검사 강화
- [ ] 오류 표시 UI 개선
- [ ] 테스트 및 배포

### Phase 3: 오류 리포팅 (1주)
- [ ] 성공 메시지 상세화
- [ ] 콘솔 로그 개선
- [ ] (선택) 실패 항목 CSV 다운로드 기능
- [ ] 테스트 및 배포

### Phase 4: 공통 모듈화 (2주)
- [ ] `lib/task-type-mappings.ts` 생성
- [ ] 백엔드 API 전체 적용
- [ ] 프론트엔드 전체 적용
- [ ] 단위 테스트 작성
- [ ] 통합 테스트 및 배포

---

## 🎯 성공 지표

| 지표 | 현재 | 목표 |
|-----|------|------|
| 유효성 검사 통과율 | 2.6% (82/3132) | 100% |
| 업로드 실패율 | 97.4% | 0% |
| 사용자 오류 인지율 | 낮음 (애매한 메시지) | 높음 (명확한 피드백) |
| 재작업 소요 시간 | 높음 (원인 파악 어려움) | 낮음 (실시간 오류 표시) |

---

## 📚 참고 자료

- 관련 파일:
  - `app/api/admin/tasks/bulk-upload/route.ts` (백엔드 API)
  - `components/tasks/BulkUploadModal.tsx` (프론트엔드 UI)
  - `app/api/facility-tasks/route.ts` (메인 API)

- 관련 이슈:
  - 엑셀 일괄등록 실패율 97.4%
  - 업무타입 용어 불일치

- 영향받는 기능:
  - 엑셀 일괄 업무 등록
  - 업무 목록 조회
  - 칸반보드 표시
