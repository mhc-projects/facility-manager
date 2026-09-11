# DPF 차량관리 — 사후관리(AS/크리닝) · 물류관리 기능 설계

> 설계 문서. 코드/마이그레이션은 아직 작성하지 않음. 사용자 승인 후 단계별 구현 진행.

## 1. 배경

DPF 담당자들이 크린어스(제조사, 후지노 계열) DEAR System(https://www.cleanearth.co.kr)의 UI에 익숙하다고 하여,
해당 시스템의 **사후관리 > 부착현황 / 물류관리 / 접수현황** 3개 화면 구조를 조사하고, 이를 facility-manager의
`/dpf` 모듈에 이식 가능한 형태로 재설계한다. 크린어스 시스템에서 블루온은 협력사(예: "AS_창원모터스")로 로그인되어 있었다 —
즉 우리가 본 것은 **협력사 관점**의 화면이다. 이 점이 몇 가지 설계 결정에 영향을 준다(§6 열린 질문 참고).

## 2. 참고 시스템 분석 (크린어스 DEAR System)

### 2.1 부착현황 (`/after/after.html`)
DPF 장착 차량의 마스터 리스트. 상단에 총계약/크리닝/AS/부품전달/요소수/엔진교체 건수를 숫자로만 보여주는 요약 바.
필터: 기간 프리셋(1/3/6/12개월) + 커스텀 날짜, 기준일(부착일) 토글, 최근/과거 정렬, 특판 체크박스, 지자체/처리점/장착점/장치종류 드롭다운,
계약자/연락처/차량번호/차대번호/차종/차명/톤/장치구분/부착시리얼 검색.
목록 컬럼: 계약자, 차량번호, 현재차량번호, 차대번호, 지자체, 차종, 차명, 구변일, 최근처리일, 마지막처리일, 부착장치, 부착시리얼,
**부착경과일, 크리닝횟수, AS횟수, 철부횟수(탈거횟수)**, 서류.
행마다 **"접수상담" / "엔진물류" 버튼이 항상 노출**되어 있어, 목록을 벗어나지 않고 바로 그 차량의 AS 접수 또는 물류(부품/요소수) 접수 화면으로 진입한다.

### 2.2 접수상담 상세 (`after_reg.html?c_code=...`) — "통합상담"
- **계약정보**: 차량번호/차대번호/차명/부착시리얼/장치종류/구변일/장착점/지자체 + 계약자 성함/유선/휴대폰/주소 (원본, 수정 버튼으로만 변경)
- **변경정보**: 현재차량번호/현재연락처(무선)/현재연락처(유선)/현재차대번호/출동지역 — "AS접수 시 자동 저장"이라는 안내 문구가 붙어 있음.
  즉 계약정보(최초 등록값)와 별개로, 현장에서 확인된 최신 정보를 덮어쓰지 않고 **오버레이로 누적**한다.
- 성능검사기간/보증기간/클리닝경과일/협회반납/주행시간/형식/요소수 보증기간/보조금 입금일자
- **등록(접수) 폼**: 접수종류, 시군구(시/도→시군구 연동), 접수일, 처리점(검색), 접수내용/세부내용, 담당AS기사,
  접수사항(긴급/통화요청/출동/입고 체크), 필터, 비용(유상/무상/유무상), 출동지역, 연락처(무선/유선), 접수(본사/협력사)
- **처리 등록**: 기사처리일자, 처리기사, **이름이 고정된 12개 첨부파일 슬롯**(차량사진 / 매연측정기 / 필터전단면 클리닝전·후 /
  필터일련번호 클리닝전·후 / 자가진단장치배압 전·후 / 매연검사결과표 전·후 / AS부품 / AS처리) — 개별 업로드 + 일괄 업로드
- **내역(하단 이력 테이블)**: 구분, **회차**, 접수일자, 처리일자, 협회청구일자, 처리점, 상태(진행중/완료), 접수항목,
  회수필터, 교체필터, 접수내용, 세부내용, 처리내용, 내역, 수정/처리

> "서류 보기" 버튼(목록의 마지막 컬럼)은 클릭해도 반응이 없어 상세 구조를 확인하지 못했다 — **미관찰**로 남긴다.
> **접수종류** 드롭다운도 옵션을 열어보지 못했다(클릭 위치가 빗나감) — 실제 하위 항목 체계는 미관찰이며, 1단계에서는
> `category`(as/clean/cs/parts_delivery/urea/engine_replace) 자체를 접수종류로 취급한다.

### 2.3 엔진물류 상세 (`after_reg_phy.html?c_code=...`)
접수상담과 동일한 계약정보 카드 + 훨씬 단순한 등록 폼(접수종류, **택배사**, 접수일, 접수내용, **주소**, 연락처, 접수(요청/고정))
+ 동일한 구조의 내역 테이블. **접수상담용 등록 폼의 부분집합**에 가깝다 — 별도 시스템이 아니라 같은 접수 메커니즘을
물류용으로 단순화한 변형으로 보인다.

### 2.4 물류관리 (`/after/after_phy.html`)
상단 요약: 요소수대기/완료, 부품전달대기/완료. 필터는 부착현황과 거의 동일 + 분류/상태/**택배** 드롭다운, 비용(전체/유상/무상),
협회청구(전체/청구/청구불가), 청구보류. 목록 컬럼은 부착현황과 거의 같고 **택배사(경동화물/직접배송/대신화물 등)** 컬럼이 추가되고
크리닝/AS 관련 컬럼(부착경과일 등)이 빠진다.

### 2.5 접수현황 (`/after/after_detail.html`) — 통합 티켓 큐
사후관리 전체(크리닝+AS+상담종료)를 한 화면에서 관리하는 마스터 리스트. 상단 요약: 크리닝대기/완료, AS대기/완료, 상담종료.
드롭다운 옵션을 직접 읽어 확인한 핵심 어휘:
- **분류**: `A/S` / `크리닝` / `상담종료`
- **상태**: `진행중` / `완료`
- **접수전체**: `본사` / `협력사`
- **전환전체**: `전환(C→AS)` / `전환(AS→C)` — **한 건이 접수 도중 크리닝 ↔ AS로 분류가 바뀔 수 있다**
- **지급불가전체**: `지급불가(접)` / `지급불가(완)` — 접수 시점/완료 시점 각각에 지급불가 처리 가능
- **처리점** 드롭다운에 `AS_부품전달`, `AS_엔진교체(본사)` 같은 항목이 섞여 있음 → **물류(부품전달/엔진교체)는 AS 처리점 체계 안의 특수 분류일 뿐, 별도 시스템이 아니다.**

목록 컬럼: 접수(본사/협력사), 접수일, 구변일, 분류, 계약자, 차량정보, 부착장치, **회차**, 처리점, 상태, **기사처리일자·처리일자·완료일자(3개 별도 날짜)**,
서류, **연장내역/연장승인**.

### 2.6 종합 결론
세 화면은 **테이블 3개가 아니라 같은 원장(ledger)의 필터링된 뷰 3개**다. "내역" 테이블 컬럼이 접수상담/엔진물류 양쪽에서 동일했고,
처리점 체계에 물류 항목이 포함돼 있었다. → 우리 설계도 **테이블 1개(`dpf_service_records`) + `category`** 로 통합하고,
접수현황/물류관리는 그 위의 필터 뷰로 만든다.

## 3. 기존 facility-manager와의 관계

### 3.1 이미 있는 것 (`/dpf`)
`types/dpf.ts` + `app/dpf/**`에 이미 `DpfVehicle`(마스터), `DpfDeviceInstallation`(설치/탈착/교체),
`DpfPerformanceInspection`(성능검사), `DpfSubsidyApplication`(보조금), `DpfCallMonitoring`(콜모니터링), 서식 자동입력(`DocumentsTab`)이 존재한다.
`/dpf` 목록(`DpfVehicleTable.tsx`)은 이미 raw_data 기반 확장 가능한 컬럼 구조이고, `/dpf/[vin]`은 탭 기반 상세(`ALL_TABS`, vendor별 노출 제어)로 되어 있어
새 기능을 얹기 좋은 구조다.

**빠진 것**: 크린어스의 접수현황/물류관리에 해당하는 "현장 AS/크리닝 접수 → 처리 → 완료" 운영 티켓 시스템이 없다.
설치·검사·보조금·콜모니터링은 모두 "발생 즉시 기록"하는 이력 테이블이지, "접수 → 진행중 → 완료"의 상태를 가진 업무 큐가 아니다.

### 3.2 `as_records`(사업장 AS)와는 왜 별개 테이블인가
`.claude/skills/as-management/SKILL.md`에 이미 AS(사후관리) 도메인이 있다. 하지만 `as_records`는 **`business_id`(사업장)에 귀속**되는
현장 설비 AS(포설/모덴/준공보완 등 8단계 상태, 유상/무상 26개월 보증 판정)로, 이번에 만들 것은 **`vehicle_id`(DPF 차량)에 귀속**되는
크리닝/필터교체/부품전달 접수다. 대상 엔티티가 다르고(사업장 vs 차량), 상태 체계도 다르고, 연결 컬럼도 없다 —
`as-management` 스킬 문서 안의 "`facility_tasks`의 `task_type='as'`와는 다른 시스템" 섹션과 동일한 패턴의 **의도된 병렬 시스템**이다.
새 테이블은 `as_records`를 재사용하지 않고 `dpf_service_records`로 신설한다.

## 4. 핵심 설계 결정

### 4.1 테이블: `dpf_service_records` 단일 원장 + `category`
```
category: 'as' | 'clean' | 'cs' | 'parts_delivery' | 'urea' | 'engine_replace'
```
- `as`/`clean`/`cs` → 접수현황 화면의 "분류"
- `parts_delivery`/`urea` → 물류관리 화면 (부품전달/요소수)
- `engine_replace`는 크린어스엔 없었지만 우리 DPF 데이터(`엔진교체건수` 통계)에 이미 존재하므로 같은 원장에 포함
- **부착현황/물류관리/접수현황 = 이 표 하나를 서로 다른 `category` 집합 + 컬럼셋으로 필터링한 뷰**

### 4.1.1 본사/협력사 구분 — 제외 (확정, 2026-09-11)
크린어스는 "접수(본사/협력사)"를 구분하지만, 블루온은 현재 콜센터가 전화를 전부 직접 받고 있어 접수 경로 구분이 불필요하다.
`reception_channel` 필드는 스키마에 넣지 않는다. 나중에 접수 경로를 다변화(예: 판매처 경유 접수 도입)하게 되면 그때 컬럼을 추가한다.

### 4.2 회차(round_no) 스코프 — 확정
부착현황 목록에 **크리닝횟수/AS횟수/철부횟수가 별도 컬럼**으로 나뉘어 있었다 → 회차는 **차량 단위가 아니라 (차량, category) 단위**로 증가한다.
`전환(C↔AS)` 발생 시에는 **전환되는 순간 새 category 기준으로 재채번**한다(사용자 확정, 2026-09-11).
예: 차량 A가 크리닝 1~3회차를 마치고, 4번째 접수가 처음엔 크리닝 4회차로 채번됐다가 현장에서 AS로 전환되면 —
그 건은 AS 카테고리의 다음 번호(예: 이미 AS 2건이 있었다면 AS 3회차)로 다시 채번되고, "원래 크리닝 4회차였다"는 사실만
`converted_from_category`에 흔적으로 남는다. 부착현황의 크리닝횟수/AS횟수 집계는 항상 **현재 분류 기준**으로 깔끔하게 맞아떨어진다.

**채번 메커니즘(2026-09-11, 어드바이저 검토 반영)**: API가 `round_no`를 계산해서 넣지 않는다 — "MAX 조회 → +1 → INSERT"를
일반 Supabase JS 호출로 하면 동시 접수 시 경쟁 상태(race)가 생긴다. `lib/supabase-direct`에 `transaction()` 헬퍼가 있긴 하지만,
전자결재 approve/submit 라우트가 이걸 빠뜨려서 부분 업데이트 버그가 났던 전례가 있다(`project_approval_pending_fixes` 메모리) —
API 코드가 매번 트랜잭션을 기억해서 감싸야 하는 방식은 이 프로젝트에서 이미 한 번 새어나간 적이 있으므로, 더 안전한 **DB 트리거**로
INSERT 시, 그리고 UPDATE로 `category`가 바뀔 때 `round_no`를 자동 계산하게 한다(§5) — API가 무엇을 하든 DB가 보장한다.
동시 접수가 겹치면 유니크 인덱스 위반(`23505`)이 날 수 있는데, 이건 받아들이고 **API에서 1회만 재시도**한다 — 트리거가 다시
MAX를 계산하므로 재시도하면 해소된다. 회차 번호에 이빨(gap)이 생기는 것은 허용하고, 이미 매겨진 다른 행의 번호는 절대 재부여하지 않는다.

### 4.3 전환(conversion)
접수 도중 크리닝 건이 AS로(또는 반대로) 바뀌는 경우가 실제로 존재한다. `converted_from_category` 컬럼으로 원래 분류를 남기고,
전환 시점에 `round_no`는 §4.2 규칙대로 새 category 기준으로 재계산한다.

### 4.4 담당자 2명 · 날짜 3개
크린어스는 `담당AS기사`(접수 시 배정)와 `처리기사`(실제 처리)를 구분하고, `기사처리일자`/`처리일자`/`완료일자`를 각각 별도로 기록한다.
하나로 뭉치지 않고 6개 컬럼(담당자 2 + 날짜 3 + 완료일 1)으로 그대로 가져간다 — 나중에 SLA(접수→기사처리→완료 소요시간) 분석에 필요.

### 4.5 청구(billing) 체인은 status와 분리
`상태(진행중/완료)`와 `협회청구일자` + `청구/청구불가(접)/청구불가(완)/청구보류`는 서로 다른 축이다.
완료된 건도 청구 불가 처리될 수 있고, 진행 중에 이미 청구 불가가 확정될 수도 있다 — 하나의 `billing_status`로 합치지 않고
`association_billing_date` + `billing_status`(none/billed/unbillable_at_reception/unbillable_at_completion/held) 로 분리한다.

### 4.6 변경정보 오버레이 — 확정 (2026-09-11, 어드바이저 지적으로 2026-09-11 재수정)
크린어스는 계약정보(최초 등록)와 변경정보(현장에서 최신화된 값)를 분리해서 보여주고, "AS접수 시 자동 저장"된다.
우리 `DpfVehicle`은 이미 `plate_number`(현재값)와 `plate_number_original`(과거값) 패턴을 쓰고 있어 크린어스와 필드 역할이 반대다.
**차량 마스터(`dpf_vehicles`)에 오버레이 컬럼을 추가하는 방식으로 확정**한다 — 임포트 원본 필드는 그대로 두고, nullable 오버레이 컬럼을 추가한다.
부착현황 목록(§8.3)에서 조인·서브쿼리 없이 바로 조회하기 위함 — 크린어스 부착현황 목록도 "현재차량번호"를 별도 컬럼으로
물리화해서 보여주고 있었다(§2.1).

**컬럼과 write-back 경로를 명확히 분리한다** (1차 초안은 §4.7의 접수 등록 폼에 없는 필드까지 자동 write-back한다고 잘못 적었음 — 수정):

| 오버레이 컬럼 | 소스 | 갱신 방식 |
|---|---|---|
| `current_contact_wireless` / `current_contact_wired` | `dpf_service_records.contact_wireless` / `contact_wired` | 접수 등록 폼에 실제로 있는 필드 → **자동 write-back** |
| `dispatch_area_primary` / `dispatch_area_secondary` | `dpf_service_records.dispatch_area_primary` / `dispatch_area_secondary` | 접수 등록 폼에 실제로 있는 필드(2칸, 크린어스도 `/` 로 구분된 2칸이었다) → **자동 write-back** |
| `current_plate_number` | 없음 | 접수 등록 폼에 차량번호 입력란이 없다(§2.2에 나열된 필드 어디에도 없음) → **수동 전용**, `VehicleFormModal`에서만 직접 수정 |
| `current_vin_override` | 없음 | 위와 동일 이유로 **수동 전용**, `VehicleFormModal`에서만 직접 수정 |
| `is_special_management` | 없음(신규 필드) | **수동 전용**, `VehicleFormModal` 체크박스 |

**write-back 타이밍**: 서비스 레코드 저장 API(§7의 `POST /api/dpf/vehicles/[vin]/service-records`, `PUT .../service-records/[id]` —
기존 sub-record 라우트 컨벤션대로 PATCH 대신 PUT 사용, 1단계 구현 시 확정)에서
연락처·출동지역 값이 입력되면 차량 마스터에 반영하되, **PUT은 그 레코드가 해당 차량의 최신 레코드(가장 최근 `reception_date`)일 때만
write-back한다** — 오래된 티켓을 수정한다고 더 최신 접수에서 확인된 연락처를 덮어쓰면 안 되기 때문이다. POST(신규 접수)는 항상 최신이므로
조건 없이 write-back한다.

### 4.7 첨부파일 — 보류 (확정, 2026-09-11)
크린어스의 "서류 보기" 상세를 관찰하지 못했고(§6-3), 담당자들이 실제로 어떤 서류를 첨부/조회하고 싶어하는지도 아직 모른다.
**이름 있는 12슬롯 첨부파일 구조(§2.2)는 설계만 남겨두고 1단계 구현에서는 만들지 않는다.** 대신 `dpf_service_records`에
범용 `notes`(비고) 필드만 두고, 담당자 요구가 구체화되면 그때 `dpf_service_record_attachments` 테이블과 슬롯 UI를 추가한다.
저장 방식은 정해두면 기존 `app/api/wiki/upload-guideline/route.ts`가 쓰는 패턴(공개 Supabase Storage 버킷, `supabaseAdmin.storage`)을
재사용하는 것으로 — 같은 `dpf-documents` 버킷 아래 `service-records/{record_id}/{slot_key}.{ext}` 경로.

### 4.8 연장(마감 연장) — 전자결재 미연동, 단순 처리 (확정, 2026-09-11)
크린어스의 연장내역/연장승인은 전자결재(`approval` 스킬)와 별개로 둔다. `dpf_service_records`에
`extension_requested`/`extension_approved`/`extension_note` boolean·text 필드만으로 단순하게 처리한다 — 별도 결재 라인이나
승인 워크플로우를 새로 만들지 않는다.

### 4.9 처리내용(processing_content) 컬럼 누락 — 추가 (어드바이저 지적, 2026-09-11)
§2.2의 "내역" 테이블에 접수내용/세부내용과 별개로 **처리내용** 컬럼이 있었다 — 1차 초안 스키마에 빠져 있었다. 기사가 실제로
무엇을 했는지 적는 필드이므로 `processing_content text`를 추가한다.

### 4.10 삭제 ≠ 취소 (어드바이저 지적, 2026-09-11)
`association_billing_date`(협회청구)를 들고 있는 원장을 하드 삭제하면 청구 이력이 사라진다. `as_records`/`dpf_vehicles` 둘 다
`is_deleted` 소프트 삭제 패턴을 쓰고 있으므로 동일하게 맞춘다 — `is_deleted boolean default false` 추가, DELETE API는 하드 삭제가
아니라 `is_deleted = true`로 갱신. 또한 크린어스 접수현황 필터에 "취소" 체크박스가 있었던 것으로 보아 **취소(고객이 접수를 철회)는
삭제와 다른 개념**이다 — `status` CHECK에 `'cancelled'`를 추가한다(`in_progress`/`completed`/`cancelled`).

### 4.11 지자체/처리점은 자유 텍스트, 코드 테이블 없음 (어드바이저 지적, 2026-09-11)
1차 초안의 `local_gov_code`/`service_branch_id`는 참조할 코드 테이블이 프로젝트에 없다(크린어스의 지자체 168개·처리점 목록은
크린어스 자체 마스터 데이터이지 우리 쪽에 없음). `DpfVehicle.local_government`와 이름을 맞춰 `local_government text`,
`service_branch text`로 자유 텍스트 입력으로 바꾼다. 담당AS기사/처리기사도 1단계에서는 자유 텍스트로 두고(`employees` 테이블
연동은 후속 과제로 컨텍스트 노트에 남긴다), 드롭다운/자동완성은 실제 처리점·기사 목록이 쌓인 뒤 UI에서만 개선한다.

### 4.12 특판(is_special_sale)은 차량 속성, 레코드 속성이 아님 (어드바이저 지적, 2026-09-11)
크린어스 부착현황/물류관리 필터의 "특판" 체크박스는 **차량(계약) 목록**을 필터링하는 조건이었다 — 접수 건마다 다른 값이 아니라
그 차량 자체가 특판 계약인지를 나타낸다. `dpf_service_records`가 아니라 `dpf_vehicles` 오버레이에 `is_special_sale boolean`으로 둔다.

## 5. DB 스키마 초안 (마이그레이션 아님, 설계 참고용)

```sql
-- dpf_service_records: 접수현황/물류관리/부착현황 통계의 단일 원천
-- 기존 dpf_* 이력 테이블(20260424_create_dpf_tables.sql)과 동일한 컨벤션을 따른다
-- (created_by는 employees FK, RLS는 permission_level >= 2, updated_at은 API에서 수동 설정 — 이 프로젝트 dpf 테이블엔 DB 트리거가 없다)
create table dpf_service_records (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references dpf_vehicles(id) on delete cascade,
  category text not null check (category in ('as','clean','cs','parts_delivery','urea','engine_replace')),
  converted_from_category text check (converted_from_category in ('as','clean','cs','parts_delivery','urea','engine_replace')),
  round_no int not null,                          -- (vehicle_id, category) 내 순번 — 트리거가 채번, API는 세팅 안 함(§4.2)
  status text not null default 'in_progress' check (status in ('in_progress','completed','cancelled')),
  is_deleted boolean not null default false,      -- 소프트 삭제(§4.10), status의 cancelled와는 별개 축

  reception_date date,
  reception_content text,
  detail_content text,
  processing_content text,                        -- 처리내용(§4.9)

  local_government text,                          -- 자유 텍스트(§4.11)
  service_branch text,                            -- 자유 텍스트(§4.11)

  assigned_as_technician text,                     -- 담당AS기사, 자유 텍스트(§4.11)
  processing_technician text,                      -- 처리기사, 자유 텍스트(§4.11)
  technician_processed_at date,
  processed_at date,
  completed_at date,

  is_urgent boolean default false,
  needs_callback boolean default false,
  is_dispatch boolean default false,
  is_dropoff boolean default false,
  filter_type text,
  collected_filter text,
  replaced_filter text,

  cost_type text check (cost_type in ('paid','free','mixed')),
  association_billing_date date,
  billing_status text default 'none' check (billing_status in ('none','billed','unbillable_reception','unbillable_completion','held')),

  dispatch_area_primary text,                      -- 크린어스도 '/'로 구분된 2칸(§4.6)
  dispatch_area_secondary text,
  contact_wireless text,
  contact_wired text,

  courier text,                                    -- parts_delivery/urea 전용
  delivery_request_type text check (delivery_request_type in ('request','fixed')),
  delivery_address text,

  extension_requested boolean default false,
  extension_approved boolean,
  extension_note text,

  notes text,
  created_by uuid references employees(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on dpf_service_records(vehicle_id);
create index on dpf_service_records(category, status);
create unique index on dpf_service_records(vehicle_id, category, round_no);

-- round_no 자동 채번 트리거(§4.2) — INSERT 시, 그리고 UPDATE로 category가 바뀔 때만 재계산
create or replace function dpf_service_records_set_round_no()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' or new.category is distinct from old.category then
    select coalesce(max(round_no), 0) + 1 into new.round_no
    from dpf_service_records
    where vehicle_id = new.vehicle_id and category = new.category;
  end if;
  return new;
end;
$$;

create trigger trg_dpf_service_records_round_no
  before insert or update of category on dpf_service_records
  for each row execute function dpf_service_records_set_round_no();

-- 첨부파일 테이블(dpf_service_record_attachments)은 1단계에서 만들지 않는다 (§4.7, 보류 확정).
-- 담당자 요구가 구체화되면 그때 아래 형태로 추가:
--   dpf_service_record_attachments(id, record_id, slot_key, file_url, uploaded_at)

-- dpf_vehicles 오버레이 컬럼 (§4.6, 확정 — write-back 대상/수동 전용 구분은 §4.6 표 참고)
alter table dpf_vehicles
  add column current_contact_wireless text,        -- write-back
  add column current_contact_wired text,            -- write-back
  add column dispatch_area_primary text,             -- write-back
  add column dispatch_area_secondary text,            -- write-back
  add column current_plate_number text,               -- 수동 전용(VehicleFormModal)
  add column current_vin_override text,                -- 수동 전용(VehicleFormModal)
  add column is_special_management boolean default false, -- 수동 전용(VehicleFormModal)
  add column is_special_sale boolean default false;        -- 수동 전용(VehicleFormModal), §4.12

-- RLS: 같은 도메인인 dpf_device_installations 등과 동일한 패턴 (as_records가 아니라 20260424 마이그레이션 스타일)
alter table dpf_service_records enable row level security;
drop policy if exists "dpf_service_records_read"  on dpf_service_records;
drop policy if exists "dpf_service_records_write" on dpf_service_records;
create policy "dpf_service_records_read" on dpf_service_records
  for select using (auth.role() = 'authenticated');
create policy "dpf_service_records_write" on dpf_service_records
  for all using (
    exists (select 1 from employees where id = auth.uid() and permission_level >= 2)
  );
```

## 6. 열린 질문 — 전부 확정 (2026-09-11 사용자 확인)

1. **본사/협력사(접수 경로)**: 구분하지 않음. 블루온은 현재 콜센터가 전화를 전부 직접 받고 있어 경로 구분이 불필요 →
   `reception_channel` 필드 제외(§4.1.1).
2. **크린어스를 vendor로 추가할지**: 지금은 추가하지 않음. `DpfVehicle.vendor`는 `'fujino' | 'mz'` 그대로 유지.
   담당자들이 필요하다고 하면 그때 vendor enum을 확장한다.
3. **"서류" 상세 화면 미관찰 / 첨부파일 구조**: 1단계에서 만들지 않음. 담당자들이 실제로 필요로 하는 서류가 구체화되면
   그때 `dpf_service_record_attachments` 테이블과 슬롯 UI를 추가한다(§4.7).
4. **회차 채번 규칙**: 전환(C↔AS) 시 **새 category 기준으로 재채번**, 원래 분류는 `converted_from_category`에만 흔적으로 남긴다(§4.2).
5. **연장 워크플로우**: 전자결재(`approval` 스킬)와 연동하지 않고 `dpf_service_records` 안의 단순 boolean 필드로 처리한다(§4.8).

## 7. API 설계

**1단계 (어드바이저 지적으로 기존 서브레코드 라우트 패턴을 그대로 따르도록 수정, 2026-09-11)**: `installations`/`inspections`/
`subsidies`/`calls`와 동일하게 차량(`vin`) 스코프 하위 라우트로 만든다 — 별도 `/api/dpf/service-records` 최상위 엔드포인트는
2단계(접수현황 통합 리스트)에서 추가한다.

- `GET /api/dpf/vehicles/[vin]/route.ts`의 기존 `GET` 핸들러에 `dpf_service_records` 조회를 추가해 응답에 `serviceRecords` 필드로 포함시킨다
  (`installations`/`inspections`/`subsidies`/`callMonitoring`과 나란히, `Promise.all`에 한 줄 추가) — 탭이 상세 페이지 로드와 동시에 뜬다.
- `POST /api/dpf/vehicles/[vin]/service-records/route.ts` — `installations/route.ts`와 동일한 패턴(vin→vehicle_id 조회 후 insert).
  연락처/출동지역 값이 있으면 §4.6 표대로 `dpf_vehicles` write-back까지 같은 요청에서 처리.
- `PUT /api/dpf/vehicles/[vin]/service-records/[id]/route.ts` — 상태 전이(진행중→완료/취소), 처리 등록(처리기사/처리일자/처리내용 등) 수정
  (기존 installations/inspections 등 sub-record 라우트가 전부 PUT을 쓰고 있어 컨벤션 일치를 위해 PATCH 대신 PUT으로 구현함, 1단계에서 확정).
  연락처/출동지역이 바뀌고 이 레코드가 해당 차량의 최신 레코드일 때만 write-back(§4.6).
- `DELETE /api/dpf/vehicles/[vin]/service-records/[id]/route.ts` — 하드 삭제 아님, `is_deleted = true` 갱신(§4.10).
- INSERT가 `23505`(round_no 유니크 위반, §4.2)로 실패하면 API에서 **1회만 재시도**.
- 인증: 기존 `/api/dpf/**`와 동일하게 `requireAuth(request, 1)` 사용, RLS는 서버 전용(§5).

**2단계에서 추가** (구체화, 2026-09-11 어드바이저 검토):
- `GET /api/dpf/service-records` — 접수현황/물류관리 통합 목록. **기존 `/api/dpf/search/route.ts`의 쿼리 파라미터명·페이지네이션 계약·응답
  모양을 그대로 따른다**(`q`/`page`/`pageSize` → `{ vehicles, total, page, pageSize }` 패턴을 `{ records, total, page, pageSize }`로).
  필터: `category`(복수 가능), `status`, `local_government`, `service_branch`, `billing_status`, 기간(접수일 기준), 차량번호/차대번호/계약자 텍스트 검색.
  차량 정보(차량번호/차대번호/소유자/차명/지자체) 조인이 필요 — `dpf_service_records`에서 `.select('*, dpf_vehicles!inner(vin, plate_number, owner_name, vehicle_name, local_government)')`,
  양쪽 다 `is_deleted = false` 조건. POST는 2단계에 없음 — 등록은 계속 차량 상세(1단계 라우트)에서만 한다(§8.1의 "빠른 등록 없음" 참고).
- `GET /api/dpf/service-records/stats` — 요약 바용 집계(크리닝대기/완료, AS대기/완료, 상담종료). **행을 가져와서 세지 않는다, 카운터를 저장하지 않는다** —
  category × status 조합별로 `.select('id', { count: 'exact', head: true })` 병렬 호출(6개 내외, 이 규모에서는 RPC/집계함수 불필요).
- (보류) `POST .../attachments` — 첨부파일 구체화되면 추가(§4.7·§6-3)

## 8. UI 설계

### 8.1 `/dpf/service` — 접수현황 (신규 페이지, 2026-09-11 어드바이저 검토로 구체화)
크린어스 접수현황과 동일한 목적. 상단 요약 바(크리닝대기/완료, AS대기/완료, 상담종료 — 전부 §7 stats 엔드포인트에서 실시간 계산),
필터 바는 **새로 설계하지 않고 `/dpf`(부착현황) 페이지의 기존 패턴(검색행 + 확장 필터 패널 + 탭 행)을 그대로 재사용**한다 — 기간 프리셋(1/3/6/12개월),
분류, 상태, 지자체, 처리점, 차량번호/차대번호/계약자 텍스트 검색.
목록 테이블은 `DpfVehicleTable.tsx`와 같은 구조(고정 `COLUMNS` 배열 + `cellValue` switch + 페이지네이션)의 신규 `DpfServiceRecordTable.tsx`.
행 클릭 시 `/dpf/[vin]?tab=service`로 이동 — 상세 페이지(`app/dpf/[vin]/page.tsx`)가 `?tab=` 쿼리 파라미터로 초기 `activeTab`을 정할 수 있도록
작은 변경 추가(현재는 항상 `'basic'`으로 시작).
행 액션 버튼(수정/처리)은 **항상 노출**한다 — hover로 감추지 않는다(`feedback_dashboard_ux_conventions`: 호버 금지 컨벤션,
`/dpf/[vin]`의 기존 이력 탭들이 쓰는 `opacity-0 group-hover:opacity-100` 패턴을 새 테이블엔 적용하지 않음).
**이 페이지에 "빠른 등록" 버튼을 넣지 않는다** — 크린어스 접수현황도 등록은 차량(부착현황) 쪽에서만 하고, 목록에서 바로 만들 수 없다.
신규 접수 생성용 차량 선택 UI는 3단계(부착현황 행 액션 버튼) 몫으로 명시적으로 미룬다.
사이드바에 `DPF업무` 그룹의 "차량 관리" 옆에 "접수현황" 항목을 새로 추가한다(`components/ui/AdminLayout.tsx`의 `navItems`,
`ClipboardList` 아이콘 재사용 — 이미 import돼 있음).

### 8.2 `/dpf/service/logistics` — 물류관리 (신규 페이지, 8.1과 컴포넌트 공유)
`category in ('parts_delivery','urea')`로 고정 필터링된 `/dpf/service`의 변형. 택배사 컬럼 추가, 크리닝/AS 전용 컬럼 제거.
목록 테이블 컴포넌트는 컬럼셋을 props로 받는 형태로 공유(`DpfServiceRecordTable` + `columns` variant).

### 8.3 `/dpf` (부착현황) 확장 — 기존 페이지에 컬럼 추가
새 페이지를 만들지 않고 기존 `DpfVehicleTable.tsx`의 `COLUMNS`에 파생 컬럼을 추가한다:
`최근접수일`/`마지막처리일`(해당 차량 최신 `dpf_service_records` 조회), `크리닝횟수`/`AS횟수`(category별 COUNT),
`철부횟수`(기존 `dpf_device_installations`에서 `action_type='remove'` COUNT — 새 테이블 불필요),
`부착경과일`(`today - installation_date`, 클라이언트 계산). 행마다 **"접수" / "물류" 버튼을 항상 노출**하여 클릭 시
`dpf_service_records` 빠른 등록 모달(카테고리 사전 선택)을 연다.

### 8.4 `/dpf/[vin]` 상세 — 새 탭 추가
`ALL_TABS`에 `{ key: 'service', label: 'AS/크리닝', vendors: ['fujino','mz'] }` 추가 — **벤더 제한 없음**
(기존 설치이력/성능검사/보조금 탭은 `vendors: ['fujino']`로 제한돼 있지만, AS/크리닝은 벤더 무관 운영 업무이므로 양쪽 다 노출).
탭 내용: 등록 폼(§4의 필드) + 내역 리스트(회차/상태/처리점/3개 날짜). 첨부파일 슬롯은 1단계에서 제외(§4.7).
기존 `SubRecordFormModal.tsx` 패턴을 확장하거나 새 `ServiceRecordFormModal.tsx`로 분리 — 필드 수가 훨씬 많으므로(§5) 별도 컴포넌트 권장.
데이터는 `/dpf/[vin]` 페이지의 기존 `loadDetail()`이 호출하는 `GET /api/dpf/vehicles/[vin]` 응답에 실린 `serviceRecords`를 그대로 쓴다(§7) —
탭 전환 시 별도 API 호출이 없다, 기존 installations/inspections/subsidy/call 탭과 동일한 방식.

**변경정보 오버레이 표시 (2단계 범위로 추가, 2026-09-11 어드바이저 지적)**: 1단계는 write-back만 구현했고 이 값을 보여주는 화면이 없다 —
`VehicleFormModal`도 `BasicInfoTab`도 `current_*`/`is_special_*` 필드를 노출하지 않는다. 사용자가 변경정보를 찾다가 없는 걸 알게 되는 것보다,
가장 저렴한 위치인 `BasicInfoTab`(§4의 "접수 / 행정" 섹션 아래)에 읽기 전용 "변경정보" 섹션을 2단계에서 추가한다 — 현재차량번호/현재연락처(무선·유선)/
출동지역/특별관리대상/특판. 수정은 여전히 `VehicleFormModal`에서만(§4.6).

## 9. 구현 단계 제안 (CLAUDE.md: 한 번에 하나의 기능)

### 1단계 세부 순서 (핵심 — 지금 진행할 범위)
1. 마이그레이션 SQL 파일 작성 → `supabase/migrations/20260911_dpf_service_records.sql` (§5 내용). **직접 실행하지 않는다** —
   `feedback_supabase_sql` 메모리 원칙대로 파일만 작성해서 사용자에게 전달하고, 사용자가 Supabase에서 직접 실행할 때까지 대기한다.
   `project_hardcoded_db_password_incident`(로테이션 미완료) 때문에도 DB 접속 자격 증명을 직접 다루지 않는다.
2. 사용자가 마이그레이션 적용을 확인해주면 → `types/dpf.ts`에 `DpfServiceRecord` 인터페이스 추가, `DpfVehicle`에 오버레이 필드(§4.6/§4.12) 추가.
3. API 3개 라우트 작성(§7 1단계 목록) — `app/api/dpf/vehicles/[vin]/route.ts` GET에 `serviceRecords` 추가,
   `.../service-records/route.ts`(POST), `.../service-records/[id]/route.ts`(PUT/DELETE).
4. UI — `/dpf/[vin]`에 "AS/크리닝" 탭 추가(§8.4), `ServiceRecordFormModal.tsx` 신설.
5. 검증: dev 서버가 떠 있는 동안은 **`npm run build` 대신 `npx tsc --noEmit`**(`feedback_no_build_during_dev_server` 메모리),
   브라우저 확인은 **하드 리로드(Cmd+Shift+R)**로(`feedback_local_test_hard_reload`), **localhost 개발 서버만** 상태 변경 테스트
   (프로덕션에 POST/PATCH/DELETE 직접 호출 금지).
6. 커밋은 3개로 분리: (a) 마이그레이션 파일 + `types/dpf.ts`, (b) API 3개 라우트, (c) UI(탭 + 모달). 각 커밋 전 위 검증 통과 확인.
7. `.claude/skills/db-schema/SKILL.md`에 `dpf_service_records` 테이블 추가, `claudedocs/dpf-service-records/context-notes.md`에
   실제 적용하며 발견한 것들 기록(§10).

### 2단계 세부 순서 (2026-09-11 어드바이저 검토로 구체화, 마이그레이션 없음)

**세부 결정 4가지 (2026-09-11, 코드 작성 전 확정):**
- **날짜 필터 기준**: 2단계는 `reception_date` 고정, 크린어스처럼 접수일/처리일/기사처리일/완료일/등록일 드롭다운은 **의도적으로 미룬다**
  (3단계 이후 재검토 대상으로 여기 명시해둠 — 나중에 "빠졌다"고 재논의하지 않도록).
- **요약 바 집계 의미**: 크리닝대기=`category='clean' AND status='in_progress'`, 크리닝완료=`status='completed'`,
  AS대기/완료도 동일 패턴. `cancelled`(취소)는 대기/완료 어느 쪽에도 넣지 않고 집계에서 제외한다. 상담종료(`cs`)는 상태 구분 없이 전체 건수 1개만 보여준다.
  즉 쿼리는 **5개**(크리닝대기/완료, AS대기/완료, 상담종료 전체) — §7의 "6개 내외"는 이 표현으로 수정.
- **`?tab=` 상태 관리**: URL을 진실의 원천으로 동기화하지 않는다 — `useSearchParams()`로 **한 번만 읽어 `useState` 초기값**으로 쓰고,
  이후 탭 전환은 기존처럼 로컬 state만 바꾼다(`/dpf` 필터가 URL과 동기화하지 않는 것과 동일한 패턴). `useSearchParams()`를 쓰는 컴포넌트는
  `<Suspense>`로 감싸야 하며(Next.js App Router 요구사항), `app/admin/meeting-minutes/page.tsx`가 쓰는 정확한 패턴(내부 컴포넌트 + 기본 export가
  Suspense로 감싸는 래퍼)을 그대로 따른다. `searchParams?.get('tab')`처럼 옵셔널 체이닝으로 접근 — `meeting-minutes/page.tsx:40`이
  `searchParams.get(...)`을 옵셔널 체이닝 없이 써서 겪고 있는 기존 TS18047(`possibly 'null'`) 오류를 반복하지 않는다.
- **테스트 데이터 정리는 매번 반복되는 절차다**: 브라우저로 mutation을 검증하면 항상 실제 차량 1대에 흔적이 남는다 — 이번에도, 다음에도.
  검증이 끝날 때마다 정리 SQL을 사용자에게 함께 전달한다(직접 실행 안 함, `feedback_supabase_sql`).

**구현 순서:**
1. `GET /api/dpf/service-records`(§7) — `/api/dpf/search/route.ts` 패턴 그대로, `dpf_vehicles` 조인 포함.
   조인 타입은 `types/dpf.ts`에 `DpfServiceRecordWithVehicle = DpfServiceRecord & { dpf_vehicles: Pick<DpfVehicle, 'vin'|'plate_number'|'owner_name'|'vehicle_name'|'local_government'> }`로
   한 번만 정의(인라인 금지). Supabase `!inner` 조인 + `.or()`로 차량번호/차대번호 텍스트 검색 시 `dpf_vehicles.plate_number.ilike.%q%` 형태 —
   레코드 1건으로 먼저 테스트 후 전체 필터 바 조립.
2. `GET /api/dpf/service-records/stats`(§7) — 위 집계 의미대로 count 쿼리 병렬 5개.
3. `DpfServiceRecordTable.tsx` 신규 — `DpfVehicleTable.tsx`의 `COLUMNS`+`cellValue` 구조 복제, 조인 필드는 `record.dpf_vehicles.*`로 접근.
   행 클릭은 `DpfVehicleTable`처럼 차량번호/차대번호 셀만 링크로 만들고(행 액션 버튼과 클릭 영역 겹치지 않게), `<tr>` 전체 클릭은 쓰지 않는다.
4. `/dpf/service/page.tsx` 신규 — `/dpf/page.tsx:35-57`의 debounce(`search`+`triggerSearch`, 300ms) 패턴 그대로 복제, 필터 바도 `/dpf`의
   검색행+확장 필터 패널+탭 행 재사용. 기간 프리셋(1/3/6/12개월)은 한 줄로 붙는 수준이면 포함, 아니면 `from`/`to`만으로 미룬다.
   `service_branch`/`local_government`는 드롭다운 아닌 자유 텍스트 `ilike`(§4.11), `billing_status`는 select로 포함.
   "빠른 등록" 버튼 없음(§8.1).
5. `app/dpf/[vin]/page.tsx`에 `?tab=` 초기 탭 지정 — 위 결정대로 Suspense 래핑 + 옵셔널 체이닝.
6. `BasicInfoTab`에 변경정보 읽기 전용 섹션 추가(§8.4).
7. `components/ui/AdminLayout.tsx`의 `DPF업무` 그룹에 "접수현황" 사이드바 항목 추가(`ClipboardList` 아이콘 재사용).
8. 검증: `tsc --noEmit`, 하드 리로드, 모든 필터 조합 실사용, 요약 바 숫자와 테이블 실제 건수 일치 확인, `/dpf`·`/dpf/[vin]` 회귀 없음 확인.
9. 새 테이블/마이그레이션이 필요하다고 느껴지면 멈추고 먼저 확인한다 — 2단계는 1단계 데이터의 조회 레이어일 뿐이어야 한다.

**커밋 3개** (2026-09-11 어드바이저 지침): (a) API(목록+통계), (b) 테이블 컴포넌트+페이지+사이드바, (c) 상세 페이지 `?tab=`+`BasicInfoTab` 오버레이 섹션.
(c)만 1단계 파일을 건드리므로, 되돌릴 때 목록 페이지까지 같이 날아가지 않도록 따로 분리한다.

### 이후 단계
3. **3단계**: `/dpf` 부착현황에 파생 컬럼 + 접수/물류 행 액션 버튼 추가.
4. **4단계**: `/dpf/service/logistics` 물류관리 필터 뷰.
5. **5단계 (보류, 필요시)**: 담당자 요구가 구체화되면 `dpf_service_record_attachments` 테이블 + 첨부파일 슬롯 UI 추가(§4.7).

각 단계 종료 시 검증(위 5번) + 브라우저 확인 후 커밋(CLAUDE.md 세션 종료 체크리스트 준수). 진행 상황은
`claudedocs/dpf-service-records/checklist.md`에서 관리한다.

## 10. 스킬 문서 갱신

1단계 구현 완료 시 `.claude/skills/as-management/SKILL.md`에 "`dpf_service_records`는 차량 귀속 별도 시스템,
사업장 귀속 `as_records`와 무관"이라는 한 줄을 추가하거나, 신규 `dpf` 도메인 스킬(`​.claude/skills/dpf/SKILL.md`)을 만들어
이 문서의 핵심 결정(§4)을 옮겨 적는다 — 현재 `dpf` 도메인은 전용 스킬 파일이 없다.
