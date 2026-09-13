---
name: dpf
description: Facility Manager 프로젝트의 DPF(매연저감장치) 차량관리/사후관리(AS·크리닝·물류) 시스템 참조. dpf_service_records 등록/전환/집계, 부착현황 파생 컬럼 로직, 첨부파일 업로드(dpf_service_record_attachments), 목록/카드 컬럼 폴드, 날짜 필터·프리셋 수정 시 사용한다.
---

# DPF 매연저감장치 관리

## 핵심 테이블
- `dpf_vehicles` — 차량 마스터(vendor: fujino/mz). 변경정보 오버레이 8컬럼(2026-09-11): write-back 대상(current_contact_wireless/wired, dispatch_area_primary/secondary — 접수 시 자동 갱신) vs 수동 전용(current_plate_number, current_vin_override, is_special_management, is_special_sale — VehicleFormModal에서만 수정).
- `dpf_service_records` — AS/크리닝/물류(부품전달/요소수)/엔진교체 통합 원장. `as_records`(사업장 AS, [[as-management]] 스킬 참고)와는 완전히 별개 시스템 — 대상 엔티티가 다르다(차량 vs 사업장), 연결 컬럼 없음. 접수현황/물류관리/부착현황 3화면은 이 표를 서로 다른 category 집합으로 필터링한 뷰일 뿐, 별도 테이블이 아니다.
- `dpf_device_installations` — 설치/탈착/교체 이력. **엠즈(mz) 벤더 차량은 이 테이블이 애초에 비어 있다** — 엠즈는 자체 DB 파일을 그대로 가져와 차량 마스터 필드만 채우고, 설치이력/성능검사/보조금 서브테이블은 임포트 경로 자체가 없다(103ec33 커밋). `/dpf/[vin]`의 설치이력/성능검사/보조금 탭이 `vendors: ['fujino']`로만 노출되는 이유이자, 부착현황 목록의 철부횟수가 엠즈 차량에서 항상 0으로 돌아오는 이유(화면에는 `-`로 표시해 "추적 안 함"과 "실제 0회"를 구분).

## round_no(회차) — DB 트리거로만 채번, API에서 계산 금지
- `(vehicle_id, category)` 단위로 증가. `dpf_service_records_set_round_no()` 트리거가 INSERT 시 또는 UPDATE로 category가 바뀔 때만 재계산(`MAX(round_no)+1`).
- ⚠️ API/클라이언트가 round_no를 직접 계산해서 넣으면 안 된다 — "MAX 조회 → +1 → INSERT"를 일반 호출로 하면 동시 접수 시 경쟁 상태(race)가 생긴다(전자결재 approve/submit이 트랜잭션 헬퍼를 빠뜨려 부분 업데이트 버그가 났던 전례를 반면교사 삼아 DB 트리거로 강제, [[project_approval_pending_fixes]] 참고).
- 유니크 인덱스(`vehicle_id, category, round_no`) 위반(`23505`) 시 API가 1회만 재시도한다 — 트리거가 재계산하므로 재시도하면 해소됨. 회차 번호에 이빨(gap)이 생기는 것은 허용한다(취소 건도 번호를 먹는다).

## 전환(conversion) — 크리닝↔AS
접수 도중 분류가 바뀌면 `converted_from_category`에 원래 분류를 남기고, `round_no`는 **새 category 기준으로 재채번**한다(원래 채번을 유지하지 않음). 트리거가 `category is distinct from old.category`일 때 자동 처리한다(단, `converted_from_category`가 이미 채워져 있으면 덮어쓰지 않아 최초 분류가 보존된다 — 두 번 이상 전환돼도 마찬가지).
- `GET /api/dpf/service-records?conversion=clean_to_as|as_to_clean` 필터는 `converted_from_category`뿐 아니라 현재 `category`까지 함께 검사한다 — 트리거가 카테고리가 바뀔 때마다(왕복이 아니어도) 기록하므로 `category` 없이 `converted_from_category`만 보면 이미 다시 전환된 레코드까지 오탐한다. `DpfServiceListView`의 reception 모드 전용 "전환" 드롭다운이 이 파라미터를 보낸다.
- `DpfServiceRecordTable`의 `category` 셀에 "{원분류}에서 전환" 배지, `app/dpf/[vin]/page.tsx` 접수이력 카드에도 동일 배지가 있다.

## 변경정보 오버레이 write-back — "최신 레코드일 때만"
연락처(`contact_wireless`/`contact_wired`)·출동지역(`dispatch_area_primary`/`secondary`)은 접수 등록/수정 시 `dpf_vehicles` 오버레이 컬럼에 자동 반영되지만, **PUT(수정)은 그 레코드가 해당 차량의 최신 레코드(reception_date desc, created_at desc)일 때만 write-back한다.** 오래된 티켓을 수정한다고 이후 더 최신 접수에서 확인된 정보를 덮어쓰면 안 되기 때문이다. POST(신규 접수)는 항상 최신이므로 조건 없이 write-back한다.

## 삭제 ≠ 취소 (두 개의 독립된 축)
- `is_deleted`(소프트 삭제) — 협회청구 이력(`association_billing_date`)이 걸린 원장을 보존하기 위해 하드 삭제하지 않는다. DELETE API는 `is_deleted=true`로만 갱신한다.
- `status='cancelled'`(취소) — 고객이 접수를 철회한 경우. **집계 시 두 축을 헷갈리지 말 것**: 접수현황 요약 바(대기/완료)와 부착현황 파생 컬럼(크리닝횟수/AS횟수)은 `cancelled`를 카운트에서 제외하지만, 최근접수일/마지막처리일 같은 "날짜" 집계는 취소 건도 포함한다(접수·처리 자체는 실제 발생했으므로). 새 집계를 추가할 때마다 이 둘 중 어느 쪽 성격인지 먼저 정해야 한다.

## 부착현황(`/dpf`) 파생 컬럼 — 배치 조회, 메인 목록에 조인 금지
`GET /api/dpf/service-records/derived-stats?vehicle_ids=...`가 화면에 보이는 vehicle_id만 모아 `dpf_service_records`+`dpf_device_installations`를 별도로 조회하고 애플리케이션 코드에서 집계한다(PostgREST에 GROUP BY가 없다). `/api/dpf/search`(메인 목록)에는 손대지 않는다 — 새 파생 지표를 추가할 때도 이 배치 API에 필드를 얹지, 메인 쿼리에 조인하지 않는다.

## 접수현황/물류관리 — 같은 원장의 필터 뷰, 별도 화면 아님
`/dpf/service`(접수현황)와 `/dpf/service/logistics`(물류관리)는 둘 다 `components/dpf/DpfServiceListView.tsx`
(`mode: 'reception' | 'logistics'`) 하나를 공유한다. 새 필터/집계를 추가할 땐 엔드포인트를 분리하지 않고 기존
`GET /api/dpf/service-records`·`/stats`에 파라미터/필드를 additive로 얹는 것이 이 프로젝트의 확립된 패턴이다
(예: `/stats`는 clean/as/cs 5필드에 urea/parts 4필드를 더해 9필드짜리 응답 하나를 쓴다 — reception 화면은 뒤 4개를,
logistics 화면은 앞 5개를 무시할 뿐이다). `category` 콤마 리스트 필터가 이미 있어서 "물류만 보기"는 클라이언트가
`category=parts_delivery,urea`를 보내는 것으로 충분 — 서버 쪽에 물류 전용 분기를 새로 만들지 않는다.

## 지자체/처리점/기사 — 자유 텍스트, 코드 테이블 없음
`local_government`/`service_branch`/`assigned_as_technician`/`processing_technician` 전부 자유 텍스트다. 참조할 코드 테이블(크린어스의 지자체 168개 등)이 이 프로젝트에 없어서다 — 드롭다운/자동완성을 넣으려면 먼저 실제 값이 쌓인 뒤 UI에서만 구현해야지, 코드 테이블을 새로 설계하면 안 된다.

## 목록/카드 컬럼 예산 — 새 필드는 기본적으로 기존 셀에 폴드, 새 컬럼 추가는 최후 수단
`DpfServiceRecordTable.tsx`(접수현황/물류관리 목록)와 `app/dpf/[vin]/page.tsx`(차량상세 접수이력 카드)는
크린어스 대비 재점검(2026-09-13)에서 여러 차례 "폼엔 있고 DB에도 저장되지만 읽기 화면엔 안 보이는 필드"를
발견했다 — 새 필드를 추가할 때 새 컬럼/새 dl 항목을 잊기 쉬운 지점이니 필드를 늘릴 때마다 이 두 파일을 같이
검토한다. 목록 쪽은 §8.3 "컬럼 예산" 원칙(19개에 6개를 그대로 더하지 않는다)에 따라 압축 폴드가 기본값이다 —
지금까지 쌓인 폴드 패턴: `process_dates`(기사처리/처리/완료 3줄 스택), `status`+연장 배지, `category`+전환 배지,
`billing_status`+협회청구일자+비용(`cost_type`), `vin`+구변일(`installation_date`), `vehicle_name`+부착장치
배지(`device_type`, 색상 매핑은 `DpfVehicleTable.tsx`의 `DEVICE_TYPE_COLORS` export를 재사용 — 색상표를 두 곳에
중복 정의하지 않는다). 카드는 목록보다 여유가 있어 압축 없이 `dl`/문단으로 전부 나열해도 된다 — 실제로
목록에선 폴드한 필드도 카드는 라벨 붙은 개별 항목으로 보여준다.
⚠️ 필드가 "필터 UI에 물류 모드에서만 노출된다"고 해서 그 필드 자체가 물류 전용이라고 넘겨짚지 말 것 —
`cost_type`이 실제로는 카테고리 무관 항상 폼에 있는데 필터만 물류 모드 전용이라 처음에 오판한 전례가 있다.
필드 존재 여부는 항상 `ServiceRecordFormModal.tsx` 폼 소스로 확인한다.

## 날짜 필터 — date_field 화이트리스트 + 프리셋은 열린 구간
`GET /api/dpf/service-records`는 `date_field` 파라미터(reception_date/processed_at/technician_processed_at/
completed_at/created_at 화이트리스트, 기본 reception_date)로 어떤 날짜 컬럼을 range 필터·정렬 기준으로 쓸지
고른다. `created_at`만 timestamptz라 KST +09:00 오프셋을 명시해야 당일 생성 행이 안 빠진다(다른 필드는 date
타입이라 문자열 비교로 충분). `DpfServiceListView.tsx`의 1/3/6/12개월 프리셋 버튼은 **`dateFrom`만 설정하고
`dateTo`는 비운다**(열린 구간) — `date_field`가 접수일처럼 미래 예약이 가능한 값일 수 있어 `dateTo=오늘`로
닫으면 당일 이후 값이 빠지는 경계 문제가 생기기 때문. 프리셋 계산은 `monthsAgoLocal()`(로컬 날짜 기준, 말일
오버플로는 `setDate(0)`으로 클램프) — `toISOString()`은 UTC라 KST 09:00 이전엔 하루 밀린다.

## 첨부파일(`dpf_service_record_attachments`) — 레코드 소프트 삭제와 별개의 하드 삭제 축
- 크린어스 관찰 12고정슬롯(`ATTACHMENT_SLOTS`, `components/dpf/ServiceRecordFormModal.tsx`): 차량사진/매연측정기/필터전단면 클리닝전·후/필터일련번호 클리닝전·후/자가진단장치배압 전·후/매연검사결과표 전·후/AS부품/AS처리. `slot_key`는 DB CHECK 제약과 `DpfAttachmentSlotKey` 유니온 타입 양쪽에 고정 — 슬롯 추가 시 둘 다 갱신.
- **레코드의 `is_deleted` 소프트 삭제 원칙과 달리, 첨부파일은 하드 삭제**다(`DELETE /api/dpf/service-records/[id]/attachments/[slotKey]`가 DB 행 삭제 + storage 파일 삭제). 청구 이력이 걸린 건 레코드 자체지 첨부파일이 아니고, 첨부파일은 재업로드로 언제든 대체 가능해서다.
- 재업로드(교체) 흐름: 기존 `storage_path` 먼저 읽기 → 새 파일 업로드 → `(record_id, slot_key)` unique 기준 upsert → 성공 후 이전 파일 베스트에포트 삭제(실패해도 로그만, 고아 파일 하나가 업로드 실패보다 낫다).
- 저장은 **비공개 버킷(`dpf-attachments`) + `createSignedUrl`**(공개 URL 아님) — 차량 사진/검사결과가 차대번호·소유자명 등 차량별 PII를 담기 때문. GET 응답은 `{ [slot_key]: { url, created_at, ext } }` 형태이고 `ext`는 서명 URL(쿼리스트링에 토큰 포함)을 클라이언트가 직접 파싱하지 않고도 이미지/PDF 렌더링을 분기하기 위한 필드다.
- ⚠️ **Storage 호출(listBuckets/createBucket/upload/createSignedUrl/remove)은 `supabaseAdmin`이 아니라 `getSupabaseStorageAdmin()`(`lib/supabase.ts`)을 써야 한다.** `supabaseAdmin`은 `global.headers`에 `Content-Type: application/json`이 고정돼 있어, Fetch 스펙상 이 헤더가 명시되면 FormData/바이너리 body의 자동 Content-Type(멀티파트 boundary 등)이 무시되어 Storage가 415로 업로드를 거부한다(2026-09-12 실제로 겪은 버그 — `instanceof Blob` realm 문제가 아니라 이 헤더 충돌이 원인이었다). DB 쿼리는 영향 없으므로 `supabaseAdmin` 그대로 쓴다.
- 서명 URL은 Storage CDN이 `cacheControl: max-age=3600`으로 캐싱하므로, 파일 교체/삭제 직후에도 **이전 서명 URL이 최대 1시간 동안 계속 200을 반환할 수 있다**(엣지 캐시일 뿐 실제 삭제 여부와 무관 — 실제 상태 확인은 DB 행 존재 여부 또는 storage list API로 해야 한다).
- 파일 업로드는 실제 브라우저 `<input type=file>` onChange → 페이지 자체 fetch로는 정상 동작한다. `javascript_tool` 스크립트가 파일을 직접 읽어 fetch로 보내는 방식만 브라우저 확장 보안필터에 차단된다(스크립트-드리븐 파일 업로드 전반의 한계이지 이 기능 자체의 문제는 아님).

## 설계/구현 이력
전체 설계 배경과 단계별 결정 근거는 `claudedocs/dpf-as-logistics-design.md`(크린어스 DEAR System 화면 분석 포함), 단계별 체크리스트/발견사항은 `claudedocs/dpf-service-records/checklist.md`·`context-notes.md` 참고.
