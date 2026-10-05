--
-- PostgreSQL database dump
--

\restrict lZiCUM7iJ25Cy3pomFKzvRVaU0sNc13yN8sY8lmKedbnmnHw5aYPaHe3qlz7sUa

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
-- Name: delay_notification_reads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.delay_notification_reads (
    id bigint NOT NULL,
    notification_id bigint NOT NULL,
    user_id uuid NOT NULL,
    user_name character varying(100) NOT NULL,
    read_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE delay_notification_reads; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.delay_notification_reads IS '지연 알림 읽음 상태 기록';


--
-- Name: delay_notification_reads_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.delay_notification_reads_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: delay_notification_reads_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.delay_notification_reads_id_seq OWNED BY public.delay_notification_reads.id;


--
-- Name: delay_notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.delay_notifications (
    id bigint NOT NULL,
    title character varying(255) NOT NULL,
    message text NOT NULL,
    category public.delay_notification_category NOT NULL,
    priority public.delay_notification_priority DEFAULT 'medium'::public.delay_notification_priority,
    task_id uuid NOT NULL,
    task_title character varying(255) NOT NULL,
    task_type character varying(20) NOT NULL,
    business_name character varying(255) NOT NULL,
    assignee_id uuid NOT NULL,
    assignee_name character varying(100) NOT NULL,
    delay_days integer DEFAULT 0 NOT NULL,
    days_since_start integer DEFAULT 0 NOT NULL,
    escalation_level integer DEFAULT 0 NOT NULL,
    is_read boolean DEFAULT false NOT NULL,
    read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '30 days'::interval),
    metadata jsonb DEFAULT '{}'::jsonb,
    created_by_name character varying(100) DEFAULT 'System'::character varying,
    related_url character varying(500)
);


--
-- Name: TABLE delay_notifications; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.delay_notifications IS '지연 업무 알림 메인 테이블 (완전 독립형)';


--
-- Name: delay_notifications_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.delay_notifications_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: delay_notifications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.delay_notifications_id_seq OWNED BY public.delay_notifications.id;


--
-- Name: delay_scheduler_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.delay_scheduler_logs (
    id bigint NOT NULL,
    execution_started_at timestamp with time zone DEFAULT now() NOT NULL,
    execution_completed_at timestamp with time zone,
    execution_duration_ms integer,
    tasks_processed integer DEFAULT 0,
    notifications_created integer DEFAULT 0,
    escalations_created integer DEFAULT 0,
    errors_count integer DEFAULT 0,
    error_details jsonb,
    config_used jsonb,
    status character varying(20) DEFAULT 'running'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT delay_scheduler_logs_status_check CHECK (((status)::text = ANY (ARRAY[('running'::character varying)::text, ('completed'::character varying)::text, ('failed'::character varying)::text])))
);


--
-- Name: TABLE delay_scheduler_logs; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.delay_scheduler_logs IS '지연 알림 스케줄러 실행 로그';


--
-- Name: delay_scheduler_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.delay_scheduler_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: delay_scheduler_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.delay_scheduler_logs_id_seq OWNED BY public.delay_scheduler_logs.id;


--
-- Name: delay_thresholds; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.delay_thresholds (
    id bigint NOT NULL,
    task_type character varying(20) NOT NULL,
    warning_days integer NOT NULL,
    critical_days integer NOT NULL,
    overdue_days integer NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT delay_thresholds_check CHECK ((critical_days > warning_days)),
    CONSTRAINT delay_thresholds_check1 CHECK ((overdue_days > critical_days)),
    CONSTRAINT delay_thresholds_task_type_check CHECK (((task_type)::text = ANY (ARRAY[('self'::character varying)::text, ('subsidy'::character varying)::text, ('as'::character varying)::text, ('etc'::character varying)::text]))),
    CONSTRAINT delay_thresholds_warning_days_check CHECK ((warning_days > 0))
);


--
-- Name: TABLE delay_thresholds; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.delay_thresholds IS '업무 유형별 지연 기준 설정';


--
-- Name: delay_thresholds_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.delay_thresholds_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: delay_thresholds_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.delay_thresholds_id_seq OWNED BY public.delay_thresholds.id;


--
-- Name: v_active_delay_thresholds; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_active_delay_thresholds WITH (security_invoker='true') AS
 SELECT task_type,
    warning_days,
    critical_days,
    overdue_days,
    created_at,
    updated_at
   FROM public.delay_thresholds
  WHERE (is_active = true)
  ORDER BY task_type;


--
-- Name: v_delay_notification_stats; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_delay_notification_stats WITH (security_invoker='true') AS
 SELECT date_trunc('day'::text, created_at) AS notification_date,
    category,
    priority,
    count(*) AS notification_count,
    count(
        CASE
            WHEN is_read THEN 1
            ELSE NULL::integer
        END) AS read_count,
    count(
        CASE
            WHEN (NOT is_read) THEN 1
            ELSE NULL::integer
        END) AS unread_count,
    (avg((EXTRACT(epoch FROM (read_at - created_at)) / (3600)::numeric)))::integer AS avg_response_hours
   FROM public.delay_notifications dn
  WHERE ((created_at >= (now() - '30 days'::interval)) AND (expires_at > now()))
  GROUP BY (date_trunc('day'::text, created_at)), category, priority
  ORDER BY (date_trunc('day'::text, created_at)) DESC, category;


--
-- Name: v_task_delay_notifications; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_task_delay_notifications WITH (security_invoker='true') AS
 SELECT task_id,
    task_title,
    business_name,
    task_type,
    count(id) AS total_notifications,
    count(
        CASE
            WHEN (category = 'risk_task'::public.delay_notification_category) THEN 1
            ELSE NULL::integer
        END) AS risk_notifications,
    count(
        CASE
            WHEN (category = 'delayed_task'::public.delay_notification_category) THEN 1
            ELSE NULL::integer
        END) AS delayed_notifications,
    count(
        CASE
            WHEN (category = 'overdue_task'::public.delay_notification_category) THEN 1
            ELSE NULL::integer
        END) AS overdue_notifications,
    count(
        CASE
            WHEN (category = 'escalation_notification'::public.delay_notification_category) THEN 1
            ELSE NULL::integer
        END) AS escalation_notifications,
    max(created_at) AS last_notification_at,
    count(
        CASE
            WHEN (NOT is_read) THEN 1
            ELSE NULL::integer
        END) AS unread_count
   FROM public.delay_notifications dn
  WHERE (expires_at > now())
  GROUP BY task_id, task_title, business_name, task_type
  ORDER BY (count(
        CASE
            WHEN (NOT is_read) THEN 1
            ELSE NULL::integer
        END)) DESC, (max(created_at)) DESC;


--
-- Name: v_user_unread_delay_notifications; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_user_unread_delay_notifications WITH (security_invoker='true') AS
 SELECT id,
    title,
    message,
    category,
    priority,
    task_id,
    task_title,
    business_name,
    assignee_id,
    assignee_name,
    delay_days,
    days_since_start,
    escalation_level,
    created_at,
    related_url,
    metadata
   FROM public.delay_notifications dn
  WHERE ((is_read = false) AND (expires_at > now()))
  ORDER BY priority DESC, created_at DESC;


--
-- Name: delay_notification_reads id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delay_notification_reads ALTER COLUMN id SET DEFAULT nextval('public.delay_notification_reads_id_seq'::regclass);


--
-- Name: delay_notifications id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delay_notifications ALTER COLUMN id SET DEFAULT nextval('public.delay_notifications_id_seq'::regclass);


--
-- Name: delay_scheduler_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delay_scheduler_logs ALTER COLUMN id SET DEFAULT nextval('public.delay_scheduler_logs_id_seq'::regclass);


--
-- Name: delay_thresholds id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delay_thresholds ALTER COLUMN id SET DEFAULT nextval('public.delay_thresholds_id_seq'::regclass);


--
-- Data for Name: delay_notification_reads; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.delay_notification_reads (id, notification_id, user_id, user_name, read_at) FROM stdin;
\.


--
-- Data for Name: delay_notifications; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.delay_notifications (id, title, message, category, priority, task_id, task_title, task_type, business_name, assignee_id, assignee_name, delay_days, days_since_start, escalation_level, is_read, read_at, created_at, expires_at, metadata, created_by_name, related_url) FROM stdin;
1	지연 업무 알림 시스템 테스트	지연 업무 알림 시스템이 성공적으로 설치되었습니다. 이 메시지는 테스트용입니다.	risk_task	medium	15493be8-9217-4582-ac50-7f77c40bc1f3	테스트 업무	self	테스트 사업장	b53a326d-fb68-4425-b791-982c56ce1be0	테스트 담당자	0	7	0	f	\N	2025-09-29 05:27:52.284175+00	2025-10-29 05:27:52.284175+00	{"test": true, "system": "delay_notification"}	System	/admin/tasks
\.


--
-- Data for Name: delay_scheduler_logs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.delay_scheduler_logs (id, execution_started_at, execution_completed_at, execution_duration_ms, tasks_processed, notifications_created, escalations_created, errors_count, error_details, config_used, status, created_at) FROM stdin;
\.


--
-- Data for Name: delay_thresholds; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.delay_thresholds (id, task_type, warning_days, critical_days, overdue_days, is_active, created_at, updated_at) FROM stdin;
3	as	4	8	15	t	2025-09-29 05:27:52.284175+00	2025-09-29 05:52:00.456+00
2	subsidy	15	22	29	t	2025-09-29 05:27:52.284175+00	2025-09-29 05:52:00.456+00
4	etc	8	12	19	t	2025-09-29 05:27:52.284175+00	2025-09-29 05:52:00.456+00
1	self	8	15	22	t	2025-09-29 05:27:52.284175+00	2025-09-29 05:52:00.456+00
\.


--
-- Name: delay_notification_reads_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.delay_notification_reads_id_seq', 1, false);


--
-- Name: delay_notifications_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.delay_notifications_id_seq', 1, true);


--
-- Name: delay_scheduler_logs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.delay_scheduler_logs_id_seq', 1, false);


--
-- Name: delay_thresholds_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.delay_thresholds_id_seq', 8, true);


--
-- Name: delay_notification_reads delay_notification_reads_notification_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delay_notification_reads
    ADD CONSTRAINT delay_notification_reads_notification_id_user_id_key UNIQUE (notification_id, user_id);


--
-- Name: delay_notification_reads delay_notification_reads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delay_notification_reads
    ADD CONSTRAINT delay_notification_reads_pkey PRIMARY KEY (id);


--
-- Name: delay_notifications delay_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delay_notifications
    ADD CONSTRAINT delay_notifications_pkey PRIMARY KEY (id);


--
-- Name: delay_scheduler_logs delay_scheduler_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delay_scheduler_logs
    ADD CONSTRAINT delay_scheduler_logs_pkey PRIMARY KEY (id);


--
-- Name: delay_thresholds delay_thresholds_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delay_thresholds
    ADD CONSTRAINT delay_thresholds_pkey PRIMARY KEY (id);


--
-- Name: delay_thresholds delay_thresholds_task_type_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delay_thresholds
    ADD CONSTRAINT delay_thresholds_task_type_key UNIQUE (task_type);


--
-- Name: idx_delay_notification_reads_notification_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_delay_notification_reads_notification_id ON public.delay_notification_reads USING btree (notification_id);


--
-- Name: idx_delay_notification_reads_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_delay_notification_reads_user_id ON public.delay_notification_reads USING btree (user_id);


--
-- Name: idx_delay_notifications_assignee_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_delay_notifications_assignee_id ON public.delay_notifications USING btree (assignee_id);


--
-- Name: idx_delay_notifications_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_delay_notifications_category ON public.delay_notifications USING btree (category);


--
-- Name: idx_delay_notifications_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_delay_notifications_created_at ON public.delay_notifications USING btree (created_at);


--
-- Name: idx_delay_notifications_expires_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_delay_notifications_expires_at ON public.delay_notifications USING btree (expires_at);


--
-- Name: idx_delay_notifications_is_read; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_delay_notifications_is_read ON public.delay_notifications USING btree (is_read);


--
-- Name: idx_delay_notifications_priority; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_delay_notifications_priority ON public.delay_notifications USING btree (priority);


--
-- Name: idx_delay_notifications_task_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_delay_notifications_task_id ON public.delay_notifications USING btree (task_id);


--
-- Name: idx_delay_scheduler_logs_started_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_delay_scheduler_logs_started_at ON public.delay_scheduler_logs USING btree (execution_started_at);


--
-- Name: idx_delay_scheduler_logs_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_delay_scheduler_logs_status ON public.delay_scheduler_logs USING btree (status);


--
-- Name: delay_notification_reads delay_notification_reads_notification_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delay_notification_reads
    ADD CONSTRAINT delay_notification_reads_notification_id_fkey FOREIGN KEY (notification_id) REFERENCES public.delay_notifications(id) ON DELETE CASCADE;


--
-- Name: delay_notification_reads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.delay_notification_reads ENABLE ROW LEVEL SECURITY;

--
-- Name: delay_notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.delay_notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: delay_scheduler_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.delay_scheduler_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: delay_thresholds; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.delay_thresholds ENABLE ROW LEVEL SECURITY;

--
-- Name: delay_notification_reads service_role_full_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_full_access ON public.delay_notification_reads TO service_role USING (true) WITH CHECK (true);


--
-- Name: delay_notifications service_role_full_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_full_access ON public.delay_notifications TO service_role USING (true) WITH CHECK (true);


--
-- Name: delay_scheduler_logs service_role_full_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_full_access ON public.delay_scheduler_logs TO service_role USING (true) WITH CHECK (true);


--
-- Name: delay_thresholds service_role_full_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_full_access ON public.delay_thresholds TO service_role USING (true) WITH CHECK (true);


--
-- Name: TABLE delay_notification_reads; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.delay_notification_reads TO service_role;
GRANT SELECT ON TABLE public.delay_notification_reads TO anon;
GRANT SELECT ON TABLE public.delay_notification_reads TO authenticated;


--
-- Name: SEQUENCE delay_notification_reads_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.delay_notification_reads_id_seq TO service_role;
GRANT USAGE ON SEQUENCE public.delay_notification_reads_id_seq TO anon;
GRANT USAGE ON SEQUENCE public.delay_notification_reads_id_seq TO authenticated;


--
-- Name: TABLE delay_notifications; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.delay_notifications TO service_role;
GRANT SELECT ON TABLE public.delay_notifications TO anon;
GRANT SELECT ON TABLE public.delay_notifications TO authenticated;


--
-- Name: SEQUENCE delay_notifications_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.delay_notifications_id_seq TO service_role;
GRANT USAGE ON SEQUENCE public.delay_notifications_id_seq TO anon;
GRANT USAGE ON SEQUENCE public.delay_notifications_id_seq TO authenticated;


--
-- Name: TABLE delay_scheduler_logs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.delay_scheduler_logs TO service_role;
GRANT SELECT ON TABLE public.delay_scheduler_logs TO anon;
GRANT SELECT ON TABLE public.delay_scheduler_logs TO authenticated;


--
-- Name: SEQUENCE delay_scheduler_logs_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.delay_scheduler_logs_id_seq TO service_role;
GRANT USAGE ON SEQUENCE public.delay_scheduler_logs_id_seq TO anon;
GRANT USAGE ON SEQUENCE public.delay_scheduler_logs_id_seq TO authenticated;


--
-- Name: TABLE delay_thresholds; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.delay_thresholds TO service_role;
GRANT SELECT ON TABLE public.delay_thresholds TO anon;
GRANT SELECT ON TABLE public.delay_thresholds TO authenticated;


--
-- Name: SEQUENCE delay_thresholds_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.delay_thresholds_id_seq TO service_role;
GRANT USAGE ON SEQUENCE public.delay_thresholds_id_seq TO anon;
GRANT USAGE ON SEQUENCE public.delay_thresholds_id_seq TO authenticated;


--
-- Name: TABLE v_active_delay_thresholds; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.v_active_delay_thresholds TO service_role;
GRANT SELECT ON TABLE public.v_active_delay_thresholds TO anon;
GRANT SELECT ON TABLE public.v_active_delay_thresholds TO authenticated;


--
-- Name: TABLE v_delay_notification_stats; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.v_delay_notification_stats TO service_role;
GRANT SELECT ON TABLE public.v_delay_notification_stats TO anon;
GRANT SELECT ON TABLE public.v_delay_notification_stats TO authenticated;


--
-- Name: TABLE v_task_delay_notifications; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.v_task_delay_notifications TO service_role;
GRANT SELECT ON TABLE public.v_task_delay_notifications TO anon;
GRANT SELECT ON TABLE public.v_task_delay_notifications TO authenticated;


--
-- Name: TABLE v_user_unread_delay_notifications; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.v_user_unread_delay_notifications TO service_role;
GRANT SELECT ON TABLE public.v_user_unread_delay_notifications TO anon;
GRANT SELECT ON TABLE public.v_user_unread_delay_notifications TO authenticated;


--
-- PostgreSQL database dump complete
--

\unrestrict lZiCUM7iJ25Cy3pomFKzvRVaU0sNc13yN8sY8lmKedbnmnHw5aYPaHe3qlz7sUa

