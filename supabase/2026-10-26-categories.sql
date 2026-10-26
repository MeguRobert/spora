-- Spóra — category rework (2026-10-26). Run after schema.sql.
-- Two kinds of category: 'household' (makes up the monthly total) and the separate pots
-- 'separate' (APPROB SRL, Házépítés) and 'receivable' (Visszajár: money paid for someone else).

alter table categories add column kind text not null default 'household'
  check (kind in ('household', 'separate', 'receivable'));
alter table spendings add column returned_on date;   -- Visszajár: when the money came back

-- ---------- renames (keep ids, so existing spendings follow) ----------
update categories set name = 'Rezsi (Várad)' where name = 'Ház & rezsi';
update categories set name = 'Ajándék & alkalmak' where name = 'Ajándék';

-- ---------- new categories ----------
insert into categories (name, sort, kind) values
  ('Lakbér (Várad)', 3, 'household'),
  ('Ház (otthon)', 4, 'household'),
  ('Drogéria & háztartás', 2, 'household'),
  ('APPROB SRL', 50, 'separate'),
  ('Házépítés', 51, 'separate'),
  ('Visszajár', 60, 'receivable');

-- ---------- order of the household list ----------
update categories set sort = v.sort from (values
  ('Élelmiszer', 1), ('Drogéria & háztartás', 2), ('Lakbér (Várad)', 3), ('Rezsi (Várad)', 4), ('Ház (otthon)', 5),
  ('Üzemanyag', 6), ('Autó', 7), ('Egészség', 8), ('Ruházat', 9), ('Étterem & szórakozás', 10), ('Sport', 11),
  ('Ajándék & alkalmak', 12), ('Adomány & templom', 13), ('Egyéb', 99)) as v(name, sort)
where categories.name = v.name;

-- ---------- move existing spendings ----------
update spendings set category_id = (select id from categories where name = 'Visszajár')
  where description ilike 'Emag%vízpomp%';
update spendings set category_id = (select id from categories where name = 'APPROB SRL')
  where description ilike 'Cégalapítás%';
update spendings set category_id = (select id from categories where name = 'Drogéria & háztartás')
  where description ilike 'Sampon%' or description ilike 'Compas%';
-- "Szept. Bérlet + áram + Digi" 880 = rent 700 + utilities 180 (Digi 62 + áram 118): split in two.
insert into spendings (description, amount, spent_on, category_id, created_by_email, created_at)
  select 'Szept. áram (118) + Digi (62)', 180, spent_on, (select id from categories where name = 'Rezsi (Várad)'),
         created_by_email, created_at
  from spendings where description = 'Szept. Bérlet + áram + Digi' and amount = 880;
update spendings set description = 'Szept. bérlet', amount = 700,
  category_id = (select id from categories where name = 'Lakbér (Várad)')
  where description = 'Szept. Bérlet + áram + Digi' and amount = 880;

-- ---------- retire "Online vásárlás" (it said where, not what for) ----------
delete from category_rules where category_id = (select id from categories where name = 'Online vásárlás');
update spendings set category_id = (select id from categories where name = 'Egyéb')
  where category_id = (select id from categories where name = 'Online vásárlás');
delete from categories where name = 'Online vásárlás';

-- ---------- keyword rules ----------
delete from category_rules where keyword = 'pompa';   -- that pump was the father-in-law's, not the flat's
insert into category_rules (keyword, category_id)
select k, (select id from categories where name = c) from (values
  ('lakber', 'Lakbér (Várad)'), ('alberlet', 'Lakbér (Várad)'), ('chirie', 'Lakbér (Várad)'),
  ('aram', 'Rezsi (Várad)'), ('digi', 'Rezsi (Várad)'), ('asszociacio', 'Rezsi (Várad)'), ('asociatie', 'Rezsi (Várad)'),
  ('futes', 'Rezsi (Várad)'), ('szemet', 'Rezsi (Várad)'), ('electrica', 'Rezsi (Várad)'), ('engie', 'Rezsi (Várad)'),
  ('sampon', 'Drogéria & háztartás'), ('fogkrem', 'Drogéria & háztartás'), ('mosopor', 'Drogéria & háztartás'),
  ('mososzer', 'Drogéria & háztartás'), ('oblito', 'Drogéria & háztartás'), ('tisztitoszer', 'Drogéria & háztartás'),
  ('drogeria', 'Drogéria & háztartás'), ('dm', 'Drogéria & háztartás'), ('compas', 'Drogéria & háztartás'),
  ('papir', 'Drogéria & háztartás'), ('iroszer', 'Drogéria & háztartás'), ('ikea', 'Drogéria & háztartás'),
  ('eskuvo', 'Ajándék & alkalmak'), ('szulinap', 'Ajándék & alkalmak'), ('nevnap', 'Ajándék & alkalmak'),
  ('keresztelo', 'Ajándék & alkalmak'), ('ballagas', 'Ajándék & alkalmak'),
  ('approb', 'APPROB SRL'), ('ceg', 'APPROB SRL'), ('cegalapitas', 'APPROB SRL'), ('onrc', 'APPROB SRL'),
  ('konyvelo', 'APPROB SRL'), ('contabil', 'APPROB SRL'), ('anaf', 'APPROB SRL'),
  ('hazepites', 'Házépítés'), ('epites', 'Házépítés'), ('cement', 'Házépítés'), ('tegla', 'Házépítés'),
  ('munkas', 'Házépítés'), ('mester', 'Házépítés'), ('dedeman', 'Házépítés'), ('brico', 'Házépítés'),
  ('hornbach', 'Házépítés'),
  ('visszakapom', 'Visszajár'), ('visszajar', 'Visszajár'), ('kolcson', 'Visszajár')
) as r(k, c)
on conflict (keyword) do update set category_id = excluded.category_id;
