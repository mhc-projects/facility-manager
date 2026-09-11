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

### 4.7 첨부파일 — 5단계로 착수 (2026-09-11 보류 확정 → 2026-09-12 사용자 확인 후 착수, 어드바이저 검토로 버킷 결정 수정)
크린어스의 "서류 보기" 상세 자체는 관찰하지 못했지만(§6-3), 등록 폼의 12개 고정 슬롯 이름(§2.2)은 관찰돼 있었다.
1단계에서는 "담당자 요구가 구체화되면"이라는 조건으로 보류했으나, 4단계 완료 후 사용자에게 "담당자 요구 구체화 vs
크린어스 관찰 12슬롯 그대로 진행"을 확인한 결과 **후자로 진행 확정**(2026-09-12). `dpf_service_record_attachments`
테이블 + 12슬롯 UI를 5단계로 구현한다(§7 5단계, §9 5단계 참고).

**버킷 공개여부 — 비공개 버킷 + 서명 URL로 결정(2026-09-12, 최초 초안 수정)**: 최초 초안은 `app/api/wiki/upload-guideline/route.ts`의
"공개 버킷" 패턴을 그대로 베꼈는데, 그 라우트는 지침서 PDF(민감정보 없음)를 다룬다 — 이번 첨부파일은 차량번호·소유자명이
찍힌 차량사진/매연검사결과표 등 **차량 단위 개인정보**라 데이터 성격이 다르다. `grep -rn "createSignedUrl"`로 이 프로젝트에
이미 비공개 버킷+서명 URL 패턴(`app/api/announcements/[id]/attachments/download/route.ts`, `app/api/uploaded-files-supabase/route.ts`)이
있음을 확인했으므로, `dpf-documents`(공개, 지침서 전용)를 재사용하지 않고 **별도 비공개 버킷 `dpf-attachments`**를 신설해
같은 패턴(`storage_path` 컬럼 + `createSignedUrl`, 300초 유효)을 따른다. 경로는 `service-records/{record_id}/{slot_key}-{timestamp}.{ext}`
(타임스탬프를 넣어 재업로드 시 확장자가 바뀌어도 안전하게 새 경로에 저장하고, 성공 후 이전 파일을 베스트에포트로 삭제).

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

### 5단계 스키마 추가 — `dpf_service_record_attachments` (설계 draft, 2026-09-12, 어드바이저 검토로 `storage_path` 추가)

```sql
-- dpf_service_records 1건당 크린어스 관찰(§2.2) 12개 고정 슬롯 첨부파일. record_id+slot_key 유니크(슬롯당 최신 파일 1개).
-- 비공개 버킷(dpf-attachments) + 서명 URL 패턴(§4.7) — storage_path는 재업로드 시 이전 파일 삭제·서명 URL 발급에 필요.
create table dpf_service_record_attachments (
  id uuid primary key default gen_random_uuid(),
  -- on delete cascade는 dpf_service_records가 실제로 하드 삭제될 때만 발동한다(평소엔 is_deleted 소프트 삭제라 발동 안 함, §4.10)
  record_id uuid not null references dpf_service_records(id) on delete cascade,
  slot_key text not null check (slot_key in (
    'vehicle_photo', 'smoke_meter',
    'filter_cross_section_before', 'filter_cross_section_after',
    'filter_serial_before', 'filter_serial_after',
    'self_diagnostic_pressure_before', 'self_diagnostic_pressure_after',
    'smoke_test_result_before', 'smoke_test_result_after',
    'as_parts', 'as_processing'
  )),
  storage_path text not null,       -- dpf-attachments 버킷 내 경로(공개 URL 아님, createSignedUrl로만 접근)
  uploaded_by uuid references employees(id),
  created_at timestamptz not null default now()
);
create unique index on dpf_service_record_attachments(record_id, slot_key);

alter table dpf_service_record_attachments enable row level security;
drop policy if exists "dpf_service_record_attachments_read" on dpf_service_record_attachments;
drop policy if exists "dpf_service_record_attachments_write" on dpf_service_record_attachments;
create policy "dpf_service_record_attachments_read" on dpf_service_record_attachments
  for select using (auth.role() = 'authenticated');
create policy "dpf_service_record_attachments_write" on dpf_service_record_attachments
  for all using (
    exists (select 1 from employees where id = auth.uid() and permission_level >= 2)
  );
```

**`uploaded_by → employees(id)` FK 유지 확인(어드바이저 2차 검토 지적)**: `dpf_service_records.created_by`도 같은 FK를
쓰고 `auth.user.id`로 채우는데, `lib/auth/require-auth.ts`를 읽어 `requireAuth()`가 `employees` 테이블에서
`id = $1 AND is_active = true`로 실제 존재를 확인한 뒤에만 `ok: true`를 반환함을 확인(존재하지 않으면 `forbidden`) —
즉 `auth.user.id`는 항상 실존하는 `employees.id`다. FK 위반 위험이 없으므로 그대로 유지한다(드롭 불필요).

12슬롯 한글 라벨(§2.2 그대로): 차량사진/매연측정기/필터전단면 클리닝전/필터전단면 클리닝후/필터일련번호 클리닝전/
필터일련번호 클리닝후/자가진단장치배압 전/자가진단장치배압 후/매연검사결과표 전/매연검사결과표 후/AS부품/AS처리.
`slot_key`↔라벨 매핑은 `CATEGORY_OPTIONS`/`CATEGORY_LABELS`와 같은 자리(`ServiceRecordFormModal.tsx`)에
`ATTACHMENT_SLOTS`로 export해 단일 소스로 관리한다.

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

**3단계에서 추가** (구체화, 2026-09-11 어드바이저 3차 검토, §8.3 참고):
- `GET /api/dpf/service-records/derived-stats?vehicle_ids=id1,id2,...` — `/dpf` 목록의 파생 컬럼(최근접수일/마지막처리일/
  크리닝횟수/AS횟수/철부횟수)용 배치 조회. 쿼리 파라미터로 받은 `vehicle_id` 목록(최대 20~100개, `/dpf`의 `pageSize=20` 기준)에
  대해서만 계산 — 페이지네이션도 없고, 목록 API처럼 서버가 스스로 대상 차량을 고르지 않는다(호출자가 "지금 화면에 보이는 차량"을 넘김).
  서버에서 쿼리 2개를 순차/병렬로 날리고 **애플리케이션 코드에서 vehicle_id별로 집계**(PostgREST에 GROUP BY가 없으므로):
  1. `dpf_service_records`에서 `vehicle_id, category, status, reception_date, processed_at, completed_at`을
     `vehicle_id in (ids) and is_deleted = false`로 조회 → `last_reception_date = max(reception_date)`(취소 건 포함 — 접수
     자체는 실제 발생했으므로), `last_processed_date = max(completed_at ?? processed_at)`(**이것도 취소 건 포함** — 처리일이
     찍혀 있다는 건 실제 처리가 일어났다는 뜻이라 접수일과 같은 원칙으로 포함, 2026-09-11 4차 검토),
     **`clean_count`/`as_count`는 `status != 'cancelled'`인 행만 category별로 센다**(2026-09-11 어드바이저 4차 검토 —
     접수현황 요약 바가 `cancelled`를 대기/완료 집계에서 빼는 것(§9 2단계 결정)과 숫자가 어긋나면 담당자가 혼란스러워함).
     회차(`round_no`)는 취소 건도 번호를 먹으므로 `count ≠ max(round_no)`가 될 수 있는데, 이는 §4.2에서 이미 받아들인
     결번(gap) 허용 규칙과 같은 선상이라 문제 아님.
  2. `dpf_device_installations`에서 `vehicle_id, action_type`을 `vehicle_id in (ids) and action_type = 'remove'`로 조회 →
     vehicle_id별 개수 = `removal_count`(엠즈 차량은 항상 0으로 돌아옴, §8.3 벤더 항목 참고 — API는 벤더를 따지지 않는다).
  두 쿼리는 `Promise.all`로 병렬 호출한다.
  응답: `{ [vehicle_id]: { last_reception_date: string | null, last_processed_date: string | null, clean_count: number, as_count: number, removal_count: number } }` —
  요청에 포함된 모든 id에 대해 항목을 채운다(기록이 없는 차량도 0/null로 포함, 프론트에서 매핑 실패 분기 안 만들게).
  인증은 기존과 동일 `requireAuth(request, 1)`.

**4단계에서 추가** (구체화, 2026-09-12 어드바이저 검토, §8.2 참고):
- `GET /api/dpf/service-records` — 기존 라우트에 `cost_type`(eq, paid/free/mixed)·`courier`(ilike) 파라미터 2개만 추가한다
  (additive, 기존 파라미터/응답 모양 불변). `category` 콤마 리스트 필터는 이미 있으므로 `logistics` 모드는 클라이언트가
  `category=parts_delivery,urea`를 보내는 것만으로 충분 — 서버 쪽 변경 불필요.
- `GET /api/dpf/service-records/stats` — 기존 5필드(clean/as pending·completed, cs_total)에 **4필드를 추가**한다
  (`urea_pending`/`urea_completed`/`parts_pending`/`parts_completed`) — 엔드포인트를 분리하거나 `?scope=`로 나누지 않고
  한 응답에 다 담는다(reception 페이지는 기존 5필드만 쓰고 나머지는 무시, logistics 페이지는 새 4필드만 씀 — 두 화면이
  결국 같은 원장의 필터 뷰라는 §2.6 설계 원칙과 일치). count 쿼리 5개 → 9개로 늘어나지만 이 규모에서 문제 없음(2단계와 동일 근거).
  `types/dpf.ts`의 `DpfServiceRecordStats`에 4필드 추가.

**5단계에서 추가** (구체화, 2026-09-12 사용자 확인 + 어드바이저 검토, §4.7·§5·§8.4 참고):
- `POST /api/dpf/service-records/[id]/attachments` — 맨 먼저 `requireAuth(request, 1)`(참고 삼았던
  `upload-guideline/route.ts`엔 인증 자체가 없는데, 그건 따라가지 않는다). `multipart/form-data`(`file`, `slot_key`)를
  받는다. `slot_key`를 12개 enum과 대조해 검증(아니면 400), **파일 확장자도 서버에서 화이트리스트로 검증**
  (`jpg|jpeg|png|webp|pdf`만 허용, 아니면 400 — `safeExt`로 위험 문자만 제거하는 것과 별개로 허용 확장자 자체를 제한).
  `dpf-attachments`(비공개) 버킷 존재 확인 후 없으면 자동 생성(`createBucket(name, { public: false, fileSizeLimit: 10 * 1024 * 1024 })` —
  클라이언트 10MB 가드와 같은 숫자를 버킷 자체에도 걸어 우회 업로드를 막는다. 동시에 두 요청이 버킷 없음을 보고 각각
  생성을 시도하면 두 번째는 "already exists" 에러가 나는데, 이 경우는 실패로 취급하지 않고 업로드를 계속 진행한다),
  `service-records/{record_id}/{slot_key}-${Date.now()}.{ext}`
  경로에 업로드 → `dpf_service_record_attachments`에 upsert(같은 record_id+slot_key 행이 있으면 `storage_path` 갱신) →
  성공 후 **이전 `storage_path`가 있었다면 베스트에포트로 storage에서 삭제**(실패해도 로그만 남기고 응답은 성공 처리 —
  고아 파일 하나 남는 것이 업로드 실패보다 낫다). 클라이언트 측에서 파일 크기 10MB 제한(사진/PDF 기준 여유 있는 값,
  필드 업로드 실수 방지용 소프트 가드).
- `GET /api/dpf/service-records/[id]/attachments` — 해당 레코드의 기존 첨부 현황을 슬롯별로 조회해, **각 슬롯의
  `storage_path`로 `createSignedUrl`을 발급**하고 `{ [slot_key]: { url: signedUrl, created_at } }` 형태로 반환한다
  (TTL은 300초가 아니라 **3600초** — `announcements/.../download`는 1회성 다운로드 링크지만 여기는 모달이 열려있는
  동안 `<img src>`가 계속 참조하므로 `uploaded-files-supabase/route.ts`의 7200초 인라인 사례에 더 가깝게 맞춤).
  응답 필드명은 DB 컬럼과 동일하게
  `created_at`으로 통일 — `uploaded_at`이라는 별도 이름을 쓰지 않는다). `ServiceRecordFormModal`이 수정 모드로 열릴
  때만 호출(신규 등록 모드는 record_id가 없어 호출 안 함).
- `DELETE /api/dpf/service-records/[id]/attachments/[slotKey]` — storage 파일 삭제 + DB 행 삭제(하드 삭제). §4.10의
  `is_deleted` 소프트 삭제 원칙은 청구 이력이 걸린 `dpf_service_records` 자체에 적용되는 것이지, 단순 첨부파일에는
  해당하지 않는다고 판단 — 첨부파일은 재업로드로 언제든 대체 가능하고 협회청구와 무관하다.
- 인증은 POST/DELETE 모두 `requireAuth(request, 1)`(기존 서브레코드 라우트와 동일 — RLS의 permission_level>=2는
  supabaseAdmin이 service_role로 우회하므로 실질적 게이트는 API의 requireAuth다).

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

### 8.2 `/dpf/service/logistics` — 물류관리 (구체화, 2026-09-12 어드바이저 검토)

`category in ('parts_delivery','urea')`로 고정 필터링된 `/dpf/service`의 변형. `/dpf/service/page.tsx`(2단계, ~250줄:
요약 바+검색/필터 바+debounce+테이블)를 그대로 복제하지 않고, 본문을 `components/dpf/DpfServiceListView.tsx`(신규,
`mode: 'reception' | 'logistics'` prop)로 추출해 두 페이지가 공유한다. 각 페이지(`/dpf/service/page.tsx`,
`/dpf/service/logistics/page.tsx`)는 `<AdminLayout title=.. description=..><DpfServiceListView mode=".."/></AdminLayout>`
로만 남는다 — 로직 이동일 뿐 사용자에게 보이는 접수현황 화면 동작은 바뀌지 않는다.

**mode별 차이:**
- **분류 필터**: `mode==='logistics'`일 때 드롭다운 옵션을 `전체/부품전달/요소수` 2+1개로 제한(`reception`의 6개 전체 옵션과
  다름). "전체" 선택 시에도 서버에는 항상 `category=parts_delivery,urea`를 보낸다(빈 값으로 보내면 API가 6개 전 카테고리를
  반환해버림 — `effectiveCategory = mode==='logistics' ? (category || 'parts_delivery,urea') : category` 규칙으로 강제).
- **필터 슬롯 교체**: `reception`의 "처리점"(service_branch) 자유텍스트 자리에 `logistics`는 "택배사"(courier) 자유텍스트를
  넣는다 — 물류 접수 등록 폼(§2.3, §4)에 처리점 필드가 애초에 없기 때문(§4.11과 같은 원칙). **"비용"(cost_type, 전체/유상/
  무상/유무상) 필터를 `logistics` 모드에만 추가**(크린어스 §2.4 관찰, `reception`은 필터 세트를 그대로 유지해 2단계 결과물을
  건드리지 않음).
- **요약 바**: `reception`은 기존 5타일(크리닝대기/완료, AS대기/완료, 상담종료) 그대로. `logistics`는 4타일(요소수대기/완료,
  부품전달대기/완료) — §7의 `/stats` 응답에 추가되는 4개 필드를 사용.
- **테이블 컬럼**: `DpfServiceRecordTable`에 `variant?: 'reception' | 'logistics'`(기본 reception) prop 추가. `logistics`는
  처리점/담당AS기사/기사처리일자 3개 컬럼을 빼고 택배사(courier) 1개를 더한다(§2.4 "부착현황과 거의 동일 + 택배사 추가,
  크리닝/AS 관련 컬럼 제거" 그대로).
- **부수 효과**: 이 추출 작업을 하는 김에 2단계 사후검토에서 지적된 `/dpf/service`의 통계 `useEffect([result.total])` 문제를
  같이 고친다 — 이 페이지엔 등록 버튼이 없어 `result.total`이 바뀌는 건 필터 변경 때뿐이므로, 통계 fetch는 **마운트 시 1회만**
  (`useEffect(() => { ... }, [])`)으로 충분하다.

목록 테이블 컴포넌트는 컬럼셋을 variant로 받는 형태로 공유(`DpfServiceRecordTable` + `variant` prop, §7 참고).

**`/dpf/[vin]` "AS/크리닝" 탭 라벨 재검토**: 이 탭은 1단계부터 벤더 제한 없이 해당 차량의 `serviceRecords` 전체(카테고리
무관, parts_delivery/urea/cs/engine_replace 포함)를 보여주고 있었다 — "AS/크리닝"이라는 이름은 4단계로 물류가 별도
화면을 갖는 시점부터는 더 부정확해진다. **"접수이력"으로 라벨만 변경**한다(`ALL_TABS` 1줄, 탭 내용/API는 변경 없음).

### 8.3 `/dpf` (부착현황) 확장 — 기존 페이지에 컬럼 추가 (구체화, 2026-09-11 어드바이저 3차 검토)

**성능 결정 (핵심)**: `DpfVehicleTable`는 이미 19컬럼·`minWidth 1780px`이고 페이지당 20건(`pageSize` 고정)만 그린다.
파생값(최근접수일/마지막처리일/크리닝횟수/AS횟수/철부횟수)을 행마다 서브쿼리로 조인하지 않는다 — **현재 페이지에 보이는
최대 20개 `vehicle_id`만 모아 배치 조회 API를 별도로 1회 호출**하고, 집계는 클라이언트에서 한다(§7의 신규
`GET /api/dpf/service-records/derived-stats` 참고). `dpf_service_records`/`dpf_device_installations` 어느 쪽도
메인 목록 쿼리(`/api/dpf/search`)에 조인하지 않는다 — 그 라우트는 손대지 않는다.

**컬럼 예산**: 19개에 6개를 그대로 더하지 않는다. 3개로 압축해서 추가한다(2줄 스택 대신 단일 라인 3컬럼으로 결정,
2026-09-11 4차 검토 — 20행짜리 페이지에서 한 컬럼만 줄바꿈되면 그 행만 키가 달라져 다른 컬럼과 세로 정렬이 안 맞기 때문에,
"접수현황"도 2줄 스택이 아니라 최근접수일/마지막처리일 각각 별도 컬럼으로 나눈다 → 접수현황 컬럼 자체는 없앰):
- **최근접수일** — `dpf_service_records.reception_date` 최댓값(취소 포함).
- **마지막처리일** — `completed_at ?? processed_at` 최댓값.
- **처리횟수** — `크N · AS N · 철N` 한 줄 압축 표기 1컬럼(취소 건 제외 카운트, §7). **철부횟수는 `vehicle.vendor === 'mz'`일 때 `-`로 표시**(아래 벤더 항목 참고).
- **구조변경경과일** — `today - installation_date` 일수, `installation_date`가 null이면 `—`(NaN일 금지). **"부착경과일"이 아니라
  "구조변경경과일"로 명명한다** — `DpfVehicleTable`의 기존 `installation_date` 컬럼 라벨이 이미 "구조변경일"이고,
  `lib/dpf-column-map.ts`에서 이 필드가 원본 "구변일자/구조변경일자"에 매핑됨을 확인(2026-09-11 4차 검토 그렙 확인) —
  크린어스의 "부착경과일"은 별도의 물리적 부착일 개념(우리 스키마엔 없음)이라 같은 이름을 쓰면 오해를 유발한다.

거기에 **행 액션 버튼 컬럼 1개**를 맨 끝에 추가한다 — "접수" / "물류" 버튼을 항상 노출(호버로 감추지 않음,
`feedback_dashboard_ux_conventions`). 결과적으로 19 + 4 + 1 = **24컬럼**, `minWidth`는 1780px → 약 2250px로 늘어난다
(기존 가로 스크롤 힌트 UI 그대로 유지, 별도 안내 불필요).

**로딩 중간 상태 = 0이 아니다 (2026-09-11 4차 검토)**: 목록(`/api/dpf/search`)과 파생통계(`/api/dpf/service-records/derived-stats`)는
순차 호출이라, 목록은 이미 갱신됐는데 파생통계는 아직 이전 페이지 값이거나 비어 있는 구간이 항상 존재한다. `derivedStats[v.id]`가
`undefined`인 행은 **API가 채워준 "기록 없음=0/null"과 다른 제3의 상태**이므로, 신규 4개 컬럼은 `undefined`일 때 `0`이나 `—`가
아니라 `…`(로딩 중)로 표시한다 — 잠깐이라도 "크0 · AS0"이 깜빡이면 실제 데이터로 오인될 수 있다. 전체 테이블 스켈레톤은
목록 fetch(`loading` state)에만 걸고, 파생통계 fetch는 별도로 기다리지 않는다(테이블은 목록 도착 즉시 그리고, 신규 4개 컬럼만
`…`에서 값으로 갈아끼워진다).

**벤더 처리(철부횟수)**: `dpf_device_installations`는 후지노 임포트 경로에서만 채워진다(엠즈는 자체 DB 파일을 그대로
가져와 차량 마스터 필드만 채우고, 설치이력/성능검사/보조금 서브테이블은 애초에 비어 있다 — `/dpf/[vin]`의
`ALL_TABS`가 이 3개 탭을 `vendors: ['fujino']`로만 노출하는 것과 같은 이유, 103ec33 커밋에서 확인). 그래서 API가
엠즈 차량의 `removal_count`를 굳이 0으로 걸러줄 필요는 없다 — 실제로 항상 0이 돌아온다. 하지만 "0(실제로 철거 0회)"과
"애초에 추적 대상이 아님"을 화면에서 구분하기 위해, **클라이언트에서만** `vendor === 'mz'`이면 철부횟수 칸을 `-`로 덮어쓴다.

**행 액션 버튼 → 모달 연동**: 기존 `ServiceRecordFormModal`(1단계에서 이미 `initialCategory?: DpfServiceCategory` prop을
갖고 있음, 수정 불필요)을 그대로 재사용한다. "접수" 버튼은 `initialCategory` 없이 열어 폼 안의 분류 드롭다운에서
직접 고르게 하고(크린어스도 "접수상담" 진입 시 분류를 폼에서 선택), "물류" 버튼은 `initialCategory: 'parts_delivery'`로
연다(폼 안에서 `urea`로 바꿀 수 있음). `onSuccess` 시 모달을 닫고 **목록·파생통계 양쪽을 함께 재조회**한다(§9 구현 순서 참고,
2단계 사후검토에서 지적된 "필터/목록과 무관한 재조회 의존성" 패턴을 반복하지 않도록 `result` state를 구독하는 `useEffect`가
아니라 `search()` 콜백 안에서 두 fetch를 나란히 호출한다).

### 8.4 `/dpf/[vin]` 상세 — 새 탭 추가
`ALL_TABS`에 `{ key: 'service', label: 'AS/크리닝', vendors: ['fujino','mz'] }` 추가 — **벤더 제한 없음**
(기존 설치이력/성능검사/보조금 탭은 `vendors: ['fujino']`로 제한돼 있지만, AS/크리닝은 벤더 무관 운영 업무이므로 양쪽 다 노출).
탭 내용: 등록 폼(§4의 필드) + 내역 리스트(회차/상태/처리점/3개 날짜). 첨부파일 슬롯은 1단계에서 제외했다가
5단계에서 추가(§4.7, §8.4 하단 참고).
기존 `SubRecordFormModal.tsx` 패턴을 확장하거나 새 `ServiceRecordFormModal.tsx`로 분리 — 필드 수가 훨씬 많으므로(§5) 별도 컴포넌트 권장.
데이터는 `/dpf/[vin]` 페이지의 기존 `loadDetail()`이 호출하는 `GET /api/dpf/vehicles/[vin]` 응답에 실린 `serviceRecords`를 그대로 쓴다(§7) —
탭 전환 시 별도 API 호출이 없다, 기존 installations/inspections/subsidy/call 탭과 동일한 방식.

**변경정보 오버레이 표시 (2단계 범위로 추가, 2026-09-11 어드바이저 지적)**: 1단계는 write-back만 구현했고 이 값을 보여주는 화면이 없다 —
`VehicleFormModal`도 `BasicInfoTab`도 `current_*`/`is_special_*` 필드를 노출하지 않는다. 사용자가 변경정보를 찾다가 없는 걸 알게 되는 것보다,
가장 저렴한 위치인 `BasicInfoTab`(§4의 "접수 / 행정" 섹션 아래)에 읽기 전용 "변경정보" 섹션을 2단계에서 추가한다 — 현재차량번호/현재연락처(무선·유선)/
출동지역/특별관리대상/특판. 수정은 여전히 `VehicleFormModal`에서만(§4.6).

**첨부파일 12슬롯 UI (5단계, 2026-09-12 구체화)**: `ServiceRecordFormModal`에 "첨부파일" 섹션을 추가하되 **수정 모드에서만
렌더링**한다(신규 등록 시점엔 `record.id`가 없어 업로드 대상 경로를 만들 수 없음 — 접수 등록 후 현장에서 사진/측정값을
첨부하는 실제 업무 순서와도 일치). 12슬롯 각각 파일 입력 + 업로드된 파일 미리보기(이미지) 또는 링크(PDF) + 삭제 버튼.
개별 업로드만 구현하고 **일괄 업로드는 만들지 않는다** — 크린어스가 실제로 파일명↔슬롯을 어떻게 자동 매칭하는지
관찰하지 못했으므로(§2.2, "서류 보기" 상세 미관찰) 그 부분까지 추측해서 만들지 않는다. 목록(부착현황/접수현황) 쪽에
"서류" 컬럼/아이콘도 추가하지 않는다 — 마찬가지로 미관찰 UI(§6-3)를 추측하지 않기 위함, 필요해지면 그때 추가.

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

### 3단계 세부 순서 (2026-09-11 어드바이저 3차 검토로 구체화, 마이그레이션 없음)

**세부 결정 요약 (§7·§8.3 참고, 어드바이저 3차+4차 검토로 코드 작성 전 확정):**
- 파생값은 메인 목록 쿼리에 조인하지 않고 **배치 조회 API 1개**(`GET /api/dpf/service-records/derived-stats`)로 분리,
  집계는 서버 응용 코드에서(PostgREST GROUP BY 없음), 내부 두 쿼리는 `Promise.all`.
- 19컬럼에 6개를 더하지 않고 **4개(최근접수일/마지막처리일/처리횟수/구조변경경과일, 단일 라인) + 액션버튼 1개 = 24컬럼**으로
  압축 — "접수현황" 2줄 스택은 포기(행 높이가 컬럼마다 달라짐), "부착경과일"이 아니라 "구조변경경과일"로 명명(§8.3, `installation_date`가
  실제로는 구변일이라 `lib/dpf-column-map.ts`로 확인함).
- `clean_count`/`as_count`는 `status != 'cancelled'`만 센다(§7) — 접수현황 요약 바의 대기/완료 집계와 숫자가 맞아야 하기 때문.
- 철부횟수는 API에서 벤더를 안 따지고(엠즈는 원래 0), **클라이언트에서만** `vendor==='mz'`일 때 `-`로 덮어쓴다.
- **파생통계가 아직 안 왔거나 목록이 막 갱신된 직후인 `derivedStats[v.id] === undefined` 구간은 `0`이 아니라 `…`로 표시**한다
  (§8.3) — 테이블 전체 스켈레톤은 목록 fetch에만 걸고 파생통계 fetch를 기다리지 않는다.
- 파생통계 재조회는 `result` state를 구독하는 `useEffect`가 아니라 **`search()` 콜백 안에서 목록 fetch와 나란히** 호출한다
  (2단계 사후검토에서 지적된 "필터 변경마다 전역 통계를 다시 도는" 패턴을 반복하지 않기 위함, `/dpf/service/page.tsx`의
  `[result.total]` 의존성 useEffect는 그대로 남겨두되 3단계 신규 코드에서는 이 패턴을 쓰지 않는다).
- "접수"/"물류" 버튼은 `ServiceRecordFormModal`을 `initialCategory` 없이/`'parts_delivery'`로 열 뿐, 폼 자체는 수정하지 않는다.
- `DpfVehicleTable`는 `app/dpf/page.tsx` 한 곳에서만 쓰인다(2026-09-11 그렙 확인) — 액션 버튼 콜백을 prop으로 게이팅할 필요 없음.

**구현 순서:**
1. `types/dpf.ts`에 `DpfVehicleDerivedStats` 인터페이스 추가(인라인 금지, §7 응답 모양과 동일).
2. `GET /api/dpf/service-records/derived-stats`(§7) 신설 — `dpf_service_records`/`dpf_device_installations` 배치 조회(`Promise.all`) +
   집계(`clean_count`/`as_count`는 `cancelled` 제외). `vehicle_ids` 쿼리 파라미터 없거나 빈 배열이면 빈 객체 반환(400 아님, 방어적으로).
3. `DpfVehicleTable.tsx`에 `derivedStats?: Record<string, DpfVehicleDerivedStats>` prop 추가, `COLUMNS`에 4개 컬럼(최근접수일/
   마지막처리일/처리횟수/구조변경경과일) + 액션버튼 컬럼 1개 추가(`derivedStats[v.id]`가 없으면 `…`), `minWidth` 1780→~2250 조정,
   스켈레톤 행 너비 배열도 5개 늘림.
4. `app/dpf/page.tsx` — `derivedStats`/`serviceModal` state 추가, `search()` 콜백 안에서 목록 조회 직후 `json.vehicles`의
   id 목록으로 파생통계 fetch(별도 useEffect 아님), "접수"/"물류" 버튼 클릭 시 `serviceModal` 설정 → `ServiceRecordFormModal`
   렌더 → `onSuccess`에서 모달 닫고 `search(query, localGov, vendor, page)` 재호출(목록+파생통계 동시 갱신).
5. 검증: `tsc --noEmit`, 하드 리로드(시작 페이지부터, `feedback_local_test_hard_reload` 다섯 번째 사례 재발 방지), 파생 컬럼
   숫자가 해당 차량 상세 탭(§8.4 "AS/크리닝")의 실제 건수와 일치하는지 최소 2대(후지노 1대·엠즈 1대) 확인, 취소 처리한 건이
   처리횟수에서 빠지는지, 엠즈 차량 철부횟수가 `-`로 뜨는지, 접수/물류 버튼으로 만든 레코드가 상세 탭과 목록 파생값 양쪽에
   반영되는지, `/dpf`·`/dpf/[vin]`·`/dpf/service` 기존 기능 회귀 없음.
6. 검증 중 실 데이터에 남긴 테스트 흔적 정리 SQL을 사용자에게 전달(2단계와 동일 절차).

**커밋 2개**: (a) API(배치 조회)+타입, (b) 테이블 컬럼+페이지 wiring(fetch+버튼+모달). `ServiceRecordFormModal` 자체는
수정하지 않으므로 별도 커밋 불필요.

### 4단계 세부 순서 (2026-09-12 어드바이저 검토로 구체화, 마이그레이션 없음)

**세부 결정 요약 (§7·§8.2 참고, 코드 작성 전 확정):**
- `/dpf/service/page.tsx`를 복제하지 않고 본문을 `DpfServiceListView.tsx`(mode prop)로 추출해 reception/logistics 양쪽이 공유.
- 로직스틱스 모드의 분류 필터는 항상 `parts_delivery,urea` 우주 안에서만 동작(전체 선택도 이 둘로 한정, 서버에 빈 값 보내지 않음).
- 처리점 필터를 택배사(courier) 필터로 교체, 비용(cost_type) 필터는 logistics 모드에만 추가.
- `/stats`는 엔드포인트 분리 없이 응답에 4필드 additive 확장.
- 이 작업 김에 `/dpf/service`의 통계 재조회 `useEffect([result.total])`를 마운트 1회(`[]`)로 수정 — 이 페이지엔 등록 버튼이
  없어 로컬 변이로 total이 바뀔 일이 없으므로 안전.
- `/dpf/[vin]` "AS/크리닝" 탭 라벨을 "접수이력"으로 변경(내용/API 불변).

**구현 순서:**
1. `types/dpf.ts`의 `DpfServiceRecordStats`에 `urea_pending`/`urea_completed`/`parts_pending`/`parts_completed` 추가.
2. `GET /api/dpf/service-records`에 `cost_type`/`courier` 파라미터 추가, `GET /api/dpf/service-records/stats`에 count 쿼리 4개 추가.
3. `DpfVehicleTable` 아님 — `DpfServiceRecordTable.tsx`에 `variant?: 'reception'|'logistics'` prop 추가, `LOGISTICS_COLUMNS`
   정의(처리점/담당AS기사/기사처리일자 제거, 택배사 추가) + `courier` cellValue 케이스.
4. `components/dpf/DpfServiceListView.tsx` 신규 — `/dpf/service/page.tsx`의 현재 본문(요약 바+검색/필터 바+debounce+테이블)을
   그대로 옮기되 `mode` prop에 따라 분류 옵션/필터 슬롯/요약 타일/테이블 variant를 분기, 통계 useEffect 의존성 수정.
5. `/dpf/service/page.tsx`를 `<AdminLayout><DpfServiceListView mode="reception"/></AdminLayout>`로 축소.
6. `app/dpf/service/logistics/page.tsx` 신규 — `<AdminLayout title="물류관리" description="부품전달/요소수 접수 조회">
   <DpfServiceListView mode="logistics"/></AdminLayout>`.
7. `app/dpf/[vin]/page.tsx`의 `ALL_TABS`에서 `service` 탭 라벨 "AS/크리닝" → "접수이력" 1줄 변경.
8. `components/ui/AdminLayout.tsx`의 `DPF업무` 그룹에 "물류관리" 사이드바 항목 추가(href `/dpf/service/logistics`,
   이미 import된 `Package` 아이콘 재사용, 새 import 불필요).
9. 검증: `tsc --noEmit`, 하드 리로드로 `/dpf/service`(reception) 기존 동작 회귀 없음 확인 먼저(추출 작업이라 가장 위험),
   `/dpf/service/logistics` 신규 화면에서 분류 필터가 부품전달/요소수만 다루는지, 택배사/비용 필터 동작, 요약 4타일=테이블
   실제 건수 일치, 기존 물류 레코드(1단계에서 만든 부품전달 테스트 데이터 있으면) 정상 표시, `/dpf/[vin]` 탭 라벨 변경 확인,
   `/dpf` 회귀 없음.
10. 검증 중 실 데이터에 남긴 테스트 흔적 정리 SQL 사용자에게 전달(1~3단계와 동일 절차).

**커밋 4개**: (a) API(필터+통계 확장)+타입, (b) 테이블 variant + `DpfServiceListView` 추출 + reception 페이지 축소(2단계 파일을
건드리는 유일한 커밋, 분리 보존), (c) 물류관리 라우트 신규 + 사이드바 항목, (d) `/dpf/[vin]` 탭 라벨 변경(1단계 파일 건드리는
유일한 커밋, 분리 보존).

### 5단계 세부 순서 (2026-09-12 사용자 확인 "크린어스 관찰 12슬롯 그대로 지금 구현" → 어드바이저 검토로 구체화)

**세부 결정 요약 (§4.7·§5·§7·§8.4 참고, 어드바이저 2차 검토로 확정):**
- 신규 마이그레이션 `dpf_service_record_attachments` — 1단계 이후 처음 있는 마이그레이션이므로 `feedback_supabase_sql`
  원칙대로 SQL만 작성해 사용자에게 전달하고 직접 실행을 기다린다(에이전트가 직접 실행하지 않음).
  `project_hardcoded_db_password_incident` 때문에도 DB 자격 증명을 직접 다루지 않는다.
  `slot_key` 12개 enum + `(record_id, slot_key)` 유니크 인덱스 + `storage_path`(공개 URL 아님) 컬럼, RLS는
  `dpf_service_records`와 동일 패턴.
- 저장 버킷은 `dpf-documents`(공개, 지침서 전용) 재사용이 아니라 **신규 비공개 버킷 `dpf-attachments`** —
  차량번호·소유자명이 담긴 개인정보라 공개 버킷+추측불가 URL보다 비공개 버킷+서명 URL(이미 이 프로젝트에 있는
  `announcements`/`uploaded-files-supabase` 패턴)이 맞다고 판단(§4.7). 버킷 자동생성 흐름 자체는
  `upload-guideline/route.ts`를 참고하되 `public: false`로만 다르게 — 사용자가 Supabase 대시보드에서 버킷을 미리
  만들어둘 필요는 없다.
- 재업로드 시 경로에 타임스탬프를 넣어 확장자가 바뀌어도 안전하게 새 파일로 저장하고, DB 행 upsert 성공 후 이전
  `storage_path`를 베스트에포트로 삭제한다. 서버에서 확장자 화이트리스트(`jpg|jpeg|png|webp|pdf`)도 검증한다.
- 첨부파일 삭제는 하드 삭제(§4.10의 `is_deleted` 소프트 삭제는 청구 이력이 걸린 `dpf_service_records` 자체에만 적용).
- UI는 `ServiceRecordFormModal`의 수정 모드에만 12슬롯 섹션을 추가, 개별 업로드만(일괄 업로드/목록 서류 컬럼 없음).
- `.claude/skills/db-schema/SKILL.md`(신규 테이블)와 `.claude/skills/dpf/SKILL.md`(하드삭제 축, slot enum, 재업로드
  흐름)를 1단계와 동일하게 이번에도 갱신한다.

**구현 순서:**
1. 마이그레이션 SQL 작성(§5 5단계 스키마, `dpf-attachments` 버킷은 코드가 런타임에 자동 생성하므로 마이그레이션에는
   테이블만 포함) → 사용자에게 전달(비공개 버킷+서명 URL로 정한 이유도 함께 설명) → 실행 확인 대기.
2. (대기 중 먼저 작성 가능) `types/dpf.ts`에 `DpfAttachmentSlotKey`(12개 union) + `DpfServiceRecordAttachment`
   인터페이스(`storage_path` 필드 포함) 추가, `ServiceRecordFormModal.tsx`에 `ATTACHMENT_SLOTS`(key+한글 라벨 12개) export.
3. 사용자 실행 확인 후 → `POST /api/dpf/service-records/[id]/attachments` 신설(requireAuth 먼저, slot_key+확장자
   화이트리스트 검증, 비공개 버킷 자동생성, upsert, 이전 파일 베스트에포트 삭제).
4. `GET /api/dpf/service-records/[id]/attachments` 신설(슬롯별 `createSignedUrl` 발급 후 `{url, created_at}` 맵 반환).
5. `DELETE /api/dpf/service-records/[id]/attachments/[slotKey]` 신설(storage+DB 하드 삭제).
6. `ServiceRecordFormModal.tsx`에 "첨부파일" 섹션 추가(`AttachmentSlot` 서브컴포넌트로 12번 반복 렌더링) — 수정 모드
   (`record` prop 있음)일 때만 렌더링, 모달 오픈 시 GET으로 현황 로드, 슬롯별 업로드/미리보기/삭제 UI, 클라이언트 측
   10MB 크기 가드.
7. `.claude/skills/db-schema/SKILL.md`에 `dpf_service_record_attachments` 추가, `.claude/skills/dpf/SKILL.md`에
   첨부파일 하드삭제/재업로드 흐름/비공개 버킷 규칙 추가.
8. 검증: `tsc --noEmit`, 하드 리로드로 실제 이미지 파일 1~2개 업로드(사진 슬롯 1개, PDF 슬롯 1개) → 서명 URL로
   미리보기/링크 정상 표시 → 같은 슬롯에 재업로드해 이전 파일이 정리되는지 확인 → **앱의 DELETE 라우트로 직접
   삭제**해 storage 삭제 경로까지 실사용으로 검증(이게 유일하게 storage 삭제를 실제로 확인하는 경로이기도 함) →
   신규 등록 모드에는 첨부파일 섹션이 안 보이는지 확인 → 기존 탭/모달 회귀 없음.
9. 검증 중 만든 테스트 흔적은 8번에서 이미 앱 DELETE 라우트로 storage까지 정리했으므로, DB 잔여분(있다면)만 3단계와
   동일한 블랭킷 SQL로 사용자에게 전달(storage 파일은 앱 라우트로 이미 제거됐다는 점을 SQL 설명에 명시).

**커밋 3개**: (a) 마이그레이션 SQL + 타입(1단계와 동일하게 사용자 실행 대기 포함), (b) API 3개 라우트, (c) UI(모달 섹션)
+ 스킬 문서 갱신(1단계 커밋 (c)와 동일하게 UI 커밋에 묶음).

각 단계 종료 시 검증(위 5번) + 브라우저 확인 후 커밋(CLAUDE.md 세션 종료 체크리스트 준수). 진행 상황은
`claudedocs/dpf-service-records/checklist.md`에서 관리한다.

## 10. 스킬 문서 갱신

**완료(2026-09-12, 3단계 사후검토에서 어드바이저 지적으로 뒤늦게 처리)**: 신규 `.claude/skills/dpf/SKILL.md`를 만들어
round_no 트리거 채번, 전환 시 재채번, write-back "최신 레코드만" 규칙, 삭제≠취소(소프트 삭제 vs status=cancelled)와
집계 시 어느 쪽을 포함/제외해야 하는지, 부착현황 파생 컬럼의 배치 조회 원칙, 엠즈 벤더의 설치이력 테이블 공백, 자유 텍스트
필드 목록을 옮겨 적었다. 원래 1단계 완료 시점에 처리했어야 했는데 3단계까지 누락돼 있던 것 — `.claude/skills/db-schema/SKILL.md`는
스키마 요약만 다루고 이런 "확정된 업무 규칙"은 다루지 않아서, CLAUDE.md의 도메인 스킬 갱신 규칙을 3개 단계 동안 어긴 상태였다.
