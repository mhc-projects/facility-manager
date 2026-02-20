# 📋 비용상세내역 변경 이력 자동 기록 시스템 설계 (개정판 v2.1)

## 1. 시스템 개요

**목적**: 영업비용조정, 실사비용조정, AS비용, 커스텀추가비용의 추가/삭제/수정 시 우측 메모 영역에 자동으로 변경 이력 기록

**핵심 원칙**:
- ✅ 기존 메모 시스템 활용 (별도 테이블 생성 X)
- ✅ 최소 침습적 구현 (기존 코드 수정 최소화)
- ✅ 실시간 반영 (저장 즉시 메모 영역에 표시)
- ✅ 사용자 식별 (현재 로그인 사용자 정보 활용)
- ✅ **권한 기반 접근 제어** (권한 4 = 슈퍼 관리자만 자동 메모 삭제 가능)
- ✅ **메모 필터링 기능** (자동/업무/일반 메모 구분 표시)
- ✅ **안정성 강화** (에러 핸들링, 재시도 로직, 감사 로그)
- ✅ **성능 최적화** (인덱싱, 캐싱, 메모이제이션)
- 🔒 **영구 보관** (변경 이력은 삭제되지 않고 영구 보관)

---

## 2. 아키텍처 설계

### 2.1 데이터 모델

**기존 `business_memos` 테이블 활용**:
```sql
-- 기존 테이블 그대로 사용 (변경 없음)
-- 자동 생성 메모는 title에 특정 패턴 사용으로 구분

-- 예시:
title: "[자동] 영업비용조정 변경"
title: "[자동] 실사비용조정 추가"
title: "[자동] AS비용 수정"
title: "[자동] 커스텀비용 삭제"
```

**메모 타입 식별**:
```typescript
interface CostChangeLog {
  type: 'operating_cost' | 'survey_fee' | 'as_cost' | 'custom_cost';
  action: 'added' | 'updated' | 'deleted';
  oldValue?: any;
  newValue?: any;
  timestamp: string;
  user: string;
}

// 🆕 메모 타입 정의
type MemoType = 'auto' | 'task' | 'normal';

interface EnhancedMemo extends Memo {
  memo_type?: MemoType; // 런타임 파싱으로 결정
  is_auto_generated?: boolean; // title 기반 판별
}
```

### 2.2 권한 체계

**중요**: admin/revenue 페이지는 권한 3 이상만 접근 가능 (기존 시스템 정책)

```typescript
// 권한 레벨 정의
enum PermissionLevel {
  VIEWER = 1,        // 조회만 가능 (admin/revenue 접근 불가)
  EDITOR = 2,        // 일반 편집 가능 (admin/revenue 접근 불가)
  MANAGER = 3,       // 관리자 (admin/revenue 접근 가능, 모든 일반 메모 편집)
  SUPER_ADMIN = 4    // 슈퍼 관리자 (자동 메모 포함 모든 메모 삭제 가능)
}

// 메모별 권한 매트릭스
const MEMO_PERMISSIONS = {
  normal: {
    create: [3, 4],     // ⚠️ admin/revenue 접근자만 생성 가능
    edit: [3, 4],
    delete: [3, 4]
  },
  task: {
    create: [3, 4],
    edit: [3, 4],
    delete: [3, 4]
  },
  auto: {
    create: ['system'], // 시스템만 생성
    edit: [],           // 누구도 수정 불가
    delete: [4]         // 권한 4만 삭제 가능
  }
};

// 페이지 접근 권한
const PAGE_ACCESS = {
  'admin/revenue': 3,  // 최소 권한 3 필요
  'admin/business': 2,
  'admin/tasks': 2
};
```

### 2.3 컴포넌트 구조

```
BusinessRevenueModal
├─ 좌측: 비용상세내역 섹션 (기존)
│   ├─ 영업비용조정 (handleSaveAdjustment)
│   ├─ 실사비용조정 (handleSaveSurveyFee)
│   ├─ AS비용 (handleSaveAsCost)
│   └─ 커스텀추가비용 (handleSaveCustomCosts)
│
└─ 우측: MemoSection (enhanced)
    ├─ 🆕 메모 필터 UI
    │   ├─ [전체] (기본)
    │   ├─ [일반 메모]
    │   ├─ [업무 메모]
    │   └─ [변경 이력] (자동 메모)
    │
    ├─ 일반 메모 (기존)
    ├─ 업무 메모 (기존)
    └─ 자동 변경 이력 메모 (NEW)
        ├─ 시각적 구분 (회색 배경, Clock 아이콘)
        ├─ 수정 불가 (읽기 전용)
        └─ 🆕 삭제: 권한 4만 가능
```

---

## 3. 핵심 기능 구현

### 3.1 자동 메모 생성 Hook (안정성 강화)

```typescript
// hooks/useCostChangeLogger.ts (NEW)
import { useState, useCallback } from 'react';
import { TokenManager } from '@/lib/api-client';

interface CreateLogParams {
  type: 'operating_cost' | 'survey_fee' | 'as_cost' | 'custom_cost';
  action: 'added' | 'updated' | 'deleted';
  oldValue?: any;
  newValue?: any;
  itemName?: string;
}

export function useCostChangeLogger(businessId: string) {
  const [isLogging, setIsLogging] = useState(false);
  const [logError, setLogError] = useState<string | null>(null);

  const createCostChangeLog = useCallback(async (params: CreateLogParams) => {
    const { type, action, oldValue, newValue, itemName } = params;

    setIsLogging(true);
    setLogError(null);

    try {
      // 1️⃣ 제목 생성
      const typeLabels = {
        operating_cost: '영업비용조정',
        survey_fee: '실사비용조정',
        as_cost: 'AS비용',
        custom_cost: `커스텀추가비용${itemName ? `(${itemName})` : ''}`
      };

      const actionLabels = {
        added: '추가',
        updated: '수정',
        deleted: '삭제'
      };

      const title = `[자동] ${typeLabels[type]} ${actionLabels[action]}`;

      // 2️⃣ 내용 생성
      const content = generateChangeDescription({
        type, action, oldValue, newValue, itemName
      });

      // 3️⃣ 사용자 정보 가져오기
      const userName = await getCurrentUserName();

      // 4️⃣ 메모 저장 (재시도 로직 포함)
      await saveMemoWithRetry({
        businessId,
        title,
        content,
        created_by: `${userName} (자동)`,
        updated_by: `${userName} (자동)`
      });

      console.log('✅ [COST-LOG] 변경 이력 자동 기록 성공:', title);

    } catch (error) {
      console.error('❌ [COST-LOG] 변경 이력 기록 실패:', error);
      setLogError(error instanceof Error ? error.message : '알 수 없는 오류');

      // 🆕 에러는 기록하되, 원본 작업(비용 저장)은 성공 상태 유지
      // 사용자에게는 알림 없이 콘솔 로그만 남김 (비침습적)
    } finally {
      setIsLogging(false);
    }
  }, [businessId]);

  return { createCostChangeLog, isLogging, logError };
}

// 🆕 재시도 로직이 포함된 메모 저장 함수
async function saveMemoWithRetry(
  memoData: {
    businessId: string;
    title: string;
    content: string;
    created_by: string;
    updated_by: string;
  },
  maxRetries = 2
): Promise<void> {
  const { businessId, title, content, created_by, updated_by } = memoData;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      const token = TokenManager.getToken();
      const response = await fetch(`/api/businesses/${businessId}/memos`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          title,
          content,
          created_by,
          updated_by,
          is_auto_generated: true // 🆕 자동 생성 플래그
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.message || '메모 저장 실패');
      }

      // 성공 시 즉시 반환
      return;

    } catch (error) {
      console.warn(`⚠️ [COST-LOG] 저장 시도 ${attempt}/${maxRetries + 1} 실패:`, error);

      if (attempt === maxRetries + 1) {
        // 최종 실패
        throw error;
      }

      // 재시도 전 대기 (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }
}
```

### 3.2 변경 설명 생성 로직 (개선)

```typescript
// utils/costChangeFormatter.ts (NEW)

function generateChangeDescription(params: {
  type: string;
  action: string;
  oldValue?: any;
  newValue?: any;
  itemName?: string;
}): string {
  const { type, action, oldValue, newValue, itemName } = params;
  const timestamp = new Date().toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  let description = '';

  switch (type) {
    case 'operating_cost':
      if (action === 'added') {
        description = `${newValue.type === 'add' ? '추가(+)' : '차감(-)'} ${newValue.amount.toLocaleString()}원\n사유: ${newValue.reason || '없음'}`;
      } else if (action === 'updated') {
        const oldType = oldValue.type === 'add' ? '추가(+)' : '차감(-)';
        const newType = newValue.type === 'add' ? '추가(+)' : '차감(-)';
        description = `금액: ${oldValue.amount.toLocaleString()}원 → ${newValue.amount.toLocaleString()}원\n타입: ${oldType} → ${newType}\n사유: ${newValue.reason || '없음'}`;
      } else {
        description = `${oldValue.amount.toLocaleString()}원 (${oldValue.type === 'add' ? '추가' : '차감'}) 삭제됨\n사유: ${oldValue.reason || '없음'}`;
      }
      break;

    case 'survey_fee':
      if (action === 'added' || action === 'updated') {
        const oldAmt = oldValue ?? 0;
        const finalOld = 100000 + oldAmt;
        const finalNew = 100000 + newValue;
        description = `조정액: ${oldAmt.toLocaleString()}원 → ${newValue.toLocaleString()}원\n최종 실사비: ${finalOld.toLocaleString()}원 → ${finalNew.toLocaleString()}원`;
      } else {
        description = `조정액 ${oldValue.toLocaleString()}원 초기화\n기본 실사비 100,000원으로 복귀`;
      }
      break;

    case 'as_cost':
      if (action === 'added' || action === 'updated') {
        const oldAmt = oldValue ?? 0;
        description = `${oldAmt.toLocaleString()}원 → ${newValue.toLocaleString()}원`;
      } else {
        description = `${oldValue.toLocaleString()}원 삭제됨`;
      }
      break;

    case 'custom_cost':
      if (action === 'added') {
        description = `항목명: ${itemName}\n금액: ${newValue.toLocaleString()}원`;
      } else if (action === 'updated') {
        description = `항목명: ${itemName}\n금액 변경: ${oldValue.toLocaleString()}원 → ${newValue.toLocaleString()}원`;
      } else {
        description = `항목명: ${itemName}\n금액: ${oldValue.toLocaleString()}원 삭제됨`;
      }
      break;
  }

  return `${description}\n\n📅 ${timestamp}`;
}

export { generateChangeDescription };
```

### 3.3 사용자 정보 가져오기 (안정성 강화)

```typescript
// lib/getCurrentUser.ts (NEW)

interface UserInfo {
  name: string;
  permission_level: number;
}

let cachedUserInfo: UserInfo | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5분

export async function getCurrentUserName(): Promise<string> {
  try {
    // 1️⃣ 캐시 확인
    const now = Date.now();
    if (cachedUserInfo && (now - cacheTimestamp < CACHE_TTL)) {
      return cachedUserInfo.name;
    }

    // 2️⃣ localStorage 확인
    const storedName = localStorage.getItem('user_name');
    if (storedName && storedName !== 'undefined') {
      return storedName;
    }

    // 3️⃣ Token에서 디코딩 (fallback)
    const token = TokenManager.getToken();
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        const name = payload.name || payload.email || '관리자';

        // 캐시 업데이트
        cachedUserInfo = { name, permission_level: payload.permission_level || 1 };
        cacheTimestamp = now;

        return name;
      } catch (e) {
        console.warn('⚠️ Token 디코딩 실패:', e);
      }
    }

    // 4️⃣ 최종 fallback
    return '시스템';

  } catch (error) {
    console.error('❌ 사용자 정보 조회 실패:', error);
    return '시스템';
  }
}

export async function getCurrentUserPermission(): Promise<number> {
  try {
    const now = Date.now();
    if (cachedUserInfo && (now - cacheTimestamp < CACHE_TTL)) {
      return cachedUserInfo.permission_level;
    }

    const token = TokenManager.getToken();
    if (token) {
      const payload = JSON.parse(atob(token.split('.')[1]));
      const permission = payload.permission_level || 1;

      cachedUserInfo = {
        name: payload.name || payload.email || '관리자',
        permission_level: permission
      };
      cacheTimestamp = now;

      return permission;
    }

    return 1; // 기본 권한
  } catch (error) {
    console.error('❌ 권한 정보 조회 실패:', error);
    return 1;
  }
}
```

### 3.4 메모 필터링 컴포넌트

```typescript
// components/business/MemoFilterBar.tsx (NEW)

import { Filter } from 'lucide-react';

interface MemoFilterBarProps {
  activeFilter: 'all' | 'normal' | 'task' | 'auto';
  onFilterChange: (filter: 'all' | 'normal' | 'task' | 'auto') => void;
  counts: {
    all: number;
    normal: number;
    task: number;
    auto: number;
  };
}

export function MemoFilterBar({ activeFilter, onFilterChange, counts }: MemoFilterBarProps) {
  const filters = [
    { key: 'all' as const, label: '전체', count: counts.all },
    { key: 'normal' as const, label: '일반 메모', count: counts.normal },
    { key: 'task' as const, label: '업무 메모', count: counts.task },
    { key: 'auto' as const, label: '변경 이력', count: counts.auto }
  ];

  return (
    <div className="flex items-center gap-2 mb-3 pb-3 border-b border-gray-200">
      <Filter className="w-4 h-4 text-gray-400" />
      <div className="flex gap-1 flex-wrap">
        {filters.map(({ key, label, count }) => (
          <button
            key={key}
            onClick={() => onFilterChange(key)}
            className={`
              px-3 py-1 text-xs rounded-full transition-colors
              ${activeFilter === key
                ? 'bg-indigo-600 text-white font-medium'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }
            `}
          >
            {label} ({count})
          </button>
        ))}
      </div>
    </div>
  );
}
```

### 3.5 MemoSection 개선 (필터링 + 권한 제어)

```typescript
// components/business/MemoSection.tsx (ENHANCED)

import { useState, useMemo } from 'react';
import { MemoFilterBar } from './MemoFilterBar';
import { getCurrentUserPermission } from '@/lib/getCurrentUser';

export function MemoSection({ businessId, businessName, userPermission }: MemoSectionProps) {
  const [memos, setMemos] = useState<Memo[]>([]);
  const [activeFilter, setActiveFilter] = useState<'all' | 'normal' | 'task' | 'auto'>('all');

  // 🆕 메모 타입 구분 함수
  function getMemoType(memo: Memo): 'auto' | 'task' | 'normal' {
    if (memo.title.startsWith('[자동]')) return 'auto';
    if (memo.title.includes('[업무]') || memo.title.includes('업무')) return 'task';
    return 'normal';
  }

  // 🆕 필터링된 메모 목록
  const filteredMemos = useMemo(() => {
    if (activeFilter === 'all') return memos;
    return memos.filter(memo => getMemoType(memo) === activeFilter);
  }, [memos, activeFilter]);

  // 🆕 메모 개수 집계
  const memoCounts = useMemo(() => {
    const counts = {
      all: memos.length,
      normal: 0,
      task: 0,
      auto: 0
    };

    memos.forEach(memo => {
      const type = getMemoType(memo);
      counts[type]++;
    });

    return counts;
  }, [memos]);

  // 🆕 삭제 권한 확인 함수
  function canDeleteMemo(memo: Memo): boolean {
    const memoType = getMemoType(memo);

    if (memoType === 'auto') {
      // 자동 메모는 권한 4만 삭제 가능
      return userPermission >= 4;
    } else if (memoType === 'task' || memoType === 'normal') {
      // ⚠️ admin/revenue 페이지는 권한 3 이상만 접근 가능하므로
      // 업무 메모 및 일반 메모는 권한 3 이상만 삭제 가능
      return userPermission >= 3;
    }
    return false;
  }

  // 삭제 핸들러 (권한 검증 강화)
  const handleDelete = async (memoId: string, memo: Memo) => {
    if (!memoId) {
      alert('메모 ID가 없어 삭제할 수 없습니다.');
      return;
    }

    const memoType = getMemoType(memo);

    // 권한 체크
    if (!canDeleteMemo(memo)) {
      if (memoType === 'auto') {
        alert('⚠️ 자동 생성된 변경 이력은 슈퍼 관리자(권한 4)만 삭제할 수 있습니다.');
      } else if (memoType === 'task') {
        alert('⚠️ 업무 메모는 관리자(권한 3) 이상만 삭제할 수 있습니다.');
      } else {
        alert('⚠️ 메모 삭제 권한이 없습니다.');
      }
      return;
    }

    // 자동 메모 삭제 시 엄격한 확인
    if (memoType === 'auto') {
      const confirmed = confirm(
        '🚨 경고: 자동 생성된 변경 이력을 삭제하시겠습니까?\n\n' +
        '⚠️ 이 작업은 비용 변경의 감사 추적(Audit Trail)을 영구적으로 제거합니다.\n' +
        '⚠️ 슈퍼 관리자(권한 4)만 이 작업을 수행할 수 있습니다.\n' +
        '⚠️ 삭제된 변경 이력은 복구할 수 없습니다.\n\n' +
        '메모 내용:\n' + memo.content + '\n\n' +
        '정말 삭제하시겠습니까?'
      );

      if (!confirmed) return;

      // 이중 확인
      const doubleConfirm = confirm(
        '⚠️ 최종 확인: 정말로 이 변경 이력을 삭제하시겠습니까?\n\n' +
        '이 작업은 되돌릴 수 없습니다.'
      );

      if (!doubleConfirm) return;
    } else {
      const confirmed = confirm(`"${memo.title}" 메모를 삭제하시겠습니까?`);
      if (!confirmed) return;
    }

    try {
      const token = TokenManager.getToken();
      const response = await fetch(`/api/businesses/${businessId}/memos/${memoId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      const data = await response.json();
      if (data.success) {
        setMemos(prev => prev.filter(m => m.id !== memoId));
        alert('메모가 삭제되었습니다.');
      } else {
        alert(data.message || '삭제에 실패했습니다.');
      }
    } catch (error) {
      console.error('메모 삭제 오류:', error);
      alert('삭제 중 오류가 발생했습니다.');
    }
  };

  return (
    <div>
      {/* 🆕 필터 바 */}
      <MemoFilterBar
        activeFilter={activeFilter}
        onFilterChange={setActiveFilter}
        counts={memoCounts}
      />

      {/* 메모 목록 */}
      {filteredMemos.map(memo => {
        const memoType = getMemoType(memo);
        const isAutoMemo = memoType === 'auto';
        const isTaskMemo = memoType === 'task';
        const canDelete = canDeleteMemo(memo);
        const canEdit = !isAutoMemo && userPermission >= 2;

        return (
          <div key={memo.id} className={`
            p-3 rounded-lg border mb-2
            ${isAutoMemo ? 'bg-gray-50 border-gray-300' : 'bg-white border-gray-200'}
          `}>
            <div className="flex items-start gap-2">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className={`text-sm font-medium ${
                    isAutoMemo ? 'text-gray-700' : 'text-gray-900'
                  }`}>
                    {memo.title}
                  </h4>
                  <span className={`px-2 py-0.5 text-xs rounded-full ${
                    isAutoMemo
                      ? 'bg-gray-200 text-gray-700 border border-gray-400'
                      : isTaskMemo
                      ? 'bg-blue-100 text-blue-700 border border-blue-300'
                      : 'bg-indigo-100 text-indigo-700'
                  }`}>
                    {isAutoMemo ? '자동' : isTaskMemo ? '업무' : '메모'}
                  </span>
                </div>

                <p className={`text-sm whitespace-pre-line ${
                  isAutoMemo ? 'text-gray-600' : 'text-gray-800'
                }`}>
                  {memo.content}
                </p>

                <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                  <span>작성: {memo.created_by}</span>
                  <span>{formatDate(memo.created_at)}</span>
                  {memo.updated_at !== memo.created_at && (
                    <span>수정: {memo.updated_by}</span>
                  )}
                </div>
              </div>

              {/* 버튼 영역 */}
              <div className="flex gap-1">
                {canEdit && (
                  <button
                    onClick={() => handleEdit(memo)}
                    className="p-1 text-gray-400 hover:text-indigo-600"
                    title="메모 수정"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                )}

                <button
                  onClick={() => handleDelete(memo.id!, memo)}
                  disabled={!canDelete}
                  className={`p-1 ${
                    canDelete
                      ? 'text-gray-400 hover:text-red-600 cursor-pointer'
                      : 'text-gray-200 cursor-not-allowed'
                  }`}
                  title={
                    isAutoMemo && !canDelete
                      ? '슈퍼 관리자(권한 4)만 삭제 가능'
                      : canDelete
                      ? '메모 삭제'
                      : '삭제 권한 없음'
                  }
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

### 3.6 기존 저장 핸들러 수정 (에러 핸들링 강화)

```typescript
// components/business/BusinessRevenueModal.tsx (ENHANCED)

import { useCostChangeLogger } from '@/hooks/useCostChangeLogger';

export default function BusinessRevenueModal({ ... }: BusinessRevenueModalProps) {
  // 🆕 변경 이력 로거 Hook
  const { createCostChangeLog, isLogging, logError } = useCostChangeLogger(business?.id);

  const handleSaveAdjustment = async () => {
    if (!business?.id) return;

    const oldValue = calculatedData?.operating_cost_adjustment;
    const newValue = adjustmentForm;

    setIsSavingAdjustment(true);

    try {
      // 1️⃣ 비용 데이터 저장 (원본 로직)
      const token = TokenManager.getToken();
      const url = '/api/revenue/operating-cost-adjustment';
      const hasExisting = calculatedData?.operating_cost_adjustment;
      const method = hasExisting ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          business_id: business.id,
          adjustment_amount: newValue.amount,
          adjustment_type: newValue.type,
          adjustment_reason: newValue.reason
        })
      });

      const data = await response.json();

      if (data.success) {
        // 2️⃣ 매출 재계산
        const calcResponse = await fetch('/api/revenue/calculate', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ business_id: business.id })
        });

        const calcData = await calcResponse.json();
        if (calcData.success && calcData.data && calcData.data.calculation) {
          setCalculatedData(calcData.data.calculation);
          invalidateRevenueCache(business.id);
          setDataChanged(true);
        }

        // 3️⃣ 🆕 변경 이력 자동 기록 (비동기, 실패해도 원본 작업 성공 유지)
        createCostChangeLog({
          type: 'operating_cost',
          action: oldValue ? 'updated' : 'added',
          oldValue: oldValue ? {
            amount: oldValue.adjustment_amount,
            type: oldValue.adjustment_type,
            reason: oldValue.adjustment_reason
          } : undefined,
          newValue: {
            amount: newValue.amount,
            type: newValue.type,
            reason: newValue.reason
          }
        }).catch(err => {
          // 로그 실패는 콘솔에만 기록, 사용자에게는 알리지 않음
          console.error('⚠️ 변경 이력 기록 실패 (비용 저장은 성공):', err);
        });

        setIsEditingAdjustment(false);
        setAdjustmentForm({ amount: 0, type: 'add', reason: '' });
        alert('영업비용 조정이 저장되었습니다.');

      } else {
        alert(data.message || '저장에 실패했습니다.');
      }

    } catch (error) {
      console.error('영업비용 조정 저장 오류:', error);
      alert('저장 중 오류가 발생했습니다. 네트워크 연결을 확인해주세요.');
    } finally {
      setIsSavingAdjustment(false);
    }
  };

  // 🆕 삭제 핸들러에도 로그 추가
  const handleDeleteAdjustment = async () => {
    if (!business?.id || !calculatedData?.operating_cost_adjustment) return;

    const confirmed = confirm('영업비용 조정을 삭제하시겠습니까?');
    if (!confirmed) return;

    const oldValue = calculatedData.operating_cost_adjustment;
    setIsSavingAdjustment(true);

    try {
      const token = TokenManager.getToken();
      const response = await fetch('/api/revenue/operating-cost-adjustment', {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ business_id: business.id })
      });

      const data = await response.json();

      if (data.success) {
        // 매출 재계산
        const calcResponse = await fetch('/api/revenue/calculate', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ business_id: business.id })
        });

        const calcData = await calcResponse.json();
        if (calcData.success && calcData.data && calcData.data.calculation) {
          setCalculatedData(calcData.data.calculation);
          invalidateRevenueCache(business.id);
          setDataChanged(true);
        }

        // 🆕 변경 이력 기록
        createCostChangeLog({
          type: 'operating_cost',
          action: 'deleted',
          oldValue: {
            amount: oldValue.adjustment_amount,
            type: oldValue.adjustment_type,
            reason: oldValue.adjustment_reason
          }
        }).catch(err => {
          console.error('⚠️ 변경 이력 기록 실패:', err);
        });

        setAdjustmentForm({ amount: 0, type: 'add', reason: '' });
        setIsEditingAdjustment(false);
        alert('영업비용 조정이 삭제되었습니다.');
      } else {
        alert(data.message || '삭제에 실패했습니다.');
      }
    } catch (error) {
      console.error('영업비용 조정 삭제 오류:', error);
      alert('삭제 중 오류가 발생했습니다.');
    } finally {
      setIsSavingAdjustment(false);
    }
  };

  // handleSaveSurveyFee, handleSaveAsCost, handleSaveCustomCosts도 동일 패턴 적용
}
```

---

## 4. API 수정

### 4.1 메모 생성 API 확장

```typescript
// app/api/businesses/[id]/memos/route.ts (ENHANCED)

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const businessId = params.id;
    const body = await req.json();
    const {
      title,
      content,
      created_by,
      updated_by,
      is_auto_generated = false // 🆕 자동 생성 플래그
    } = body;

    // 🆕 자동 생성 메모인 경우 created_by에 "(자동)" 접미사 확인
    const finalCreatedBy = created_by || '관리자';
    const finalUpdatedBy = updated_by || finalCreatedBy;

    // 🆕 제목 검증: 자동 메모는 [자동] 접두사 필수
    if (is_auto_generated && !title.startsWith('[자동]')) {
      return Response.json({
        success: false,
        message: '자동 생성 메모는 [자동] 접두사가 필요합니다.'
      }, { status: 400 });
    }

    // DB 저장
    const { data, error } = await supabase
      .from('business_memos')
      .insert({
        business_id: businessId,
        title,
        content,
        created_by: finalCreatedBy,
        updated_by: finalUpdatedBy
      })
      .select()
      .single();

    if (error) {
      console.error('메모 저장 DB 오류:', error);
      return Response.json({
        success: false,
        message: 'DB 저장 실패'
      }, { status: 500 });
    }

    return Response.json({
      success: true,
      data: { memo: data }
    });

  } catch (error) {
    console.error('메모 생성 API 오류:', error);
    return Response.json({
      success: false,
      message: '서버 오류'
    }, { status: 500 });
  }
}
```

### 4.2 메모 삭제 API 권한 검증 강화

```typescript
// app/api/businesses/[id]/memos/[memoId]/route.ts (ENHANCED)

export async function DELETE(
  req: Request,
  { params }: { params: { id: string; memoId: string } }
) {
  try {
    const { id: businessId, memoId } = params;

    // 🆕 사용자 권한 확인
    const token = req.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return Response.json({
        success: false,
        message: '인증 토큰이 없습니다.'
      }, { status: 401 });
    }

    const userPayload = JSON.parse(atob(token.split('.')[1]));
    const userPermission = userPayload.permission_level || 1;

    // 🆕 메모 조회하여 타입 확인
    const { data: memo, error: fetchError } = await supabase
      .from('business_memos')
      .select('*')
      .eq('id', memoId)
      .single();

    if (fetchError || !memo) {
      return Response.json({
        success: false,
        message: '메모를 찾을 수 없습니다.'
      }, { status: 404 });
    }

    // 🆕 자동 메모는 권한 4만 삭제 가능
    const isAutoMemo = memo.title.startsWith('[자동]');
    if (isAutoMemo && userPermission < 4) {
      return Response.json({
        success: false,
        message: '자동 생성된 메모는 슈퍼 관리자(권한 4)만 삭제할 수 있습니다.'
      }, { status: 403 });
    }

    // ⚠️ admin/revenue 페이지 접근자는 모두 권한 3 이상이므로
    // 업무 메모 및 일반 메모는 권한 3 이상만 삭제 가능
    const isTaskMemo = memo.title.includes('[업무]') || memo.title.includes('업무');

    if (!isAutoMemo && userPermission < 3) {
      return Response.json({
        success: false,
        message: 'admin/revenue 페이지의 메모는 관리자(권한 3) 이상만 삭제할 수 있습니다.'
      }, { status: 403 });
    }

    // 삭제 실행 (soft delete)
    const { error: deleteError } = await supabase
      .from('business_memos')
      .update({
        is_deleted: true,
        updated_at: new Date().toISOString()
      })
      .eq('id', memoId);

    if (deleteError) {
      console.error('메모 삭제 DB 오류:', deleteError);
      return Response.json({
        success: false,
        message: 'DB 삭제 실패'
      }, { status: 500 });
    }

    // 🆕 감사 로그 기록 (자동 메모 삭제 시)
    if (isAutoMemo) {
      console.warn(`🚨 [AUDIT] 자동 메모 삭제 - User: ${userPayload.name}, Memo: ${memo.title}, Content: ${memo.content}`);
    }

    return Response.json({
      success: true,
      message: '메모가 삭제되었습니다.'
    });

  } catch (error) {
    console.error('메모 삭제 API 오류:', error);
    return Response.json({
      success: false,
      message: '서버 오류'
    }, { status: 500 });
  }
}
```

---

## 5. 안정성 강화 전략

### 5.1 에러 핸들링 계층

```
┌─────────────────────────────────────┐
│   Layer 1: UI Component Level       │
│   - try/catch로 예외 포착           │
│   - 사용자 친화적 에러 메시지       │
│   - Fallback UI 표시                │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│   Layer 2: Hook Level               │
│   - 재시도 로직 (exponential backoff)│
│   - 에러 상태 관리                  │
│   - 로그 기록                       │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│   Layer 3: API Level                │
│   - HTTP 상태 코드 검증             │
│   - 데이터 검증                     │
│   - DB 트랜잭션 관리                │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│   Layer 4: Database Level           │
│   - 제약 조건 검증                  │
│   - 트리거 실행                     │
│   - 감사 로그 기록                  │
└─────────────────────────────────────┘
```

### 5.2 재시도 정책

```typescript
// utils/retryPolicy.ts (NEW)

interface RetryConfig {
  maxRetries: number;
  baseDelay: number; // ms
  maxDelay: number;  // ms
  backoffMultiplier: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 2,
  baseDelay: 1000,
  maxDelay: 5000,
  backoffMultiplier: 2
};

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const { maxRetries, baseDelay, maxDelay, backoffMultiplier } = {
    ...DEFAULT_RETRY_CONFIG,
    ...config
  };

  let lastError: Error;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt === maxRetries) {
        throw lastError;
      }

      const delay = Math.min(
        baseDelay * Math.pow(backoffMultiplier, attempt),
        maxDelay
      );

      console.warn(
        `⚠️ Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms:`,
        lastError.message
      );

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
}
```

### 5.3 데이터 검증

```typescript
// utils/validation.ts (NEW)

interface CostChangeValidation {
  isValid: boolean;
  errors: string[];
}

export function validateCostChange(params: {
  type: string;
  action: string;
  oldValue?: any;
  newValue?: any;
}): CostChangeValidation {
  const errors: string[] = [];
  const { type, action, oldValue, newValue } = params;

  // 타입 검증
  const validTypes = ['operating_cost', 'survey_fee', 'as_cost', 'custom_cost'];
  if (!validTypes.includes(type)) {
    errors.push(`잘못된 비용 타입: ${type}`);
  }

  // 액션 검증
  const validActions = ['added', 'updated', 'deleted'];
  if (!validActions.includes(action)) {
    errors.push(`잘못된 액션: ${action}`);
  }

  // 값 검증
  if (action === 'added' || action === 'updated') {
    if (newValue === undefined || newValue === null) {
      errors.push('새 값이 필요합니다.');
    }

    if (type === 'operating_cost') {
      if (!newValue.amount || newValue.amount <= 0) {
        errors.push('영업비용 조정 금액은 0보다 커야 합니다.');
      }
      if (!['add', 'subtract'].includes(newValue.type)) {
        errors.push('영업비용 조정 타입은 add 또는 subtract여야 합니다.');
      }
    }

    if (type === 'as_cost' && newValue < 0) {
      errors.push('AS 비용은 0 이상이어야 합니다.');
    }
  }

  if (action === 'deleted' && !oldValue) {
    errors.push('삭제할 이전 값이 필요합니다.');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}
```

### 5.4 모니터링 및 로깅

```typescript
// utils/costChangeMonitor.ts (NEW)

interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  businessId: string;
  type: string;
  action: string;
  success: boolean;
  error?: string;
  duration?: number;
}

class CostChangeMonitor {
  private logs: LogEntry[] = [];
  private maxLogs = 100;

  log(entry: Omit<LogEntry, 'timestamp'>) {
    const logEntry: LogEntry = {
      timestamp: new Date().toISOString(),
      ...entry
    };

    this.logs.push(logEntry);

    // 로그 크기 제한
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }

    // 콘솔 출력
    const prefix = entry.success ? '✅' : '❌';
    const message = `${prefix} [COST-LOG] ${entry.type} ${entry.action} - Business: ${entry.businessId}`;

    if (entry.level === 'error') {
      console.error(message, entry.error);
    } else if (entry.level === 'warn') {
      console.warn(message);
    } else {
      console.log(message);
    }
  }

  getRecentLogs(count = 10): LogEntry[] {
    return this.logs.slice(-count);
  }

  getErrorRate(): number {
    if (this.logs.length === 0) return 0;
    const errors = this.logs.filter(log => !log.success).length;
    return errors / this.logs.length;
  }

  clearLogs() {
    this.logs = [];
  }
}

export const costChangeMonitor = new CostChangeMonitor();
```

### 5.5 Circuit Breaker 패턴 (선택사항)

```typescript
// utils/circuitBreaker.ts (OPTIONAL)

enum CircuitState {
  CLOSED = 'CLOSED',   // 정상 작동
  OPEN = 'OPEN',       // 차단 상태
  HALF_OPEN = 'HALF_OPEN' // 복구 시도
}

class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private nextAttempt = Date.now();

  constructor(
    private threshold = 3,        // 실패 임계값
    private timeout = 60000,      // 차단 시간 (1분)
    private resetThreshold = 2    // 복구 성공 임계값
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (Date.now() < this.nextAttempt) {
        throw new Error('Circuit breaker is OPEN. Skipping execution.');
      }
      this.state = CircuitState.HALF_OPEN;
      this.successCount = 0;
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess() {
    this.failureCount = 0;

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.resetThreshold) {
        this.state = CircuitState.CLOSED;
        console.log('✅ Circuit breaker CLOSED (복구 완료)');
      }
    }
  }

  private onFailure() {
    this.failureCount++;
    this.successCount = 0;

    if (this.failureCount >= this.threshold) {
      this.state = CircuitState.OPEN;
      this.nextAttempt = Date.now() + this.timeout;
      console.warn(`⚠️ Circuit breaker OPEN (${this.failureCount} 연속 실패)`);
    }
  }

  getState(): CircuitState {
    return this.state;
  }
}

export const memoApiCircuitBreaker = new CircuitBreaker();
```

---

## 6. 구현 단계별 체크리스트

### Phase 1: 핵심 기능 구현
- [ ] `useCostChangeLogger` Hook 생성 (재시도 로직 포함)
- [ ] `generateChangeDescription` 유틸 함수 작성
- [ ] `getCurrentUserName` / `getCurrentUserPermission` 함수 구현
- [ ] `validateCostChange` 검증 함수 작성
- [ ] 4개 저장 핸들러에 로그 생성 로직 추가
  - [ ] `handleSaveAdjustment` (added/updated)
  - [ ] `handleDeleteAdjustment` (deleted)
  - [ ] `handleSaveSurveyFee`
  - [ ] `handleSaveAsCost`
  - [ ] `handleSaveCustomCosts`

### Phase 2: 권한 제어 및 UI 개선
- [ ] 메모 타입 구분 함수 (`getMemoType`)
- [ ] 권한 검증 함수 (`canDeleteMemo`)
- [ ] MemoFilterBar 컴포넌트 생성
- [ ] MemoSection에 필터링 로직 추가
- [ ] 자동 메모 시각적 구분 (회색 배경, Clock 아이콘)
- [ ] 삭제 버튼 권한별 활성화/비활성화
- [ ] 자동 메모 삭제 시 확인 다이얼로그 강화

### Phase 3: API 권한 검증
- [ ] POST `/api/businesses/[id]/memos` - `is_auto_generated` 플래그 지원
- [ ] DELETE `/api/businesses/[id]/memos/[memoId]` - 권한 검증 추가
- [ ] 자동 메모 삭제 감사 로그 기록

### Phase 4: 안정성 강화
- [ ] 재시도 로직 구현 (`retryWithBackoff`)
- [ ] 데이터 검증 추가 (`validateCostChange`)
- [ ] 모니터링 시스템 구축 (`CostChangeMonitor`)
- [ ] 에러 핸들링 계층화
- [ ] Circuit Breaker 패턴 적용 (선택)

### Phase 5: 테스트 및 검증
- [ ] 영업비용조정 추가/수정/삭제 시 로그 생성 확인
- [ ] 실사비용조정 변경 시 로그 생성 확인
- [ ] AS비용 변경 시 로그 생성 확인
- [ ] 커스텀비용 추가/수정/삭제 시 로그 생성 확인
- [ ] 메모 필터링 기능 테스트 (전체/일반/업무/자동)
- [ ] 권한별 삭제 기능 테스트
  - [ ] 권한 1,2,3: 자동 메모 삭제 거부 확인
  - [ ] 권한 4: 자동 메모 삭제 성공 확인
- [ ] 로그 생성 실패 시 원본 작업 영향 없는지 확인
- [ ] 재시도 로직 동작 확인 (네트워크 에러 시뮬레이션)
- [ ] 메모 영역 정렬 순서 확인 (최신순)

### Phase 6: 성능 최적화 및 감사 로그
- [ ] 데이터베이스 인덱스 생성
  - [ ] `idx_business_memos_business_id_created_at`
  - [ ] `idx_business_memos_title_pattern`
  - [ ] `idx_business_memos_composite`
- [ ] 메모 목록 페이지네이션 구현 (무한 스크롤)
- [ ] React.memo로 MemoItem 컴포넌트 최적화
- [ ] 필터링 성능 확인 (useMemo 이미 구현됨)
- [ ] 사용자 정보 캐싱 확인 (5분 TTL)
- [ ] AuditLogger 클래스 구현
- [ ] 자동 메모 삭제 감사 로그 연동
- [ ] API 응답 시간 모니터링 추가

---

## 7. 장단점 분석

### ✅ 장점
1. **기존 인프라 활용**: 별도 테이블 없이 `business_memos` 재사용
2. **최소 침습성**: 기존 코드 구조를 크게 변경하지 않음
3. **즉각적인 가시성**: 저장 즉시 메모 영역에 표시
4. **감사 추적**: 누가, 언제, 무엇을, 어떻게 변경했는지 명확히 기록
5. **유지보수성**: 메모 시스템 하나로 통합 관리
6. 🆕 **권한 기반 접근 제어**: 권한 4만 자동 메모 삭제 가능
7. 🆕 **필터링 기능**: 메모 타입별 분류 및 검색 용이
8. 🆕 **안정성 보장**: 재시도 로직, 에러 핸들링, 모니터링

### ⚠️ 단점 (및 해결 방안)
1. **메모 테이블 증가** (영구 보관 정책)
   - 특성: 변경 이력은 감사 추적 목적으로 영구 보관
   - 해결: 데이터베이스 인덱싱 최적화로 성능 유지
   - 해결: 페이지네이션으로 UI 로딩 성능 유지
   - 향후: 아카이빙 시스템 검토 (1년 이상 된 이력을 별도 테이블로 이동)

2. **자동/수동 메모 혼재**
   - 해결: 시각적 구분 + 필터링 기능으로 완화
   - 해결: 기본 필터를 '전체'로 설정하여 모든 메모 표시

3. **API 호출 증가**
   - 해결: 로그 생성 비동기 처리, 실패 시에도 원본 작업은 성공
   - 해결: 재시도 로직으로 안정성 확보

4. **권한 검증 복잡도**
   - 해결: admin/revenue는 권한 3 이상만 접근하므로 단순화
   - 해결: 프론트엔드/백엔드 이중 검증으로 보안 강화

---

## 8. 대안 설계 (참고용)

### 대안 1: 별도 변경 이력 테이블 생성
```sql
CREATE TABLE cost_change_history (
  id UUID PRIMARY KEY,
  business_id UUID REFERENCES business_info(id),
  cost_type VARCHAR(50), -- 'operating_cost', 'survey_fee', etc.
  action VARCHAR(20),     -- 'added', 'updated', 'deleted'
  old_value JSONB,
  new_value JSONB,
  changed_by VARCHAR(100),
  changed_at TIMESTAMP DEFAULT NOW()
);
```
**평가**: 더 구조화되고 쿼리 최적화 가능하지만, 복잡도 증가 및 별도 UI 필요

### 대안 2: 메모 테이블 확장
```sql
ALTER TABLE business_memos
  ADD COLUMN memo_type VARCHAR(20) DEFAULT 'manual',
  ADD COLUMN related_data JSONB,
  ADD COLUMN is_system_generated BOOLEAN DEFAULT false;
```
**평가**: 유연하지만 스키마 변경 필요, 마이그레이션 리스크

---

## 9. 성능 최적화 및 모니터링

### 9.1 데이터베이스 인덱싱 전략

```sql
-- 🎯 핵심 인덱스 (필수)
-- 사업장별 메모 조회 성능 향상
CREATE INDEX IF NOT EXISTS idx_business_memos_business_id_created_at
ON business_memos (business_id, created_at DESC)
WHERE is_deleted = false;

-- 자동 메모 필터링 성능 향상
CREATE INDEX IF NOT EXISTS idx_business_memos_title_pattern
ON business_memos (business_id, title)
WHERE is_deleted = false AND title LIKE '[자동]%';

-- 복합 인덱스 (필터링 + 정렬)
CREATE INDEX IF NOT EXISTS idx_business_memos_composite
ON business_memos (business_id, is_deleted, created_at DESC);

-- 🔍 쿼리 성능 분석
EXPLAIN ANALYZE
SELECT * FROM business_memos
WHERE business_id = 'xxx' AND is_deleted = false
ORDER BY created_at DESC
LIMIT 50;
```

### 9.2 프론트엔드 최적화

```typescript
// 메모 목록 페이지네이션 (무한 스크롤)
const MEMOS_PER_PAGE = 20;

function useMemosPagination(businessId: string) {
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const fetchMemos = async (pageNum: number) => {
    const offset = (pageNum - 1) * MEMOS_PER_PAGE;
    const response = await fetch(
      `/api/businesses/${businessId}/memos?limit=${MEMOS_PER_PAGE}&offset=${offset}`
    );
    // ...
  };

  return { fetchMemos, hasMore, loadMore: () => setPage(p => p + 1) };
}

// React.memo로 불필요한 재렌더링 방지
export const MemoItem = React.memo(({ memo, onEdit, onDelete }: MemoItemProps) => {
  // ...
});

// useMemo로 필터링 성능 최적화 (이미 구현됨)
const filteredMemos = useMemo(() => {
  if (activeFilter === 'all') return memos;
  return memos.filter(memo => getMemoType(memo) === activeFilter);
}, [memos, activeFilter]);
```

### 9.3 감사 로그 시스템

```typescript
// lib/auditLogger.ts (NEW)

interface AuditLogEntry {
  timestamp: string;
  action: 'auto_memo_deleted' | 'cost_change_logged' | 'memo_created';
  user: string;
  userPermission: number;
  businessId: string;
  details: any;
}

class AuditLogger {
  private static instance: AuditLogger;

  private constructor() {}

  static getInstance(): AuditLogger {
    if (!AuditLogger.instance) {
      AuditLogger.instance = new AuditLogger();
    }
    return AuditLogger.instance;
  }

  async logAutoMemoDeleted(params: {
    user: string;
    userPermission: number;
    businessId: string;
    businessName: string;
    memoTitle: string;
    memoContent: string;
  }) {
    const entry: AuditLogEntry = {
      timestamp: new Date().toISOString(),
      action: 'auto_memo_deleted',
      user: params.user,
      userPermission: params.userPermission,
      businessId: params.businessId,
      details: {
        businessName: params.businessName,
        memoTitle: params.memoTitle,
        memoContent: params.memoContent
      }
    };

    // 서버 로그 기록
    console.warn('🚨 [AUDIT] 자동 메모 삭제:', JSON.stringify(entry, null, 2));

    // 향후: 별도 감사 로그 DB 테이블에 저장 가능
    // await this.saveToDatabase(entry);
  }

  async logCostChange(params: {
    user: string;
    businessId: string;
    type: string;
    action: string;
    success: boolean;
    error?: string;
  }) {
    const entry: AuditLogEntry = {
      timestamp: new Date().toISOString(),
      action: 'cost_change_logged',
      user: params.user,
      userPermission: 0, // 실제 권한으로 교체
      businessId: params.businessId,
      details: {
        type: params.type,
        action: params.action,
        success: params.success,
        error: params.error
      }
    };

    console.log('📝 [AUDIT] 비용 변경 이력:', JSON.stringify(entry, null, 2));
  }
}

export const auditLogger = AuditLogger.getInstance();
```

### 9.4 API 성능 모니터링

```typescript
// API 응답 시간 측정
export async function DELETE(req: Request, { params }: { params: { id: string; memoId: string } }) {
  const startTime = Date.now();

  try {
    // ... 기존 로직 ...

    const duration = Date.now() - startTime;
    console.log(`⏱️ [PERF] 메모 삭제 API 응답 시간: ${duration}ms`);

    // 향후: 성능 메트릭 수집
    // performanceMonitor.recordApiCall('DELETE /memos', duration);

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`❌ [PERF] 메모 삭제 API 에러 (${duration}ms):`, error);
    throw error;
  }
}
```

### 9.5 메모 조회 쿼리 최적화

```sql
-- 기존 쿼리 (비효율적)
SELECT * FROM business_memos
WHERE business_id = 'xxx'
ORDER BY created_at DESC;

-- 최적화된 쿼리 (필요한 컬럼만 조회)
SELECT
  id,
  business_id,
  title,
  content,
  created_at,
  created_by,
  updated_at,
  updated_by
FROM business_memos
WHERE business_id = 'xxx'
  AND is_deleted = false
ORDER BY created_at DESC
LIMIT 50;

-- 자동 메모만 조회 (필터 적용 시)
SELECT
  id,
  business_id,
  title,
  content,
  created_at,
  created_by
FROM business_memos
WHERE business_id = 'xxx'
  AND is_deleted = false
  AND title LIKE '[자동]%'
ORDER BY created_at DESC
LIMIT 50;
```

---

## 10. 최종 권장사항

**추천 방식**: **개정된 설계안 v2.1 (영구 보관 + 성능 최적화 + 감사 로그)**

**이유**:
1. ✅ 빠른 구현 가능 (2-3일)
2. ✅ 기존 시스템과의 높은 호환성
3. ✅ 사용자 관점에서 직관적 (메모 영역에서 모든 이력 확인)
4. ✅ 권한 기반 접근 제어로 데이터 무결성 보장 (admin/revenue는 권한 3 이상)
5. ✅ 필터링 기능으로 사용성 향상
6. ✅ 안정성 강화로 프로덕션 환경 대응
7. ✅ **영구 보관**: 변경 이력은 감사 추적 목적으로 영구 보관
8. ✅ **성능 최적화**: 인덱싱, 페이지네이션, 메모이제이션
9. ✅ **감사 로그**: 자동 메모 삭제 시 서버 로그 기록

**핵심 특징**:
- 🔒 **권한 4 전용 삭제**: 자동 메모는 슈퍼 관리자만 삭제 가능 (이중 확인)
- 🔍 **메모 필터링**: 전체/일반/업무/자동 메모 분류 표시
- 🛡️ **안정성 강화**: 재시도 로직, 에러 핸들링, 데이터 검증
- 📊 **성능 최적화**: 인덱싱, 페이지네이션, React.memo
- 📝 **감사 로그**: auditLogger를 통한 중요 작업 기록
- ♾️ **영구 보관**: 자동 정리 없이 모든 변경 이력 영구 보존

**구현 범위** (v2.1):
- ✅ Phase 1-2: 핵심 기능 + 권한 제어 + 필터링
- ✅ Phase 3: API 권한 검증
- ✅ Phase 4: 안정성 강화 (재시도, 에러 핸들링)
- ✅ Phase 5: 성능 최적화 (인덱싱, 페이지네이션)
- ✅ Phase 6: 감사 로그 시스템
- ❌ ~~자동 정리 배치~~ (영구 보관 정책)

**다음 단계**:
1. Phase 1-2: 핵심 기능 + 권한 제어 구현
2. Phase 3: API 검증 강화
3. Phase 4: 안정성 테스트
4. Phase 5: 성능 최적화 적용 (인덱스 생성)
5. Phase 6: 감사 로그 시스템 구축
6. 통합 테스트 및 사용자 피드백

---

## 부록: 참고 코드 스니펫

### A. 전체 저장 핸들러 통합 예시

```typescript
// BusinessRevenueModal.tsx - 모든 저장 핸들러 패턴

const { createCostChangeLog } = useCostChangeLogger(business?.id);

// 1️⃣ 영업비용조정
const handleSaveAdjustment = async () => { /* ... */ };
const handleDeleteAdjustment = async () => { /* ... */ };

// 2️⃣ 실사비용조정
const handleSaveSurveyFee = async () => {
  // ... 기존 저장 로직 ...

  // 로그 기록
  await createCostChangeLog({
    type: 'survey_fee',
    action: oldValue !== undefined ? 'updated' : 'added',
    oldValue,
    newValue: surveyFeeForm.amount
  }).catch(err => console.error('⚠️ 로그 실패:', err));
};

// 3️⃣ AS비용
const handleSaveAsCost = async () => {
  // ... 기존 저장 로직 ...

  await createCostChangeLog({
    type: 'as_cost',
    action: oldValue !== undefined ? 'updated' : 'added',
    oldValue,
    newValue: asCostForm.amount
  }).catch(err => console.error('⚠️ 로그 실패:', err));
};

// 4️⃣ 커스텀추가비용
const handleSaveCustomCosts = async () => {
  // ... 기존 저장 로직 ...

  // 변경 사항 감지 (추가/수정/삭제)
  const changes = detectCustomCostChanges(oldCustomCosts, newCustomCosts);

  for (const change of changes) {
    await createCostChangeLog({
      type: 'custom_cost',
      action: change.action,
      oldValue: change.oldValue,
      newValue: change.newValue,
      itemName: change.itemName
    }).catch(err => console.error('⚠️ 로그 실패:', err));
  }
};
```

---

## 변경 이력

- **v1.0** (2025-01-XX): 초기 설계안
- **v2.0** (2025-01-XX): 권한 제어, 필터링 기능, 안정성 강화 추가
- **v2.1** (2025-01-XX): 자동 정리 기능 제거 (영구 보관), 성능 최적화 강화, 감사 로그 시스템 추가, admin/revenue 권한 3 이상 접근 제어 반영

---

## 부록: 주요 변경사항 (v2.0 → v2.1)

### 제거된 기능
- ❌ **자동 정리 배치 작업**: 변경 이력은 감사 추적 목적으로 영구 보관
- ❌ **Circuit Breaker 패턴**: 단순화를 위해 재시도 로직만 유지

### 추가된 기능
- ✅ **영구 보관 정책**: 모든 변경 이력 영구 보존
- ✅ **성능 최적화 강화**: 데이터베이스 인덱싱, 페이지네이션, React.memo
- ✅ **감사 로그 시스템**: AuditLogger 클래스로 중요 작업 기록
- ✅ **이중 확인 다이얼로그**: 자동 메모 삭제 시 2단계 확인

### 권한 정책 명확화
- **admin/revenue 페이지**: 권한 3 이상만 접근 가능 (기존 시스템 정책)
- **일반/업무 메모**: 권한 3 이상만 삭제 가능 (페이지 접근 권한과 동일)
- **자동 메모**: 권한 4만 삭제 가능 (슈퍼 관리자 전용)

---

이 설계안에 대한 의견이나 추가 요구사항이 있으시면 말씀해주세요!
