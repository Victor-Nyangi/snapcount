# Deploying snapcount

`deployment.md` and `deployment-docker-compose.md` are the template's generic
guides. This file records the things that are true of **this** project, which
those guides cannot know.

**The chosen path is Docker Compose on a box you own** (`compose.deploy.yml`,
driven by `.github/workflows/deploy-docker-compose.yml`). The decision turned
on the nightly ingest: it is an `ingest-scheduler` *container*, so it works as
designed here and would have nowhere to run on FastAPI Cloud — that path would
need the schedule re-homed to a GitHub Actions `schedule:` trigger before it
could keep a season current.

> `.github/workflows/deploy.yml` (FastAPI Cloud) is left in place and unused.
> If it is ever adopted, note its `push:` trigger is on **`master`** while this
> repo's default branch is **`main`**, so it would never fire on its own — it
> has a `workflow_dispatch:` and would need that one-line change.

---

## The thing the template does not do: production starts empty

This is the part worth reading twice.

`backend/scripts/prestart.sh` runs migrations and creates the superuser. That
is all it does. A first deploy therefore comes up with a schema, one user, and
**no data** — seven screens of empty states.

And it does not fix itself. `backend/scripts/nightly-ingest.sh` deliberately
ingests only the **current** season, so it will never reach back and backfill
2016-2024. Waiting is not a strategy.

The two options are to run the decade backfill against production — 10 seasons
of networked nflverse pulls, the exact thing CI refuses to do — or to move the
verified data across. **Move it across.** The local database already holds the
decade that every spot-check in `resources/HANDOVER.md` was measured against.

```bash
./scripts/dump-backfill.sh backfill.sql.gz     # on your machine, ~420 KB
```

The dump is **data only**. Alembic owns the schema and `prestart.sh` runs it
first; a dump carrying its own `CREATE TABLE` statements would be a second
definition, free to diverge. It also excludes `user` (production makes its own
superuser from its own secrets — shipping a dev password hash would be a
credential leak with a long half-life), `alembic_version`, and `ingestrun` (a
log of runs that happened on a laptop). `Season.last_ingested_at`, which is what the freshness
pill actually reads, travels on `season` and *is* included.

Dumps are gitignored. Generate one when you deploy; a committed one goes stale
the first time the current season re-ingests.

---

## First deploy, in order

**1. Prerequisites on the box.** The deploy job is `runs-on: self-hosted`, so
the box needs a registered GitHub Actions runner with Docker and the repo
checked out by that runner. DNS for `${DOMAIN}` and `adminer.${DOMAIN}` must
point at it before the first run — Traefik requests Let's Encrypt certificates
over the TLS challenge, which fails on a domain that does not resolve yet.

**2. Repository configuration.** Both lists come from the workflow itself; if
one is missing, compose fails on `:?Variable not set` rather than starting a
half-configured stack.

| Variables | Secrets |
|---|---|
| `DOMAIN`, `PROJECT_NAME`, `FIRST_SUPERUSER`, `SMTP_HOST`, `SMTP_USER`, `EMAILS_FROM_EMAIL`, `SENTRY_DSN` | `SECRET_KEY`, `FIRST_SUPERUSER_PASSWORD`, `SMTP_PASSWORD`, `POSTGRES_PASSWORD`, `ADMINER_AUTH` |

Seven variables and five secrets. `ADMINER_AUTH` is the newest and the one the
template does not have; the next section is entirely about it.

### `ADMINER_AUTH`, and the dollar signs that will bite you

Adminer is a full PostgreSQL admin UI, and `compose.deploy.yml` publishes it at
`adminer.${DOMAIN}` over HTTPS. Without a middleware the only thing between the
open internet and the database is `POSTGRES_PASSWORD` typed into a login form
that anyone can load and any scanner can find. So there is a Traefik `basicauth`
middleware in front of the router, and `ADMINER_AUTH` is the htpasswd line it
checks against. It is a secret, not a variable, because it carries a password
hash.

Generate it with `htpasswd` (`apache2-utils` on Debian, `httpd-tools` on RHEL),
using `-B` for bcrypt:

```bash
htpasswd -nbB admin 'the-password-you-chose'
# admin:$2y$05$Ku7L0z...............
```

Paste that whole line — username, colon, hash — into the repository secret.

**Paste it verbatim, with single dollar signs. Do not double them.** This is
worth being precise about, because the advice you will find says the opposite,
and it is right about a different situation. Compose interpolates the *text of
the compose file*, so a hash written literally into `compose.deploy.yml` would
need every `$` doubled to `$$` or `$2y$05$...` would be read as three empty
variables. But the value does not travel that way. It arrives through the
workflow's `env:` block as a process environment variable, and Compose does not
re-scan what it substitutes in — interpolation is a single pass. Double the
dollars in the secret and the middleware receives a hash that literally contains
`$$`, which matches nothing, and the failure looks like a wrong password rather
than a mangled one.

The one place doubling *is* required is an `.env` file on the box. Compose does
interpolate inside `.env`, so a single-`$` hash there silently collapses to
rubbish. Both behaviours were checked rather than assumed, with
`docker compose config` against a throwaway file: through the environment the
value survives byte-for-byte, and through `--env-file` a single-`$` hash comes
out as `admin:.Kf2/`.

If you lock yourself out, the recovery is `docker compose ... up -d` after
correcting the secret — the middleware is proxy-side, so nothing about the
database or its data is involved.

**3. Run the deploy.** Actions → "Deploy with Docker Compose" → Run workflow.
It is `workflow_dispatch:` only, deliberately: nothing auto-deploys to your box
on a push to `main`. It builds, runs `prestart.sh`, and brings the stack up.

**4. Load the decade.** On the box, in the repo directory, with the stack up:

```bash
./scripts/restore-backfill.sh backfill.sql.gz \
  'postgresql://postgres:THE_POSTGRES_PASSWORD@localhost:5432/app'
```

That URL is resolved *inside* the `db` container (the script runs `psql` there,
so it gets client binaries matching the server), which is why it says
`localhost:5432` and not the host's port.

The script refuses to run against a database that already holds
`teamseasonstat` rows. It is for a fresh deploy; replacing existing data is a
deliberate act that should start with a deliberate truncate.

On success it prints its own verification, and these are exact, not
approximate:

```
DET 2024 differential | 222
NE titles             | 6
seasons               | 10
games                 | 2761
player-seasons        | 19521
```

**5. Check the app, not just the containers.** Log in and confirm: the season
picker offers **ten** seasons, the explorer eyebrow reads the full range (it is
derived from `/meta/seasons`, so a wrong range means the data did not land),
and the freshness pill is not "No data ingested yet".

---

## After the first deploy

**The nightly ingest** runs in the `ingest-scheduler` container: a sleep-loop,
not a queue, because it is one job a night with no fan-out and nothing waiting
on the result. It derives its season rather than reading `date +%Y` — an NFL
season is named for the year it starts in and runs into February, so a naive
year would spend seven months of every year ingesting a season that does not
exist. A failed run leaves `Season.last_ingested_at` alone on purpose, so the
freshness pill goes stale instead of reporting a healthy-looking run, and the
loop survives to try again tomorrow.

`INGEST_AT_HOUR_UTC` (default 9) moves it. It is **not** plumbed through the
deploy workflow's `env:` block, so today it can only be set from an `.env` on
the box. Adding it to the workflow is safe if you want it there: compose reads
`${INGEST_AT_HOUR_UTC:-9}`, and `:-` falls back on an *empty* value as well as
an unset one, so an undefined GitHub variable still resolves to 9 rather than
handing the scheduler a blank hour. (Checked, not assumed —
`INGEST_AT_HOUR_UTC= docker compose config` resolves it to `"9"`.)

**Subsequent deploys** are the same workflow. Step 4 is first-deploy only — the
database volume persists, and the restore script will refuse anyway.
