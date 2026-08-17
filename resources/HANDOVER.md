# Snapcount — session handover

**Written:** 2026-08-17 · **Branch:** `feat/design-system-and-screens` · **Head:** `21a27b2` · **48 commits ahead of `main`**

Read this, then `.superpowers/sdd/nfl-implemnentation2/progress.md` (the ledger, ~810 lines — the authoritative record).

---

## 1. Start here: CI is RED, and the cause is systemic

**PR #7 is `BLOCKED`.** `test-backend` and `pre-commit` fail in CI while **147 backend tests pass locally**. This is not flaky — it is a real defect that local runs cannot see.

**Cause:** CI runs migrations against a **fresh, empty database**. Tests that insert a `TeamSeasonStat` hit:

```
psycopg.errors.ForeignKeyViolation: insert or update on table "teamseasonstat"
violates foreign key constraint "teamseasonstat_team_fkey"
DETAIL:  Key (team)=(LV) is not present in table "team".
```

They pass locally **only because the dev database has the 32 teams seeded** from earlier work.

**Scope — verified by grep:**

| Suite | Files calling `seed_teams` |
|---|---|
| `backend/tests/api/` | **0 of 8** |
| `backend/tests/ingest/` | 2 of 5 (`test_teams.py`, `test_history.py`) |

Every API test written in Task 4.1 depends on ambient database state it never establishes.

**This is the third instance of one pattern** (see §5): tests coupled to database state rather than owning it.

**Fix direction — do not just sprinkle `seed_teams` into eight files.** Prefer a fixture in `backend/tests/conftest.py` that guarantees the reference data every test needs (32 teams; champions/dynasties where relevant), so the guarantee lives in one place. Then verify the way CI does — against an empty database, not the dev one:

```bash
cd backend
uv run alembic downgrade base && uv run alembic upgrade head   # empty DB
uv run pytest -q                                               # must pass from nothing
uv run python -m app.ingest.runner --from 2016 --to 2025       # restore real data afterwards
```

---

## 2. What exists

| Milestone | Status | Notes |
|---|---|---|
| M0 Scaffold | ✅ | Template cloned, `Item` demo removed, light theme forced |
| M1 Design system | ✅ | Fonts, three-layer tokens, shadcn primitives, diverging scale + WCAG contrast |
| M2 Shared components | ✅ | 5 marks, `StatTable`, app shell with URL-backed season/week |
| M3 Data model + ingestion | ✅ | 9 models, analytics, 25 champions, **real 2016–2025 backfill** |
| M4 API | ✅ | 8 route modules, typed TS client generated |
| **M5 Screens** | **1 of 8** | 5.1 Standings done (unreviewed); 5.2–5.8 remain |
| M6 Finishing | ⬜ | 4 tasks; 6.3 partially done (freshness logic landed early in 4.1) |

**Tests:** 147 backend + 91 frontend. **Data:** 2,761 games · 5,480 players · 19,521 player-seasons · 320 team-seasons · 32 teams · 25 champions.

**Verified real values** (use these as acceptance checks — they are exact, not approximate):

| Season | Team | Record | PF | PA | Differential |
|---|---|---|---|---|---|
| 2024 | DET | 15-2 | 564 | 342 | **+222** (power 72.8) |
| 2023 | SF | 12-5 | 491 | 298 | **+193** |
| 2020 | JAX | 1-15 | 306 | 492 | **−186** |

`current_week` is **17 for 2016–2020, 18 for 2021–2025** — correctly reflecting the NFL's 16→17-game expansion. If a change makes these uniform, something regressed.

---

## 3. Immediate next actions, in order

1. **Fix the CI seeding defect** (§1). Nothing else should merge first.
2. **Review Task 5.1** — it is complete and committed but **never reviewed**. Build the package with
   `.../scripts/review-package resources/nfl-implemnentation2.md d6c8f28 21a27b2`.
   Check: plain count columns declare `align: 'right'`; `signed` only on `differential`; sort stays controlled (no `useState`); the `DiffCell` hyphen→U+2212 fix did not disturb its geometry.
3. **Decide the playoff-seed question** (§4).
4. **Continue M5**: 5.2 Week view → 5.3 Leaders → 5.4 `TrendLine` → 5.5 Team → 5.6 Player → 5.7 Explorer → 5.8 History.

---

## 4. Open decisions needing a human call

**`playoff_seed` is NULL for all 320 team-seasons — verified.** The Standings seed badge ("Bye · 1", "Seed 5") is implemented and can never render. Either derive seeds from final standings plus NFL tiebreakers (a real project), or drop the badge. **Do not leave dead UI implying data we never have.**

**Five `to={... as any}` casts remain** in `frontend/src/routes/_layout.tsx`, one per unbuilt route. Remove each as its screen lands — an `as any` that outlives its reason hides a real typo.

**Task 6.2's browser backlog.** Roughly a dozen items have been deferred since Task 1.1 because no browser is available: font `font-stretch: 125%` actually rendering, sticky-column diagonal scroll, `position: sticky` + `border-collapse` (historic Safari issue), the 375px nav collapse, reduced-motion suppression, Radix `Select` pointer UX. All are tagged `CARRY TO 6.2` in the ledger.

---

## 5. Failure patterns this project has already paid for

Each cost at least one fix round. Expect them again.

1. **Tests coupled to ambient database state.** Fixtures at `season=2025` wrote into the real backfill (3.4); API tests assume seeded teams (§1). Sentinel seasons **2081–2099** are the established convention for fixtures.
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
