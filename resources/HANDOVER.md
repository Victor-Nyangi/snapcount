# Snapcount — session handover

**Written:** 2026-08-17 · **Branch:** `feat/m5-screens-leaders` (off `main`; PR #7 squash-merged as `f8d0fa1`, old branch deleted) · **Head:** `4a5e237` (Task 5.3, unreviewed)

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
| **M5 Screens** | **3 of 8** | 5.1 Standings (done, reviewed, fixed); 5.2 Week (done, reviewed, 3 defects fixed); 5.3 Leaders (done, **unreviewed**, `4a5e237`); 5.4–5.8 remain |
| M6 Finishing | ⬜ | 4 tasks; 6.3 partially done (freshness logic landed early in 4.1) |

**Tests:** 149 backend + 190 frontend (29 of them route-level). The backend suite passes **from an empty database**, not just a backfilled one — see §2.

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

1. ~~Review Task 5.2~~ — **done** (range `8a25ab7..e349349`). Three defects found and fixed in `7c2314e`: the inverted spread sign in the upset filter (§4①), the slate table's two-way `won` boolean greying out both teams on a tie or an unplayed game, and the game card dimming both scores on a tie. Verified correct and unchanged: all seven slate widths and their order against the mockup's `grid-template-columns`, `align` declared on every column, `inkFor` driving all four banner text layers, the featured card's `border-left` on every stat cell (the mockup does the same), and the pill labels (the mockup carries no counts on `close`/`upset` either). `filterPillStyle` also *restored* a `transition` that 5.1's local `pillStyle` had dropped from the mockup's `pill(on)`.
2. ~~Resolve the open calls in §4~~ — **done, all three answered by the user.** ① keep the "favourite lost" divergence, ② keep the recap surfaces as built, ③ close the route-test gap now (done, `60a2546`).
3. ~~5.3 Leaders~~ — **done** (`4a5e237`, pushed on `feat/m5-screens-leaders`), **unreviewed**. It fixed a real `LeaderBar` defect and skipped a dead requirement; both are in §5 below and in the ledger. **Review range `f8d0fa1..4a5e237`.**
4. **Answer §4④** — the `Y/A` unit is wrong for three of the four positions. It is a one-line backend change but it also feeds Task 5.6's rate cards, so decide before 5.6.
5. **Continue M5**: 5.4 `TrendLine` → 5.5 Team → 5.6 Player → 5.7 Explorer → 5.8 History. Two standing requirements apply to every remaining screen: it lands with route-level tests of its own (§4③), and a filter/label means what it says on real data (§4①).

---

## 4. Decisions (①–③ resolved 2026-08-17; ④ open)

**① The upset filter diverges from its brief, deliberately — CONFIRMED, keep it.** Task 5.2's brief defines `upset` as "games the road team won" (copying the mockup's `g[2] > g[4]`); the pill is labelled **"Underdog won"**. On invented data those coincide. On the real backfill they do not — 2024 week 15 had **11 road wins but only 4 upsets**, because **7 of those road wins were by the favourite** (led by Ravens at NYG -16.5). Labelling those "Underdog won" states something false, so `filterSlate` asks whether the **closing favourite lost**. `spread_line` is home-relative and populated on all 2,764 games. **The plan's §1 should record this as a corrected brief**, and 5.3–5.8 should assume the same standard: a filter means what its label says, not what the mockup's sample data made convenient.

> **The numbers above were backwards until `7c2314e`, and so was the code.** As first written this section claimed 12 upsets and named Rams-at-SF, Cowboys-at-CAR, Bills-at-DET and Bucs-at-LAC as *road wins by the favourite*. They are the exact opposite: they are the week's only four upsets, road teams beating home favourites. The cause was one inverted comparison — `favouriteLost` read `spread_line < 0` as "home favoured" when **positive means home favoured** (nflverse; see `_format.py::line_label`, which had it right all along). The pill therefore listed the games the *favourite* won. Fixed, with the sign now pinned to the API's own `line_label` by test. **Sanity check for anyone touching this field:** over the 2,757 played games carrying a line, the home team wins **67.1%** when `spread_line > 0` and **34.7%** when it is negative.

**② `recap` is null for every real game — DECIDED: keep as built.** Three prose surfaces render as em-dashes: the game card's sentence, the slate table's *widest* column ("What happened", `minmax(220,1.4fr)`), and the featured note (which omits its paragraph rather than showing a dash). Plan §2 line 284 calls this a deliberate empty state — "populate it later" — and it stays that way, holding the designed layout so nothing shifts when recaps land. **Do not "tidy" this column away** in a later pass; it is a chosen empty state, not an oversight.

**~~③ Neither screen has route-level tests.~~ — CLOSED (`60a2546`).** 17 route-level tests now cover both screens through the **real generated route tree**: the sort→ungroup rule, Team opening A→Z, URL round-trips in both directions, the query keys (season/conference refetch; sort, grouping and slate do not), `powerMin`/`powerMax` being sourced pre-sort, and the slate filter over a fixture built from real 2024 wk15 rows including BAL at NYG -16.5. The harness is `routes/-route-harness.tsx`; **5.3–5.8 should each add route tests as they land** rather than deferring again. Note `vitest.setup.ts` now stubs `Element.scrollIntoView` — jsdom has none, and `_layout` calls it on every route change, so without the stub any route-level test gets the error boundary instead of the page.

**④ NEW, OPEN — the rank-metric unit says `Y/A` for all four positions.** `_metrics.py` serves `UNITS` as one global map (`rate: "Y/A"`), so a leader card's biggest readout is labelled "Y/A (rank metric)" while the metric dropdown right above it says **"Yards per carry"** for a back and **"Yards per target"** for a receiver or tight end. Only QB is right. The mockup has the same global `UNITS`, so this is a faithful port of a mockup shortcut — and the same lying-label class as the `qualifier_label` defect already fixed once. Fixing means making `UNITS` per-position like `METRIC_LABELS` beside it. **Note it also feeds Task 5.6's player rate cards**, so it is cheaper to settle before 5.6 than after.

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
