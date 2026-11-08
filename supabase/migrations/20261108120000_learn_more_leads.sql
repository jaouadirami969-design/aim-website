-- AIM — "Learn more" flow (Mission 02)
-- Three tables: leads (one row per email address), email_codes (the 6-digit codes, stored hashed), lead_events (audit log).
-- Row Level Security is ON with no policies: only the Edge Functions (service role) can read or write.

create extension if not exists citext with schema extensions;

create table if not exists public.leads (
  id                      uuid primary key default gen_random_uuid(),
  email                   extensions.citext not null unique,
  first_name              text,
  role                    text check (role in ('student','parent','counselor','other')),
  interest                text check (interest in ('campus','online','info')),
  consent_info            boolean not null default false,
  consent_newsletter      boolean not null default false,
  consent_text            text,
  consent_at              timestamptz,
  status                  text not null default 'pending' check (status in ('pending','verified')),
  verified_at             timestamptz,
  info_pack_sent_at       timestamptz,
  notified_at             timestamptz,
  brevo_contact_synced_at timestamptz,
  source_page             text,
  referrer                text,
  utm_source              text,
  utm_medium              text,
  utm_campaign            text,
  user_agent              text,
  ip_hash                 text,
  request_count           integer not null default 1,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create table if not exists public.email_codes (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid not null references public.leads(id) on delete cascade,
  email       extensions.citext not null,
  code_hash   text not null,
  expires_at  timestamptz not null,
  attempts    integer not null default 0,
  consumed_at timestamptz,
  ip_hash     text,
  created_at  timestamptz not null default now()
);

create table if not exists public.lead_events (
  id         bigint generated always as identity primary key,
  lead_id    uuid references public.leads(id) on delete set null,
  email      extensions.citext,
  type       text not null,
  detail     jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists leads_status_created_idx     on public.leads (status, created_at desc);
create index if not exists email_codes_lead_live_idx    on public.email_codes (lead_id, created_at desc) where consumed_at is null;
create index if not exists email_codes_email_created_idx on public.email_codes (email, created_at desc);
create index if not exists email_codes_ip_created_idx   on public.email_codes (ip_hash, created_at desc);
create index if not exists lead_events_lead_idx         on public.lead_events (lead_id, created_at desc);
create index if not exists lead_events_type_created_idx on public.lead_events (type, created_at desc);

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;

create or replace trigger leads_set_updated_at
  before update on public.leads
  for each row execute function public.set_updated_at();

alter table public.leads       enable row level security;
alter table public.email_codes enable row level security;
alter table public.lead_events enable row level security;

comment on table public.leads       is 'People who asked for the AIM info pack on aimsummer.com (Learn more). One row per email.';
comment on table public.email_codes is '6-digit verification codes (HMAC-hashed), 10-minute expiry, max 5 attempts.';
comment on table public.lead_events is 'Audit log of the Learn more flow: code_sent, verified, info_pack_sent, team_notified, errors…';
