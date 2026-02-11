# AS 비용 및 커스텀 추가비용 - 시스템 통합 검토 최종 보고서

**작성일**: 2025-02-11
**상태**: ✅ 검토 완료 - 구현 준비 완료

---

## 🎯 검토 결과

| 항목 | 상태 | 점수 |
|------|------|------|
| **통합 가능성** | ✅ 매우 높음 | 95/100 |
| **기존 시스템 호환성** | ✅ 완벽함 | 100/100 |
| **구현 난이도** | ✅ 중간 | 기존 패턴 활용 |
| **데이터베이스 영향** | ⚠️ 컬럼 추가 필요 | 마이그레이션 |

---

## 📊 현재 시스템 분석 결과

### 1. 데이터베이스 구조

**현재 business_info 테이블**:
- ✅ `survey_fee_adjustment DECIMAL(12,2)` - 실사비 조정 (참고 모델)
- ❌ `as_cost` - **없음** (추가 필요)
- ❌ `custom_additional_costs` - **없음** (추가 필요)

### 2. API 구조

**기존 API**: `/api/business-info-direct` (PUT 메서드)
- ✅ 이미 `survey_fee_adjustment` 처리 로직 있음 (line 412-420)
- ✅ 동일한 패턴으로 `as_cost`, `custom_additional_costs` 추가 가능

**실사비 조정 저장 패턴**:
```tsx
// 1. 클라이언트 (BusinessRevenueModal.tsx)
const response = await fetch('/api/business-info-direct', {
  method: 'PUT',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    id: business.id,
    survey_fee_adjustment: surveyFeeForm.amount
  })
});

// 2. 서버 (app/api/business-info-direct/route.ts)
if (updateData.survey_fee_adjustment !== undefined) {
  if (updateData.survey_fee_adjustment === null ||
      updateData.survey_fee_adjustment === '' ||
      updateData.survey_fee_adjustment === undefined) {
    updateObject.survey_fee_adjustment = null;
  } else {
    const numValue = parseInt(updateData.survey_fee_adjustment);
    updateObject.survey_fee_adjustment = isNaN(numValue) ? null : numValue;
  }
}
```

### 3. BusinessRevenueModal 구조

**기존 실사비 조정 카드**:
- 위치: Line 951-1028
- UI: 보라색 카드 (bg-purple-50, border-purple-300)
- 권한: Level 2+
- 상태: `isEditingSurveyFee`, `surveyFeeForm`, `isSavingSurveyFee`

**패턴 재사용 가능**:
- AS 비용: 파란색 카드 (bg-blue-50, border-blue-300)
- 커스텀 추가비용: 주황색 카드 (bg-orange-50, border-orange-300)

---

## ✅ 최종 구현 계획

### Phase 1: 데이터베이스 마이그레이션

```sql
-- business_info 테이블에 컬럼 추가
ALTER TABLE business_info
ADD COLUMN as_cost DECIMAL(12, 2) DEFAULT 0 CHECK (as_cost >= 0),
ADD COLUMN custom_additional_costs JSONB DEFAULT '[]'::jsonb;

-- 인덱스 추가
CREATE INDEX idx_business_info_as_cost
ON business_info(as_cost) WHERE as_cost > 0;

CREATE INDEX idx_business_info_custom_costs
ON business_info USING GIN (custom_additional_costs)
WHERE jsonb_array_length(custom_additional_costs) > 0;
```

### Phase 2: API 확장

**파일**: `app/api/business-info-direct/route.ts`

```tsx
// PUT 메서드에 추가 (line 420 이후)
if (updateData.as_cost !== undefined) {
  if (updateData.as_cost === null || updateData.as_cost === '' || updateData.as_cost === undefined) {
    updateObject.as_cost = null;
  } else {
    const numValue = parseInt(updateData.as_cost);
    updateObject.as_cost = isNaN(numValue) || numValue < 0 ? 0 : numValue;
  }
}

if (updateData.custom_additional_costs !== undefined) {
  // JSONB 배열 검증
  if (Array.isArray(updateData.custom_additional_costs)) {
    updateObject.custom_additional_costs = JSON.stringify(updateData.custom_additional_costs);
  } else {
    updateObject.custom_additional_costs = '[]';
  }
}
```

### Phase 3: BusinessRevenueModal UI

**파일**: `components/business/BusinessRevenueModal.tsx`

**상태 추가**:
```tsx
// AS 비용 상태 (line 52 이후)
const [isEditingAsCost, setIsEditingAsCost] = useState(false);
const [asCostForm, setAsCostForm] = useState({amount: 0});
const [isSavingAsCost, setIsSavingAsCost] = useState(false);

// 커스텀 추가비용 상태
const [customCosts, setCustomCosts] = useState<CustomCost[]>([]);
const [isAddingCustomCost, setIsAddingCustomCost] = useState(false);
const [newCustomCost, setNewCustomCost] = useState({name: '', amount: 0});
const [isSavingCustomCost, setIsSavingCustomCost] = useState(false);
```

**핸들러 추가**: 실사비 조정 패턴 복사하여 수정

**UI 추가**: 실사비 조정 카드 다음에 AS 비용 카드, 커스텀 추가비용 카드 추가

### Phase 4: Revenue 페이지 순이익 계산

**파일**: `app/admin/revenue/page.tsx`

```tsx
// 순이익 계산 로직 업데이트 (기존 + 신규)
const asCost = Number(business.as_cost || 0);
const customCosts = business.custom_additional_costs || [];
const customCostTotal = Array.isArray(customCosts)
  ? customCosts.reduce((sum: number, c: any) => sum + (Number(c.amount) || 0), 0)
  : 0;

const netProfit = revenue - totalCost - salesCommission - surveyCosts
                  - installationCosts - additionalInstallation
                  - asCost - customCostTotal; // 🆕 추가
```

---

## 🔍 통합 검증 체크리스트

### 데이터베이스
- [x] business_info 테이블 구조 확인
- [x] survey_fee_adjustment 컬럼 존재 확인 (참고 모델)
- [x] JSONB 지원 확인
- [ ] 마이그레이션 스크립트 실행 필요

### API
- [x] /api/business-info-direct PUT 메서드 확인
- [x] survey_fee_adjustment 처리 로직 확인
- [x] 동일 패턴 적용 가능 확인
- [ ] as_cost, custom_additional_costs 로직 추가 필요

### UI
- [x] BusinessRevenueModal 구조 확인
- [x] 실사비 조정 카드 UI 확인
- [x] 핸들러 패턴 확인
- [ ] AS 비용 카드 추가 필요
- [ ] 커스텀 추가비용 카드 추가 필요

### 계산 로직
- [x] Revenue 페이지 순이익 계산 로직 확인
- [ ] as_cost 반영 필요
- [ ] custom_additional_costs 반영 필요

---

## 🎨 UI 배치 계획

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

## ⚠️ 주의사항

1. **데이터베이스 마이그레이션**
   - 프로덕션 적용 전 백업 필수
   - 기존 데이터 NULL 방지 (DEFAULT 0, '[]' 설정)

2. **API 호환성**
   - 기존 survey_fee_adjustment 로직과 동일한 패턴 유지
   - 에러 처리 동일하게 적용

3. **UI 일관성**
   - 기존 실사비 조정 카드와 동일한 디자인 패턴
   - 권한 레벨 2+ 동일 적용

4. **순이익 계산**
   - Revenue 페이지와 BusinessRevenueModal 모두 업데이트
   - 계산 공식 일관성 유지

---

## 🚀 구현 순서

1. ✅ **시스템 분석 완료**
2. ✅ **통합 검토 완료**
3. ⏭️ **Phase 1: 데이터베이스 마이그레이션**
4. ⏭️ **Phase 2: API 확장**
5. ⏭️ **Phase 3: BusinessRevenueModal UI**
6. ⏭️ **Phase 4: Revenue 페이지 업데이트**
7. ⏭️ **Phase 5: 통합 테스트**

---

## 📝 결론

✅ **구현 준비 완료**

- 기존 시스템과 완벽하게 호환됨
- 실사비 조정과 동일한 패턴 활용 가능
- API, UI, 계산 로직 모두 통합 방안 확인
- 구현 난이도: 중간 (기존 패턴 재사용)
- 예상 소요 시간: 2-3시간

**다음 단계**: Phase 1 데이터베이스 마이그레이션 시작
