/* ═══════════════════════════════════════════════
   POLLA MUNDIALERA 2026 — app.js
   ═══════════════════════════════════════════════ */

// ─── Init ──────────────────────────────────────────────────────────────────
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let _matches = [], _participants = [], _predictions = [], _specialBets = [];
let _selectedAvatar = AVATARS[0];
let _matchPreds = {};
let _currentStep = 1;
let _existingParticipant = null;  // set when returning participant re-submits

const PHASE_ORDER = ["GROUP_STAGE","ROUND_OF_32","ROUND_OF_16","QUARTER_FINALS","SEMI_FINALS","THIRD_PLACE","FINAL"];

function getActivePhase() {
  for (const stage of PHASE_ORDER) {
    if (_matches.some(m => m.stage === stage && m.status !== "FINISHED")) return stage;
  }
  return null;
}

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
  const lastRank = board.length;

  el.innerHTML = board.map((p, i) => {
    const rank     = i + 1;
    const medal    = MEDALS[i] || `${rank}.`;
    const rankCls  = rank <= 3 ? `rank-${rank}` : "";
    const avatar   = p.photo_url
      ? `<img src="${p.photo_url}" alt="${p.name}">`
      : p.avatar || "⚽";

    let tag = "";
    if (rank === 1 && p.points > 0) {
      tag = `<span class="player-tag lead">🔥 EN LA CIMA</span>`;
    } else if (rank === lastRank && lastRank > 2) {
      tag = `<span class="player-tag last">🙈 FAROLITO ROJO</span>`;
    }

    return `<div class="leaderboard-card ${rankCls}">
      <div class="rank">${medal}</div>
      <div class="avatar">${p.photo_url ? `<img src="${p.photo_url}" alt="">` : p.avatar}</div>
      <div class="player-info">
        <div class="player-name">${esc(p.name)}</div>
        <div class="player-sub">${p.predCount} pronósticos · ${p.correct} aciertos</div>
        ${tag ? `<div>${tag}</div>` : ""}
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
  applyTwemoji("matches-list");
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

  if (data && data.length) {
    // Real standings from DB
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
    return;
  }

  // Pre-tournament fallback: derive teams from match data
  const teamsByGroup = {};
  for (const m of _matches) {
    if (!m.group_name || !m.group_name.startsWith("GROUP_")) continue;
    if (!teamsByGroup[m.group_name]) teamsByGroup[m.group_name] = new Set();
    if (m.home_team && m.home_team !== "TBD") teamsByGroup[m.group_name].add(m.home_team);
    if (m.away_team && m.away_team !== "TBD") teamsByGroup[m.group_name].add(m.away_team);
  }

  if (!Object.keys(teamsByGroup).length) {
    el.innerHTML = `<div class="empty-state"><span class="big">📊</span><p>Posiciones disponibles el 11 de junio.</p></div>`;
    return;
  }

  el.innerHTML = `<p class="hint" style="text-align:center;margin-bottom:14px">Posiciones arrancan el 11 de junio</p>` +
    Object.entries(teamsByGroup).sort(([a],[b]) => a.localeCompare(b)).map(([gName, teamsSet]) => {
      const label = gName.replace("GROUP_","Grupo ");
      const teams = [...teamsSet].sort();
      return `<div class="group-section">
        <div class="group-header">${label}</div>
        <table class="group-table">
          <thead><tr>
            <th>Equipo</th><th>J</th><th>G</th><th>E</th><th>P</th><th>GD</th><th>Pts</th>
          </tr></thead>
          <tbody>
            ${teams.map(t => `<tr>
              <td>${flag(t)} ${esc(t)}</td>
              <td>0</td><td>0</td><td>0</td><td>0</td><td>0</td><td class="pts-col">0</td>
            </tr>`).join("")}
          </tbody>
        </table>
      </div>`;
    }).join("");
  applyTwemoji("groups-list");
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
  applyTwemoji("scorers-list");
}

// ─── Join modal ───────────────────────────────────────────────────────────
function showJoinModal() {
  _matchPreds          = {};
  _currentStep         = 1;
  _existingParticipant = null;
  document.getElementById("join-modal").classList.remove("hidden");
  document.getElementById("input-name").value = "";
  document.getElementById("error-msg").style.display = "none";
  showStep(1);
  buildAvatarPicker();  // rebuild with current taken list
}

function hideJoinModal() {
  document.getElementById("join-modal").classList.add("hidden");
}

// ─── Mascot modal ───────────────────────────────────────────────────────────
function showMascotModal() {
  document.getElementById("mascot-modal").classList.remove("hidden");
}

function hideMascotModal() {
  document.getElementById("mascot-modal").classList.add("hidden");
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

// Avatar picker — taken avatars are greyed out and unselectable
function buildAvatarPicker() {
  const el = document.getElementById("avatar-grid");
  if (!el) return;
  const takenBy = {};
  for (const p of _participants) {
    if (p.avatar) takenBy[p.avatar] = p.name;
  }
  // pick first free avatar as default
  const firstFree = AVATARS.find(a => !takenBy[a]) || AVATARS[0];
  _selectedAvatar = firstFree;

  el.innerHTML = AVATARS.map((a, i) => {
    const taken = takenBy[a];
    const selected = a === firstFree;
    return `<button class="avatar-opt${selected ? " selected" : ""}${taken ? " taken" : ""}"
      data-idx="${i}" title="${taken ? "Tomado por " + esc(taken) : a}"
      onclick="selectAvatarByIdx(${i}, this)">${a}</button>`;
  }).join("");
}

function selectAvatarByIdx(idx, btn) {
  const a = AVATARS[idx];
  const takenBy = {};
  for (const p of _participants) { if (p.avatar) takenBy[p.avatar] = p.name; }
  if (takenBy[a]) return;
  _selectedAvatar = a;
  document.querySelectorAll(".avatar-opt").forEach(b => b.classList.remove("selected"));
  btn.classList.add("selected");
}

// Step 1 → Step 2
function nextStep() {
  const name  = document.getElementById("input-name").value.trim();
  const code  = document.getElementById("input-code").value.trim();
  const errEl = document.getElementById("error-msg");

  if (!name) { showError("Escribe tu nombre"); return; }
  if (!code) { showError("Ingresa el código familiar"); return; }
  if (code !== FAMILY_CODE) { showError("Código incorrecto 🚫 Pregúntale a Eduardo"); return; }

  // Detect returning participant
  _existingParticipant = _participants.find(
    p => p.name.trim().toLowerCase() === name.toLowerCase()
  ) || null;

  errEl.style.display = "none";
  buildPredictionsForm();  // rebuild for current phase / existing preds
  updatePhaseBadge();
  showStep(2);
}

function updatePhaseBadge() {
  const el = document.getElementById("phase-badge");
  if (!el) return;
  const phase = getActivePhase();
  el.textContent = phase ? (STAGE_LABEL[phase] || phase) : "";
}

// Build predictions form — current active phase.
// Before kickoff (WC_START), already-predicted matches are shown too so the
// user can change their pick. After kickoff, only unpredicted matches show.
function buildPredictionsForm() {
  const el = document.getElementById("predictions-form");
  if (!el) return;

  const phase = getActivePhase();
  if (!phase) {
    el.innerHTML = `<p class="hint">El torneo ha terminado. Gracias por participar!</p>`;
    return;
  }

  const editableAll = Date.now() < WC_START.getTime();

  const myPreds = _existingParticipant
    ? _predictions.filter(p => p.participant_id === _existingParticipant.id)
    : [];
  const predMap = {};
  myPreds.forEach(p => { predMap[p.match_id] = p.pred_result; });
  const alreadyPredicted = new Set(myPreds.map(p => p.match_id));

  const matches = _matches.filter(m =>
    m.stage === phase &&
    m.status !== "FINISHED" &&
    (editableAll || !alreadyPredicted.has(m.match_id))
  );

  // Pre-fill _matchPreds with existing picks so they're submitted even if untouched
  for (const m of matches) {
    if (predMap[m.match_id] && !_matchPreds[m.match_id]) {
      _matchPreds[m.match_id] = { result: predMap[m.match_id], home: null, away: null };
    }
  }

  if (!matches.length) {
    const phaseLabel = STAGE_LABEL[phase] || phase;
    el.innerHTML = `<div class="hint-done">
      <span>✔</span> Ya tienes todos tus pronósticos para <strong>${phaseLabel}</strong>.<br>
      Vuelve cuando empiece la siguiente fase.
    </div>`;
    return;
  }

  // Group by day (sorted chronologically)
  const sorted = [...matches].sort((a, b) => new Date(a.kickoff_utc) - new Date(b.kickoff_utc));
  const byDay = {};
  for (const m of sorted) {
    const day = m.kickoff_utc ? toColDate(m.kickoff_utc) : "Fecha TBD";
    if (!byDay[day]) byDay[day] = [];
    byDay[day].push(m);
  }
  el.innerHTML = Object.entries(byDay).map(([day, ms]) =>
    `<div class="pred-group">
      <div class="pred-group-header" onclick="toggleGroup(this)">${day} <span>▾</span></div>
      <div class="pred-group-body">${ms.map(m => predMatchRow(m, predMap[m.match_id])).join("")}</div>
    </div>`
  ).join("");
  applyTwemoji("predictions-form");
}

function toggleWelcome() {
  const body  = document.getElementById("welcome-body");
  const arrow = document.getElementById("welcome-arrow");
  const open  = body.style.display !== "none";
  body.style.display  = open ? "none" : "";
  arrow.textContent   = open ? "▸" : "▾";
}

function toggleGroup(header) {
  const body = header.nextElementSibling;
  const arrow = header.querySelector("span");
  const open  = body.style.display !== "none";
  body.style.display = open ? "none" : "";
  arrow.textContent  = open ? "▸" : "▾";
}

function predMatchRow(m, existing) {
  const hFlag = flag(m.home_team);
  const aFlag = flag(m.away_team);
  const time  = m.kickoff_utc ? toColTime(m.kickoff_utc) : "TBD";
  const tag   = m.group_name ? m.group_name.replace("GROUP_","G.") : (STAGE_LABEL[m.stage] || "");
  const selH  = existing === "H" ? " selected-H" : "";
  const selD  = existing === "D" ? " selected-D" : "";
  const selA  = existing === "A" ? " selected-A" : "";
  return `<div class="pred-match" id="pred-${m.match_id}">
    <div class="pred-match-meta"><span class="pred-time">${time}</span><span class="pred-tag">${tag}</span></div>
    <div class="pred-match-teams">${hFlag} ${esc(m.home_team)} vs ${esc(m.away_team)} ${aFlag}</div>
    <div class="pred-buttons">
      <button class="pred-btn${selH}" onclick="setPred('${m.match_id}','H',this)">${hFlag} ${shortName(m.home_team)}</button>
      <button class="pred-btn draw${selD}" onclick="setPred('${m.match_id}','D',this)">Empate</button>
      <button class="pred-btn${selA}" onclick="setPred('${m.match_id}','A',this)">${shortName(m.away_team)} ${aFlag}</button>
    </div>
  </div>`;
}

function setPred(matchId, result, btn) {
  if (!_matchPreds[matchId]) _matchPreds[matchId] = {};
  _matchPreds[matchId].result = result;
  _matchPreds[matchId].home   = null;
  _matchPreds[matchId].away   = null;
  const row = document.getElementById(`pred-${matchId}`);
  row.querySelectorAll(".pred-btn").forEach(b => b.className = b.classList.contains("draw") ? "pred-btn draw" : "pred-btn");
  btn.classList.add(`selected-${result}`);
}

function updateScore(matchId) {
  const h = parseInt(document.getElementById(`sh-${matchId}`).value);
  const a = parseInt(document.getElementById(`sa-${matchId}`).value);
  if (!_matchPreds[matchId]) _matchPreds[matchId] = {};
  _matchPreds[matchId].home = isNaN(h) ? null : h;
  _matchPreds[matchId].away = isNaN(a) ? null : a;
}

// Submit predictions — writes directly to Supabase from browser
async function submitPredictions() {
  const name     = document.getElementById("input-name").value.trim();
  const code     = document.getElementById("input-code").value.trim();
  const champion = document.getElementById("special-champion").value.trim();
  const runner   = document.getElementById("special-runner").value.trim();
  const scorer   = document.getElementById("special-scorer").value.trim();
  const btnEls   = document.querySelectorAll(".btn-save-action");
  const errEl2   = document.getElementById("error-msg-2");

  // Validate family code client-side
  if (code !== FAMILY_CODE) {
    if (errEl2) { errEl2.textContent = "Código familiar incorrecto 🚫"; errEl2.style.display = "block"; }
    return;
  }
  if (errEl2) errEl2.style.display = "none";

  btnEls.forEach(b => { b.disabled = true; b.textContent = "Guardando..."; });

  try {
    // 1. Get or create participant
    let pid;
    if (_existingParticipant) {
      pid = _existingParticipant.id;
    } else {
      const { data: pRow, error: pErr } = await sb
        .from("participants")
        .insert({ name, avatar: _selectedAvatar })
        .select("id, name")
        .single();
      if (pErr) throw new Error(pErr.message);
      pid = pRow.id;
    }

    // 2. Insert match predictions
    const predRows = Object.entries(_matchPreds)
      .filter(([, v]) => v.result)
      .map(([match_id, v]) => ({
        participant_id:  pid,
        match_id,
        pred_result:     v.result,
        pred_home_score: v.home ?? null,
        pred_away_score: v.away ?? null,
      }));

    if (predRows.length) {
      const { error: predErr } = await sb.from("predictions")
        .upsert(predRows, { onConflict: "participant_id,match_id" });
      if (predErr) throw new Error(predErr.message);
    }

    // 3. Insert/update special bets
    if (champion || runner || scorer) {
      const { error: sErr } = await sb.from("special_bets").upsert({
        participant_id: pid,
        champion:       champion || null,
        runner_up:      runner   || null,
        top_scorer:     scorer   || null,
        updated_at:     new Date().toISOString(),
      }, { onConflict: "participant_id" });
      if (sErr) throw new Error(sErr.message);
    }

    // Success
    showStep(3);
    const phase = getActivePhase();
    const phaseLabel = phase ? (STAGE_LABEL[phase] || phase) : "";
    const coveredIds = new Set([
      ...(_existingParticipant
        ? _predictions.filter(p => p.participant_id === _existingParticipant.id).map(p => p.match_id)
        : []),
      ...predRows.map(r => r.match_id),
    ]);
    const remaining = _matches.filter(m =>
      m.stage === phase && m.status !== "FINISHED" && !coveredIds.has(m.match_id)
    ).length;
    let msg;
    if (predRows.length === 0) {
      msg = `¡Listo, ${name}! Quedaste registrado. Vuelve cuando quieras a llenar tus pronósticos.`;
    } else if (remaining > 0) {
      msg = `¡${name}, guardamos ${predRows.length} pronósticos de ${phaseLabel}! Te faltan ${remaining} — vuelve cuando quieras para completarlos.`;
    } else {
      msg = _existingParticipant
        ? `¡${name}, tus ${predRows.length} pronósticos para ${phaseLabel} quedaron guardados!`
        : `¡${name}, tus ${predRows.length} pronósticos quedaron guardados! Buena suerte.`;
    }
    document.getElementById("success-msg").textContent = msg;

    await loadAllData();

  } catch (err) {
    if (errEl2) { errEl2.textContent = err.message || "Error al guardar. Intenta de nuevo."; errEl2.style.display = "block"; }
    document.getElementById("btn-submit-top").textContent = "💾 Guardar y salir";
    document.getElementById("btn-submit").textContent = "✅ Guardar mis pronósticos";
    btnEls.forEach(b => { b.disabled = false; });
  }
}

// ─── Mis Pronósticos (summary view) ────────────────────────────────────────
function loadMyPredictions() {
  const body = document.getElementById("my-preds-body");
  const name = (document.getElementById("my-preds-name-input").value || "").trim();

  if (!name) {
    body.innerHTML = "";
    return;
  }

  const participant = _participants.find(
    p => p.name.trim().toLowerCase() === name.toLowerCase()
  );

  if (!participant) {
    body.innerHTML = `<p class="hint">No encontramos a "<strong>${esc(name)}</strong>" en la polla.
      Revisa que el nombre esté escrito igual a como te uniste, o únete primero.</p>`;
    return;
  }

  const myPreds = _predictions.filter(p => p.participant_id === participant.id);
  const bet     = _specialBets.find(s => s.participant_id === participant.id);

  let html = `<div class="my-preds-summary">
    <div class="avatar" style="margin:0 auto 8px">${participant.photo_url ? `<img src="${participant.photo_url}" alt="">` : (participant.avatar || "⚽")}</div>
    <div class="player-name">${esc(participant.name)}</div>
    <div class="my-preds-points">${calcPoints(participant.id)}<small>pts totales</small></div>
    <p class="hint">${myPreds.length} pronósticos guardados · ${countCorrect(participant.id)} aciertos</p>
  </div>`;

  if (Date.now() < WC_START.getTime()) {
    html += `<button class="btn-primary" onclick="editMyPredictions()">✏️ Completar / cambiar mis pronósticos</button>`;
  }

  if (myPreds.length) {
    const sorted = [...myPreds].sort((a, b) => {
      const ma = _matches.find(m => m.match_id === a.match_id);
      const mb = _matches.find(m => m.match_id === b.match_id);
      return new Date(ma?.kickoff_utc || 0) - new Date(mb?.kickoff_utc || 0);
    });
    html += `<div class="my-preds-list">` + sorted.map(p => {
      const m = _matches.find(mm => mm.match_id === p.match_id);
      if (!m) return "";
      const pickLabel = p.pred_result === "H"
        ? `${flag(m.home_team)} ${shortName(m.home_team)}`
        : p.pred_result === "A"
          ? `${flag(m.away_team)} ${shortName(m.away_team)}`
          : "🤝 Empate";
      let statusHtml = "";
      if (m.status === "FINISHED" && m.home_score !== null) {
        const actual = m.winner === "HOME_TEAM" ? "H" : m.winner === "AWAY_TEAM" ? "A" : "D";
        statusHtml = p.pred_result === actual
          ? `<span class="my-pred-status ok">✅</span>`
          : `<span class="my-pred-status no">❌</span>`;
      }
      return `<div class="my-pred-row">
        <div class="my-pred-match">${esc(shortName(m.home_team))} vs ${esc(shortName(m.away_team))}</div>
        <div class="my-pred-pick">${pickLabel}</div>
        ${statusHtml}
      </div>`;
    }).join("") + `</div>`;
  } else {
    html += `<p class="hint">Aún no has hecho pronósticos. Toca "⚽ Unirme a la Polla" para empezar.</p>`;
  }

  if (bet && (bet.champion || bet.runner_up || bet.top_scorer)) {
    html += `<hr class="divider"><h3 style="font-size:.95rem;color:var(--gold);margin-bottom:8px">🌟 Apuestas Especiales</h3>`;
    if (bet.champion)   html += `<div class="my-pred-row"><div class="my-pred-match">🏆 Campeón</div><div class="my-pred-pick">${flag(bet.champion)} ${esc(bet.champion)}</div></div>`;
    if (bet.runner_up)  html += `<div class="my-pred-row"><div class="my-pred-match">🥈 Subcampeón</div><div class="my-pred-pick">${flag(bet.runner_up)} ${esc(bet.runner_up)}</div></div>`;
    if (bet.top_scorer) html += `<div class="my-pred-row"><div class="my-pred-match">⚽ Goleador</div><div class="my-pred-pick">${esc(bet.top_scorer)}</div></div>`;
  }

  body.innerHTML = html;
  applyTwemoji("my-preds-body");
}

// Jump straight into step 2 of the join modal to edit/complete predictions
function editMyPredictions() {
  const name = (document.getElementById("my-preds-name-input").value || "").trim();
  const participant = _participants.find(
    p => p.name.trim().toLowerCase() === name.toLowerCase()
  );
  if (!participant) return;

  _existingParticipant = participant;
  _selectedAvatar      = participant.avatar;
  _matchPreds          = {};

  document.getElementById("input-name").value = participant.name;

  const bet = _specialBets.find(s => s.participant_id === participant.id);
  document.getElementById("special-champion").value = bet?.champion  || "";
  document.getElementById("special-runner").value   = bet?.runner_up || "";
  document.getElementById("special-scorer").value   = bet?.top_scorer|| "";

  document.getElementById("join-modal").classList.remove("hidden");
  buildPredictionsForm();
  updatePhaseBadge();
  showStep(2);
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

function applyTwemoji(elId) {
  if (!window.twemoji) return;
  const el = document.getElementById(elId);
  if (el) twemoji.parse(el);
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
