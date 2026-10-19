-- Spóra — client diagnostics. The app writes errors and push-setup attempts here so problems on a
-- phone can be read without a debugger. Logged-in household members may only insert; nobody reads
-- through the API (read it with the SQL editor / CLI).
create table client_logs (
  id bigserial primary key,
  at timestamptz not null default now(),
  email text default (auth.jwt() ->> 'email'),
  kind text not null,              -- 'error' | 'push' | ...
  message text,
  detail jsonb
);
grant insert on client_logs to authenticated;
grant usage on sequence client_logs_id_seq to authenticated;
alter table client_logs enable row level security;
create policy household_insert on client_logs for insert with check (is_household());
