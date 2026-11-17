-- AIM — security: defence in depth for the database.
--
-- 1. The website never talks to the database (only the Edge Functions do, with the service role), so the
--    public API roles `anon` and `authenticated` need no rights at all on our tables. RLS already blocks them;
--    revoking the grants means a policy added by mistake one day still could not open the data.
-- 2. The hourly reminder job now sends the x-cron-secret header. The secret itself is NOT in this file
--    (the repository is public): create it once by hand in the SQL editor —
--        select vault.create_secret('<the same value as the CRON_SECRET Edge Function secret>', 'cron_secret');

-- 1. Public roles: no rights on our tables, sequence or functions.
revoke all on table public.leads, public.email_codes, public.lead_events,
                    public.applications, public.application_drafts
  from anon, authenticated;
revoke all on sequence public.application_ref_seq from anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.delete_draft_on_application() from public, anon, authenticated;
do $$
begin
  -- created by the Supabase dashboard, not by our migrations: only touch it if it exists
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'rls_auto_enable') then
    execute 'revoke execute on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end $$;

-- Tables, sequences and functions created later get no rights for the public roles either.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- 2. The hourly job, now with the secret read from Vault at run time.
select cron.unschedule('aim-remind-drafts')
 where exists (select 1 from cron.job where jobname = 'aim-remind-drafts');

select cron.schedule(
  'aim-remind-drafts',
  '17 * * * *',
  $job$ select net.http_post(
    url := 'https://eflwuetywanrlboiifda.supabase.co/functions/v1/remind-drafts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret' limit 1)
    ),
    body := '{}'::jsonb
  ) $job$
);
