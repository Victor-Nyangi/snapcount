# Snapcount — session handover

**Written:** 2026-08-19 (second session) · **`main` head:** `f24472d` · **Open:** PR **#13** (`fix/player-season`) · **THE PLAN IS COMPLETE — M0–M6 are all merged.** What remains is review, not construction: see §3.

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
| **M6 Finishing** | ✅ **4 of 4** | 6.1 states ✅ · 6.3 scheduled ingest ✅ · 6.4 docs ✅ · 6.2 a11y/responsive ✅ (PR #12, `f24472d`) |

**Tests:** 156 backend + 307 frontend unit + 91 Playwright (a11y, responsive, keyboard, contrast, and the template's own). The backend suite passes **from an empty database**, not just a backfilled one — see §2. The *browser* suite no longer runs against one: CI now seeds it from the same committed slice (§2).

**Data:** 2,764 games · 5,480 players · 19,521 player-seasons · 320 team-seasons · 32 teams · 25 champions.

**Verified real values** — exact, not approximate. Use them as acceptance checks:

| Season | Team | Record | PF | PA | Differential |
|---|---|---|---|---|---|
| 2024 | DET | 15-2 | 564 | 342 | **+222** (power 72.8) |
| 2023 | SF | 12-5 | 491 | 298 | **+193** |
| 2020 | JAX | 1-15 | 306 | 492 | **−186** |

2024 week 15: **16 games, 2 featured**, first by kickoff is Rams 12 at 49ers 6 (line SF -3). Featured #1 is BUF at DET 48–42, banner `#0076B6`.

`current_week` is **17 for 2016–2020, 18 for 2021–2025** — the NFL's 16→17-game expansion. If a change makes these uniform, something regressed.

Two more, useful because they are the ones that catch a page reading the wrong *season* rather than the wrong number. Kirk Cousins `00-0029604` changed teams twice inside the backfill — **WAS 2016–17, MIN 2018–23, ATL 2024–25** — with a different games count and a different `seasons_played` ordinal every year, which is why he is the fixture for the player page's season handling. Aaron Rodgers `00-0023459` is the human-readable version: **2023 NYJ, 1 game** (the torn Achilles), **2024 NYJ, 17 games**, **2025 PIT, 16 games**.

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

## 3. START HERE — the plan is built; what remains is review

M6 is merged and `./scripts/verification-gate.sh` passes, so **every task in the plan is now built**. The next work is the 5.3–5.8 review (§3 "Then"), not more construction.

**Do not re-derive §3 of the previous handover — its two named bugs were the visible tips of five and three respectively.** What that section got wrong is kept below, because the pattern (a shell fix that unmasks per-screen bugs; a token failure that is really a scale-wide one) is the reusable part.

### What 6.2 turned out to be

| Spec | Covers | Status |
|---|---|---|
| `frontend/tests/a11y.spec.ts` | axe on all 7 screens | green |
| `frontend/tests/responsive.spec.ts` | 375/768/1360 + the §1.13 nav | green |
| `frontend/tests/keyboard.spec.ts` | focus, roving tabindex, reduced motion | green |
| `frontend/tests/contrast.spec.ts` | **new** — what axe cannot see | green |

**The 375px page scroll was five bugs, not one.** The nav (`min-w-0`, `bc2c7ce`) and the header's right-hand group were the shell layer; fixing the group took 7 failures to 4 and *unmasked* four per-screen causes it had been hiding. Two are worth carrying:

- `minmax(420px, 1fr)` inside `repeat(auto-fit, …)` is a **hard floor**, not a preference — the track cannot go below 420px, so the week screen overflowed a 375px viewport by exactly 69px. `minmax(min(420px, 100%), 1fr)` is the fix, and `player.$playerId.tsx` had the identical expression at 280px (fixed too; latent only because 280 fits).
- **Below `md`, a `grid` whose only explicit tracks are `md:grid-cols-[…]` falls back to a single *implicit* `auto` track, and `auto` floors at min-content.** The `md:` tracks already spelled out `minmax(0, …)`; the one-column case never got it. This bit `history` and `team/$abbr`, and bit `history` twice — once more in a nested inline `display: grid` stack.

**The contrast failure was three failures sharing one token, and axe could only see two.** `--emerald-dark` (#158055) is a DS *fill* the design also spends as small text; at 4.94:1 on white it has no headroom, so every tint under it fails — pill 4.44, filter pill 4.34, **diverging weak-positive cells down to 3.24**. Fixed at source with `--emerald-ink: oklch(0.44 0.1 155)` (`theme.css` §1.9b) for every emerald *text* usage.

> The tell was the scale's own asymmetry: the negative weak ink `--ink-negative-mid` is `oklch(0.45 0.17 25)` and clears everywhere (worst 4.81) because it was chosen as an ink. The positive counterpart never got that treatment.

> **The brief predicted the wrong half.** Step 3 names "the strong end of the diverging scale and every team chip" as most likely to have slipped. Both were already clean (10.92 / 8.77; worst chip 4.62). It was the weak end — the pale tints nobody reads as "coloured cells".

**axe does not check the diverging cells at all.** On standings its `color-contrast` rule returned 0 violations, 0 passes *and* 0 incomplete for all 32 cells — it never evaluated them. `contrast.spec.ts` measures rendered pixels through a canvas instead (the tokens are `oklch`; the browser is the only authority on how they land in sRGB). Proven to bite by reverting the token: 5 of 32 cells fail — a narrow band, which is why it hid.

### Two things that were false and cost real time

1. **The previous handover said `keyboard.spec.ts` was passing. It was not** — two of its tests failed on CI, and one of those had *never actually run*: `test.use({ reducedMotion: "reduce" })` did not reach the page (`matchMedia(...).matches` read `false` inside the test body), so it measured an un-emulated browser and read 0.12s as correct. With `page.emulateMedia` it immediately caught `leader-bar.tsx` still animating at 0.18s — an **inline** `transition`, which no normal-weight `*` rule can override.
2. **I first added `!important` to the reduced-motion reset for the wrong reason** — I assumed `*` was losing on *specificity* to Tailwind's `duration-[120ms]`. Reverting and re-measuring showed still 0s: `theme.css` is unlayered and Tailwind v4's utilities are in `@layer utilities`, so unlayered normal declarations already beat them. Only the inline case ever needed it. **Re-measure before writing the comment** — it would have been confidently wrong in the file forever.

### The browser suite had been testing seven empty states

CI builds the Playwright stack with `docker compose down -v` + `prestart.sh`, which migrates an empty volume and creates the superuser. Nothing else. So:

- the roving-tabindex check timed out for 30s waiting on a grid with no cells;
- the week screen's `CardRail` was never scanned, hiding a scroll region no keyboard could reach (`tabIndex={0}` now);
- no `DiffCell` ever rendered, so the whole positive half of the diverging scale went unmeasured;
- the pill's contrast failure arrived as a **race** — four screens caught it mid-`"Checking…"` (emerald) and three saw it resolve to `stale` (warning, 11.36:1), on the same run.

`backend/tests/seed_e2e.py` now loads the same committed slice `conftest.py` uses, called from the workflow **on the runner** (the backend image ships `app/` and `scripts/` but deliberately not `tests/`; compose publishes the DB on 5434). This is the second time this project has paid for a suite coupled to ambient database state — §5 pattern 1.

### A passing spec is not a look

`responsive.spec.ts` was green on two screens that were visibly broken at 375px, because "the page did not widen" and "the card is readable" are different claims. Screenshots caught both:

- **The leader card rendered its readouts on top of the player's name.** Relaxing its grid to `minmax(0, 1fr)` stopped the overflow and then let the `auto` readouts column keep its max-content width and crush the name column to nothing. It is a wrapping flex row now — `flex: "1 1 220px"` on the middle child uses the old 220 as a *basis* rather than a floor, so the readouts drop to their own line on a phone and sit hard right on desktop.
- **The featured card clipped its own score.** Freeing the grid from its 420px floor made the card 327px, and the banner's ~335px of content pushed `48–42` 14px past the rounded corner, where it was clipped rather than overflowing the page.

**Look at the screens after a layout fix.** A fix that removes an overflow can move the damage *inside* the element instead of removing it, and the spec only knows the page did not widen. All seven are verified by screenshot at 375px now.

### The defect found while looking — fixed on PR #13

**`GET /players/{player_id}` took no `season` parameter.** The frontend sent `?season=2024`; the route ignored it and built the whole page from `stats[-1]`, the player's *last ingested* season — team chip, team name, position, games, the ordinal and all three rate cards. So `/player?season=2024` showed Aaron Rodgers on Pittsburgh, the team he joined in **2025**, beneath a season-scoped picker reading "Aaron Rodgers · NYJ". The season selector did nothing at all on that screen.

Fixed on `fix/player-season` (**PR #13**): `season` is an optional query parameter, the page focuses that row, and the rate cards' positional pool is keyed to it. A season the player has no row for falls back to their latest rather than 404ing, because `player.$playerId.tsx` asks for that explicitly. `season` is in the frontend query **key** as well as the request — without it the first season's response is served from cache and the page never refetches.

`is_latest` still means the player's most recent season, not the focused one; the season table is a career view and its highlight is documented as "the most recent completed season". Whether it should follow the focus is a design call, deliberately left open.

**Checked for siblings: there are none.** Every other data route — explorer, leaders, standings, `team_page`, `week`, `meta/freshness` — takes `season` explicitly, and `history/champions` is all-time by design. `player_page` was the only one missing it.

### Then

1. ~~**Merge PR #12.**~~ **DONE** — squash-merged as `f24472d`. M6 and the plan are complete.
2. **Merge PR #13**, then: **five screens (5.3–5.8) shipped unreviewed.** This is the whole of the remaining work. Review has found a real defect in *every* screen it was run on, including a Critical, and the player-season bug above is what one screenshot of one screen turned up — so the expected yield is high. Commit ranges are in the ledger.

   What has made these reviews worth their cost, stated as instructions to give: **recompute, don't read** (reimplement the spec independently and diff the outputs — that is how the upset-filter divergence and the Z→A sort bug were both found); **verify against the live database, not fixtures**; **state acceptance checks against the default URL**, grouping and sorting included; and **ask what the tests do *not* cover**, consistently the most valuable section. Add the two this session earned: **look at the screen at 375px**, and **check that any label agrees with the value beside it** — that single check would have caught the player-season bug, the `qualifier_label` defect, the hard-coded freshness pill and the per-position `Y/A` unit, which is four of this project's defects from one question.
3. ~~Record the remaining brief corrections in the plan's §1.~~ **DONE** — all six are now §1.17 (the `_layout` route path, the upset filter, `TrendLine`'s x-index, the per-position `Y/A` unit, 5.7's missing `division` field, 5.8's self-contradicting decade counts). 6.2's own are §1.15 and §1.16, plus a correction appended to §1.13.

## 4. Decisions — all resolved

**① The upset filter diverges from its brief, deliberately — CONFIRMED, keep it.** Task 5.2's brief defines `upset` as "games the road team won" (copying the mockup's `g[2] > g[4]`); the pill is labelled **"Underdog won"**. On invented data those coincide. On the real backfill they do not — 2024 week 15 had **11 road wins but only 4 upsets**, because **7 of those road wins were by the favourite** (led by Ravens at NYG -16.5). Labelling those "Underdog won" states something false, so `filterSlate` asks whether the **closing favourite lost**. `spread_line` is home-relative and populated on all 2,764 games. **The plan's §1 should record this as a corrected brief**, and 5.3–5.8 should assume the same standard: a filter means what its label says, not what the mockup's sample data made convenient.

> **The numbers above were backwards until `7c2314e`, and so was the code.** As first written this section claimed 12 upsets and named Rams-at-SF, Cowboys-at-CAR, Bills-at-DET and Bucs-at-LAC as *road wins by the favourite*. They are the exact opposite: they are the week's only four upsets, road teams beating home favourites. The cause was one inverted comparison — `favouriteLost` read `spread_line < 0` as "home favoured" when **positive means home favoured** (nflverse; see `_format.py::line_label`, which had it right all along). The pill therefore listed the games the *favourite* won. Fixed, with the sign now pinned to the API's own `line_label` by test. **Sanity check for anyone touching this field:** over the 2,757 played games carrying a line, the home team wins **67.1%** when `spread_line > 0` and **34.7%** when it is negative.

**② `recap` is null for every real game — DECIDED: keep as built.** Three prose surfaces render as em-dashes: the game card's sentence, the slate table's *widest* column ("What happened", `minmax(220,1.4fr)`), and the featured note (which omits its paragraph rather than showing a dash). Plan §2 line 284 calls this a deliberate empty state — "populate it later" — and it stays that way, holding the designed layout so nothing shifts when recaps land. **Do not "tidy" this column away** in a later pass; it is a chosen empty state, not an oversight.

**~~③ Neither screen has route-level tests.~~ — CLOSED (`60a2546`).** 17 route-level tests now cover both screens through the **real generated route tree**: the sort→ungroup rule, Team opening A→Z, URL round-trips in both directions, the query keys (season/conference refetch; sort, grouping and slate do not), `powerMin`/`powerMax` being sourced pre-sort, and the slate filter over a fixture built from real 2024 wk15 rows including BAL at NYG -16.5. The harness is `routes/-route-harness.tsx`; **5.3–5.8 should each add route tests as they land** rather than deferring again. Note `vitest.setup.ts` now stubs `Element.scrollIntoView` — jsdom has none, and `_layout` calls it on every route change, so without the stub any route-level test gets the error boundary instead of the page.

**④ RESOLVED (`bdb8b16`) — the rank-metric unit said `Y/A` for all four positions.** Fixed at the source: `_metrics.py::UNITS` is now per-position (QB `Y/A`, RB `Y/C`, WR/TE `Y/T`), matching `METRIC_LABELS` beside it, with a backend test over all sixteen position×metric pairs. Decided by the assistant rather than the user, under the standing rule confirmed for §4① — it is one dict and one test if you want it reverted to match the mockup. Original note follows.

> `_metrics.py` serves `UNITS` as one global map (`rate: "Y/A"`), so a leader card's biggest readout is labelled "Y/A (rank metric)" while the metric dropdown right above it says **"Yards per carry"** for a back and **"Yards per target"** for a receiver or tight end. Only QB is right. The mockup has the same global `UNITS`, so this is a faithful port of a mockup shortcut — and the same lying-label class as the `qualifier_label` defect already fixed once. Fixing means making `UNITS` per-position like `METRIC_LABELS` beside it. **Note it also feeds Task 5.6's player rate cards**, so it is cheaper to settle before 5.6 than after.

~~`playoff_seed`~~ — **decided:** badge dropped (`f2cc899`). The API keeps the nullable column; nothing renders it.

**Four `to={... as any}` casts remain** in `frontend/src/routes/_layout.tsx` — team, player, explorer, history. Seven nav items, three real routes. Remove each as its screen lands; an `as any` that outlives its reason hides a real typo.

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
- **`bun run --filter frontend lint` REWRITES YOUR SOURCE.** The script is `biome check --write --unsafe`, and `--unsafe` fixes delete code. It silently removed two of Task 6.2's fixes — `tabIndex={0}` on the card rail (`lint/a11y/noNoninteractiveTabindex`) and `!important` on the reduced-motion reset (`lint/complexity/noImportantStyles`) — leaving behind only the comments explaining them, which then read as lies. Both were verified green *before* the lint step and committed after it, so CI caught what the local run had already proved fixed. **Run lint BEFORE the final verification, never after**, and when a fix is a deliberate rule conflict, pin it with `biome-ignore` (for a JSX attribute the comment goes *inside* the tag, immediately above the attribute; for CSS use `biome-ignore-start`/`-end` inside the block).

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

**M6 in brief (all merged except 6.2).** 6.1 found that the freshness pill had been hard-coded to the mockup's literal `"Final · updated Feb 9"` since Task 2.3 — Task 4.1 built the endpoint and never changed the call site — while every season actually reported `stale`; it also found four screens that could not tell a failed request from an empty result. 6.3 turned out to be mostly already correct (`ingest_season` only stamps `last_ingested_at` on success), so the work was a test proving it plus the nightly schedule, whose season is *derived* because a naive `date +%Y` would ingest a nonexistent season for seven months a year. 6.4 wrote the README (still the template's until then), `CLAUDE.md`, and the workspace row. The plan's verification gate is now `./scripts/verification-gate.sh` and passes — it could not as written, since both its greps matched their own explanatory comments and 19 of 20 bracketed-pixel hits are vendored template code; both exemptions are declared in the script.

**A process note against myself.** During 6.3 I ran `git checkout` on a single file holding uncommitted work and destroyed a fixture I had just written. §7 records that rule for subagents; it applies to whoever is driving. Copy to a `.bak` before probing, and never use `git checkout` as an undo for uncommitted work.
