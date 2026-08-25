-- 네오닉 전력량계 연동용 API 키 발급
--
-- app/api/external/measurements 엔드포인트 전용 (2026-08-25 신설).
-- 기존 에코센스 AS연동 키(sql/add_chimney_number_and_api_keys.sql)와 동일한 패턴을 따르되,
-- 그 파일의 INSERT는 매번 새 랜덤 api_key 값이 생성돼 재실행 시 중복 행이 쌓이는 문제가 있었음
-- (실제로 프로덕션에 에코센스_AS연동 키가 2행 중복 존재하는 것으로 확인됨) - WHERE NOT EXISTS로
-- key_name 기준 idempotent하게 수정.

INSERT INTO api_keys (key_name, api_key, description, allowed_paths)
SELECT
  '네오닉_전력량계연동',
  'nk_' || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  '네오닉 전력량계 시스템에서 측정 데이터를 facility-manager로 전송하기 위한 API 키',
  ARRAY['/api/external/measurements']
WHERE NOT EXISTS (
  SELECT 1 FROM api_keys WHERE key_name = '네오닉_전력량계연동'
);

-- 생성된 API 키 확인 (이 SELECT 결과의 api_key 값을 네오닉 쪽에 전달)
SELECT key_name, api_key, description, allowed_paths, created_at
FROM api_keys
WHERE key_name = '네오닉_전력량계연동';
