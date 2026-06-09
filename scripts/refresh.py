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
    p = {"season": "2026", **(params or {})}
    r = requests.get(
        f"{FD_BASE}/{endpoint.lstrip('/')}",
        headers=FD_HEADERS, params=p, timeout=25, verify=False,
    )
    r.raise_for_status()
    return r.json()


def sb_upsert(table, rows):
    if not rows:
        return 0
    r = requests.post(f"{SB_URL}/rest/v1/{table}", headers=SB_HEADERS, json=rows)
    if not r.ok:
        print(f"  [supabase ERR] {table}: {r.status_code} {r.text[:200]}", file=sys.stderr)
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

def refresh_matches():
    print("Fetching fixtures...")
    data = fd_get("competitions/WC/matches")
    matches = data.get("matches", [])
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
        rows.append({
            "match_id":    str(m["id"]),
            "home_team":   (m.get("homeTeam") or {}).get("name", "TBD"),
            "away_team":   (m.get("awayTeam") or {}).get("name", "TBD"),
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
    rows = []
    for block in (data.get("standings") or []):
        group_raw = block.get("group", "") or ""
        gname = map_group(group_raw) or group_raw.upper().replace(" ","_")
        for entry in (block.get("table") or []):
            team = entry.get("team", {})
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
    n = sb_upsert("group_standings", rows)
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

    refresh_matches()
    refresh_standings()
    refresh_scorers()
    print("\n✅ Refresh completo:", datetime.now().strftime("%d/%m/%Y %H:%M"))
