// ─── Supabase ────────────────────────────────────────────────────────────────
// Anon key is safe to expose (RLS only allows SELECT from public)
window.SUPABASE_URL      = "https://izjbpheewbfshotjsgim.supabase.co";
window.SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6amJwaGVld2Jmc2hvdGpzZ2ltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwMjg4MDYsImV4cCI6MjA5NjYwNDgwNn0.BqJnf8PflAK177KTl0pqNc2Mf5HyFY19Lco8DOrS7EQ";

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
  // Americas
  "🇨🇴","🇦🇷","🇧🇷","🇲🇽","🇺🇸","🇨🇦","🇪🇨","🇵🇪",
  "🇺🇾","🇨🇱","🇵🇦","🇨🇷","🇵🇾","🇧🇴","🇻🇪","🇯🇲",
  // Europa/África/Asia
  "🇪🇸","🇩🇪","🇫🇷","🇵🇹","🇳🇱","🇧🇪","🇮🇹","🇨🇭",
  "🇬🇧","🇦🇺","🇯🇵","🇰🇷","🇲🇦","🇳🇬","🇸🇦","🇩🇰",
  // Trofeos y deportes
  "🏆","🥇","🥈","🥉","🎯","⚽","🏅","🎖️",
  // Fuego y poder
  "🔥","⭐","💪","👑","⚡","💎","🌟","🚀",
  // Personajes y animales
  "🦁","🐯","🦅","🐉","🦊","🐺","🦸","🤴",
  // Caras
  "😎","🤩","😤","🤠","🫡","🥵","👸","🧙",
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
  // WC2026 exact names from football-data.org
  "Bosnia-Herzegovina":"🇧🇦",
  "Cape Verde Islands":"🇨🇻",
  "Congo DR":"🇨🇩",
  "Czechia":"🇨🇿",
  "Norway":"🇳🇴",
  "Sweden":"🇸🇪",
  "Algeria":"🇩🇿",
  "Tunisia":"🇹🇳",
  // other football-data.org variants
  "Korea Republic":"🇰🇷","IR Iran":"🇮🇷","Türkiye":"🇹🇷",
  "China PR":"🇨🇳","Chinese Taipei":"🇨🇳",
  "Cape Verde":"🇨🇻","Benin":"🇧🇯",
  "Comoros":"🇰🇲","Equatorial Guinea":"🇬🇶","Guinea":"🇬🇳",
  "New Caledonia":"🇳🇨","Papua New Guinea":"🇵🇬","Tahiti":"🇵🇫",
  "Philippines":"🇵🇭","Thailand":"🇹🇭","Vietnam":"🇻🇳",
  "Kuwait":"🇰🇼","Oman":"🇴🇲","Yemen":"🇾🇪",
  "Republic of Ireland":"🇮🇪",
  "Tanzania":"🇹🇿","Zambia":"🇿🇲","Zimbabwe":"🇿🇼",
  "Finland":"🇫🇮","Slovakia":"🇸🇰","Slovenia":"🇸🇮",
  "Iceland":"🇮🇸","Wales":"🏴󠁧󠁢󠁷󠁬󠁳󠁿",
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
