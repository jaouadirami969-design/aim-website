-- AIM — security: count every code attempt atomically, BEFORE the code is compared.
-- Before this, verify-code read `attempts`, compared the code, then wrote `attempts + 1`: many guesses sent
-- at the same moment all read the same count, so the 5-attempt limit could be bypassed.
-- try_code() bumps the counter in a single UPDATE (row-locked) and returns the new count, or NULL when the
-- code is consumed, expired or already at the limit. Only the service role (the Edge Functions) can call it.

create or replace function public.try_code(p_code_id uuid, p_max int)
returns integer
language sql
security definer
set search_path = ''
as $$
  update public.email_codes
     set attempts = attempts + 1
   where id = p_code_id
     and consumed_at is null
     and attempts < p_max
     and expires_at > now()
  returning attempts;
$$;

revoke all on function public.try_code(uuid, int) from public, anon, authenticated;
grant execute on function public.try_code(uuid, int) to service_role;

comment on function public.try_code(uuid, int) is 'Counts one verification attempt atomically. Returns the new attempt count, or NULL if the code cannot be tried any more.';
