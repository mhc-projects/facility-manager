# AS 비용 및 커스텀 추가비용 기능 설계

## 📋 요구사항 요약

### 1. AS 비용 항목 추가
- **위치**: admin/revenue 페이지 상세모달 > 비용 상세내역 섹션
- **UI**: 영업비용조정, 실사비용 조정과 동일한 카드 디자인
- **기능**: 직접 입력, 저장, 수정 가능

### 2. 커스텀 추가비용 항목
- **위치**: 동일 섹션
- **UI**: 동일한 카드 디자인
- **기능**: 항목명 + 비용 동적 추가/삭제

### 3. 순이익 계산 반영
- AS 비용과 커스텀 추가비용을 순이익 계산에서 차감
- 계산 공식: `순이익 = 총매출 - 매입 - 영업비용 - 실사비용 - 설치비 - AS비용 - 커스텀추가비용`

### 4. 테이블 동기화
- 상세모달에서 수정 시 admin/revenue 페이지 메인 테이블 자동 업데이트

---

## 🏗️ 시스템 아키텍처

### 데이터 흐름
```
┌─────────────────────────────────────────────────┐
│ BusinessRevenueModal (상세모달)                   │
│                                                 │
│ ┌─────────────────────────────────────────┐   │
│ │ AS 비용 카드                              │   │
│ │ - as_cost: number                       │   │
│ │ - 저장 버튼 → API: /business-info/[id]  │   │
│ └─────────────────────────────────────────┘   │
│                                                 │
│ ┌─────────────────────────────────────────┐   │
│ │ 커스텀 추가비용 카드                       │   │
│ │ - custom_costs: [{name, amount}]        │   │
│ │ - 추가/삭제 버튼                          │   │
│ │ - 저장 버튼 → API: /business-info/[id]  │   │
│ └─────────────────────────────────────────┘   │
│                                                 │
│ ┌─────────────────────────────────────────┐   │
│ │ 순이익 계산 공식 (실시간 업데이트)          │   │
│ │ = 매출 - 비용 - AS비용 - 커스텀비용      │   │
│ └─────────────────────────────────────────┘   │
│                                                 │
│ onClose(dataChanged: true) ────────────────┐   │
└─────────────────────────────────────────────┼───┘
                                              │
                                              ▼
┌─────────────────────────────────────────────────┐
│ Revenue Page (메인 테이블)                       │
│ - 모달 닫힘 감지                                │
│ - refreshBusinessList() 호출                   │
│ - 테이블 자동 갱신                              │
└─────────────────────────────────────────────────┘
```

---

## 🗄️ 데이터베이스 설계

### 1. 기존 테이블 수정: `business_info`

```sql
-- AS 비용 컬럼 추가
ALTER TABLE business_info
ADD COLUMN as_cost DECIMAL(12, 2) DEFAULT 0 COMMENT 'AS 비용';

-- 커스텀 추가비용 JSONB 컬럼 추가
ALTER TABLE business_info
ADD COLUMN custom_additional_costs JSONB DEFAULT '[]' COMMENT '커스텀 추가비용 항목들';

-- 예시 데이터 구조:
-- custom_additional_costs = [
--   {"id": "uuid-1", "name": "특별수당", "amount": 50000},
--   {"id": "uuid-2", "name": "긴급출장비", "amount": 30000}
-- ]
```

### 2. 인덱스 추가 (성능 최적화)
```sql
CREATE INDEX idx_business_info_as_cost ON business_info(as_cost);
CREATE INDEX idx_business_info_custom_costs ON business_info USING GIN (custom_additional_costs);
```

### 3. 마이그레이션 스크립트
```sql
-- 파일: database/migrations/add_as_cost_and_custom_costs.sql

BEGIN;

-- 1. 컬럼 추가
ALTER TABLE business_info
ADD COLUMN IF NOT EXISTS as_cost DECIMAL(12, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS custom_additional_costs JSONB DEFAULT '[]';

-- 2. 기존 데이터 초기화 (NULL 방지)
UPDATE business_info
SET as_cost = 0
WHERE as_cost IS NULL;

UPDATE business_info
SET custom_additional_costs = '[]'::jsonb
WHERE custom_additional_costs IS NULL;

-- 3. 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_business_info_as_cost
ON business_info(as_cost);

CREATE INDEX IF NOT EXISTS idx_business_info_custom_costs
ON business_info USING GIN (custom_additional_costs);

-- 4. 제약조건 추가
ALTER TABLE business_info
ADD CONSTRAINT check_as_cost_non_negative CHECK (as_cost >= 0);

COMMIT;
```

---

## 🎨 UI/UX 설계

### 1. AS 비용 카드 컴포넌트

```tsx
// 위치: BusinessRevenueModal.tsx > 비용 상세내역 섹션

<div className="bg-blue-50 rounded-lg p-4 shadow-sm border-2 border-blue-300">
  <div className="flex items-center justify-between mb-2">
    <span className="text-sm font-medium text-gray-600">🔧 AS 비용</span>
    {!isEditingAsCost && userPermission >= 2 && (
      <button
        onClick={() => setIsEditingAsCost(true)}
        className="text-xs text-blue-600 hover:text-blue-800 font-medium"
      >
        {displayData.as_cost && displayData.as_cost !== 0 ? '수정' : '추가'}
      </button>
    )}
  </div>

  {isEditingAsCost ? (
    <div className="space-y-2">
      <input
        type="number"
        placeholder="AS 비용 (원)"
        value={asCostForm.amount || ''}
        onChange={(e) => setAsCostForm({amount: Number(e.target.value)})}
        className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
        min="0"
      />
      <div className="flex gap-2">
        <button onClick={handleSaveAsCost} className="...">저장</button>
        <button onClick={() => setIsEditingAsCost(false)} className="...">취소</button>
      </div>
    </div>
  ) : (
    <div>
      {displayData.as_cost && displayData.as_cost !== 0 ? (
        <p className="text-xl font-bold text-blue-700">
          {formatCurrency(displayData.as_cost)}
        </p>
      ) : (
        <p className="text-sm text-gray-500">AS 비용 없음</p>
      )}
    </div>
  )}
</div>
```

### 2. 커스텀 추가비용 카드 컴포넌트

```tsx
// 위치: AS 비용 카드 바로 아래

<div className="bg-orange-50 rounded-lg p-4 shadow-sm border-2 border-orange-300">
  <div className="flex items-center justify-between mb-2">
    <span className="text-sm font-medium text-gray-600">➕ 추가비용 항목</span>
    {userPermission >= 2 && (
      <button
        onClick={() => setIsAddingCustomCost(true)}
        className="text-xs text-orange-600 hover:text-orange-800 font-medium"
      >
        항목 추가
      </button>
    )}
  </div>

  {/* 기존 커스텀 비용 목록 */}
  <div className="space-y-2 mb-3">
    {customCosts.map((cost) => (
      <div key={cost.id} className="flex items-center justify-between p-2 bg-white rounded">
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-700">{cost.name}</p>
          <p className="text-xs text-gray-500">{formatCurrency(cost.amount)}</p>
        </div>
        {userPermission >= 2 && (
          <button
            onClick={() => handleDeleteCustomCost(cost.id)}
            className="text-xs text-red-600 hover:text-red-800 ml-2"
          >
            삭제
          </button>
        )}
      </div>
    ))}
  </div>

  {/* 새 항목 추가 폼 */}
  {isAddingCustomCost && (
    <div className="space-y-2 p-3 bg-white rounded border border-orange-200">
      <input
        type="text"
        placeholder="항목명 (예: 긴급출장비)"
        value={newCustomCost.name}
        onChange={(e) => setNewCustomCost({...newCustomCost, name: e.target.value})}
        className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
      />
      <input
        type="number"
        placeholder="금액 (원)"
        value={newCustomCost.amount || ''}
        onChange={(e) => setNewCustomCost({...newCustomCost, amount: Number(e.target.value)})}
        className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
        min="0"
      />
      <div className="flex gap-2">
        <button onClick={handleAddCustomCost} className="...">추가</button>
        <button onClick={() => setIsAddingCustomCost(false)} className="...">취소</button>
      </div>
    </div>
  )}

  {/* 총합 표시 */}
  {customCosts.length > 0 && (
    <div className="mt-3 pt-3 border-t border-orange-200">
      <div className="flex justify-between items-center">
        <span className="text-sm font-medium text-gray-600">추가비용 총합</span>
        <span className="text-lg font-bold text-orange-700">
          {formatCurrency(customCosts.reduce((sum, c) => sum + c.amount, 0))}
        </span>
      </div>
    </div>
  )}
</div>
```

### 3. 순이익 계산 공식 업데이트

```tsx
// 기존 순이익 계산 공식 섹션에 추가

<div className="flex justify-between border-b border-gray-200 pb-2">
  <span>- AS 비용</span>
  <span className="font-bold text-blue-700">
    -{formatCurrency(Number(displayData.as_cost || 0))}
  </span>
</div>

{customCosts.length > 0 && (
  <div className="flex justify-between border-b border-gray-200 pb-2">
    <span>- 추가비용</span>
    <span className="font-bold text-orange-700">
      -{formatCurrency(customCosts.reduce((sum, c) => sum + c.amount, 0))}
    </span>
  </div>
)}

{/* 총 비용 합계 업데이트 */}
<div className="flex justify-between border-t-2 border-blue-400 pt-3">
  <span className="font-bold text-lg">= 순이익</span>
  <span className={`font-bold text-lg ${calculatedNetProfit >= 0 ? 'text-blue-700' : 'text-red-700'}`}>
    {formatCurrency(calculatedNetProfit)}
  </span>
</div>
```

---

## 💻 구현 상세

### 1. 상태 관리 (BusinessRevenueModal.tsx)

```tsx
// AS 비용 상태
const [isEditingAsCost, setIsEditingAsCost] = useState(false);
const [asCostForm, setAsCostForm] = useState<{amount: number}>({amount: 0});
const [isSavingAsCost, setIsSavingAsCost] = useState(false);

// 커스텀 추가비용 상태
interface CustomCost {
  id: string;
  name: string;
  amount: number;
}

const [customCosts, setCustomCosts] = useState<CustomCost[]>([]);
const [isAddingCustomCost, setIsAddingCustomCost] = useState(false);
const [newCustomCost, setNewCustomCost] = useState<{name: string; amount: number}>({
  name: '',
  amount: 0
});

// 순이익 계산 (실시간)
const calculatedNetProfit = useMemo(() => {
  const revenue = Number(displayData.total_revenue || 0);
  const totalCost = Number(displayData.total_cost || 0);
  const salesCommission = Number(displayData.adjusted_sales_commission || displayData.sales_commission || 0);
  const surveyCosts = Number(displayData.survey_costs || 0);
  const installationCosts = Number(displayData.installation_costs || 0);
  const additionalInstallation = Number(displayData.additional_installation_revenue || 0);
  const asCost = Number(displayData.as_cost || 0);
  const customCostTotal = customCosts.reduce((sum, c) => sum + c.amount, 0);

  return revenue - totalCost - salesCommission - surveyCosts - installationCosts - additionalInstallation - asCost - customCostTotal;
}, [displayData, customCosts]);
```

### 2. API 핸들러

```tsx
// AS 비용 저장
const handleSaveAsCost = async () => {
  if (!business?.id) return;
  setIsSavingAsCost(true);

  try {
    const response = await fetch(`/api/business-info/${business.id}`, {
      method: 'PATCH',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({as_cost: asCostForm.amount})
    });

    if (!response.ok) throw new Error('AS 비용 저장 실패');

    // 데이터 새로고침
    await refreshCalculation();
    setIsEditingAsCost(false);

    toast.success('AS 비용이 저장되었습니다.');
  } catch (error) {
    console.error('AS 비용 저장 오류:', error);
    toast.error('AS 비용 저장에 실패했습니다.');
  } finally {
    setIsSavingAsCost(false);
  }
};

// 커스텀 비용 추가
const handleAddCustomCost = async () => {
  if (!business?.id || !newCustomCost.name || newCustomCost.amount <= 0) {
    toast.error('항목명과 금액을 올바르게 입력해주세요.');
    return;
  }

  try {
    const newCost: CustomCost = {
      id: crypto.randomUUID(),
      name: newCustomCost.name,
      amount: newCustomCost.amount
    };

    const updatedCosts = [...customCosts, newCost];

    const response = await fetch(`/api/business-info/${business.id}`, {
      method: 'PATCH',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({custom_additional_costs: updatedCosts})
    });

    if (!response.ok) throw new Error('추가비용 저장 실패');

    setCustomCosts(updatedCosts);
    setNewCustomCost({name: '', amount: 0});
    setIsAddingCustomCost(false);
    await refreshCalculation();

    toast.success('추가비용이 등록되었습니다.');
  } catch (error) {
    console.error('추가비용 저장 오류:', error);
    toast.error('추가비용 저장에 실패했습니다.');
  }
};

// 커스텀 비용 삭제
const handleDeleteCustomCost = async (costId: string) => {
  if (!business?.id) return;

  try {
    const updatedCosts = customCosts.filter(c => c.id !== costId);

    const response = await fetch(`/api/business-info/${business.id}`, {
      method: 'PATCH',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({custom_additional_costs: updatedCosts})
    });

    if (!response.ok) throw new Error('추가비용 삭제 실패');

    setCustomCosts(updatedCosts);
    await refreshCalculation();

    toast.success('추가비용이 삭제되었습니다.');
  } catch (error) {
    console.error('추가비용 삭제 오류:', error);
    toast.error('추가비용 삭제에 실패했습니다.');
  }
};
```

### 3. API 엔드포인트 수정

```tsx
// 파일: app/api/business-info/[id]/route.ts

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { as_cost, custom_additional_costs } = body;

    const updates: any = {};

    if (as_cost !== undefined) {
      updates.as_cost = as_cost;
    }

    if (custom_additional_costs !== undefined) {
      updates.custom_additional_costs = custom_additional_costs;
    }

    const { data, error } = await supabase
      .from('business_info')
      .update(updates)
      .eq('id', params.id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error) {
    console.error('Business info update error:', error);
    return NextResponse.json(
      { error: 'Failed to update business info' },
      { status: 500 }
    );
  }
}
```

### 4. Revenue 페이지 순이익 계산 업데이트

```tsx
// 파일: app/admin/revenue/page.tsx

// 순이익 계산 로직 업데이트
const calculatedNetProfit = (() => {
  const revenue = Number(business.total_revenue || 0);
  const totalCost = Number(business.total_cost || 0);
  const salesCommission = Number(business.adjusted_sales_commission || business.sales_commission || 0);
  const surveyCosts = Number(business.survey_costs || 0);
  const installationCosts = Number(business.installation_costs || 0);
  const additionalInstallation = Number(business.additional_installation_revenue || 0);

  // 🆕 AS 비용 추가
  const asCost = Number(business.as_cost || 0);

  // 🆕 커스텀 추가비용 총합 계산
  const customCosts = business.custom_additional_costs || [];
  const customCostTotal = Array.isArray(customCosts)
    ? customCosts.reduce((sum: number, c: any) => sum + (Number(c.amount) || 0), 0)
    : 0;

  return revenue - totalCost - salesCommission - surveyCosts - installationCosts - additionalInstallation - asCost - customCostTotal;
})();
```

---

## 🔄 데이터 동기화 흐름

```
1. 사용자가 상세모달에서 AS 비용 입력/수정
   ↓
2. handleSaveAsCost() 실행
   ↓
3. PATCH /api/business-info/[id] { as_cost: value }
   ↓
4. Database UPDATE
   ↓
5. refreshCalculation() 호출 → 모달 데이터 갱신
   ↓
6. 순이익 계산 자동 업데이트 (useMemo)
   ↓
7. 모달 닫기 → onClose(dataChanged: true)
   ↓
8. Revenue 페이지에서 감지 → refreshBusinessList()
   ↓
9. 메인 테이블 자동 갱신
```

---

## ✅ 체크리스트

### Phase 1: 데이터베이스 마이그레이션
- [ ] `database/migrations/add_as_cost_and_custom_costs.sql` 생성
- [ ] 마이그레이션 실행 및 검증
- [ ] 기존 데이터 NULL 방지 처리 확인

### Phase 2: API 엔드포인트 구현
- [ ] `/api/business-info/[id]` PATCH 메서드 업데이트
- [ ] as_cost 필드 처리 로직 추가
- [ ] custom_additional_costs JSONB 처리 로직 추가
- [ ] 에러 핸들링 및 검증 로직 추가

### Phase 3: BusinessRevenueModal UI 구현
- [ ] AS 비용 카드 컴포넌트 추가
- [ ] 커스텀 추가비용 카드 컴포넌트 추가
- [ ] 상태 관리 (useState) 추가
- [ ] API 핸들러 함수 구현
- [ ] 순이익 계산 로직 업데이트 (useMemo)
- [ ] 순이익 계산 공식 UI 업데이트

### Phase 4: Revenue 페이지 동기화
- [ ] 순이익 계산 로직에 AS 비용 반영
- [ ] 순이익 계산 로직에 커스텀 추가비용 반영
- [ ] 모달 닫힘 감지 및 테이블 갱신 확인

### Phase 5: 테스트
- [ ] AS 비용 추가/수정/삭제 테스트
- [ ] 커스텀 추가비용 추가/삭제 테스트
- [ ] 순이익 계산 정확성 검증
- [ ] 테이블 동기화 확인
- [ ] 권한 레벨 검증 (level 2+ 필요)
- [ ] 에러 케이스 테스트

---

## 📊 예상 영향 분석

### 변경 파일 목록
1. `database/migrations/add_as_cost_and_custom_costs.sql` (신규)
2. `app/api/business-info/[id]/route.ts` (수정)
3. `components/business/BusinessRevenueModal.tsx` (수정)
4. `app/admin/revenue/page.tsx` (수정)

### 데이터베이스 영향
- `business_info` 테이블에 2개 컬럼 추가
- 인덱스 2개 추가
- 기존 데이터 무결성 유지

### 성능 영향
- JSONB 컬럼 사용으로 유연한 데이터 구조
- GIN 인덱스로 JSONB 쿼리 최적화
- 순이익 계산은 클라이언트 사이드에서 실시간 계산 (DB 부하 없음)

### 호환성
- 기존 기능에 영향 없음 (새 컬럼은 DEFAULT 값 설정)
- 기존 순이익 계산 로직과 자연스럽게 통합

---

## 🎯 구현 우선순위

### High Priority (필수)
1. 데이터베이스 마이그레이션
2. AS 비용 카드 구현
3. 순이익 계산 로직 업데이트
4. API 엔드포인트 수정

### Medium Priority (중요)
5. 커스텀 추가비용 카드 구현
6. Revenue 페이지 동기화
7. 에러 핸들링 및 토스트 메시지

### Low Priority (선택)
8. UI 애니메이션 효과
9. 통계 차트에 반영
10. 히스토리 로깅

---

## 🔐 보안 고려사항

1. **권한 검증**: 권한 레벨 2 이상만 수정 가능
2. **입력 검증**: 금액 음수 방지, 항목명 길이 제한
3. **SQL Injection 방지**: Supabase ORM 사용
4. **CSRF 방지**: Next.js 기본 보안 정책 활용

---

## 📝 추가 고려사항

1. **히스토리 추적**: 비용 변경 이력 로깅 (선택사항)
2. **알림 기능**: 비용 추가 시 관리자 알림 (선택사항)
3. **엑셀 내보내기**: 커스텀 비용 항목 포함 (선택사항)
4. **통계 대시보드**: AS 비용 트렌드 분석 (선택사항)

---

## 🚀 배포 계획

### 1. 개발 환경 테스트
- 로컬 데이터베이스 마이그레이션
- 기능 구현 및 단위 테스트
- 통합 테스트

### 2. 스테이징 환경 배포
- 스테이징 DB 마이그레이션
- E2E 테스트
- 사용자 시나리오 검증

### 3. 프로덕션 배포
- 프로덕션 DB 백업
- 마이그레이션 실행
- 배포 후 모니터링
- 롤백 계획 준비

---

## 📚 참고 자료

- 기존 영업비용 조정 구현: `BusinessRevenueModal.tsx` line 783-886
- 기존 실사비용 조정 구현: `BusinessRevenueModal.tsx` line 951-1028
- 순이익 계산 로직: `BusinessRevenueModal.tsx` line 1078-1138
- Revenue 페이지 계산: `app/admin/revenue/page.tsx`
