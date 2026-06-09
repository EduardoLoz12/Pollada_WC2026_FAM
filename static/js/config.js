// ─── Supabase ────────────────────────────────────────────────────────────────
// Anon key is safe to expose (RLS only allows SELECT from public)
window.SUPABASE_URL      = "https://izjbpheewbfshotjsgim.supabase.co";
window.SUPABASE_ANON_KEY = "sb_publishable_2gUX2Jb8ef0cQH-kKOnlWw_tgqb7tCZ";

// ─── App config ──────────────────────────────────────────────────────────────
window.FAMILY_CODE = "LozadaVargas2026";          // ← same as FAMILY_CODE env var in Vercel

window.POINTS = {
  correct_result:    2,
  exact_score_bonus: 3,
  knockout_bonus:    3,
  champion:         10,
  runner_up:         5,
  top_scorer:        5,
};

// ─── First WC match (Colombia time UTC-5) ────────────────────────────────────
window.WC_START = new Date("2026-06-11T19:00:00-05:00");

// ─── Available emojis for avatar picker ──────────────────────────────────────
window.AVATARS = [
  "🇨🇴","🇦🇷","🇧🇷","🇲🇽","🇪🇸","🇺🇸","🇩🇪","🇫🇷",
  "⭐","🦁","🔥","💪","🏆","👑","🎯","😎",
];

// ─── Country → flag emoji lookup ─────────────────────────────────────────────
window.FLAG = {
  "Argentina":"🇦🇷","Brazil":"🇧🇷","France":"🇫🇷","Germany":"🇩🇪",
  "Spain":"🇪🇸","England":"🏴󠁧󠁢󠁥󠁮󠁧󠁿","Portugal":"🇵🇹","Netherlands":"🇳🇱",
  "Belgium":"🇧🇪","Uruguay":"🇺🇾","Colombia":"🇨🇴","Mexico":"🇲🇽",
  "United States":"🇺🇸","USA":"🇺🇸","Canada":"🇨🇦","Ecuador":"🇪🇨",
  "Peru":"🇵🇪","Chile":"🇨🇱","Paraguay":"🇵🇾","Bolivia":"🇧🇴",
  "Venezuela":"🇻🇪","Costa Rica":"🇨🇷","Honduras":"🇭🇳","Panama":"🇵🇦",
  "El Salvador":"🇸🇻","Jamaica":"🇯🇲","Haiti":"🇭🇹","Cuba":"🇨🇺",
  "Trinidad and Tobago":"🇹🇹","Dominican Republic":"🇩🇴","Guatemala":"🇬🇹",
  "Morocco":"🇲🇦","Senegal":"🇸🇳","Nigeria":"🇳🇬","Egypt":"🇪🇬",
  "Ghana":"🇬🇭","Cameroon":"🇨🇲","Ivory Coast":"🇨🇮","Côte d'Ivoire":"🇨🇮",
  "South Africa":"🇿🇦","Mali":"🇲🇱","Angola":"🇦🇴","DR Congo":"🇨🇩",
  "Japan":"🇯🇵","South Korea":"🇰🇷","Australia":"🇦🇺","New Zealand":"🇳🇿",
  "Saudi Arabia":"🇸🇦","Iran":"🇮🇷","Iraq":"🇮🇶","Uzbekistan":"🇺🇿",
  "China PR":"🇨🇳","Indonesia":"🇮🇩","Jordan":"🇯🇴","Qatar":"🇶🇦",
  "Bahrain":"🇧🇭","Croatia":"🇭🇷","Serbia":"🇷🇸","Switzerland":"🇨🇭",
  "Denmark":"🇩🇰","Austria":"🇦🇹","Poland":"🇵🇱","Ukraine":"🇺🇦",
  "Romania":"🇷🇴","Hungary":"🇭🇺","Slovakia":"🇸🇰","Czech Republic":"🇨🇿",
  "Albania":"🇦🇱","Turkey":"🇹🇷","Greece":"🇬🇷","Slovenia":"🇸🇮",
  "Bosnia and Herzegovina":"🇧🇦","Wales":"🏴󠁧󠁢󠁷󠁬󠁳󠁿","Scotland":"🏴󠁧󠁢󠁳󠁣󠁴󠁿",
  "Israel":"🇮🇱","Curaçao":"🇨🇼","Suriname":"🇸🇷","Cuba":"🇨🇺",
};

window.STAGE_LABEL = {
  "GROUP_STAGE":    "Fase de Grupos",
  "ROUND_OF_32":    "Ronda de 32",
  "ROUND_OF_16":    "Octavos de Final",
  "QUARTER_FINALS": "Cuartos de Final",
  "SEMI_FINALS":    "Semifinales",
  "THIRD_PLACE":    "Tercer Puesto",
  "FINAL":          "Final",
};
