# Polla Mundialera 2026 — Familia Lozada Vargas

Family World Cup 2026 prediction app. Static frontend on Vercel + Supabase Postgres backend.

- **Live site:** https://pollada-wc-2026-fam.vercel.app/
- **Repo:** https://github.com/EduardoLoz12/Pollada_WC2026_FAM (branch `main`, push = auto-deploy on Vercel)
- **Family code:** `LozadaVargas2026` (in `static/js/config.js`, validated client-side)
- **WC kickoff:** `WC_START` in `static/js/config.js` = 2026-06-11 19:00 Colombia time

## Stack
- Frontend: plain HTML/CSS/JS — `index.html`, `static/js/app.js`, `static/css/style.css`, `static/js/config.js`
- Backend: Supabase Postgres (project ref `izjbpheewbfshotjsgim`), browser writes directly via `@supabase/supabase-js`
- `vercel.json` is `{}` — pure static hosting, no serverless build step

## Supabase tables (`supabase/schema.sql`)
- `participants` — name, avatar (emoji), photo_url
- `wc_matches` — fixture + live results (cached from football-data.org)
- `group_standings`, `scorers` — cached live data
- `predictions` — one row per participant per match (`pred_result`: H/D/A), unique on (participant_id, match_id)
- `special_bets` — champion / runner_up / top_scorer per participant, unique on participant_id

RLS: public SELECT on everything. Public INSERT + UPDATE on `predictions` and `special_bets` (UPDATE needed because the app uses `upsert(...,{onConflict:...})` for editing). Public INSERT only on `participants` (no update policy — avatar/name fixes need a manual SQL Editor query).

## Querying live data (read-only, no service key needed)
Anon key is in `static/js/config.js` (safe to expose, RLS = read-only for it). To answer "how many participants / what did X predict" etc., query the REST API directly:

```python
import urllib.request, json, re, sys
sys.stdout.reconfigure(encoding='utf-8')
URL = 'https://izjbpheewbfshotjsgim.supabase.co'
cfg = open('static/js/config.js', encoding='utf-8').read()
key = re.search(r'SUPABASE_ANON_KEY = "(.+?)"', cfg).group(1)

def q(path):
    req = urllib.request.Request(URL + '/rest/v1/' + path,
        headers={'apikey': key, 'Authorization': 'Bearer ' + key})
    return json.loads(urllib.request.urlopen(req).read())

print(q('participants?select=id,name,avatar,created_at&order=created_at'))
```

Useful endpoints: `participants`, `predictions?select=*&participant_id=eq.<id>`, `wc_matches?select=*&status=eq.FINISHED`, `special_bets`.

Run with `python3` (bash), not the PowerShell `python` (different/restricted install, SSL issues with pip — use `python3 -m pip install --trusted-host pypi.org --trusted-host files.pythonhosted.org --trusted-host pypi.python.org <pkg>` if a package is missing).

## Schema/data changes (need service_role / SQL Editor — not available locally)
Anon key cannot run DDL (CREATE POLICY, ALTER TABLE) or UPDATE on `participants`. For these, give the user a ready-to-paste SQL snippet for Supabase SQL Editor (https://supabase.com/dashboard → project izjbpheewbfshotjsgim → SQL Editor). Don't try to find/use a service key — it doesn't run DDL via REST anyway.

## Live refresh (server cron, not yet wired for 2026 fixtures)
- `scripts/refresh.py` — pulls fixtures/results/standings/scorers from football-data.org (`FOOTBALL_DATA_KEY`) and upserts into Supabase using `SUPABASE_SERVICE_KEY`. Runs on the server (5.78.236.186, see `.env`).
- `python/export_excel.py` — exports Supabase data to `polla_mundialera.xlsx` (leaderboard, predictions, matches, groups, scorers).

## Frontend structure (`static/js/app.js`)
- `loadAllData()` — fetches matches/participants/predictions/special_bets, renders everything
- `renderLeaderboard()` / `calcPoints()` — points: 2 (correct result) + 3 (knockout bonus, non-group stage) + 10/5/5 (champion/runner-up/scorer special bets), see `POINTS` in config.js
- Tabs: Tabla, Partidos, Grupos, Goleadores, Mis Pronósticos
- "Mis Pronósticos" tab: type name → shows saved picks + remaining-predictions alert + "✏️ Editar Pronósticos" button (editable until `WC_START`)
- Join modal (3 steps): name+avatar → predictions+special bets → success. Avatar picker excludes medal emojis (🥇🥈🥉, reserved for leaderboard ranks) and refetches `_participants` on open to avoid duplicate-avatar races.

## Known loose ends
- Untracked files in repo root (`*.webp`, `WhatsApp Image *.jpeg`) — leftovers, not referenced anywhere, safe to delete.
- `updateScore()` in app.js and `POINTS.exact_score_bonus` in config.js are dead code (no exact-score UI).
