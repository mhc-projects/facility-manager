# 에코센스 → BlueOn AS관리 API 연동 가이드

**작성일**: 2026-03-11
**대상**: 에코센스 개발팀
**목적**: 에코센스 시스템에서 발생하는 AS 데이터를 BlueOn 시설관리 시스템에 실시간으로 전송

---

## 개요

에코센스 시스템에서 AS 접수/처리 데이터가 생성될 때, BlueOn 시스템의 API를 직접 호출하여 데이터를 전송합니다. 구글 시트 등 중간 매개체 없이 직접 연동합니다.

```
에코센스 시스템 → HTTP POST → BlueOn AS관리 API → BlueOn DB
```

---

## 기본 정보

| 항목 | 내용 |
|------|------|
| 서버 URL | `https://facility.blueon-iot.com` |
| API 엔드포인트 | `POST /api/external/as-records` |
| 인증 방식 | API Key (Bearer Token) |
| 데이터 형식 | JSON |
| 문자 인코딩 | UTF-8 |

---

## 인증

모든 요청에 BlueOn에서 발급한 API 키를 HTTP 헤더에 포함해야 합니다.

```
Authorization: Bearer {발급된_API_KEY}
Content-Type: application/json
```

> **API 키 발급**: BlueOn 담당자에게 요청하세요. API 키는 외부에 노출되지 않도록 안전하게 보관하세요.

---

## AS 데이터 전송 API

### 요청

```
POST https://facility.blueon-iot.com/api/external/as-records
```

### 요청 헤더

```http
Authorization: Bearer eyJhbGciOi...{발급된_API_KEY}
Content-Type: application/json
```

### 요청 본문 (Request Body)

```json
{
  "business_name_raw": "한국환경공단 수도권본부",
  "business_management_code": "1001",
  "site_address": "경기도 수원시 영통구 광교산로 94",
  "site_manager": "홍길동",
  "site_contact": "031-1234-5678",
  "receipt_date": "2026-03-10",
  "work_date": "2026-03-11",
  "receipt_content": "굴뚝 자동측정기 오류 발생, 측정값 이상",
  "work_content": "측정기 센서 교체 및 보정 완료",
  "as_manager_name": "김기사",
  "chimney_number": "3번 굴뚝",
  "dispatch_count": 1
}
```

> `business_name_raw` 또는 `business_management_code` 중 하나는 반드시 포함해야 합니다. 둘 다 있는 경우 `business_management_code`가 우선 적용됩니다.

### 필드 설명

| 필드명 | 타입 | 필수 여부 | 설명 | 예시 |
|--------|------|-----------|------|------|
| `business_name_raw` | string | **조건필수** | 사업장명 (관리코드가 없는 경우 필수) | `"한국환경공단 수도권본부"` |
| `business_management_code` | string | **조건필수** | 사업장 관리코드 (있으면 사업장명보다 우선) | `"1001"` |
| `site_address` | string | 선택 | 사업장 주소 | `"경기도 수원시 영통구..."` |
| `site_manager` | string | 선택 | 현장 담당자명 | `"홍길동"` |
| `site_contact` | string | 선택 | 현장 담당자 연락처 | `"031-1234-5678"` |
| `receipt_date` | string | 선택 | 접수일 (YYYY-MM-DD) | `"2026-03-10"` |
| `work_date` | string | 선택 | AS 완료일 (YYYY-MM-DD) | `"2026-03-11"` |
| `receipt_content` | string | 선택 | 접수 내용 (증상) | `"측정값 이상 발생"` |
| `work_content` | string | 선택 | 조치 내용 | `"센서 교체 및 보정 완료"` |
| `as_manager_name` | string | 선택 | AS 담당자명 | `"김기사"` |
| `chimney_number` | string | 선택 | 굴뚝 번호 | `"3번 굴뚝"` |
| `dispatch_count` | number | 선택 | 출동 횟수 (기본값: 1) | `1` |
| `status` | string | 선택 | AS 상태 (기본값: `scheduled`) | 아래 상태값 참고 |

#### AS 상태값 (status)

| 값 | 의미 |
|----|------|
| `scheduled` | 진행예정 (기본값) |
| `completed` | 진행완료 |
| `finished` | 완료 |
| `on_hold` | 보류 |
| `site_check` | 현장확인 |
| `installation` | 포설 |
| `completion_fix` | 준공보완 |
| `modem_check` | 모뎀확인 |

> **권장**: 에코센스에서 AS가 완료된 후 데이터를 전송하는 경우 `"status": "finished"` 를 사용하세요.

---

## 사용자재 데이터 전송 (선택)

AS 처리 시 사용된 자재를 함께 전송하려면, AS 레코드 생성 후 자재 API를 자재 개수만큼 호출합니다.
동일한 API 키로 인증합니다.

### 요청

```
POST https://facility.blueon-iot.com/api/as-records/{as_record_id}/materials
```

> `{as_record_id}`: AS 레코드 생성 응답에서 받은 `data.id` 값

### 요청 헤더

```http
Authorization: Bearer {발급된_API_KEY}
Content-Type: application/json
```

### 요청 본문 (자재 1건씩 전송)

```json
{
  "material_name": "먼지 센서 S301",
  "quantity": 1,
  "unit": "개",
  "unit_price": 150000
}
```

자재가 여러 개인 경우 각 자재마다 위 요청을 반복 호출합니다.

| 필드명 | 타입 | 필수 | 설명 |
|--------|------|------|------|
| `material_name` | string | **필수** | 자재명 |
| `quantity` | number | 선택 | 수량 (기본값: 1) |
| `unit` | string | 선택 | 단위 (기본값: `개`) |
| `unit_price` | number | 선택 | 단가 (기본값: 0) |

---

## 응답 형식

### 성공 응답 (201 Created)

```json
{
  "success": true,
  "data": {
    "id": "a1b2c3d4-e5f6-...",
    "business_name_raw": "한국환경공단 수도권본부",
    "receipt_date": "2026-03-10",
    "work_date": "2026-03-11",
    "status": "scheduled",
    "created_at": "2026-03-11T09:30:00.000Z"
  }
}
```

> `data.id` 값을 저장해두면 이후 자재 데이터 전송이나 상태 업데이트에 활용할 수 있습니다.

### 실패 응답

```json
{
  "success": false,
  "error": "사업장 ID 또는 사업장명이 필요합니다"
}
```

| HTTP 상태코드 | 의미 |
|---------------|------|
| `201` | 성공적으로 생성됨 |
| `400` | 잘못된 요청 (필드 누락 또는 형식 오류) |
| `401` | 인증 실패 (API 키 없음 또는 만료) |
| `500` | 서버 내부 오류 |

---

## 전체 전송 예시 (curl)

```bash
# 1. AS 레코드 생성
curl -X POST https://facility.blueon-iot.com/api/external/as-records \
  -H "Authorization: Bearer {발급된_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "business_name_raw": "한국환경공단 수도권본부",
    "business_management_code": "1001",
    "site_address": "경기도 수원시 영통구 광교산로 94",
    "site_manager": "홍길동",
    "site_contact": "031-1234-5678",
    "receipt_date": "2026-03-10",
    "work_date": "2026-03-11",
    "receipt_content": "굴뚝 자동측정기 오류 발생",
    "work_content": "측정기 센서 교체 및 보정 완료",
    "as_manager_name": "김기사",
    "chimney_number": "3번 굴뚝",
    "status": "finished",
    "dispatch_count": 1
  }'

# 응답 예시: {"success":true,"data":{"id":"a1b2c3d4-..."},...}
# data.id 값을 저장 후 자재 등록에 사용

# 2. 자재 등록 (선택, 자재 1건씩 전송)
curl -X POST https://facility.blueon-iot.com/api/as-records/{응답에서_받은_id}/materials \
  -H "Authorization: Bearer {발급된_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "material_name": "먼지 센서 S301",
    "quantity": 1,
    "unit": "개",
    "unit_price": 150000
  }'
```

---

## 전송 시점 권장사항

| 상황 | 권장 전송 시점 |
|------|----------------|
| AS 접수 즉시 전송 | `status: "scheduled"` 로 전송 (진행예정) |
| AS 완료 후 일괄 전송 | `status: "finished"` 로 전송 (가장 단순한 방식) |
| 실패 처리 | HTTP 응답 5xx인 경우 최대 3회 재시도 (30초 간격 권장) |

---

## 주의사항

1. **중복 전송 방지**: 동일한 AS 건이 중복으로 전송되지 않도록 에코센스 측에서 관리해주세요.
2. **날짜 형식**: 날짜는 반드시 `YYYY-MM-DD` 형식으로 전송해주세요. (예: `"2026-03-11"`)
3. **연결 타임아웃**: 응답 대기 시간은 30초를 권장합니다.
4. **API 키 보안**: API 키는 서버 환경변수로 관리하고 코드에 하드코딩하지 마세요.

---

## 문의

BlueOn 시스템 관련 문의: **블루온 개발팀**
