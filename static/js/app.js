/* ═══════════════════════════════════════════════
   POLLA MUNDIALERA 2026 — app.js
   ═══════════════════════════════════════════════ */

// ─── Init ──────────────────────────────────────────────────────────────────
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let _matches = [], _participants = [], _predictions = [], _specialBets = [];
let _selectedAvatar = AVATARS[0];
let _matchPreds = {};   // { match_id: { result, home, away } }
let _currentStep = 1;

// ─── Bootstrap ────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  startCountdown();
  loadAllData();
  buildAvatarPicker();
});

async function loadAllData() {
  const [matches, participants, predictions, specials] = await Promise.all([
    sb.from("wc_matches").select("*").order("kickoff_utc"),
    sb.from("participants").select("*").order("created_at"),
    sb.from("predictions").select("*"),
    sb.from("special_bets").select("*"),
  ]);
  _matches      = matches.data      || [];
  _participants = participants.data || [];
  _predictions  = predictions.data  || [];
  _specialBets  = specials.data     || [];

  renderLeaderboard();
  renderMatches();
  renderGroups();
  renderScorers();
  populateTeamsList();
}

// ─── Countdown ────────────────────────────────────────────────────────────
function startCountdown() {
  function update() {
    const now  = new Date();
    const diff = WC_START - now;
    const el   = document.getElementById("countdown");
    if (!el) return;

    if (diff <= 0) {
      // Find next unplayed match
      const next = _matches.find(m => m.status === "SCHEDULED");
      if (!next) { el.textContent = "¡El Mundial está en curso! 🔥"; return; }
      const t = new Date(next.kickoff_utc);
      const d2 = t - now;
      if (d2 <= 0) { el.textContent = "¡Partido en curso! 🔴"; return; }
      el.innerHTML = `Próximo partido en ${fmtDiff(d2)}`;
    } else {
      el.innerHTML = `El Mundial arranca en: ${fmtDiff(diff)}`;
    }
  }
  update();
  setInterval(update, 1000);
}

function fmtDiff(ms) {
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000)  / 60000);
  const s = Math.floor((ms % 60000)    / 1000);
  if (d > 0) return `<span>${d}d</span> <span>${h}h</span> <span>${m}m</span>`;
  if (h > 0) return `<span>${h}h</span> <span>${m}m</span> <span>${s}s</span>`;
  return `<span>${m}m</span> <span>${s}s</span>`;
}

// ─── Tabs ──────────────────────────────────────────────────────────────────
function showTab(name) {
  document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
  document.querySelectorAll(".tab-content").forEach(t => t.classList.remove("active"));
  document.querySelector(`.tab[data-tab="${name}"]`).classList.add("active");
  document.getElementById(`tab-${name}`).classList.add("active");
}

// ─── Leaderboard ──────────────────────────────────────────────────────────
function renderLeaderboard() {
  const el = document.getElementById("leaderboard-list");
  if (!el) return;

  if (!_participants.length) {
    el.innerHTML = `<div class="empty-state">
      <span class="big">👨‍👩‍👧‍👦</span>
      <p>Nadie se ha unido todavía.<br>¡Sé el primero!</p>
    </div>`;
    return;
  }

  const board = _participants.map(p => ({
    ...p,
    points:    calcPoints(p.id),
    correct:   countCorrect(p.id),
    predCount: _predictions.filter(x => x.participant_id === p.id).length,
  })).sort((a, b) => b.points - a.points || b.correct - a.correct);

  const MEDALS = ["🥇","🥈","🥉"];

  el.innerHTML = board.map((p, i) => {
    const rank     = i + 1;
    const medal    = MEDALS[i] || `${rank}.`;
    const rankCls  = rank <= 3 ? `rank-${rank}` : "";
    const avatar   = p.photo_url
      ? `<img src="${p.photo_url}" alt="${p.name}">`
      : p.avatar || "⚽";

    return `<div class="leaderboard-card ${rankCls}">
      <div class="rank">${medal}</div>
      <div class="avatar">${p.photo_url ? `<img src="${p.photo_url}" alt="">` : p.avatar}</div>
      <div class="player-info">
        <div class="player-name">${esc(p.name)}</div>
        <div class="player-sub">${p.predCount} pronósticos · ${p.correct} aciertos</div>
      </div>
      <div class="points">${p.points}<small>pts</small></div>
    </div>`;
  }).join("");
}

function calcPoints(participantId) {
  let total = 0;
  const myPreds = _predictions.filter(p => p.participant_id === participantId);

  for (const pred of myPreds) {
    const m = _matches.find(m => m.match_id === pred.match_id);
    if (!m || m.status !== "FINISHED" || m.home_score === null) continue;

    const actual = m.winner === "HOME_TEAM" ? "H"
                 : m.winner === "AWAY_TEAM" ? "A" : "D";

    if (pred.pred_result === actual) {
      total += POINTS.correct_result;
      if (pred.pred_home_score === m.home_score &&
          pred.pred_away_score === m.away_score) {
        total += POINTS.exact_score_bonus;
      }
      if (m.stage !== "GROUP_STAGE") {
        total += POINTS.knockout_bonus;
      }
    }
  }
  return total;
}

function countCorrect(participantId) {
  let n = 0;
  const myPreds = _predictions.filter(p => p.participant_id === participantId);
  for (const pred of myPreds) {
    const m = _matches.find(m => m.match_id === pred.match_id);
    if (!m || m.status !== "FINISHED" || m.home_score === null) continue;
    const actual = m.winner === "HOME_TEAM" ? "H" : m.winner === "AWAY_TEAM" ? "A" : "D";
    if (pred.pred_result === actual) n++;
  }
  return n;
}

// ─── Matches ──────────────────────────────────────────────────────────────
let _activePhase = "ALL";

function renderMatches() {
  buildPhasePills();
  renderMatchList();
}

function buildPhasePills() {
  const el = document.getElementById("phase-filter");
  if (!el) return;

  const stages = ["ALL", ...new Set(_matches.map(m => m.stage).filter(Boolean))];
  el.innerHTML = `<div class="phase-pills">` +
    stages.map(s => `
      <button class="phase-pill ${s === _activePhase ? "active" : ""}"
              onclick="filterPhase('${s}')">
        ${s === "ALL" ? "Todos" : (STAGE_LABEL[s] || s)}
      </button>`).join("") +
    `</div>`;
}

function filterPhase(phase) {
  _activePhase = phase;
  document.querySelectorAll(".phase-pill").forEach(p => {
    p.classList.toggle("active", p.textContent.trim() === (phase === "ALL" ? "Todos" : (STAGE_LABEL[phase] || phase)));
  });
  renderMatchList();
}

function renderMatchList() {
  const el = document.getElementById("matches-list");
  if (!el) return;

  let matches = _matches;
  if (_activePhase !== "ALL") matches = matches.filter(m => m.stage === _activePhase);

  if (!matches.length) {
    el.innerHTML = `<div class="empty-state"><span class="big">📅</span><p>Sin partidos disponibles aún.<br>Vuelve el 11 de junio.</p></div>`;
    return;
  }

  // Group by date (Colombia time)
  const byDate = {};
  for (const m of matches) {
    const date = m.kickoff_utc ? toColDate(m.kickoff_utc) : "Fecha TBD";
    if (!byDate[date]) byDate[date] = [];
    byDate[date].push(m);
  }

  el.innerHTML = Object.entries(byDate).map(([date, ms]) => `
    <div class="match-day-label">${date}</div>
    ${ms.map(m => matchCard(m)).join("")}
  `).join("");
}

function matchCard(m) {
  const hFlag = flag(m.home_team);
  const aFlag = flag(m.away_team);
  const badge = STAGE_LABEL[m.stage] || m.stage || "";
  const grp   = m.group_name ? ` · ${m.group_name.replace("GROUP_","Grupo ")}` : "";

  let scoreHtml;
  if (m.status === "FINISHED") {
    const wH = m.winner === "HOME_TEAM" ? " win" : "";
    const wA = m.winner === "AWAY_TEAM" ? " win" : "";
    scoreHtml = `<div class="match-score">
      <span class="${wH}">${m.home_score}</span> - <span class="${wA}">${m.away_score}</span>
    </div>`;
  } else if (m.status === "IN_PLAY") {
    scoreHtml = `<div class="match-score live"><span class="match-status-dot"></span>EN VIVO</div>`;
  } else {
    const time = m.kickoff_utc ? toColTime(m.kickoff_utc) : "TBD";
    scoreHtml = `<div class="match-score scheduled">${time}</div>`;
  }

  return `<div class="match-card">
    <div class="match-stage-badge">${badge}${grp}</div>
    <div class="match-teams">
      <div class="team-side">
        <span class="team-flag">${hFlag}</span>
        <span class="team-name">${esc(m.home_team)}</span>
      </div>
      ${scoreHtml}
      <div class="team-side away">
        <span class="team-flag">${aFlag}</span>
        <span class="team-name">${esc(m.away_team)}</span>
      </div>
    </div>
  </div>`;
}

// ─── Groups ───────────────────────────────────────────────────────────────
async function renderGroups() {
  const el = document.getElementById("groups-list");
  if (!el) return;

  const { data } = await sb.from("group_standings").select("*").order("points", { ascending: false });
  if (!data || !data.length) {
    el.innerHTML = `<div class="empty-state"><span class="big">📊</span><p>Posiciones aún no disponibles.</p></div>`;
    return;
  }

  const groups = {};
  for (const row of data) {
    if (!groups[row.group_name]) groups[row.group_name] = [];
    groups[row.group_name].push(row);
  }

  el.innerHTML = Object.entries(groups).sort(([a],[b]) => a.localeCompare(b)).map(([gName, teams]) => {
    const label = gName.replace("GROUP_","Grupo ");
    const sorted = teams.sort((a, b) => b.points - a.points || b.goal_diff - a.goal_diff);
    return `<div class="group-section">
      <div class="group-header">${label}</div>
      <table class="group-table">
        <thead><tr>
          <th>Equipo</th><th>J</th><th>G</th><th>E</th><th>P</th><th>GD</th><th>Pts</th>
        </tr></thead>
        <tbody>
          ${sorted.map(t => `<tr>
            <td>${flag(t.team)} ${esc(t.team)}</td>
            <td>${t.played}</td><td>${t.won}</td><td>${t.drawn}</td><td>${t.lost}</td>
            <td>${t.goal_diff > 0 ? "+" : ""}${t.goal_diff}</td>
            <td class="pts-col">${t.points}</td>
          </tr>`).join("")}
        </tbody>
      </table>
    </div>`;
  }).join("");
}

// ─── Scorers ──────────────────────────────────────────────────────────────
async function renderScorers() {
  const el = document.getElementById("scorers-list");
  if (!el) return;

  const { data } = await sb.from("scorers").select("*").order("goals", { ascending: false }).limit(25);
  if (!data || !data.length) {
    el.innerHTML = `<div class="empty-state"><span class="big">⚽</span><p>Goleadores disponibles cuando arranquen los partidos.</p></div>`;
    return;
  }

  el.innerHTML = data.map((s, i) => `
    <div class="scorer-row">
      <div class="scorer-rank">${i + 1}</div>
      <div class="scorer-info">
        <div class="scorer-name">${flag(s.team)} ${esc(s.player_name)}</div>
        <div class="scorer-team">${esc(s.team)}</div>
      </div>
      <div class="scorer-goals">${s.goals}<small>goles</small></div>
    </div>
  `).join("");
}

// ─── Join modal ───────────────────────────────────────────────────────────
function showJoinModal() {
  _matchPreds   = {};
  _currentStep  = 1;
  document.getElementById("join-modal").classList.remove("hidden");
  document.getElementById("input-name").value  = "";
  document.getElementById("input-code").value  = "";
  document.getElementById("error-msg").style.display = "none";
  showStep(1);
  buildPredictionsForm();
}

function hideJoinModal() {
  document.getElementById("join-modal").classList.add("hidden");
}

function showStep(n) {
  _currentStep = n;
  [1,2,3].forEach(i => {
    const el = document.getElementById(`step-${i}`);
    if (el) el.style.display = i === n ? "" : "none";
  });
  document.querySelectorAll(".step-dot").forEach((d, i) => {
    d.classList.toggle("active", i < n);
  });
}

// Avatar picker
function buildAvatarPicker() {
  const el = document.getElementById("avatar-grid");
  if (!el) return;
  el.innerHTML = AVATARS.map((a, i) => `
    <button class="avatar-opt ${i === 0 ? "selected" : ""}"
            onclick="selectAvatar('${a}', this)">${a}</button>
  `).join("");
}

function selectAvatar(emoji, btn) {
  _selectedAvatar = emoji;
  document.querySelectorAll(".avatar-opt").forEach(b => b.classList.remove("selected"));
  btn.classList.add("selected");
}

// Step 1 → Step 2
function nextStep() {
  const name = document.getElementById("input-name").value.trim();
  const code = document.getElementById("input-code").value.trim();
  const errEl = document.getElementById("error-msg");

  if (!name) { showError("Escribe tu nombre 😊"); return; }
  if (!code)  { showError("Ingresa el código familiar"); return; }

  errEl.style.display = "none";
  showStep(2);
}

// Build predictions form from wc_matches
function buildPredictionsForm() {
  const el = document.getElementById("predictions-form");
  if (!el) return;

  // Only show GROUP_STAGE and open phases
  const groups = {};
  for (const m of _matches) {
    if (m.status === "FINISHED") continue;  // skip already played
    const gname = m.group_name || m.stage || "Otros";
    if (!groups[gname]) groups[gname] = [];
    groups[gname].push(m);
  }

  if (!Object.keys(groups).length) {
    el.innerHTML = `<p class="hint">No hay partidos pendientes en este momento.</p>`;
    return;
  }

  el.innerHTML = Object.entries(groups).sort(([a],[b]) => a.localeCompare(b)).map(([gname, ms]) => {
    const label = gname.replace("GROUP_","Grupo ");
    return `<div class="pred-group">
      <div class="pred-group-header" onclick="toggleGroup(this)">
        ${label} <span>▾</span>
      </div>
      <div class="pred-group-body">
        ${ms.map(m => predMatchRow(m)).join("")}
      </div>
    </div>`;
  }).join("");
}

function toggleGroup(header) {
  const body = header.nextElementSibling;
  const arrow = header.querySelector("span");
  const open  = body.style.display !== "none";
  body.style.display = open ? "none" : "";
  arrow.textContent  = open ? "▸" : "▾";
}

function predMatchRow(m) {
  const hFlag = flag(m.home_team);
  const aFlag = flag(m.away_team);
  const date  = m.kickoff_utc ? toColDateShort(m.kickoff_utc) : "Fecha TBD";
  return `<div class="pred-match" id="pred-${m.match_id}">
    <div class="pred-match-date">📅 ${date}</div>
    <div class="pred-match-teams">${hFlag} ${esc(m.home_team)} vs ${esc(m.away_team)} ${aFlag}</div>
    <div class="pred-buttons">
      <button class="pred-btn" onclick="setPred('${m.match_id}','H','${m.home_team}','${m.away_team}',this)">
        ${hFlag} Gana ${shortName(m.home_team)}
      </button>
      <button class="pred-btn" onclick="setPred('${m.match_id}','D','${m.home_team}','${m.away_team}',this)">
        Empate
      </button>
      <button class="pred-btn" onclick="setPred('${m.match_id}','A','${m.home_team}','${m.away_team}',this)">
        Gana ${shortName(m.away_team)} ${aFlag}
      </button>
    </div>
    <div id="score-${m.match_id}" class="score-inputs" style="display:none">
      <div>
        <div class="score-label">${shortName(m.home_team)}</div>
        <input type="number" min="0" max="20" id="sh-${m.match_id}" style="width:52px;text-align:center" placeholder="0"
               onchange="updateScore('${m.match_id}')">
      </div>
      <span>-</span>
      <div>
        <div class="score-label">${shortName(m.away_team)}</div>
        <input type="number" min="0" max="20" id="sa-${m.match_id}" style="width:52px;text-align:center" placeholder="0"
               onchange="updateScore('${m.match_id}')">
      </div>
      <span style="font-size:.75rem;color:var(--gold);margin-left:6px">+3 pts si aciertas</span>
    </div>
  </div>`;
}

function setPred(matchId, result, home, away, btn) {
  if (!_matchPreds[matchId]) _matchPreds[matchId] = {};
  _matchPreds[matchId].result = result;

  // Update button styles
  const row = document.getElementById(`pred-${matchId}`);
  row.querySelectorAll(".pred-btn").forEach(b => {
    b.className = "pred-btn";
    ["H","D","A"].forEach(r => b.classList.remove(`selected-${r}`));
  });
  btn.classList.add(`selected-${result}`);

  // Show score inputs
  document.getElementById(`score-${matchId}`).style.display = "flex";
}

function updateScore(matchId) {
  const h = parseInt(document.getElementById(`sh-${matchId}`).value);
  const a = parseInt(document.getElementById(`sa-${matchId}`).value);
  if (!_matchPreds[matchId]) _matchPreds[matchId] = {};
  _matchPreds[matchId].home = isNaN(h) ? null : h;
  _matchPreds[matchId].away = isNaN(a) ? null : a;
}

// Submit predictions
async function submitPredictions() {
  const name    = document.getElementById("input-name").value.trim();
  const code    = document.getElementById("input-code").value.trim();
  const champion = document.getElementById("special-champion").value.trim();
  const runner   = document.getElementById("special-runner").value.trim();
  const scorer   = document.getElementById("special-scorer").value.trim();
  const btnEl    = document.getElementById("btn-submit");

  if (btnEl) { btnEl.disabled = true; btnEl.textContent = "Guardando..."; }

  const predictions = Object.entries(_matchPreds)
    .filter(([, v]) => v.result)
    .map(([match_id, v]) => ({
      match_id,
      pred_result:     v.result,
      pred_home_score: v.home ?? null,
      pred_away_score: v.away ?? null,
    }));

  try {
    const res = await fetch("/api/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        avatar:      _selectedAvatar,
        family_code: code,
        predictions,
        special: { champion, runner_up: runner, top_scorer: scorer },
      }),
    });

    const data = await res.json();

    if (!data.ok) {
      showError(data.error || "Error al guardar");
      if (btnEl) { btnEl.disabled = false; btnEl.textContent = "✅ Guardar Pronósticos"; }
      return;
    }

    // Success
    showStep(3);
    document.getElementById("success-msg").textContent =
      `¡${name}, tus ${data.predictions_saved} pronósticos quedaron guardados! Buena suerte 🍀`;

    // Reload data
    await loadAllData();

  } catch (err) {
    showError("Error de conexión. Intenta de nuevo.");
    if (btnEl) { btnEl.disabled = false; btnEl.textContent = "✅ Guardar Pronósticos"; }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────
function flag(team) {
  return FLAG[team] || "🏳️";
}

function shortName(team) {
  if (!team) return "?";
  const abbr = { "United States":"USA","Saudi Arabia":"Arabia S.","Bosnia and Herzegovina":"Bosnia",
                 "Trinidad and Tobago":"Trinidad","Dominican Republic":"R.Dom.",
                 "New Zealand":"N.Zelanda","South Africa":"S.África","South Korea":"Corea S.",
                 "Ivory Coast":"C.Marfil","Côte d'Ivoire":"C.Marfil","DR Congo":"R.D.Congo" };
  return abbr[team] || team.split(" ").slice(0,1)[0];
}

function toColDate(utcStr) {
  return new Date(utcStr).toLocaleDateString("es-CO", {
    timeZone: "America/Bogota",
    weekday: "short", month: "short", day: "numeric",
  });
}

function toColDateShort(utcStr) {
  return new Date(utcStr).toLocaleString("es-CO", {
    timeZone: "America/Bogota",
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function toColTime(utcStr) {
  return new Date(utcStr).toLocaleTimeString("es-CO", {
    timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit",
  });
}

function esc(str) {
  if (!str) return "";
  return str.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

function showError(msg) {
  const el = document.getElementById("error-msg");
  if (el) { el.textContent = msg; el.style.display = "block"; }
}

function populateTeamsList() {
  const dl = document.getElementById("teams-list");
  if (!dl) return;
  const teams = [...new Set(_matches.flatMap(m => [m.home_team, m.away_team]).filter(Boolean))].sort();
  dl.innerHTML = teams.map(t => `<option value="${t}">`).join("");
}
