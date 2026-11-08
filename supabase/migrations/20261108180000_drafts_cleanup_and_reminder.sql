-- AIM — Mission 05: housekeeping for applications in progress.
-- (pg_cron and pg_net were enabled in migration enable_pg_cron_and_pg_net.)

-- When an application is submitted, its saved-in-progress copy is deleted (so no reminder is ever sent for it).
create or replace function public.delete_draft_on_application()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.application_drafts where email = new.applicant_email;
  return new;
end $$;

create or replace trigger applications_delete_draft
  after insert on public.applications
  for each row execute function public.delete_draft_on_application();

revoke all on function public.delete_draft_on_application() from public, anon, authenticated;

-- Every hour (minute 17): one reminder for drafts untouched for 48 h, deletion of drafts older than 60 days.
select cron.schedule(
  'aim-remind-drafts',
  '17 * * * *',
  $job$ select net.http_post(
    url := 'https://eflwuetywanrlboiifda.supabase.co/functions/v1/remind-drafts',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb
  ) $job$
);
