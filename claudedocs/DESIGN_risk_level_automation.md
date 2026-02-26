# 위험도(receivable_risk) 자동화 설계 문서

**작성일**: 2026-02-26
**대상 페이지**: `app/admin/revenue/page.tsx`
**관련 API**: `app/api/business-risk/[id]/route.ts`

---

## 1. 요구사항 요약

### 자동 계산 로직
- 오늘 날짜 기준, 설치일(`installation_date`)로부터 경과한 기간에 따라 위험도 자동 결정
  - 1개월 이상 경과 → **하** (녹색)
  - 2개월 이상 경과 → **중** (노랑)
  - 3개월 이상 경과 → **상** (빨강)
  - 1개월 미만 → null (표시 안 함 또는 기본값)

### 수동 변경 우선순위
- 사용자가 수동으로 위험도를 변경하면 **자동화 완전 비활성화**
- 수동 설정된 항목은 날짜가 경과해도 자동으로 바뀌지 않음
- 사용자가 수동으로 다시 null로 설정하면 자동화 재개

### UI 구분 표시
- 자동 계산된 항목과 수동 변경된 항목을 시각적으로 구분 표시

---

## 2. 데이터베이스 변경

### 신규 컬럼 추가: `risk_is_manual`

```sql
-- Migration: add risk_is_manual column
ALTER TABLE business_info
ADD COLUMN risk_is_manual BOOLEAN NOT NULL DEFAULT false;

-- 기존 receivable_risk가 있는 레코드는 수동 설정으로 간주
UPDATE business_info
SET risk_is_manual = true
WHERE receivable_risk IS NOT NULL;

COMMENT ON COLUMN business_info.risk_is_manual IS
  '위험도 수동 설정 여부. true이면 자동화 비활성화, false이면 installation_date 기준 자동 계산';
```

### 기존 컬럼 유지
- `receivable_risk VARCHAR(2)` — 수동 설정 시 실제 값 저장 (자동 계산 값은 DB에 저장하지 않음)
- `installation_date DATE` — 자동 계산의 기준 날짜

---

## 3. 프론트엔드 로직 변경

### 3-1. 자동 계산 함수 추가

```typescript
/**
 * 설치일로부터 오늘까지 경과한 월 수를 기반으로 위험도를 자동 계산
 * 수동 설정된 경우에는 null 반환 (수동 값 우선)
 */
function calcAutoRisk(
  installationDate: string | null | undefined
): '상' | '중' | '하' | null {
  if (!installationDate) return null;

  const install = new Date(installationDate);
  const today = new Date();

  // 경과 월 수 계산 (소수점 포함)
  const monthsElapsed =
    (today.getFullYear() - install.getFullYear()) * 12 +
    (today.getMonth() - install.getMonth()) +
    (today.getDate() >= install.getDate() ? 0 : -1); // 일 수 보정

  if (monthsElapsed >= 3) return '상';
  if (monthsElapsed >= 2) return '중';
  if (monthsElapsed >= 1) return '하';
  return null;
}

/**
 * 실제 표시할 위험도 결정
 * - 수동 설정(risk_is_manual=true): 저장된 receivable_risk 값 사용
 * - 자동(risk_is_manual=false): 설치일 기준 계산
 */
function getEffectiveRisk(business: BusinessInfo): {
  risk: '상' | '중' | '하' | null;
  isManual: boolean;
} {
  if (business.risk_is_manual) {
    return { risk: business.receivable_risk ?? null, isManual: true };
  }
  return { risk: calcAutoRisk(business.installation_date), isManual: false };
}
```

### 3-2. riskMap 초기화 변경

현재 `loadBusinesses()`에서 riskMap을 DB 값으로만 초기화하는 부분을:

```typescript
// 변경 전
const initialRiskMap: Record<string, string | null> = {};
for (const b of businessData) {
  if (b.receivable_risk !== undefined) {
    initialRiskMap[b.id] = b.receivable_risk ?? null;
  }
}
setRiskMap(initialRiskMap);
```

```typescript
// 변경 후 — 자동 계산 포함
const initialRiskMap: Record<string, string | null> = {};
const initialManualMap: Record<string, boolean> = {};
for (const b of businessData) {
  const { risk, isManual } = getEffectiveRisk(b);
  initialRiskMap[b.id] = risk;
  initialManualMap[b.id] = isManual;
}
setRiskMap(initialRiskMap);
setRiskIsManualMap(initialManualMap); // 신규 state
```

### 3-3. 신규 state 추가

```typescript
// 수동 설정 여부 추적 (businessId → isManual)
const [riskIsManualMap, setRiskIsManualMap] = useState<Record<string, boolean>>({});
```

### 3-4. handleRiskUpdate 변경

```typescript
const handleRiskUpdate = (businessId: string, risk: '상' | '중' | '하' | null) => {
  const previousRisk = riskMap[businessId] ?? null;
  const previousIsManual = riskIsManualMap[businessId] ?? false;

  // 수동 설정: risk !== null이면 수동, null이면 수동 해제(자동화 재개)
  const isManual = risk !== null;
  const effectiveRisk = isManual ? risk : calcAutoRisk(
    businesses.find(b => b.id === businessId)?.installation_date
  );

  // 낙관적 업데이트
  setRiskMap(prev => ({ ...prev, [businessId]: effectiveRisk }));
  setRiskIsManualMap(prev => ({ ...prev, [businessId]: isManual }));

  CacheManager.updateBusinessField(businessId, 'risk', effectiveRisk);
  CacheManager.broadcastFieldUpdate(businessId, 'risk', effectiveRisk);

  // API: receivable_risk + risk_is_manual 함께 저장
  fetch(`/api/business-risk/${businessId}`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    body: JSON.stringify({ risk, is_manual: isManual }),
  }).then(response => {
    if (!response.ok) throw new Error('위험도 업데이트 실패');
  }).catch(error => {
    console.error('[handleRiskUpdate] 오류:', error);
    // 롤백
    setRiskMap(prev => ({ ...prev, [businessId]: previousRisk }));
    setRiskIsManualMap(prev => ({ ...prev, [businessId]: previousIsManual }));
    CacheManager.updateBusinessField(businessId, 'risk', previousRisk);
    CacheManager.broadcastFieldUpdate(businessId, 'risk', previousRisk);
  });
};
```

### 3-5. UI 구분 표시

위험도 버튼 렌더링 부분에서 수동 여부에 따라 시각적 구분:

```tsx
{/* 위험도 표시 — 자동(🤖) vs 수동(✏️) 구분 */}
const isManual = riskIsManualMap[business.id] ?? false;

<div className="flex items-center gap-1">
  {/* 자동/수동 표시 아이콘 */}
  {currentRisk && (
    <span
      title={isManual ? '수동 설정됨 (자동화 비활성화)' : '자동 계산됨'}
      className="text-xs text-gray-400"
    >
      {isManual ? '✏️' : '🔄'}
    </span>
  )}

  {/* 상/중/하 버튼 — 기존 스타일 유지 */}
  {['상', '중', '하'].map(level => (
    <button
      key={level}
      onClick={() => handleRiskUpdate(
        business.id,
        currentRisk === level ? null : level as '상' | '중' | '하'
      )}
      className={/* ... 기존 className 로직 ... */}
    >
      {level}
    </button>
  ))}
</div>
```

**아이콘 의미**:
- `🔄` — 자동 계산 중 (설치일 기준)
- `✏️` — 수동 설정됨 (자동화 비활성화)

---

## 4. API 변경

### PATCH /api/business-risk/[id]

**Request Body 변경**:
```typescript
// 변경 전
{ risk: '상' | '중' | '하' | null }

// 변경 후
{
  risk: '상' | '중' | '하' | null,
  is_manual: boolean
}
```

**DB 업데이트 변경**:
```sql
-- 변경 전
UPDATE business_info
SET receivable_risk = $1, updated_at = NOW()
WHERE id = $2 AND is_deleted = false

-- 변경 후
UPDATE business_info
SET
  receivable_risk = $1,  -- null이면 NULL 저장 (자동화 재개 시)
  risk_is_manual = $2,   -- true=수동, false=자동화 재개
  updated_at = NOW()
WHERE id = $2 AND is_deleted = false
RETURNING id, business_name, receivable_risk, risk_is_manual
```

**비즈니스 로직**:
- `is_manual = false` + `risk = null` → 수동 해제, 자동화 재개 (DB에 NULL 저장)
- `is_manual = true` + `risk = '상'|'중'|'하'` → 수동 설정 (DB에 값 저장)
- 자동 계산 값은 **DB에 저장하지 않음** (프론트에서만 계산)

---

## 5. business-info-direct API 변경

`/api/business-info-direct`에서 `risk_is_manual` 컬럼도 함께 조회:

```sql
-- 변경 전 SELECT
SELECT ..., receivable_risk, ...

-- 변경 후 SELECT
SELECT ..., receivable_risk, risk_is_manual, ...
```

---

## 6. 타입 정의 변경

```typescript
// 변경 전
interface BusinessInfo {
  receivable_risk: '상' | '중' | '하' | null;
  // ...
}

// 변경 후
interface BusinessInfo {
  receivable_risk: '상' | '중' | '하' | null;  // 수동 설정 시에만 값 존재
  risk_is_manual: boolean;                       // 수동 설정 여부
  installation_date: string | null;              // 자동 계산 기준 (이미 존재)
  // ...
}
```

---

## 7. 구현 순서 (권장)

1. **DB Migration** — `risk_is_manual` 컬럼 추가 SQL 실행
2. **API 변경** — `business-risk/[id]/route.ts` — `risk_is_manual` 파라미터 처리
3. **business-info-direct API** — `risk_is_manual` SELECT에 추가
4. **타입 정의** — BusinessInfo 인터페이스에 `risk_is_manual` 추가
5. **프론트엔드** — `calcAutoRisk`, `getEffectiveRisk` 함수 추가
6. **프론트엔드** — `riskIsManualMap` state 추가 및 초기화 로직 변경
7. **프론트엔드** — `handleRiskUpdate` 변경
8. **프론트엔드** — UI 구분 아이콘 추가

---

## 8. 경계 조건 및 예외 처리

| 상황 | 처리 방법 |
|------|----------|
| 설치일이 NULL | 위험도 표시 안 함 (null) |
| 설치일 미래 날짜 | 경과 월 음수 → null 처리 |
| 수동 설정 후 null 클릭 | `is_manual=false` 저장, 자동화 재개 |
| API 실패 | 낙관적 업데이트 롤백 (기존 방식 유지) |
| 기존 receivable_risk 데이터 | Migration으로 `risk_is_manual=true` 설정 |

---

## 9. 영향받는 파일 목록

| 파일 | 변경 유형 |
|------|---------|
| `sql/add_risk_is_manual.sql` | 신규 (Migration SQL) |
| `app/api/business-risk/[id]/route.ts` | 수정 (is_manual 처리) |
| `app/api/business-info-direct/route.ts` | 수정 (risk_is_manual SELECT 추가) |
| `app/admin/revenue/page.tsx` | 수정 (자동 계산 로직, UI) |
| `types/` 또는 인라인 타입 | 수정 (BusinessInfo 인터페이스) |
