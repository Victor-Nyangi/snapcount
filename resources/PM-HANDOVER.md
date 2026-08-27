# Snapcount — product handover

**For a product session picking this up cold.** Engineering state lives in `resources/HANDOVER.md`; this file is the product view — what exists, what was decided, what needs an owner. Written 2026-08-27 against `main` @ `8a946ae`.

---

## The headline

**Snapcount is finished and invisible.** Every planned screen ships, against ten seasons of real NFL data, tested and reviewed. It has never been deployed, so it has **zero users, zero usage data and zero feedback** — and nothing in the product has ever been validated against a person who did not build it.

The remaining work to change that is roughly an afternoon and needs no engineering: register a runner, point DNS, set secrets, run one workflow, load the data (`deployment-snapcount.md` has the order). **Until that happens, every product question below is being answered in a vacuum.**

That is the recommendation: ship it to one real URL, even privately, before scoping anything new.

---

## What ships

Seven screens, all behind a login, all reading real 2016–2025 data.

| Screen | The question it answers |
|---|---|
| **Week** | What happened in this week's games? Slate with scores, closing lines, and filters ("Underdog won", etc.), plus featured matchups. |
| **Standings & power** | Who is actually good? Standings with a computed power score; every input is a sortable column. |
| **Leaders** | Who leads a position on a metric, and by how much *against the positional baseline* — not just a raw top-N. |
| **Team** | One team's season: record, points for/against, running differential, per-game splits. |
| **Player** | One player's season: three rate cards against positional baselines, plus a season-by-season table. |
| **Explorer** | A decade of point differential for all 32 teams on one colour scale. Click any cell for its rank. |
| **History** | Champions since 2000, title counts, and curated dynasty notes. |

**A real differentiator, easy to miss:** every view's state — season, week, sort, filters, selected cell, chosen player — lives in the URL. Any view a user is looking at can be pasted to someone else and will open identically. Several screens exist specifically to be pointed at ("look at this team-season"). This is a deliberate architectural commitment, not a side effect, and it is worth saying out loud in any positioning.

---

## The data

- **2016–2025**, ten seasons: 2,761 games · 5,480 players · 19,521 player-seasons · 32 teams · 25 champions.
- Source is **nflverse**, free and public. No paid feeds.
- **Refresh is nightly, and only for the current season.** Historical seasons are a one-time backfill; the nightly job will never reach back. A "stale" indicator in the header tells the user when a refresh last succeeded, and deliberately stays stale if a run fails rather than reporting a healthy-looking time.
- Numbers are exact and spot-checked (2024 Detroit: 15-2, +222 differential; New England has 6 titles). If a figure looks wrong, it is a bug, not rounding.

**Scope limit worth internalising:** the feed gives **one row per game**, not per play. Anything needing play-by-play or charted data — formations, personnel groupings, drive-level or snap-level anything — is not merely unbuilt, it is unavailable without a different (larger, likely paid) dataset.

---

## Decisions already made — reopen only with new information

Each of these was contested once and settled with evidence. The reasoning is preserved so it does not get relitigated by default.

1. **"Underdog won" means the closing favourite lost** — not "the road team won". On real data those differ sharply: one sample week had 11 road wins but only 4 upsets. A filter means what its label says.
2. **Per-game written recaps are a deliberate empty state.** The layout reserves its widest column for them and renders an em-dash. It is held open on purpose so nothing shifts when recaps eventually land. **Do not "tidy" that column away** — it will look like an oversight to anyone reviewing the screen.
3. **Player labels name the season year, not "Nth season".** The system stores no rookie year, so a career length genuinely cannot be computed — the old label said "2nd season" for Tom Brady in 2017 and meant "2nd season *in our data*". Replaced rather than patched.
4. **The formation/personnel panel ships visibly empty, with a caption explaining why.** A deliberate product choice: name the gap rather than hide or fake it.
5. **Playoff-seed badges were dropped**, not deferred — the data is inconsistently available and full NFL tiebreaker logic is a project of its own.

---

## Deliberately not built, and what unblocks each

| Not built | Why | Unblocked by |
|---|---|---|
| Dark theme | The colour scale generates light backgrounds that are unusable on a dark canvas; it needs re-deriving, not re-mapping | A design pass on the scale |
| Storyline cards ("Biggest mover", "Upset of the week") | The prose is editorial; no dataset produces it | An authoring surface, or a decision to drop |
| Per-game recaps | Same — a written sentence per game | Same, or an LLM pass |
| Formation / personnel data | Needs charted play data, absent from free feeds | Paid data |
| Play-derived headline stats (yards/play, punts, total yards) | Needs play-by-play, far larger than the entire current dataset | Ingesting play-by-play |
| Playoff seeding by tiebreaker | Full tiebreaker logic is its own project | Dedicated effort |
| Career history before 2016 | The window is ten seasons; longer careers render short | Widening the ingest window — genuinely a one-line change, at the cost of a longer backfill |
| Multi-series charts | Only a single-series chart exists in the design | The first chart that needs it |

---

## What a user will notice

Honest list of things that will draw a comment in a first demo:

- **Long careers look truncated.** A player who started before 2016 shows only the seasons in the window, with no note explaining it. Cheapest credible fix in the list above.
- **Em-dashes where prose should be** — the widest column of the slate table, and the game-card sentence. Correct by decision (#2), but reads as unfinished without context.
- **An intentionally empty panel** on the team page, captioned.
- **Light theme only.**
- **Login required to see anything**, including screens whose whole point is being shareable by link. A recipient without an account sees a login form, not the view. See the open questions.

---

## Open questions that need a product owner

Ranked by how much they cost to leave undecided.

1. **Who is this for, and should it be public?** Everything sits behind a login, yet the product's strongest feature is that any view can be shared by URL. Those two facts are in direct tension and nobody has resolved them. A public read-only mode is a real design and effort question, not a config toggle.
2. **Signup is wide open.** `POST /users/signup` creates an account with no invitation, no email verification and no approval — inherited from the project template and never revisited. **The moment this is on a public domain, anyone who finds it can register and read everything.** Decide before the deploy: close it, gate it, or accept it deliberately. This is the one item here with a security dimension.
3. **What happens in the off-season?** The nightly job ingests the current season; between February and August there is no new data. Does the product say anything about that, or just look stale for seven months?
4. **Leaders shows the season year on every row**, where the page heading and the picker already state it — a small redundancy introduced by decision #3. One line to remove if a PM prefers it.
5. **Is ten seasons the right window?** It drives the explorer's whole premise ("a decade of…"). Widening it is cheap in code and expensive in ingest time.

---

## What is not measured

There is **no product analytics of any kind** — no page views, no feature usage, no funnel, nothing. Error tracking (Sentry) is wired but switched off until a key is set.

Practically: on the day this launches, there will be no way to answer "does anyone use the explorer?" Whether that matters depends on the audience decision in question 1, but it is worth deciding *before* launch rather than retrofitting.

---

## Constraints worth knowing before scoping anything

- **Every derived number is computed server-side** — rankings, power scores, streaks, baselines, and every display label. Changing how a number is *presented* is often a backend change. Labels arrive from the API fully formed.
- **Accessibility is enforced by tests, not by a checklist** — contrast, keyboard navigation, reduced motion, and responsive layout down to 375px all have automated coverage that must keep passing. Treat AA contrast as a hard constraint on any new colour.
- **Browser testing is Chromium-only.** Safari and Firefox have never been exercised, and at least one known-risky CSS pattern is in use. Worth a manual pass before showing it to anyone on a Mac or iPhone.
- The project has a strong documented convention that **a label must agree with the value beside it**. Seven separate defects came from violating it. Any new copy that restates a number should be treated as a place where that can go wrong.

---

## Where to look

| For | Read |
|---|---|
| Deploying it | `deployment-snapcount.md` |
| Engineering state, gotchas, failure patterns | `resources/HANDOVER.md` |
| Full scope, divergences from the design, out-of-scope reasoning | `resources/nfl-implemnentation2.md` (§1 and §2) |
| Product overview and commands | `README.md` |
