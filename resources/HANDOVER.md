# Snapcount — session handover

**Written:** 2026-08-20 · **branch:** `fix/season-range-saturation-and-labels` (`34d1631`, 4 commits ahead of `main`, **not pushed**) · **Working tree clean.** M0–M6 are merged and the plan is complete. **All nine review findings are now closed, and all four of §3's open decisions are resolved** — see §3 for what was decided and built.

Read this, then `.superpowers/sdd/nfl-implemnentation2/progress.md` (the ledger, ~1000 lines — the authoritative record). The plan is `resources/nfl-implemnentation2.md`.

---

## 1. Where things stand

**The build is done.** M0–M6 all merged. All seven screens ship, the accessibility and responsive pass is enforced by Playwright specs rather than a checklist, and the 5.3–5.8 review that had been outstanding is now complete.

| Milestone | Status |
|---|---|
| M0 Scaffold · M1 Design system · M2 Shared components | ✅ |
| M3 Data model + ingestion | ✅ real 2016–2025 backfill |
| M4 API · M5 Screens (8/8) · M6 Finishing (4/4) | ✅ |
| **5.3–5.8 review** | ✅ complete — **all 9 findings fixed** (§3) |

**Tests:** 166 backend · 316 frontend unit · 91 Playwright (a11y, responsive, keyboard, contrast, plus the template's own). Both suites pass **from an empty database** — see §2.

**Verify before trusting anything below:**

```bash
./scripts/verification-gate.sh        # 166 + 316, build, lint, two greps
uv run prek run --all-files           # NOT covered by the gate — see §6
```

**Data:** 2,761 games · 5,480 players · 19,521 player-seasons · 320 team-seasons · 32 teams · 25 champions.

> Games was recorded as 2,764 in every earlier version of this file. The extra three were the **leaked 2099 sentinel games**, counted as if they were backfill. 2,761 is the real figure; the leak is fixed (§3 D).

**Spot-check values — exact, not approximate.** Use them as acceptance checks:

| Season | Team | Record | PF | PA | Differential |
|---|---|---|---|---|---|
| 2024 | DET | 15-2 | 564 | 342 | **+222** (power 72.8) |
| 2023 | SF | 12-5 | 491 | 298 | **+193** |
| 2020 | JAX | 1-15 | 306 | 492 | **−186** |

2024 week 15: **16 games, 2 featured**, first by kickoff is Rams 12 at 49ers 6 (line SF -3). Featured #1 is BUF at DET 48–42, banner `#0076B6`. NE has **6** titles, the most.

`current_week` is **17 for 2016–2020, 18 for 2021–2025** (the 16→17-game expansion) and every season runs on to **week 21 or 22** — the playoffs are weeks too. If a change makes either uniform, something regressed.

**Players whose team moved inside the backfill**, which is what catches a screen reading the wrong *season* rather than the wrong number: Kirk Cousins `00-0029604` (WAS 2016–17, MIN 2018–23, ATL 2024–25 — a different games count and ordinal every year, so nothing passes by coincidence) and Aaron Rodgers `00-0023459` (2023 NYJ **1 g** — the torn Achilles; 2024 NYJ 17 g; 2025 PIT 16 g).

---

## 2. The one mechanism you must understand before touching tests

CI runs `docker compose down -v`, migrates an **empty** database, then runs pytest. The dev database has a decade of real data in it. For a long time the suite silently depended on that difference and CI was red for it.

`backend/tests/conftest.py::_ensure_reference_data` closes the gap, once per session:

1. `seed_teams` + `seed_history` (both upsert, so no-ops when the data exists).
2. If there is no `TeamSeasonStat` row at all, load `backend/tests/fixtures/backfill.json.gz` — an 80 KB committed slice of the **real** rows: 10 seasons, 320 team-seasons, 285 games (2024), 2,008 player-seasons, 1,997 players, plus the two players `tests/api/test_players.py` names by id.

So it is a **no-op on your machine and the data source on CI**. No assertion was rewritten to suit a fixture: DET is still 15-2/+222, NE still has 6 titles.

**Regenerate the slice after any model change** (it fails loudly on a schema mismatch rather than importing less):

```bash
cd backend && uv run python -m tests.fixtures.generate
```

**The browser suite needed the same treatment, and got it late.** The Playwright job runs the same `docker compose down -v` + `prestart.sh`, but had no equivalent of `_ensure_reference_data` — so it rendered seven empty states and several of Task 6.2's checks were vacuous there (§3). `backend/tests/seed_e2e.py` is that equivalent: the same `load_backfill`, called from the workflow **on the runner** rather than in the container, because the backend image ships `app/` and `scripts/` but deliberately not `tests/`. Compose publishes the database on 5434 and `.env.example`'s `DATABASE_URL` already points there, which is the same path `test-backend` has always used.

**To reproduce CI locally, never `alembic downgrade base`** — that destroys the backfill and costs a decade-long re-ingest. Point `DATABASE_URL` at a scratch database on the same Postgres instance, migrate it, run pytest. That reproduced CI's exact failure in 14 seconds and gave a fast fix loop.

---

## 3. RESOLVED — all four decisions are decided and built

Branch `fix/season-range-saturation-and-labels`, four commits, **not pushed and
no PR yet**. That is the only thing left of §3: push, open a PR, get CI green,
merge. Everything below is the record of what was decided and why.

### A. Hosting — decided: Docker Compose on our own box · `34d1631`

The choice turned on the nightly ingest. It is an `ingest-scheduler`
**container**, so it works as designed on Compose and would have nowhere to run
on FastAPI Cloud — that path needs the schedule re-homed to a GitHub Actions
`schedule:` before it can keep a season current. `deploy.yml` is left in place
and unused; its `push:` trigger is on `master` against a `main` default branch,
so it would never fire on its own.

**The real problem was never which host.** `prestart.sh` migrates and creates
the superuser and stops, and `nightly-ingest.sh` only ingests the CURRENT
season — so a first deploy renders seven empty states *indefinitely*, and
waiting does not fix it.

`scripts/dump-backfill.sh` and `scripts/restore-backfill.sh` move the verified
decade across. Data only (alembic owns the schema), excluding `user`,
`alembic_version` and `ingestrun`, keeping `Season.last_ingested_at`. The dump
loop is per-table in **dependency order** — pg_dump emits tables in *name*
order and does not sort by foreign key, so one command with eight `--table`
flags loads `champion` and `game` before the `team`/`season` rows they
reference. The restore reads the target before writing and refuses a populated
database.

Verified end to end rather than written and hoped for: dump → scratch database
→ `alembic upgrade head` → restore → DET +222, NE 6 titles, 10 seasons, 2761
games, 19521 player-seasons. The refusal path was exercised too.

**Still to do by hand, and only you can:** register the self-hosted runner,
point DNS at the box, and set the vars/secrets. `deployment-snapcount.md` lists
both, and the whole first-deploy order.

### B. Finding 6 — decided: show the season year · `c5f8fb8`

`{ordinal(seasons_played)} season` is gone from both the leader card and the
player header; both now name the season. Nothing stores a rookie year, so the
ordinal could not be corrected, only replaced. Kirk Cousins in 2018 read "3rd"
and was in his seventh; Brady in 2017 read "2nd".

`ordinal()` had no other caller and is deleted. The column and its ingest stay
— the count is not wrong, only the word "season" around it — and
`ingest/players.py` now records that nothing renders it and that a real career
length needs a new source column, not a row count.

### C. Finding 7 — decided: scale to the real extremes · `1b3a3cf`

`total_domain` is computed server-side from the rows returned, like every other
derived value, and replaces the client's `domain * 4`. Measured against the
live database: **9 of 32 teams saturated → 1**, and strong ink 20 → 9. NYJ
(−1193) and CLE (−751) are now distinguishable, which was the point.

### D. Finding 9 — decided: derive it, after fixing the blocker · `c250fae` + `1b3a3cf`

Two commits, because the blocker was real. `tests/ingest/test_games.py` had
been committing three fabricated 2099 games and their Season row into the dev
database on **every** `pytest` run, for months — it has to commit (the recap
test proves an editorial value survives a re-ingest) but never cleaned up.
Reproduced before fixing: delete the rows, run that file alone, they come back.
`purge_season` now lives in the ingest package conftest and is used by both
modules.

With 2099 gone, the explorer's range comes from `/meta/seasons` under the
**same query key as the shell's season picker**, so it costs no extra request.
The request is held until the range is known — firing on the fallback first
would mean two requests and an eyebrow that visibly corrects itself. The old
constants remain as the fallback: ten known seasons beat an empty screen when
the only thing that failed is the range.

---

## 3a. What the accessibility pass taught, kept because it recurs

Task 6.2 is merged and its specs are green, but four lessons from it cost real time and will cost it again:

1. **A symptom on every screen at once names the layer, not the count.** Seven screens overflowing identically correctly said "shell" — and after the shell was fixed, four screens still overflowed for four *different* reasons. The shared cause being real does not mean it is the only one.
2. **A passing spec is not a look.** `responsive.spec.ts` was green on two visibly broken cards — the leader card was painting its readouts on top of the player's name. "The page did not widen" and "the card is readable" are different claims. **Screenshot the screens after a layout fix.**
3. **A test can pass without ever running.** `test.use({ reducedMotion: "reduce" })` never reached the page, so the spec measured an un-emulated browser for as long as it existed. When a test depends on an emulated condition, **assert the condition took hold** before asserting anything about it.
4. **axe is necessary, not sufficient.** Its `color-contrast` rule returned 0 violations, 0 passes *and* 0 incomplete for all 32 diverging cells on the standings screen — it never evaluated them. `tests/contrast.spec.ts` measures rendered pixels through a canvas for exactly this reason.

---

## 3b. The 5.3–5.8 review — COMPLETE; all 9 findings fixed

Method: **combined per screen** — recompute the spec against the live database *and* render the screen — then **report everything, fix on the user's call**. All six screens done.

1–3 in `74051aa`, 4/5/8 in `af75bf5`, and **6, 7 and 9 in the unpushed branch** (`c5f8fb8`, `1b3a3cf`, `c250fae`) — see §3 B, C and D for what each was decided to be. The table below is kept as the evidence trail: each row records what was measured, so a future change can be checked against it rather than re-derived.

### Findings, ranked

| # | Sev | Finding |
|---|---|---|
| 1 | **High** · ✅ FIXED `74051aa` | **7 of 10 seasons unreachable from the UI.** `SEASON_OPTIONS` hard-codes `[2025, 2024, 2023]`; `/meta/seasons` reports all ten. `?season=2017` renders 2017 data with a **blank Season control**. The component's comment says to revisit once that endpoint exists — it landed in Task 4.1. |
| 2 | **High** · ✅ FIXED `74051aa` | **The whole postseason is unreachable, every Super Bowl included.** `WEEK_OPTIONS` is `1..18`; games run to week 21 (2016–20) / 22 (2021–25) and the schema already allows `.max(22)`. `/week?season=2024&week=22` renders "Week 22 · 2024 Super Bowl" with a **blank Week control**. |
| 3 | **High** · ✅ FIXED `74051aa` | **Player rate-card bars are scaled to unqualified outliers.** `scale_max` is an unfiltered max over every player at the position, so a 1–4 game backup sets the scale. The league's **best qualified WR by EPA** (Amon-Ra St. Brown) fills **9.6%** of his bar; his Y/T bar fills 13% because the max is 69.0 y/t (Tyrell Shavers, one target). Rodgers' 2024 EPA bar fills **0.8%**. Affects every player page, 2 of 3 cards. The code's stated intent — "the bar's own player can never exceed its own scale" — is preserved by `max(qualified_max, this_player_value)`. |
| 4 | Medium · ✅ FIXED `af75bf5` | **Leaders: ties get different ranks and one is silently dropped at the cutoff.** 2017 QB TDs: Roethlisberger/Rivers/Goff all threw 28 → ranks 4, 5, and at Top 5 Goff vanishes. **68 such cases** across the backfill. `qualified.sort()` is stable over a `select()` with **no `ORDER BY`**, so the tiebreak is not deterministic. **The explorer already does this correctly** — BAL and BUF, both +157 in 2024, are both "Ranked #3 of 32". Leaders is inconsistent with a correct pattern already in the codebase. |
| 5 | Medium · ✅ FIXED `af75bf5` | **Team page caption hard-codes "the 17-game season".** The NFL played 16 games 2016–2020. Wrong on 5 of 10 seasons × 32 teams = **160 team-seasons**. `features/team/hero.tsx:135`. |
| 6 | Medium · ✅ FIXED `c5f8fb8` | **"Nth season" means "Nth season in our backfill", not career.** Tom Brady in 2017 reads **"2nd season"**. `ingest/players.py` documents the limitation in a comment; the UI states it as fact. Feeds both the leader card and the player page. |
| 7 | Low · ✅ FIXED `1b3a3cf` | **Explorer total column saturates for the teams you most want to compare.** `domain * 4` = 600 against totals spanning −1193..1046: **9 of 32 teams** saturate, so NYJ (−1193) and CLE (−751) render identically. Season cells at domain 150 saturate 14% of the time, which the plan already ruled acceptable. |
| 8 | Low · ✅ FIXED `af75bf5` | **History "most titles" drops a tied team.** Five teams have 2 titles; the cut at 6 cards shows BAL/NYG/PHI/PIT and drops **TB**. Tiebreak is deterministic (alphabetical by abbr), unlike finding 4 — but the row is labelled "most titles" and omits an equally-titled team. |
| 9 | Low · ✅ FIXED `1b3a3cf` (blocker in `c250fae`) | **Explorer's season range is hard-coded** `FROM = 2016 / TO = 2025` rather than derived from `/meta/seasons`. Same family as 1; a 2026 ingest will not appear until someone edits the constant. |

### Note on 1 and 2

They were **one component and one fix** — `season-week-picker.tsx` sourcing both lists from `/meta/seasons`. `week_count` could not serve: it is a stored constant of 18, so `SeasonSummary` gained a derived `max_week`.

### Verified clean — recomputed independently, exact match

- **5.3 leaders**: every baseline and board across 4 positions × 4 metrics; the qualifier gates the board, not just the baseline; per-position units (Y/A / Y/C / Y/T); precision 3/0/0/1.
- **5.4 TrendLine**: scaling exact (DET 2019 ends at y=126.0, 95% down, from a −82 cumulative); interior-null handling correct.
- **5.5 team page**: 17 rows with playoffs correctly excluded, record recomputed to 15-2, cumulative lands on +222 with zero mismatches, all four per-game stats. **Ties render correctly** (2019 DET 3-12-1: T badge in orchid, margin `0` neutral) — that fix held.
- **5.7 explorer**: all 32 × 10 cells match; zero missing; competition ranking correct on ties; selection round-trips through the URL (`team=BAL&year=2024`).
- **5.8 history**: 25 champions 2000–2024, decades 10/10/5, NE 6 titles, dynasty ranges are curated editorial (PIT's 2010 is their third *appearance*, not a title).

**Correction to an earlier ledger claim:** local deep links are NOT broken. The SPA fallback is `Accept`-header driven — a browser gets `200` + the app; `curl`'s default `*/*` gets a JSON 404. That tripped up one session's diagnosis.

**Also verified while reviewing:** every other data route already takes `season` explicitly (explorer, leaders, standings, `team_page`, `week`, `meta/freshness`), and `history/champions` is all-time by design — so the player-page season bug fixed in `0d86411` had no siblings.

---

## 4. Decisions — all resolved

**① The upset filter diverges from its brief, deliberately — CONFIRMED, keep it.** Task 5.2's brief defines `upset` as "games the road team won" (copying the mockup's `g[2] > g[4]`); the pill is labelled **"Underdog won"**. On invented data those coincide. On the real backfill they do not — 2024 week 15 had **11 road wins but only 4 upsets**, because **7 of those road wins were by the favourite** (led by Ravens at NYG -16.5). Labelling those "Underdog won" states something false, so `filterSlate` asks whether the **closing favourite lost**. `spread_line` is home-relative and populated on all 2,764 games. **The plan's §1 should record this as a corrected brief**, and 5.3–5.8 should assume the same standard: a filter means what its label says, not what the mockup's sample data made convenient.

> **The numbers above were backwards until `7c2314e`, and so was the code.** As first written this section claimed 12 upsets and named Rams-at-SF, Cowboys-at-CAR, Bills-at-DET and Bucs-at-LAC as *road wins by the favourite*. They are the exact opposite: they are the week's only four upsets, road teams beating home favourites. The cause was one inverted comparison — `favouriteLost` read `spread_line < 0` as "home favoured" when **positive means home favoured** (nflverse; see `_format.py::line_label`, which had it right all along). The pill therefore listed the games the *favourite* won. Fixed, with the sign now pinned to the API's own `line_label` by test. **Sanity check for anyone touching this field:** over the 2,757 played games carrying a line, the home team wins **67.1%** when `spread_line > 0` and **34.7%** when it is negative.

**② `recap` is null for every real game — DECIDED: keep as built.** Three prose surfaces render as em-dashes: the game card's sentence, the slate table's *widest* column ("What happened", `minmax(220,1.4fr)`), and the featured note (which omits its paragraph rather than showing a dash). Plan §2 line 284 calls this a deliberate empty state — "populate it later" — and it stays that way, holding the designed layout so nothing shifts when recaps land. **Do not "tidy" this column away** in a later pass; it is a chosen empty state, not an oversight.

**~~③ Neither screen has route-level tests.~~ — CLOSED (`60a2546`).** 17 route-level tests now cover both screens through the **real generated route tree**: the sort→ungroup rule, Team opening A→Z, URL round-trips in both directions, the query keys (season/conference refetch; sort, grouping and slate do not), `powerMin`/`powerMax` being sourced pre-sort, and the slate filter over a fixture built from real 2024 wk15 rows including BAL at NYG -16.5. The harness is `routes/-route-harness.tsx`; **5.3–5.8 should each add route tests as they land** rather than deferring again. Note `vitest.setup.ts` now stubs `Element.scrollIntoView` — jsdom has none, and `_layout` calls it on every route change, so without the stub any route-level test gets the error boundary instead of the page.

**④ RESOLVED (`bdb8b16`) — the rank-metric unit said `Y/A` for all four positions.** Fixed at the source: `_metrics.py::UNITS` is now per-position (QB `Y/A`, RB `Y/C`, WR/TE `Y/T`), matching `METRIC_LABELS` beside it, with a backend test over all sixteen position×metric pairs. Decided by the assistant rather than the user, under the standing rule confirmed for §4① — it is one dict and one test if you want it reverted to match the mockup. Original note follows.

> `_metrics.py` serves `UNITS` as one global map (`rate: "Y/A"`), so a leader card's biggest readout is labelled "Y/A (rank metric)" while the metric dropdown right above it says **"Yards per carry"** for a back and **"Yards per target"** for a receiver or tight end. Only QB is right. The mockup has the same global `UNITS`, so this is a faithful port of a mockup shortcut — and the same lying-label class as the `qualifier_label` defect already fixed once. Fixing means making `UNITS` per-position like `METRIC_LABELS` beside it. **Note it also feeds Task 5.6's player rate cards**, so it is cheaper to settle before 5.6 than after.

~~`playoff_seed`~~ — **decided:** badge dropped (`f2cc899`). The API keeps the nullable column; nothing renders it.

**~~Four `to={... as any}` casts remain.~~ — CLOSED.** All gone as of 5.8; `NAV_ITEMS` is typed against the router's own path literals, so a typo in a nav path is a build error rather than a 404 nobody clicks. Only a comment in `_layout.tsx` still mentions the old escape hatch.

**~~Task 6.2's browser backlog.~~ — mostly CLOSED (`5e4cc33`).** The items that a spec can hold are now held by one: the 375px nav collapse and every width check (`responsive.spec.ts`), reduced-motion suppression (`keyboard.spec.ts`, and it caught a real bug once the emulation was fixed), focus visibility and the roving tabindex (`keyboard.spec.ts`), contrast (`contrast.spec.ts` + axe).

Still genuinely open, because they are judgement calls a browser can only *show* you rather than assertions a spec can make: `font-stretch: 125%` actually rendering, sticky-column diagonal scroll, `position: sticky` + `border-collapse` (historic Safari issue — and the suite is chromium-only; firefox/webkit are commented out in `playwright.config.ts`), Radix `Select` pointer UX, and `LeaderBar`'s baseline marker sitting flush at 0% whenever the baseline is negative (true — everyone shown beat it — but visually flush against the rounded left edge). Tagged `CARRY TO 6.2` in the ledger.

---

## 5. Failure patterns this project has already paid for

Each cost at least one fix round. Expect them again.

1. **Tests coupled to ambient database state.** Fixtures at `season=2025` wrote into the real backfill (3.4); API tests assumed seeded teams *and* a decade of ingested data; a freshness test assumed someone had backfilled within the last 24 hours. Sentinel seasons **2081–2099** are the convention. **Every instance so far was first diagnosed as "one missing call" and every one turned out broader** — measure the blast radius against an empty database before believing a scope estimate.
2. **Narrow test data manufacturing confidence.** `/players/{id}` 500'd for the *majority of real roster positions*, surviving a full review and 146 tests because the only fixture was a quarterback. Same shape as the "T1" tie streak that rendered in the loss colour: the fixture had only W and L.
3. **The mockup's shortcuts are invisible until real data lands.** Its data is fictional, so `win ? … : …` two-way ternaries, "road win = underdog win", and hard-coded `#fff` banner text all look correct there and are all wrong here. **When porting a mockup expression, ask what the real data can be that its sample data never was** — null, tied, unplayed, light-coloured.
4. **Fixes introducing new bugs.** `current_week` was reset to 1 by every ingest because a fix for one bug shared a helper with a caller whose rows lacked `game_type`. Caught only because a reviewer checked commit *timestamps* and realised the correct-looking production data **predated the code being merged**.
5. **Container swaps dropping affordances.** Replacing `AppSidebar` with the top nav silently removed the only logout control. Two code reviews passed; only e2e caught it. **When replacing a container, enumerate what it *provided*, not what it looked like.**
6. **Autogenerated migrations being wrong.** Twice: naive timestamps, and `None` constraint names that would have broken `downgrade()`. **Always read the migration before applying it.**
7. **A sign convention assumed rather than looked up.** `favouriteLost` guessed that a negative `spread_line` meant the home team was favoured; the backend's `line_label` two files away documents the opposite and the data proves it. Because both sides of a `!==` were flipped consistently, every test passed, the reviewer's own SQL reproduced the same wrong answer, and the ledger recorded four genuine upsets as their exact opposite. **When a field carries a sign or a direction, find the code that already interprets it and agree with that, and sanity-check the result against an aggregate** — "home teams win 67% of the games where this is positive" settles it in one query; a unit test written from the same assumption as the code settles nothing.
8. **A shared mark that has never met real data.** `LeaderBar` shipped in M2, passed its review, and sat unrendered until 5.3 — where its `value / top` scaling turned out to assume nothing is ever negative. EPA per rush is signed, so the baseline marker was off-track on every RB board in all ten seasons. Same shape as `DiffCell`'s ASCII hyphen, which also survived M2 and was caught the first time Standings rendered it. **A component's review only covers the data its author imagined; the screen that first renders it is where it is really tested.** Expect one of these per screen for the marks 5.4–5.8 introduce.
9. **A test that passes without running.** `test.use({ reducedMotion: "reduce" })` silently did not reach the page, so the reduced-motion spec measured an un-emulated browser for as long as it existed — and read the ordinary 0.12s transition as the app's bug rather than its own. **When a test depends on an emulated or injected condition, assert that the condition actually took hold** before asserting anything about it; one `expect(matchMedia(...).matches).toBe(true)` would have caught it immediately. Sibling of pattern 1: state the test never established.

10. **Writing the comment before re-measuring.** I added `!important` to the reduced-motion reset and explained it as a specificity loss to Tailwind's `duration-[120ms]`. Reverting it showed the class case was already fine — `theme.css` is unlayered, Tailwind v4's utilities are layered, and unlayered normal declarations already win. The `!important` *was* needed, but only for **inline** styles, a different mechanism entirely. The fix worked, so nothing would have failed; the file would simply have carried a confident, wrong explanation forever. **A comment asserting a cause is a claim — measure it like one.**

11. **The brief being wrong.** Eleven tasks improved because an implementer pushed back. Wrong in *my* text so far: spot-check values, a contrast ratio, a dark-mode variant's semantics, a test expectation forcing `+` onto every numeric column, the route path for every screen (see §6), an acceptance check that named a row order the default view does not produce, and the upset-filter definition in §4①.

---

## 6. Environment gotchas

- **`bun` is NOT on `$PATH`.** Prefix every shell command: `export PATH="$HOME/.bun/bin:$PATH"`.
- **Bun workspace monorepo.** Run frontend scripts from the **repo root**: `bun run --filter frontend <script>`.
- **`test` is Playwright; `test:unit` is vitest.** `test` needs a stack, but it IS runnable locally and worth it — CI rounds cost ~4 minutes each and its database is empty. What works:
  1. `docker compose up -d db` (the dev volume already holds the decade backfill — **never** `down -v`).
  2. Backend on :8000. `app/main.py` serves the built SPA from `backend/app/frontend`, so `cd frontend && bunx vite build` (~0.8s) is the edit-reload loop.
  3. `PLAYWRIGHT_BASE_URL=http://localhost:8000 bunx playwright test` from `frontend/`.
  - **`vite dev` cannot run here** — ENOSPC, the inotify watch limit is exhausted. Hence building rather than serving.
  - **Running `pytest` deletes every `user` row** — `backend/tests/conftest.py:47` does `delete(User)` at session teardown. So the verification gate leaves the dev database unable to log in, `auth.setup.ts` fails with a 400, and every Playwright spec cascades from it. `cd backend && uv run python -m app.initial_data` puts the superuser back (additive, idempotent). Expect to need it after **every** gate run, and note the failure looks nothing like its cause.
  - `reset-password.spec.ts` (2 tests) needs mailcatcher on :1080 and fails locally without it. That is environmental — it passes in CI.
- **A brand-new route needs two builds.** `build` is `tsc && vite build`, and only the *vite* step regenerates `routeTree.gen.ts` — so the first typecheck after adding a route file fails against a stale tree. Run `bunx vite build` once from `frontend/`, then the normal build passes. Also: screens live at `routes/_layout/<name>.tsx`, **not** `routes/<name>.tsx` as every task brief says — TanStack's file-based routing needs the `_layout` folder to inherit the shell and the season/week search schema.
- **PostgreSQL is on host port 5434**, not 5432 (another project owns that). `docker compose up -d db`.
- **`./scripts/verification-gate.sh` IS NOT CI.** The gate runs pytest, vitest, the build, biome and two greps. It does **not** run `ruff format`, which is a pre-commit hook — so a green gate shipped an unformatted branch and CI's `pre-commit` job went red on `2 files reformatted`. Run **`uv run prek run --all-files`** alongside the gate before pushing anything Python. Same lesson as the biome one below: formatters rewrite source, so running them after verifying is how their changes reach CI unverified.

- **`bun run --filter frontend lint` REWRITES YOUR SOURCE.** The script is `biome check --write --unsafe`, and `--unsafe` fixes delete code. It silently removed two of Task 6.2's fixes — `tabIndex={0}` on the card rail (`lint/a11y/noNoninteractiveTabindex`) and `!important` on the reduced-motion reset (`lint/complexity/noImportantStyles`) — leaving behind only the comments explaining them, which then read as lies. Both were verified green *before* the lint step and committed after it, so CI caught what the local run had already proved fixed. **Run lint BEFORE the final verification, never after**, and when a fix is a deliberate rule conflict, pin it with `biome-ignore` (for a JSX attribute the comment goes *inside* the tag, immediately above the attribute; for CSS use `biome-ignore-start`/`-end` inside the block).

- **`mypy` and `ty` only read config from their own working directory.** `backend/pyproject.toml` holds both; run them from `backend/`, never the root, or `strict` and the nflreadpy override silently vanish. The pre-commit hooks now `cd backend` themselves.
- **`_typos.toml` fully overrides `[tool.typos]` in `pyproject.toml`** — the hook never reads pyproject. `_typos.toml` is a strict superset; add exemptions there.
- **jsdom normalises colours to `rgb(r, g, b)`** in `style.color` assertions, so comparing against a hex constant fails. `featured-card.test.tsx` has an `asRgb` helper.
- **Sentinel-season registry** (`tests/api/conftest.py`): 2081 unplayed game · 2082 stale · 2083 fresh · 2084 partial team schedule · 2085 featured recap · 2086/2087 explorer present-vs-missing · 2088 failed ingest · 2089 explorer empty range (deliberately has no fixture). Ingest owns 2095–2099. `tests.fixtures.generate` filters seasons ≥ 2081 out of the slice. **2099 used to leak into the dev database on every run** — fixed in `c250fae`; if a season ≥ 2081 ever appears in `SELECT year FROM season`, a cleanup regressed and it is a bug report, not a curiosity.
- **`.env` is gitignored and holds real secrets.** Never print it, never commit it.
- **Account-level session limits killed 5 of ~16 implementer dispatches.** What worked every time: **commit after each module goes green**, and keep dispatches small.
- **`delete_branch_on_merge` is on** — after a merge the remote branch vanishes, so the next push needs plain `-u`, not `--force-with-lease`.
- **The branch was squash-merged twice.** A plain `git rebase origin/main` conflicts hard; use `git rebase --onto origin/main <last-squashed-commit>`.

---

## 7. Process

The plan intends `superpowers:subagent-driven-development` — one implementer per task → review → fix rounds → scoped re-review.

```bash
SDD=~/.claude/plugins/cache/claude-plugins-official/superpowers/6.2.0/skills/subagent-driven-development/scripts
$SDD/task-brief     resources/nfl-implemnentation2.md 5.3       # extract a task brief
$SDD/review-package resources/nfl-implemnentation2.md BASE HEAD # build a review diff
```

**Note on the last session:** subagents were not used — the harness was configured not to spawn them unless asked. Task 5.1's review and Task 5.2's implementation were both done inline, applying the same rigour. If your harness allows subagents, prefer the dispatched flow; if not, inline works but costs context.

**What has made reviews valuable** — ask for these explicitly:

- **Recompute, don't read.** The best reviews reimplemented the spec independently and diffed outputs. This is how the upset-filter divergence and the Z→A sort bug were both found.
- **Prove the test bites.** Break the fix, confirm the test fails, restore. Caught a test that would have passed for the wrong reason.
- **Verify against the live database**, not fixtures. And state acceptance checks against the **default URL**, grouping and sorting included — 5.1's said "DET renders first", which the default grouped view never shows.
- **Ask what the tests do *not* cover** — consistently the most valuable section.

**Two rules each violated once, expensively:** never `git add -A` while a subagent is running (it swept an implementer's files into my commit), and subagents must never run tree-wide `git checkout` / `restore` / `stash` (one reverted uncommitted plan edits).

The plan is **corrected as errors are found** — its §1 records every divergence from the design and why. It is authoritative over the design mockup where they conflict.

---

## 8. Orientation for a cold start

**What this project is.** An NFL analysis platform: ten seasons of real nflverse data behind seven screens. FastAPI + SQLModel + PostgreSQL; React 19 + Vite + TanStack Router/Query, served by the same FastAPI app in production. Built from the `full-stack-fast` template, so anything in `components/ui/` or `components/Common/` is vendored and not ours.

**Read in this order:** this file → `CLAUDE.md` (conventions the code does not state) → `.superpowers/sdd/nfl-implemnentation2/progress.md` (the ledger, the authoritative record of every task, defect and ruling) → `resources/nfl-implemnentation2.md` (the plan; §1 divergences, §2 what was deliberately not built).

**How the work has been run.** One task at a time from the plan, each ending in a commit whose message records what was found rather than only what changed; a branch per milestone chunk; a PR with CI green before merge. The ledger is appended to after every task.

**The three habits that have actually caught things** — keep them:

1. **Check the brief against real data before coding.** Roughly half the task briefs had an error findable in five minutes against the live API — a field the API never sent, a count contradicting its own filter, a requirement that was dead code.
2. **Prove the test bites.** Break the behaviour, confirm the test fails, restore. This has repeatedly caught assertions that passed for the wrong reason, including twice in tests I had just written and believed.
3. **Verify against the live database, and state acceptance checks against the DEFAULT URL** — the one a user actually lands on, not a hand-tuned one.

**A fourth, earned in 6.2: get the fast local loop before the second CI round.** The first session ran 6.2 through CI at ~4 minutes a round and concluded the specs could not run locally. They can (§6), and the loop is ~8 seconds — which is what made it affordable to fix a bug, re-measure, and discover the *next* bug hiding behind it, five times on one screen set. It is also what showed that CI's own database is empty, which no amount of reading the specs would have revealed.

**And a fifth: a symptom that appears on every screen at once names the layer, not the count.** Seven screens overflowing identically said "shell" correctly — but after the shell was fixed, four screens still overflowed for four different reasons. **The shared cause being real does not mean it is the only one**; re-run before believing the diagnosis is complete.

**A sixth, earned across three separate incidents: formatters rewrite your source, so run them BEFORE you verify.** `bun run --filter frontend lint` is `biome check --write --unsafe` and silently deleted two fixes, leaving only the comments describing them. `ruff format` reformatted a branch after the gate had gone green. In both cases CI caught what the local run had already proved fixed. The pre-push order that works: **`prek run --all-files` → `bun run --filter frontend lint` → `./scripts/verification-gate.sh` → Playwright**, never the reverse.

**And a seventh: ask what the label claims, then check the value beside it.** This is the single highest-yield question on this codebase — it has caught the hard-coded freshness pill, `qualifier_label`, the per-position `Y/A` unit, the player page reading the wrong season, the blank season/week controls, and the "17-game season" caption. Seven defects from one question.

**M6 in brief (all merged).** 6.1 found that the freshness pill had been hard-coded to the mockup's literal `"Final · updated Feb 9"` since Task 2.3 — Task 4.1 built the endpoint and never changed the call site — while every season actually reported `stale`; it also found four screens that could not tell a failed request from an empty result. 6.3 turned out to be mostly already correct (`ingest_season` only stamps `last_ingested_at` on success), so the work was a test proving it plus the nightly schedule, whose season is *derived* because a naive `date +%Y` would ingest a nonexistent season for seven months a year. 6.4 wrote the README (still the template's until then), `CLAUDE.md`, and the workspace row. The plan's verification gate is now `./scripts/verification-gate.sh` and passes — it could not as written, since both its greps matched their own explanatory comments and 19 of 20 bracketed-pixel hits are vendored template code; both exemptions are declared in the script.

**A process note against myself.** During 6.3 I ran `git checkout` on a single file holding uncommitted work and destroyed a fixture I had just written. §7 records that rule for subagents; it applies to whoever is driving. Copy to a `.bak` before probing, and never use `git checkout` as an undo for uncommitted work.
