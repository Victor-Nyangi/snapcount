# Snapcount — session handover

**Written:** 2026-08-18 · **Branch:** `feat/m6-finishing` (off `main`) · **M0–M5 complete and merged; M6 is 3 of 4** · **The plan's verification gate PASSES** (`./scripts/verification-gate.sh`)

Read this, then `.superpowers/sdd/nfl-implemnentation2/progress.md` (the ledger, ~900 lines — the authoritative record). The plan is `resources/nfl-implemnentation2.md`.

---

## 1. Where things stand

| Milestone | Status | Notes |
|---|---|---|
| M0 Scaffold | ✅ | Template cloned, `Item` demo removed, light theme forced |
| M1 Design system | ✅ | Fonts, three-layer tokens, shadcn primitives, diverging scale + WCAG contrast |
| M2 Shared components | ✅ | 5 marks, `StatTable`, `CardRail`, app shell with URL-backed season/week |
| M3 Data model + ingestion | ✅ | 9 models, analytics, 25 champions, **real 2016–2025 backfill** |
| M4 API | ✅ | 8 route modules, typed TS client generated |
| **M5 Screens** | ✅ **8 of 8** | All merged. 5.1 and 5.2 were reviewed; **5.3–5.8 shipped unreviewed** |
| **M6 Finishing** | **3 of 4** | 6.1 states ✅ · 6.3 scheduled ingest ✅ · 6.4 docs ✅ · **6.2 a11y/responsive is PARTIAL — needs a browser** |

**Tests:** 152 backend + 306 frontend. The backend suite passes **from an empty database**, not just a backfilled one — see §2.

**Data:** 2,764 games · 5,480 players · 19,521 player-seasons · 320 team-seasons · 32 teams · 25 champions.

**Verified real values** — exact, not approximate. Use them as acceptance checks:

| Season | Team | Record | PF | PA | Differential |
|---|---|---|---|---|---|
| 2024 | DET | 15-2 | 564 | 342 | **+222** (power 72.8) |
| 2023 | SF | 12-5 | 491 | 298 | **+193** |
| 2020 | JAX | 1-15 | 306 | 492 | **−186** |

2024 week 15: **16 games, 2 featured**, first by kickoff is Rams 12 at 49ers 6 (line SF -3). Featured #1 is BUF at DET 48–42, banner `#0076B6`.

`current_week` is **17 for 2016–2020, 18 for 2021–2025** — the NFL's 16→17-game expansion. If a change makes these uniform, something regressed.

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

**To reproduce CI locally, never `alembic downgrade base`** — that destroys the backfill and costs a decade-long re-ingest. Point `DATABASE_URL` at a scratch database on the same Postgres instance, migrate it, run pytest. That reproduced CI's exact failure in 14 seconds and gave a fast fix loop.

---

## 3. Immediate next actions, in order

**M0–M5 are complete and merged. M6 is 3 of 4.** The plan's verification gate passes end to end — run `./scripts/verification-gate.sh`.

1. **Task 6.2 is the only unfinished task, and this environment cannot finish it.** Its measurable half IS done and verified (see §3a); what remains genuinely needs a browser. Someone with one should run it, or it should be explicitly descoped.
2. **Five screens shipped unreviewed (5.3–5.8).** Review has found a real defect in *every* screen it was run on — including one Critical (an inverted spread sign that made the "Underdog won" filter list the games the favourite won). This is the largest untested-by-review surface in the project. Review ranges are in the ledger.
3. **Record the confirmed brief corrections in the plan's §1** so a future reader sees why the code diverges: the upset filter (§4①), the `_layout` route path (wrong in all seven screen briefs), the per-position `Y/A` unit (§4④), `TrendLine`'s x-index, 5.7's missing `division` field, and 5.8's self-contradicting decade counts.

### 3a. What Task 6.2 still needs, and what is already proven

**Already verified, headlessly, with output:**

- **Step 3 (contrast inside coloured cells) — PASSES.** All 32 team chips clear AA after `inkFor`: worst case **4.62:1**, zero failures. The diverging scale's strong-end ink measures **10.92:1** (positive) and **8.77:1** (negative). This was flagged in the brief as "the constraint most likely to have slipped"; it did not.
- **Step 4a (the Explorer's 320 cells are not 320 tab stops) — PASSES.** Covered by route-level tests asserting exactly one tabbable cell and arrow-key movement between them.

**Still needs a browser — do not mark 6.2 done without it:**

- Step 1: keyboard-only walk of all seven screens; focus never invisible or clipped; sticky columns never occluding the focused cell.
- Step 2: `bunx @axe-core/cli` per route, expecting zero violations.
- Step 4: 375 / 768 / 1360px on all seven, no horizontal body scroll; in particular whether the seven-item nav collapses to a scrollable row below `md` rather than wrapping to four rows.
- Step 5: `prefers-reduced-motion` — no card hover lift, no bar animation, rail scrolling jumps.
- Plus the accumulated backlog in §4: `font-stretch: 125%` rendering, sticky + `border-collapse` in Safari, Radix `Select` pointer UX, `LeaderBar`'s flush-left marker on a negative baseline, and 6.1's offline-throttling visual check.

## 4. Decisions — all resolved

**① The upset filter diverges from its brief, deliberately — CONFIRMED, keep it.** Task 5.2's brief defines `upset` as "games the road team won" (copying the mockup's `g[2] > g[4]`); the pill is labelled **"Underdog won"**. On invented data those coincide. On the real backfill they do not — 2024 week 15 had **11 road wins but only 4 upsets**, because **7 of those road wins were by the favourite** (led by Ravens at NYG -16.5). Labelling those "Underdog won" states something false, so `filterSlate` asks whether the **closing favourite lost**. `spread_line` is home-relative and populated on all 2,764 games. **The plan's §1 should record this as a corrected brief**, and 5.3–5.8 should assume the same standard: a filter means what its label says, not what the mockup's sample data made convenient.

> **The numbers above were backwards until `7c2314e`, and so was the code.** As first written this section claimed 12 upsets and named Rams-at-SF, Cowboys-at-CAR, Bills-at-DET and Bucs-at-LAC as *road wins by the favourite*. They are the exact opposite: they are the week's only four upsets, road teams beating home favourites. The cause was one inverted comparison — `favouriteLost` read `spread_line < 0` as "home favoured" when **positive means home favoured** (nflverse; see `_format.py::line_label`, which had it right all along). The pill therefore listed the games the *favourite* won. Fixed, with the sign now pinned to the API's own `line_label` by test. **Sanity check for anyone touching this field:** over the 2,757 played games carrying a line, the home team wins **67.1%** when `spread_line > 0` and **34.7%** when it is negative.

**② `recap` is null for every real game — DECIDED: keep as built.** Three prose surfaces render as em-dashes: the game card's sentence, the slate table's *widest* column ("What happened", `minmax(220,1.4fr)`), and the featured note (which omits its paragraph rather than showing a dash). Plan §2 line 284 calls this a deliberate empty state — "populate it later" — and it stays that way, holding the designed layout so nothing shifts when recaps land. **Do not "tidy" this column away** in a later pass; it is a chosen empty state, not an oversight.

**~~③ Neither screen has route-level tests.~~ — CLOSED (`60a2546`).** 17 route-level tests now cover both screens through the **real generated route tree**: the sort→ungroup rule, Team opening A→Z, URL round-trips in both directions, the query keys (season/conference refetch; sort, grouping and slate do not), `powerMin`/`powerMax` being sourced pre-sort, and the slate filter over a fixture built from real 2024 wk15 rows including BAL at NYG -16.5. The harness is `routes/-route-harness.tsx`; **5.3–5.8 should each add route tests as they land** rather than deferring again. Note `vitest.setup.ts` now stubs `Element.scrollIntoView` — jsdom has none, and `_layout` calls it on every route change, so without the stub any route-level test gets the error boundary instead of the page.

**④ RESOLVED (`bdb8b16`) — the rank-metric unit said `Y/A` for all four positions.** Fixed at the source: `_metrics.py::UNITS` is now per-position (QB `Y/A`, RB `Y/C`, WR/TE `Y/T`), matching `METRIC_LABELS` beside it, with a backend test over all sixteen position×metric pairs. Decided by the assistant rather than the user, under the standing rule confirmed for §4① — it is one dict and one test if you want it reverted to match the mockup. Original note follows.

> `_metrics.py` serves `UNITS` as one global map (`rate: "Y/A"`), so a leader card's biggest readout is labelled "Y/A (rank metric)" while the metric dropdown right above it says **"Yards per carry"** for a back and **"Yards per target"** for a receiver or tight end. Only QB is right. The mockup has the same global `UNITS`, so this is a faithful port of a mockup shortcut — and the same lying-label class as the `qualifier_label` defect already fixed once. Fixing means making `UNITS` per-position like `METRIC_LABELS` beside it. **Note it also feeds Task 5.6's player rate cards**, so it is cheaper to settle before 5.6 than after.

~~`playoff_seed`~~ — **decided:** badge dropped (`f2cc899`). The API keeps the nullable column; nothing renders it.

**Four `to={... as any}` casts remain** in `frontend/src/routes/_layout.tsx` — team, player, explorer, history. Seven nav items, three real routes. Remove each as its screen lands; an `as any` that outlives its reason hides a real typo.

**Task 6.2's browser backlog.** A dozen items deferred since Task 1.1 because no browser is available: `font-stretch: 125%` actually rendering, sticky-column diagonal scroll, `position: sticky` + `border-collapse` (historic Safari issue), the 375px nav collapse, reduced-motion suppression, Radix `Select` pointer UX, the game card's `hover:-translate-y-[3px]` lift, and now `LeaderBar`'s baseline marker sitting flush at 0% whenever the baseline is negative (true — everyone shown beat it — but visually flush against the rounded left edge). All tagged `CARRY TO 6.2` in the ledger.

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
9. **The brief being wrong.** Eleven tasks improved because an implementer pushed back. Wrong in *my* text so far: spot-check values, a contrast ratio, a dark-mode variant's semantics, a test expectation forcing `+` onto every numeric column, the route path for every screen (see §6), an acceptance check that named a row order the default view does not produce, and the upset-filter definition in §4①.

---

## 6. Environment gotchas

- **`bun` is NOT on `$PATH`.** Prefix every shell command: `export PATH="$HOME/.bun/bin:$PATH"`.
- **Bun workspace monorepo.** Run frontend scripts from the **repo root**: `bun run --filter frontend <script>`.
- **`test` is Playwright; `test:unit` is vitest.** Never run `test` locally — it needs the full compose stack and browsers.
- **A brand-new route needs two builds.** `build` is `tsc && vite build`, and only the *vite* step regenerates `routeTree.gen.ts` — so the first typecheck after adding a route file fails against a stale tree. Run `bunx vite build` once from `frontend/`, then the normal build passes. Also: screens live at `routes/_layout/<name>.tsx`, **not** `routes/<name>.tsx` as every task brief says — TanStack's file-based routing needs the `_layout` folder to inherit the shell and the season/week search schema.
- **PostgreSQL is on host port 5434**, not 5432 (another project owns that). `docker compose up -d db`.
- **`mypy` and `ty` only read config from their own working directory.** `backend/pyproject.toml` holds both; run them from `backend/`, never the root, or `strict` and the nflreadpy override silently vanish. The pre-commit hooks now `cd backend` themselves.
- **`_typos.toml` fully overrides `[tool.typos]` in `pyproject.toml`** — the hook never reads pyproject. `_typos.toml` is a strict superset; add exemptions there.
- **jsdom normalises colours to `rgb(r, g, b)`** in `style.color` assertions, so comparing against a hex constant fails. `featured-card.test.tsx` has an `asRgb` helper.
- **Sentinel-season registry** (`tests/api/conftest.py`): 2081 unplayed game · 2082 stale · 2083 fresh · 2084 partial team schedule · 2085 featured recap · 2086/2087 explorer present-vs-missing. Ingest owns 2095–2099. **The dev database has 2099 leaked into it** from an ingest test that commits for real; `tests.fixtures.generate` filters seasons ≥ 2081 out of the slice for exactly this reason.
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

## 8. M6, and what "finalized" does and does not mean

**Done and merged-ready on `feat/m6-finishing`:**

- **6.1 loading/empty/error states.** The find here was that the **freshness pill had been hard-coded since Task 2.3** — `status="final" label="Final · updated Feb 9"`, the mockup's literal sample text, behind a comment saying it was a placeholder until Task 4.1 wired the endpoint. 4.1 built the endpoint in full and never changed the call site, so the header asserted the data was current, on a fixed February date, regardless of the database. Live truth at the time of writing is the opposite: every season reports `stale`. Also: four screens could not tell a failed request from an empty result, and no screen had a retry.
- **6.3 scheduled ingestion.** Steps 2–3 were already satisfied by `ingest_season` (it stamps `last_ingested_at` only inside the success branch), so the work was a test proving it plus the schedule itself. The season is **derived, not configured** — a naive `date +%Y` would spend seven months a year ingesting a season that does not exist yet.
- **6.4 documentation.** README, this project's `CLAUDE.md`, and the workspace map row. The README had still been the untouched template's.
- **The verification gate now runs** as `./scripts/verification-gate.sh`, and **passes**. As written in the plan it could not: both greps match their own explanatory comments, and 19 of the 20 bracketed-pixel hits are vendored `components/ui/` template code. Those two exemptions are declared in the script rather than left implicit. Exactly one hit was ours — the game card's `[3px]` lift, now `--lift-hover` (theme.css §1.14).

**Not done:** 6.2, as detailed in §3a. Do not let the "M6 3 of 4" line read as "nearly finished" — the remaining task is the accessibility and responsive pass, which is the one most likely to surface user-facing problems, and none of its browser-dependent half has been run.

**A process note against myself:** during 6.3 I ran `git checkout` on a single file that held uncommitted work and destroyed a fixture I had just written. That is the same rule §7 records for subagents, and it applies to the controller too. Copy to a `.bak` before probing; never use `git checkout` as an undo for work that is not committed.
