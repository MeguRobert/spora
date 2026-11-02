-- Two new categories (applied 2026-11-02, after 2026-10-26-categories.sql):
--   Közlekedés   household: public transport and rides (OTL, bus, train, taxi), apart from the car's own costs.
--   Megtakarítás separate pot: money put aside (the monthly Allianz investment), so it is not counted as spending.
begin;

insert into categories (name, sort, kind) values
  ('Közlekedés', 7, 'household'),     -- sorts right after Autó (same sort, then by name)
  ('Megtakarítás', 52, 'separate');

-- Keywords are lowercase without accents and match the start of a word.
-- ("tren" is left out on purpose: it would also catch "tréning".)
insert into category_rules (keyword, category_id)
select k, (select id from categories where name = 'Közlekedés')
from unnest(array['otl', 'busz', 'autobusz', 'autobuz', 'vonat', 'cfr', 'taxi', 'uber']) as k
on conflict (keyword) do update set category_id = excluded.category_id;   -- 'otl' was learned as Autó

insert into category_rules (keyword, category_id)
select k, (select id from categories where name = 'Autó')
from unnest(array['parkolas', 'parcare']) as k
on conflict (keyword) do nothing;

insert into category_rules (keyword, category_id)
select k, (select id from categories where name = 'Megtakarítás')
from unnest(array['allianz', 'befektetes', 'megtakaritas']) as k
on conflict (keyword) do nothing;

-- Existing OTL rows move from Autó to Közlekedés.
update spendings set category_id = (select id from categories where name = 'Közlekedés')
where description ilike 'otl%'
  and category_id = (select id from categories where name = 'Autó');

commit;
