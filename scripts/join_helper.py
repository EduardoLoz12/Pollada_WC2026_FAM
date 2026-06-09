"""
POST /api/join
Adds a family member + their predictions to Supabase.
Validates family_code before writing.

Body (JSON):
{
  "name":        "Eduardo",
  "avatar":      "🇨🇴",
  "family_code": "LozadaVargas2026",
  "predictions": [
    {"match_id": "123", "pred_result": "H", "pred_home_score": 2, "pred_away_score": 1},
    ...
  ],
  "special": {
    "champion":   "Argentina",
    "runner_up":  "Brasil",
    "top_scorer": "Lionel Messi"
  }
}
"""
from http.server import BaseHTTPRequestHandler
import json, os, requests

SB_URL     = os.environ.get("SUPABASE_URL", "")
SB_KEY     = os.environ.get("SUPABASE_SERVICE_KEY", "")
FAMILY_CODE = os.environ.get("FAMILY_CODE", "LozadaVargas2026")

SB_HEADERS = {
    "apikey":        SB_KEY,
    "Authorization": f"Bearer {SB_KEY}",
    "Content-Type":  "application/json",
    "Prefer":        "return=representation",
}


def sb_post(table, data, prefer="return=representation"):
    headers = {**SB_HEADERS, "Prefer": prefer}
    r = requests.post(f"{SB_URL}/rest/v1/{table}", headers=headers, json=data)
    r.raise_for_status()
    return r.json() if prefer == "return=representation" else None


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_POST(self):
        try:
            length = int(self.headers.get("Content-Length", 0))
            body   = json.loads(self.rfile.read(length)) if length else {}

            if body.get("family_code") != FAMILY_CODE:
                return self._respond(403, {"ok": False, "error": "Código familiar incorrecto 🚫"})

            name = body.get("name", "").strip()
            if not name:
                return self._respond(400, {"ok": False, "error": "Nombre requerido"})

            # Create participant
            row = sb_post("participants", {"name": name, "avatar": body.get("avatar", "⚽")})
            pid = row[0]["id"]

            # Save match predictions
            preds = [
                {
                    "participant_id":  pid,
                    "match_id":        p["match_id"],
                    "pred_result":     p["pred_result"],
                    "pred_home_score": p.get("pred_home_score"),
                    "pred_away_score": p.get("pred_away_score"),
                }
                for p in body.get("predictions", [])
                if p.get("pred_result")
            ]
            if preds:
                sb_post("predictions", preds, prefer="return=minimal")

            # Save special bets
            special = body.get("special", {})
            if any(v for v in special.values() if v):
                sb_post("special_bets", {
                    "participant_id": pid,
                    "champion":       special.get("champion"),
                    "runner_up":      special.get("runner_up"),
                    "top_scorer":     special.get("top_scorer"),
                }, prefer="return=minimal")

            self._respond(200, {
                "ok":   True,
                "id":   pid,
                "name": name,
                "predictions_saved": len(preds),
            })

        except Exception as e:
            self._respond(500, {"ok": False, "error": str(e)})

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin",  "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _respond(self, status, data):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-type", "application/json")
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass
