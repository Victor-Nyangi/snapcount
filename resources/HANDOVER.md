# Snapcount — session handover

**Written:** 2026-08-21 · **`main`:** `05a8201` · **No open PRs. Working tree clean.** M0–M6 are merged, the plan is complete, all nine review findings are closed and all four of the previous handover's open decisions are decided, built and merged (PRs #16, #17).

**There is exactly one action left, and it is not code.** See §0. Everything after it is reference: what was decided and why, and the failure patterns this project has already paid for.

Read this, then `.superpowers/sdd/nfl-implemnentation2/progress.md` (the ledger, ~1500 lines — the authoritative record, and gitignored, so it exists only on this machine). The plan is `resources/nfl-implemnentation2.md`.

---

## 0. THE ONE ACTION LEFT — run the first deploy

**Snapcount has never been deployed.** The path is chosen, the workflow exists, the data-transfer scripts are written and verified end to end. What is missing is three pieces of setup that only the repository owner can do, and one command afterwards.

Full procedure: **`deployment-snapcount.md`**. The short version:

**What only you can do**

1. **Register a self-hosted GitHub Actions runner** on the box. `deploy-docker-compose.yml` is `runs-on: self-hosted`; without a runner the workflow queues forever.
2. **Point DNS at the box** for `${DOMAIN}` *and* `adminer.${DOMAIN}`, before the first run. Traefik requests Let's Encrypt certificates over the TLS challenge, which fails on a name that does not resolve yet.
3. **Set the repository vars and secrets.** Missing ones fail on compose's `:?Variable not set` rather than starting a half-configured stack.

| Variables | Secrets |
|---|---|
| `DOMAIN`, `PROJECT_NAME`, `FIRST_SUPERUSER`, `SMTP_HOST`, `SMTP_USER`, `EMAILS_FROM_EMAIL`, `SENTRY_DSN` | `SECRET_KEY`, `FIRST_SUPERUSER_PASSWORD`, `SMTP_PASSWORD`, `POSTGRES_PASSWORD` |

**Then, in order**

4. Actions → **"Deploy with Docker Compose"** → Run workflow. It is `workflow_dispatch:` only, deliberately — nothing auto-deploys to your box on a push to `main`.
5. **Load the decade**, or the app comes up with seven empty screens (see the trap below):

   ```bash
   ./scripts/dump-backfill.sh backfill.sql.gz        # on this machine, ~420 KB
   # copy it to the box, then there, in the repo dir, with the stack up:
   ./scripts/restore-backfill.sh backfill.sql.gz \
     'postgresql://postgres:THE_POSTGRES_PASSWORD@localhost:5432/app'
   ```

   That URL resolves *inside* the `db` container — the script runs `psql` there for client binaries matching the server — which is why it is `localhost:5432` and not the host's 5434.

6. **Check the app, not the containers.** Log in and confirm: the season picker offers **ten** seasons; the explorer eyebrow reads the full range (it is derived from `/meta/seasons`, so a wrong range means the data did not land); the freshness pill is not "No data ingested yet".

**THE TRAP, and the reason step 5 exists.** `prestart.sh` runs migrations and creates the superuser and **stops there**. `nightly-ingest.sh` only ever ingests the **current** season, by design. So a fresh deploy has a schema, one user and no data — and *waiting does not fix it*; the nightly job will never reach back and backfill 2016–2024. The only alternative to moving the verified data across is running a decade of networked nflverse pulls against production, which is the exact thing CI refuses to do.

The restore prints its own verification, and these are exact:

```
DET 2024 differential | 222
NE titles             | 6
seasons               | 10
games                 | 2761
player-seasons        | 19521
```

It refuses to run against a database that already holds `teamseasonstat` rows — it is a first-deploy tool. Step 5 is not repeated on later deploys; the volume persists.

### Smaller things genuinely open (none blocking)

- **Leaders now says the season year on every row**, where the eyebrow and the picker already say it — redundant on that screen, though correct and consistent with the player page. One line if you want that board to read just `16 g`.
- **Browser judgement calls a spec cannot make** (unchanged, tagged `CARRY TO 6.2`): `font-stretch: 125%` actually rendering; sticky-column diagonal scroll; `position: sticky` + `border-collapse` on Safari — **the suite is chromium-only**, firefox/webkit are commented out in `playwright.config.ts`; Radix `Select` pointer UX; and `LeaderBar`'s baseline marker sitting flush at 0% whenever the baseline is negative (true — everyone shown beat it — but visually flush against the rounded left edge).
- **Six stale local branches** (`feat/m5-*`, `feat/m6-finishing`, `feat/design-system-and-screens`, `pre-rebase-backup-note`). Their remotes are gone via `delete_branch_on_merge`. Git calls them unmerged, but that is the squash-merge artifact — the content landed, the commits were never ancestors. Not verified individually as safe to delete, and one is explicitly a backup.

---

## 1. Where things stand

**The build is done.** M0–M6 all merged. All seven screens ship, the accessibility and responsive pass is enforced by Playwright specs rather than a checklist, and the 5.3–5.8 review is complete with all nine findings fixed.

| Milestone | Status |
|---|---|
| M0 Scaffold · M1 Design system · M2 Shared components | ✅ |
| M3 Data model + ingestion | ✅ real 2016–2025 backfill |
| M4 API · M5 Screens (8/8) · M6 Finishing (4/4) | ✅ |
| **5.3–5.8 review** | ✅ complete — **all 9 findings fixed** (§4) |
| **Deployment** | ❌ **never run — see §0** |

**Tests:** 166 backend · 316 frontend unit · 91 Playwright (a11y, responsive, keyboard, contrast, plus the template's own). Both suites pass **from an empty database** — see §2.

**Verify before trusting anything below:**

```bash
./scripts/verification-gate.sh        # 166 + 316, build, lint, two greps
uv run prek run --all-files           # NOT covered by the gate — see §7
```

**Data:** 2,761 games · 5,480 players · 19,521 player-seasons · 320 team-seasons · 32 teams · 25 champions.

> Earlier versions of this file said 2,764 games. The extra three were the **leaked 2099 sentinel games**, counted as if they were backfill. A leak that lasts long enough gets recorded as data — see failure pattern 12.

**Spot-check values — exact, not approximate.** Use them as acceptance checks:

| Season | Team | Record | PF | PA | Differential |
|---|---|---|---|---|---|
| 2024 | DET | 15-2 | 564 | 342 | **+222** (power 72.8) |
| 2023 | SF | 12-5 | 491 | 298 | **+193** |
| 2020 | JAX | 1-15 | 306 | 492 | **−186** |

Decade totals (the explorer's `total_domain` is the widest of these): **BAL +1046** high, **NYJ −1193** low.

2024 week 15: **16 games, 2 featured**, first by kickoff is Rams 12 at 49ers 6 (line SF -3). Featured #1 is BUF at DET 48–42, banner `#0076B6`. NE has **6** titles, the most.

`current_week` is **17 for 2016–2020, 18 for 2021–2025** (the 16→17-game expansion) and every season runs on to **week 21 or 22** — the playoffs are weeks too. If a change makes either uniform, something regressed.

**Players whose team moved inside the backfill**, which is what catches a screen reading the wrong *season* rather than the wrong number: Kirk Cousins `00-0029604` (WAS 2016–17, MIN 2018–23, ATL 2024–25 — a different games count every year, so nothing passes by coincidence) and Aaron Rodgers `00-0023459` (2023 NYJ **1 g** — the torn Achilles; 2024 NYJ 17 g; 2025 PIT 16 g).

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

**The browser suite needed the same treatment, and got it late.** The Playwright job runs the same `docker compose down -v` + `prestart.sh`, but had no equivalent of `_ensure_reference_data` — so it rendered seven empty states and several of Task 6.2's checks were vacuous there. `backend/tests/seed_e2e.py` is that equivalent: the same `load_backfill`, called from the workflow **on the runner** rather than in the container, because the backend image ships `app/` and `scripts/` but deliberately not `tests/`. Compose publishes the database on 5434 and `.env.example`'s `DATABASE_URL` already points there, which is the same path `test-backend` has always used.

**To reproduce CI locally, never `alembic downgrade base`** — that destroys the backfill and costs a decade-long re-ingest. Point `DATABASE_URL` at a scratch database on the same Postgres instance, migrate it, run pytest. That reproduced CI's exact failure in 14 seconds and gave a fast fix loop. (The same trick is how the deploy restore was verified without touching the dev database.)

---

## 3. The four decisions — decided, built, merged (PR #16)

Kept because each records *why*, and the why is not in the diff.

### A. Hosting — Docker Compose on our own box · `d822c3d`

The choice turned on the nightly ingest: it is an `ingest-scheduler` **container**, so it works as designed on Compose and would have nowhere to run on FastAPI Cloud — that path needs the schedule re-homed to a GitHub Actions `schedule:` before it can keep a season current. `deploy.yml` (FastAPI Cloud) is left in place and unused; its `push:` trigger is on `master` against a `main` default branch, so it would never fire on its own.

**The hosting question was the small half.** Neither path answers how production gets its data — that is §0's trap, and why `dump-backfill.sh` / `restore-backfill.sh` exist. Data only (alembic owns the schema), excluding `user` (a dev password hash is a credential leak with a long half-life), `alembic_version` and `ingestrun`, keeping `Season.last_ingested_at` because that is what the freshness pill reads.

The dump loop is **per-table in dependency order**, not one `pg_dump` with eight `--table` flags: pg_dump emits tables in *name* order and does not sort by foreign key, so a single command loads `champion` and `game` before the `team`/`season` rows they reference. Verified end to end — dump → scratch DB → `alembic upgrade head` → restore → DET +222 — plus the refusal path.

### B. "Nth season" showed our backfill window, not a career · `7be5baf`

`seasons_played` counts the seasons *this database holds*. Tom Brady in 2017 read "2nd season"; Cousins in 2018 read "3rd" and was in his seventh. Nothing stores a rookie year, so the ordinal could not be corrected — only replaced. Both the leader card and the player header name the season year now.

`ordinal()` had no other caller and is deleted. The column and its ingest stay — the count is not wrong, only the word "season" around it — and `ingest/players.py` records that nothing renders it and that a real career length needs a new **source column**, not a row count.

### C. Explorer total column saturated · `538c10a`

`domain * 4` = 600 against decade totals spanning −1193..1046 pinned **9 of 32 teams** to full colour; NYJ (−1193) and CLE (−751) rendered identically. `total_domain` is now computed **server-side** from the returned rows, like every other derived value — the client had been inventing a scale. Measured before and after: 9 saturated → 1, strong ink 20 → 9.

### D. Explorer season range was hard-coded · `e0d11ee` + `538c10a`

Two commits, because the blocker was real. `tests/ingest/test_games.py` had been committing three fabricated 2099 games and their `Season` row into the dev database on **every** `pytest` run, for months — it has to commit (the recap test proves an editorial value survives a re-ingest) but never cleaned up. Reproduced before fixing: delete the rows, run that one file, they come back. That is what turned "delete the leaked row" into "the source is a missing teardown". `purge_season` now lives in the ingest package conftest beside `isolated_db`, with `purge_players` for `Player` rows, which have no season column and survive any season-scoped delete.

With 2099 gone, the range comes from `/meta/seasons` under the **same query key as the shell's season picker**, so it costs no extra request. The request is held until the range is known — firing on the fallback first would mean two requests and an eyebrow that visibly corrects itself. The old constants remain as the fallback: ten known seasons beat an empty screen when the only thing that failed is the range.

---

## 4. The 5.3–5.8 review — all 9 findings fixed

Method: **combined per screen** — recompute the spec against the live database *and* render the screen — then report everything and fix on the user's call. Both halves earned their keep: the recompute found findings 4 and 7, the render found 1, 2 and 5. Neither half alone would have found the other's.

1–3 in `74051aa`, 4/5/8 in `af75bf5`, 6/7/9 in PR #16. The table is the evidence trail: each row records what was measured, so a future change can be checked against it rather than re-derived.

| # | Sev | Finding |
|---|---|---|
| 1 | **High** · ✅ `74051aa` | **7 of 10 seasons unreachable from the UI.** `SEASON_OPTIONS` hard-coded `[2025, 2024, 2023]`; `/meta/seasons` reports all ten. `?season=2017` rendered 2017 data with a **blank Season control**. |
| 2 | **High** · ✅ `74051aa` | **The whole postseason unreachable, every Super Bowl included.** `WEEK_OPTIONS` was `1..18`; games run to week 21 (2016–20) / 22 (2021–25) and the schema already allowed `.max(22)`. |
| 3 | **High** · ✅ `74051aa` | **Player rate-card bars scaled to unqualified outliers.** `scale_max` was an unfiltered max, so a 1-target receiver set a 69.0 y/t scale. The best qualified WR by EPA filled **9.6%** of his bar; Rodgers' 2024 EPA bar **0.8%**. Fixed as `max(qualified_max, this_player_value)`, preserving the stated intent. |
| 4 | Medium · ✅ `af75bf5` | **Leaders: ties got different ranks and one was silently dropped at the cutoff.** 2017 QB TDs: three at 28 → ranks 4, 5, and at Top 5 one vanished. **68 such cases.** `sort()` is stable over a `select()` with **no `ORDER BY`**, so the tiebreak was not reproducible. **The explorer already did this correctly** — look for the right answer inside the repo before inventing one. |
| 5 | Medium · ✅ `af75bf5` | **Team page caption hard-coded "the 17-game season".** The NFL played 16 games 2016–2020 — wrong on **160 team-seasons**. |
| 6 | Medium · ✅ `7be5baf` | **"Nth season" meant "in our backfill", not career.** See §3 B. |
| 7 | Low · ✅ `538c10a` | **Explorer total column saturated** for the teams a decade view most invites you to compare. See §3 C. |
| 8 | Low · ✅ `af75bf5` | **History "most titles" dropped a tied team.** Five franchises hold 2; the cut at 6 dropped TB on alphabetical order from a row headed "most titles". |
| 9 | Low · ✅ `538c10a` | **Explorer's season range hard-coded** `2016/2025`. See §3 D. |

**1 and 2 were one component and one fix** — `season-week-picker.tsx` sourcing both lists from `/meta/seasons`. `week_count` could not serve: it is a stored constant of 18, so `SeasonSummary` gained a derived `max_week`. Playoff round names are **derived, not fixed per number**: week 18 is the wild card round in 2019 and an ordinary Sunday in 2024.

**Verified clean — recomputed independently, exact match:** leaders (every baseline and board, 4 positions × 4 metrics, per-position units, precision 3/0/0/1); TrendLine (DET 2019 ends at y=126.0 from a −82 cumulative; interior nulls correct); team page (17 rows, playoffs excluded, record recomputed to 15-2, cumulative lands on +222, **ties render correctly** — 2019 DET 3-12-1); explorer (all 32 × 10 cells, competition ranking on ties, URL round-trip); history (25 champions, decades 10/10/5, NE 6).

**Correction to an earlier ledger claim:** local deep links are NOT broken. The SPA fallback is `Accept`-header driven — a browser gets `200` + the app; `curl`'s default `*/*` gets a JSON 404. That tripped up one session's diagnosis.

---

## 5. Older decisions — all resolved, kept so they are not relitigated

**① The upset filter diverges from its brief, deliberately — keep it.** Task 5.2's brief defines `upset` as "games the road team won" (copying the mockup); the pill is labelled **"Underdog won"**. On invented data those coincide; on the real backfill they do not — 2024 week 15 had **11 road wins but only 4 upsets**, because 7 road wins were by the favourite. `filterSlate` asks whether the **closing favourite lost**. A filter means what its label says, not what the mockup's sample data made convenient.

> **The numbers were backwards until `7c2314e`, and so was the code.** One inverted comparison: `favouriteLost` read `spread_line < 0` as "home favoured" when **positive means home favoured** (see `_format.py::line_label`, right all along). Both sides of a `!==` were flipped consistently, so every test passed and the reviewer's own SQL reproduced the same wrong answer. **Sanity check:** over the 2,757 played games carrying a line, the home team wins **67.1%** when `spread_line > 0` and **34.7%** when negative.

**② `recap` is null for every real game — keep as built.** Three prose surfaces render as em-dashes, including the slate table's *widest* column ("What happened", `minmax(220,1.4fr)`). Plan §2 calls this a deliberate empty state, holding the designed layout so nothing shifts when recaps land. **Do not "tidy" this column away.**

**③ Route-level tests — CLOSED (`60a2546`).** They go through the **real generated route tree** (`routes/-route-harness.tsx`), so a screen that stops inheriting the layout schema, or lands at the wrong path, fails. Note `vitest.setup.ts` stubs `Element.scrollIntoView` — jsdom has none and `_layout` calls it on every route change, so without the stub any route-level test gets the error boundary instead of the page.

**④ The rank-metric unit said `Y/A` for all four positions — CLOSED (`bdb8b16`).** `_metrics.py::UNITS` is per-position now (QB `Y/A`, RB `Y/C`, WR/TE `Y/T`), matching `METRIC_LABELS` beside it, with a test over all sixteen position×metric pairs.

**`playoff_seed`** — badge dropped (`f2cc899`). The API keeps the nullable column; nothing renders it.

**`to={... as any}` casts** — all gone as of 5.8; `NAV_ITEMS` is typed against the router's own path literals, so a typo in a nav path is a build error rather than a 404 nobody clicks.

---

## 6. Failure patterns this project has already paid for

Each cost at least one fix round. Expect them again.

1. **Tests coupled to ambient database state.** Fixtures at `season=2025` wrote into the real backfill; API tests assumed a decade of ingested data; a freshness test assumed someone had backfilled within 24 hours. Sentinel seasons **2081–2099** are the convention. **Every instance was first diagnosed as "one missing call" and every one turned out broader** — measure the blast radius against an empty database before believing a scope estimate.
2. **Narrow test data manufacturing confidence.** `/players/{id}` 500'd for the *majority of real roster positions*, surviving a full review and 146 tests because the only fixture was a quarterback. Same shape as the "T1" tie streak rendering in the loss colour: the fixture had only W and L.
3. **The mockup's shortcuts are invisible until real data lands.** Its data is fictional, so two-way `win ? … : …` ternaries, "road win = underdog win" and hard-coded `#fff` banner text all look correct there and are all wrong here. **Ask what the real column can hold that its sample never did** — null, tied, negative, unplayed, light-coloured.
4. **Fixes introducing new bugs.** `current_week` was reset to 1 by every ingest because a fix shared a helper with a caller whose rows lacked `game_type`. Caught only because a reviewer checked commit *timestamps* and realised the correct-looking data **predated the code being merged**.
5. **Container swaps dropping affordances.** Replacing `AppSidebar` with the top nav silently removed the only logout control. Two code reviews passed; only e2e caught it. **Enumerate what a container *provided*, not what it looked like.**
6. **Autogenerated migrations being wrong.** Twice: naive timestamps, and `None` constraint names that would have broken `downgrade()`. **Always read the migration before applying it.**
7. **A sign convention assumed rather than looked up.** See §5 ①. **When a field carries a sign or a direction, find the code that already interprets it and agree with that, then sanity-check against an aggregate.** A unit test written from the same assumption as the code settles nothing.
8. **A shared mark that has never met real data.** `LeaderBar` shipped in M2, passed review, and sat unrendered until 5.3 — where its `value / top` scaling turned out to assume nothing is ever negative. Same shape as `DiffCell`'s ASCII hyphen. **A component's review only covers the data its author imagined; the screen that first renders it is where it is really tested.**
9. **A test that passes without running.** `test.use({ reducedMotion: "reduce" })` silently did not reach the page, so the spec measured an un-emulated browser for as long as it existed. **When a test depends on an emulated or injected condition, assert the condition took hold** before asserting anything about it.
10. **Writing the comment before re-measuring.** Twice. `!important` on the reduced-motion reset was explained as a specificity loss to Tailwind; reverting showed the class case was already fine and only *inline* styles needed it. And `deployment-snapcount.md` nearly shipped the claim that an empty `INGEST_AT_HOUR_UTC` would defeat compose's `${VAR:-9}` fallback — it does not; `:-` falls back on **empty as well as unset**, and `INGEST_AT_HOUR_UTC= docker compose config` resolves it to `"9"`. Both fixes worked, so nothing would ever have failed; the files would simply have carried confident, wrong explanations forever. **A comment asserting a cause is a claim — measure it like one.**
11. **The brief being wrong.** Eleven tasks improved because an implementer pushed back. Wrong so far: spot-check values, a contrast ratio, a dark-mode variant's semantics, a test expectation forcing `+` onto every numeric column, **the route path for every screen** (§7), an acceptance check naming a row order the default view does not produce, and the upset-filter definition.
12. **A leak that lasts long enough gets recorded as data.** The 2099 sentinel rows were counted in this file's own game total for months — "2,764 games" was 2,761 real ones plus three fabricated. **A number in a document is not evidence; the query that produced it is.** Corollary now enforced by `tests/ingest/conftest.py`: a season ≥ 2081 appearing in `SELECT year FROM season` is a bug report, not a curiosity.
13. **A symptom on every screen at once names the layer, not the count.** Seven screens overflowing identically correctly said "shell" — and after the shell was fixed, four screens still overflowed for four *different* reasons. **The shared cause being real does not mean it is the only one.**
14. **A passing spec is not a look.** `responsive.spec.ts` was green on two visibly broken cards — the leader card was painting its readouts on top of the player's name. **Screenshot the screens after any visual change.** This is also how finding 7's fix was actually confirmed; the unit test only proves two cells differ.
15. **axe is necessary, not sufficient.** Its `color-contrast` rule returned 0 violations, 0 passes *and* 0 incomplete for all 32 diverging cells on standings — it never evaluated them. `tests/contrast.spec.ts` measures rendered pixels through a canvas for exactly this reason.

---

## 7. Environment gotchas

- **`bun` is NOT on `$PATH`.** Prefix every shell command: `export PATH="$HOME/.bun/bin:$PATH"`.
- **Bun workspace monorepo.** Run frontend scripts from the **repo root**: `bun run --filter frontend <script>`.
- **Screens live at `routes/_layout/<name>.tsx`**, not `routes/<name>.tsx` as every task brief says — TanStack's file routing needs the `_layout` folder for the screen to inherit the shell and the season/week search schema.
- **A brand-new route needs two builds.** `build` is `tsc && vite build` and only the *vite* step regenerates `routeTree.gen.ts`, so the first typecheck after adding a route file fails against a stale tree. Run `bunx vite build` once from `frontend/` first.
- **`test` is Playwright; `test:unit` is vitest.** `test` needs a stack but IS runnable locally and worth it — CI rounds cost ~4 minutes and the loop below is ~8 seconds:
  1. `docker compose up -d db` (the dev volume holds the decade backfill — **never** `down -v`).
  2. Backend on :8000. `app/main.py` serves the built SPA from `backend/app/frontend`, so `cd frontend && bunx vite build` (~1s) is the edit-reload loop. **`frontend/.env` bakes in `VITE_API_URL=http://localhost:8000`**, so the browser talks to :8000 regardless of which port you serve the page on — run the API there, not elsewhere.
  3. `PLAYWRIGHT_BASE_URL=http://localhost:8000 bunx playwright test` from `frontend/`.
  - **`vite dev` cannot run here** — ENOSPC, the inotify watch limit is exhausted. Hence building rather than serving.
  - **Running `pytest` deletes every `user` row** (`conftest.py` does `delete(User)` at session teardown). So after the gate, `auth.setup.ts` fails with a 400 and every Playwright spec cascades from it. `cd backend && uv run python -m app.initial_data` puts the superuser back (additive, idempotent). Expect to need it after **every** gate run; the failure looks nothing like its cause.
  - `reset-password.spec.ts` (2 tests) needs mailcatcher on :1080 and fails locally without it. Environmental — it passes in CI.
- **PostgreSQL is on host port 5434**, not 5432 (another project owns that).
- **`./scripts/verification-gate.sh` IS NOT CI.** It does not run `ruff format`, which is a pre-commit hook — a green gate once shipped an unformatted branch. Run **`uv run prek run --all-files`** alongside it.
- **`bun run --filter frontend lint` REWRITES YOUR SOURCE.** The script is `biome check --write --unsafe`, and `--unsafe` fixes delete code — it silently removed two of Task 6.2's fixes, leaving only the comments explaining them, which then read as lies. **Run lint BEFORE the final verification, never after**, and pin deliberate rule conflicts with `biome-ignore`. Note `scripts/generate-client.sh` runs this lint as its last step, so regenerating the client is also a formatter pass.
- **The pre-push order that works:** `prek run --all-files` → `bun run --filter frontend lint` → `./scripts/verification-gate.sh` → Playwright. Never the reverse. Formatters rewrite source, so running them after verifying is how their changes reach CI unverified.
- **`mypy` and `ty` only read config from their own working directory.** `backend/pyproject.toml` holds both; run them from `backend/` or `strict` silently vanishes. The pre-commit hooks `cd backend` themselves.
- **`_typos.toml` fully overrides `[tool.typos]` in `pyproject.toml`** — the hook never reads pyproject. Add exemptions to `_typos.toml`. (It reads a plural `S` glued onto `TABLE` as a misspelling, so pluralise SQL keywords with a following noun rather than a suffix — this sentence had to be reworded twice to get past it.)
- **jsdom normalises colours to `rgb(r, g, b)`** in `style.color` assertions, so comparing against a hex constant fails — `featured-card.test.tsx` has an `asRgb` helper. It *does* preserve `oklch(...)` strings verbatim, which is how the explorer's saturation test asserts.
- **The TS lib target is below es2022** — `Array.prototype.at()` fails the build. Index instead.
- **Sentinel-season registry** (`tests/api/conftest.py`): 2081 unplayed game · 2082 stale · 2083 fresh · 2084 partial team schedule · 2085 featured recap · 2086/2087 explorer present-vs-missing · 2088 failed ingest · 2089 explorer empty range (deliberately has no fixture). Ingest owns 2095–2099. `tests.fixtures.generate` filters seasons ≥ 2081 out of the slice.
- **`.env` is gitignored and holds real secrets.** Never print it, never commit it. Note `docker compose config` resolves and prints `POSTGRES_PASSWORD` — don't paste its output.
- **Backfill dumps (`*.sql.gz`) are gitignored.** Generate on demand.
- **`delete_branch_on_merge` is on** — after a merge the remote branch vanishes, so the next push needs plain `-u`, not `--force-with-lease`.
- **The merge strategy varies; never assume it.** Two branches were squash-merged (a plain `git rebase origin/main` conflicts hard afterwards — use `git rebase --onto origin/main <last-squashed-commit>`); PR #16 was **rebase**-merged, keeping five commits and rewriting every SHA. Two consequences: check `git log` before choosing a rebase base, and **a SHA quoted inside a commit message may not exist on `main`**. PR #16's bodies cite pre-rebase SHAs; the mapping is `c250fae`→`e0d11ee`, `1b3a3cf`→`538c10a`, `c5f8fb8`→`7be5baf`, `34d1631`→`d822c3d`, `8029340`→`56cd41f`. This file quotes the merged ones.
- **Account-level session limits killed 5 of ~16 implementer dispatches.** What worked: **commit after each module goes green**, and keep dispatches small.

---

## 8. Process

The plan intends `superpowers:subagent-driven-development` — one implementer per task → review → fix rounds → scoped re-review.

```bash
SDD=~/.claude/plugins/cache/claude-plugins-official/superpowers/6.2.0/skills/subagent-driven-development/scripts
$SDD/task-brief     resources/nfl-implemnentation2.md 5.3       # extract a task brief
$SDD/review-package resources/nfl-implemnentation2.md BASE HEAD # build a review diff
```

Recent sessions ran inline rather than dispatched, because the harness was configured not to spawn subagents unless asked. Inline works and applies the same rigour; it costs context.

**What has made reviews valuable** — ask for these explicitly:

- **Recompute, don't read.** The best reviews reimplemented the spec independently and diffed outputs. This is how the upset-filter divergence, the Z→A sort bug and the explorer saturation were all found.
- **Prove the test bites.** Break the fix, confirm the test fails, restore. Caught tests that would have passed for the wrong reason, including twice in tests just written and believed.
- **Reproduce before fixing.** The 2099 leak was framed in this file as "delete the leaked row". Deleting it and re-running one test file showed the source was a missing teardown — the difference between fixing it once and fixing it.
- **Verify against the live database**, not fixtures, and state acceptance checks against the **default URL**, grouping and sorting included.
- **Ask what the tests do *not* cover** — consistently the most valuable section.

**Two rules each violated once, expensively:** never `git add -A` while a subagent is running (it swept an implementer's files into my commit), and never run tree-wide `git checkout` / `restore` / `stash` (one reverted uncommitted plan edits; during 6.3 I ran `git checkout` on a single file holding uncommitted work and destroyed a fixture I had just written). **Copy to a `.bak` before probing, and never use `git checkout` as an undo for uncommitted work.**

The plan is **corrected as errors are found** — its §1 records every divergence from the design and why. It is authoritative over the design mockup where they conflict.

---

## 9. Orientation for a cold start

**What this project is.** An NFL analysis platform: ten seasons of real nflverse data behind seven screens. FastAPI + SQLModel + PostgreSQL; React 19 + Vite + TanStack Router/Query, served by the same FastAPI app in production. Built from the `full-stack-fast` template, so anything in `components/ui/` or `components/Common/` is vendored and not ours.

**Read in this order:** this file → `CLAUDE.md` (conventions the code does not state) → the ledger → `resources/nfl-implemnentation2.md` (§1 divergences, §2 what was deliberately not built). For the deploy specifically: `deployment-snapcount.md`.

**How the work has been run.** One task at a time, each ending in a commit whose message records what was *found* rather than only what changed; a branch per chunk; a PR with CI green before merge.

**The habits that have actually caught things** — keep them:

1. **Check the brief against real data before coding.** Roughly half the task briefs had an error findable in five minutes against the live API.
2. **Prove the test bites.** Break the behaviour, confirm the test fails, restore.
3. **Verify against the live database, and state acceptance checks against the DEFAULT URL** — the one a user actually lands on.
4. **Get the fast local loop before the second CI round.** ~8 seconds vs ~4 minutes; it is what made it affordable to fix a bug, re-measure, and find the *next* bug hiding behind it.
5. **A symptom on every screen at once names the layer, not the count** (pattern 13).
6. **Formatters rewrite your source, so run them BEFORE you verify** (§7).
7. **Ask what the label claims, then check the value beside it.** The single highest-yield question on this codebase — it has caught the hard-coded freshness pill, `qualifier_label`, the per-position `Y/A` unit, the player page reading the wrong season, the blank season/week controls, the "17-game season" caption, and "Nth season". **Eight defects from one question.**
