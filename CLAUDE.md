# Polla Mundialera 2026 — Familia Lozada Vargas

Family World Cup 2026 prediction app. Static frontend on Vercel + Supabase Postgres backend.

- **Live site:** https://pollada-wc-2026-fam.vercel.app/
- **Repo:** https://github.com/EduardoLoz12/Pollada_WC2026_FAM (branch `main`, push = auto-deploy on Vercel)
- **Family code:** `LozadaVargas2026` (in `static/js/config.js`, validated client-side)
- **WC kickoff:** `WC_START` in `static/js/config.js` = 2026-06-11T19:00:00Z (**UTC**, = 2pm Colombia; football-data times are UTC — never hardcode Colombia time)
- **Prize:** S/ 500 for the winner (gold pulsing badge in header)
- **Registrations OPEN** (reopened v1.0.11-13, reversing the v1.0.6 closure): join button live again; `submitPredictions` inserts a new `participants` row on first save instead of rejecting unknown names. Existing members edit freely — each match locks individually at its kickoff (no global edit deadline).

## RULE: version bump on every push
Every push must increment `<div class="footer-version">vX.Y.Z</div>` in index.html (v1.3.4 as of 2026-07-04). It's how Eduardo verifies which build is live. As of v1.2.x, each segment stays a single digit (1.2.9 → 1.3.0, not 1.2.10) — Eduardo's explicit preference, don't let any segment grow to two digits.

## RULE: verify locally before pushing — always ask first
"Quiero verlo en local antes de pushear" means Eduardo wants to look at it HIMSELF (open localhost, eyeball it), not that my own automated checks count as verification. Same applies to deploying `scripts/refresh.py` to the server (SFTP) — that's a separate ask from git push, confirm before touching the live cron too. Serve locally with `python3 -m http.server 8765` from the project root and give the localhost link; don't `git push` until he explicitly says go.

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
- `scripts/refresh.py` — pulls fixtures/results/standings/scorers from football-data.org (`FOOTBALL_DATA_KEY`) and upserts into Supabase using `SUPABASE_SERVICE_KEY`. Cron on 5.78.236.186: `*/5 * * * *` (changed from `*/10` 2026-06-18) → `/opt/worldcup`, log `/var/log/wc_refresh.log`. Deploy = SFTP the file to `/opt/worldcup/scripts/` via paramiko (creds in `.env`); the server copy is NOT a git checkout. Server also runs unrelated cron jobs for other projects (eloz-bot, sports-agent) — when editing crontab, only touch the `worldcup` line.
- **Rate-limit budget:** each run makes 6 football-data.org calls (4x fixtures fetch for replica-freshness + standings + scorers). At `*/5` that's ~1.2 calls/min, well under the free-tier ~10 req/min cap. Don't drop below 5min without checking the plan's rate limit — retries (3x backoff per call) can spike usage on failures.
- **football-data.org quirks (all already mitigated in refresh.py — don't undo):**
  - Load-balanced replicas, some serve data HOURS stale (live match stuck on TIMED). Mitigation: fetch fixtures 4x keeping most advanced version per match (`_match_rank`), plus never downgrade DB status (SCHEDULED < IN_PLAY < FINISHED) or wipe scores.
  - Intermittent `ConnectionError` (drops connections). Mitigation: `fd_get` retries 3x with backoff; `main()` runs matches/standings/scorers independently.
  - 2026 standings endpoint returns ONE 48-team table with `group: None` (+ HOME/AWAY blocks to skip). Mitigation: derive each team's group from `wc_matches` fixtures.
  - Status often flips to FINISHED several minutes after the real final whistle — "no update" reports right after a match are usually source lag, not a bug. Verify API directly before touching anything.
  - A stale replica can report a known knockout matchup as `homeTeam/awayTeam: null` (→ "TBD") again after a fresher poll already resolved it. Mitigation: never let a real team name regress back to TBD once set.
  - A later poll can overwrite an already-`FINISHED` match's score with a *different* wrong score (observed: Egypt 1-1 Iran got flipped to 1-2 by a bad replica hours after the real result was known). Mitigation: once a match is FINISHED with a score, no later poll may change it — locked. **Caveat:** this means if the FIRST `FINISHED` write is itself wrong, automatic refresh can never self-correct it — needs a manual SQL/REST patch (see "Querying live data" pattern, swap GET for a service-key PATCH run via SSH on the server, since the anon key can't write to `wc_matches`).
  - `score.duration: "PENALTY_SHOOTOUT"` matches (knockout decided on penalties) are the least reliable: `score.winner` frequently comes back `null`, or even the nonsensical `"DRAW"` — both invalid, since a shootout always has a winner. `score.fullTime` also gets overloaded with penalty-shootout-related numbers instead of the real 90-min score. Mitigation: use `score.regularTime` as the stored match score, and derive the winner from `score.penalties.home` vs `.away` when the API's own `winner` is null/DRAW. **Caveat:** football-data's own `penalties` tally can itself be incomplete/tied (e.g. `{home:4,away:4}` — impossible as a final shootout score) and never resolves on retry; when that happens `winner` is left `null` on purpose rather than guessing, and needs a manual fix once Eduardo confirms the real result. Already hit twice: Germany 1-1 Paraguay (Paraguay won) and Netherlands 1-1 Morocco (Morocco won), both match_ids fixed by hand 2026-06-30.
  - **Scoring rule (2026-07-04):** predictions (incl. `exact_score_bonus`) are always judged on the regular-time (90') score, never extra time — this used to only apply to `PENALTY_SHOOTOUT` duration; extended to `EXTRA_TIME` too, since `home_score`/`away_score` is the single field both the UI and `exact_score_bonus` read. For `EXTRA_TIME`, `score.regularTime` usually comes back `null,null` from the API — fallback derives it as `fullTime - extraTime`. `winner` still reflects the real match outcome (who advanced), unaffected by this — only the stored score changed. Two already-FINISHED matches needed a manual patch when this shipped: Argentina 3-2 Cape Verde → 1-1, Belgium 3-2 Senegal → 2-2 (winners unchanged).
  - **Winner-lock gap (2026-07-04):** the FINISHED-score lock (above) never covered `winner` — only guarded against a later poll nulling it out, not flipping it to a different value (e.g. a stale `REGULAR`-duration replica reporting `DRAW` on a match whose 90'-score coincidentally matches, sailing past the score-lock check). Found via DIAGNOSTIC audit, no real incident yet. Fixed: `winner` is now locked the same way as score once `status == FINISHED`.
- **Supabase upsert trap:** `group_standings` has a random-uuid PK and unique(group_name, team) — upsert MUST pass `?on_conflict=group_name,team` or it silently writes nothing (matches work without it because match_id is a natural PK).
- `python/export_excel.py` — exports Supabase data to `polla_mundialera.xlsx` (leaderboard, predictions, matches, groups, scorers).

## Frontend structure (`static/js/app.js`)
- **Twemoji gotcha:** `applyTwemoji()` turns every emoji character into an unsized `<img class="emoji">` — it renders huge (default ~36px) unless that component has its own `X img.emoji { height:1em; width:1em; ... }` CSS rule (see existing ones: `.team-flag`, `.pred-match-teams`, `.phase-ticker-track`, `.bracket-team`, etc.). Forgotten 3 times in one session (v1.2.x) — **any new emoji-bearing element needs this rule added at the same time**, not after a "se ve gigante" bug report.
- `loadAllData()` — fetches matches/participants/predictions/special_bets, renders everything. Predictions load via `fetchAllPredictions()` which **pages in 1000-row chunks** — Supabase caps every request at 1000 rows and the table passed that (caused leaderboard undercount bug, v1.0.2). Points/leaderboard recompute client-side on every page load; no server push.
- `renderLeaderboard()` / `calcPoints()` — points (`POINTS` in config.js, stage-aware as of v1.2.6): `correct_result_group` (2 pts, **locked** — applies only to already-played GROUP_STAGE picks, never bump this or it retroactively reinflates history) + `correct_result` (3 pts, knockout stage going forward) + `exact_score_bonus` (2 pts, any stage, on top of a correct result) + 10/5/5 (champion/runner-up/scorer special bets). There's no separate "knockout bonus" anymore — it was folded into `correct_result`. Points only count when match status is FINISHED. **Gotcha:** changing any `POINTS` value recalculates ALL historical predictions live (no point-in-time snapshot) — a global bump retroactively re-scores already-played matches too; use the `_group` vs general split pattern above if a points change should only apply going forward.
- `getActivePhase()` / `getAnnouncePhase()` / `getEditablePhases()` — phase-transition helpers added v1.2.x. `getAnnouncePhase()` returns the phase to headline (current knockout phase, or the upcoming one within `ANNOUNCE_WINDOW_HOURS` of kickoff) — drives the phase ticker, the join-button label/color, and which phases' matches are open for predictions before the prior phase is technically "active".
- Phase ticker (`#phase-banner`, `renderPhaseBanner()`): scrolling marquee pinned above the header, only takes up space (`body.has-ticker`) when there's a transition to announce. Header/tabs sticky `top` offsets shift via the `has-ticker` body class — don't hardcode a header height change without updating both.
- Header join button (`#btn-join`): text/color/onclick all swap via `updateJoinButtonText()` — gold "Unirme a la Polla" → `showJoinModal()` (full 3-step flow, new + existing members) vs green "Completar Pronósticos · {fase}" → `showQuickModal()` (name-only modal, existing members only, jumps straight to step 2 of the join modal via `openPredictionsFor()`).
- Knockout predictions (`predMatchRow()`): no "Empate" button for non-GROUP_STAGE matches (draws aren't a valid knockout outcome), plus an optional exact-score input pair (`sh-{id}`/`sa-{id}`, no spinner arrows) feeding `pred_home_score`/`pred_away_score`. `setPred()` must NOT reset home/away when the winner button is clicked, or it wipes the exact-score guess.
- Tabs: Tabla, Partidos, Grupos, Goleadores, Mis Pronósticos. Deep-link with `/#tab=<name>` (e.g. `#tab=partidos`).
- Partidos tab: each match card shows family vote split (H/D/A counts + colored bar) computed from `_predictions` — no "Empate" segment for knockout matches. Phase pills reorder so the current/announced phase comes right after "Todos", and that phase is the default filter on first load (not "Todos").
- Grupos tab: also renders a vertical knockout bracket (`renderBracket()`, `#bracket`) above the group standings — one full-width round block per stage, skips rounds where every matchup is still TBD-vs-TBD (no point showing repeated "Por definir" noise). No left/right bracket-half labeling — football-data's API exposes zero bracket-position metadata for knockout fixtures, would have to be hardcoded from an official FIFA bracket sheet if ever wanted.
- "Mis Pronósticos" tab: type name → saved picks. As of v1.3.4, only the *current* active-phase knockout rows (`getActivePhase()`) show expanded by default — older knockout stages (e.g. Ronda de 32 once Octavos is active) fold into their own collapsed `pred-group` per stage, same as Fase de Grupos (`▸` reuses the same `toggleGroup()` as the join-modal's day groups). No emoji on these fold headers (Twemoji-gotcha — collapsed group headers are plain text only). Each row shows two separate ✅/❌ badges when finished — one for the winner pick, one for the exact-score guess (only shown if a score was entered) — don't collapse them back into one combined icon, they test different things. Remaining-predictions alert and the form in the join/quick modals all use `getEditablePhases()`, not just the single "active" phase. "✏️ Editar Pronósticos" (this tab) and "Completar Pronósticos" (quick modal from the header button) both call the exact same `openPredictionsFor()` → `buildPredictionsForm()` → `submitPredictions()` chain — no separate code path, so a save bug in one is a save bug in both (confirmed 2026-07-04 when a reported "Octavos not saving" turned out to be browser cache, not a code path split).
- Join modal (3 steps) serves both new and existing members (registrations reopened v1.0.11-13). `submitPredictions` creates the `participants` row on first save if `_existingParticipant` is unset (note: that insert does NOT pass `avatar` — likely relies on the table default, never actually verified end-to-end). Avatar picker excludes medal emojis (🥇🥈🥉, reserved for leaderboard ranks) and refetches `_participants` on open to avoid duplicate-avatar races.
- Mascot (`static/img/patriarca.png`, replaced the old `mascot.jpg` v1.2.8): bouncing circle top-right of header; click → "Mensaje del Patriarca" modal (Eduardo's grandfather + dog). `mascot.jpg` is now unused dead weight in `static/img/`.

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
- v1.2.6: points scheme bump (correct_result 2→3) initially applied globally and silently re-scored ALL already-played group-stage matches too (everyone's total jumped, e.g. 47 correct → 141 pts instead of 94) — Eduardo caught it because totals looked identical/inflated across the board. Fixed by splitting into `correct_result_group` (locked at 2) vs `correct_result` (3, knockout only). Lesson: any `POINTS` change needs to ask "does this apply retroactively?" before touching the config, since calcPoints has no historical snapshot.
- 2026-06-30: Egypt 1-1 Iran (real result, draw) got overwritten to 1-2 by a stale football-data replica hours after the match ended — exposed the gap that the existing "never downgrade" guards protected `status` and "don't wipe a score" but not "don't change a FINISHED score to a different wrong one." Fixed with a FINISHED-score lock in `refresh.py`; bad data corrected by hand via SSH + service-key PATCH (anon key can't write `wc_matches`).
- 2026-06-30: two penalty-shootout knockout matches (Germany vs Paraguay, Netherlands vs Morocco) got `winner: null`/`"DRAW"` and a bogus score because `refresh.py` blindly trusted `score.fullTime`/`score.winner`, which football-data overloads/breaks for `PENALTY_SHOOTOUT` matches. See the football-data quirks list above for the fix and the two match_ids corrected by hand.
- 2026-07-04: Portugal 2-2 Croatia got flipped from the real 2-1 by a stale replica (same family as the Egypt/Iran case) — fixed by hand via SSH+service-key PATCH.
- 2026-07-04: Colombia 2-0 Ghana was wrong from the very first `FINISHED` write (real result 1-0) — the FINISHED-score lock then protected the *wrong* value from ever self-correcting. Confirms the known caveat: first-write-wrong needs a manual cross-check against the API, the lock can't catch it on its own. Fixed by hand.
- 2026-07-04: Australia 1-1 Egypt (penalty shootout) hit the known broken-`penalties`-tally case (`{home:4,away:4}`) — `winner` correctly left `null` per the existing mitigation, confirmed real result (Egypt won) and patched by hand.
- 2026-07-04: scoring rule + winner-lock gap — see the two new bullets in the football-data quirks list above (regulation-time score extended to `EXTRA_TIME`; `winner` now locked on FINISHED same as score). Found the winner-lock gap via a DIAGNOSTIC audit requested specifically to catch more of this bug family before the knockout rounds progress further.

## Agente DIAGNOSTIC
`C:\Users\eduar\.claude\agents\diagnostic.md` — bug-hunter agent for Eduardo's web projects/servers. Spawn it for "X se rompió / no se guardó / audita antes de lanzar". It reads this CLAUDE.md + queries production directly.

## Known loose ends
- Untracked files in repo root (`*.webp`, `ChatGPT Image *.png`, `WhatsApp Image *.jpeg`) — leftovers, not referenced anywhere, safe to delete.
- `static/img/mascot.jpg` is now unused (replaced by `patriarca.png` v1.2.8) — safe to delete.
- Pre-WC participants without special bets: Nelly, Carlos Lozada (still empty as of WC start).
- `python/export_excel.py` duplicates the `POINTS`/`calc_points` logic from `app.js` by hand (no shared module) — if the scoring formula changes again, update both or the Excel export will silently drift from the live leaderboard.
- `submitPredictions()`'s first-time `participants` insert doesn't pass `avatar` even though the UI has an avatar picker (`_selectedAvatar`) — never actually traced where/whether avatars get set for new joiners; flagged, not fixed.
