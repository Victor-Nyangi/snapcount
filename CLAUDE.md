# CLAUDE.md

Guidance for Claude Code working in this repository. Everything here is something the code does not say for itself.

## Commands

`bun` is often not on `$PATH` — prefix with `export PATH="$HOME/.bun/bin:$PATH"`.

```bash
# frontend — a bun workspace, so run from the REPO ROOT, not frontend/
bun run --filter frontend dev
bun run --filter frontend build        # tsc && vite build
bun run --filter frontend lint         # biome
bun run --filter frontend test:unit    # vitest
bun run --filter frontend test         # Playwright — needs the compose stack, do not run casually

# backend — run from backend/, never the repo root (see below)
cd backend && uv run fastapi dev app/main.py
cd backend && uv run pytest
cd backend && uv run pytest -k "freshness"
cd backend && uv run python -m app.ingest.runner --season 2024

./scripts/verification-gate.sh          # the plan's full gate
```

- **PostgreSQL is on host port 5434**, not 5432 — another project owns 5432.
- **`mypy` and `ty` only read config from their own working directory.** `backend/pyproject.toml` holds both, so run them from `backend/`. Run from the root and `strict` silently vanishes. The pre-commit hooks `cd backend` themselves.
- **`_typos.toml` fully overrides `[tool.typos]` in `pyproject.toml`** — the hook never reads pyproject. Add exemptions to `_typos.toml`.
- **A brand-new route needs two builds.** Only the *vite* step regenerates `routeTree.gen.ts`, so the first `tsc` after adding a route file fails against a stale tree. Run `bunx vite build` once from `frontend/` first.

## The three-layer token rule

```
tokens.ds.css    GENERATED — design-system primitives. Do not hand-edit.
tokens.app.css   GENERATED — app-level scale. Do not hand-edit.
theme.css        HAND-MAINTAINED — every divergence lives here, each with a §-numbered comment
                 explaining why, mirroring §1 of the implementation plan.
```

Never introduce a raw colour or a bracketed pixel value in `frontend/src`. `lib/contrast.ts` is the sole exemption (it needs literal white and near-black to compute against), and `components/ui/` + `components/Common/` are vendored template code we do not own. `./scripts/verification-gate.sh` enforces this.

## Derived values are computed server-side

Power score, standings, streaks, leaderboard baselines, cumulative differentials, ranks-within-a-season, freshness status and every display **label** are produced by the API. The frontend formats and arranges; it does not derive. Two consequences:

- If a number looks wrong, fix it in `app/analytics/` — not in a component.
- Labels arrive fully formed (`"Final · updated Aug 17"`, `"QB 14+ games"`, `"BAL -3.5"`). Do not reconstruct them client-side; a label that disagrees with the value beside it is the defect class this project has hit most.

The one deliberate exception is the explorer's rank-within-a-season, computed client-side because the response already carries every value a ranking needs.

## Routing

Screens live at **`routes/_layout/<name>.tsx`**, not `routes/<name>.tsx`. TanStack's file routing needs the `_layout` folder for the screen to inherit the app shell and the season/week search schema. Every task brief in the plan gets this wrong.

All view state — sort, filters, selected cell, chosen player — lives in **URL search params**, never `useState`. A view that cannot be linked to is a view that cannot be shared, and several screens exist specifically to be pointed at.

## Testing conventions

- **Prove the test bites.** Break the behaviour, confirm the test fails, restore. This has repeatedly caught assertions that passed for the wrong reason.
- **A negative-only assertion is a smell.** `expect(x).not.toBe(a)` also passes when `x` fell through to some third branch. Assert what it must be.
- **Any A–Z sort test must use LV / LAC / LAR.** It is the only trio where sorting by abbreviation and by full name disagree; ARI/ATL/BAL and BUF/DET/NYJ cannot fail. This trap has been hit twice.
- **Sentinel seasons 2081–2099** for fixtures that write rows; ingest owns 2095–2099. Never write test rows into 2016–2025 — that is the real backfill.
- **Route-level tests go through the real generated route tree** (`routes/-route-harness.tsx`), so a screen that stops inheriting the layout schema, or lands at the wrong path, fails.
- `vite.config.ts`'s `testTimeout` must stay **above** `vitest.setup.ts`'s `asyncUtilTimeout`, or a slow `findBy` burns the test budget and vitest reports an opaque timeout instead of Testing Library naming the element.

## Ask what the real data can be

The design mockup's sample data is fictional and uniformly well-behaved. Real data is not, and every screen so far has had at least one defect from that gap: ties rendered as losses (three times), negative EPA collapsing a bar, an absent season painted as zero, a spread sign inverted. **When porting an expression from the mockup, ask what the real column can hold that its sample never did** — null, tied, negative, unplayed, light-coloured.

## Further reading

`resources/nfl-implemnentation2.md` §1 (divergences and why) and §2 (deliberately not built); `resources/HANDOVER.md` for current state and the failure patterns already paid for.
