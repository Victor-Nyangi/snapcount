# Snapcount

An NFL analysis platform: ten seasons of real play-by-play-derived data behind seven screens — week results, standings and a power ranking, position leaderboards, team pages, player pages, a decade-wide differential explorer, and champions history.

[![Test Docker Compose](../../actions/workflows/test-docker-compose.yml/badge.svg)](../../actions/workflows/test-docker-compose.yml)
[![Test Backend](../../actions/workflows/test-backend.yml/badge.svg)](../../actions/workflows/test-backend.yml)

FastAPI + SQLModel + PostgreSQL on the backend; React 19 + Vite + TanStack Router/Query on the frontend, served by the same FastAPI app in production. Built from the `full-stack-fast` template.

## What is actually in the database

Real data ingested from [nflverse](https://github.com/nflverse) via `nflreadpy`, seasons **2016–2025**:

| | |
|---|---|
| Games | 2,764 |
| Players | 5,480 |
| Player-seasons | 19,521 |
| Team-seasons | 320 |
| Teams | 32 |
| Champions (seeded reference data, 2000–2024) | 25 |

Nothing on the site is synthetic. Where the design mockup carried sample figures, they were replaced — and where the real data has a shape the mockup's never did (ties, negative EPA, absent seasons), the code handles it. See §1 of `resources/nfl-implemnentation2.md` for every such divergence and why.

## The seven screens

| Route | What it shows |
|---|---|
| `/week` | A week's games as a card rail, featured matchups, and the full slate with closing lines. Filterable to one-score games or genuine upsets. |
| `/standings` | Standings with a composite power score, division grouping, and point differential on a diverging scale. |
| `/leaders` | Position leaderboards (QB/RB/WR/TE) on a switchable metric, each ranked against the positional baseline. |
| `/team/{abbr}` | A team's season: colour banner, cumulative point-differential trend, full schedule, position groups. |
| `/player/{id}` | A player's rate cards versus positional baseline, and a season-by-season table that follows them across teams. |
| `/explorer` | The signature screen — a 32 × 10 decade differential grid, sortable by any season column, with a linkable drill-down. |
| `/history` | Champions by decade, most-titles counts, and dynasty runs. |

## Running it

Requires [uv](https://docs.astral.sh/uv/), [bun](https://bun.sh), and Docker.

```bash
cp .env.example .env          # then fill in the secrets
docker compose up -d db       # PostgreSQL on host port 5434
cd backend && uv sync && uv run alembic upgrade head
```

Backend and frontend in development:

```bash
cd backend && uv run fastapi dev app/main.py     # API on :8000
bun install && bun run --filter frontend dev     # UI on :5173
```

Or the whole stack:

```bash
docker compose up -d
```

### Ingesting data

A decade takes a while — it pulls each season from nflverse in turn.

```bash
cd backend
uv run python -m app.ingest.runner --season 2024        # one season
uv run python -m app.ingest.runner --from 2016 --to 2025 # the full decade
```

Runs are recorded in `ingest_run`, and `season.last_ingested_at` is stamped **only** when a run succeeds — which is what makes the header's freshness pill honest when a run fails. A container (`ingest-scheduler`) re-ingests the current season nightly; set `INGEST_AT_HOUR_UTC` to move it.

### Tests

```bash
cd backend && uv run pytest                       # 152 tests
bun run --filter frontend test:unit               # 306 tests
bun run --filter frontend test                    # Playwright e2e (needs the compose stack)
./scripts/verification-gate.sh                    # the whole gate at once
```

The backend suite passes from an **empty** database as well as a backfilled one: `backend/tests/conftest.py` loads an 80 KB committed slice of the real rows when the database has none, so CI asserts against the same real values without a decade of network pulls.

## Documentation

- `CLAUDE.md` — conventions that are not obvious from the code
- `resources/nfl-implemnentation2.md` — the implementation plan; §1 records every divergence from the design and why, §2 what was deliberately not built
- `resources/HANDOVER.md` — current state, open decisions, and the failure patterns this project has already paid for
- `development.md`, `deployment.md` — inherited from the template
