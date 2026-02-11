# AS 비용 및 커스텀 추가비용 구현 완료 보고서

## ✅ 구현 완료 (2025-02-11)

모든 Phase가 성공적으로 완료되었습니다.

---

## 📋 구현 내역

### Phase 1: 데이터베이스 마이그레이션 ✅

**실행 파일**: `database/add-as-cost-and-custom-costs.sql`

**추가된 컬럼**:
- `as_cost` - DECIMAL(12,2), DEFAULT 0, CHECK >= 0
- `custom_additional_costs` - JSONB, DEFAULT '[]'

**생성된 인덱스**:
- `idx_business_info_as_cost` - Partial index (as_cost > 0)
- `idx_business_info_custom_costs` - GIN index (JSONB)

**검증 스크립트**: `npm run verify-migration`

---

### Phase 2: API 엔드포인트 구현 ✅

**파일**: `app/api/business-info-direct/route.ts`

**추가된 로직** (Line 421-461):

```typescript
// AS 비용 처리
if (updateData.as_cost !== undefined) {
  if (updateData.as_cost === null || updateData.as_cost === '' || updateData.as_cost === undefined) {
    updateObject.as_cost = null;
  } else {
    const numValue = parseInt(updateData.as_cost);
    updateObject.as_cost = isNaN(numValue) || numValue < 0 ? 0 : numValue;
  }
}

// 커스텀 추가비용 처리 (JSONB 배열)
if (updateData.custom_additional_costs !== undefined) {
  if (Array.isArray(updateData.custom_additional_costs)) {
    const validatedCosts = updateData.custom_additional_costs
      .filter((item: any) => {
        return item &&
               typeof item === 'object' &&
               typeof item.name === 'string' &&
               item.name.trim() !== '' &&
               (typeof item.amount === 'number' || typeof item.amount === 'string');
      })
      .map((item: any) => ({
        name: item.name.trim(),
        amount: typeof item.amount === 'number' ? item.amount : parseFloat(item.amount) || 0
      }))
      .filter((item: any) => item.amount >= 0);

    updateObject.custom_additional_costs = JSON.stringify(validatedCosts);
  } else {
    updateObject.custom_additional_costs = '[]';
  }
}
```

**특징**:
- survey_fee_adjustment와 동일한 패턴
- 음수 값 방지
- JSONB 배열 검증

---

### Phase 3: BusinessRevenueModal UI 구현 ✅

**파일**: `components/business/BusinessRevenueModal.tsx`

**추가된 상태 관리** (Line 54-78):
```typescript
// AS 비용 상태
const [isEditingAsCost, setIsEditingAsCost] = useState(false);
const [asCostForm, setAsCostForm] = useState({amount: 0});
const [isSavingAsCost, setIsSavingAsCost] = useState(false);

// 커스텀 추가비용 상태
interface CustomCost {
  name: string;
  amount: number;
}
const [customCosts, setCustomCosts] = useState<CustomCost[]>([]);
const [isAddingCustomCost, setIsAddingCustomCost] = useState(false);
const [newCustomCost, setNewCustomCost] = useState<CustomCost>({name: '', amount: 0});
const [isSavingCustomCost, setIsSavingCustomCost] = useState(false);
const [editingCustomCostIndex, setEditingCustomCostIndex] = useState<number | null>(null);
```

**추가된 핸들러**:
- `handleSaveAsCost()` - AS 비용 저장
- `handleSaveCustomCosts()` - 커스텀 비용 저장
- `handleAddCustomCost()` - 커스텀 항목 추가
- `handleDeleteCustomCost()` - 커스텀 항목 삭제

**추가된 UI 카드**:
1. **AS 비용 카드** (파란색 테마) - Line 1234-1300
   - 직접 입력 방식
   - 0 이상 값만 허용
   - 권한 레벨 2+ 필요

2. **커스텀 추가비용 카드** (주황색 테마) - Line 1302-1391
   - 항목명 + 금액 동적 입력
   - 여러 항목 추가 가능
   - 개별 항목 삭제 가능
   - 일괄 저장 방식

**순이익 계산 공식 업데이트** (Line 1522-1552):
```typescript
{Math.round(Number(displayData.as_cost || 0)) > 0 ? (
  <div className="flex justify-between border-b border-gray-200 pb-2">
    <span>- AS 비용</span>
    <span className="font-bold text-blue-700">-{formatCurrency(Number(displayData.as_cost))}</span>
  </div>
) : null}

{(() => {
  const customCostTotal = (() => {
    let costs: CustomCost[] = [];
    if (displayData.custom_additional_costs) {
      if (typeof displayData.custom_additional_costs === 'string') {
        try {
          costs = JSON.parse(displayData.custom_additional_costs);
        } catch (e) {
          costs = [];
        }
      } else if (Array.isArray(displayData.custom_additional_costs)) {
        costs = displayData.custom_additional_costs;
      }
    }
    return Array.isArray(costs) ? costs.reduce((sum, c) => sum + (Number(c.amount) || 0), 0) : 0;
  })();

  return customCostTotal > 0 ? (
    <div className="flex justify-between border-b border-gray-200 pb-2">
      <span>- 커스텀 추가비용</span>
      <span className="font-bold text-orange-700">-{formatCurrency(customCostTotal)}</span>
    </div>
  ) : null;
})()}
```

---

### Phase 4: Revenue 페이지 순이익 계산 업데이트 ✅

**파일**: `app/api/revenue/calculate/route.ts`

**인터페이스 업데이트** (Line 36-52):
```typescript
interface RevenueCalculationResult {
  // ... 기존 필드들
  as_cost?: number;  // AS 비용
  custom_additional_costs?: any;  // 커스텀 추가비용 (JSONB)
  net_profit: number;
  // ...
}
```

**순이익 계산 로직 업데이트** (Line 540-588):
```typescript
// AS 비용 및 커스텀 추가비용 계산
const asCost = Number(businessInfo.as_cost || 0);

let customCostTotal = 0;
if (businessInfo.custom_additional_costs) {
  try {
    let costs = [];
    if (typeof businessInfo.custom_additional_costs === 'string') {
      costs = JSON.parse(businessInfo.custom_additional_costs);
    } else if (Array.isArray(businessInfo.custom_additional_costs)) {
      costs = businessInfo.custom_additional_costs;
    }
    customCostTotal = Array.isArray(costs)
      ? costs.reduce((sum, item) => sum + (Number(item.amount) || 0), 0)
      : 0;
  } catch (e) {
    console.warn('⚠️ [REVENUE-API] 커스텀 추가비용 파싱 오류:', e);
    customCostTotal = 0;
  }
}

// 최종 순이익 계산
const grossProfit = Math.round(adjustedRevenue - totalCost);
const netProfit = Math.round(
  grossProfit
  - installationExtraCost
  - adjustedSalesCommission
  - totalSurveyCosts
  - totalInstallationCosts
  - asCost              // 🆕 AS 비용 차감
  - customCostTotal     // 🆕 커스텀 추가비용 차감
);
```

**result 객체 업데이트** (Line 605-607):
```typescript
as_cost: asCost,
custom_additional_costs: businessInfo.custom_additional_costs,
net_profit: netProfit,
```

---

### Phase 5: 빌드 및 통합 테스트 ✅

**빌드 결과**: ✅ 성공
```bash
$ npm run build
✓ Generating static pages (91/91)
✓ Finalizing page optimization
✓ Collecting build traces

Route (app)                     Size     First Load JS
├ ○ /admin/revenue             21.3 kB         179 kB
...
```

**타입 검사**: ✅ 통과
**린트**: ✅ 문제 없음

---

## 🎨 UI 배치 (최종)

```
비용 상세내역 섹션
├─ 영업비용 (기존) - 노란색
├─ 영업비용 조정 (기존) - 노란색
├─ 실사비용 (기존) - 흰색
├─ 실사비용 조정 (기존) - 보라색
├─ 🆕 AS 비용 (신규) - 파란색
├─ 🆕 커스텀 추가비용 (신규) - 주황색
├─ 설치비 (기존) - 흰색
└─ 총 비용 합계 (기존) - 회색
```

---

## 📊 데이터 흐름

### 저장 플로우
```
1. 사용자 입력 (BusinessRevenueModal)
   ↓
2. PUT /api/business-info-direct
   - as_cost: number
   - custom_additional_costs: [{name, amount}]
   ↓
3. business_info 테이블 업데이트
   ↓
4. POST /api/revenue/calculate (자동 호출)
   ↓
5. 순이익 재계산 (AS 비용 + 커스텀 비용 차감)
   ↓
6. revenue_calculations 테이블 저장
   ↓
7. 모달 데이터 갱신
   ↓
8. Revenue 페이지 테이블 자동 갱신
```

### 조회 플로우
```
1. BusinessRevenueModal 열기
   ↓
2. business.as_cost, business.custom_additional_costs 로드
   ↓
3. calculatedData.net_profit (재계산된 순이익)
   ↓
4. UI 표시
```

---

## 🔒 보안 및 검증

### 입력 검증
- ✅ AS 비용: 0 이상 숫자만 허용
- ✅ 커스텀 비용 항목명: 빈 문자열 방지
- ✅ 커스텀 비용 금액: 0 이상 숫자만 허용
- ✅ JSONB 배열: 형식 검증 및 정제

### 권한 제어
- ✅ 조회: 권한 레벨 2+
- ✅ 수정: 권한 레벨 2+
- ✅ 삭제: 권한 레벨 2+

### 에러 처리
- ✅ 파싱 오류 시 빈 배열 반환
- ✅ null/undefined 안전 처리
- ✅ 사용자 친화적 에러 메시지

---

## 📝 추가된 파일

1. `database/add-as-cost-and-custom-costs.sql` - 마이그레이션 스크립트
2. `database/MIGRATION_GUIDE_as_cost.md` - 마이그레이션 가이드
3. `scripts/verify-business-info-schema.ts` - 검증 스크립트
4. `claudedocs/DESIGN_as_cost_and_custom_costs.md` - 설계 문서
5. `claudedocs/IMPLEMENTATION_GUIDE_as_cost_and_custom_costs.md` - 구현 가이드
6. `claudedocs/SUMMARY_as_cost_and_custom_costs.md` - 요약 문서
7. `claudedocs/INTEGRATION_REVIEW_FINAL.md` - 통합 검토 보고서
8. `claudedocs/IMPLEMENTATION_COMPLETE_as_cost.md` - 이 문서

---

## 🧪 테스트 시나리오

### 기본 테스트
1. ✅ AS 비용 입력 → 저장 → 순이익 갱신 확인
2. ✅ 커스텀 비용 추가 → 저장 → 순이익 갱신 확인
3. ✅ 커스텀 비용 여러 개 추가 → 저장 → 합계 확인
4. ✅ 커스텀 비용 삭제 → 저장 → 순이익 재계산 확인

### 엣지 케이스
5. ✅ AS 비용 0 입력 → 표시 안됨 확인
6. ✅ 커스텀 비용 빈 항목명 → 입력 방지 확인
7. ✅ 음수 입력 → 0으로 변환 확인
8. ✅ 권한 없는 사용자 → 수정 버튼 미표시 확인

### 통합 테스트
9. ✅ 모달에서 저장 → Revenue 페이지 자동 갱신
10. ✅ 빌드 성공 확인

---

## 🎯 성공 지표

- ✅ 데이터베이스 마이그레이션 성공
- ✅ API 엔드포인트 정상 동작
- ✅ UI 카드 정상 렌더링
- ✅ 순이익 계산 정확성
- ✅ 빌드 에러 없음
- ✅ 타입 검사 통과
- ✅ 기존 기능 영향 없음

---

## 🚀 배포 준비 완료

모든 구현이 완료되었으며 프로덕션 배포가 가능합니다.

**배포 전 체크리스트**:
- [x] 데이터베이스 마이그레이션 실행
- [x] API 엔드포인트 구현
- [x] UI 구현
- [x] 순이익 계산 로직 업데이트
- [x] 빌드 성공
- [ ] 프로덕션 환경에서 테스트
- [ ] 사용자 매뉴얼 작성 (선택)

**다음 단계**: 프로덕션 환경에서 실제 데이터로 테스트
