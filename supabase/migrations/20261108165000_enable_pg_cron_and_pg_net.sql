-- Scheduling inside the database: pg_cron runs a job every hour, pg_net calls the Edge Function remind-drafts.
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;
create extension if not exists pg_net with schema extensions;
