-- 데이터 이력 복구 함수(restore_data_from_history)가 실패하던 문제 수정 (2026-10-05 운영 적용)
--
-- 쓰는 곳: /admin/data-history 의 "복구"(슈퍼 관리자) → POST /api/data-history → DatabaseService.restoreFromHistory
--
-- 실패하던 이유 두 가지
--   1) 2026-03-05 마이그레이션이 search_path 를 비워 data_history 를 못 찾았다.
--   2) 그 전부터 있던 버그 — 값 목록을 string_agg(quote_literal(value)) 로 만들었는데 string_agg 는 NULL 을 건너뛴다.
--      이전 데이터에 빈 값(NULL)이 하나라도 있으면 컬럼 수와 값 수가 어긋나 `INSERT has more target columns than expressions`.
--      business_info 는 컬럼이 158개라 사실상 모든 행이 여기에 걸렸다. 값을 전부 글자로 넣는 방식이라 배열 컬럼
--      (collection_manager_ids uuid[])도 넣을 수 없었다.
--
-- 고친 방식 — 이전 데이터(jsonb)를 그 표의 행 형태로 바꿔(jsonb_populate_record) 그대로 넣는다. 빈 값·배열·jsonb 가 형식대로 들어간다.
--   이력에 있던 컬럼 중 지금도 있는 컬럼만 쓴다(그 사이 표에 추가된 컬럼은 건드리지 않고, 없어진 컬럼은 무시한다).
--   동작은 예전 의도와 같다: 그 id 의 행이 있으면 이전 값으로 덮어쓰고, 없으면(삭제 이력) 다시 넣는다.
--   복구도 UPDATE/INSERT 이므로 그 표의 트리거가 그대로 돈다(이력이 한 줄 더 남고 updated_at 은 복구 시각이 된다).

CREATE OR REPLACE FUNCTION public.restore_data_from_history(p_history_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = public
AS $function$
DECLARE
  v_table text;
  v_old jsonb;
  v_cols text;
  v_set text;
BEGIN
  SELECT table_name, old_data INTO v_table, v_old
  FROM data_history
  WHERE id = p_history_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION '이력 레코드를 찾을 수 없습니다: %', p_history_id;
  END IF;
  IF v_old IS NULL OR NOT (v_old ? 'id') THEN
    RAISE EXCEPTION '이 이력에는 되돌릴 이전 데이터가 없습니다';
  END IF;

  SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY a.attnum),
         string_agg(format('%1$I = EXCLUDED.%1$I', a.attname), ', ' ORDER BY a.attnum) FILTER (WHERE a.attname <> 'id')
  INTO v_cols, v_set
  FROM pg_attribute a
  WHERE a.attrelid = format('public.%I', v_table)::regclass
    AND a.attnum > 0
    AND NOT a.attisdropped
    AND a.attgenerated = ''
    AND v_old ? a.attname;

  EXECUTE format(
    'INSERT INTO public.%1$I (%2$s) SELECT %2$s FROM jsonb_populate_record(NULL::public.%1$I, $1) ON CONFLICT (id) DO UPDATE SET %3$s',
    v_table, v_cols, v_set
  ) USING v_old;

  RETURN TRUE;
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION '복구 실패: %', SQLERRM;
END;
$function$;
