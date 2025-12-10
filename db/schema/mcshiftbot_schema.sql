--
-- PostgreSQL database dump
--

\restrict r5DywUCPmeJJ5R9BJM9F30BkRdDgtagMYieS276kBMGmrxVaep6MZtL7HCLiItz

-- Dumped from database version 14.20 (Ubuntu 14.20-0ubuntu0.22.04.1)
-- Dumped by pg_dump version 14.20 (Ubuntu 14.20-0ubuntu0.22.04.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
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
-- Name: brigadiers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.brigadiers (
    id bigint NOT NULL,
    telegram_id bigint NOT NULL,
    last_name text NOT NULL,
    first_name text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.brigadiers OWNER TO postgres;

--
-- Name: brigadiers_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.brigadiers_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.brigadiers_id_seq OWNER TO postgres;

--
-- Name: brigadiers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.brigadiers_id_seq OWNED BY public.brigadiers.id;


--
-- Name: drivers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.drivers (
    id bigint NOT NULL,
    full_name text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.drivers OWNER TO postgres;

--
-- Name: drivers_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.drivers_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.drivers_id_seq OWNER TO postgres;

--
-- Name: drivers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.drivers_id_seq OWNED BY public.drivers.id;


--
-- Name: hold_photos; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.hold_photos (
    id bigint NOT NULL,
    shift_id bigint NOT NULL,
    hold_id bigint NOT NULL,
    telegram_file_id text NOT NULL,
    disk_path text NOT NULL,
    disk_public_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.hold_photos OWNER TO postgres;

--
-- Name: hold_photos_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.hold_photos_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.hold_photos_id_seq OWNER TO postgres;

--
-- Name: hold_photos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.hold_photos_id_seq OWNED BY public.hold_photos.id;


--
-- Name: holds; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.holds (
    id bigint NOT NULL,
    shift_id bigint NOT NULL,
    number smallint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.holds OWNER TO postgres;

--
-- Name: holds_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.holds_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.holds_id_seq OWNER TO postgres;

--
-- Name: holds_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.holds_id_seq OWNED BY public.holds.id;


--
-- Name: shift_crew; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.shift_crew (
    id bigint NOT NULL,
    shift_id bigint NOT NULL,
    deputy_worker_id bigint,
    driver_id bigint NOT NULL,
    comment text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.shift_crew OWNER TO postgres;

--
-- Name: shift_crew_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.shift_crew_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.shift_crew_id_seq OWNER TO postgres;

--
-- Name: shift_crew_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.shift_crew_id_seq OWNED BY public.shift_crew.id;


--
-- Name: shift_expenses; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.shift_expenses (
    id bigint NOT NULL,
    shift_id bigint NOT NULL,
    transport_amount numeric(12,2) DEFAULT 0 NOT NULL,
    food_amount numeric(12,2) DEFAULT 0 NOT NULL,
    taxi_amount numeric(12,2) DEFAULT 0 NOT NULL,
    total_expenses numeric(12,2) DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.shift_expenses OWNER TO postgres;

--
-- Name: shift_expenses_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.shift_expenses_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.shift_expenses_id_seq OWNER TO postgres;

--
-- Name: shift_expenses_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.shift_expenses_id_seq OWNED BY public.shift_expenses.id;


--
-- Name: shift_materials; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.shift_materials (
    id bigint NOT NULL,
    shift_id bigint NOT NULL,
    hold_id bigint NOT NULL,
    pvd_3m_in integer DEFAULT 0 NOT NULL,
    pvd_6m_in integer DEFAULT 0 NOT NULL,
    pvd_12m_in integer DEFAULT 0 NOT NULL,
    pvd_14m_in integer DEFAULT 0 NOT NULL,
    pvh_tubes_in integer DEFAULT 0 NOT NULL,
    tape_in integer DEFAULT 0 NOT NULL,
    pvd_3m_used integer DEFAULT 0 NOT NULL,
    pvd_6m_used integer DEFAULT 0 NOT NULL,
    pvd_12m_used integer DEFAULT 0 NOT NULL,
    pvd_14m_used integer DEFAULT 0 NOT NULL,
    pvh_tubes_used integer DEFAULT 0 NOT NULL,
    tape_used integer DEFAULT 0 NOT NULL,
    pvd_3m_balance integer DEFAULT 0 NOT NULL,
    pvd_6m_balance integer DEFAULT 0 NOT NULL,
    pvd_12m_balance integer DEFAULT 0 NOT NULL,
    pvd_14m_balance integer DEFAULT 0 NOT NULL,
    pvh_tubes_balance integer DEFAULT 0 NOT NULL,
    tape_balance integer DEFAULT 0 NOT NULL,
    photo_report_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.shift_materials OWNER TO postgres;

--
-- Name: shift_materials_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.shift_materials_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.shift_materials_id_seq OWNER TO postgres;

--
-- Name: shift_materials_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.shift_materials_id_seq OWNED BY public.shift_materials.id;


--
-- Name: shift_wages; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.shift_wages (
    id bigint NOT NULL,
    shift_id bigint NOT NULL,
    brigadier_amount numeric(12,2) DEFAULT 0 NOT NULL,
    deputy_amount numeric(12,2) DEFAULT 0 NOT NULL,
    driver_amount numeric(12,2) DEFAULT 0 NOT NULL,
    workers_total numeric(12,2) DEFAULT 0 NOT NULL,
    assistants_amount numeric(12,2) DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.shift_wages OWNER TO postgres;

--
-- Name: shift_wages_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.shift_wages_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.shift_wages_id_seq OWNER TO postgres;

--
-- Name: shift_wages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.shift_wages_id_seq OWNED BY public.shift_wages.id;


--
-- Name: shift_worker_wages; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.shift_worker_wages (
    id bigint NOT NULL,
    shift_id bigint NOT NULL,
    worker_id bigint NOT NULL,
    amount numeric(12,2) DEFAULT 0 NOT NULL
);


ALTER TABLE public.shift_worker_wages OWNER TO postgres;

--
-- Name: shift_worker_wages_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.shift_worker_wages_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.shift_worker_wages_id_seq OWNER TO postgres;

--
-- Name: shift_worker_wages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.shift_worker_wages_id_seq OWNED BY public.shift_worker_wages.id;


--
-- Name: shift_workers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.shift_workers (
    id bigint NOT NULL,
    shift_id bigint NOT NULL,
    worker_id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.shift_workers OWNER TO postgres;

--
-- Name: shift_workers_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.shift_workers_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.shift_workers_id_seq OWNER TO postgres;

--
-- Name: shift_workers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.shift_workers_id_seq OWNED BY public.shift_workers.id;


--
-- Name: shifts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.shifts (
    id bigint NOT NULL,
    date date NOT NULL,
    brigadier_id bigint NOT NULL,
    ship_id bigint NOT NULL,
    holds_count smallint NOT NULL,
    is_crew_filled boolean DEFAULT false NOT NULL,
    is_salary_filled boolean DEFAULT false NOT NULL,
    is_materials_filled boolean DEFAULT false NOT NULL,
    is_expenses_filled boolean DEFAULT false NOT NULL,
    is_photos_filled boolean DEFAULT false NOT NULL,
    is_closed boolean DEFAULT false NOT NULL,
    group_message_id bigint,
    photo_report_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.shifts OWNER TO postgres;

--
-- Name: shifts_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.shifts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.shifts_id_seq OWNER TO postgres;

--
-- Name: shifts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.shifts_id_seq OWNED BY public.shifts.id;


--
-- Name: ships; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ships (
    id bigint NOT NULL,
    name text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.ships OWNER TO postgres;

--
-- Name: ships_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.ships_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.ships_id_seq OWNER TO postgres;

--
-- Name: ships_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.ships_id_seq OWNED BY public.ships.id;


--
-- Name: workers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.workers (
    id bigint NOT NULL,
    full_name text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.workers OWNER TO postgres;

--
-- Name: workers_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.workers_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.workers_id_seq OWNER TO postgres;

--
-- Name: workers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.workers_id_seq OWNED BY public.workers.id;


--
-- Name: brigadiers id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.brigadiers ALTER COLUMN id SET DEFAULT nextval('public.brigadiers_id_seq'::regclass);


--
-- Name: drivers id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.drivers ALTER COLUMN id SET DEFAULT nextval('public.drivers_id_seq'::regclass);


--
-- Name: hold_photos id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.hold_photos ALTER COLUMN id SET DEFAULT nextval('public.hold_photos_id_seq'::regclass);


--
-- Name: holds id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.holds ALTER COLUMN id SET DEFAULT nextval('public.holds_id_seq'::regclass);


--
-- Name: shift_crew id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.shift_crew ALTER COLUMN id SET DEFAULT nextval('public.shift_crew_id_seq'::regclass);


--
-- Name: shift_expenses id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.shift_expenses ALTER COLUMN id SET DEFAULT nextval('public.shift_expenses_id_seq'::regclass);


--
-- Name: shift_materials id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.shift_materials ALTER COLUMN id SET DEFAULT nextval('public.shift_materials_id_seq'::regclass);


--
-- Name: shift_wages id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.shift_wages ALTER COLUMN id SET DEFAULT nextval('public.shift_wages_id_seq'::regclass);


--
-- Name: shift_worker_wages id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.shift_worker_wages ALTER COLUMN id SET DEFAULT nextval('public.shift_worker_wages_id_seq'::regclass);


--
-- Name: shift_workers id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.shift_workers ALTER COLUMN id SET DEFAULT nextval('public.shift_workers_id_seq'::regclass);


--
-- Name: shifts id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.shifts ALTER COLUMN id SET DEFAULT nextval('public.shifts_id_seq'::regclass);


--
-- Name: ships id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ships ALTER COLUMN id SET DEFAULT nextval('public.ships_id_seq'::regclass);


--
-- Name: workers id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workers ALTER COLUMN id SET DEFAULT nextval('public.workers_id_seq'::regclass);


--
-- Name: brigadiers brigadiers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.brigadiers
    ADD CONSTRAINT brigadiers_pkey PRIMARY KEY (id);


--
-- Name: brigadiers brigadiers_telegram_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.brigadiers
    ADD CONSTRAINT brigadiers_telegram_id_key UNIQUE (telegram_id);


--
-- Name: drivers drivers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.drivers
    ADD CONSTRAINT drivers_pkey PRIMARY KEY (id);


--
-- Name: hold_photos hold_photos_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.hold_photos
    ADD CONSTRAINT hold_photos_pkey PRIMARY KEY (id);


--
-- Name: holds holds_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.holds
    ADD CONSTRAINT holds_pkey PRIMARY KEY (id);


--
-- Name: holds holds_shift_number_uniq; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.holds
    ADD CONSTRAINT holds_shift_number_uniq UNIQUE (shift_id, number);


--
-- Name: shift_crew shift_crew_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.shift_crew
    ADD CONSTRAINT shift_crew_pkey PRIMARY KEY (id);


--
-- Name: shift_crew shift_crew_shift_uniq; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.shift_crew
    ADD CONSTRAINT shift_crew_shift_uniq UNIQUE (shift_id);


--
-- Name: shift_expenses shift_expenses_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.shift_expenses
    ADD CONSTRAINT shift_expenses_pkey PRIMARY KEY (id);


--
-- Name: shift_expenses shift_expenses_shift_uniq; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.shift_expenses
    ADD CONSTRAINT shift_expenses_shift_uniq UNIQUE (shift_id);


--
-- Name: shift_materials shift_materials_hold_uniq; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.shift_materials
    ADD CONSTRAINT shift_materials_hold_uniq UNIQUE (hold_id);


--
-- Name: shift_materials shift_materials_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.shift_materials
    ADD CONSTRAINT shift_materials_pkey PRIMARY KEY (id);


--
-- Name: shift_wages shift_wages_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.shift_wages
    ADD CONSTRAINT shift_wages_pkey PRIMARY KEY (id);


--
-- Name: shift_wages shift_wages_shift_uniq; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.shift_wages
    ADD CONSTRAINT shift_wages_shift_uniq UNIQUE (shift_id);


--
-- Name: shift_worker_wages shift_worker_wages_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.shift_worker_wages
    ADD CONSTRAINT shift_worker_wages_pkey PRIMARY KEY (id);


--
-- Name: shift_worker_wages shift_worker_wages_shift_worker_uniq; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.shift_worker_wages
    ADD CONSTRAINT shift_worker_wages_shift_worker_uniq UNIQUE (shift_id, worker_id);


--
-- Name: shift_workers shift_workers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.shift_workers
    ADD CONSTRAINT shift_workers_pkey PRIMARY KEY (id);


--
-- Name: shift_workers shift_workers_shift_worker_uniq; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.shift_workers
    ADD CONSTRAINT shift_workers_shift_worker_uniq UNIQUE (shift_id, worker_id);


--
-- Name: shifts shifts_date_ship_uniq; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.shifts
    ADD CONSTRAINT shifts_date_ship_uniq UNIQUE (date, ship_id);


--
-- Name: shifts shifts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.shifts
    ADD CONSTRAINT shifts_pkey PRIMARY KEY (id);


--
-- Name: ships ships_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ships
    ADD CONSTRAINT ships_name_key UNIQUE (name);


--
-- Name: ships ships_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ships
    ADD CONSTRAINT ships_pkey PRIMARY KEY (id);


--
-- Name: workers workers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workers
    ADD CONSTRAINT workers_pkey PRIMARY KEY (id);


--
-- Name: hold_photos hold_photos_hold_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.hold_photos
    ADD CONSTRAINT hold_photos_hold_id_fkey FOREIGN KEY (hold_id) REFERENCES public.holds(id);


--
-- Name: hold_photos hold_photos_shift_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.hold_photos
    ADD CONSTRAINT hold_photos_shift_id_fkey FOREIGN KEY (shift_id) REFERENCES public.shifts(id);


--
-- Name: holds holds_shift_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.holds
    ADD CONSTRAINT holds_shift_id_fkey FOREIGN KEY (shift_id) REFERENCES public.shifts(id);


--
-- Name: shift_crew shift_crew_deputy_worker_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.shift_crew
    ADD CONSTRAINT shift_crew_deputy_worker_id_fkey FOREIGN KEY (deputy_worker_id) REFERENCES public.workers(id);


--
-- Name: shift_crew shift_crew_driver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.shift_crew
    ADD CONSTRAINT shift_crew_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES public.drivers(id);


--
-- Name: shift_crew shift_crew_shift_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.shift_crew
    ADD CONSTRAINT shift_crew_shift_id_fkey FOREIGN KEY (shift_id) REFERENCES public.shifts(id);


--
-- Name: shift_expenses shift_expenses_shift_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.shift_expenses
    ADD CONSTRAINT shift_expenses_shift_id_fkey FOREIGN KEY (shift_id) REFERENCES public.shifts(id);


--
-- Name: shift_materials shift_materials_hold_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.shift_materials
    ADD CONSTRAINT shift_materials_hold_id_fkey FOREIGN KEY (hold_id) REFERENCES public.holds(id);


--
-- Name: shift_materials shift_materials_shift_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.shift_materials
    ADD CONSTRAINT shift_materials_shift_id_fkey FOREIGN KEY (shift_id) REFERENCES public.shifts(id);


--
-- Name: shift_wages shift_wages_shift_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.shift_wages
    ADD CONSTRAINT shift_wages_shift_id_fkey FOREIGN KEY (shift_id) REFERENCES public.shifts(id);


--
-- Name: shift_worker_wages shift_worker_wages_shift_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.shift_worker_wages
    ADD CONSTRAINT shift_worker_wages_shift_id_fkey FOREIGN KEY (shift_id) REFERENCES public.shifts(id);


--
-- Name: shift_worker_wages shift_worker_wages_worker_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.shift_worker_wages
    ADD CONSTRAINT shift_worker_wages_worker_id_fkey FOREIGN KEY (worker_id) REFERENCES public.workers(id);


--
-- Name: shift_workers shift_workers_shift_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.shift_workers
    ADD CONSTRAINT shift_workers_shift_id_fkey FOREIGN KEY (shift_id) REFERENCES public.shifts(id);


--
-- Name: shift_workers shift_workers_worker_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.shift_workers
    ADD CONSTRAINT shift_workers_worker_id_fkey FOREIGN KEY (worker_id) REFERENCES public.workers(id);


--
-- Name: shifts shifts_brigadier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.shifts
    ADD CONSTRAINT shifts_brigadier_id_fkey FOREIGN KEY (brigadier_id) REFERENCES public.brigadiers(id);


--
-- Name: shifts shifts_ship_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.shifts
    ADD CONSTRAINT shifts_ship_id_fkey FOREIGN KEY (ship_id) REFERENCES public.ships(id);


--
-- PostgreSQL database dump complete
--

\unrestrict r5DywUCPmeJJ5R9BJM9F30BkRdDgtagMYieS276kBMGmrxVaep6MZtL7HCLiItz

