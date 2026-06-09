"""
GET /api/refresh
Fetches WC2026 data from football-data.org and updates Supabase.
Called by cron-job.org every 10 minutes during match days.
"""
from http.server import BaseHTTPRequestHandler
import json, os, sys, requests
from datetime import datetime, timezone

# ─── API clients ─────────────────────────────────────────────────────────────

FD_BASE    = "https://api.football-data.org/v4"
FD_KEY     = os.environ.get("FOOTBALL_DATA_KEY", "")
FD_HEADERS = {"X-Auth-Token": FD_KEY}

SB_URL     = os.environ.get("SUPABASE_URL", "")
SB_KEY     = os.environ.get("SUPABASE_SERVICE_KEY", "")
SB_HEADERS = {
    "apikey":        SB_KEY,
    "Authorization": f"Bearer {SB_KEY}",
    "Content-Type":  "application/json",
    "Prefer":        "resolution=merge-duplicates,return=minimal",
}


def fd_get(endpoint, params=None):
    r = requests.get(
        f"{FD_BASE}/{endpoint.lstrip('/')}",
        headers=FD_HEADERS,
        params=params or {},
        timeout=20,
        verify=False,
    )
    r.raise_for_status()
    return r.json()


def sb_upsert(table, rows):
    if not rows:
        return 0
    r = requests.post(
        f"{SB_URL}/rest/v1/{table}",
        headers=SB_HEADERS,
        json=rows,
    )
    if not r.ok:
        print(f"[supabase] {table} error {r.status_code}: {r.text[:200]}", file=sys.stderr)
    return len(rows)


def sb_delete(table, filter_str):
    requests.delete(
        f"{SB_URL}/rest/v1/{table}?{filter_str}",
        headers={**SB_HEADERS, "Prefer": "return=minimal"},
    )


# ─── Refresh functions ────────────────────────────────────────────────────────

def refresh_matches():
    data = fd_get("competitions/WC/matches")
    now = datetime.now(timezone.utc).isoformat()
    rows = []
    for m in data.get("matches", []):
        score = m.get("score", {})
        ft    = score.get("fullTime", {})
        rows.append({
            "match_id":    str(m["id"]),
            "home_team":   m["homeTeam"].get("name", "TBD"),
            "away_team":   m["awayTeam"].get("name", "TBD"),
            "home_score":  ft.get("home"),
            "away_score":  ft.get("away"),
            "winner":      score.get("winner"),
            "status":      m.get("status", "SCHEDULED"),
            "stage":       m.get("stage", "GROUP_STAGE"),
            "group_name":  m.get("group"),
            "kickoff_utc": m.get("utcDate"),
            "matchday":    m.get("matchday"),
            "last_updated": now,
        })
    return sb_upsert("wc_matches", rows)


def refresh_standings():
    data  = fd_get("competitions/WC/standings")
    now   = datetime.now(timezone.utc).isoformat()
    rows  = []
    for group in data.get("standings", []):
        gname = group.get("group", "")
        for entry in group.get("table", []):
            team = entry.get("team", {})
            rows.append({
                "group_name":    gname,
                "position":      entry.get("position"),
                "team":          team.get("name", ""),
                "played":        entry.get("playedGames", 0),
                "won":           entry.get("won", 0),
                "drawn":         entry.get("draw", 0),
                "lost":          entry.get("lost", 0),
                "goals_for":     entry.get("goalsFor", 0),
                "goals_against": entry.get("goalsAgainst", 0),
                "goal_diff":     entry.get("goalDifference", 0),
                "points":        entry.get("points", 0),
                "last_updated":  now,
            })
    return sb_upsert("group_standings", rows)


def refresh_scorers():
    data = fd_get("competitions/WC/scorers", {"limit": 30})
    now  = datetime.now(timezone.utc).isoformat()
    sb_delete("scorers", "last_updated=not.is.null")
    rows = []
    for s in data.get("scorers", []):
        player = s.get("player", {})
        team   = s.get("team", {})
        rows.append({
            "player_name": player.get("name", ""),
            "team":        team.get("name", ""),
            "goals":       s.get("goals", 0),
            "assists":     s.get("assists", 0),
            "nationality": player.get("nationality", ""),
            "last_updated": now,
        })
    if rows:
        requests.post(
            f"{SB_URL}/rest/v1/scorers",
            headers={**SB_HEADERS, "Prefer": "return=minimal"},
            json=rows,
        )
    return len(rows)


# ─── Vercel handler ───────────────────────────────────────────────────────────

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self._run()

    def do_POST(self):
        self._run()

    def _run(self):
        import urllib3
        urllib3.disable_warnings()
        try:
            n_m = refresh_matches()
            n_s = refresh_standings()
            n_sc = refresh_scorers()
            result = {
                "ok": True,
                "matches":   n_m,
                "standings": n_s,
                "scorers":   n_sc,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
            self._respond(200, result)
        except Exception as e:
            self._respond(500, {"ok": False, "error": str(e)})

    def _respond(self, status, data):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-type",                  "application/json")
        self.send_header("Access-Control-Allow-Origin",   "*")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


# Run directly for local testing / initial setup
if __name__ == "__main__":
    import urllib3; urllib3.disable_warnings()
    from dotenv import load_dotenv; load_dotenv()
    print("Refreshing matches...")  ; print(f"  {refresh_matches()} rows")
    print("Refreshing standings..."); print(f"  {refresh_standings()} rows")
    print("Refreshing scorers...")  ; print(f"  {refresh_scorers()} rows")
    print("Done.")
