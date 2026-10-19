# Spóra

Name: *spóra* = spore (HU/EN), *spor* = gain (RO), and it sounds like *spórol* (to save).

Shared household spending log ("banii casei") for two people. Phone web app (Android + iPhone, add to home screen),
Supabase free tier for data, no build step.

Type `kenyer 10,88` → amount, date (today) and category fill themselves → Mentés.
Fix a wrong category once and the app remembers that word next time.

## Setup (one time, ~15 min, free)

1. **Supabase project** — supabase.com → sign up → *New project*. Region: Frankfurt (eu-central-1).
2. **Database** — open `supabase/schema.sql`, replace the two example emails at the bottom with yours
   (the ones you will log in with), then in Supabase: *SQL Editor → New query* → paste → *Run*.
3. **Email confirmation off** — *Authentication → Sign In / Providers → Email* → turn off
   *Confirm email* → Save. (Otherwise each of you must click a link in an email first.)
4. **Keys** — *Project Settings → API*: copy *Project URL* and the *anon public* key into `config.js`.
5. **Host it** — app.netlify.com/drop → drag the `spora` folder onto the page. You get an
   `https://….netlify.app` link. (Any static host works: Vercel, GitHub Pages, Cloudflare Pages.)
6. **Accounts** — both of you open the link → *Első regisztráció* with your email + a password.
   Afterwards, optionally block strangers from even creating accounts:
   *Authentication → Sign In / Providers → Allow new users to sign up* → off.
   (Strangers could not see any data anyway — only emails in `allowed_emails` can read or write.)
7. **Install on phones**
   - Android (Chrome): ⋮ menu → *Add to Home screen* / *Install app*
   - iPhone (Safari): Share button → *Add to Home Screen*

Note: Supabase pauses a free project after 7 days with no use; daily logging keeps it awake.
If it ever pauses, open the Supabase dashboard and click *Restore*.

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
