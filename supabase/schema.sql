-- ═══════════════════════════════════════════
-- POLLA MUNDIALERA 2026 — Familia Lozada Vargas
-- Run this in Supabase SQL Editor
-- ═══════════════════════════════════════════

-- Participants (family members)
create table if not exists participants (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  avatar      text default '⚽',
  photo_url   text,
  created_at  timestamptz default now()
);

-- World Cup matches (cached from football-data.org)
create table if not exists wc_matches (
  match_id      text primary key,
  home_team     text not null,
  away_team     text not null,
  home_score    int,
  away_score    int,
  winner        text,       -- 'HOME_TEAM' | 'AWAY_TEAM' | 'DRAW' | null
  status        text default 'SCHEDULED', -- SCHEDULED | IN_PLAY | FINISHED
  stage         text,       -- GROUP_STAGE | ROUND_OF_32 | ROUND_OF_16 | QUARTER_FINALS | SEMI_FINALS | FINAL
  group_name    text,       -- GROUP_A ... GROUP_L (null for knockout)
  kickoff_utc   timestamptz,
  matchday      int,
  last_updated  timestamptz default now()
);

-- Group standings (cached from football-data.org)
create table if not exists group_standings (
  id            uuid primary key default gen_random_uuid(),
  group_name    text not null,
  position      int,
  team          text not null,
  played        int default 0,
  won           int default 0,
  drawn         int default 0,
  lost          int default 0,
  goals_for     int default 0,
  goals_against int default 0,
  goal_diff     int default 0,
  points        int default 0,
  last_updated  timestamptz default now(),
  unique(group_name, team)
);

-- Top scorers (cached from football-data.org)
create table if not exists scorers (
  id            uuid primary key default gen_random_uuid(),
  player_name   text not null,
  team          text not null,
  goals         int default 0,
  assists       int default 0,
  nationality   text,
  last_updated  timestamptz default now()
);

-- Predictions per participant per match
create table if not exists predictions (
  id               uuid primary key default gen_random_uuid(),
  participant_id   uuid not null references participants(id) on delete cascade,
  match_id         text not null,
  pred_result      text check (pred_result in ('H','D','A')), -- Home/Draw/Away
  pred_home_score  int,
  pred_away_score  int,
  created_at       timestamptz default now(),
  unique(participant_id, match_id)
);

-- Special bets (champion, runner-up, top scorer) — 1 row per participant
create table if not exists special_bets (
  id             uuid primary key default gen_random_uuid(),
  participant_id uuid not null references participants(id) on delete cascade unique,
  champion       text,
  runner_up      text,
  top_scorer     text,
  updated_at     timestamptz default now()
);

-- ─── Row Level Security ──────────────────────────────────────────────────────
alter table participants    enable row level security;
alter table wc_matches      enable row level security;
alter table group_standings enable row level security;
alter table scorers         enable row level security;
alter table predictions     enable row level security;
alter table special_bets    enable row level security;

-- Everyone can read everything (public family app)
create policy "public read" on participants    for select using (true);
create policy "public read" on wc_matches      for select using (true);
create policy "public read" on group_standings for select using (true);
create policy "public read" on scorers         for select using (true);
create policy "public read" on predictions     for select using (true);
create policy "public read" on special_bets    for select using (true);

-- Browser writes directly (family code validated client-side)
create policy "public insert" on participants  for insert with check (true);
create policy "public insert" on predictions   for insert with check (true);
create policy "public insert" on special_bets  for insert with check (true);

-- Allow editing existing predictions/special bets (needed for upsert on conflict)
create policy "public update" on predictions   for update using (true) with check (true);
create policy "public update" on special_bets  for update using (true) with check (true);

-- Service key (scripts/refresh.py) bypasses RLS for match data updates
