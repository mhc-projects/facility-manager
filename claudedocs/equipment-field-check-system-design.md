# 측정기기 현장 확인 시스템 설계

## 📋 요구사항 분석

### 핵심 요구사항

1. **데이터 분리 관리**
   - 현장에서 입력한 측정기기 수량 (Field Check)
   - 사무실에서 관리하는 공식 사업장 정보 (Office Data)
   - 대기필증 기반 시설 정보 (Air Permit Data)

2. **비교 기능**
   - 현장 확인 값 vs 사무실 관리 값
   - 불일치 데이터 시각적 표시
   - 변경 이력 추적

3. **자동 업데이트 제거**
   - 현장 체크가 사업장 정보를 자동으로 덮어쓰지 않음
   - 사용자가 명시적으로 "반영" 버튼을 클릭할 때만 업데이트

---

## 🗄️ 데이터베이스 설계

### 신규 테이블: `equipment_field_checks`

```sql
-- 측정기기 현장 확인 기록 테이블
CREATE TABLE equipment_field_checks (
  -- 기본 정보
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,

  -- 측정기기 수량 (현장 확인)
  discharge_flowmeter INTEGER DEFAULT 0,  -- 배출전류계
  supply_flowmeter INTEGER DEFAULT 0,      -- 송풍전류계

  -- 메타데이터
  checked_by VARCHAR(100),                 -- 확인자 (사용자 이름)
  checked_at TIMESTAMP DEFAULT NOW(),      -- 확인 시각
  check_location VARCHAR(200),             -- 확인 장소 (선택사항)
  notes TEXT,                              -- 메모 (특이사항)

  -- 상태 관리
  is_synced BOOLEAN DEFAULT FALSE,         -- 사무실 데이터로 반영 여부
  synced_at TIMESTAMP,                     -- 반영 시각
  synced_by VARCHAR(100),                  -- 반영자

  -- 인덱스
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 인덱스 생성
CREATE INDEX idx_equipment_field_checks_business_id
  ON equipment_field_checks(business_id);

CREATE INDEX idx_equipment_field_checks_checked_at
  ON equipment_field_checks(checked_at DESC);

CREATE INDEX idx_equipment_field_checks_is_synced
  ON equipment_field_checks(is_synced);

-- RLS (Row Level Security) 정책
ALTER TABLE equipment_field_checks ENABLE ROW LEVEL SECURITY;

-- 모든 인증된 사용자가 읽기 가능
CREATE POLICY "Anyone can read equipment checks"
  ON equipment_field_checks
  FOR SELECT
  USING (true);

-- 인증된 사용자가 생성 가능
CREATE POLICY "Authenticated users can create checks"
  ON equipment_field_checks
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- 본인이 생성한 체크만 수정 가능 (또는 Admin)
CREATE POLICY "Users can update own checks"
  ON equipment_field_checks
  FOR UPDATE
  USING (
    checked_by = current_setting('request.jwt.claims')::json->>'name'
    OR (current_setting('request.jwt.claims')::json->>'permission_level')::int >= 4
  );

-- 코멘트 추가
COMMENT ON TABLE equipment_field_checks IS '측정기기 현장 확인 기록';
COMMENT ON COLUMN equipment_field_checks.is_synced IS '사무실 데이터(businesses 테이블)로 반영 여부';
COMMENT ON COLUMN equipment_field_checks.notes IS '현장 확인 시 특이사항 메모';
```

---

## 🏗️ 시스템 아키텍처

### 데이터 계층 구조

```
┌─────────────────────────────────────────────────────────────┐
│                    데이터 소스 3계층                          │
└─────────────────────────────────────────────────────────────┘

Layer 1: 공식 문서 (최고 신뢰도)
┌──────────────────────────────────────────┐
│  air_permit_info                          │
│  + discharge_outlets                      │
│  + discharge_facilities                   │
│  + prevention_facilities                  │
│                                           │
│  → 대기필증에 등록된 법적 공식 데이터      │
│  → 읽기 전용, 대기필증 수정 시만 변경      │
└──────────────────────────────────────────┘

Layer 2: 사무실 관리 데이터 (중간 신뢰도)
┌──────────────────────────────────────────┐
│  businesses                               │
│  - discharge_flowmeter                    │
│  - supply_flowmeter                       │
│                                           │
│  → Admin이 직접 관리하는 공식 사업장 정보  │
│  → Admin 모달에서만 수정 가능             │
└──────────────────────────────────────────┘

Layer 3: 현장 확인 데이터 (낮은 신뢰도, 검증 필요)
┌──────────────────────────────────────────┐
│  equipment_field_checks ✨ NEW            │
│  - discharge_flowmeter                    │
│  - supply_flowmeter                       │
│  - checked_by                             │
│  - checked_at                             │
│  - is_synced                              │
│                                           │
│  → 현장 작업자가 입력한 확인 데이터        │
│  → business 페이지에서 입력               │
│  → Admin 승인 후 Layer 2로 반영 가능      │
└──────────────────────────────────────────┘
```

### 데이터 흐름

```
[현장 작업] business/[사업장명] 페이지
    ↓ 측정기기 수량 입력
    ↓ "현장 확인 저장" 클릭
    ↓
┌─────────────────────────────────────┐
│ POST /api/equipment-field-checks    │
│ → equipment_field_checks 테이블 저장 │
│ → is_synced = false                 │
└─────────────────────────────────────┘
    ↓
    ↓ Admin 확인
    ↓
[사무실 확인] admin/business 페이지
    ↓ 상세 모달 열기
    ↓ "현장 확인 데이터" 탭 확인
    ↓
    ↓ 데이터 비교
    ├─ 현장: 배출전류계 2개
    ├─ 사무실: 배출전류계 1개
    └─ 대기필증: 배출시설 1개
    ↓
    ↓ Admin 판단 후 "사업장 정보에 반영" 클릭
    ↓
┌─────────────────────────────────────┐
│ PUT /api/equipment-field-checks/    │
│     sync/{checkId}                  │
│                                     │
│ 1. businesses 테이블 업데이트        │
│ 2. is_synced = true                 │
│ 3. synced_at = NOW()                │
│ 4. synced_by = Admin 이름           │
└─────────────────────────────────────┘
```

---

## 🔌 API 설계

### 1. 현장 확인 데이터 저장 API

**Endpoint**: `POST /api/equipment-field-checks`

**Request Body**:
```json
{
  "businessId": "uuid",
  "discharge_flowmeter": 2,
  "supply_flowmeter": 1,
  "checked_by": "홍길동",
  "check_location": "서울 강남구 현장",
  "notes": "배출전류계 1대 추가 설치 예정"
}
```

**Response**:
```json
{
  "success": true,
  "message": "현장 확인 데이터가 저장되었습니다",
  "data": {
    "check_id": "uuid",
    "business_id": "uuid",
    "discharge_flowmeter": 2,
    "supply_flowmeter": 1,
    "checked_by": "홍길동",
    "checked_at": "2024-01-15T10:30:00Z",
    "is_synced": false
  }
}
```

### 2. 현장 확인 데이터 조회 API

**Endpoint**: `GET /api/equipment-field-checks?businessId={uuid}`

**Query Parameters**:
- `businessId`: 사업장 ID (필수)
- `limit`: 조회 개수 (기본값: 10)
- `offset`: 페이지네이션 오프셋

**Response**:
```json
{
  "success": true,
  "data": {
    "checks": [
      {
        "id": "uuid",
        "business_id": "uuid",
        "discharge_flowmeter": 2,
        "supply_flowmeter": 1,
        "checked_by": "홍길동",
        "checked_at": "2024-01-15T10:30:00Z",
        "is_synced": false,
        "notes": "배출전류계 1대 추가 설치 예정"
      }
    ],
    "total_count": 5,
    "latest_check": { /* 가장 최근 체크 */ }
  }
}
```

### 3. 사업장 정보에 반영 API

**Endpoint**: `PUT /api/equipment-field-checks/sync/{checkId}`

**Request Body**:
```json
{
  "synced_by": "관리자명"
}
```

**Response**:
```json
{
  "success": true,
  "message": "현장 확인 데이터가 사업장 정보에 반영되었습니다",
  "data": {
    "check": {
      "id": "uuid",
      "is_synced": true,
      "synced_at": "2024-01-15T14:00:00Z",
      "synced_by": "관리자명"
    },
    "updated_business": {
      "id": "uuid",
      "discharge_flowmeter": 2,
      "supply_flowmeter": 1
    }
  }
}
```

### 4. 현장 확인 데이터 삭제 API

**Endpoint**: `DELETE /api/equipment-field-checks/{checkId}`

**Response**:
```json
{
  "success": true,
  "message": "현장 확인 데이터가 삭제되었습니다"
}
```

---

## 🎨 UI/UX 설계

### 1. business/[사업장명] 페이지 - 측정기기 수량 체크 섹션

```typescript
// 현장 확인 입력 폼
<div className="bg-purple-50 rounded-lg p-4 border-2 border-purple-300">
  {/* 헤더 */}
  <div className="flex items-center justify-between mb-3">
    <h3 className="font-semibold text-purple-900 flex items-center gap-2">
      <ClipboardCheck className="w-5 h-5" />
      측정기기 현장 확인
    </h3>
    <span className="text-xs bg-purple-200 text-purple-800 px-2 py-1 rounded-full">
      현장용
    </span>
  </div>

  {/* 입력 필드 */}
  <div className="grid grid-cols-2 gap-3 mb-3">
    <div>
      <label className="text-sm font-medium text-gray-700 mb-1 block">
        배출전류계
      </label>
      <input
        type="number"
        min="0"
        value={fieldCheck.discharge_flowmeter}
        onChange={(e) => setFieldCheck({
          ...fieldCheck,
          discharge_flowmeter: parseInt(e.target.value) || 0
        })}
        className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-purple-500"
      />
    </div>
    <div>
      <label className="text-sm font-medium text-gray-700 mb-1 block">
        송풍전류계
      </label>
      <input
        type="number"
        min="0"
        value={fieldCheck.supply_flowmeter}
        onChange={(e) => setFieldCheck({
          ...fieldCheck,
          supply_flowmeter: parseInt(e.target.value) || 0
        })}
        className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-purple-500"
      />
    </div>
  </div>

  {/* 확인자 정보 */}
  <div className="mb-3">
    <label className="text-sm font-medium text-gray-700 mb-1 block">
      확인자
    </label>
    <input
      type="text"
      value={fieldCheck.checked_by}
      onChange={(e) => setFieldCheck({
        ...fieldCheck,
        checked_by: e.target.value
      })}
      placeholder="이름 입력"
      className="w-full px-3 py-2 border rounded"
    />
  </div>

  {/* 메모 */}
  <div className="mb-3">
    <label className="text-sm font-medium text-gray-700 mb-1 block">
      특이사항 (선택)
    </label>
    <textarea
      value={fieldCheck.notes}
      onChange={(e) => setFieldCheck({
        ...fieldCheck,
        notes: e.target.value
      })}
      placeholder="현장 확인 시 특이사항을 입력하세요"
      rows={2}
      className="w-full px-3 py-2 border rounded resize-none"
    />
  </div>

  {/* 대기필증 비교 정보 */}
  {facilityNumbering && (
    <div className="mb-3 p-3 bg-blue-50 rounded border border-blue-200">
      <p className="text-xs font-semibold text-blue-800 mb-2 flex items-center gap-1">
        <FileText className="w-4 h-4" />
        대기필증 기준 시설 정보
      </p>
      <div className="grid grid-cols-2 gap-2 text-xs text-blue-700">
        <div>배출시설: <span className="font-bold">{facilityNumbering.dischargeCount}개</span></div>
        <div>방지시설: <span className="font-bold">{facilityNumbering.preventionCount}개</span></div>
      </div>
    </div>
  )}

  {/* 사무실 데이터 비교 */}
  {businessInfo && (
    <div className="mb-3 p-3 bg-amber-50 rounded border border-amber-200">
      <p className="text-xs font-semibold text-amber-800 mb-2 flex items-center gap-1">
        <Building className="w-4 h-4" />
        사무실 등록 데이터
      </p>
      <div className="grid grid-cols-2 gap-2 text-xs text-amber-700">
        <div>배출전류계: <span className="font-bold">{businessInfo.discharge_flowmeter || 0}개</span></div>
        <div>송풍전류계: <span className="font-bold">{businessInfo.supply_flowmeter || 0}개</span></div>
      </div>
    </div>
  )}

  {/* 불일치 경고 */}
  {hasDiscrepancy && (
    <div className="mb-3 p-2 bg-red-50 border border-red-300 rounded">
      <p className="text-xs text-red-700 flex items-center gap-1">
        <AlertTriangle className="w-4 h-4" />
        입력한 값이 사무실 데이터와 다릅니다. 특이사항에 사유를 기록해주세요.
      </p>
    </div>
  )}

  {/* 저장 버튼 */}
  <button
    onClick={handleSaveFieldCheck}
    disabled={saving}
    className="w-full bg-purple-600 hover:bg-purple-700 text-white py-2 rounded font-medium
               disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
  >
    {saving ? '저장 중...' : '현장 확인 저장'}
  </button>

  {/* 안내 메시지 */}
  <p className="text-xs text-gray-600 mt-2 flex items-start gap-1">
    <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
    현장 확인 데이터는 별도로 저장됩니다. Admin 페이지에서 확인 후 사업장 정보에 반영할 수 있습니다.
  </p>

  {/* 최근 체크 이력 */}
  {latestCheck && (
    <div className="mt-3 p-2 bg-gray-50 rounded border border-gray-200">
      <p className="text-xs text-gray-600 mb-1">최근 확인:</p>
      <div className="text-xs text-gray-700">
        <div>• {formatDate(latestCheck.checked_at)} by {latestCheck.checked_by}</div>
        <div>• 배출: {latestCheck.discharge_flowmeter}개, 송풍: {latestCheck.supply_flowmeter}개</div>
        {latestCheck.is_synced && (
          <div className="text-green-600 font-medium">✓ 반영 완료</div>
        )}
      </div>
    </div>
  )}
</div>
```

### 2. Admin 모달 - 현장 확인 데이터 탭 (신규)

```typescript
// Admin 상세 모달에 새로운 탭 추가
<Tab label="현장 확인 데이터" icon={<ClipboardCheck />}>
  {/* 헤더 */}
  <div className="mb-4">
    <h3 className="text-lg font-semibold text-gray-900 mb-1">
      현장 확인 데이터 관리
    </h3>
    <p className="text-sm text-gray-600">
      현장에서 입력된 측정기기 수량 확인 데이터를 관리합니다
    </p>
  </div>

  {/* 데이터 비교 카드 */}
  <div className="grid grid-cols-3 gap-4 mb-6">
    {/* Layer 1: 대기필증 기준 */}
    <div className="bg-blue-50 rounded-lg p-4 border-2 border-blue-300">
      <div className="flex items-center gap-2 mb-3">
        <FileText className="w-5 h-5 text-blue-600" />
        <h4 className="font-semibold text-blue-900">대기필증 기준</h4>
      </div>
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-blue-700">배출시설:</span>
          <span className="font-bold text-blue-900">
            {facilityData?.summary.discharge_count || 0}개
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-blue-700">방지시설:</span>
          <span className="font-bold text-blue-900">
            {facilityData?.summary.prevention_count || 0}개
          </span>
        </div>
      </div>
      <p className="text-xs text-blue-600 mt-3">
        공식 문서 (최고 신뢰도)
      </p>
    </div>

    {/* Layer 2: 사무실 관리 데이터 */}
    <div className="bg-amber-50 rounded-lg p-4 border-2 border-amber-300">
      <div className="flex items-center gap-2 mb-3">
        <Building className="w-5 h-5 text-amber-600" />
        <h4 className="font-semibold text-amber-900">사무실 관리</h4>
      </div>
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-amber-700">배출전류계:</span>
          <span className="font-bold text-amber-900">
            {selectedBusiness.discharge_flowmeter || 0}개
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-amber-700">송풍전류계:</span>
          <span className="font-bold text-amber-900">
            {selectedBusiness.supply_flowmeter || 0}개
          </span>
        </div>
      </div>
      <button
        onClick={() => setIsEditingEquipment(true)}
        className="text-xs text-amber-700 hover:text-amber-900 mt-3 underline"
      >
        수정
      </button>
    </div>

    {/* Layer 3: 최근 현장 확인 */}
    <div className="bg-purple-50 rounded-lg p-4 border-2 border-purple-300">
      <div className="flex items-center gap-2 mb-3">
        <ClipboardCheck className="w-5 h-5 text-purple-600" />
        <h4 className="font-semibold text-purple-900">최근 현장 확인</h4>
      </div>
      {latestFieldCheck ? (
        <>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-purple-700">배출전류계:</span>
              <span className={`font-bold ${
                latestFieldCheck.discharge_flowmeter !== selectedBusiness.discharge_flowmeter
                  ? 'text-red-600'
                  : 'text-purple-900'
              }`}>
                {latestFieldCheck.discharge_flowmeter}개
                {latestFieldCheck.discharge_flowmeter !== selectedBusiness.discharge_flowmeter &&
                  <AlertTriangle className="w-3 h-3 inline ml-1" />
                }
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-purple-700">송풍전류계:</span>
              <span className={`font-bold ${
                latestFieldCheck.supply_flowmeter !== selectedBusiness.supply_flowmeter
                  ? 'text-red-600'
                  : 'text-purple-900'
              }`}>
                {latestFieldCheck.supply_flowmeter}개
                {latestFieldCheck.supply_flowmeter !== selectedBusiness.supply_flowmeter &&
                  <AlertTriangle className="w-3 h-3 inline ml-1" />
                }
              </span>
            </div>
          </div>
          <div className="text-xs text-purple-600 mt-3">
            <div>{formatDate(latestFieldCheck.checked_at)}</div>
            <div>확인자: {latestFieldCheck.checked_by}</div>
          </div>
          {!latestFieldCheck.is_synced && (
            <button
              onClick={() => handleSyncFieldCheck(latestFieldCheck.id)}
              className="w-full mt-3 bg-purple-600 hover:bg-purple-700 text-white py-2 rounded text-sm"
            >
              사업장 정보에 반영
            </button>
          )}
          {latestFieldCheck.is_synced && (
            <div className="mt-3 text-xs text-green-600 font-medium flex items-center gap-1">
              <Check className="w-4 h-4" />
              반영 완료 ({formatDate(latestFieldCheck.synced_at)})
            </div>
          )}
        </>
      ) : (
        <p className="text-sm text-gray-500">현장 확인 데이터 없음</p>
      )}
    </div>
  </div>

  {/* 현장 확인 이력 테이블 */}
  <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
    <div className="px-4 py-3 bg-gray-50 border-b">
      <h4 className="font-semibold text-gray-800">현장 확인 이력</h4>
    </div>
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b">
          <tr>
            <th className="px-4 py-2 text-left">확인 일시</th>
            <th className="px-4 py-2 text-left">확인자</th>
            <th className="px-4 py-2 text-center">배출전류계</th>
            <th className="px-4 py-2 text-center">송풍전류계</th>
            <th className="px-4 py-2 text-center">상태</th>
            <th className="px-4 py-2 text-center">동작</th>
          </tr>
        </thead>
        <tbody>
          {fieldChecks.map((check) => (
            <tr key={check.id} className="border-b hover:bg-gray-50">
              <td className="px-4 py-2">{formatDateTime(check.checked_at)}</td>
              <td className="px-4 py-2">{check.checked_by}</td>
              <td className="px-4 py-2 text-center">
                <span className={
                  check.discharge_flowmeter !== selectedBusiness.discharge_flowmeter
                    ? 'text-red-600 font-semibold'
                    : 'text-gray-900'
                }>
                  {check.discharge_flowmeter}
                </span>
              </td>
              <td className="px-4 py-2 text-center">
                <span className={
                  check.supply_flowmeter !== selectedBusiness.supply_flowmeter
                    ? 'text-red-600 font-semibold'
                    : 'text-gray-900'
                }>
                  {check.supply_flowmeter}
                </span>
              </td>
              <td className="px-4 py-2 text-center">
                {check.is_synced ? (
                  <span className="inline-flex items-center gap-1 text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">
                    <Check className="w-3 h-3" />
                    반영됨
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full">
                    <Clock className="w-3 h-3" />
                    대기중
                  </span>
                )}
              </td>
              <td className="px-4 py-2 text-center">
                {!check.is_synced && (
                  <button
                    onClick={() => handleSyncFieldCheck(check.id)}
                    className="text-xs text-purple-600 hover:text-purple-800 underline"
                  >
                    반영
                  </button>
                )}
                {check.notes && (
                  <button
                    onClick={() => setViewingNotes(check)}
                    className="ml-2 text-xs text-blue-600 hover:text-blue-800"
                  >
                    메모
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
</Tab>
```

---

## 📊 구현 우선순위

### Phase 1: 데이터베이스 및 API (핵심)

1. **테이블 생성** - `equipment_field_checks` 테이블 생성
2. **API 구현**
   - `POST /api/equipment-field-checks` - 현장 확인 저장
   - `GET /api/equipment-field-checks` - 조회
   - `PUT /api/equipment-field-checks/sync/{id}` - 반영

### Phase 2: business 페이지 UI

1. 측정기기 수량 체크 섹션 리팩토링
2. 현장 확인 폼 구현
3. 대기필증/사무실 데이터 비교 표시
4. 저장 로직 구현

### Phase 3: Admin 모달 개선

1. "현장 확인 데이터" 탭 추가
2. 3계층 데이터 비교 카드
3. 현장 확인 이력 테이블
4. 반영 기능 구현

### Phase 4: 디버깅 로그 정리

1. `app/admin/business/page.tsx`에서 FACILITY-LOAD 로그 제거
2. 필요한 에러 로그만 유지

---

## 🧪 테스트 시나리오

### 시나리오 1: 현장 확인 데이터 저장

1. `business/[사업장명]` 접속
2. "측정기기 수량 체크" 섹션에서 값 입력
   - 배출전류계: 2
   - 송풍전류계: 1
   - 확인자: "홍길동"
3. "현장 확인 저장" 클릭
4. **기대 결과**:
   - ✅ `equipment_field_checks` 테이블에 저장
   - ✅ 토스트: "현장 확인 데이터가 저장되었습니다"
   - ✅ `is_synced = false`
   - ✅ `businesses` 테이블은 변경되지 않음

### 시나리오 2: Admin에서 데이터 비교 및 반영

1. `admin/business` 접속
2. 사업장 클릭하여 상세 모달 열기
3. "현장 확인 데이터" 탭 이동
4. 3계층 데이터 확인:
   - 대기필증: 배출시설 1개, 방지시설 1개
   - 사무실: 배출전류계 1개, 송풍전류계 0개
   - 현장: 배출전류계 2개, 송풍전류계 1개 (불일치!)
5. "사업장 정보에 반영" 클릭
6. **기대 결과**:
   - ✅ `businesses.discharge_flowmeter = 2`
   - ✅ `businesses.supply_flowmeter = 1`
   - ✅ `equipment_field_checks.is_synced = true`
   - ✅ `equipment_field_checks.synced_at = NOW()`
   - ✅ 토스트: "사업장 정보에 반영되었습니다"

### 시나리오 3: 현장 확인 이력 조회

1. Admin 모달 → "현장 확인 데이터" 탭
2. 현장 확인 이력 테이블 확인
3. **기대 결과**:
   - ✅ 모든 확인 이력 시간순 표시
   - ✅ 불일치 데이터는 빨간색으로 표시
   - ✅ 반영 상태 (대기중/반영됨) 표시

---

## 📁 영향 받는 파일

### 신규 파일

1. **sql/equipment_field_checks_table.sql**
   - 테이블 생성 SQL

2. **app/api/equipment-field-checks/route.ts**
   - POST, GET 엔드포인트

3. **app/api/equipment-field-checks/sync/[checkId]/route.ts**
   - PUT (반영) 엔드포인트

### 수정 파일

1. **components/sections/EnhancedFacilityInfoSection.tsx**
   - 측정기기 수량 체크 섹션 리팩토링
   - 현장 확인 저장 로직

2. **components/business/modals/BusinessDetailModal.tsx**
   - "현장 확인 데이터" 탭 추가
   - 3계층 비교 UI
   - 반영 기능

3. **app/admin/business/page.tsx**
   - 현장 확인 데이터 로딩 로직
   - 디버깅 로그 정리

4. **types/index.ts**
   - `EquipmentFieldCheck` 인터페이스 추가

---

## 🔄 마이그레이션 계획

### 기존 데이터 처리

**옵션 A: 데이터 유지 (추천)**
- 기존 `businesses.discharge_flowmeter`, `businesses.supply_flowmeter` 유지
- 신규 `equipment_field_checks` 테이블은 빈 상태로 시작
- 점진적으로 현장 확인 데이터 수집

**옵션 B: 초기 데이터 마이그레이션**
```sql
-- 기존 사업장 데이터를 초기 현장 확인으로 복사 (선택사항)
INSERT INTO equipment_field_checks (
  business_id,
  discharge_flowmeter,
  supply_flowmeter,
  checked_by,
  checked_at,
  is_synced,
  synced_at,
  notes
)
SELECT
  id,
  discharge_flowmeter,
  supply_flowmeter,
  'System Migration',
  created_at,
  true,
  created_at,
  '기존 데이터 마이그레이션'
FROM businesses
WHERE discharge_flowmeter IS NOT NULL OR supply_flowmeter IS NOT NULL;
```

---

## 📌 주요 변경 사항 요약

| 항목 | Before | After |
|------|--------|-------|
| **현장 확인 저장** | `businesses` 테이블 자동 업데이트 | `equipment_field_checks` 테이블에 별도 저장 |
| **사업장 정보 수정** | 현장 체크로 자동 변경 | Admin 명시적 반영 또는 직접 수정 |
| **데이터 비교** | 불가능 | 3계층 비교 (대기필증/사무실/현장) |
| **이력 관리** | 없음 | 모든 현장 확인 이력 추적 |
| **불일치 감지** | 없음 | 자동 감지 및 시각적 표시 |

---

## 🎯 기대 효과

1. **데이터 정확성 향상**
   - 현장 데이터와 사무실 데이터 명확히 구분
   - 변경 이력 완전 추적

2. **워크플로우 개선**
   - 현장 → 사무실 확인 → 반영 프로세스 명확화
   - Admin 승인 단계 추가로 데이터 품질 향상

3. **투명성 증가**
   - 누가, 언제, 어떤 값을 입력했는지 추적 가능
   - 불일치 데이터 시각적 식별

4. **유지보수성**
   - 데이터 소스 명확히 분리
   - 각 계층의 책임 명확화
