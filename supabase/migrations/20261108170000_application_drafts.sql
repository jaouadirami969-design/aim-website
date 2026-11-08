-- AIM — Mission 05: applications in progress ("Your answers are saved — finish later").
-- One row per verified email address. The website keeps a copy in the browser; this copy lets a family
-- continue on another device (after re-verifying the email) and lets us send one reminder after 48 h.
-- Row Level Security is ON with no policies: only the Edge Functions (service role) read and write.

create table if not exists public.application_drafts (
  email         extensions.citext primary key,            -- the address verified with the 6-digit code
  lead_id       uuid references public.leads(id) on delete set null,
  step          text,                                      -- the step the person was on (student, parent, …)
  data          jsonb not null default '{}'::jsonb,        -- the answers, exactly as typed (never the code)
  saved_at      timestamptz not null default now(),        -- the browser's time of the last save (conflict resolution)
  reminded_at   timestamptz,                               -- the 48-hour "finish your application" email went out
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists application_drafts_pending_idx
  on public.application_drafts (updated_at)
  where reminded_at is null;

create or replace trigger application_drafts_set_updated_at
  before update on public.application_drafts
  for each row execute function public.set_updated_at();

alter table public.application_drafts enable row level security;

comment on table public.application_drafts is 'Applications started on aimsummer.com but not sent yet. Deleted when the application is submitted, and after 60 days of inactivity.';
