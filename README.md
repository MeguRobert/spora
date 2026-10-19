# Spóra

Name: *spóra* = spore (HU/EN), *spor* = gain (RO), and it sounds like *spórol* (to save).

Shared household spending log ("banii casei") for two people. Phone web app (Android + iPhone, add to home screen),
Supabase free tier for data, no build step.

Type `kenyer 10,88` → amount, date (today) and category fill themselves → Mentés.
Fix a wrong category once and the app remembers that word next time.

## Where it runs

| | |
|---|---|
| App | https://megurobert.github.io/spora/ — GitHub Pages from `main` (root). **Pushing `main` deploys.** |
| Database | Supabase project `spora` (ref `eyzbdakkalbckoaaxvzj`, Frankfurt, free tier) |
| Schema | `supabase/schema.sql` — already applied; re-running it fails on existing tables |
| Keepalive | `.github/workflows/supabase-keepalive.yml` calls `ping()` daily so the free project never pauses (secrets `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`) |
| Repo | `MeguRobert/spora` — personal account; this clone uses `~/.ssh/id_ed25519_meguRobert` via `core.sshCommand` |

Access: only emails in the `allowed_emails` table can read or write anything (row-level security);
the publishable key alone can call `ping()` and nothing else. Email confirmation is off.

## Getting started (each of you, once)

1. Open the app link → *Első regisztráció* with your email (must be in `allowed_emails`) + a password.
2. Install on the phone:
   - Android (Chrome): ⋮ menu → *Add to Home screen* / *Install app*
   - iPhone (Safari): Share button → *Add to Home Screen*

Optional, once both accounts exist: Supabase → *Authentication → Sign In / Providers →
Allow new users to sign up* → off.

## Importing the Messenger history

Copy the messages from Messenger, paste them in the **Import** tab → *Feldolgozás*.
Each line becomes a row; rows that parsed cleanly are pre-ticked, rows with a missing amount/date
are flagged in red — fix them inline or leave them unticked → *Importálás*.
A line without a date gets the date of the line above it.

## Development

```
npm test     # parser tests (node --test)
npm start    # serve on http://localhost:5173
```

| File | What it does |
|------|--------------|
| `parse.js` | Pure text parsing: amount, date, category suggestion, chat import |
| `app.js` | UI + Supabase calls |
| `supabase/schema.sql` | Tables, row-level security, seed categories and keyword rules |
| `config.js` | Supabase URL + anon key |

Later (not built yet): income, monthly balance (what is left of "banii casei"), budgets per category.
