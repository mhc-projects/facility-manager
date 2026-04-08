# 설치비 예측마감 시스템 - 최종 요구사항 명세서

> 작성일: 2026-04-07
> 최종 수정: 2026-04-07 (아키텍처 리뷰 반영)
> 상태: 확정 (개발 착수 가능)

---

## 1. 시스템 개요

### 1.1 정의
**예측마감**: 설치가 완료되지 않았어도 발주일이 있는 사업장에 대해 계산된 설치비를 은결(외주 설치업체)에 미리 지급하는 행위

### 1.2 핵심 규칙 (확정)

| 항목 | 확정 내용 |
|------|----------|
| 귀속 월 기준 | 발주일(`order_date`)이 속한 월 |
| 예측마감 지급 항목 | 기본설치비 + 추가공사비 + 추가설치비(해당 시점에 기록된 경우만) |
| 추가설치비 특성 | 설치 중 부족분 추가 요청 금액 → 예측마감 시점에 대부분 미기록 |
| 은결 송금 방식 | 월 일괄 송금 |
| 본마감 트리거 | 설치완료(`installation_date` 입력) 시 자동 + 개별 마감월 지정 가능. **예측마감 없이 독립 작동** |
| 발주 취소 시 | 차기 월 차감 방식 |
| 접근 권한 | `permission_level >= 3` |
| 엑셀 포함 | 매출관리 엑셀에 설치비 지급 정보 포함 |

---

## 2. 데이터 모델

### 2.1 `installation_payments` (설치비 지급 이력) -- 신규

```sql
CREATE TABLE installation_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES business_info(id) ON DELETE RESTRICT,
  -- RESTRICT: 지급 이력이 있는 사업장은 삭제 불가 (회계 기록 보존)
  
  -- 마감 유형
  payment_type VARCHAR(20) NOT NULL CHECK (payment_type IN ('forecast', 'final', 'adjustment')),
  -- forecast: 예측마감, final: 본마감, adjustment: 차액 정산/환수
  
  -- 비용 항목
  payment_category VARCHAR(30) NOT NULL CHECK (payment_category IN (
    'base_installation',        -- 기본설치비
    'additional_construction',  -- 추가공사비
    'extra_installation'        -- 추가설치비
  )),
  
  -- 금액
  calculated_amount NUMERIC(12,0) NOT NULL DEFAULT 0,  -- 시스템 계산 금액 (스냅샷)
  actual_amount NUMERIC(12,0) NOT NULL DEFAULT 0,      -- 실제 지급 금액
  
  -- 계산 스냅샷 (차액 원인 추적용)
  snapshot_data JSONB,  -- 계산 시점의 입력값 기록
  -- 예: {
  --   "equipment_breakdown": {"ph_meter": {"qty": 2, "unit_price": 50000}},
  --   "additional_cost": 200000,
  --   "installation_extra_cost": 0,
  --   "price_version": "2026-01-01",
  --   "calculated_at": "2026-04-07T10:00:00Z"
  -- }
  
  -- 시점
  payment_month VARCHAR(7) NOT NULL CHECK (payment_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),  -- 귀속 월 (예: '2026-04')
  payment_date DATE,                      -- 실제 지급일
  
  -- 연결
  transfer_id UUID REFERENCES eungyeol_transfers(id),  -- 은결 송금건 연결
  
  -- 상태
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',    -- 지급 대기
    'paid',       -- 지급 완료
    'adjusted',   -- 조정됨 (차액 정산)
    'cancelled',  -- 취소됨
    'deducted'    -- 차기 월 차감 처리됨
  )),
  
  -- 메타
  amount_diff_reason TEXT,  -- 계산액 ≠ 실제 지급액일 때 사유
  notes TEXT,
  created_by UUID REFERENCES employees(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 중복 방지: 활성 상태 레코드만 유니크 (cancelled/deducted 제외)
-- → 발주 취소 후 재발주, 동일 월 재처리 허용
CREATE UNIQUE INDEX idx_ip_unique_active 
  ON installation_payments (business_id, payment_type, payment_category, payment_month) 
  WHERE status NOT IN ('cancelled', 'deducted');

-- 인덱스
CREATE INDEX idx_ip_business ON installation_payments(business_id);
CREATE INDEX idx_ip_month_type ON installation_payments(payment_month, payment_type);  -- 월별 조회 최적화
CREATE INDEX idx_ip_month_status ON installation_payments(payment_month, status);       -- 월별 통계 최적화
CREATE INDEX idx_ip_business_created ON installation_payments(business_id, created_at DESC);  -- 이력 조회
CREATE INDEX idx_ip_transfer ON installation_payments(transfer_id);
```

### 2.2 `eungyeol_transfers` (은결 월별 송금 기록) -- 신규

```sql
CREATE TABLE eungyeol_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  transfer_date DATE NOT NULL,              -- 송금일
  transfer_amount NUMERIC(12,0) NOT NULL,   -- 총 송금 금액
  bank_reference VARCHAR(100),              -- 이체 참조번호/적요
  payment_month VARCHAR(7) NOT NULL CHECK (payment_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',      -- 송금 예정
    'transferred',  -- 송금 완료
    'reconciled'    -- 대사 완료 (개별 건과 금액 매칭 확인)
  )),
  
  -- 대사 정보: matched_amount는 저장하지 않고 installation_payments에서 실시간 집계
  -- SELECT COALESCE(SUM(actual_amount), 0) FROM installation_payments WHERE transfer_id = ?
  
  notes TEXT,
  created_by UUID REFERENCES employees(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_et_month ON eungyeol_transfers(payment_month);
```

### 2.3 `closing_records` (월별 마감 기록) -- 신규

```sql
CREATE TABLE closing_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  closing_month VARCHAR(7) NOT NULL,        -- '2026-04'
  closing_type VARCHAR(20) NOT NULL CHECK (closing_type IN ('forecast', 'final')),
  
  status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN (
    'open',      -- 마감 진행 중
    'closed',    -- 마감 완료
    'reopened'   -- 재오픈 (추가 건 발생)
  )),
  
  -- total_amount, business_count는 installation_payments에서 실시간 집계 (이중 관리 방지)
  
  closed_by UUID REFERENCES employees(id),
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE (closing_month, closing_type)
);
```

---

## 3. 사업장별 설치비 지급 상태

`business_info`에 컬럼을 추가하지 않고, `installation_payments` 데이터로 상태를 계산한다.
SQL View로 구현하여 상태 우선순위를 명확히 정의한다.

```sql
-- 상태 계산 View (CASE WHEN 순서 = 우선순위)
CREATE OR REPLACE VIEW v_business_payment_status AS
SELECT 
  b.id AS business_id,
  CASE
    -- 우선순위 1: 미정산 차액이 있으면 최우선 표시
    WHEN EXISTS (
      SELECT 1 FROM installation_payments ip 
      WHERE ip.business_id = b.id AND ip.payment_type = 'adjustment' AND ip.status = 'pending'
    ) THEN 'diff_pending'        -- "차액발생" (빨강)
    
    -- 우선순위 2: 본마감 완료 (모든 정산 끝남)
    WHEN EXISTS (
      SELECT 1 FROM installation_payments ip 
      WHERE ip.business_id = b.id AND ip.payment_type = 'final' AND ip.status = 'paid'
    ) AND NOT EXISTS (
      SELECT 1 FROM installation_payments ip 
      WHERE ip.business_id = b.id AND ip.payment_type = 'adjustment' AND ip.status = 'pending'
    ) THEN 'final_completed'     -- "정산완료" (초록)
    
    -- 우선순위 3: 설치완료 but 본마감 미처리
    WHEN b.installation_date IS NOT NULL AND EXISTS (
      SELECT 1 FROM installation_payments ip 
      WHERE ip.business_id = b.id AND ip.payment_type = 'forecast' AND ip.status = 'paid'
    ) AND NOT EXISTS (
      SELECT 1 FROM installation_payments ip 
      WHERE ip.business_id = b.id AND ip.payment_type = 'final'
    ) THEN 'final_pending'       -- "본마감대기" (주황)
    
    -- 우선순위 4: 예측마감 완료, 설치 대기
    WHEN EXISTS (
      SELECT 1 FROM installation_payments ip 
      WHERE ip.business_id = b.id AND ip.payment_type = 'forecast' AND ip.status = 'paid'
    ) AND b.installation_date IS NULL
    THEN 'forecast_completed'    -- "예측완료" (파랑)
    
    -- 우선순위 5: 발주일 있지만 예측마감 미처리
    WHEN b.order_date IS NOT NULL THEN 'forecast_pending'  -- "예측대기" (노랑)
    
    -- 우선순위 6: 발주일 없음
    ELSE 'not_applicable'        -- "미대상" (회색)
  END AS payment_status,
  
  -- 환수 건 별도 플래그 (상태와 독립적으로 표시)
  EXISTS (
    SELECT 1 FROM installation_payments ip 
    WHERE ip.business_id = b.id AND ip.status IN ('cancelled', 'deducted')
  ) AS has_refund_history
  
FROM business_info b;
```

**상태 요약:**

| 상태 | 코드 | 색상 | 조건 |
|------|------|------|------|
| 차액발생 | `diff_pending` | 빨강 | 미정산 adjustment 건 존재 (최우선) |
| 정산완료 | `final_completed` | 초록 | 본마감 완료 + 미정산 차액 없음 |
| 본마감대기 | `final_pending` | 주황 | 설치완료 + 예측마감O + 본마감X |
| 예측완료 | `forecast_completed` | 파랑 | 예측마감 paid + 설치 미완료 |
| 예측대기 | `forecast_pending` | 노랑 | 발주일 있음 + 예측마감 미처리 |
| 미대상 | `not_applicable` | 회색 | 발주일 없음 |

> 환수 이력(`has_refund_history`)은 상태와 별도로 아이콘/뱃지로 표시한다.

---

## 4. 비즈니스 로직 상세

### 4.1 예측마감 금액 계산식

```
예측마감 지급액 = 기본설치비(자동계산)
               + 추가공사비(business_info.additional_cost, 기록된 경우)
               + 추가설치비(business_info.installation_extra_cost, 기록된 경우)
```

- 기본설치비: `lib/revenue-calculator.ts`의 `calculateBusinessRevenue()` 결과 중 `installation_costs` 값 사용
- 추가공사비/추가설치비: 해당 시점에 `business_info`에 값이 있으면 포함, 0이거나 null이면 제외
- **지급 시점의 금액을 `calculated_amount`에 스냅샷 저장** (이후 단가/수량 변경 시에도 기록 보존)
- **`snapshot_data`에 계산 입력값 기록** (차액 원인 추적용):
  ```json
  {
    "equipment_breakdown": {
      "ph_meter": { "qty": 2, "unit_price": 50000 },
      "differential_pressure": { "qty": 1, "unit_price": 80000 }
    },
    "additional_cost": 200000,
    "installation_extra_cost": 0,
    "price_version": "2026-01-01",
    "calculated_at": "2026-04-07T10:00:00Z"
  }
  ```
  → 본마감 시 스냅샷과 현재 값을 비교하여 차액 원인(단가 변경/수량 변경/추가비용 발생)을 자동 분류

### 4.2 본마감 트리거

**구현 방식: API 엔드포인트 + DB 알림 (Supabase Edge Function 불필요)**

DB 트리거는 `revenue-calculator.ts` 로직을 호출할 수 없고, 단순 날짜 수정(오타 정정)에도 발동되는 문제가 있다.
따라서 **애플리케이션 레벨에서 처리**한다.

```
구현 방식:
  1. business_info.installation_date 업데이트 시
     → 기존 사업장 수정 API에서 installation_date 변경 감지
     → 변경 감지 시 본마감 생성 API를 내부 호출

  2. 본마감 생성 API (POST /api/installation-closing/final/auto-trigger)
     → idempotent 설계: 이미 본마감 기록이 있으면 스킵
     → 예측마감 기록 확인 → 차액 계산 → pending 상태로 레코드 생성
     → 담당자가 본마감 탭에서 확인 후 최종 승인

  3. 안전장치:
     → installation_date가 여러 번 수정되어도 pending 레코드는 1개만 유지
     → 이미 paid된 본마감이 있으면 새로 생성하지 않음
     → 날짜만 바뀌고 금액 변화 없으면 기존 pending 레코드 유지

수동 마감월 지정:
  본마감 탭에서 개별 건의 마감 귀속월을 수동 변경 가능
  (설치완료가 월말에 걸치는 경우 등)
```

**order_date 변경 감지도 동일 패턴 적용:**
```
order_date 삭제/변경 시:
  → 사업장 수정 API에서 order_date 변경 감지
  → 기존 paid 예측마감 기록 확인
  → 있으면: 환수 처리 API 내부 호출 (차기 월 차감 기록 생성)
```

### 4.3 차액 계산

```
본마감 확정 금액 = 기본설치비(최종) + 추가공사비(최종) + 추가설치비(최종)
예측 지급 총액 = Σ(예측마감 paid 기록의 actual_amount)

차액 = 본마감 확정 금액 - 예측 지급 총액

차액 > 0 → 추가 지급 필요 (adjustment, actual_amount = 양수)
차액 < 0 → 과지급, 차기 월 차감 (adjustment, actual_amount = 음수, status: deducted)
차액 = 0 → 정산 완료
```

### 4.4 발주 취소 시 환수

```
발주일(order_date) 삭제/변경 시:
  1. 해당 사업장의 paid 상태 예측마감 기록 확인
  2. 있으면: 차기 월에 deducted 타입 기록 생성 (음수 금액)
  3. 원래 기록 상태를 cancelled로 변경
  4. UI에 환수 대상 경고 표시
```

### 4.5 추가설치비 후발 처리

```
예측마감 시점: 추가설치비 미기록 → 기본설치비 + 추가공사비만 지급
설치 후:     추가설치비 발생 → 본마감 시 차액에 자동 포함
             추가공사비 추가 발생 → 본마감 시 차액에 자동 포함

본마감 차액 상세 표시:
  - 기본설치비 차이: ±XX원 (기기 수량 변경 등)
  - 추가공사비 차이: ±XX원 (추가 발생분)
  - 추가설치비 차이: +XX원 (신규 발생분, 대부분 여기서 차액 발생)
```

---

## 5. UX 설계

### 5.1 페이지 구조

```
/admin/revenue/                     ← 기존 매출관리 (상태 컬럼 추가)
/admin/revenue/installation-closing ← 신규 설치비 마감 페이지
  ├── 예측마감 탭
  ├── 본마감 탭
  └── 은결 정산 탭
```

### 5.2 예측마감 탭

```
┌──────────────────────────────────────────────────────────────┐
│ [2026년 4월 ▼]                                    권한: ≥3  │
├──────────────────────────────────────────────────────────────┤
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌─────────────────┐ │
│ │대상 25건 │ │완료 20건 │ │미처리 5건│ │총액 15,200,000원│ │
│ └──────────┘ └──────────┘ └──────────┘ └─────────────────┘ │
├──────────────────────────────────────────────────────────────┤
│ [☐ 전체선택] [선택건 일괄지급] [엑셀↓]                      │
├────┬────────┬──────┬───────┬─────────┬─────────┬──────┬─────┤
│ ☐  │사업장명│영업점│ 발주일│기본설치비│추가공사비│추가  │상태 │
│    │        │      │       │         │         │설치비│     │
├────┼────────┼──────┼───────┼─────────┼─────────┼──────┼─────┤
│ ☐  │A사업장 │서울  │04/03  │ 500,000 │ 200,000 │  0   │대기 │
│ ☑  │B사업장 │부산  │04/05  │ 800,000 │    0    │  0   │대기 │
│ -  │C사업장 │대구  │04/01  │ 600,000 │ 100,000 │50,000│완료 │
└────┴────────┴──────┴───────┴─────────┴─────────┴──────┴─────┘

합계행: 기본설치비 합계 | 추가공사비 합계 | 추가설치비 합계 | 총합계
```

**일괄 지급 처리 플로우:**
1. 대상 건 체크박스 선택 (전체선택 가능)
2. [선택건 일괄지급] 클릭
3. 확인 모달:
   ```
   ┌─────────────────────────────────────┐
   │ 예측마감 지급 확인                    │
   ├─────────────────────────────────────┤
   │ 대상: 5건                            │
   │ 기본설치비: 3,200,000원              │
   │ 추가공사비:   500,000원              │
   │ 추가설치비:    50,000원              │
   │ ─────────────────────               │
   │ 총 지급액: 3,750,000원              │
   │ 귀속 월: 2026년 4월                  │
   │                                      │
   │ [취소]              [지급 처리 확인]  │
   └─────────────────────────────────────┘
   ```
4. 확인 시 각 건별 `installation_payments` 레코드 생성

**개별 건 금액 조정:**
- 행 클릭 → 사이드 패널 또는 모달
- 각 항목별 금액 확인, 실제 지급 금액 수정 가능
- 계산 금액 ≠ 실제 지급 금액 시 사유 입력 필수

### 5.3 본마감 탭

```
┌──────────────────────────────────────────────────────────────────────┐
│ [2026년 4월 ▼]  [차액있는 건만 ☐]                                   │
├────┬────────┬───────┬──────────┬──────────┬────────┬───────┬────────┤
│ ☐  │사업장명│설치일 │예측지급액│본마감확정│  차액  │마감월 │ 상태   │
├────┼────────┼───────┼──────────┼──────────┼────────┼───────┼────────┤
│ ☐  │A사업장 │04/15  │ 700,000  │ 850,000  │+150,000│ 04 ▼ │차액발생│
│ ☐  │D사업장 │04/20  │ 800,000  │ 800,000  │   0    │ 04 ▼ │정산완료│
└────┴────────┴───────┴──────────┴──────────┴────────┴───────┴────────┘
```

- 차액 발생 건: 빨간 배지, 행 클릭 시 항목별 차이 상세 표시
- 마감월 드롭다운: 개별 건의 본마감 귀속월 수동 변경 가능
- [차액 일괄 정산] 버튼: 선택된 차액 건 일괄 처리

**차액 상세 모달:**
```
┌──────────────────────────────────────────┐
│ A사업장 - 차액 상세                       │
├──────────────────────────────────────────┤
│ 항목          │ 예측지급 │ 본마감  │ 차액  │
│ 기본설치비    │ 500,000 │500,000 │   0   │
│ 추가공사비    │ 200,000 │200,000 │   0   │
│ 추가설치비    │    0    │150,000 │+150K  │
│──────────────┼─────────┼────────┼───────│
│ 합계          │ 700,000 │850,000 │+150K  │
├──────────────────────────────────────────┤
│ → 추가 지급 필요: 150,000원              │
│                                          │
│ [취소]                    [차액 지급 처리] │
└──────────────────────────────────────────┘
```

### 5.4 은결 정산 탭

```
┌───────────────────────────────────────────────────────────────┐
│ [2026년 4월 ▼]                                                │
├───────────────────────────────────────────────────────────────┤
│ 월 요약                                                       │
│ ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌─────────────┐│
│ │송금액      │ │배분된 금액 │ │미매칭 잔액 │ │대사 상태    ││
│ │15,200,000 │ │15,000,000 │ │  200,000   │ │ 미완료 ⚠️   ││
│ └────────────┘ └────────────┘ └────────────┘ └─────────────┘│
├───────────────────────────────────────────────────────────────┤
│ 은결 송금 기록                                                │
│ [+ 송금 기록 추가]                                            │
├────────┬───────────┬──────────┬────────┬──────────────────────┤
│ 송금일 │ 송금 금액  │참조번호  │ 상태   │ 매칭 건수            │
├────────┼───────────┼──────────┼────────┼──────────────────────┤
│ 04/25  │15,200,000│TRF-0425 │ 송금완료│ 20/25건 매칭         │
└────────┴───────────┴──────────┴────────┴──────────────────────┘
│                                                               │
│ 건별 매칭 상세 (송금건 클릭 시 펼침)                           │
│ ┌────────┬──────────┬──────┬────────┐                         │
│ │사업장명│ 지급 금액 │유형  │매칭상태│                         │
│ │A사업장 │  700,000 │예측  │  ✅   │                         │
│ │B사업장 │  800,000 │예측  │  ✅   │                         │
│ │...     │          │      │       │                         │
│ └────────┴──────────┴──────┴────────┘                         │
└───────────────────────────────────────────────────────────────┘
```

### 5.5 매출관리 페이지 연동

기존 매출관리 테이블에 컬럼 2개 추가:

```
... | 기존 컬럼들 | 설치비상태 | 지급액/확정액 |
                   [예측완료]   700,000/850,000
                   [정산완료]   800,000/800,000
                   [미대상]         -
```

- 상태 뱃지 클릭 → 설치비 마감 페이지 해당 건으로 이동
- 엑셀 다운로드에 포함: 설치비상태, 예측지급액, 본마감확정액, 차액

---

## 6. API 설계

### 6.1 예측마감

```
GET  /api/installation-closing/forecast?month=2026-04
  → 해당 월 예측마감 대상 목록 (발주일 기준 자동 필터링)
  → 이미 처리된 건 포함 (상태 구분)
  → v_business_payment_status View JOIN

POST /api/installation-closing/forecast/process
  Body: { business_ids: string[], payment_month: string }
  → 선택된 건 일괄 예측마감 처리
  → 각 건별 installation_payments 레코드 생성 (snapshot_data 포함)
  
  ⚠️ 트랜잭션 처리:
  - All-or-nothing: 전체 성공 또는 전체 롤백
  - SELECT ... FOR UPDATE로 대상 business_info 행 락
  - 동시 처리 시도 시 두 번째 요청은 이미 처리된 건으로 판단하여 스킵
  - 응답: { processed: number, skipped: number, skipped_ids: string[] }

PUT  /api/installation-closing/forecast/[paymentId]
  Body: { actual_amount: number, amount_diff_reason?: string }
  → 개별 건 금액 조정
```

### 6.2 본마감

```
GET  /api/installation-closing/final?month=2026-04
  → 해당 월 본마감 대상 목록 (설치완료 건)
  → 예측 vs 확정 차액 정보 포함 (snapshot_data 비교)

POST /api/installation-closing/final/process
  Body: { business_ids: string[], payment_month: string }
  → 선택된 건 본마감 처리
  → 트랜잭션: 예측마감과 동일한 락/롤백 정책

POST /api/installation-closing/final/auto-trigger
  Body: { business_id: string }
  → 설치완료 시 자동 호출 (사업장 수정 API에서 내부 호출)
  → idempotent: 이미 본마감 기록 있으면 스킵

PUT  /api/installation-closing/final/[paymentId]/month
  Body: { payment_month: string }
  → 개별 건 마감월 변경
```

### 6.3 은결 정산

```
GET  /api/installation-closing/transfers?month=2026-04
  → 해당 월 은결 송금 기록
  → matched_amount는 installation_payments에서 실시간 집계

POST /api/installation-closing/transfers
  Body: { transfer_date, transfer_amount, bank_reference, payment_month }
  → 은결 송금 기록 등록

PUT  /api/installation-closing/transfers/[transferId]/reconcile
  Body: { payment_ids: string[] }
  → 대사 처리: 선택된 지급 건들을 송금건에 매칭
  → 매칭 후 합계 ≠ 송금액이면 경고 반환
```

### 6.4 상태 조회

```
GET  /api/installation-closing/status/[businessId]
  → 특정 사업장의 설치비 지급 전체 이력

GET  /api/installation-closing/summary?month=2026-04
  → 월별 요약 통계 (대시보드 카드용)
  → installation_payments에서 실시간 집계 (closing_records 참조 X)
```

### 6.5 공통 에러 응답 구조

```typescript
// 성공 응답
{ success: true, data: T }

// 에러 응답
{ 
  success: false, 
  error: {
    code: 'DUPLICATE_PAYMENT' | 'BUSINESS_LOCKED' | 'INVALID_STATE' | 'PERMISSION_DENIED',
    message: string,
    details?: any
  }
}
```

---

## 7. 구현 우선순위

### Phase 1: MVP (핵심 예측마감)
1. DB 마이그레이션: `installation_payments`, `eungyeol_transfers` 테이블 생성
2. 예측마감 대상 조회 API
3. 예측마감 일괄/개별 처리 API
4. 설치비 마감 페이지 레이아웃 + 예측마감 탭 UI
5. 매출관리 페이지에 설치비 상태 컬럼 추가

### Phase 2: 본마감 및 차액 정산
6. 본마감 자동 트리거 (installation_date 변경 감지)
7. 차액 자동 계산 로직
8. 본마감 탭 UI
9. 차액 정산 처리 (추가 지급 / 차기 월 차감)
10. 개별 건 마감월 수동 변경

### Phase 3: 은결 정산 및 리포팅
11. `closing_records` 테이블 생성
12. 은결 송금 기록 관리 UI
13. 정산 대사 기능
14. 월별 마감 관리
15. 엑셀 다운로드 (마감 페이지 + 매출관리 연동)
16. 발주 취소 환수 처리

---

## 8. 엣지 케이스 정리

| # | 시나리오 | 처리 방법 |
|---|---------|----------|
| E1 | 예측마감 후 기기 수량 변경 | snapshot_data와 비교하여 차액 원인 자동 분류, 본마감 시 재계산 |
| E2 | 예측마감 후 발주 취소 | 원래 기록 cancelled, 차기 월에 음수 금액 deducted 기록 생성 |
| E3 | 설치비 단가 변경 | snapshot_data의 price_version과 현재 단가 비교, 차액 원인 추적 |
| E4 | 동일 건 중복 처리 시도 | partial unique index로 활성 레코드만 차단 + UI 비활성화 + API에서 skipped 반환 |
| E5 | 월말 설치완료 (귀속 월 애매) | 본마감 탭에서 마감월 수동 변경 가능 |
| E6 | 추가공사비가 예측마감 후 추가 | 본마감 시 차액에 포함, 추가 지급 처리 |
| E7 | 추가설치비가 설치 후 발생 | 본마감 시 차액에 포함 (가장 빈번한 케이스) |
| E8 | 은결 송금액과 개별 건 합계 불일치 | 은결 정산 탭에서 미매칭 잔액 경고 표시 |
| E9 | 예측마감 처리 후 금액 수정 필요 | paid 상태에서도 금액 수정 가능 (사유 필수) |
| E10 | 마감 완료 월에 추가 건 발생 | closing_records 상태를 reopened로 변경, 추가 처리 허용 |
| E11 | 같은 월에 예측마감 후 즉시 설치완료 | 예측마감/본마감 모두 같은 월 귀속 가능, 차액만 정산 |
| E12 | 지급 이력 있는 사업장 삭제 시도 | ON DELETE RESTRICT로 차단, 삭제 전 지급 이력 정리 필요 안내 |
| E13 | 발주일이 다른 월로 변경 (4월→5월) | 기존 4월 예측마감 cancelled, 5월 기준으로 재처리 필요 알림 |
| E14 | 은결 reconciled 상태에서 환수 발생 | transfer의 매칭 금액 재계산, reconciled→transferred로 상태 변경 |
| E15 | 두 사용자가 동시에 같은 건 일괄처리 | SELECT FOR UPDATE 락, 후행 요청은 이미 처리된 건으로 스킵 |

---

## 9. 기존 시스템 영향도

| 영역 | 변경 내용 | 영향도 |
|------|----------|--------|
| `app/admin/revenue/page.tsx` | 상태 뱃지 컬럼만 추가 (최소 변경). 데이터 조회는 별도 hook으로 분리 | 소 |
| `app/admin/revenue/page.tsx` 엑셀 | 엑셀 내보내기 시에만 설치비 데이터 JOIN (lazy loading) | 소 |
| `lib/revenue-calculator.ts` | 변경 없음 (계산 결과 재사용) | 없음 |
| `business_info` 테이블 | 변경 없음 (신규 테이블로 분리) | 없음 |
| 사업장 수정 API | installation_date/order_date 변경 감지 로직 추가 | 중 |
| `components/business/modals/` | 변경 없음 (추가공사비 입력은 기존 유지) | 없음 |
| Supabase Realtime | 마감 페이지에서만 `installation_payments` 구독. 매출관리에서는 수동 새로고침 | 소 |

### 9.1 매출관리 페이지 통합 전략

기존 `revenue/page.tsx`(53K+ 토큰)의 복잡도를 고려하여 최소 침습 방식으로 통합:

```
1. 상태 뱃지: v_business_payment_status View 조회 결과를 별도 custom hook으로 관리
2. 엑셀 내보내기: 다운로드 시점에만 installation_payments LEFT JOIN (기존 쿼리 성능 영향 없음)
3. Realtime: 마감 페이지에서만 구독, 매출관리 페이지에서는 페이지 로드 시 1회 조회
4. 상태 뱃지 클릭 → window.open으로 마감 페이지 해당 건으로 이동 (페이지 간 결합도 최소화)
```
