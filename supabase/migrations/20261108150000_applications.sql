-- AIM — Mission 05: the guided application ("Apply now").
-- One row per submitted application. Row Level Security is ON with no policies: only the Edge Functions
-- (service role) read and write. References look like AIM-27-1001 and are assigned from a sequence.

create sequence if not exists public.application_ref_seq start 1001;

create table if not exists public.applications (
  id                        uuid primary key default gen_random_uuid(),
  reference                 text not null unique,
  lead_id                   uuid references public.leads(id) on delete set null,
  status                    text not null default 'submitted'
                            check (status in ('submitted','under_review','accepted','waitlisted','not_this_time','seat_confirmed','enrolled','withdrawn')),
  filled_by                 text check (filled_by in ('student','parent')),
  applicant_email           extensions.citext not null,          -- the address verified with the 6-digit code

  -- the student
  student_first_name        text not null,
  student_last_name         text not null,
  student_dob               date not null,
  student_age_at_program    integer not null,                    -- age on the first day of summer 2027
  student_email             extensions.citext,
  student_phone             text,
  country                   text,
  province                  text,
  city                      text,
  postal_code               text,

  -- the parent or guardian
  parent_first_name         text not null,
  parent_last_name          text not null,
  parent_email              extensions.citext not null,
  parent_phone              text not null,
  parent_relationship       text,
  parent_consent_required   boolean not null default false,      -- student under 14 (Law 25)
  parent_confirm_token_hash text,
  parent_confirmed_at       timestamptz,

  -- the program
  program                   text not null check (program in ('finance-investment','fintech-digital-investing')),
  level                     text not null check (level in ('beginner','intermediate','advanced')),
  previous_aim_year         integer,
  format                    text not null check (format in ('campus','online','either')),
  session_first             text not null check (session_first in ('s1','s2','s3','flexible')),
  session_second            text check (session_second in ('s1','s2','s3','flexible','none')),
  heard_about               text,

  -- the school
  school_name               text not null,
  school_level              text not null,
  school_city               text not null,
  school_province           text not null,
  english_ok                boolean not null default false,

  -- why AIM
  motivation                text,
  notes                     text,

  -- consents
  consent_accuracy          boolean not null default false,
  consent_privacy           boolean not null default false,
  consent_parent            boolean not null default false,
  consent_newsletter        boolean not null default false,
  consent_text              text,
  consent_at                timestamptz,

  -- bookkeeping
  emails                    jsonb not null default '{}'::jsonb,  -- which emails went out and how
  source_page               text,
  referrer                  text,
  utm_source                text,
  utm_medium                text,
  utm_campaign              text,
  user_agent                text,
  ip_hash                   text,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

create index if not exists applications_status_created_idx on public.applications (status, created_at desc);
create index if not exists applications_applicant_email_idx on public.applications (applicant_email);
create index if not exists applications_parent_email_idx    on public.applications (parent_email);

create or replace trigger applications_set_updated_at
  before update on public.applications
  for each row execute function public.set_updated_at();

alter table public.applications enable row level security;

comment on table public.applications is 'Applications to the AIM summer program (Apply now). One row per submission; reference AIM-27-####.';

-- References are assigned by the database: AIM-27-1001, AIM-27-1002, …
alter table public.applications alter column reference set default ('AIM-27-' || nextval('public.application_ref_seq')::text);
