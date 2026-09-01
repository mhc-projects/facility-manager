-- 사업장 정보(business_info) 동시편집 충돌 감지를 위한 form_version 컬럼 추가
--
-- 배경: 사업장 수정모달과 엑셀 일괄업로드(덮어쓰기/병합)는 폼 전체를 한 번에 저장하는
-- 구조라, 두 세션이 같은 사업장을 겹쳐서 수정하면 나중에 저장한 쪽이 먼저 저장된
-- 변경사항을 조용히 덮어쓸 수 있다(lost update). updated_at은 메모·계산서 동기화 등
-- 무관한 처리에서도 자주 갱신되어 충돌 판단 기준으로 쓰기엔 너무 민감하므로,
-- 전체스냅샷 저장 두 곳(수정모달 PUT, 엑셀 배치 업로드)만 증가시키는 전용 카운터를 둔다.

ALTER TABLE business_info
ADD COLUMN IF NOT EXISTS form_version BIGINT NOT NULL DEFAULT 0;

COMMENT ON COLUMN business_info.form_version IS '전체스냅샷 저장(수정모달/엑셀업로드) 시마다 증가하는 동시편집 충돌 감지용 카운터';
