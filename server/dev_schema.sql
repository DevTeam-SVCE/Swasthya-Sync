-- Schema-only dump of the dev database (swasthya_db), used to initialize the Docker postgres.
-- Regenerate: pg_dump --schema-only --no-owner --no-privileges, then drop \restrict lines and transaction_timeout.
--
-- PostgreSQL database dump
--


-- Dumped from database version 18.6 (Ubuntu 18.6-1.pgdg26.04+2)
-- Dumped by pg_dump version 18.6 (Ubuntu 18.6-1.pgdg26.04+2)

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
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id integer NOT NULL,
    hospital_id integer,
    user_id integer,
    user_name character varying(150),
    user_role character varying(50),
    action character varying(100) NOT NULL,
    resource character varying(100),
    resource_id character varying(50),
    details text,
    ip_address character varying(50),
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: audit_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.audit_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: audit_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.audit_logs_id_seq OWNED BY public.audit_logs.id;


--
-- Name: beds; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.beds (
    id character varying(20) NOT NULL,
    hospital_id integer,
    ward character varying(50) NOT NULL,
    bed_type character varying(30),
    status character varying(20) DEFAULT 'available'::character varying,
    patient_id character varying(20),
    doctor_id character varying(20),
    diagnosis text,
    admitted_at date,
    has_alert boolean DEFAULT false,
    discharge_step integer DEFAULT 0,
    discharge_status character varying(50) DEFAULT 'Admitted'::character varying,
    discharge_notes text
);


--
-- Name: billing; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.billing (
    id character varying(20) NOT NULL,
    hospital_id integer,
    patient_id character varying(20),
    total_amount numeric(12,2),
    paid_amount numeric(12,2) DEFAULT 0,
    status character varying(30) DEFAULT 'Pending'::character varying,
    payment_method character varying(50),
    type character varying(50),
    created_at timestamp with time zone DEFAULT now(),
    notes text,
    refunded_amount numeric(12,2) DEFAULT 0,
    cancel_reason text,
    updated_at timestamp with time zone
);


--
-- Name: blood_donations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.blood_donations (
    id integer NOT NULL,
    hospital_id integer,
    donor_name character varying(150),
    blood_group character varying(5) NOT NULL,
    units integer NOT NULL,
    created_by character varying(100),
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: blood_donations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.blood_donations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: blood_donations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.blood_donations_id_seq OWNED BY public.blood_donations.id;


--
-- Name: blood_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.blood_requests (
    id integer NOT NULL,
    hospital_id integer,
    patient_id character varying(20),
    blood_group character varying(5) NOT NULL,
    units integer DEFAULT 1 NOT NULL,
    product_type character varying(100),
    priority character varying(20) DEFAULT 'Routine'::character varying,
    status character varying(30) DEFAULT 'Pending'::character varying,
    created_by character varying(100),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: blood_requests_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.blood_requests_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: blood_requests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.blood_requests_id_seq OWNED BY public.blood_requests.id;


--
-- Name: blood_stock; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.blood_stock (
    id integer NOT NULL,
    hospital_id integer,
    blood_group character varying(5) NOT NULL,
    units integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT blood_stock_units_check CHECK ((units >= 0))
);


--
-- Name: blood_stock_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.blood_stock_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: blood_stock_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.blood_stock_id_seq OWNED BY public.blood_stock.id;


--
-- Name: clinical_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinical_notes (
    id integer NOT NULL,
    hospital_id integer,
    patient_id character varying(20),
    doctor_id character varying(20),
    note_type character varying(100),
    content text,
    priority character varying(20) DEFAULT 'low'::character varying,
    status character varying(30) DEFAULT 'pending'::character varying,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone
);


--
-- Name: clinical_notes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinical_notes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinical_notes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinical_notes_id_seq OWNED BY public.clinical_notes.id;


--
-- Name: discharge_summary_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.discharge_summary_templates (
    id integer NOT NULL,
    hospital_id integer NOT NULL,
    name character varying(200) NOT NULL,
    type character varying(100) DEFAULT 'General'::character varying,
    description text,
    content text DEFAULT ''::text NOT NULL,
    is_active boolean DEFAULT true,
    created_by integer,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    file_name text,
    file_size integer,
    file_path text
);


--
-- Name: discharge_summary_templates_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.discharge_summary_templates_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: discharge_summary_templates_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.discharge_summary_templates_id_seq OWNED BY public.discharge_summary_templates.id;


--
-- Name: doctors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.doctors (
    id character varying(20) NOT NULL,
    hospital_id integer,
    name character varying(100) NOT NULL,
    department character varying(500) NOT NULL,
    qualification character varying(200),
    experience integer DEFAULT 0,
    rating numeric(3,1) DEFAULT 5.0,
    status character varying(30) DEFAULT 'available'::character varying,
    schedule character varying(100),
    phone character varying(20),
    email character varying(100),
    doctor_type character varying(20) DEFAULT 'in-house'::character varying,
    patient_count integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    user_id integer
);


--
-- Name: er_visits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.er_visits (
    id integer NOT NULL,
    hospital_id integer,
    patient_id character varying(20),
    triage_level character varying(40),
    case_type character varying(100),
    chief_complaint text,
    brought_by character varying(60),
    mlc_type character varying(60) DEFAULT 'None'::character varying,
    police_info text,
    guardian_phone character varying(20),
    vitals jsonb DEFAULT '{}'::jsonb,
    disposition character varying(40) DEFAULT 'Under Triage'::character varying,
    doctor_assigned character varying(150),
    ambulance_no character varying(40),
    created_by character varying(100),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: er_visits_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.er_visits_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: er_visits_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.er_visits_id_seq OWNED BY public.er_visits.id;


--
-- Name: form_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.form_templates (
    id integer NOT NULL,
    hospital_id integer,
    name character varying(200) NOT NULL,
    description text,
    category character varying(100) DEFAULT 'General'::character varying,
    file_path character varying(500) NOT NULL,
    file_name character varying(300) NOT NULL,
    file_size integer,
    page_count integer DEFAULT 1,
    is_active boolean DEFAULT true,
    created_by character varying(100),
    created_at timestamp with time zone DEFAULT now(),
    layout jsonb,
    file_hash character varying(64)
);


--
-- Name: form_templates_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.form_templates_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: form_templates_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.form_templates_id_seq OWNED BY public.form_templates.id;


--
-- Name: grns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.grns (
    id integer NOT NULL,
    hospital_id integer,
    supplier_name character varying(200) NOT NULL,
    invoice_no character varying(100) NOT NULL,
    items jsonb DEFAULT '[]'::jsonb,
    total_value numeric(12,2) DEFAULT 0,
    status character varying(20) DEFAULT 'Verified'::character varying,
    created_by character varying(100),
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: grns_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.grns_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: grns_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.grns_id_seq OWNED BY public.grns.id;


--
-- Name: health_packages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.health_packages (
    id integer NOT NULL,
    hospital_id integer,
    name character varying(200) NOT NULL,
    category character varying(100) DEFAULT 'Health Checkup'::character varying,
    price numeric(12,2) DEFAULT 0,
    services jsonb DEFAULT '[]'::jsonb,
    popular boolean DEFAULT false,
    is_active boolean DEFAULT true,
    created_by character varying(100),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: health_packages_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.health_packages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: health_packages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.health_packages_id_seq OWNED BY public.health_packages.id;


--
-- Name: hospitals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hospitals (
    id integer NOT NULL,
    name character varying(200) NOT NULL,
    address text,
    city character varying(100),
    phone character varying(20),
    email character varying(100),
    license_no character varying(100),
    bed_count integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    logo text,
    report_header_text text,
    report_footer_text text,
    report_tagline character varying(300),
    report_logo text,
    report_header_image text,
    report_footer_image text,
    report_print_mode character varying(50) DEFAULT 'text'::character varying,
    settings jsonb DEFAULT '{}'::jsonb
);


--
-- Name: hospitals_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.hospitals_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: hospitals_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.hospitals_id_seq OWNED BY public.hospitals.id;


--
-- Name: ip_billing_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ip_billing_entries (
    id integer NOT NULL,
    hospital_id integer,
    patient_id character varying(20),
    entry_type character varying(30) NOT NULL,
    data jsonb DEFAULT '{}'::jsonb,
    created_by character varying(100),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: ip_billing_entries_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ip_billing_entries_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ip_billing_entries_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ip_billing_entries_id_seq OWNED BY public.ip_billing_entries.id;


--
-- Name: lab_tests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lab_tests (
    id integer NOT NULL,
    hospital_id integer,
    patient_id character varying(20),
    test_name character varying(100) NOT NULL,
    category character varying(100),
    requested_by character varying(100),
    status character varying(30) DEFAULT 'Pending'::character varying,
    priority character varying(20) DEFAULT 'Routine'::character varying,
    result_notes text,
    ordered_at timestamp with time zone DEFAULT now(),
    completed_at timestamp with time zone,
    result_pdf_path text
);


--
-- Name: lab_tests_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.lab_tests_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: lab_tests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.lab_tests_id_seq OWNED BY public.lab_tests.id;


--
-- Name: nursing_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.nursing_records (
    id integer NOT NULL,
    hospital_id integer,
    patient_id character varying(20),
    record_type character varying(30) NOT NULL,
    data jsonb DEFAULT '{}'::jsonb,
    created_by character varying(100),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: nursing_records_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.nursing_records_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: nursing_records_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.nursing_records_id_seq OWNED BY public.nursing_records.id;


--
-- Name: opd_visits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.opd_visits (
    id integer NOT NULL,
    hospital_id integer,
    patient_id character varying(20),
    doctor_id character varying(20),
    token character varying(20),
    department character varying(100),
    visit_type character varying(50),
    symptoms text,
    diagnosis text,
    prescription text,
    status character varying(30) DEFAULT 'Waiting'::character varying,
    fee numeric(10,2),
    visit_date date DEFAULT CURRENT_DATE,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: opd_visits_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.opd_visits_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: opd_visits_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.opd_visits_id_seq OWNED BY public.opd_visits.id;


--
-- Name: package_bookings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.package_bookings (
    id integer NOT NULL,
    hospital_id integer,
    package_id integer,
    package_name character varying(200),
    patient_id character varying(20),
    booking_date date DEFAULT CURRENT_DATE,
    amount numeric(12,2) DEFAULT 0,
    billing_id character varying(20),
    status character varying(30) DEFAULT 'Booked'::character varying,
    created_by character varying(100),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: package_bookings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.package_bookings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: package_bookings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.package_bookings_id_seq OWNED BY public.package_bookings.id;


--
-- Name: patient_attachments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.patient_attachments (
    id integer NOT NULL,
    hospital_id integer NOT NULL,
    patient_id character varying(20) NOT NULL,
    name character varying(200) NOT NULL,
    category character varying(100) DEFAULT 'Others'::character varying NOT NULL,
    file_path character varying(500) NOT NULL,
    mime_type character varying(100),
    file_size integer,
    uploaded_by character varying(100),
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: patient_attachments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.patient_attachments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: patient_attachments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.patient_attachments_id_seq OWNED BY public.patient_attachments.id;


--
-- Name: patient_discharge_summaries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.patient_discharge_summaries (
    id integer NOT NULL,
    template_id integer,
    patient_id character varying(20),
    annotations jsonb DEFAULT '[]'::jsonb,
    status character varying(30) DEFAULT 'blank'::character varying,
    filled_by character varying(100),
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    text_content text,
    approved_by character varying(100),
    approved_at timestamp with time zone
);


--
-- Name: patient_discharge_summaries_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.patient_discharge_summaries_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: patient_discharge_summaries_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.patient_discharge_summaries_id_seq OWNED BY public.patient_discharge_summaries.id;


--
-- Name: patient_forms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.patient_forms (
    id integer NOT NULL,
    template_id integer,
    patient_id character varying(20),
    annotations jsonb DEFAULT '[]'::jsonb,
    status character varying(30) DEFAULT 'blank'::character varying,
    filled_by character varying(100),
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: patient_forms_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.patient_forms_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: patient_forms_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.patient_forms_id_seq OWNED BY public.patient_forms.id;


--
-- Name: patients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.patients (
    id character varying(20) NOT NULL,
    hospital_id integer,
    name character varying(100) NOT NULL,
    age integer,
    gender character varying(10),
    blood_group character varying(10),
    department character varying(100),
    doctor_id character varying(20),
    phone character varying(20),
    status character varying(30) DEFAULT 'Stable'::character varying,
    admission_type character varying(20) DEFAULT 'OPD'::character varying,
    admitted_at timestamp with time zone DEFAULT now(),
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    email character varying(100),
    address text,
    uhid character varying(30),
    details jsonb DEFAULT '{}'::jsonb
);


--
-- Name: pharmacy_inventory; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pharmacy_inventory (
    id integer NOT NULL,
    hospital_id integer,
    name character varying(150) NOT NULL,
    category character varying(100),
    stock integer DEFAULT 0,
    unit character varying(30),
    price numeric(10,2),
    expiry date,
    manufacturer character varying(150),
    status character varying(30) DEFAULT 'In Stock'::character varying
);


--
-- Name: pharmacy_inventory_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pharmacy_inventory_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pharmacy_inventory_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pharmacy_inventory_id_seq OWNED BY public.pharmacy_inventory.id;


--
-- Name: pharmacy_returns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pharmacy_returns (
    id integer NOT NULL,
    hospital_id integer,
    patient_id character varying(20),
    drug_id integer,
    drug_name character varying(150),
    qty integer NOT NULL,
    refund_amount numeric(12,2) DEFAULT 0,
    reason text,
    created_by character varying(100),
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: pharmacy_returns_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pharmacy_returns_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pharmacy_returns_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pharmacy_returns_id_seq OWNED BY public.pharmacy_returns.id;


--
-- Name: queue_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.queue_tokens (
    id integer NOT NULL,
    hospital_id integer,
    token character varying(20) NOT NULL,
    patient_id character varying(20),
    patient_name character varying(150),
    department character varying(100),
    doctor_id character varying(20),
    priority character varying(30) DEFAULT 'Normal'::character varying,
    phone character varying(20),
    visit_type character varying(50),
    status character varying(20) DEFAULT 'waiting'::character varying,
    queue_date date DEFAULT CURRENT_DATE,
    created_by character varying(100),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: queue_tokens_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.queue_tokens_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: queue_tokens_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.queue_tokens_id_seq OWNED BY public.queue_tokens.id;


--
-- Name: radiology_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.radiology_orders (
    id integer NOT NULL,
    hospital_id integer,
    patient_id character varying(20),
    study_type character varying(100) NOT NULL,
    modality character varying(50),
    body_part character varying(100),
    requested_by character varying(100),
    clinical_indication text,
    priority character varying(20) DEFAULT 'Routine'::character varying,
    status character varying(30) DEFAULT 'Scheduled'::character varying,
    radiologist_notes text,
    result_pdf_path text,
    ordered_at timestamp with time zone DEFAULT now(),
    completed_at timestamp with time zone
);


--
-- Name: radiology_orders_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.radiology_orders_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: radiology_orders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.radiology_orders_id_seq OWNED BY public.radiology_orders.id;


--
-- Name: record_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.record_requests (
    id integer NOT NULL,
    hospital_id integer,
    patient_id character varying(20),
    requested_by character varying(150) NOT NULL,
    relation character varying(60),
    identity_proof character varying(60),
    urgency character varying(40) DEFAULT 'Normal'::character varying,
    date_from date,
    date_to date,
    record_types jsonb DEFAULT '[]'::jsonb,
    purpose text,
    status character varying(20) DEFAULT 'pending'::character varying,
    created_by character varying(100),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: record_requests_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.record_requests_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: record_requests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.record_requests_id_seq OWNED BY public.record_requests.id;


--
-- Name: suppliers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.suppliers (
    id integer NOT NULL,
    hospital_id integer,
    name character varying(200) NOT NULL,
    contact_person character varying(150),
    phone character varying(20),
    email character varying(150),
    gstin character varying(30),
    address text,
    created_by character varying(100),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: suppliers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.suppliers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: suppliers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.suppliers_id_seq OWNED BY public.suppliers.id;


--
-- Name: surgeries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.surgeries (
    id integer NOT NULL,
    hospital_id integer,
    patient_id character varying(20),
    procedure_name character varying(200) NOT NULL,
    surgeon character varying(150),
    theatre character varying(100),
    scheduled_date date,
    scheduled_time character varying(10),
    pac_status character varying(30) DEFAULT 'Pending'::character varying,
    status character varying(30) DEFAULT 'Scheduled'::character varying,
    notes text,
    created_by character varying(100),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: surgeries_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.surgeries_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: surgeries_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.surgeries_id_seq OWNED BY public.surgeries.id;


--
-- Name: tpa_claims; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tpa_claims (
    id integer NOT NULL,
    hospital_id integer,
    patient_id character varying(20),
    tpa_name character varying(150) NOT NULL,
    policy_no character varying(100),
    amount_requested numeric(12,2) DEFAULT 0,
    amount_approved numeric(12,2) DEFAULT 0,
    status character varying(30) DEFAULT 'Pre-Auth Pending'::character varying,
    remarks text,
    created_by character varying(100),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: tpa_claims_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tpa_claims_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tpa_claims_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tpa_claims_id_seq OWNED BY public.tpa_claims.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id integer NOT NULL,
    hospital_id integer,
    name character varying(100) NOT NULL,
    email character varying(150),
    login_id character varying(60) NOT NULL,
    password_hash character varying(255) NOT NULL,
    role character varying(30) DEFAULT 'staff'::character varying NOT NULL,
    department character varying(500),
    phone character varying(20),
    is_active boolean DEFAULT true,
    created_by integer,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: audit_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs ALTER COLUMN id SET DEFAULT nextval('public.audit_logs_id_seq'::regclass);


--
-- Name: blood_donations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blood_donations ALTER COLUMN id SET DEFAULT nextval('public.blood_donations_id_seq'::regclass);


--
-- Name: blood_requests id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blood_requests ALTER COLUMN id SET DEFAULT nextval('public.blood_requests_id_seq'::regclass);


--
-- Name: blood_stock id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blood_stock ALTER COLUMN id SET DEFAULT nextval('public.blood_stock_id_seq'::regclass);


--
-- Name: clinical_notes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinical_notes ALTER COLUMN id SET DEFAULT nextval('public.clinical_notes_id_seq'::regclass);


--
-- Name: discharge_summary_templates id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discharge_summary_templates ALTER COLUMN id SET DEFAULT nextval('public.discharge_summary_templates_id_seq'::regclass);


--
-- Name: er_visits id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.er_visits ALTER COLUMN id SET DEFAULT nextval('public.er_visits_id_seq'::regclass);


--
-- Name: form_templates id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.form_templates ALTER COLUMN id SET DEFAULT nextval('public.form_templates_id_seq'::regclass);


--
-- Name: grns id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grns ALTER COLUMN id SET DEFAULT nextval('public.grns_id_seq'::regclass);


--
-- Name: health_packages id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.health_packages ALTER COLUMN id SET DEFAULT nextval('public.health_packages_id_seq'::regclass);


--
-- Name: hospitals id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hospitals ALTER COLUMN id SET DEFAULT nextval('public.hospitals_id_seq'::regclass);


--
-- Name: ip_billing_entries id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ip_billing_entries ALTER COLUMN id SET DEFAULT nextval('public.ip_billing_entries_id_seq'::regclass);


--
-- Name: lab_tests id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lab_tests ALTER COLUMN id SET DEFAULT nextval('public.lab_tests_id_seq'::regclass);


--
-- Name: nursing_records id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nursing_records ALTER COLUMN id SET DEFAULT nextval('public.nursing_records_id_seq'::regclass);


--
-- Name: opd_visits id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.opd_visits ALTER COLUMN id SET DEFAULT nextval('public.opd_visits_id_seq'::regclass);


--
-- Name: package_bookings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.package_bookings ALTER COLUMN id SET DEFAULT nextval('public.package_bookings_id_seq'::regclass);


--
-- Name: patient_attachments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_attachments ALTER COLUMN id SET DEFAULT nextval('public.patient_attachments_id_seq'::regclass);


--
-- Name: patient_discharge_summaries id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_discharge_summaries ALTER COLUMN id SET DEFAULT nextval('public.patient_discharge_summaries_id_seq'::regclass);


--
-- Name: patient_forms id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_forms ALTER COLUMN id SET DEFAULT nextval('public.patient_forms_id_seq'::regclass);


--
-- Name: pharmacy_inventory id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pharmacy_inventory ALTER COLUMN id SET DEFAULT nextval('public.pharmacy_inventory_id_seq'::regclass);


--
-- Name: pharmacy_returns id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pharmacy_returns ALTER COLUMN id SET DEFAULT nextval('public.pharmacy_returns_id_seq'::regclass);


--
-- Name: queue_tokens id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.queue_tokens ALTER COLUMN id SET DEFAULT nextval('public.queue_tokens_id_seq'::regclass);


--
-- Name: radiology_orders id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.radiology_orders ALTER COLUMN id SET DEFAULT nextval('public.radiology_orders_id_seq'::regclass);


--
-- Name: record_requests id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.record_requests ALTER COLUMN id SET DEFAULT nextval('public.record_requests_id_seq'::regclass);


--
-- Name: suppliers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers ALTER COLUMN id SET DEFAULT nextval('public.suppliers_id_seq'::regclass);


--
-- Name: surgeries id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.surgeries ALTER COLUMN id SET DEFAULT nextval('public.surgeries_id_seq'::regclass);


--
-- Name: tpa_claims id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tpa_claims ALTER COLUMN id SET DEFAULT nextval('public.tpa_claims_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: beds beds_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.beds
    ADD CONSTRAINT beds_pkey PRIMARY KEY (id);


--
-- Name: billing billing_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing
    ADD CONSTRAINT billing_pkey PRIMARY KEY (id);


--
-- Name: blood_donations blood_donations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blood_donations
    ADD CONSTRAINT blood_donations_pkey PRIMARY KEY (id);


--
-- Name: blood_requests blood_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blood_requests
    ADD CONSTRAINT blood_requests_pkey PRIMARY KEY (id);


--
-- Name: blood_stock blood_stock_hospital_id_blood_group_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blood_stock
    ADD CONSTRAINT blood_stock_hospital_id_blood_group_key UNIQUE (hospital_id, blood_group);


--
-- Name: blood_stock blood_stock_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blood_stock
    ADD CONSTRAINT blood_stock_pkey PRIMARY KEY (id);


--
-- Name: clinical_notes clinical_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinical_notes
    ADD CONSTRAINT clinical_notes_pkey PRIMARY KEY (id);


--
-- Name: discharge_summary_templates discharge_summary_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discharge_summary_templates
    ADD CONSTRAINT discharge_summary_templates_pkey PRIMARY KEY (id);


--
-- Name: doctors doctors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.doctors
    ADD CONSTRAINT doctors_pkey PRIMARY KEY (id);


--
-- Name: er_visits er_visits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.er_visits
    ADD CONSTRAINT er_visits_pkey PRIMARY KEY (id);


--
-- Name: form_templates form_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.form_templates
    ADD CONSTRAINT form_templates_pkey PRIMARY KEY (id);


--
-- Name: grns grns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grns
    ADD CONSTRAINT grns_pkey PRIMARY KEY (id);


--
-- Name: health_packages health_packages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.health_packages
    ADD CONSTRAINT health_packages_pkey PRIMARY KEY (id);


--
-- Name: hospitals hospitals_license_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hospitals
    ADD CONSTRAINT hospitals_license_no_key UNIQUE (license_no);


--
-- Name: hospitals hospitals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hospitals
    ADD CONSTRAINT hospitals_pkey PRIMARY KEY (id);


--
-- Name: ip_billing_entries ip_billing_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ip_billing_entries
    ADD CONSTRAINT ip_billing_entries_pkey PRIMARY KEY (id);


--
-- Name: lab_tests lab_tests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lab_tests
    ADD CONSTRAINT lab_tests_pkey PRIMARY KEY (id);


--
-- Name: nursing_records nursing_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nursing_records
    ADD CONSTRAINT nursing_records_pkey PRIMARY KEY (id);


--
-- Name: opd_visits opd_visits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.opd_visits
    ADD CONSTRAINT opd_visits_pkey PRIMARY KEY (id);


--
-- Name: package_bookings package_bookings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.package_bookings
    ADD CONSTRAINT package_bookings_pkey PRIMARY KEY (id);


--
-- Name: patient_attachments patient_attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_attachments
    ADD CONSTRAINT patient_attachments_pkey PRIMARY KEY (id);


--
-- Name: patient_discharge_summaries patient_discharge_summaries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_discharge_summaries
    ADD CONSTRAINT patient_discharge_summaries_pkey PRIMARY KEY (id);


--
-- Name: patient_forms patient_forms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_forms
    ADD CONSTRAINT patient_forms_pkey PRIMARY KEY (id);


--
-- Name: patients patients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patients
    ADD CONSTRAINT patients_pkey PRIMARY KEY (id);


--
-- Name: pharmacy_inventory pharmacy_inventory_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pharmacy_inventory
    ADD CONSTRAINT pharmacy_inventory_pkey PRIMARY KEY (id);


--
-- Name: pharmacy_returns pharmacy_returns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pharmacy_returns
    ADD CONSTRAINT pharmacy_returns_pkey PRIMARY KEY (id);


--
-- Name: queue_tokens queue_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.queue_tokens
    ADD CONSTRAINT queue_tokens_pkey PRIMARY KEY (id);


--
-- Name: radiology_orders radiology_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.radiology_orders
    ADD CONSTRAINT radiology_orders_pkey PRIMARY KEY (id);


--
-- Name: record_requests record_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.record_requests
    ADD CONSTRAINT record_requests_pkey PRIMARY KEY (id);


--
-- Name: suppliers suppliers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_pkey PRIMARY KEY (id);


--
-- Name: surgeries surgeries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.surgeries
    ADD CONSTRAINT surgeries_pkey PRIMARY KEY (id);


--
-- Name: tpa_claims tpa_claims_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tpa_claims
    ADD CONSTRAINT tpa_claims_pkey PRIMARY KEY (id);


--
-- Name: users users_login_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_login_id_key UNIQUE (login_id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: idx_audit_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_created ON public.audit_logs USING btree (created_at);


--
-- Name: idx_audit_hospital; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_hospital ON public.audit_logs USING btree (hospital_id);


--
-- Name: idx_beds_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_beds_status ON public.beds USING btree (status);


--
-- Name: idx_beds_ward; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_beds_ward ON public.beds USING btree (ward);


--
-- Name: idx_form_templates_hospital; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_form_templates_hospital ON public.form_templates USING btree (hospital_id);


--
-- Name: idx_ip_billing_patient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ip_billing_patient ON public.ip_billing_entries USING btree (patient_id);


--
-- Name: idx_lab_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lab_status ON public.lab_tests USING btree (status);


--
-- Name: idx_notes_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notes_status ON public.clinical_notes USING btree (status);


--
-- Name: idx_nursing_patient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nursing_patient ON public.nursing_records USING btree (patient_id);


--
-- Name: idx_opd_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_opd_date ON public.opd_visits USING btree (visit_date);


--
-- Name: idx_patient_attachments_patient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_patient_attachments_patient ON public.patient_attachments USING btree (patient_id);


--
-- Name: idx_patient_ds_patient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_patient_ds_patient ON public.patient_discharge_summaries USING btree (patient_id);


--
-- Name: idx_patient_ds_template; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_patient_ds_template ON public.patient_discharge_summaries USING btree (template_id);


--
-- Name: idx_patient_forms_patient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_patient_forms_patient ON public.patient_forms USING btree (patient_id);


--
-- Name: idx_patient_forms_template; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_patient_forms_template ON public.patient_forms USING btree (template_id);


--
-- Name: idx_patients_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_patients_status ON public.patients USING btree (status);


--
-- Name: idx_patients_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_patients_type ON public.patients USING btree (admission_type);


--
-- Name: idx_queue_tokens_day; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_queue_tokens_day ON public.queue_tokens USING btree (hospital_id, queue_date);


--
-- Name: idx_radiology_hospital; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_radiology_hospital ON public.radiology_orders USING btree (hospital_id);


--
-- Name: idx_radiology_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_radiology_status ON public.radiology_orders USING btree (status);


--
-- Name: idx_users_hospital; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_hospital ON public.users USING btree (hospital_id);


--
-- Name: idx_users_login; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_login ON public.users USING btree (login_id);


--
-- Name: idx_users_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_role ON public.users USING btree (role);


--
-- Name: audit_logs audit_logs_hospital_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_hospital_id_fkey FOREIGN KEY (hospital_id) REFERENCES public.hospitals(id) ON DELETE CASCADE;


--
-- Name: beds beds_doctor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.beds
    ADD CONSTRAINT beds_doctor_id_fkey FOREIGN KEY (doctor_id) REFERENCES public.doctors(id);


--
-- Name: beds beds_hospital_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.beds
    ADD CONSTRAINT beds_hospital_id_fkey FOREIGN KEY (hospital_id) REFERENCES public.hospitals(id) ON DELETE CASCADE;


--
-- Name: beds beds_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.beds
    ADD CONSTRAINT beds_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id);


--
-- Name: billing billing_hospital_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing
    ADD CONSTRAINT billing_hospital_id_fkey FOREIGN KEY (hospital_id) REFERENCES public.hospitals(id) ON DELETE CASCADE;


--
-- Name: billing billing_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing
    ADD CONSTRAINT billing_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id);


--
-- Name: blood_donations blood_donations_hospital_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blood_donations
    ADD CONSTRAINT blood_donations_hospital_id_fkey FOREIGN KEY (hospital_id) REFERENCES public.hospitals(id) ON DELETE CASCADE;


--
-- Name: blood_requests blood_requests_hospital_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blood_requests
    ADD CONSTRAINT blood_requests_hospital_id_fkey FOREIGN KEY (hospital_id) REFERENCES public.hospitals(id) ON DELETE CASCADE;


--
-- Name: blood_requests blood_requests_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blood_requests
    ADD CONSTRAINT blood_requests_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;


--
-- Name: blood_stock blood_stock_hospital_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blood_stock
    ADD CONSTRAINT blood_stock_hospital_id_fkey FOREIGN KEY (hospital_id) REFERENCES public.hospitals(id) ON DELETE CASCADE;


--
-- Name: clinical_notes clinical_notes_doctor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinical_notes
    ADD CONSTRAINT clinical_notes_doctor_id_fkey FOREIGN KEY (doctor_id) REFERENCES public.doctors(id);


--
-- Name: clinical_notes clinical_notes_hospital_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinical_notes
    ADD CONSTRAINT clinical_notes_hospital_id_fkey FOREIGN KEY (hospital_id) REFERENCES public.hospitals(id) ON DELETE CASCADE;


--
-- Name: clinical_notes clinical_notes_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinical_notes
    ADD CONSTRAINT clinical_notes_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id);


--
-- Name: discharge_summary_templates discharge_summary_templates_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discharge_summary_templates
    ADD CONSTRAINT discharge_summary_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: discharge_summary_templates discharge_summary_templates_hospital_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discharge_summary_templates
    ADD CONSTRAINT discharge_summary_templates_hospital_id_fkey FOREIGN KEY (hospital_id) REFERENCES public.hospitals(id) ON DELETE CASCADE;


--
-- Name: doctors doctors_hospital_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.doctors
    ADD CONSTRAINT doctors_hospital_id_fkey FOREIGN KEY (hospital_id) REFERENCES public.hospitals(id) ON DELETE CASCADE;


--
-- Name: doctors doctors_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.doctors
    ADD CONSTRAINT doctors_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: er_visits er_visits_hospital_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.er_visits
    ADD CONSTRAINT er_visits_hospital_id_fkey FOREIGN KEY (hospital_id) REFERENCES public.hospitals(id) ON DELETE CASCADE;


--
-- Name: er_visits er_visits_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.er_visits
    ADD CONSTRAINT er_visits_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;


--
-- Name: form_templates form_templates_hospital_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.form_templates
    ADD CONSTRAINT form_templates_hospital_id_fkey FOREIGN KEY (hospital_id) REFERENCES public.hospitals(id) ON DELETE CASCADE;


--
-- Name: grns grns_hospital_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grns
    ADD CONSTRAINT grns_hospital_id_fkey FOREIGN KEY (hospital_id) REFERENCES public.hospitals(id) ON DELETE CASCADE;


--
-- Name: health_packages health_packages_hospital_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.health_packages
    ADD CONSTRAINT health_packages_hospital_id_fkey FOREIGN KEY (hospital_id) REFERENCES public.hospitals(id) ON DELETE CASCADE;


--
-- Name: ip_billing_entries ip_billing_entries_hospital_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ip_billing_entries
    ADD CONSTRAINT ip_billing_entries_hospital_id_fkey FOREIGN KEY (hospital_id) REFERENCES public.hospitals(id) ON DELETE CASCADE;


--
-- Name: ip_billing_entries ip_billing_entries_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ip_billing_entries
    ADD CONSTRAINT ip_billing_entries_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;


--
-- Name: lab_tests lab_tests_hospital_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lab_tests
    ADD CONSTRAINT lab_tests_hospital_id_fkey FOREIGN KEY (hospital_id) REFERENCES public.hospitals(id) ON DELETE CASCADE;


--
-- Name: lab_tests lab_tests_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lab_tests
    ADD CONSTRAINT lab_tests_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id);


--
-- Name: nursing_records nursing_records_hospital_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nursing_records
    ADD CONSTRAINT nursing_records_hospital_id_fkey FOREIGN KEY (hospital_id) REFERENCES public.hospitals(id) ON DELETE CASCADE;


--
-- Name: nursing_records nursing_records_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nursing_records
    ADD CONSTRAINT nursing_records_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;


--
-- Name: opd_visits opd_visits_doctor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.opd_visits
    ADD CONSTRAINT opd_visits_doctor_id_fkey FOREIGN KEY (doctor_id) REFERENCES public.doctors(id);


--
-- Name: opd_visits opd_visits_hospital_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.opd_visits
    ADD CONSTRAINT opd_visits_hospital_id_fkey FOREIGN KEY (hospital_id) REFERENCES public.hospitals(id) ON DELETE CASCADE;


--
-- Name: opd_visits opd_visits_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.opd_visits
    ADD CONSTRAINT opd_visits_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id);


--
-- Name: package_bookings package_bookings_hospital_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.package_bookings
    ADD CONSTRAINT package_bookings_hospital_id_fkey FOREIGN KEY (hospital_id) REFERENCES public.hospitals(id) ON DELETE CASCADE;


--
-- Name: package_bookings package_bookings_package_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.package_bookings
    ADD CONSTRAINT package_bookings_package_id_fkey FOREIGN KEY (package_id) REFERENCES public.health_packages(id) ON DELETE SET NULL;


--
-- Name: package_bookings package_bookings_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.package_bookings
    ADD CONSTRAINT package_bookings_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;


--
-- Name: patient_attachments patient_attachments_hospital_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_attachments
    ADD CONSTRAINT patient_attachments_hospital_id_fkey FOREIGN KEY (hospital_id) REFERENCES public.hospitals(id) ON DELETE CASCADE;


--
-- Name: patient_attachments patient_attachments_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_attachments
    ADD CONSTRAINT patient_attachments_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;


--
-- Name: patient_discharge_summaries patient_discharge_summaries_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_discharge_summaries
    ADD CONSTRAINT patient_discharge_summaries_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;


--
-- Name: patient_discharge_summaries patient_discharge_summaries_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_discharge_summaries
    ADD CONSTRAINT patient_discharge_summaries_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.discharge_summary_templates(id) ON DELETE CASCADE;


--
-- Name: patient_forms patient_forms_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_forms
    ADD CONSTRAINT patient_forms_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;


--
-- Name: patient_forms patient_forms_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_forms
    ADD CONSTRAINT patient_forms_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.form_templates(id) ON DELETE CASCADE;


--
-- Name: patients patients_doctor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patients
    ADD CONSTRAINT patients_doctor_id_fkey FOREIGN KEY (doctor_id) REFERENCES public.doctors(id);


--
-- Name: patients patients_hospital_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patients
    ADD CONSTRAINT patients_hospital_id_fkey FOREIGN KEY (hospital_id) REFERENCES public.hospitals(id) ON DELETE CASCADE;


--
-- Name: pharmacy_inventory pharmacy_inventory_hospital_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pharmacy_inventory
    ADD CONSTRAINT pharmacy_inventory_hospital_id_fkey FOREIGN KEY (hospital_id) REFERENCES public.hospitals(id) ON DELETE CASCADE;


--
-- Name: pharmacy_returns pharmacy_returns_drug_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pharmacy_returns
    ADD CONSTRAINT pharmacy_returns_drug_id_fkey FOREIGN KEY (drug_id) REFERENCES public.pharmacy_inventory(id) ON DELETE SET NULL;


--
-- Name: pharmacy_returns pharmacy_returns_hospital_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pharmacy_returns
    ADD CONSTRAINT pharmacy_returns_hospital_id_fkey FOREIGN KEY (hospital_id) REFERENCES public.hospitals(id) ON DELETE CASCADE;


--
-- Name: pharmacy_returns pharmacy_returns_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pharmacy_returns
    ADD CONSTRAINT pharmacy_returns_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;


--
-- Name: queue_tokens queue_tokens_doctor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.queue_tokens
    ADD CONSTRAINT queue_tokens_doctor_id_fkey FOREIGN KEY (doctor_id) REFERENCES public.doctors(id) ON DELETE SET NULL;


--
-- Name: queue_tokens queue_tokens_hospital_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.queue_tokens
    ADD CONSTRAINT queue_tokens_hospital_id_fkey FOREIGN KEY (hospital_id) REFERENCES public.hospitals(id) ON DELETE CASCADE;


--
-- Name: queue_tokens queue_tokens_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.queue_tokens
    ADD CONSTRAINT queue_tokens_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE SET NULL;


--
-- Name: radiology_orders radiology_orders_hospital_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.radiology_orders
    ADD CONSTRAINT radiology_orders_hospital_id_fkey FOREIGN KEY (hospital_id) REFERENCES public.hospitals(id) ON DELETE CASCADE;


--
-- Name: radiology_orders radiology_orders_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.radiology_orders
    ADD CONSTRAINT radiology_orders_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id);


--
-- Name: record_requests record_requests_hospital_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.record_requests
    ADD CONSTRAINT record_requests_hospital_id_fkey FOREIGN KEY (hospital_id) REFERENCES public.hospitals(id) ON DELETE CASCADE;


--
-- Name: record_requests record_requests_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.record_requests
    ADD CONSTRAINT record_requests_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;


--
-- Name: suppliers suppliers_hospital_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_hospital_id_fkey FOREIGN KEY (hospital_id) REFERENCES public.hospitals(id) ON DELETE CASCADE;


--
-- Name: surgeries surgeries_hospital_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.surgeries
    ADD CONSTRAINT surgeries_hospital_id_fkey FOREIGN KEY (hospital_id) REFERENCES public.hospitals(id) ON DELETE CASCADE;


--
-- Name: surgeries surgeries_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.surgeries
    ADD CONSTRAINT surgeries_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;


--
-- Name: tpa_claims tpa_claims_hospital_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tpa_claims
    ADD CONSTRAINT tpa_claims_hospital_id_fkey FOREIGN KEY (hospital_id) REFERENCES public.hospitals(id) ON DELETE CASCADE;


--
-- Name: tpa_claims tpa_claims_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tpa_claims
    ADD CONSTRAINT tpa_claims_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE;


--
-- Name: users users_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: users users_hospital_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_hospital_id_fkey FOREIGN KEY (hospital_id) REFERENCES public.hospitals(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--


