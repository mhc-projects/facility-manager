# 측정기기 수량 데이터 흐름 개선 설계

## 📋 현재 상황 분석

### 현재 문제점

1. **데이터 소스의 혼란**
   - `business/[사업장명]` 페이지의 "측정기기 수량 체크" 섹션에서 입력된 데이터
   - → `businesses` 테이블의 측정기기 수량 필드를 자동 업데이트
   - → Admin 모달에서도 동일한 필드를 표시
   - **문제**: 대기필증 기반 시설 정보와 사용자 입력 데이터가 혼재

2. **데이터 정확성 문제**
   - 대기필증에 등록된 실제 시설 수량 ≠ 사용자가 체크한 수량
   - 자동 업데이트로 인해 사용자의 수동 입력이 덮어써질 위험

3. **사용자 경험 혼란**
   - 어떤 데이터가 "공식" 데이터인지 불명확
   - 대기필증 기반 vs 사용자 확인 기반 데이터 구분 필요

---

## 🎯 개선 목표

### 핵심 원칙

1. **명확한 데이터 출처 구분**
   - 대기필증 기반 시설 정보 (읽기 전용, 공식 데이터)
   - 사용자 확인 데이터 (사용자가 직접 수정)

2. **자동 업데이트 제거**
   - `business/[사업장명]` 페이지의 체크 데이터가 Admin의 사업장 정보를 자동 수정하지 않음
   - 사용자가 명시적으로 수정할 때만 업데이트

3. **UI 명확화**
   - Admin 모달에서 두 데이터 출처를 명확히 구분하여 표시

---

## 🔍 현재 데이터 흐름

### AS-IS 구조

```
[business/[사업장명] 페이지]
  ↓
측정기기 수량 체크 섹션
  ├─ 사용자가 배출전류계, 송풍전류계 수량 입력
  ├─ "시설관리 업데이트" 버튼 클릭
  │
  ↓ PUT /api/business-equipment-counts
  │
  └─ businesses 테이블 업데이트
      ├─ discharge_flowmeter (배출전류계)
      └─ supply_flowmeter (송풍전류계)

[admin/business 페이지]
  ↓
사업장 상세 모달
  ├─ "측정기기 수량" 섹션 (사업장 정보 탭)
  │   └─ businesses.discharge_flowmeter, supply_flowmeter 표시
  │
  └─ "시설 정보 (대기필증 기준)" 섹션 (측정기기 및 네트워크 탭)
      └─ air_permit_info + discharge_outlets + facilities 표시
```

### 문제 시나리오

1. **시나리오 A: 자동 업데이트로 인한 혼란**
   ```
   초기 상태:
   - businesses.discharge_flowmeter = 2 (사용자가 수동 입력한 값)
   - air_permit 기반 실제 시설 = 1개

   사용자 액션:
   - business/[사업장명]에서 "측정기기 수량 체크"
   - 현장 확인 후 discharge_flowmeter = 1 체크
   - "시설관리 업데이트" 클릭

   결과:
   - businesses.discharge_flowmeter = 1 (자동 덮어쓰기)
   - 사용자의 의도: "현장 확인만 했을 뿐, 공식 데이터 수정 의도 없음"
   - 실제 결과: "공식 사업장 정보가 변경됨" ❌
   ```

2. **시나리오 B: 데이터 출처 불명확**
   ```
   Admin 모달에서:
   - "측정기기 수량" 섹션: 배출전류계 2개
   - "시설 정보 (대기필증 기준)": 배출시설 1개

   질문: 어떤 것이 정확한 값인가?
   - 대기필증 = 공식 문서 (법적 근거)
   - 사업장 정보 = 사용자 입력 (확인 필요)
   ```

---

## ✅ 개선 방안

### TO-BE 구조

```
[business/[사업장명] 페이지]
  ↓
측정기기 수량 체크 섹션
  ├─ 사용자가 배출전류계, 송풍전류계 수량 입력
  ├─ "시설관리 업데이트" 버튼 클릭
  │
  ↓ ❌ businesses 테이블 업데이트 제거
  ↓ ✅ 체크 데이터는 별도 테이블 또는 로컬 상태로만 관리
  │
  └─ 목적: 현장 확인용 체크리스트
      └─ 대기필증 데이터와 비교하여 불일치 확인

[admin/business 페이지]
  ↓
사업장 상세 모달
  ├─ "사업장 정보" 탭
  │   └─ "측정기기 수량" 섹션
  │       ├─ businesses.discharge_flowmeter, supply_flowmeter
  │       └─ ✅ 사용자가 직접 수정 버튼으로만 업데이트
  │
  └─ "측정기기 및 네트워크" 탭
      └─ "시설 정보 (대기필증 기준)" 섹션
          └─ air_permit 기반 데이터 (읽기 전용)
              ├─ 배출시설: X개
              ├─ 방지시설: Y개
              └─ 배출구: Z개
```

### 데이터 출처 명확화

| 데이터 | 출처 | 업데이트 방법 | 신뢰도 |
|--------|------|---------------|--------|
| **시설 정보 (대기필증 기준)** | `air_permit_info` + `discharge_outlets` + 시설 테이블 | 대기필증 등록/수정 시 | 높음 (공식 문서) |
| **사업장 정보 - 측정기기 수량** | `businesses` 테이블 | Admin 모달에서 사용자 직접 수정 | 중간 (사용자 입력) |
| **측정기기 수량 체크** | 로컬 상태 또는 별도 체크 테이블 | 현장 확인 시 | 낮음 (임시 확인용) |

---

## 📝 구현 계획

### Phase 1: 자동 업데이트 제거

#### 1.1. EnhancedFacilityInfoSection.tsx 수정

**현재 코드 (app/business/[businessName]/BusinessContent.tsx 또는 관련 컴포넌트)**:
```typescript
// ❌ 제거할 코드
const response = await fetch('/api/business-equipment-counts', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    businessId,
    equipmentCounts: counts
  })
});
```

**변경 후**:
```typescript
// ✅ 로컬 상태로만 관리
const [localEquipmentCheck, setLocalEquipmentCheck] = useState({
  discharge_flowmeter: 0,
  supply_flowmeter: 0
});

// 저장 버튼: 로컬 스토리지 또는 별도 체크 테이블에만 저장
const handleSaveCheck = () => {
  localStorage.setItem(
    `equipment_check_${businessName}`,
    JSON.stringify(localEquipmentCheck)
  );

  toast.success('현장 확인 데이터 저장됨',
    '사업장 정보는 Admin에서 직접 수정하세요');
};
```

#### 1.2. API 엔드포인트 제거 또는 권한 제한

**옵션 A: 완전 제거**
```bash
# 파일 삭제
rm app/api/business-equipment-counts/route.ts
```

**옵션 B: Admin 전용으로 변경**
```typescript
// app/api/business-equipment-counts/route.ts
export async function PUT(request: NextRequest) {
  // ✅ Admin 권한 체크 추가
  const token = request.headers.get('Authorization')?.replace('Bearer ', '');
  const decoded = verifyToken(token);

  if (!decoded || decoded.permission_level < 4) {
    return NextResponse.json({
      success: false,
      message: 'Admin 권한이 필요합니다'
    }, { status: 403 });
  }

  // ... 기존 로직
}
```

### Phase 2: UI 개선

#### 2.1. Admin 모달 - 측정기기 수량 섹션 개선

**BusinessDetailModal.tsx 수정**:
```typescript
{/* 사업장 정보 탭 - 측정기기 수량 섹션 */}
<div className="bg-white rounded-lg p-4 border border-gray-200">
  <div className="flex items-center justify-between mb-3">
    <h4 className="font-semibold text-gray-800">측정기기 수량</h4>
    <button
      onClick={() => setIsEditingEquipment(true)}
      className="text-sm text-blue-600 hover:text-blue-800"
    >
      수정
    </button>
  </div>

  <div className="grid grid-cols-2 gap-3 text-sm">
    <div>
      <span className="text-gray-600">배출전류계:</span>
      <span className="ml-2 font-semibold">
        {selectedBusiness.discharge_flowmeter || 0}
      </span>
    </div>
    <div>
      <span className="text-gray-600">송풍전류계:</span>
      <span className="ml-2 font-semibold">
        {selectedBusiness.supply_flowmeter || 0}
      </span>
    </div>
  </div>

  {/* ✅ 사용자 안내 메시지 */}
  <p className="text-xs text-gray-500 mt-2">
    💡 이 데이터는 사용자가 직접 관리합니다.
    대기필증 기반 공식 데이터는 "측정기기 및 네트워크" 탭을 참고하세요.
  </p>
</div>
```

#### 2.2. business/[사업장명] - 측정기기 수량 체크 섹션 개선

**EnhancedFacilityInfoSection.tsx 수정**:
```typescript
<div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
  <div className="flex items-center justify-between mb-3">
    <h3 className="font-semibold text-purple-800">측정기기 수량 체크</h3>
    <span className="text-xs text-purple-600 bg-purple-100 px-2 py-1 rounded">
      현장 확인용
    </span>
  </div>

  {/* 입력 필드 */}
  <div className="grid grid-cols-2 gap-3">
    <div>
      <label className="text-sm text-gray-700">배출전류계</label>
      <input
        type="number"
        value={localEquipmentCheck.discharge_flowmeter}
        onChange={(e) => setLocalEquipmentCheck({
          ...localEquipmentCheck,
          discharge_flowmeter: parseInt(e.target.value)
        })}
      />
    </div>
    <div>
      <label className="text-sm text-gray-700">송풍전류계</label>
      <input
        type="number"
        value={localEquipmentCheck.supply_flowmeter}
        onChange={(e) => setLocalEquipmentCheck({
          ...localEquipmentCheck,
          supply_flowmeter: parseInt(e.target.value)
        })}
      />
    </div>
  </div>

  {/* 대기필증 데이터와 비교 */}
  {facilityNumbering && (
    <div className="mt-3 p-3 bg-blue-50 rounded border border-blue-200">
      <p className="text-xs text-blue-700 font-semibold mb-1">
        📋 대기필증 기준 시설 수량
      </p>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>배출시설: {facilityNumbering.dischargeCount}개</div>
        <div>방지시설: {facilityNumbering.preventionCount}개</div>
      </div>
    </div>
  )}

  {/* ✅ 저장 버튼: 로컬 스토리지에만 저장 */}
  <button
    onClick={handleSaveCheck}
    className="mt-3 w-full bg-purple-600 text-white py-2 rounded"
  >
    현장 확인 저장
  </button>

  {/* ✅ 안내 메시지 */}
  <p className="text-xs text-gray-500 mt-2">
    ℹ️ 이 데이터는 현장 확인용입니다.
    사업장 공식 정보는 Admin 페이지에서 수정하세요.
  </p>
</div>
```

### Phase 3: 디버깅 로그 정리

#### 3.1. 제거할 로그 패턴

**app/admin/business/page.tsx**:
```typescript
// ❌ 제거: FACILITY-LOAD 관련 디버깅 로그
console.log(`🔍 [FACILITY-LOAD] 사업장 시설 정보 조회: ${businessName}`)
console.log(`📡 [FACILITY-LOAD] API 응답 상태:`, response.status, response.ok)
console.log(`📊 [FACILITY-LOAD] API 응답 데이터:`, { ... })
console.log(`✅ [FACILITY-LOAD] 변환 완료:`, { ... })
console.warn(`⚠️ [FACILITY-LOAD] API 응답 데이터 형식 오류:`, { ... })
console.error(`❌ [FACILITY-LOAD] API 호출 실패:`, response.status)
console.error('❌ [FACILITY-LOAD] 사업장 시설 정보 로드 실패:', error)
```

#### 3.2. 유지할 로그

**중요한 에러 로그만 유지**:
```typescript
// ✅ 유지: 실제 에러 발생 시
try {
  // ... API 호출
} catch (error) {
  console.error('시설 정보 로드 실패:', error);
  setFacilityData(null);
}
```

---

## 🎨 UI/UX 개선 사항

### 1. Admin 모달 - 데이터 출처 명확화

**Before**:
```
[측정기기 수량]
배출전류계: 2
송풍전류계: 1

[시설 정보 (대기필증 기준)]
배출시설: 1
방지시설: 1
```
→ 사용자 혼란: "어떤 게 맞는 거지?"

**After**:
```
[측정기기 수량] 💡 사용자 입력 데이터
배출전류계: 2  [수정]
송풍전류계: 1  [수정]
→ 이 데이터는 사용자가 직접 관리합니다.

[시설 정보 (대기필증 기준)] 📋 공식 문서
배출시설: 1
방지시설: 1
→ 대기필증에 등록된 공식 데이터입니다.
```

### 2. business/[사업장명] - 체크 섹션 용도 명확화

**Before**:
```
[측정기기 수량 체크]
배출전류계: [입력]
송풍전류계: [입력]
[시설관리 업데이트] ← 사용자가 이 버튼을 클릭하면 사업장 정보가 변경됨
```

**After**:
```
[측정기기 수량 체크] 🔍 현장 확인용
배출전류계: [입력]
송풍전류계: [입력]

📋 대기필증 기준: 배출시설 1개, 방지시설 1개

[현장 확인 저장] ← 로컬에만 저장, 사업장 정보 변경 안 함
→ 현장 확인용 데이터입니다. 공식 정보는 Admin에서 수정하세요.
```

---

## 📊 데이터 마이그레이션

### 기존 데이터 처리

**옵션 A: 데이터 유지 (추천)**
- 기존 `businesses.discharge_flowmeter`, `businesses.supply_flowmeter` 유지
- 사용자가 필요 시 Admin 모달에서 수정
- 자동 업데이트만 제거

**옵션 B: 체크 테이블 생성**
```sql
-- 선택사항: 현장 확인 데이터를 별도 테이블로 관리
CREATE TABLE equipment_checks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID REFERENCES businesses(id),
  discharge_flowmeter INTEGER,
  supply_flowmeter INTEGER,
  checked_by VARCHAR(100),
  checked_at TIMESTAMP DEFAULT NOW(),
  notes TEXT
);
```

---

## 🧪 테스트 시나리오

### 시나리오 1: 측정기기 수량 체크 (business 페이지)

1. `business/[사업장명]` 접속
2. "측정기기 수량 체크" 섹션에서 값 입력
3. "현장 확인 저장" 클릭
4. **기대 결과**:
   - ✅ 로컬 스토리지에 저장됨
   - ✅ 토스트 메시지: "현장 확인 데이터 저장됨"
   - ✅ `businesses` 테이블은 변경되지 않음

### 시나리오 2: 사업장 정보 수정 (Admin 모달)

1. `admin/business` 접속
2. 사업장 클릭하여 상세 모달 열기
3. "사업장 정보" 탭 → "측정기기 수량" 섹션 → "수정" 클릭
4. 값 변경 후 저장
5. **기대 결과**:
   - ✅ `businesses` 테이블 업데이트됨
   - ✅ 모달에서 변경된 값 표시됨

### 시나리오 3: 대기필증 기반 시설 정보 확인 (Admin 모달)

1. `admin/business` 접속
2. 사업장 클릭하여 상세 모달 열기
3. "측정기기 및 네트워크" 탭 이동
4. **기대 결과**:
   - ✅ 대기필증 기반 시설 정보 표시
   - ✅ 배출시설, 방지시설, 배출구 카운트 정확
   - ✅ 읽기 전용 (수정 불가)

---

## 📁 영향 받는 파일

### 수정 필요 파일

1. **components/sections/EnhancedFacilityInfoSection.tsx**
   - 측정기기 수량 체크 섹션 UI 개선
   - 자동 업데이트 로직 제거
   - 로컬 상태 관리로 변경

2. **app/admin/business/page.tsx**
   - FACILITY-LOAD 디버깅 로그 정리
   - 필요한 에러 로그만 유지

3. **components/business/modals/BusinessDetailModal.tsx**
   - 측정기기 수량 섹션에 수정 버튼 추가
   - 안내 메시지 추가 (데이터 출처 명확화)

4. **app/api/business-equipment-counts/route.ts** (선택사항)
   - Admin 권한 체크 추가
   - 또는 완전 제거

---

## ✅ 구현 순서

### Step 1: 디버깅 로그 정리
- `app/admin/business/page.tsx`에서 FACILITY-LOAD 로그 제거
- 필요한 에러 로그만 유지

### Step 2: 자동 업데이트 제거
- `EnhancedFacilityInfoSection.tsx`에서 API 호출 제거
- 로컬 상태 관리로 변경
- 안내 메시지 추가

### Step 3: UI 개선
- Admin 모달에 수정 버튼 추가
- 데이터 출처 안내 메시지 추가
- business 페이지 체크 섹션 용도 명확화

### Step 4: 테스트
- 3가지 시나리오 검증
- 데이터 무결성 확인

---

## 📌 주요 변경 사항 요약

| 항목 | Before | After |
|------|--------|-------|
| **측정기기 수량 체크 저장** | `businesses` 테이블 자동 업데이트 | 로컬 스토리지에만 저장 |
| **사업장 정보 수정** | 체크 섹션에서 자동 업데이트 | Admin 모달에서 명시적 수정 |
| **데이터 출처 표시** | 불명확 | 대기필증 기준 vs 사용자 입력 명확히 구분 |
| **디버깅 로그** | 과도한 FACILITY-LOAD 로그 | 필요한 에러 로그만 유지 |

---

## 🎯 기대 효과

1. **데이터 정확성 향상**
   - 대기필증 기반 공식 데이터와 사용자 입력 데이터 명확히 구분
   - 의도하지 않은 자동 업데이트 방지

2. **사용자 경험 개선**
   - 어떤 데이터를 수정해야 하는지 명확
   - 현장 확인용 vs 공식 데이터 용도 구분

3. **유지보수성 향상**
   - 디버깅 로그 정리로 콘솔 가독성 개선
   - 데이터 흐름 단순화

4. **데이터 무결성 보장**
   - 사용자가 명시적으로 수정할 때만 업데이트
   - 대기필증 기반 공식 데이터 보호
