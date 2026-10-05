--
-- PostgreSQL database dump
--

\restrict 35XSWlI2dyOUrpVhFC2Iam5gjgwbwfHBrqYlYyztleGShEvK9f2kxWhOkFvvlgd

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.7 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: task_attachments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.task_attachments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    task_id uuid NOT NULL,
    filename character varying(255) NOT NULL,
    original_filename character varying(255) NOT NULL,
    file_path character varying(500) NOT NULL,
    file_size bigint NOT NULL,
    mime_type character varying(100) NOT NULL,
    bucket_name character varying(100) DEFAULT 'task-attachments'::character varying,
    storage_path character varying(500) NOT NULL,
    uploaded_by uuid NOT NULL,
    description text,
    upload_status character varying(20) DEFAULT 'uploaded'::character varying,
    is_deleted boolean DEFAULT false,
    CONSTRAINT task_attachments_upload_status_check CHECK (((upload_status)::text = ANY (ARRAY[('uploading'::character varying)::text, ('uploaded'::character varying)::text, ('failed'::character varying)::text, ('deleted'::character varying)::text])))
);


--
-- Name: task_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.task_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    name character varying(100) NOT NULL,
    description text,
    color character varying(7) DEFAULT '#3B82F6'::character varying,
    icon character varying(50) DEFAULT 'folder'::character varying,
    sort_order integer DEFAULT 0,
    is_active boolean DEFAULT true,
    created_by uuid NOT NULL,
    updated_by uuid,
    min_permission_level integer DEFAULT 1,
    CONSTRAINT task_categories_min_permission_level_check CHECK ((min_permission_level = ANY (ARRAY[1, 2, 3])))
);


--
-- Name: task_statuses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.task_statuses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    name character varying(50) NOT NULL,
    description text,
    color character varying(7) NOT NULL,
    icon character varying(50) DEFAULT 'circle'::character varying,
    status_type character varying(20) NOT NULL,
    sort_order integer DEFAULT 0,
    is_active boolean DEFAULT true,
    is_final boolean DEFAULT false,
    required_permission_level integer DEFAULT 1,
    CONSTRAINT task_statuses_required_permission_level_check CHECK ((required_permission_level = ANY (ARRAY[1, 2, 3]))),
    CONSTRAINT task_statuses_status_type_check CHECK (((status_type)::text = ANY (ARRAY[('pending'::character varying)::text, ('active'::character varying)::text, ('completed'::character varying)::text, ('cancelled'::character varying)::text, ('on_hold'::character varying)::text])))
);


--
-- Name: tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    title character varying(200) NOT NULL,
    description text,
    category_id uuid,
    status_id uuid NOT NULL,
    priority integer DEFAULT 2,
    start_date date,
    due_date date,
    estimated_hours numeric(5,2),
    actual_hours numeric(5,2),
    created_by uuid NOT NULL,
    assigned_to uuid NOT NULL,
    updated_by uuid,
    tags text[],
    is_urgent boolean DEFAULT false,
    is_private boolean DEFAULT false,
    parent_task_id uuid,
    progress_percentage integer DEFAULT 0,
    is_deleted boolean DEFAULT false,
    deleted_at timestamp with time zone,
    deleted_by uuid,
    CONSTRAINT tasks_priority_check CHECK ((priority = ANY (ARRAY[1, 2, 3, 4]))),
    CONSTRAINT tasks_progress_percentage_check CHECK (((progress_percentage >= 0) AND (progress_percentage <= 100)))
);


--
-- Name: task_details; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.task_details WITH (security_invoker='true') AS
 SELECT t.id,
    t.created_at,
    t.updated_at,
    t.title,
    t.description,
    t.category_id,
    t.status_id,
    t.priority,
    t.start_date,
    t.due_date,
    t.estimated_hours,
    t.actual_hours,
    t.created_by,
    t.assigned_to,
    t.updated_by,
    t.tags,
    t.is_urgent,
    t.is_private,
    t.parent_task_id,
    t.progress_percentage,
    t.is_deleted,
    t.deleted_at,
    t.deleted_by,
    tc.name AS category_name,
    tc.color AS category_color,
    tc.icon AS category_icon,
    ts.name AS status_name,
    ts.color AS status_color,
    ts.icon AS status_icon,
    ts.status_type,
    ts.is_final AS status_is_final,
    creator.name AS created_by_name,
    creator.email AS created_by_email,
    assignee.name AS assigned_to_name,
    assignee.email AS assigned_to_email,
    assignee.department AS assigned_to_department,
    assignee."position" AS assigned_to_position,
    updater.name AS updated_by_name,
    ( SELECT count(*) AS count
           FROM public.task_attachments
          WHERE ((task_attachments.task_id = t.id) AND (task_attachments.is_deleted = false))) AS attachment_count,
    ( SELECT count(*) AS count
           FROM public.tasks
          WHERE ((tasks.parent_task_id = t.id) AND (tasks.is_deleted = false))) AS subtask_count
   FROM (((((public.tasks t
     LEFT JOIN public.task_categories tc ON ((t.category_id = tc.id)))
     LEFT JOIN public.task_statuses ts ON ((t.status_id = ts.id)))
     LEFT JOIN public.employees creator ON ((t.created_by = creator.id)))
     LEFT JOIN public.employees assignee ON ((t.assigned_to = assignee.id)))
     LEFT JOIN public.employees updater ON ((t.updated_by = updater.id)))
  WHERE (t.is_deleted = false);


--
-- Name: task_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.task_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    task_id uuid NOT NULL,
    action character varying(50) NOT NULL,
    field_name character varying(100),
    old_value text,
    new_value text,
    changed_by uuid NOT NULL,
    change_reason text,
    details jsonb
);


--
-- Data for Name: task_attachments; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.task_attachments (id, created_at, task_id, filename, original_filename, file_path, file_size, mime_type, bucket_name, storage_path, uploaded_by, description, upload_status, is_deleted) FROM stdin;
\.


--
-- Data for Name: task_categories; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.task_categories (id, created_at, updated_at, name, description, color, icon, sort_order, is_active, created_by, updated_by, min_permission_level) FROM stdin;
a88b1bd0-0ea9-41bf-88b0-a23b9385b624	2025-09-16 00:57:25.151185+00	2025-09-16 00:57:25.151185+00	시설점검	정기적인 시설 점검 및 유지보수 업무	#3B82F6	settings	1	f	502da2f0-fd81-449a-87c3-5be924067d4c	\N	1
19da4d15-fa02-4849-873a-9f1ae877e3f4	2025-09-16 00:57:25.151185+00	2025-09-16 00:57:25.151185+00	문서작업	보고서 작성, 허가증 관리 등 문서 관련 업무	#10B981	file-text	2	f	502da2f0-fd81-449a-87c3-5be924067d4c	\N	1
5a1161ad-1042-4f10-a1f4-075102309bbe	2025-09-16 00:57:25.151185+00	2025-09-16 00:57:25.151185+00	고객지원	고객 문의 대응 및 지원 업무	#F59E0B	headphones	3	f	502da2f0-fd81-449a-87c3-5be924067d4c	\N	1
1cadab01-c772-4fc7-b671-0fe657045c70	2025-09-16 00:57:25.151185+00	2025-09-16 00:57:25.151185+00	시스템관리	시스템 업데이트, 보안 관리 등 IT 관련 업무	#EF4444	server	4	f	502da2f0-fd81-449a-87c3-5be924067d4c	\N	2
fef9a662-b1e4-44ad-a428-b083d9f87b47	2025-09-16 00:57:25.151185+00	2025-09-16 00:57:25.151185+00	프로젝트	특별 프로젝트 및 개선 업무	#8B5CF6	briefcase	5	f	502da2f0-fd81-449a-87c3-5be924067d4c	\N	2
07061042-1ef1-47e8-a015-d0d87cc8bb0d	2025-09-16 02:17:08.770703+00	2025-09-16 02:17:08.770703+00	고객 상담	초기 연락 및 거래 의사 확인	#3B82F6	users	1	t	502da2f0-fd81-449a-87c3-5be924067d4c	\N	1
b2469c3e-e9fb-44a3-a684-748ef0ec3cff	2025-09-16 02:17:08.770703+00	2025-09-16 02:17:08.770703+00	현장 실사	시설 현황 확인 및 조사	#10B981	search	2	t	502da2f0-fd81-449a-87c3-5be924067d4c	\N	1
12ceda59-3cfe-4aed-b4b4-6ed6531ab710	2025-09-16 02:17:08.770703+00	2025-09-16 02:17:08.770703+00	견적 작성	견적서 작성 및 발송	#F59E0B	file-text	3	t	502da2f0-fd81-449a-87c3-5be924067d4c	\N	1
bebc3442-4a04-44f1-a342-8664a2248dab	2025-09-16 02:17:08.770703+00	2025-09-16 02:17:08.770703+00	계약 체결	계약서 작성 및 계약금 수령	#8B5CF6	file-signature	4	t	502da2f0-fd81-449a-87c3-5be924067d4c	\N	2
6279b60e-b3ae-45f4-94e2-3a0509d42e55	2025-09-16 02:17:08.770703+00	2025-09-16 02:17:08.770703+00	제품 발주	제품 주문 및 출고 관리	#06B6D4	package	5	t	502da2f0-fd81-449a-87c3-5be924067d4c	\N	2
54f9c560-9ff9-4c00-ab55-1bdb7e9dcd42	2025-09-16 02:17:08.770703+00	2025-09-16 02:17:08.770703+00	설치 진행	설치 일정 조율 및 시공	#EF4444	wrench	6	t	502da2f0-fd81-449a-87c3-5be924067d4c	\N	1
ced9d500-c87a-4abe-bf53-be9d291624e4	2025-09-16 02:17:08.770703+00	2025-09-16 02:17:08.770703+00	잔금 정산	잔금 수령 및 완료 서류 발송	#84CC16	dollar-sign	7	t	502da2f0-fd81-449a-87c3-5be924067d4c	\N	2
692c4f20-a63b-4c0f-813e-b1f0036fb236	2025-09-16 02:17:08.770703+00	2025-09-16 02:17:08.770703+00	지원 신청	부착지원신청서 지자체 제출	#F97316	file-plus	8	t	502da2f0-fd81-449a-87c3-5be924067d4c	\N	2
2d23c169-f121-44d1-9c02-ce72719c549f	2025-09-16 02:17:08.770703+00	2025-09-16 02:17:08.770703+00	서류 보완	지자체 서류 보완 요청 대응	#6366F1	file-edit	9	t	502da2f0-fd81-449a-87c3-5be924067d4c	\N	1
5f8fb935-35f1-4891-bae7-8d4999b08d09	2025-09-16 02:17:08.770703+00	2025-09-16 02:17:08.770703+00	착공 전 실사	지자체 담당자와 공동 실사	#14B8A6	clipboard-check	10	t	502da2f0-fd81-449a-87c3-5be924067d4c	\N	2
3b670e7a-d2fd-4ffb-8aba-addcbf95471d	2025-09-16 02:17:08.770703+00	2025-09-16 02:17:08.770703+00	착공 실사 보완	착공 전 실사 보완 사항 처리	#F43F5E	alert-triangle	11	t	502da2f0-fd81-449a-87c3-5be924067d4c	\N	1
842f34ff-3807-44ce-9031-6804bf2c6e14	2025-09-16 02:17:08.770703+00	2025-09-16 02:17:08.770703+00	준공 실사	지자체와 공동 준공 실사	#22C55E	check-circle	12	t	502da2f0-fd81-449a-87c3-5be924067d4c	\N	2
6b95998a-ade6-45bb-bb27-79cf1808ff2a	2025-09-16 02:17:08.770703+00	2025-09-16 02:17:08.770703+00	준공 보완	준공 실사 보완 사항 처리	#A855F7	refresh-cw	13	t	502da2f0-fd81-449a-87c3-5be924067d4c	\N	1
480f87ee-a414-4ec8-bb8e-358158cef02c	2025-09-16 02:17:08.770703+00	2025-09-16 02:17:08.770703+00	서류 제출	그린링크전송확인서, 부착완료통보서, 보조금지급신청서 제출	#0EA5E9	upload	14	t	502da2f0-fd81-449a-87c3-5be924067d4c	\N	2
cfe8ddae-8cea-4786-b283-5d9b4d6eee46	2025-09-16 02:17:08.770703+00	2025-09-16 02:17:08.770703+00	보조금 수령	지자체 입금 확인 및 완료	#16A34A	check-circle-2	15	t	502da2f0-fd81-449a-87c3-5be924067d4c	\N	2
e6d8b406-957c-45ec-ac3a-e7d2aad37dd3	2025-09-16 02:17:08.770703+00	2025-09-16 02:17:08.770703+00	기타	기타 업무	#6B7280	more-horizontal	99	t	502da2f0-fd81-449a-87c3-5be924067d4c	\N	1
\.


--
-- Data for Name: task_history; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.task_history (id, created_at, task_id, action, field_name, old_value, new_value, changed_by, change_reason, details) FROM stdin;
bba23415-9492-4e20-a406-5a0a24717595	2025-09-16 00:57:25.151185+00	f14c5aa5-97ee-44a6-a51e-f48ede0fb029	created	\N	\N	업무가 생성되었습니다	502da2f0-fd81-449a-87c3-5be924067d4c	\N	{"title": "월간 대기배출시설 점검", "due_date": "2025-09-23", "priority": 3, "assigned_to": "502da2f0-fd81-449a-87c3-5be924067d4c"}
066604da-61b4-400f-9f92-eee9baa947ad	2025-09-16 00:57:25.151185+00	401c7a73-2949-4adb-a75c-c1eec10fe418	created	\N	\N	업무가 생성되었습니다	502da2f0-fd81-449a-87c3-5be924067d4c	\N	{"title": "A공장 방지시설 정밀점검", "due_date": "2025-09-26", "priority": 2, "assigned_to": "502da2f0-fd81-449a-87c3-5be924067d4c"}
30d5dfd1-67f5-4be6-8f5f-92c80b7f76e8	2025-09-16 00:57:25.151185+00	045f0fa5-857c-4690-afd5-a5fd88452a30	created	\N	\N	업무가 생성되었습니다	502da2f0-fd81-449a-87c3-5be924067d4c	\N	{"title": "대기배출허가증 갱신 신청", "due_date": "2025-09-30", "priority": 4, "assigned_to": "502da2f0-fd81-449a-87c3-5be924067d4c"}
845032ab-c1dc-4ed2-90dc-31d29f881d43	2025-09-16 00:57:25.151185+00	ce0f9b88-7fb7-4e15-90f9-e9c902c10ff8	created	\N	\N	업무가 생성되었습니다	502da2f0-fd81-449a-87c3-5be924067d4c	\N	{"title": "월간 실사 보고서 작성", "due_date": "2025-09-18", "priority": 2, "assigned_to": "502da2f0-fd81-449a-87c3-5be924067d4c"}
faad5945-27a1-4b04-8f15-1ab3a6d466c7	2025-09-16 00:57:25.151185+00	fc71f33f-e2b3-49b9-8441-e3e28334787d	created	\N	\N	업무가 생성되었습니다	502da2f0-fd81-449a-87c3-5be924067d4c	\N	{"title": "C업체 환경컨설팅 문의 대응", "due_date": "2025-09-15", "priority": 1, "assigned_to": "502da2f0-fd81-449a-87c3-5be924067d4c"}
f18e3739-d6ac-4293-b093-a9ca48190988	2025-09-16 00:57:25.151185+00	bb4b256f-1b10-4f7d-a7ae-57310a72f58f	created	\N	\N	업무가 생성되었습니다	502da2f0-fd81-449a-87c3-5be924067d4c	\N	{"title": "시설관리 시스템 백업", "due_date": "2025-09-16", "priority": 2, "assigned_to": "502da2f0-fd81-449a-87c3-5be924067d4c"}
f7d4b84d-5ec9-4c86-aed6-251e3089a5f4	2025-09-16 00:57:25.151185+00	f14c5aa5-97ee-44a6-a51e-f48ede0fb029	progress_updated	progress_percentage	0	30	502da2f0-fd81-449a-87c3-5be924067d4c	초기 작업 시작 및 진행 상황 업데이트	\N
a5a32068-c781-478c-941a-283b14a35f3e	2025-09-16 00:57:25.151185+00	ce0f9b88-7fb7-4e15-90f9-e9c902c10ff8	status_changed	status_id	진행중	검토중	502da2f0-fd81-449a-87c3-5be924067d4c	작업 완료 후 관리자 검토 요청	\N
ffd29f56-2dbd-4b5a-9da6-b998a61cd81f	2025-09-16 00:57:36.046587+00	ad3c0063-101b-4dd6-8695-8a0eb5db6a1a	created	\N	\N	업무가 생성되었습니다	502da2f0-fd81-449a-87c3-5be924067d4c	\N	{"title": "테스트 업무 2025-09-16T00:57:35.888Z", "due_date": "2025-09-23", "priority": 2, "assigned_to": "502da2f0-fd81-449a-87c3-5be924067d4c"}
4e6dbf61-6cb0-4225-abc0-523abbd93adc	2025-09-16 00:58:17.632164+00	0d185963-5b7c-4e3a-8cdc-fc5a4659fc83	created	\N	\N	업무가 생성되었습니다	502da2f0-fd81-449a-87c3-5be924067d4c	\N	{"title": "테스트 업무 2025-09-16T00:58:17.484Z", "due_date": "2025-09-23", "priority": 2, "assigned_to": "502da2f0-fd81-449a-87c3-5be924067d4c"}
9fb64829-352a-4c6b-a18d-e0c0142d00fe	2025-09-16 02:18:09.260223+00	3337ffcd-f275-406e-8dc4-22785e1ec846	created	\N	\N	업무가 생성되었습니다	502da2f0-fd81-449a-87c3-5be924067d4c	\N	{"title": "건양아울렛 현장 실사", "due_date": "2025-09-23", "priority": 3, "assigned_to": "502da2f0-fd81-449a-87c3-5be924067d4c"}
d0a723d1-bd28-44ce-917f-f5dbb07dc398	2025-09-16 02:18:09.350706+00	1ab973e6-b1fd-4ea5-8850-a2b3cca6ccec	created	\N	\N	업무가 생성되었습니다	502da2f0-fd81-449a-87c3-5be924067d4c	\N	{"title": "대우백화점 견적서 작성", "due_date": "2025-09-19", "priority": 2, "assigned_to": "502da2f0-fd81-449a-87c3-5be924067d4c"}
b2acc83c-5a97-4491-86c9-1b4501b4aab8	2025-09-16 02:18:09.407558+00	6263eebc-050c-4c8c-b0cd-7b723b78264f	created	\N	\N	업무가 생성되었습니다	502da2f0-fd81-449a-87c3-5be924067d4c	\N	{"title": "롯데마트 계약 체결", "due_date": "2025-09-17", "priority": 4, "assigned_to": "502da2f0-fd81-449a-87c3-5be924067d4c"}
66fc968b-2b24-470c-9b77-5639f3de2019	2025-09-16 02:18:09.471037+00	47263623-bbb6-41f6-9935-9502e944b8c0	created	\N	\N	업무가 생성되었습니다	502da2f0-fd81-449a-87c3-5be924067d4c	\N	{"title": "이마트 설치 진행", "due_date": "2025-09-26", "priority": 3, "assigned_to": "502da2f0-fd81-449a-87c3-5be924067d4c"}
192000d4-14bf-4174-9c87-787c85b8aa03	2025-09-16 02:18:09.52074+00	17323c57-c89a-46d1-8de3-285a89f19f04	created	\N	\N	업무가 생성되었습니다	502da2f0-fd81-449a-87c3-5be924067d4c	\N	{"title": "홈플러스 보조금 신청서류 제출", "due_date": "2025-09-13", "priority": 2, "assigned_to": "502da2f0-fd81-449a-87c3-5be924067d4c"}
1563be39-8174-4108-82a5-8fd7e4f26e18	2025-09-16 02:49:12.122687+00	81e13686-985d-4838-8f86-c5699e154bd9	created	\N	\N	업무가 생성되었습니다	502da2f0-fd81-449a-87c3-5be924067d4c	\N	{"title": "문서 자동화 생성하기", "due_date": null, "priority": 2, "assigned_to": "502da2f0-fd81-449a-87c3-5be924067d4c"}
\.


--
-- Data for Name: task_statuses; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.task_statuses (id, created_at, name, description, color, icon, status_type, sort_order, is_active, is_final, required_permission_level) FROM stdin;
5b6f5091-4900-4a66-99c3-7e113db6c1d6	2025-09-16 00:57:25.151185+00	신규	새로 등록된 업무	#6B7280	plus-circle	pending	1	t	f	1
62a73960-abae-4a9f-a8f3-71d94f096d91	2025-09-16 00:57:25.151185+00	할당대기	담당자 배정 대기 중	#F59E0B	user-plus	pending	2	t	f	2
d3a2d38b-dd14-4857-bdc6-7c7d31151889	2025-09-16 00:57:25.151185+00	진행중	현재 작업 중인 업무	#3B82F6	play-circle	active	3	t	f	1
0cde2da3-5c9f-4f0c-b4db-b009bd4b9a32	2025-09-16 00:57:25.151185+00	검토중	작업 완료 후 검토 중	#8B5CF6	eye	active	4	t	f	2
34ee5b18-2b33-45bf-b1a0-8010a9326a06	2025-09-16 00:57:25.151185+00	승인대기	최종 승인 대기 중	#F59E0B	clock	active	5	t	f	2
8c7ae730-3210-434d-8e0f-5a0b49995b32	2025-09-16 00:57:25.151185+00	완료	성공적으로 완료된 업무	#10B981	check-circle	completed	6	t	f	1
cbd01d93-3e62-4297-840f-3f1fc59b7ad8	2025-09-16 00:57:25.151185+00	승인완료	승인까지 완료된 업무	#059669	check-circle-2	completed	7	t	f	2
551284be-b2db-4036-a590-b9d745b9b3a1	2025-09-16 00:57:25.151185+00	보류	일시적으로 중단된 업무	#EF4444	pause-circle	on_hold	8	t	f	2
15cd4a12-4e58-428a-b76d-83885c7a6077	2025-09-16 00:57:25.151185+00	취소	취소된 업무	#6B7280	x-circle	cancelled	9	t	f	2
64b98511-43a6-4219-8583-fe01b72a5e51	2025-09-16 02:17:08.961936+00	진행 중	현재 작업 중인 업무	#F59E0B	play-circle	active	2	t	f	1
af5ebfe1-72fa-4c63-bd23-769f047978b6	2025-09-16 02:17:09.058368+00	검토 중	검토가 필요한 업무	#8B5CF6	eye	active	3	t	f	1
\.


--
-- Data for Name: tasks; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.tasks (id, created_at, updated_at, title, description, category_id, status_id, priority, start_date, due_date, estimated_hours, actual_hours, created_by, assigned_to, updated_by, tags, is_urgent, is_private, parent_task_id, progress_percentage, is_deleted, deleted_at, deleted_by) FROM stdin;
f14c5aa5-97ee-44a6-a51e-f48ede0fb029	2025-09-16 00:57:25.151185+00	2025-09-16 00:57:25.151185+00	월간 대기배출시설 점검	이번 달 정기 대기배출시설 점검을 실시하고 점검 보고서를 작성합니다. 각 시설별 배출 농도 측정 및 방지시설 작동 상태를 확인해야 합니다.	a88b1bd0-0ea9-41bf-88b0-a23b9385b624	d3a2d38b-dd14-4857-bdc6-7c7d31151889	3	2025-09-16	2025-09-23	16.00	\N	502da2f0-fd81-449a-87c3-5be924067d4c	502da2f0-fd81-449a-87c3-5be924067d4c	\N	{정기점검,대기배출,보고서}	t	f	\N	30	f	\N	\N
401c7a73-2949-4adb-a75c-c1eec10fe418	2025-09-16 00:57:25.151185+00	2025-09-16 00:57:25.151185+00	A공장 방지시설 정밀점검	A공장의 집진시설 및 방지시설에 대한 정밀점검을 실시합니다. 필터 교체 및 청소가 필요할 수 있습니다.	a88b1bd0-0ea9-41bf-88b0-a23b9385b624	5b6f5091-4900-4a66-99c3-7e113db6c1d6	2	2025-09-19	2025-09-26	8.00	\N	502da2f0-fd81-449a-87c3-5be924067d4c	502da2f0-fd81-449a-87c3-5be924067d4c	\N	{A공장,방지시설,정밀점검}	f	f	\N	0	f	\N	\N
045f0fa5-857c-4690-afd5-a5fd88452a30	2025-09-16 00:57:25.151185+00	2025-09-16 00:57:25.151185+00	대기배출허가증 갱신 신청	B사업장의 대기배출허가증 유효기간이 만료 예정이므로 갱신 신청서를 작성하고 제출합니다.	19da4d15-fa02-4849-873a-9f1ae877e3f4	62a73960-abae-4a9f-a8f3-71d94f096d91	4	2025-09-16	2025-09-30	12.00	\N	502da2f0-fd81-449a-87c3-5be924067d4c	502da2f0-fd81-449a-87c3-5be924067d4c	\N	{허가증,갱신,B사업장}	t	f	\N	0	f	\N	\N
ce0f9b88-7fb7-4e15-90f9-e9c902c10ff8	2025-09-16 00:57:25.151185+00	2025-09-16 00:57:25.151185+00	월간 실사 보고서 작성	이번 달 실시한 각 사업장 실사 결과를 종합하여 월간 보고서를 작성합니다.	19da4d15-fa02-4849-873a-9f1ae877e3f4	0cde2da3-5c9f-4f0c-b4db-b009bd4b9a32	2	2025-09-11	2025-09-18	6.00	\N	502da2f0-fd81-449a-87c3-5be924067d4c	502da2f0-fd81-449a-87c3-5be924067d4c	\N	{월간보고서,실사결과}	f	f	\N	80	f	\N	\N
fc71f33f-e2b3-49b9-8441-e3e28334787d	2025-09-16 00:57:25.151185+00	2025-09-16 00:57:25.151185+00	C업체 환경컨설팅 문의 대응	C업체에서 요청한 환경컨설팅 관련 문의사항에 대해 답변하고 견적서를 제공합니다.	5a1161ad-1042-4f10-a1f4-075102309bbe	8c7ae730-3210-434d-8e0f-5a0b49995b32	1	2025-09-13	2025-09-15	4.00	\N	502da2f0-fd81-449a-87c3-5be924067d4c	502da2f0-fd81-449a-87c3-5be924067d4c	\N	{고객문의,컨설팅,견적}	f	f	\N	100	f	\N	\N
bb4b256f-1b10-4f7d-a7ae-57310a72f58f	2025-09-16 00:57:25.151185+00	2025-09-16 00:57:25.151185+00	시설관리 시스템 백업	시설관리 시스템의 주간 백업을 실시하고 백업 파일의 무결성을 검증합니다.	1cadab01-c772-4fc7-b671-0fe657045c70	cbd01d93-3e62-4297-840f-3f1fc59b7ad8	2	2025-09-15	2025-09-16	2.00	\N	502da2f0-fd81-449a-87c3-5be924067d4c	502da2f0-fd81-449a-87c3-5be924067d4c	\N	{백업,시스템,무결성검증}	f	f	\N	100	f	\N	\N
ad3c0063-101b-4dd6-8695-8a0eb5db6a1a	2025-09-16 00:57:36.046587+00	2025-09-16 00:57:36.046587+00	테스트 업무 2025-09-16T00:57:35.888Z	데이터베이스 테스트용 업무입니다.	a88b1bd0-0ea9-41bf-88b0-a23b9385b624	5b6f5091-4900-4a66-99c3-7e113db6c1d6	2	\N	2025-09-23	2.00	\N	502da2f0-fd81-449a-87c3-5be924067d4c	502da2f0-fd81-449a-87c3-5be924067d4c	\N	{테스트,데이터베이스}	f	f	\N	0	f	\N	\N
0d185963-5b7c-4e3a-8cdc-fc5a4659fc83	2025-09-16 00:58:17.632164+00	2025-09-16 00:58:17.632164+00	테스트 업무 2025-09-16T00:58:17.484Z	데이터베이스 테스트용 업무입니다.	a88b1bd0-0ea9-41bf-88b0-a23b9385b624	5b6f5091-4900-4a66-99c3-7e113db6c1d6	2	\N	2025-09-23	2.00	\N	502da2f0-fd81-449a-87c3-5be924067d4c	502da2f0-fd81-449a-87c3-5be924067d4c	\N	{테스트,데이터베이스}	f	f	\N	0	f	\N	\N
3337ffcd-f275-406e-8dc4-22785e1ec846	2025-09-16 02:18:09.260223+00	2025-09-16 02:18:09.260223+00	건양아울렛 현장 실사	건양아울렛 시설 현황 확인 및 방지시설 설치 가능성 조사	b2469c3e-e9fb-44a3-a684-748ef0ec3cff	64b98511-43a6-4219-8583-fe01b72a5e51	3	2025-09-16	2025-09-23	4.00	\N	502da2f0-fd81-449a-87c3-5be924067d4c	502da2f0-fd81-449a-87c3-5be924067d4c	\N	{현장조사,건양아울렛,방지시설}	f	f	\N	30	f	\N	\N
1ab973e6-b1fd-4ea5-8850-a2b3cca6ccec	2025-09-16 02:18:09.350706+00	2025-09-16 02:18:09.350706+00	대우백화점 견적서 작성	대우백화점 대기방지시설 설치 견적서 작성 및 발송	12ceda59-3cfe-4aed-b4b4-6ed6531ab710	5b6f5091-4900-4a66-99c3-7e113db6c1d6	2	2025-09-16	2025-09-19	2.00	\N	502da2f0-fd81-449a-87c3-5be924067d4c	502da2f0-fd81-449a-87c3-5be924067d4c	\N	{견적,대우백화점,대기방지시설}	f	f	\N	0	f	\N	\N
6263eebc-050c-4c8c-b0cd-7b723b78264f	2025-09-16 02:18:09.407558+00	2025-09-16 02:18:09.407558+00	롯데마트 계약 체결	롯데마트 방지시설 설치 계약서 작성 및 계약금 수령 확인	bebc3442-4a04-44f1-a342-8664a2248dab	64b98511-43a6-4219-8583-fe01b72a5e51	4	2025-09-14	2025-09-17	3.00	\N	502da2f0-fd81-449a-87c3-5be924067d4c	502da2f0-fd81-449a-87c3-5be924067d4c	\N	{계약,롯데마트,긴급}	t	f	\N	70	f	\N	\N
47263623-bbb6-41f6-9935-9502e944b8c0	2025-09-16 02:18:09.471037+00	2025-09-16 02:18:09.471037+00	이마트 설치 진행	이마트 트레이더 방지시설 설치 일정 조율 및 시공 진행	bebc3442-4a04-44f1-a342-8664a2248dab	64b98511-43a6-4219-8583-fe01b72a5e51	3	2025-09-11	2025-09-26	16.00	\N	502da2f0-fd81-449a-87c3-5be924067d4c	502da2f0-fd81-449a-87c3-5be924067d4c	\N	{설치,이마트,트레이더}	f	f	\N	45	f	\N	\N
17323c57-c89a-46d1-8de3-285a89f19f04	2025-09-16 02:18:09.52074+00	2025-09-16 02:18:09.52074+00	홈플러스 보조금 신청서류 제출	홈플러스 부착지원신청서 광주시청 제출	6279b60e-b3ae-45f4-94e2-3a0509d42e55	8c7ae730-3210-434d-8e0f-5a0b49995b32	2	2025-09-06	2025-09-13	1.00	\N	502da2f0-fd81-449a-87c3-5be924067d4c	502da2f0-fd81-449a-87c3-5be924067d4c	\N	{보조금,홈플러스,광주시청}	f	f	\N	100	f	\N	\N
81e13686-985d-4838-8f86-c5699e154bd9	2025-09-16 02:49:12.122687+00	2025-09-16 03:11:03.010018+00	문서 자동화 생성하기	견적서, 계약서, 보조금 서류들	e6d8b406-957c-45ec-ac3a-e7d2aad37dd3	5b6f5091-4900-4a66-99c3-7e113db6c1d6	2	2025-09-16	\N	24.00	\N	502da2f0-fd81-449a-87c3-5be924067d4c	502da2f0-fd81-449a-87c3-5be924067d4c	502da2f0-fd81-449a-87c3-5be924067d4c	{개발,자동화}	f	t	\N	0	f	\N	\N
\.


--
-- Name: task_attachments task_attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_attachments
    ADD CONSTRAINT task_attachments_pkey PRIMARY KEY (id);


--
-- Name: task_categories task_categories_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_categories
    ADD CONSTRAINT task_categories_name_key UNIQUE (name);


--
-- Name: task_categories task_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_categories
    ADD CONSTRAINT task_categories_pkey PRIMARY KEY (id);


--
-- Name: task_history task_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_history
    ADD CONSTRAINT task_history_pkey PRIMARY KEY (id);


--
-- Name: task_statuses task_statuses_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_statuses
    ADD CONSTRAINT task_statuses_name_key UNIQUE (name);


--
-- Name: task_statuses task_statuses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_statuses
    ADD CONSTRAINT task_statuses_pkey PRIMARY KEY (id);


--
-- Name: tasks tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_pkey PRIMARY KEY (id);


--
-- Name: idx_task_attachments_task; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_task_attachments_task ON public.task_attachments USING btree (task_id);


--
-- Name: idx_task_history_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_task_history_created_at ON public.task_history USING btree (created_at);


--
-- Name: idx_task_history_task; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_task_history_task ON public.task_history USING btree (task_id);


--
-- Name: idx_tasks_assigned_to; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tasks_assigned_to ON public.tasks USING btree (assigned_to);


--
-- Name: idx_tasks_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tasks_category ON public.tasks USING btree (category_id);


--
-- Name: idx_tasks_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tasks_created_at ON public.tasks USING btree (created_at);


--
-- Name: idx_tasks_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tasks_created_by ON public.tasks USING btree (created_by);


--
-- Name: idx_tasks_due_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tasks_due_date ON public.tasks USING btree (due_date);


--
-- Name: idx_tasks_is_deleted; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tasks_is_deleted ON public.tasks USING btree (is_deleted);


--
-- Name: idx_tasks_priority; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tasks_priority ON public.tasks USING btree (priority);


--
-- Name: idx_tasks_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tasks_status ON public.tasks USING btree (status_id);


--
-- Name: tasks task_history_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER task_history_trigger AFTER INSERT OR UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.create_task_history();


--
-- Name: tasks update_tasks_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.update_task_updated_at();


--
-- Name: task_attachments task_attachments_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_attachments
    ADD CONSTRAINT task_attachments_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;


--
-- Name: task_attachments task_attachments_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_attachments
    ADD CONSTRAINT task_attachments_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.employees(id);


--
-- Name: task_categories task_categories_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_categories
    ADD CONSTRAINT task_categories_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.employees(id);


--
-- Name: task_categories task_categories_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_categories
    ADD CONSTRAINT task_categories_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.employees(id);


--
-- Name: task_history task_history_changed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_history
    ADD CONSTRAINT task_history_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES public.employees(id);


--
-- Name: task_history task_history_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_history
    ADD CONSTRAINT task_history_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;


--
-- Name: tasks tasks_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.employees(id);


--
-- Name: tasks tasks_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.task_categories(id);


--
-- Name: tasks tasks_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.employees(id);


--
-- Name: tasks tasks_deleted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES public.employees(id);


--
-- Name: tasks tasks_parent_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_parent_task_id_fkey FOREIGN KEY (parent_task_id) REFERENCES public.tasks(id);


--
-- Name: tasks tasks_status_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_status_id_fkey FOREIGN KEY (status_id) REFERENCES public.task_statuses(id);


--
-- Name: tasks tasks_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.employees(id);


--
-- Name: task_statuses All users can view statuses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "All users can view statuses" ON public.task_statuses FOR SELECT USING ((is_active = true));


--
-- Name: tasks Users can create tasks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create tasks" ON public.tasks FOR INSERT WITH CHECK ((created_by = auth.uid()));


--
-- Name: tasks Users can update their tasks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their tasks" ON public.tasks FOR UPDATE USING (((created_by = auth.uid()) OR (assigned_to = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.employees
  WHERE ((employees.id = auth.uid()) AND (employees.permission_level >= 2))))));


--
-- Name: task_categories Users can view categories they have access to; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view categories they have access to" ON public.task_categories FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.employees
  WHERE ((employees.id = auth.uid()) AND (employees.permission_level >= task_categories.min_permission_level)))));


--
-- Name: tasks Users can view related tasks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view related tasks" ON public.tasks FOR SELECT USING (((assigned_to = auth.uid()) OR (created_by = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.employees
  WHERE ((employees.id = auth.uid()) AND (employees.permission_level >= 2))))));


--
-- Name: task_history Users can view task history for accessible tasks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view task history for accessible tasks" ON public.task_history FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.tasks
  WHERE ((tasks.id = task_history.task_id) AND ((tasks.assigned_to = auth.uid()) OR (tasks.created_by = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.employees
          WHERE ((employees.id = auth.uid()) AND (employees.permission_level >= 2)))))))));


--
-- Name: task_attachments service_role_full_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_full_access ON public.task_attachments TO service_role USING (true) WITH CHECK (true);


--
-- Name: task_categories service_role_full_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_full_access ON public.task_categories TO service_role USING (true) WITH CHECK (true);


--
-- Name: task_history service_role_full_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_full_access ON public.task_history TO service_role USING (true) WITH CHECK (true);


--
-- Name: task_statuses service_role_full_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_full_access ON public.task_statuses TO service_role USING (true) WITH CHECK (true);


--
-- Name: tasks service_role_full_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_full_access ON public.tasks TO service_role USING (true) WITH CHECK (true);


--
-- Name: task_attachments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.task_attachments ENABLE ROW LEVEL SECURITY;

--
-- Name: task_categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.task_categories ENABLE ROW LEVEL SECURITY;

--
-- Name: task_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.task_history ENABLE ROW LEVEL SECURITY;

--
-- Name: task_statuses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.task_statuses ENABLE ROW LEVEL SECURITY;

--
-- Name: tasks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

--
-- Name: TABLE task_attachments; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.task_attachments TO service_role;
GRANT SELECT ON TABLE public.task_attachments TO anon;
GRANT SELECT ON TABLE public.task_attachments TO authenticated;


--
-- Name: TABLE task_categories; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.task_categories TO service_role;
GRANT SELECT ON TABLE public.task_categories TO anon;
GRANT SELECT ON TABLE public.task_categories TO authenticated;


--
-- Name: TABLE task_statuses; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.task_statuses TO service_role;
GRANT SELECT ON TABLE public.task_statuses TO anon;
GRANT SELECT ON TABLE public.task_statuses TO authenticated;


--
-- Name: TABLE tasks; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.tasks TO service_role;
GRANT SELECT ON TABLE public.tasks TO anon;
GRANT SELECT ON TABLE public.tasks TO authenticated;


--
-- Name: TABLE task_details; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.task_details TO service_role;
GRANT SELECT ON TABLE public.task_details TO anon;
GRANT SELECT ON TABLE public.task_details TO authenticated;


--
-- Name: TABLE task_history; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.task_history TO service_role;
GRANT SELECT ON TABLE public.task_history TO anon;
GRANT SELECT ON TABLE public.task_history TO authenticated;


--
-- PostgreSQL database dump complete
--

\unrestrict 35XSWlI2dyOUrpVhFC2Iam5gjgwbwfHBrqYlYyztleGShEvK9f2kxWhOkFvvlgd

