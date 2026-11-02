-- Receipts (applied 2026-11-02, after 2026-11-02-megtakaritas-kozlekedes.sql).
-- A pasted receipt becomes one spending per category; the products behind it are kept here,
-- so the month view can show what was bought and which of it was "elhagyható" (could be skipped).
begin;

create table spending_items (
  id uuid primary key default gen_random_uuid(),
  spending_id uuid not null references spendings(id) on delete cascade,
  name text not null,
  amount numeric(10,2) not null check (amount >= 0),   -- after the product's own discount
  qty numeric(10,3) not null default 1,
  skippable boolean not null default false,
  sort int not null default 0
);
create index spending_items_spending on spending_items (spending_id);

-- Products marked "elhagyható" once come pre-marked next time; keyed like category_rules
-- (first real word of the name, lowercase without accents: "poiana").
create table skip_rules (
  keyword text primary key
);

grant select, insert, update, delete on spending_items, skip_rules to authenticated;
alter table spending_items enable row level security;
alter table skip_rules     enable row level security;
create policy household_all on spending_items for all using (is_household()) with check (is_household());
create policy household_all on skip_rules     for all using (is_household()) with check (is_household());

-- Romanian product and shop words, so receipt lines land in a category from the first receipt on.
insert into category_rules (keyword, category_id)
select k, (select id from categories where name = c) from (values
  ('paine', 'Élelmiszer'), ('lapte', 'Élelmiszer'), ('smantana', 'Élelmiszer'), ('branza', 'Élelmiszer'),
  ('cascaval', 'Élelmiszer'), ('salam', 'Élelmiszer'), ('sunca', 'Élelmiszer'), ('carnati', 'Élelmiszer'),
  ('crenvursti', 'Élelmiszer'), ('oua', 'Élelmiszer'), ('unt', 'Élelmiszer'), ('iaurt', 'Élelmiszer'),
  ('kefir', 'Élelmiszer'), ('carne', 'Élelmiszer'), ('piept', 'Élelmiszer'), ('pulpe', 'Élelmiszer'),
  ('cartofi', 'Élelmiszer'), ('rosii', 'Élelmiszer'), ('castraveti', 'Élelmiszer'), ('ceapa', 'Élelmiszer'),
  ('usturoi', 'Élelmiszer'), ('ardei', 'Élelmiszer'), ('morcovi', 'Élelmiszer'), ('mere', 'Élelmiszer'),
  ('banane', 'Élelmiszer'), ('portocale', 'Élelmiszer'), ('lamai', 'Élelmiszer'), ('faina', 'Élelmiszer'),
  ('zahar', 'Élelmiszer'), ('ulei', 'Élelmiszer'), ('orez', 'Élelmiszer'), ('malai', 'Élelmiszer'),
  ('cafea', 'Élelmiszer'), ('ceai', 'Élelmiszer'), ('suc', 'Élelmiszer'),   -- not 'apa': Hungarian for father
  ('ciocolata', 'Élelmiszer'), ('biscuiti', 'Élelmiszer'), ('napolitane', 'Élelmiszer'), ('chips', 'Élelmiszer'),
  ('covrigi', 'Élelmiszer'), ('croissant', 'Élelmiszer'), ('cozonac', 'Élelmiszer'), ('poiana', 'Élelmiszer'),
  ('mega', 'Élelmiszer'), ('annabella', 'Élelmiszer'),
  ('sampon', 'Drogéria & háztartás'), ('balsam', 'Drogéria & háztartás'), ('detergent', 'Drogéria & háztartás'),
  ('hartie', 'Drogéria & háztartás'), ('servetele', 'Drogéria & háztartás'), ('sapun', 'Drogéria & háztartás'),
  ('deodorant', 'Drogéria & háztartás'), ('scutece', 'Drogéria & háztartás'), ('absorbante', 'Drogéria & háztartás'),
  ('dm', 'Drogéria & háztartás')
) as v(k, c)
on conflict (keyword) do nothing;

commit;
