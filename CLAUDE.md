# Polla Mundialera 2026 — Familia Lozada Vargas

Family World Cup 2026 prediction app. Static frontend on Vercel + Supabase Postgres backend.

- **Live site:** https://pollada-wc-2026-fam.vercel.app/
- **Repo:** https://github.com/EduardoLoz12/Pollada_WC2026_FAM (branch `main`, push = auto-deploy on Vercel)
- **Family code:** `LozadaVargas2026` (in `static/js/config.js`, validated client-side)
- **WC kickoff:** `WC_START` in `static/js/config.js` = 2026-06-11T19:00:00Z (**UTC**, = 2pm Colombia; football-data times are UTC — never hardcode Colombia time)
- **Prize:** S/ 500 for the winner (gold pulsing badge in header)
- **Registrations OPEN** (reopened v1.0.11-13, reversing the v1.0.6 closure): join button live again; `submitPredictions` inserts a new `participants` row on first save instead of rejecting unknown names. Existing members edit freely — each match locks individually at its kickoff (no global edit deadline).

## RULE: version bump on every push
Every push must increment `<div class="footer-version">vX.Y.Z</div>` in index.html (v1.0.14 as of 2026-06-18). It's how Eduardo verifies which build is live.

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

## Live refresh (server cron — LIVE and battle-tested)
- `scripts/refresh.py` — pulls fixtures/results/standings/scorers from football-data.org (`FOOTBALL_DATA_KEY`) and upserts into Supabase using `SUPABASE_SERVICE_KEY`. Cron on 5.78.236.186: `*/10 * * * *` → `/opt/worldcup`, log `/var/log/wc_refresh.log`. Deploy = SFTP the file to `/opt/worldcup/scripts/` via paramiko (creds in `.env`); the server copy is NOT a git checkout.
- **football-data.org quirks (all already mitigated in refresh.py — don't undo):**
  - Load-balanced replicas, some serve data HOURS stale (live match stuck on TIMED). Mitigation: fetch fixtures 4x keeping most advanced version per match (`_match_rank`), plus never downgrade DB status (SCHEDULED < IN_PLAY < FINISHED) or wipe scores.
  - Intermittent `ConnectionError` (drops connections). Mitigation: `fd_get` retries 3x with backoff; `main()` runs matches/standings/scorers independently.
  - 2026 standings endpoint returns ONE 48-team table with `group: None` (+ HOME/AWAY blocks to skip). Mitigation: derive each team's group from `wc_matches` fixtures.
  - Status often flips to FINISHED several minutes after the real final whistle — "no update" reports right after a match are usually source lag, not a bug. Verify API directly before touching anything.
- **Supabase upsert trap:** `group_standings` has a random-uuid PK and unique(group_name, team) — upsert MUST pass `?on_conflict=group_name,team` or it silently writes nothing (matches work without it because match_id is a natural PK).
- `python/export_excel.py` — exports Supabase data to `polla_mundialera.xlsx` (leaderboard, predictions, matches, groups, scorers).

## Frontend structure (`static/js/app.js`)
- `loadAllData()` — fetches matches/participants/predictions/special_bets, renders everything. Predictions load via `fetchAllPredictions()` which **pages in 1000-row chunks** — Supabase caps every request at 1000 rows and the table passed that (caused leaderboard undercount bug, v1.0.2). Points/leaderboard recompute client-side on every page load; no server push.
- `renderLeaderboard()` / `calcPoints()` — points: 2 (correct result) + 3 (knockout bonus, non-group stage) + 10/5/5 (champion/runner-up/scorer special bets), see `POINTS` in config.js. Points only count when match status is FINISHED.
- Tabs: Tabla, Partidos, Grupos, Goleadores, Mis Pronósticos. Deep-link with `/#tab=<name>` (e.g. `#tab=partidos`).
- Partidos tab: each match card shows family vote split (H/D/A counts + colored bar) computed from `_predictions`.
- "Mis Pronósticos" tab: type name → saved picks (each row shows match date/time in Colombia tz via `toColDateShort`, added v1.0.14) + remaining-predictions alert + "✏️ Editar Pronósticos" button (always visible; form only offers matches whose kickoff is in the future).
- Join modal (3 steps) serves both new and existing members (registrations reopened v1.0.11-13). `submitPredictions` creates the `participants` row on first save if `_existingParticipant` is unset. Avatar picker excludes medal emojis (🥇🥈🥉, reserved for leaderboard ranks) and refetches `_participants` on open to avoid duplicate-avatar races.
- Mascot (`static/img/mascot.jpg`, Eduardo cartoon): bouncing circle top-right of header; click → welcome modal.

## Debug history (bugs already found & fixed — check here before re-diagnosing)
- v1.0.1: WC_START was 19:00 Colombia instead of UTC (countdown 5h late, lockout open 5h too long).
- v1.0.2: Supabase 1000-row cap truncated predictions → leaderboard undercounted ("Claudia case").
- v1.0.5: standings never populated (group=None mapping).
- v1.0.8: cron died on football-data ConnectionError (no retry).
- v1.0.9: group_standings upsert silently no-op (missing on_conflict) → Grupos tab frozen.
- v1.0.11-13: registrations reopened (join button restored, `submitPredictions` no longer rejects new names, inserts `participants` row on first save) — reverses the v1.0.6 closure noted above.
- v1.0.14: added match date/time to each row in "Mis Pronósticos" so past vs future predictions are distinguishable.
- RLS: predictions/special_bets needed UPDATE policies for edit-upsert ("Algo se rompió" case).
- Duplicate avatars (Carlos/Cinthya both 👑): stale `_participants` race, fixed by refetch on modal open; data fixed via SQL Editor.

## Agente DIAGNOSTIC
`C:\Users\eduar\.claude\agents\diagnostic.md` — bug-hunter agent for Eduardo's web projects/servers. Spawn it for "X se rompió / no se guardó / audita antes de lanzar". It reads this CLAUDE.md + queries production directly.

## Known loose ends
- Untracked files in repo root (`*.webp`, `WhatsApp Image *.jpeg`) — leftovers, not referenced anywhere, safe to delete.
- `updateScore()` in app.js and `POINTS.exact_score_bonus` in config.js are dead code (no exact-score UI).
- Pre-WC participants without special bets: Nelly, Carlos Lozada (still empty as of WC start).
