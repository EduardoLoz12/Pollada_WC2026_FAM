"""
Fetch WC2026 data from football-data.org → upsert into Supabase.
Run: python scripts/refresh.py
Cron: every 10 min on match days via server crontab.
"""
import os, sys, requests
from datetime import datetime, timezone
from dotenv import load_dotenv

load_dotenv()

# ─── football-data.org ────────────────────────────────────────────────────────
FD_KEY     = os.environ.get("FOOTBALL_DATA_KEY", "")
FD_BASE    = "https://api.football-data.org/v4"
FD_HEADERS = {"X-Auth-Token": FD_KEY}

# ─── Supabase ─────────────────────────────────────────────────────────────────
SB_URL     = os.environ.get("SUPABASE_URL", "")
SB_KEY     = os.environ.get("SUPABASE_SERVICE_KEY", "")
SB_HEADERS = {
    "apikey":        SB_KEY,
    "Authorization": f"Bearer {SB_KEY}",
    "Content-Type":  "application/json",
    "Prefer":        "resolution=merge-duplicates,return=minimal",
}


def fd_get(endpoint, params=None):
    # football-data load-balances across replicas and some lag by hours;
    # Cache-Control: no-cache improves the odds of hitting a fresh one.
    # It also drops connections intermittently — retry with backoff so one
    # hiccup doesn't kill the whole cron run.
    import time
    p = {"season": "2026", **(params or {})}
    last_err = None
    for attempt in range(3):
        try:
            r = requests.get(
                f"{FD_BASE}/{endpoint.lstrip('/')}",
                headers={**FD_HEADERS, "Cache-Control": "no-cache"},
                params=p, timeout=25, verify=False,
            )
            r.raise_for_status()
            return r.json()
        except requests.RequestException as e:
            last_err = e
            time.sleep(3 * (attempt + 1))
    raise last_err


def sb_get(path):
    r = requests.get(f"{SB_URL}/rest/v1/{path}", headers=SB_HEADERS)
    r.raise_for_status()
    return r.json()


def sb_upsert(table, rows, on_conflict=None):
    # on_conflict is required when the dedupe key is a unique constraint
    # rather than the primary key (e.g. group_standings uses a random uuid
    # PK, so without it the upsert hits the unique index and writes nothing).
    if not rows:
        return 0
    url = f"{SB_URL}/rest/v1/{table}"
    if on_conflict:
        url += f"?on_conflict={on_conflict}"
    r = requests.post(url, headers=SB_HEADERS, json=rows)
    if not r.ok:
        print(f"  [supabase ERR] {table}: {r.status_code} {r.text[:200]}", file=sys.stderr)
        return 0
    return len(rows)


def sb_delete_all(table):
    requests.delete(f"{SB_URL}/rest/v1/{table}?id=not.is.null", headers=SB_HEADERS)


# ─── Status / stage helpers ───────────────────────────────────────────────────

IN_PLAY_CODES = {"1H","HT","2H","ET","BT","P","SUSP","INT","LIVE"}
FINISHED_CODES = {"FT","AET","PEN"}

def map_status(short):
    if short in FINISHED_CODES: return "FINISHED"
    if short in IN_PLAY_CODES:  return "IN_PLAY"
    return "SCHEDULED"

def map_stage(round_str):
    r = (round_str or "").lower()
    if "group"       in r: return "GROUP_STAGE"
    if "32"          in r: return "ROUND_OF_32"
    if "16"          in r: return "ROUND_OF_16"
    if "quarter"     in r: return "QUARTER_FINALS"
    if "semi"        in r: return "SEMI_FINALS"
    if "3rd"         in r or "third" in r: return "THIRD_PLACE"
    if "final"       in r: return "FINAL"
    return round_str or "UNKNOWN"

def map_group(round_str):
    r = (round_str or "").upper()
    for g in ["A","B","C","D","E","F","G","H","I","J","K","L"]:
        if f"GROUP {g}" in r or f"GROUP_{g}" in r:
            return f"GROUP_{g}"
    return None

def winner(h, a, status):
    if status != "FINISHED" or h is None: return None
    if h > a:  return "HOME_TEAM"
    if a > h:  return "AWAY_TEAM"
    return "DRAW"


# ─── Refresh functions ────────────────────────────────────────────────────────

STATUS_RANK = {"SCHEDULED": 0, "IN_PLAY": 1, "FINISHED": 2}


def _match_rank(m):
    """How 'advanced' a raw API match payload is — used to pick the freshest replica."""
    st_raw = m.get("status", "SCHEDULED")
    st = "IN_PLAY" if st_raw in ("IN_PLAY", "PAUSED") else ("FINISHED" if st_raw in ("FINISHED", "AWARDED") else "SCHEDULED")
    ft = (m.get("score") or {}).get("fullTime") or {}
    goals = (ft.get("home") or 0) + (ft.get("away") or 0)
    return (STATUS_RANK[st], goals)


def refresh_matches():
    print("Fetching fixtures...")
    # Fetch several times and keep the most advanced version of each match —
    # football-data load-balances across replicas and some serve data hours
    # behind; more attempts = better odds of hitting a fresh one.
    matches_by_id = {}
    for _ in range(4):
        try:
            batch = fd_get("competitions/WC/matches").get("matches", [])
        except Exception as e:
            print(f"  [warn] fetch attempt failed: {e}", file=sys.stderr)
            continue
        for m in batch:
            prev = matches_by_id.get(m["id"])
            if prev is None or _match_rank(m) > _match_rank(prev):
                matches_by_id[m["id"]] = m
    matches = list(matches_by_id.values())
    if not matches:
        raise RuntimeError("all fixture fetch attempts failed")

    # Never downgrade what's already in the DB (stale replica protection)
    existing = {r["match_id"]: r for r in sb_get("wc_matches?select=match_id,status,home_score,home_team,away_team")}

    now  = datetime.now(timezone.utc).isoformat()
    rows = []
    for m in matches:
        score = m.get("score", {})
        ft    = score.get("fullTime", {})
        hs    = ft.get("home")
        as_   = ft.get("away")
        st_raw = m.get("status", "SCHEDULED")
        st = "IN_PLAY" if st_raw in ("IN_PLAY","PAUSED") else ("FINISHED" if st_raw in ("FINISHED","AWARDED") else "SCHEDULED")
        stage_raw = m.get("stage", "") or m.get("round", "") or ""
        group_raw = m.get("group", "") or stage_raw
        ex = existing.get(str(m["id"]))
        if ex and STATUS_RANK.get(st, 0) < STATUS_RANK.get(ex.get("status"), 0):
            continue  # stale replica tried to downgrade this match — skip
        if ex and st == ex.get("status") and hs is None and ex.get("home_score") is not None:
            continue  # same status but would wipe an existing score — skip

        home_team = (m.get("homeTeam") or {}).get("name") or "TBD"
        away_team = (m.get("awayTeam") or {}).get("name") or "TBD"
        # A lagged replica can report a knockout slot as still-TBD after a
        # fresher poll already resolved it — never regress a known team
        # name back to TBD (mirrors the status/score guards above).
        if ex:
            if home_team == "TBD" and ex.get("home_team") and ex["home_team"] != "TBD":
                home_team = ex["home_team"]
            if away_team == "TBD" and ex.get("away_team") and ex["away_team"] != "TBD":
                away_team = ex["away_team"]

        rows.append({
            "match_id":    str(m["id"]),
            "home_team":   home_team,
            "away_team":   away_team,
            "home_score":  hs,
            "away_score":  as_,
            "winner":      score.get("winner"),
            "status":      st,
            "stage":       map_stage(stage_raw),
            "group_name":  map_group(group_raw),
            "kickoff_utc": m.get("utcDate"),
            "matchday":    m.get("matchday"),
            "last_updated": now,
        })
    n = sb_upsert("wc_matches", rows)
    print(f"  {n} partidos actualizados")
    return n


def refresh_standings():
    print("Fetching standings...")
    data = fd_get("competitions/WC/standings")
    now  = datetime.now(timezone.utc).isoformat()

    # The 2026 API returns standings as one big table with group=None,
    # so derive each team's group from the fixtures already in the DB.
    team_group = {}
    for r in sb_get("wc_matches?select=home_team,away_team,group_name&group_name=not.is.null"):
        if r["home_team"]: team_group[r["home_team"]] = r["group_name"]
        if r["away_team"]: team_group[r["away_team"]] = r["group_name"]

    rows = []
    for block in (data.get("standings") or []):
        if (block.get("type") or "TOTAL") != "TOTAL":
            continue  # skip HOME/AWAY splits
        block_group = map_group(block.get("group") or "")
        for entry in (block.get("table") or []):
            team = entry.get("team", {})
            gname = block_group or team_group.get(team.get("name", ""))
            if not gname:
                continue
            rows.append({
                "group_name":    gname,
                "position":      entry.get("position"),
                "team":          team.get("name", ""),
                "played":        entry.get("playedGames", 0),
                "won":           entry.get("won",         0),
                "drawn":         entry.get("draw",        0),
                "lost":          entry.get("lost",        0),
                "goals_for":     entry.get("goalsFor",    0),
                "goals_against": entry.get("goalsAgainst",0),
                "goal_diff":     entry.get("goalDifference",0),
                "points":        entry.get("points",      0),
                "last_updated":  now,
            })
    n = sb_upsert("group_standings", rows, on_conflict="group_name,team")
    print(f"  {n} posiciones actualizadas")
    return n


def refresh_scorers():
    print("Fetching top scorers...")
    data = fd_get("competitions/WC/scorers", {"limit": 30})
    now  = datetime.now(timezone.utc).isoformat()
    sb_delete_all("scorers")
    rows = []
    for item in (data.get("scorers") or []):
        player = item.get("player", {})
        team   = item.get("team",   {})
        rows.append({
            "player_name": player.get("name", ""),
            "team":        team.get("name",   ""),
            "goals":       item.get("goals",   0) or 0,
            "assists":     item.get("assists", 0) or 0,
            "nationality": player.get("nationality", ""),
            "last_updated": now,
        })
    if rows:
        requests.post(
            f"{SB_URL}/rest/v1/scorers",
            headers={**SB_HEADERS, "Prefer": "return=minimal"},
            json=rows,
        )
    print(f"  {len(rows)} goleadores actualizados")
    return len(rows)


# ─── Main ─────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import urllib3; urllib3.disable_warnings()

    if not FD_KEY:
        sys.exit("ERROR: FOOTBALL_DATA_KEY no configurado en .env")
    if not SB_KEY or SB_KEY == "PENDING":
        sys.exit("ERROR: SUPABASE_SERVICE_KEY no configurado en .env")

    # Each section independent — one failure must not block the others
    for fn in (refresh_matches, refresh_standings, refresh_scorers):
        try:
            fn()
        except Exception as e:
            print(f"  [ERR] {fn.__name__}: {e}", file=sys.stderr)
    print("\nOK Refresh completo:", datetime.now().strftime("%d/%m/%Y %H:%M"))
