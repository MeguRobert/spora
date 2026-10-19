-- Spóra — run once in Supabase: SQL Editor → New query → paste → Run.
-- BEFORE running: replace the two emails in the "allowed_emails" insert at the bottom.

create table allowed_emails (
  email text primary key,
  display_name text not null
);

create table categories (
  id serial primary key,
  name text not null unique,
  sort int not null default 100
);

create table category_rules (
  keyword text primary key,          -- lowercase, no accents ("kenyer")
  category_id int not null references categories(id) on delete cascade
);

create table spendings (
  id uuid primary key default gen_random_uuid(),
  description text not null,
  amount numeric(10,2) not null check (amount > 0),
  spent_on date not null default current_date,
  category_id int references categories(id) on delete set null,
  created_by_email text not null default (auth.jwt() ->> 'email'),
  created_at timestamptz not null default now()
);
create index spendings_spent_on on spendings (spent_on desc);

-- Only the two people in allowed_emails can see or change anything.
create function is_household() returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from allowed_emails where lower(email) = lower(auth.jwt() ->> 'email'))
$$;

-- The project is created with "Automatically expose new tables" OFF, so grant access explicitly:
-- logged-in users only (role "authenticated"); the public "anon" role gets nothing.
-- Row-level security below then narrows "logged in" down to the two household emails.
grant usage on schema public to authenticated;
grant select on allowed_emails to authenticated;
grant select, insert, update, delete on categories, category_rules, spendings to authenticated;
grant usage on sequence categories_id_seq to authenticated;
grant execute on function is_household() to authenticated;
revoke execute on function is_household() from anon, public;

-- The one thing the public key may call: the daily keepalive (.github/workflows/supabase-keepalive.yml)
-- needs a real database query, and every table is closed to anon. Returns only the server time.
create function ping() returns timestamptz language sql stable as $$ select now() $$;
grant execute on function ping() to anon;

alter table allowed_emails enable row level security;
alter table categories     enable row level security;
alter table category_rules enable row level security;
alter table spendings      enable row level security;

create policy household_read on allowed_emails for select using (is_household());
create policy household_all on categories     for all using (is_household()) with check (is_household());
create policy household_all on category_rules for all using (is_household()) with check (is_household());
create policy household_all on spendings      for all using (is_household()) with check (is_household());

insert into categories (name, sort) values
  ('Élelmiszer', 1), ('Üzemanyag', 2), ('Autó', 3), ('Ház & rezsi', 4), ('Egészség', 5),
  ('Ruházat', 6), ('Étterem & szórakozás', 7), ('Ajándék', 8), ('Sport', 8), ('Adomány & templom', 9), ('Online vásárlás', 10),
  ('Egyéb', 99);

insert into category_rules (keyword, category_id)
select k, (select id from categories where name = c) from (values
  ('kenyer', 'Élelmiszer'), ('tej', 'Élelmiszer'), ('kaufland', 'Élelmiszer'), ('lidl', 'Élelmiszer'),
  ('profi', 'Élelmiszer'), ('penny', 'Élelmiszer'), ('carrefour', 'Élelmiszer'), ('auchan', 'Élelmiszer'),
  ('mega image', 'Élelmiszer'), ('piac', 'Élelmiszer'), ('hus', 'Élelmiszer'), ('zoldseg', 'Élelmiszer'),
  ('gyumolcs', 'Élelmiszer'), ('tojas', 'Élelmiszer'), ('kisbolt', 'Élelmiszer'), ('moza', 'Élelmiszer'),
  ('placinta', 'Élelmiszer'), ('kave', 'Élelmiszer'), ('zuzu', 'Élelmiszer'), ('szenya', 'Élelmiszer'), ('szendvics', 'Élelmiszer'),
  ('rovignetta', 'Autó'), ('analizis', 'Egészség'), ('virag', 'Ajándék'),
  ('foci', 'Sport'), ('gym', 'Sport'), ('edzes', 'Sport'), ('edzo', 'Sport'), ('konditerem', 'Sport'),
  ('fitness', 'Sport'), ('fitnesz', 'Sport'), ('uszoda', 'Sport'), ('joga', 'Sport'), ('sala', 'Sport'),
  ('benzin', 'Üzemanyag'), ('motorina', 'Üzemanyag'), ('diesel', 'Üzemanyag'), ('omv', 'Üzemanyag'),
  ('petrom', 'Üzemanyag'), ('mol', 'Üzemanyag'), ('lukoil', 'Üzemanyag'), ('rompetrol', 'Üzemanyag'),
  ('szerviz', 'Autó'), ('rca', 'Autó'), ('rovinieta', 'Autó'), ('gumi', 'Autó'),
  ('villany', 'Ház & rezsi'), ('gaz', 'Ház & rezsi'), ('vizszamla', 'Ház & rezsi'), ('viz', 'Élelmiszer'), ('internet', 'Ház & rezsi'),
  ('dedeman', 'Ház & rezsi'), ('lakber', 'Ház & rezsi'), ('ikea', 'Ház & rezsi'), ('pompa', 'Ház & rezsi'),
  ('gyogyszer', 'Egészség'), ('patika', 'Egészség'), ('farmacia', 'Egészség'), ('catena', 'Egészség'),
  ('orvos', 'Egészség'),
  ('ruha', 'Ruházat'), ('cipo', 'Ruházat'),
  ('pizza', 'Étterem & szórakozás'), ('etterem', 'Étterem & szórakozás'), ('mozi', 'Étterem & szórakozás'),
  ('ajandek', 'Ajándék'),
  ('persely', 'Adomány & templom'), ('adomany', 'Adomány & templom'), ('templom', 'Adomány & templom'),
  ('dezsma', 'Adomány & templom'), ('gyulekezet', 'Adomány & templom'),
  ('emag', 'Online vásárlás'), ('temu', 'Online vásárlás'), ('aliexpress', 'Online vásárlás')
) as r(k, c);

-- ↓↓↓ EDIT THESE TWO LINES ↓↓↓
insert into allowed_emails (email, display_name) values
  ('robert@example.com', 'Robert'),
  ('feleseg@example.com', 'Feleségem');
