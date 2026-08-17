# Snapcount — session handover

**Written:** 2026-08-17 · **Updated:** 2026-08-17 (CI fixed) · **Branch:** `feat/design-system-and-screens` · **Head:** `1df515b` · **52 commits ahead of `main`**

Read this, then `.superpowers/sdd/nfl-implemnentation2/progress.md` (the ledger, ~860 lines — the authoritative record).

---

## 1. CI is GREEN — what it took, and what to keep in mind

**PR #7 is `CLEAN`, all 16 checks pass, coverage 95%.** Resolved in `46c164b`, `0029a27`, `54a370c`, `1df515b`.

The red had **four independent causes**, not one. Only the first was diagnosed in the original handover, and it was under-scoped.

| # | Cause | Fix |
|---|---|---|
| 1 | No test outside `tests/ingest/` called `seed_teams`, so `TeamSeasonStat` inserts hit the team FK on CI's empty DB. The first violation poisoned the session-scoped `db` fixture, cascading one missing row into 13 unrelated errors. | `_ensure_reference_data` in `backend/tests/conftest.py` |
| 2 | **Not diagnosed.** Seeding teams+history only reaches 126/21 — the remaining 21 `tests/api/` cases assert against the real 2016–2025 backfill, which needs a decade of networked nflverse pulls. | An 80 KB committed slice of those same real rows in `backend/tests/fixtures/` |
| 3 | `typos` read the `"nd"` in `_format.ordinal`'s `{1:"st", 2:"nd", 3:"rd"}` as a misspelling of "and". | Scoped ignore-re in `_typos.toml` |
| 4 | `mypy`/`ty` ran from the repo root; **neither tool reads config outside its own cwd**, so `backend/pyproject.toml` was never loaded. `strict` has been inert for the life of the repo, and the nflreadpy override added with the dependency never applied — which is what turned the hook red when nflreadpy landed. | Both hooks `cd backend` first; the 31 surfaced diagnostics cleared with `col()`, removing seven `# type: ignore`s |

**About the fixture slice.** `backend/tests/fixtures/backfill.json.gz` holds 10 seasons, 320 team-seasons, 285 games (2024), 2,008 player-seasons, 1,997 players — all *real* rows. `tests/conftest.py` loads it only when the database has no team-season row, so it is a no-op against the dev database and the data source on CI. **No assertion was rewritten**; DET is still 15-2/+222, NE still has 6 titles. Regenerate after any model change:

```bash
cd backend && uv run python -m tests.fixtures.generate
```

**To reproduce CI locally, do NOT `alembic downgrade base`** — that destroys the backfill and costs a decade re-ingest. Point `DATABASE_URL` at a scratch database on the same instance instead; that reproduced CI's exact 51F/84P/13E in 14 seconds.

**One bonus defect, found while verifying:** `test_freshness_reports_final_for_a_recently_ingested_season` asked 2024 whether it was fresh, and `_STALE_AFTER` is one day — it passed only while someone's backfill was under 24h old. It now owns sentinel season 2083. Watch for this shape: an assertion whose truth decays with the clock.

---

## 2. What exists

| Milestone | Status | Notes |
|---|---|---|
| M0 Scaffold | ✅ | Template cloned, `Item` demo removed, light theme forced |
| M1 Design system | ✅ | Fonts, three-layer tokens, shadcn primitives, diverging scale + WCAG contrast |
| M2 Shared components | ✅ | 5 marks, `StatTable`, app shell with URL-backed season/week |
| M3 Data model + ingestion | ✅ | 9 models, analytics, 25 champions, **real 2016–2025 backfill** |
| M4 API | ✅ | 8 route modules, typed TS client generated |
| **M5 Screens** | **1 of 8** | 5.1 Standings done and reviewed; 5.2–5.8 remain |
| M6 Finishing | ⬜ | 4 tasks; 6.3 partially done (freshness logic landed early in 4.1) |

**Tests:** 147 backend + 98 frontend — and the backend suite now passes from an empty database, not just a backfilled one. **Data:** 2,761 games · 5,480 players · 19,521 player-seasons · 320 team-seasons · 32 teams · 25 champions.

**Verified real values** (use these as acceptance checks — they are exact, not approximate):

| Season | Team | Record | PF | PA | Differential |
|---|---|---|---|---|---|
| 2024 | DET | 15-2 | 564 | 342 | **+222** (power 72.8) |
| 2023 | SF | 12-5 | 491 | 298 | **+193** |
| 2020 | JAX | 1-15 | 306 | 492 | **−186** |

`current_week` is **17 for 2016–2020, 18 for 2021–2025** — correctly reflecting the NFL's 16→17-game expansion. If a change makes these uniform, something regressed.

---

## 3. Immediate next actions, in order

1. ~~Fix the CI seeding defect~~ — **done** (§1). PR #7 is unblocked.
2. ~~Review Task 5.1~~ — **done.** Three defects found and fixed (`b540cb6`, `f2cc899`, `5c6c91c`); everything on the original checklist verified correct. See the ledger entry for the full record.
3. ~~Decide the playoff-seed question~~ — **done** (§4).
4. **Continue M5**: 5.2 Week view → 5.3 Leaders → 5.4 `TrendLine` → 5.5 Team → 5.6 Player → 5.7 Explorer → 5.8 History.

**Carry into 5.2:** the acceptance check for 5.1 ("/standings/2024 renders DET first") was wrong — the default view groups by division, so BUF leads and DET sits at position 21. When setting a live acceptance check, state it against the **default URL**, grouping and sorting included, or it cannot be checked without toggling something first.

---

## 4. Open decisions needing a human call

~~**`playoff_seed` is NULL for all 320 team-seasons.**~~ **Decided:** badge dropped (`f2cc899`). The API keeps the nullable column; nothing renders it. Deriving seeds needs the full NFL tiebreaker ladder — treat that as its own project if it ever comes back.

**Six `to={... as any}` casts remain** in `frontend/src/routes/_layout.tsx` — week, leaders, team, player, explorer, history. (Seven nav items, one real route; the old count of five was wrong.) Remove each as its screen lands — an `as any` that outlives its reason hides a real typo.

**`standings.tsx` has no tests.** Task 5.1's 28 cases all target pure functions. The sort→ungroup rule is an explicit requirement implemented in a handler nothing exercises. `routes/-_layout.test.tsx` shows route-level tests are an established pattern — worth covering when 5.2 lands the same shell.

**Task 6.2's browser backlog.** Roughly a dozen items have been deferred since Task 1.1 because no browser is available: font `font-stretch: 125%` actually rendering, sticky-column diagonal scroll, `position: sticky` + `border-collapse` (historic Safari issue), the 375px nav collapse, reduced-motion suppression, Radix `Select` pointer UX. All are tagged `CARRY TO 6.2` in the ledger.

---

## 5. Failure patterns this project has already paid for

Each cost at least one fix round. Expect them again.

1. **Tests coupled to ambient database state.** Fixtures at `season=2025` wrote into the real backfill (3.4); API tests assumed seeded teams *and* a decade of ingested data (§1); a freshness test assumed someone had backfilled within the last 24 hours. Sentinel seasons **2081–2099** are the established convention for fixtures. **Three instances found so far were each diagnosed as "just one missing call" and each turned out to be broader** — measure the blast radius against an empty database before believing a scope estimate.
2. **Narrow test data manufacturing confidence.** `/players/{id}` 500'd for the *majority of real roster positions* — it survived a full review and 146 tests because the only fixture was a quarterback.
3. **Fixes introducing new bugs.** `current_week` was reset to 1 by every ingest because a fix for one bug shared a helper with a caller whose rows lacked `game_type`. Caught only because a reviewer checked commit *timestamps* and realised the correct-looking production data **predated the code being merged**.
4. **Container swaps dropping affordances.** Replacing `AppSidebar` with the top nav silently removed the only logout control. Two code reviews passed; only e2e caught it. **When replacing a container, enumerate what it *provided*, not what it looked like.**
5. **Autogenerated migrations being wrong.** Twice: naive timestamps, and `None` constraint names that would have broken `downgrade()`. **Always read the migration before applying it.**
6. **The brief being wrong.** Ten tasks improved because an implementer pushed back. Spot-check values, a contrast ratio, a dark-mode variant's semantics, and a test expectation forcing `+` onto every numeric column were all wrong in *my* text.

---

## 6. Environment gotchas

- **`bun` is NOT on `$PATH`.** Prefix every shell command: `export PATH="$HOME/.bun/bin:$PATH"`.
- **Bun workspace monorepo.** Run frontend scripts from the **repo root**: `bun run --filter frontend <script>`.
- **`test` is Playwright; `test:unit` is vitest.** Never run `test` locally — it needs the full compose stack and browsers.
- **PostgreSQL is on host port 5434**, not 5432 (another project owns that). Started via `docker compose up -d db`.
- **`mypy` and `ty` only read config from their own working directory.** `backend/pyproject.toml` holds both; run them from `backend/`, never from the root, or `strict` and the nflreadpy override silently vanish. The pre-commit hooks now `cd backend` themselves.
- **`_typos.toml` overrides `[tool.typos]` in `pyproject.toml` completely** — the hook does not read pyproject at all. `_typos.toml` is a strict superset; add new exemptions there.
- **The dev database has sentinel season 2099 leaked into it** from an ingest test that commits for real. `tests.fixtures.generate` filters seasons ≥ 2081 out of the slice for exactly this reason.
- **`.env` is gitignored and holds real secrets.** Never print it, never commit it.
- **Account-level session limits killed 5 of ~16 implementer dispatches.** Mitigations that worked every time: **commit after each module goes green**, and keep dispatches small (3 modules, not 8).
- **`delete_branch_on_merge` is on** — after a merge the remote branch vanishes, so the next push needs plain `-u`, not `--force-with-lease`.
- **The branch was squash-merged twice.** A plain `git rebase origin/main` conflicts hard; use `git rebase --onto origin/main <last-squashed-commit>`.

---

## 7. Process

Execution follows `superpowers:subagent-driven-development`: one implementer per task → review → fix rounds → scoped re-review.

```bash
SDD=~/.claude/plugins/cache/claude-plugins-official/superpowers/6.2.0/skills/subagent-driven-development/scripts
$SDD/task-brief     resources/nfl-implemnentation2.md 5.2       # extract a task brief
$SDD/review-package resources/nfl-implemnentation2.md BASE HEAD # build a review diff
```

**What has made reviews valuable** — ask for these explicitly:

- **Recompute, don't read.** The best reviews reimplemented the spec independently and diffed outputs.
- **Prove the test bites.** Break the fix, confirm the test fails, restore. This caught a test that would have passed for the wrong reason.
- **Verify against the live database**, not fixtures.
- **Ask what the tests do *not* cover** — consistently the most valuable section.

**Two rules that have each been violated once, expensively:** never `git add -A` while a subagent is running (it swept an implementer's files into my commit), and subagents must never run tree-wide `git checkout` / `restore` / `stash` (one reverted uncommitted plan edits).

The plan (`resources/nfl-implemnentation2.md`) is **corrected as errors are found** — §1 records every divergence from the design and why. It is authoritative over the design mockup where they conflict.
