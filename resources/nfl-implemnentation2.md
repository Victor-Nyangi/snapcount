# Snapcount — NFL Analysis Platform: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a personal-scale NFL analysis platform — all seven data-dense screens (Week view, Standings & power, Position leaders, Team, Player, Analytics Explorer, Champions & history) backed by real nflverse data, built on the design system imported from Claude Design.

**Architecture:** FastAPI + SQLModel + PostgreSQL serve pre-aggregated season/week tables ingested from nflverse via `nflreadpy` — ten seasons deep, because the Analytics Explorer is a 32×10 matrix. Derived quantities (power score, streak, form, SOS, cumulative differential, positional baselines) are computed in pure, unit-tested Python functions and persisted, never computed in the browser. Settled history (Super Bowl winners, dynasty runs) is seeded statically from the repo rather than ingested. The React frontend consumes a generated OpenAPI client through TanStack Query; all view state (season, week, sort, filters) lives in TanStack Router search params so every view is linkable. Design tokens land in a three-file CSS layer that keeps design-owned values separate from the shadcn semantic interface.

**Tech Stack:** FastAPI · SQLModel · PostgreSQL · Alembic · uv · nflreadpy (Polars) · React 18 · TypeScript · Vite · Bun · TanStack Router · TanStack Query · Tailwind CSS · shadcn/ui

---

## §0 — Design import: findings report

This section is the report-back the original handoff (`nfl-handoff-original.md` §1) required before any code. It is recorded here so the mapping decisions survive a re-import.

**Source:** Claude Design project `602fdce0-a466-4323-b590-7205741e19a2` ("NFL Analysis Platform Design"), design system `victor-s-work-of-art-fa259736-569f-484e-a5f2-cf6f508b2477`.

### 0.1 What the two JS files actually do

Both are **build/preview tooling. Neither is ported.**

- **`support.js`** (69 KB) — the `dc-runtime`, generated from `dc-runtime/src/*.ts`. It parses the `<x-dc>` template out of the document, evaluates the `<script type="text/x-dc">` block, and renders the result with `window.React` / `window.ReactDOM`. It is what makes `.dc.html` previewable in the Claude Design canvas. It has no product behavior.
- **`_ds_bundle.js`** — the design system's 13 components (Button, IconButton, Badge, Tag, Card, Tooltip, Input, Select, Checkbox, Radio, Switch, SidebarItem, Tabs) compiled to globals under namespace `VictorSWorkOfArt_fa2597`.
  **The NFL design imports this bundle but uses zero of its components** — verified by grep: no namespaced references, no capitalised custom tags. Every element in the mockup is a raw HTML tag with inline styles. So the DS component bundle is dead weight for this project, and shadcn primitives are a clean substitution rather than a competing system.

The mockup's own templating (`<sc-if>`, `<sc-for>`, `{{ … }}`, `style-hover`, `DCLogic`) is likewise canvas syntax. The React port re-expresses it; it is not transcribed.

### 0.2 Color tokens

**Base palette — "Midnight Orchid"** (`tokens/colors.css`):

| Token | Value | Token | Value |
|---|---|---|---|
| `--black` | `#0A0A0C` | `--bone` | `#F4F1EA` |
| `--graphite` | `#1C1C20` | `--white` | `#FFFFFF` |
| `--graphite-2` | `#2A2A2F` | `--danger` | `oklch(0.58 0.19 25)` |
| `--graphite-3` | `#3A3A3E` | `--danger-light` | `oklch(0.93 0.05 25)` |
| `--emerald-dark` | `#158055` | `--warning` | `oklch(0.78 0.15 82)` |
| `--emerald` | `#1FAA6B` | `--warning-ink` | `oklch(0.32 0.06 82)` |
| `--emerald-light` | `#4BC98C` | | |
| `--orchid-dark` | `#4C1778` | | |
| `--orchid` | `#6B21A8` | | |
| `--orchid-light` | `#8B4FC9` | | |

**Neutral ramp** — `--gray-50` … `--gray-900`, oklch, chroma 0.002→0.006 at hue 90 (warm-leaning):
`0.98 / 0.95 / 0.90 / 0.82 / 0.68 / 0.54 / 0.42 / 0.30 / 0.20 / 0.12`.

**Semantic — dark shell (the DS default):** `--surface-canvas`→black, `--surface-card`→graphite, `--surface-card-raised`→graphite-2, `--surface-border`→graphite-3, `--text-primary`→bone, `--text-secondary` `oklch(0.72 .006 90)`, `--text-tertiary` `oklch(0.54 .006 90)`, `--accent-primary`→emerald (+`-hover`→emerald-light, `-ink` `#06170F`), `--accent-secondary`→orchid (+`-hover`→orchid-light, `-ink` `#F3E8FF`).

**Semantic — light shell:** `--surface-canvas-light`→bone, `--surface-card-light`→white, `--surface-border-light`→gray-200, `--text-primary-light` `oklch(0.16 .006 90)`, `--text-secondary-light` `oklch(0.42 .006 90)`, `--text-tertiary-light` `oklch(0.58 .006 90)`.

### 0.3 Type scale

`tokens/fonts.css` loads **Playfair Display + Manrope + JetBrains Mono** from Google Fonts. `tokens/typography.css` defines:

| Role | Size | Line-height | Weight |
|---|---|---|---|
| display | 52px | 1.05 | 700 |
| h1 | 36px | 1.15 | 800 |
| h2 | 26px | 1.2 | 700 |
| h3 | 19px | 1.3 | 700 |
| body | 16px | 1.6 | 400 |
| small | 13px | 1.5 | 500 |
| micro | 11px | 1.4 | 700 |

Families: `--font-display` Playfair Display, `--font-body` Manrope, `--font-mono` JetBrains Mono.

**The NFL design overrides all three families and two of the sizes** — see §1.1. This is the single most important finding in this report.

### 0.4 Spacing, radius, elevation, motion

- **Spacing** — 4px base: `--sp-1..24` = 4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48 / 64 / 80 / 96.
- **Radius** — `--radius-sm/md/lg/xl` = 8 / 12 / 16 / 20, `--radius-pill` = 999px.
- **Shadow** — `--shadow-sm/md/lg` (dark-tuned), `--shadow-light-sm/md` (light-tuned), `--glow-emerald`, `--glow-orchid`.
- **Motion** — `--ease-standard` `cubic-bezier(0.4,0,0.2,1)`, `--duration-fast` 120ms, `--duration-base` 180ms.

### 0.5 What the mockup actually contains

**All seven screens from the design brief**, switched by a `tab` state field, under one sticky header whose nav is a 7-item `flex-wrap` row:

1. **Week view** — season/week selects + freshness pill; a horizontally scroll-snapped rail of 16 game cards; two "featured matchup" cards with a team-colored banner and a 3-up stat grid; three "storyline" cards; and a 7-column full-slate grid table.
2. **Standings & power** — conference pill filters, "group by division" checkbox, an 11-column sortable grid table with team chip, seed badge, diverging differential cell, W/L form dots, and a power bar + score.
3. **Position leaders** — QB/RB/WR/TE segmented tabs, metric select, top-N select, and leader cards with a rank numeral, team chip, proportional bar, dashed positional-baseline marker, and three stat readouts.
4. **Team page** — team select; a hero card with a team-colored banner, 64px chip, record, and four rate stats; **the design's only chart** (a cumulative point-differential trend line, §1.10); a 6-column schedule & results table whose margin column reuses the diverging scale at a game-margin domain; and a position-groups depth panel.
5. **Player page** — position + player selects; a 40px name header with a 52px chip; three rate cards each with a value, signed delta vs the positional baseline, a bar and a dashed baseline marker; and a 7-column season-by-season table with the most recent completed season highlighted.
6. **Analytics Explorer** — the signature screen. A 32×10 team-season matrix of point differentials on the diverging scale, sortable by 10-year total / alphabetically / by division / **by any season column**, with a click-to-select drill-down panel above the grid and a signed 10-year total column beside it.
7. **Champions & history** — a most-titles summary row, three decade sections of Super Bowl results (2000–2024, 25 rows), and a dynasty-runs sidebar.

**Version note.** Screens 1–3 are byte-identical to the earlier import; only the nav changed from three hard-coded buttons to a seven-item loop. Screens 4–7 arrived in a second pass, implemented as `Component.prototype.extraVals()` spread into `renderVals()`. Nothing in §1's earlier decisions is invalidated by the expansion.

The mockup carries its own sample data. **Almost all of it is layout fixture, not data**, and the mockup labels it as such on three separate screens. Specifically:

- **Real and reusable:** the 32 team identities and primary hex; the 25 Super Bowl results 2000–2024, which are accurate and are seeded as static reference data (Task 3.4).
- **Synthetic, generated at render time by an FNV-1a `seed()` hash:** the 2016–2024 columns of the decade matrix ("2025 column matches the standings on this site; earlier seasons are synthetic"), every team's 17-game schedule, and every player's season-by-season line.
- **Fictional:** the 48 players, the 32 season records, the 16 games, and all editorial prose (recaps, storylines, dynasty notes).

The fictional records are reused in this plan only as test fixtures for the derived-value functions, where their expected outputs are hand-computable.

---

## §1 — Divergences and judgment calls

Every item here is a decision that a naive re-import would silently lose. Each is mirrored as a comment block in `frontend/src/styles/theme.css`.

### 1.1 The design overrides the design system's fonts — the design wins

The `.dc.html` re-declares `:root` after importing the DS tokens:

```css
--font-display: 'Archivo','Archivo Expanded',sans-serif;   /* not Playfair Display */
--font-body:    'IBM Plex Sans',-apple-system,sans-serif;  /* not Manrope */
--font-mono:    'IBM Plex Mono',ui-monospace,monospace;    /* not JetBrains Mono */
```

…and applies `font-stretch: 125%; font-weight: 700` to `h1, h2, [data-display]`, loading Archivo as a **variable font on the `wdth` axis (112–125) and `wght` axis (600–800)**.

**Decision:** the product design supersedes the design system here. Playfair Display / Manrope / JetBrains Mono are never loaded. Archivo must be self-hosted as a *variable* woff2 — a static instance cannot produce `font-stretch: 125%`.

The design also deviates from the DS type scale: page `h1` is **44px** (token says 36) with `letter-spacing:-0.02em`, section `h2` is **28px** (token says 26). Both live in `tokens.app.css` as `--text-h1-app` / `--text-h2-app`.

### 1.2 The design is light-shell only — and dark cannot be derived

The page canvas is `#FAF9F6` on white cards. **No screen was designed dark, and the DS dark shell cannot be mechanically applied**, because the diverging differential scale (§1.4) generates backgrounds in the lightness range **L 0.75 → 0.97**. Those are unusable on a `#0A0A0C` canvas; the scale would need re-deriving, not re-mapping, and re-deriving it is a design decision, not an implementation one.

**One trap, learned the hard way.** Tailwind v4's `dark:` variant defaults to `@media (prefers-color-scheme: dark)`. The template rebinds it with `@custom-variant dark (&:is(.dark *));`, and shadcn's primitives ship `dark:*` utilities baked in — 10 component files carry them.

**Keep that line.** Because nothing ever applies the `.dark` class, binding the variant to it makes `dark:` permanently inert. Deleting the line does not disable dark mode — it *enables* it via the OS media query, applying dark utilities against a palette with no dark values. The custom variant is the off switch, not the on switch.

**Decision, per the handoff's own rule ("If the design only defines one, say so instead of deriving the other"):** ship light-only. **The app shell does not get a theme toggle** in this plan, and this is a deliberate deviation from the original handoff §5.3. `theme.css` defines only the light `:root` block; the dark block is left out rather than guessed. Reopening dark mode requires a design pass on the diverging scale first.

### 1.3 `#FAF9F6` is a new value, not `--bone`

The canvas is `#FAF9F6`; `--bone` is `#F4F1EA`. They are different colors and both appear in the project. `#FAF9F6` goes into `tokens.app.css` as `--app-canvas`.

### 1.4 The diverging scale is defined in code, not in tokens

From `diffCell(v)` in the mockup — this is the authoritative definition of the "one diverging scale used everywhere signed values appear" that the design brief demanded:

```
mag = min(|v| / 150, 1)
v = 0  →  bg var(--gray-100),                                    ink var(--gray-600)
v > 0  →  bg oklch(0.97 - mag*0.22,  0.04 + mag*0.12,  155)      ink mag>0.55 ? #06170F : var(--emerald-dark)
v < 0  →  bg oklch(0.97 - mag*0.20,  0.04 + mag*0.13,  25)       ink mag>0.55 ? #3A0B08 : oklch(0.45 0.17 25)
```

Note the **domain is ±150 season points** and saturates there. Any other signed quantity (EPA, over/under performance) must be normalised to that domain before being passed in, not given its own scale.

### 1.5 The design uses ~10 colors the token files never declare

Extracted mechanically from the `.dc.html`. These are *design* values that simply were not lifted into `tokens/colors.css`, so they belong in a regenerable file — **not** hand-added to the DS token copy, which a re-import would overwrite:

| New token | Value | Used for |
|---|---|---|
| `--app-canvas` | `#FAF9F6` | page background |
| `--app-row-zebra` | `oklch(0.99 0.002 90)` | odd table rows (lighter than `--gray-50`) |
| `--orchid-900` | `oklch(0.24 0.10 300)` | active nav tab / active position tab background |
| `--orchid-700` | `oklch(0.35 0.13 300)` | power bar fill |
| `--orchid-600` | `oklch(0.45 0.12 300)` | leader bar fill (non-leader) |
| `--orchid-tint` | `oklch(0.95 0.06 300)` | orchid badge background |
| `--emerald-tint` | `oklch(0.95 0.05 155)` | emerald badge / active pill background |
| `--emerald-tint-strong` | `oklch(0.96 0.03 155)` | freshness pill background |
| `--emerald-tint-border` | `oklch(0.86 0.06 155)` | freshness pill / leader card border |
| `--ink-negative` | `oklch(0.50 0.17 25)` | losing streak, below-baseline figures |
| `--ink-negative-mid` | `oklch(0.45 0.17 25)` | diverging cell ink, low magnitude |
| `--ink-negative-strong` | `#3A0B08` | diverging cell ink, high magnitude |
| `--chart-rule` | `#D8D6D0` | the zero line on the trend chart (§1.10) |
| `--row-highlight` | `oklch(0.97 0.03 155)` | "most recent completed season" row on the player page |

Note `--orchid` is `#6B21A8` ≈ `oklch(0.42 0.19 310)` — hue **310**. The new orchid ramp above sits at hue **300**. That is what the design does; it is preserved verbatim rather than "corrected".

### 1.6 The mockup's tables are CSS Grid; ours will be real `<table>`s

Both the slate table and the standings table are `display:grid` with explicit `grid-template-columns` on every row. That markup cannot give us sticky headers, sticky first columns, keyboard cell navigation, or screen-reader row/column association without reimplementing all of it in ARIA.

**Decision:** `StatTable` renders a semantic `<table>` with `table-layout: fixed` and a `<colgroup>` whose widths are copied from the mockup's `grid-template-columns`. Visually identical, structurally correct. This is the one place the design and shadcn's structure genuinely conflict, and it is resolved in shadcn's favour.

### 1.7 Team chips fail AA for 7 of 32 teams

The chip is white 11px bold text on the team's primary color. Contrast against white, **computed** (an earlier draft of this section estimated these and got Detroit wrong):

| Team | Color | vs white | vs near-black | Ink chosen | |
|---|---|---|---|---|---|
| TEN | `#4B92DB` | 3.26 | 6.06 | near-black | ✗ fails on white |
| CIN / DEN | `#FB4F14` | 3.37 | 5.87 | near-black | ✗ fails on white |
| NO | `#9F8958` | 3.39 | 5.83 | near-black | ✗ fails on white |
| MIA | `#008E97` | 3.95 | 5.01 | near-black | ✗ fails on white |
| CAR | `#0085CA` | 4.03 | 4.91 | near-black | ✗ fails on white |
| LAC | `#0080C6` | 4.28 | 4.62 | near-black | ✗ fails on white |
| DET | `#0076B6` | **4.92** | 4.02 | **white** | ✓ passes — keeps white |

Six hex values across seven teams (Cincinnati and Denver share `#FB4F14`) fail 4.5:1 against white. All six clear it comfortably against near-black instead — Tennessee reaches 6.06.

**Detroit is the instructive case.** At 4.92 it passes on white, and white is genuinely its better ink. A rule that flipped every "darkish blue" to black would make Detroit *worse*. This is why the fix computes luminance per team rather than hard-coding a list.

The handoff sets "AA contrast on all data text, including text inside colored cells" as a quality floor, so this is fixed rather than shipped.

**Decision:** `TeamChip` computes WCAG relative luminance from the team color and picks whichever of `--white` / `--black` scores higher. Team color still owns the chip; only the ink adapts.

### 1.8 Featured-matchup banners use team color as a large surface

`f.bannerStyle` paints a full card banner in the home team's primary color with white text on it — which brushes against the brief's "team color must never drive page-level UI". **Decision:** kept, because it is a *matchup identity* surface inside a game card, not interface chrome. The white text on it gets the same luminance flip as §1.7.

### 1.9 `slashed-zero` is not in the design

The mockup uses `font-variant-numeric: tabular-nums` everywhere; the handoff asks for `tabular-nums slashed-zero`. IBM Plex Mono's slashed zero is a stylistic set, and enabling it changes the mockup's rendering. **Decision:** `.tabular` applies `tabular-nums` only, matching the design. Revisit if 0/O confusion shows up in practice.

### 1.9a The stale freshness pill needs a warning tint the design never drew

The freshness pill has three states. The mockup only ever renders `final`, so there is no `stale` markup to copy. The design system defines `--warning` and `--warning-ink` but no warning *tint* — the container background and border that the emerald states use.

Rendering `stale` with the emerald tint container and amber dot/label gives a green pill with orange contents, which reads as a bug rather than a state.

**Decision — derive, do not invent.** The design's own tint formula is visible in the emerald set: a fixed lightness/chroma pair at the family's hue.

| | tint-strong | tint-border |
|---|---|---|
| emerald (hue 155) | `oklch(0.96 0.03 155)` | `oklch(0.86 0.06 155)` |
| **warning (hue 82)** | `oklch(0.96 0.03 82)` | `oklch(0.86 0.06 82)` |

Same lightness, same chroma, warning's hue. That is applying the design's rule at a new hue rather than picking a colour, which is why this is recorded as a judgment call rather than flagged as a blocker.

These two live in **`theme.css`**, not `tokens.app.css` — the app-token file is regenerated from the design export and holds only values the design actually uses. A derived value belongs with the other hand-maintained decisions.

### 1.10 There is exactly one chart in the entire design, and it defines the chart conventions

The team page's cumulative point-differential trend is the only chart across all seven screens. Everything else is a table, a card, or a bar mark. So the "chart conventions sheet" the design brief §5.3 asked for exists only as this one instance — and it is deliberately minimal:

```html
<svg viewBox="0 0 640 132" preserveAspectRatio="none" style="width:100%;height:132px">
  <line x1="0" y1="66" x2="640" y2="66" stroke="#D8D6D0" stroke-width="1" stroke-dasharray="4 4"/>
  <path d="…" fill="none" stroke="#6B21A8" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
</svg>
```

The conventions that follow from it, and that any later chart must inherit:

- **No axes, no ticks, no gridlines.** A single dashed zero rule in `--chart-rule`, and nothing else. The numbers live in the adjacent table; the chart carries shape only.
- **Series stroke is `--orchid` at 2.5px**, round join and cap. Not a team color — this is a single-series chart inside a page that already establishes team identity in its banner.
- **Symmetric auto-scale with a floor.** From `svgLine(vals, w, h)`:

  ```
  max  = Math.max(...vals.map(Math.abs), 40)      // floor of ±40 so a flat season isn't amplified
  step = w / (vals.length - 1)
  y    = h/2 - (v / max) * (h/2 - 6)              // zero at mid-height, 6px top/bottom padding
  ```

  The ±40 floor matters: without it, a team that finished ±5 all season would render as dramatic swings.
- **`preserveAspectRatio="none"`** — the chart stretches to container width rather than maintaining ratio. Acceptable for a shape-only trend; it would not be for anything read quantitatively.

This unblocks what the earlier draft listed as out of scope. It does **not** supply a sequential scale or a categorical multi-series scale — no chart in the design needs either, so those stay unbuilt (§2).

### 1.11 The margin column proves the diverging scale generalises

The team page's schedule table styles its margin column with `diffCell(m * 6)` — a game margin multiplied by 6 before being fed to a scale whose domain is ±150. That is exactly equivalent to `divergingCell(margin, 25)` in our signature: a ±25-point game-margin domain.

This is a useful confirmation rather than a change. The `domain` parameter already specified in Task 1.4 covers it, and the plan's rule stands: any signed quantity normalises onto the one scale rather than getting a scale of its own. Add a test asserting the equivalence.

### 1.12 The explorer grid does not animate its reorder

The design brief §6 budgeted motion for "the differential grid's reorder". The implemented grid does not animate — rows re-sort instantly, and the only transition on a cell is `outline-color 120ms` for selection.

**Decision:** follow the implementation, not the brief. Animating 320 cells through a reorder is expensive, and it is the kind of motion the brief elsewhere calls "nothing ambient". Selection outline transitions; sorting does not.

### 1.13 Seven nav items will not fit at 375px

The nav grew from three items to seven (`Week`, `Standings & power`, `Leaders`, `Team`, `Player`, `Explorer`, `History`) and the mockup handles it with `flex-wrap: wrap` at desktop width. At 375px, seven pills plus a wordmark, two selects and a freshness pill will wrap to four or five rows and eat most of the viewport before any content renders.

**Decision:** below the `md` breakpoint the nav collapses to a horizontally scrollable single row with the active item scrolled into view — the same `data-rail` treatment the week view already uses, so no new pattern is introduced. Flagged because it is a structure the mockup does not show, invented to satisfy the 375px constraint.

---

## §2 — Explicitly out of scope

Not planned here. Each needs something that does not exist yet.

All seven screens now have mockups, so this list is short. What remains is the work no dataset or design decision covers.

| Item | Why not | What unblocks it |
|---|---|---|
| **Dark theme + theme toggle** | §1.2 — the diverging scale generates L 0.75–0.97 backgrounds, unusable on a dark canvas. It needs re-deriving, not re-mapping. | A design pass on the diverging scale. |
| **Sequential and categorical (8-series) color scales** | Design brief §5.3 asked for all three; only the diverging scale was delivered, because only it is used. The one chart in the design is single-series (§1.10). | The first multi-series chart. |
| **Storyline cards** ("Biggest mover", "Upset", "Streak") | The prose is editorial. No dataset produces it. | An authoring surface, or a decision to drop them. |
| **Per-game "what happened" recaps** | Same — a written sentence per game. | `game.recap` ships as a nullable column with an em-dash empty state; populate it later. |
| **Dynasty run notes** | Same again: four hand-written paragraphs on the history screen. | Seeded as static editorial content alongside the champions table (Task 3.4) — they are stable historical claims, not per-season data. |
| **The featured card's editorial stat trio** | The mockup shows `921 total yards`, `8.1 yards / play (DET)`, `0 DET punts, 2nd half`. All three need **play-by-play** data, which we do not ingest — `load_schedules` gives one row per game, not per play. Substituted with stats derivable from the schedule row: total points, margin, and the closing line. Flagged by the Task 4.1 implementer rather than invented. | Ingesting nflverse play-by-play, which is a far larger dataset than the whole current backfill. |
| **Formation / personnel data** | Requires charted play data, absent from the free feeds. | Paid data. **The design already handles this correctly** — the team page ships a position-groups panel with named slots and em-dash values, captioned "Personnel and formation data needs charted plays — that view is deliberately deferred rather than faked." Build the panel exactly as designed, including the caption. |
| **Playoff seeding by NFL tiebreakers** | Full tiebreaker logic is a project of its own. | Ingested from nflverse where available; `null` otherwise, badge hidden. |
| **Player career history before the ingested window** | The player page's season table shows five seasons; our ingest window is ten. A career longer than the window renders short. | Widening the ingest window, which is a one-line change in `ingest_season`'s caller. |

**Scope note the expansion forces:** the Analytics Explorer needs **ten seasons of team differentials**, not one. Ingestion is now multi-season by default (Task 3.3, Step 8), which is the single largest cost the four new screens add — roughly 2,850 games and ~16,000 player-season rows rather than a tenth of that. The player page's season-by-season table draws on the same widened window.

---

## Global Constraints

- **No literal values in component code.** Every color, size, spacing, radius, and duration resolves through a CSS variable. No arbitrary Tailwind values (`w-[347px]`). The only permitted raw hex are the 32 team colors in `backend/app/data/teams.json`, which are data.
- **All server state through the generated client + TanStack Query.** No hand-written `fetch`. Regenerate with `bun run generate-client` after any route change.
- **Team color appears only on team identity marks, chart series, and matchup banners.** Never on nav, buttons, or page chrome.
- **All view state in URL search params** — season, week, sort key, sort direction, conference, grouping, position, metric, top-N, slate filter. Every screen is linkable and back-button correct.
- **Numerics right-aligned, text left-aligned, precision fixed per column, never per cell.**
- **`.tabular` on every numeric cell**, never globally — prose keeps proportional figures.
- **Responsive to 375px** on all seven screens. Visible keyboard focus everywhere (`2px solid var(--orchid)`, offset 2px). AA contrast on all data text including inside colored cells.
- **Respect `prefers-reduced-motion`** — the design already ships the blanket `animation:none!important;transition:none!important` rule; keep it.
- **Motion budget:** 120ms hover/press, 180ms panel and bar transitions, `cubic-bezier(0.4,0,0.2,1)`. Nothing ambient.
- **Every derived quantity is computed and tested server-side.** The browser formats; it does not calculate.
- **Commit at the end of every task**, with the message given in the task's final step.
- **Command surface** (verified against the live template, 2026-08-15): the repo is a **Bun workspace** — `bun install` and `bun run --filter frontend <script>` run from the repo root. `test:unit` is vitest (added in Task 1.0); `test` is Playwright and stays that way. `lint` is **Biome**, not ESLint. Backend is `uv` with tests at `backend/tests/`. Client generation is `@hey-api/openapi-ts` via `frontend/openapi-ts.config.ts`.
- **`@tanstack/react-table` is already a dependency.** `StatTable` is still hand-built — the design needs sticky columns, roving-tabindex cell navigation, and group heading rows that react-table does not provide and would only wrap. Do not refactor `StatTable` onto it; do reach for it if a later screen needs column virtualisation.

---

## File Structure

```
snapcount/
├── backend/
│   ├── app/
│   │   ├── data/
│   │   │   ├── teams.json                    # 32 teams: abbr, name, nickname, conf, div, color
│   │   │   ├── champions.json                # 25 Super Bowls 2000-2024 — real, static
│   │   │   └── dynasties.json                # 4 dynasty-run notes — editorial, static
│   │   ├── models/
│   │   │   ├── team.py                       # Team
│   │   │   ├── season.py                     # Season, IngestRun
│   │   │   ├── game.py                       # Game
│   │   │   ├── stats.py                      # TeamSeasonStat, Player, PlayerSeasonStat
│   │   │   └── history.py                    # Champion, DynastyRun
│   │   ├── analytics/
│   │   │   ├── power.py                      # power_score() — pure
│   │   │   ├── standings.py                  # records, streak, form, SOS — pure
│   │   │   ├── leaders.py                    # metric extraction, baselines, qualifiers — pure
│   │   │   └── trends.py                     # cumulative differential, team schedule — pure
│   │   ├── ingest/
│   │   │   ├── source.py                     # NflverseSource protocol + nflreadpy impl
│   │   │   ├── teams.py                      # seed from teams.json
│   │   │   ├── history.py                    # seed from champions.json + dynasties.json
│   │   │   ├── games.py                      # schedules → Game
│   │   │   ├── players.py                    # player stats → Player/PlayerSeasonStat
│   │   │   ├── aggregate.py                  # Game → TeamSeasonStat
│   │   │   └── runner.py                     # orchestration + IngestRun bookkeeping
│   │   ├── api/routes/
│   │   │   ├── meta.py                       # /meta/freshness, /seasons
│   │   │   ├── weeks.py                      # /weeks/{season}/{week}
│   │   │   ├── standings.py                  # /standings/{season}
│   │   │   ├── leaders.py                    # /leaders/{season}
│   │   │   ├── teams.py                      # /teams/{season}/{abbr}
│   │   │   ├── players.py                    # /players/{id}, /players?season=&position=
│   │   │   ├── explorer.py                   # /explorer/differentials
│   │   │   └── history.py                    # /history/champions
│   │   └── schemas/                          # response models (one file per route module)
│   └── tests/{analytics,ingest,api}/
└── frontend/
    ├── public/fonts/                         # archivo-var, ibm-plex-sans-*, ibm-plex-mono-*  (woff2)
    └── src/
        ├── styles/
        │   ├── tokens.ds.css                 # verbatim DS tokens — REGENERATED, never hand-edited
        │   ├── tokens.app.css                # values the design uses that the DS omits — REGENERATED
        │   └── theme.css                     # shadcn semantic mapping — HAND-MAINTAINED
        ├── lib/
        │   ├── diverging.ts                  # §1.4 scale
        │   ├── contrast.ts                   # §1.7 luminance + ink pick
        │   └── format.ts                     # fixed-precision numeric formatters
        ├── components/
        │   ├── ui/                           # shadcn primitives (CLI-installed, then restyled)
        │   ├── stat-table/                   # StatTable + column types + sort + keyboard nav
        │   ├── team-chip.tsx
        │   ├── diff-cell.tsx
        │   ├── form-dots.tsx
        │   ├── power-bar.tsx
        │   ├── leader-bar.tsx
        │   ├── freshness-pill.tsx
        │   ├── season-week-picker.tsx
        │   ├── card-rail.tsx
        │   ├── trend-line.tsx                # §1.10 — the one chart convention
        │   ├── rate-card.tsx                 # player page value + delta + baseline bar
        │   ├── depth-panel.tsx               # team page position groups (deliberately empty)
        │   └── differential-grid/            # the signature 32x10 matrix
        └── routes/
            ├── __root.tsx                    # app shell
            ├── week.tsx
            ├── standings.tsx
            ├── leaders.tsx
            ├── team.$abbr.tsx
            ├── player.$playerId.tsx
            ├── explorer.tsx
            └── history.tsx
```

---

# Milestone M0 — Scaffold

### Task 0.1: Bootstrap the template and strip the demo model

> **Corrected against the live template, 2026-08-15.** The template no longer uses `copier` — there is no `copier.yml` and no interactive prompt. It is a Bun workspace monorepo cloned directly. Two further corrections to earlier drafts of this plan, both verified by inspection:
> - Backend tests live at **`backend/tests/`** (top level, with `conftest.py`), not `backend/app/tests/`. The plan's original paths were right.
> - `backend/app/models.py` is a **single flat file**, and `crud.py` beside it. Introducing a `models/` package (per the File Structure section) is a deliberate deviation justified by adding nine models; deleting `Item` is therefore an *edit* to `models.py`, not a file deletion.

**Files:**
- Create: the whole `snapcount/` tree from the template
- Delete: `backend/app/api/routes/items.py`, `backend/tests/api/routes/test_items.py`, `backend/tests/utils/item.py`, `frontend/src/routes/_layout/items.tsx`, `frontend/src/components/Items/`
- Modify: `backend/app/models.py` (drop the `Item*` classes), `backend/app/crud.py`, `backend/app/api/main.py`, `backend/tests/conftest.py`, `frontend/src/main.tsx`, `frontend/src/routeTree.gen.ts` (regenerated)

- [ ] **Step 1: Clone the template and detach it from its origin**

```bash
cd "/home/nyangi/Bread/Projects/In Progress/snapcount"
git clone --depth 1 https://github.com/fastapi/full-stack-fastapi-template.git .tmpl
shopt -s dotglob && mv .tmpl/* . && rm -rf .tmpl
rm -rf .git   # the template's history is not ours
```

Keep the four planning documents already in this directory — they are not template files and must survive the move.

- [ ] **Step 2: Write `.env` with generated secrets**

The template reads `.env` at the repo root. Generate real values rather than leaving the placeholders:

```bash
python3 -c "
import secrets
print('SECRET_KEY=' + secrets.token_urlsafe(32))
print('FIRST_SUPERUSER_PASSWORD=' + secrets.token_urlsafe(24))
print('POSTGRES_PASSWORD=' + secrets.token_urlsafe(24))
"
```

Set `PROJECT_NAME=Snapcount`, `STACK_NAME=snapcount`, `FIRST_SUPERUSER=gichuivictor@gmail.com`, and the three generated secrets. **Confirm `.gitignore` lists `.env` before the first commit** — the workspace's other projects have real populated env files on disk precisely because they are gitignored, and this one must be too.

- [ ] **Step 3: Confirm the toolchain**

```bash
docker compose up -d db          # pytest needs a live Postgres
cd backend && uv sync && uv run pytest -q
cd ../ && bun install && bun run --filter frontend build
```

Expected: backend tests pass (including the `Item` tests we are about to delete), frontend builds. Note `bun install` runs at the **repo root**, not in `frontend/` — this is a Bun workspace with `frontend` and `packages/*` as members.

- [ ] **Step 4: Initialise git and commit the untouched scaffold**

```bash
git init && git add -A && git commit -m "chore: scaffold from full-stack-fastapi-template"
```

Committing the scaffold *before* deleting anything makes the deletion diff readable.

- [ ] **Step 5: Delete the Item demo**

Remove the files listed above; strip the `Item`, `ItemBase`, `ItemCreate`, `ItemUpdate`, `ItemPublic`, and `ItemsPublic` classes from `models.py`; drop `create_item` from `crud.py`; drop the `items` router include from `api/main.py`; remove the Items fixtures from `conftest.py` and the Items route from the frontend. Regenerate the route tree (`bun run --filter frontend dev` writes `routeTree.gen.ts`, then stop it).

**Keep every auth file** — `users.py`, `login.py`, `security.py`, the `User` model, and their tests. Leave the two Alembic migrations that mention `item` alone: they are applied history, and rewriting them would break `alembic upgrade head` on an existing database. The Task 3.1 migration drops the table.

- [ ] **Step 6: Neutralise the theme toggle**

The template ships `next-themes` and `frontend/src/components/theme-provider.tsx` with a working dark mode. Plan §1.2 ships light-only, because the diverging scale cannot render on a dark canvas. Force the provider to light (`defaultTheme="light" forcedTheme="light"`) and remove the toggle control from the UI. Leave the dependency installed — reversing this is a design decision, and ripping the provider out would make that reversal expensive.

- [ ] **Step 7: Verify nothing auth-related broke**

```bash
cd backend && uv run pytest -q
cd ../ && bun run --filter frontend build
```

Expected: backend tests pass with the item tests gone and user/login tests still green. Frontend builds with no unresolved imports.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: remove demo Item model, routes, and screens; force light theme"
```

---

# Milestone M1 — Design system

### Task 1.0: Install a frontend unit-test runner

**The template has no unit test runner.** `frontend/package.json` defines `"test": "bunx playwright test"` — Playwright end-to-end only, with `frontend/tests/` holding browser specs. Every frontend unit test in this plan (Tasks 1.4, 2.1, 2.2, 5.4, 5.7) needs a runner that does not exist yet, and the `test` script name is already taken.

**Files:**
- Modify: `frontend/package.json`, `frontend/vite.config.ts`
- Create: `frontend/vitest.setup.ts`

- [ ] **Step 1: Add vitest and Testing Library**

```bash
cd "/home/nyangi/Bread/Projects/In Progress/snapcount"
bun add -D --filter frontend vitest @vitest/ui jsdom \
  @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

- [ ] **Step 2: Add the scripts under names Playwright does not own**

In `frontend/package.json`, leave `test` and `test:ui` pointing at Playwright and add:

```json
"test:unit": "vitest run",
"test:unit:watch": "vitest"
```

**Every `bun run test:unit` in this plan means vitest.** Playwright stays available for the e2e specs the template ships.

- [ ] **Step 3: Configure vitest against the existing Vite config**

In `frontend/vite.config.ts` add a `test` block — jsdom environment, globals on, `setupFiles: ['./vitest.setup.ts']`, and `exclude: ['tests/**', 'node_modules/**']` so vitest does not try to run the Playwright specs. `vitest.setup.ts` is one line: `import '@testing-library/jest-dom/vitest'`.

The path alias matters: the template resolves `@/` to `src/`, and the plan's test files import `@/lib/contrast`. Confirm the alias is picked up by vitest — it inherits from `resolve.alias` in the same config, so it should be, but verify rather than assume.

- [ ] **Step 4: Verify with a throwaway test**

```bash
cat > frontend/src/smoke.test.ts <<'EOF'
import { describe, expect, it } from 'vitest'
describe('vitest', () => { it('runs', () => { expect(1 + 1).toBe(2) }) })
EOF
bun run --filter frontend test:unit
rm frontend/src/smoke.test.ts
```

Expected: 1 passing test. Then confirm Playwright is untouched: `bun run --filter frontend test --list` should still enumerate the e2e specs.

- [ ] **Step 5: Commit**

```bash
git add frontend/package.json frontend/vite.config.ts frontend/vitest.setup.ts bun.lock
git commit -m "chore(frontend): add vitest and Testing Library for unit tests"
```

### Task 1.1: Self-host the three font families

**Files:**
- Create: `frontend/public/fonts/*.woff2`, `frontend/src/styles/fonts.css`
- Modify: `frontend/src/main.tsx` (import order)

- [ ] **Step 1: Fetch and subset the fonts**

Archivo must be the **variable** build — the design uses `font-stretch: 125%`, which a static instance cannot do. All sources below were verified reachable (HTTP 200) on 2026-08-15 and are OFL licensed, so redistribution in `public/` is fine.

Six files total: two variable, four static.

| Family | Source file in `google/fonts` | Kind |
|---|---|---|
| Archivo | `ofl/archivo/Archivo[wdth,wght].ttf` | variable, wdth + wght |
| IBM Plex Sans | `ofl/ibmplexsans/IBMPlexSans[wdth,wght].ttf` | variable, wdth + wght |
| IBM Plex Mono | `ofl/ibmplexmono/IBMPlexMono-{Regular,Medium,SemiBold,Bold}.ttf` | static ×4 |

**IBM Plex Mono has no variable build in that repo** — the directory holds statics only. Regular/Medium/SemiBold/Bold map to the design's 400/500/600/700.

```bash
cd frontend && mkdir -p public/fonts
BASE="https://github.com/google/fonts/raw/main/ofl"

curl -fsSL -o /tmp/archivo-var.ttf   "$BASE/archivo/Archivo%5Bwdth,wght%5D.ttf"
curl -fsSL -o /tmp/plexsans-var.ttf  "$BASE/ibmplexsans/IBMPlexSans%5Bwdth,wght%5D.ttf"
for w in Regular Medium SemiBold Bold; do
  curl -fsSL -o "/tmp/plexmono-$w.ttf" "$BASE/ibmplexmono/IBMPlexMono-$w.ttf"
done
```

Subset to Latin and convert with `fonttools`. The unicode range covers Latin-1, general punctuation (which carries the en dash `U+2013` the design uses in scores like `24–31`), the true minus `U+2212` used by signed differentials, and `U+00D7`:

```bash
SUB="U+0000-00FF,U+2000-206F,U+2212,U+00D7"

sub() {  # sub <in.ttf> <out.woff2>
  uvx --from "fonttools[woff]" pyftsubset "$1" --output-file="$2" --flavor=woff2 \
    --layout-features='*' --unicodes="$SUB" --name-IDs='*' --drop-tables+=DSIG
}

sub /tmp/archivo-var.ttf  public/fonts/archivo-var.woff2
sub /tmp/plexsans-var.ttf public/fonts/ibm-plex-sans-var.woff2
sub /tmp/plexmono-Regular.ttf  public/fonts/ibm-plex-mono-400.woff2
sub /tmp/plexmono-Medium.ttf   public/fonts/ibm-plex-mono-500.woff2
sub /tmp/plexmono-SemiBold.ttf public/fonts/ibm-plex-mono-600.woff2
sub /tmp/plexmono-Bold.ttf     public/fonts/ibm-plex-mono-700.woff2
```

**Critical for the variable files:** `pyftsubset` must preserve the `fvar`/`gvar` axes. Do **not** pass `--instantiate` or a `--variations` pin. Verify after subsetting:

```bash
uvx --from "fonttools[woff]" python -c "
from fontTools.ttLib import TTFont
for f in ('archivo-var','ibm-plex-sans-var'):
    t = TTFont('public/fonts/%s.woff2' % f)
    axes = [(a.axisTag, a.minValue, a.maxValue) for a in t['fvar'].axes]
    print(f, axes)
"
```

Expected, per family:

- **Archivo** — `wdth` spanning at least 62–125, `wght` at least 100–900. The 125 is the load-bearing number: Archivo is the only family the design ever stretches.
- **IBM Plex Sans** — `wdth` about 75–100, `wght` 100–700. Topping out at width 100 is correct; nothing ever asks Plex Sans for 125%.

**If `fvar` is missing from either file, the subset destroyed the variable axes and `font-stretch: 125%` will silently do nothing.**

`pyftsubset` needs a Brotli encoder to emit woff2 and the bare package does not carry one — hence `fonttools[woff]` above, not `fonttools`.

- [ ] **Step 2: Write the `@font-face` declarations**

`frontend/src/styles/fonts.css`:

```css
@font-face {
  font-family: 'Archivo';
  src: url('/fonts/archivo-var.woff2') format('woff2-variations');
  font-weight: 600 800;
  font-stretch: 62% 125%;
  font-display: swap;
}
@font-face {
  font-family: 'IBM Plex Sans';
  src: url('/fonts/ibm-plex-sans-var.woff2') format('woff2-variations');
  font-weight: 400 700;
  font-stretch: 85% 100%;
  font-display: swap;
}
@font-face {
  font-family: 'IBM Plex Mono';
  src: url('/fonts/ibm-plex-mono-400.woff2') format('woff2');
  font-weight: 400; font-display: swap;
}
/* …repeat the Mono block for 500, 600, 700 */
```

Note the two variable families declare a `font-weight` *range* and use `format('woff2-variations')`; Mono declares four separate blocks with single weights. Getting this backwards is the usual cause of a variable font rendering at only one weight.

- [ ] **Step 3: Wire it in and confirm no network font requests remain**

Import `fonts.css` first in the CSS chain (Task 1.2 Step 4 sets the full order). Then run `bun run --filter frontend dev`, open DevTools → Network, filter `font`, and hard-reload. Expected: only same-origin `/fonts/*.woff2`. Zero requests to `fonts.googleapis.com` or `fonts.gstatic.com`.

- [ ] **Step 4: Verify the variable width axis actually works**

The `fvar` check in Step 1 proves the axes survived subsetting; this proves the browser applies them. Add a scratch element with `font-family:Archivo; font-stretch:125%; font-weight:700` beside one at `font-stretch:100%`. Expected: visibly wider glyphs, and `getComputedStyle(el).fontStretch === '125%'`. If the two render identically, the `@font-face` block is missing its `font-stretch` range — a variable axis is only reachable if the descriptor advertises it.

- [ ] **Step 5: Commit**

```bash
git add frontend/public/fonts frontend/src/styles/fonts.css
git commit -m "feat(design): self-host Archivo variable, IBM Plex Sans and Mono as woff2 subsets"
```

### Task 1.2: Land the three-layer token CSS

**Files:**
- Create: `frontend/src/styles/tokens.ds.css`, `frontend/src/styles/tokens.app.css`, `frontend/src/styles/theme.css`
- Modify: `frontend/src/main.tsx`

**Interfaces:**
- Produces: the full shadcn semantic variable set (`--background`, `--foreground`, `--card`, `--card-foreground`, `--popover`, `--popover-foreground`, `--primary`, `--primary-foreground`, `--secondary`, `--secondary-foreground`, `--muted`, `--muted-foreground`, `--accent`, `--accent-foreground`, `--destructive`, `--destructive-foreground`, `--border`, `--input`, `--ring`, `--radius`, `--chart-1..5`), plus the app tokens named in §1.5.

- [ ] **Step 1: Copy the DS tokens verbatim into `tokens.ds.css`**

The three source files were exported from the Claude Design project and are on disk at:

```
.superpowers/sdd/nfl-implemnentation2/design-tokens/colors.css
.superpowers/sdd/nfl-implemnentation2/design-tokens/typography.css
.superpowers/sdd/nfl-implemnentation2/design-tokens/spacing.css
```

Concatenate them into `frontend/src/styles/tokens.ds.css` — **values unchanged, names unchanged, not reformatted, not reordered, not converted between color spaces.** The `oklch()` values in particular must be copied character for character; "tidying" `oklch(0.98 0.002 90)` into a hex equivalent silently changes the color and defeats the point of this file.

`tokens/fonts.css` is deliberately absent from that directory — it was only the Google Fonts `@import`, replaced by Task 1.1. `styles.css` is likewise omitted; it was nothing but `@import` plumbing.

Head the file with:

```css
/* GENERATED from Claude Design project 602fdce0-a466-4323-b590-7205741e19a2,
   design system victor-s-work-of-art-fa259736-569f-484e-a5f2-cf6f508b2477.
   REGENERATED ON RE-IMPORT. Never hand-edit — put decisions in theme.css. */
```

Drop the DS `--font-display/body/mono` declarations: the design overrides all three (§1.1) and leaving both in place makes the cascade order load-bearing.

- [ ] **Step 2: Write `tokens.app.css` — the values the design uses that the DS omits**

Every token from §1.5, plus the two overridden type sizes, each with its source:

```css
/* GENERATED from `NFL Analysis Platform.dc.html`.
   These are values the design uses inline that the DS token files never declared.
   REGENERATED ON RE-IMPORT. Never hand-edit. */
:root {
  /* families — the design overrides the DS (see theme.css §1.1) */
  --font-display: 'Archivo', sans-serif;
  --font-body: 'IBM Plex Sans', -apple-system, sans-serif;
  --font-mono: 'IBM Plex Mono', ui-monospace, monospace;

  /* type sizes the design deviates on */
  --text-h1-app: 44px;   /* DS --text-h1 is 36px */
  --text-h2-app: 28px;   /* DS --text-h2 is 26px */
  --tracking-h1: -0.02em;
  --stretch-display: 125%;

  /* surfaces */
  --app-canvas: #FAF9F6;                    /* NOT --bone (#F4F1EA) */
  --app-row-zebra: oklch(0.99 0.002 90);    /* lighter than --gray-50 */

  /* orchid ramp at hue 300 (note: --orchid itself is hue ~310) */
  --orchid-900: oklch(0.24 0.10 300);
  --orchid-700: oklch(0.35 0.13 300);
  --orchid-600: oklch(0.45 0.12 300);
  --orchid-tint: oklch(0.95 0.06 300);

  /* emerald tints */
  --emerald-tint: oklch(0.95 0.05 155);
  --emerald-tint-strong: oklch(0.96 0.03 155);
  --emerald-tint-border: oklch(0.86 0.06 155);

  /* negative ink ramp */
  --ink-negative: oklch(0.50 0.17 25);
  --ink-negative-mid: oklch(0.45 0.17 25);
  --ink-negative-strong: #3A0B08;
}
```

- [ ] **Step 3: Write `theme.css` — the shadcn mapping and the decision record**

This is the hand-maintained file. Open it with the judgment calls so a re-import cannot silently erase them:

```css
/* HAND-MAINTAINED. Assigns shadcn's semantic variables from the design's tokens.
   The design's tokens are the source of truth; shadcn's names are the interface.
 *
 * DECISIONS (full rationale in nfl-implemnentation2.md §1):
 * 1.1 Design overrides DS fonts: Archivo / IBM Plex Sans / IBM Plex Mono.
 *     Playfair Display, Manrope, JetBrains Mono are never loaded.
 * 1.2 LIGHT ONLY. No dark block, no theme toggle. The diverging scale generates
 *     L 0.75-0.97 backgrounds, unusable on the DS's #0A0A0C dark canvas.
 *     Dark mode needs a design pass, not a token remap.
 * 1.3 Canvas is --app-canvas (#FAF9F6), not --bone (#F4F1EA). Different colors.
 * 1.5 ~12 colors used by the design were absent from the DS token files;
 *     they live in tokens.app.css, not here, so re-import regenerates them.
 * --destructive maps to --danger, which the DS README flags as an addition the
 *     original source never defined. It appears in no NFL screen.
 * --chart-1..5 are assigned for shadcn compatibility only. Real chart series use
 *     team colors or the diverging scale from lib/diverging.ts — never these.
 */
:root {
  --background: var(--app-canvas);
  --foreground: var(--text-primary-light);
  --card: var(--surface-card-light);
  --card-foreground: var(--text-primary-light);
  --popover: var(--surface-card-light);
  --popover-foreground: var(--text-primary-light);

  --primary: var(--orchid-900);            /* active tab bg in the design */
  --primary-foreground: var(--accent-secondary-ink);
  --secondary: var(--gray-100);
  --secondary-foreground: var(--text-secondary-light);

  --muted: var(--gray-100);
  --muted-foreground: var(--gray-500);     /* the design's ubiquitous label gray */
  --accent: var(--emerald);
  --accent-foreground: var(--accent-primary-ink);

  --destructive: var(--danger);
  --destructive-foreground: var(--white);

  --border: var(--gray-200);
  --input: var(--gray-300);                /* the design's select/button borders */
  --ring: var(--orchid);                   /* focus ring is #6B21A8 in the design */

  --radius: var(--radius-md);

  --chart-1: var(--emerald);
  --chart-2: var(--orchid);
  --chart-3: var(--gray-500);
  --chart-4: var(--emerald-dark);
  --chart-5: var(--orchid-light);
}

html, body { background: var(--app-canvas); color: var(--text-primary-light); }

.tabular { font-variant-numeric: tabular-nums; }   /* §1.9: no slashed-zero */

h1, h2, [data-display] {
  font-family: var(--font-display);
  font-stretch: var(--stretch-display);
  font-weight: 700;
}

:where(button, [tabindex], a, input, select):focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition: none !important; }
}
```

- [ ] **Step 4: Extend the Tailwind config from the semantic layer**

In `frontend/src/index.css` (Tailwind v4 uses `@theme inline`, not a JS config):

```css
@import './styles/fonts.css';
@import './styles/tokens.ds.css';
@import './styles/tokens.app.css';
@import './styles/theme.css';
@import 'tailwindcss';

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-primary: var(--primary);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-border: var(--border);
  --color-ring: var(--ring);
  --font-display: var(--font-display);
  --font-body: var(--font-body);
  --font-mono: var(--font-mono);
  --spacing-1: var(--sp-1);
  /* …through --spacing-24: var(--sp-24) */
  --radius-sm: var(--radius-sm);
  --radius-md: var(--radius-md);
  --radius-lg: var(--radius-lg);
  --radius-xl: var(--radius-xl);
}
```

Import order matters: tokens before Tailwind, so `@theme inline` can resolve them.

If the pulled template still uses Tailwind v3, put the same mappings in `tailwind.config.ts` under `theme.extend` as `var(--…)` references instead.

- [ ] **Step 5: Verify the decimal-alignment requirement**

The handoff makes this an explicit gate. Render a scratch column of signed decimals with `.tabular` and `text-align: right`:

```
  +4.2
 −18.7
  +0.201
−185
```

Expected: all glyphs occupy equal advance width and the column edge is flush. If figures shift, `.tabular` is not reaching the element or the mono subset dropped `tnum`.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/styles frontend/src/index.css
git commit -m "feat(design): map design tokens into shadcn's semantic layer (light-only)"
```

### Task 1.3: Install the shadcn primitives

**Files:**
- Create: `frontend/src/components/ui/*.tsx`

- [ ] **Step 1: Install only what is actually missing**

**The template already ships 10 of the 12.** Verified on disk in `frontend/src/components/ui/`: `table`, `select`, `tabs`, `badge`, `button`, `card`, `checkbox`, `separator`, `skeleton`, `tooltip` — plus `alert`, `avatar`, `button-group`, `dialog`, `dropdown-menu`, `form`, `input`, `label`, `loading-button`, `pagination`, `password-input`, `sheet`, `sidebar`, `sonner`.

Only two are absent:

```bash
cd frontend && bunx --bun shadcn@latest add scroll-area toggle-group
```

`@radix-ui/react-scroll-area` is already a dependency; `toggle-group` will pull in `@radix-ui/react-toggle-group` and `@radix-ui/react-toggle`.

**Do not re-add the other ten.** The CLI would overwrite them with stock versions, discarding the template's own edits and anything Step 2 below has already fixed. This task is mostly an *audit* of primitives that already exist, not a bulk install.

Each maps to something concrete in the design:

| Primitive | Design element |
|---|---|
| `table` | slate table, standings table (see §1.6) |
| `select` | season, week, metric, top-N |
| `tabs` | QB/RB/WR/TE segmented control |
| `toggle-group` | conference pills, slate filter pills |
| `checkbox` | "Group by division" |
| `badge` | status chips, seed badge, storyline tags |
| `card` | game cards, featured cards, leader cards |
| `tooltip` | column-header explanations (`title` attrs in the mockup) |
| `skeleton` | loading states |
| `separator` | card internal rules |
| `scroll-area` | table overflow containers |
| `button` | rail arrows, header nav |

- [ ] **Step 2: Strip hard-coded values out of the installed source**

The CLI emits components carrying its own defaults. Grep for anything not resolving through a variable:

```bash
grep -rnE '#[0-9A-Fa-f]{3,8}|\[[0-9]+px\]' src/components/ui/
```

Expected after fixing: no matches. Replace each with the matching token.

- [ ] **Step 3: Verify the primitives render on the app canvas**

Drop one of each onto a scratch route. Expected: white cards on `#FAF9F6`, gray-200 borders, orchid focus rings on tab.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/ui
git commit -m "feat(design): install shadcn primitives and restyle from the semantic layer"
```

### Task 1.4: `lib/diverging.ts` and `lib/contrast.ts`

**Files:**
- Create: `frontend/src/lib/diverging.ts`, `frontend/src/lib/contrast.ts`
- Test: `frontend/src/lib/diverging.test.ts`, `frontend/src/lib/contrast.test.ts`

**Interfaces:**
- Produces: `divergingCell(value: number, domain?: number): { background: string; color: string }`; `inkFor(hex: string): '#FFFFFF' | '#0A0A0C'`; `contrastRatio(a: string, b: string): number`

- [ ] **Step 1: Write the failing tests for the diverging scale**

`frontend/src/lib/diverging.test.ts` — expected values computed from §1.4 by hand:

```ts
import { describe, expect, it } from 'vitest'
import { divergingCell } from './diverging'

describe('divergingCell', () => {
  it('returns the neutral pair at exactly zero', () => {
    expect(divergingCell(0)).toEqual({
      background: 'var(--gray-100)',
      color: 'var(--gray-600)',
    })
  })

  it('scales a strong positive toward emerald with strong ink', () => {
    // mag = 131/150 = 0.873333 -> L 0.97-0.19213 = 0.77787, C 0.04+0.10480 = 0.14480
    expect(divergingCell(131)).toEqual({
      background: 'oklch(0.7779 0.1448 155)',
      color: 'var(--accent-primary-ink)',
    })
  })

  it('uses mid ink below the 0.55 magnitude threshold', () => {
    // mag = 30/150 = 0.2 -> L 0.926, C 0.064
    expect(divergingCell(30)).toEqual({
      background: 'oklch(0.926 0.064 155)',
      color: 'var(--emerald-dark)',
    })
  })

  it('saturates at the domain edge for negatives', () => {
    // |-185|/150 clamps to 1 -> L 0.77, C 0.17, hue 25
    expect(divergingCell(-185)).toEqual({
      background: 'oklch(0.77 0.17 25)',
      color: 'var(--ink-negative-strong)',
    })
  })

  it('normalises other signed quantities onto the same ±150 domain', () => {
    // EPA/play of +0.201 against a ±0.30 domain == the same visual weight as +100.5 points
    expect(divergingCell(0.201, 0.3)).toEqual(divergingCell(100.5))
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun run test:unit src/lib/diverging.test.ts`
Expected: FAIL — `Failed to resolve import "./diverging"`.

- [ ] **Step 3: Implement the scale**

```ts
const round = (n: number) => Math.round(n * 1e4) / 1e4

/**
 * The one diverging scale, ported verbatim from `diffCell(v)` in
 * `NFL Analysis Platform.dc.html`. See plan §1.4.
 *
 * `domain` is the magnitude at which the scale saturates. It defaults to 150
 * season points; any other signed quantity must pass its own domain rather
 * than getting a scale of its own.
 */
export function divergingCell(value: number, domain = 150) {
  if (value === 0) {
    return { background: 'var(--gray-100)', color: 'var(--gray-600)' }
  }
  const mag = Math.min(Math.abs(value) / domain, 1)
  const strong = mag > 0.55

  if (value > 0) {
    return {
      background: `oklch(${round(0.97 - mag * 0.22)} ${round(0.04 + mag * 0.12)} 155)`,
      color: strong ? 'var(--accent-primary-ink)' : 'var(--emerald-dark)',
    }
  }
  return {
    background: `oklch(${round(0.97 - mag * 0.2)} ${round(0.04 + mag * 0.13)} 25)`,
    color: strong ? 'var(--ink-negative-strong)' : 'var(--ink-negative-mid)',
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `bun run test:unit src/lib/diverging.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Write the failing contrast tests**

`frontend/src/lib/contrast.test.ts` — the eight failures from §1.7:

```ts
import { describe, expect, it } from 'vitest'
import { contrastRatio, inkFor } from './contrast'

describe('contrastRatio', () => {
  it('is 21 for black on white', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 1)
  })
  it('confirms Tennessee blue fails AA against white', () => {
    expect(contrastRatio('#4B92DB', '#FFFFFF')).toBeLessThan(4.5)
  })
})

describe('inkFor', () => {
  it('picks white on dark team colors', () => {
    expect(inkFor('#0A0A0C')).toBe('#FFFFFF')  // PIT / LV
    expect(inkFor('#002244')).toBe('#FFFFFF')  // SEA
  })

  it('flips to near-black on the light team colors that fail AA on white', () => {
    for (const hex of ['#4B92DB', '#0085CA', '#008E97', '#FB4F14', '#9F8958', '#0080C6', '#0076B6']) {
      expect(inkFor(hex)).toBe('#0A0A0C')
    }
  })

  it('always clears AA for whichever ink it picks, across all 32 team colors', () => {
    const colors = ['#00338D','#008E97','#002A5C','#115740','#241773','#101820','#FB4F14','#311D00',
      '#03202F','#006778','#003A70','#4B92DB','#E31837','#FB4F14','#0080C6','#101820',
      '#004C54','#5A1414','#041E42','#0B2265','#0076B6','#203731','#4F2683','#0B162A',
      '#D50A0A','#A71930','#9F8958','#0085CA','#AA0000','#003594','#002244','#97233F']
    for (const hex of colors) {
      expect(contrastRatio(hex, inkFor(hex))).toBeGreaterThanOrEqual(4.5)
    }
  })
})
```

- [ ] **Step 6: Run to verify it fails**

Run: `bun run test:unit src/lib/contrast.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 7: Implement the luminance flip**

```ts
const WHITE = '#FFFFFF'
const NEAR_BLACK = '#0A0A0C'   // --black

function channel(v: number) {
  const c = v / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

function luminance(hex: string) {
  const h = hex.replace('#', '')
  const [r, g, b] = [0, 2, 4].map((i) => channel(parseInt(h.slice(i, i + 2), 16)))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrastRatio(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/**
 * Team chips are the team's primary color with the abbreviation on top. The
 * design hard-codes white ink, which fails AA for 8 of 32 teams (plan §1.7).
 * Team color still owns the chip; only the ink adapts.
 */
export function inkFor(background: string) {
  return contrastRatio(background, WHITE) >= contrastRatio(background, NEAR_BLACK)
    ? WHITE
    : NEAR_BLACK
}
```

- [ ] **Step 8: Run to verify it passes**

Run: `bun run test:unit src/lib/contrast.test.ts`
Expected: PASS. If the 32-color sweep fails for any team, that team's color clears neither ink at 4.5:1 — report it rather than lowering the threshold.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/lib
git commit -m "feat(design): port the diverging scale and fix team-chip contrast to AA"
```

---

# Milestone M2 — Shared components

Built against local fixtures, before any consumer exists.

### Task 2.1: `TeamChip`, `DiffCell`, `FormDots`, `PowerBar`, `LeaderBar`

**Files:**
- Create: `frontend/src/components/team-chip.tsx`, `diff-cell.tsx`, `form-dots.tsx`, `power-bar.tsx`, `leader-bar.tsx`
- Test: `frontend/src/components/team-chip.test.tsx`

**Interfaces:**
- Consumes: `divergingCell`, `inkFor` from Task 1.4
- Produces:
  - `<TeamChip abbr={string} color={string} size?: 26|30|34 />`
  - `<DiffCell value={number} domain?: number />`
  - `<FormDots form={string} />` — e.g. `"WWLWW"`, newest last
  - `<PowerBar value={number} min={number} max={number} />`
  - `<LeaderBar value={number} top={number} baseline={number} isLeader={boolean} />`

- [ ] **Step 1: Write the failing TeamChip test**

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TeamChip } from './team-chip'

describe('TeamChip', () => {
  it('renders the abbreviation on the team color', () => {
    render(<TeamChip abbr="BUF" color="#00338D" />)
    const chip = screen.getByText('BUF')
    expect(chip).toHaveStyle({ background: '#00338D' })
  })

  it('flips ink to near-black on a light team color', () => {
    render(<TeamChip abbr="TEN" color="#4B92DB" />)
    expect(screen.getByText('TEN')).toHaveStyle({ color: '#0A0A0C' })
  })

  it('exposes the full team name to assistive tech', () => {
    render(<TeamChip abbr="BUF" color="#00338D" name="Buffalo Bills" />)
    expect(screen.getByLabelText('Buffalo Bills')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun run test:unit src/components/team-chip.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement TeamChip**

Geometry from the mockup's `chip(abbr, size)`: square, `border-radius: 8px`, `inset 0 0 0 1px rgba(255,255,255,0.18)`, font-size 11 at ≥30px and 10 below, weight 800, letter-spacing 0.02em, body font.

```tsx
import { inkFor } from '@/lib/contrast'

export function TeamChip({
  abbr, color, name, size = 30,
}: { abbr: string; color: string; name?: string; size?: 26 | 30 | 34 }) {
  return (
    <span
      aria-label={name}
      title={name}
      style={{
        width: size, height: size, minWidth: size,
        borderRadius: 'var(--radius-sm)',
        background: color,
        color: inkFor(color),
        fontFamily: 'var(--font-body)',
        fontSize: size >= 30 ? 11 : 10,
        fontWeight: 800,
        letterSpacing: '0.02em',
        boxShadow: 'inset 0 0 0 1px rgb(255 255 255 / 0.18)',
      }}
      className="inline-flex items-center justify-center"
    >
      {abbr}
    </span>
  )
}
```

The inline `style` is permitted here and only here: team color is *data*, arriving at runtime from the API, so it cannot resolve through a static token.

- [ ] **Step 4: Run to verify it passes**

Run: `bun run test:unit src/components/team-chip.test.tsx`
Expected: PASS, 3 tests.

- [ ] **Step 5: Implement the four remaining marks**

`DiffCell` — `divergingCell(value, domain)` on a `.tabular` right-aligned span, `padding: 4px 8px`, `border-radius: 6px`, 13px/700, sign always shown for non-zero.

`FormDots` — splits the form string into 16×16 rounded squares, 9px/800; `W` on `--emerald` with white ink, `L` on `--gray-300` with `--gray-700`. Wrap in `<span role="img" aria-label="Last 5: W W L W W, most recent last">`; the individual squares are `aria-hidden`.

`PowerBar` — width `6 + ((value - min) / (max - min || 1)) * 46` px, height 8, radius 4, `--orchid-700`. `aria-hidden`; the adjacent numeral carries the value.

`LeaderBar` — 10px track on `--gray-100`; fill width `(value / top) * 100%` in `--emerald` when leader else `--orchid-600`, transitioning `width 180ms var(--ease-standard)`; a 2px dashed `--gray-500` marker at `(baseline / top) * 100%`. Give the marker a `<title>` naming the baseline value.

- [ ] **Step 6: Verify the marks against the mockup**

Open `resources/design-v2-seven-screens.html` beside `bun run dev` at the same zoom. Compare chip size, corner radius, form-dot spacing, and bar heights. Expected: no visible difference at 100%.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components
git commit -m "feat(ui): team chip, diverging cell, form dots, power bar, leader bar"
```

### Task 2.2: `StatTable`

The component everything depends on. Built and finished before it has a real consumer.

**Files:**
- Create: `frontend/src/components/stat-table/stat-table.tsx`, `columns.ts`, `use-sortable.ts`, `index.ts`
- Test: `frontend/src/components/stat-table/stat-table.test.tsx`

**Interfaces:**
- Consumes: shadcn `table`, `skeleton`, `tooltip` from Task 1.3
- Produces:

```ts
export type Align = 'left' | 'right' | 'center'

export interface StatColumn<Row> {
  key: string
  label: string
  title?: string                       // tooltip text; the mockup's `title` attr
  width: number | string               // from the mockup's grid-template-columns
  align?: Align                        // Resolved from the COLUMN ALONE, never from the data —
                                       // otherwise a numeric header left-aligns on the empty first
                                       // render and snaps right when data arrives.
                                       // Right by default only when `precision` or `signed` is set.
                                       // A PLAIN COUNT COLUMN (rank, G, PF, PA, TD) HAS NEITHER, SO
                                       // IT MUST DECLARE align: 'right' EXPLICITLY or it renders left.
  precision?: number                   // FIXED PER COLUMN — never per cell
  signed?: boolean                     // ALSO fixed per column. Sign is a property of the
                                       // quantity, not the cell. Default false: only genuinely
                                       // signed values (differential, margin, cumulative,
                                       // vs-baseline) carry a '+'. Without this, PF renders
                                       // '+472' and rank renders '+1'.
  sortable?: boolean
  sticky?: boolean                     // first column only
  value?: (row: Row) => number | string        // sort key
  render?: (row: Row) => React.ReactNode       // cell content
}

export interface StatTableProps<Row> {
  columns: StatColumn<Row>[]
  rows: Row[]
  rowKey: (row: Row) => string
  sort?: { key: string; dir: 'asc' | 'desc' }
  onSortChange?: (sort: { key: string; dir: 'asc' | 'desc' }) => void
  groupBy?: (row: Row) => string | null        // renders a full-width group heading
  rowClassName?: (row: Row) => string | undefined  // overrides the zebra stripe; see Task 5.6
  isLoading?: boolean
  emptyMessage?: string
  caption: string                              // required — screen-reader table name
}
```

- [ ] **Step 1: Write the failing tests**

```tsx
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { StatTable, type StatColumn } from './stat-table'

type Row = { team: string; diff: number; pct: number }

const rows: Row[] = [
  { team: 'BUF', diff: 131, pct: 0.7647 },
  { team: 'CLE', diff: -185, pct: 0.1765 },
  { team: 'KC', diff: 123, pct: 0.7059 },
]

const columns: StatColumn<Row>[] = [
  { key: 'team', label: 'Team', width: 190, align: 'left', sticky: true, sortable: true, value: (r) => r.team },
  { key: 'diff', label: 'DIFF', title: 'Point differential', width: 84, sortable: true, value: (r) => r.diff },
  { key: 'pct', label: 'PCT', width: 68, precision: 3, sortable: true, value: (r) => r.pct },
]

const setup = (props = {}) =>
  render(<StatTable caption="Test standings" columns={columns} rows={rows} rowKey={(r) => r.team} {...props} />)

describe('StatTable', () => {
  it('renders a semantic table with a caption', () => {
    setup()
    expect(screen.getByRole('table', { name: 'Test standings' })).toBeInTheDocument()
    expect(screen.getAllByRole('row')).toHaveLength(4) // header + 3
  })

  it('applies fixed per-column precision, not per cell', () => {
    setup()
    expect(screen.getByText('.765')).toBeInTheDocument()
    expect(screen.getByText('.176')).toBeInTheDocument()
  })

  it('right-aligns numeric columns and left-aligns text', () => {
    setup()
    expect(screen.getByRole('columnheader', { name: /DIFF/ })).toHaveClass('text-right')
    expect(screen.getByRole('columnheader', { name: /Team/ })).toHaveClass('text-left')
  })

  it('marks sort state with aria-sort', () => {
    setup({ sort: { key: 'diff', dir: 'desc' } })
    expect(screen.getByRole('columnheader', { name: /DIFF/ })).toHaveAttribute('aria-sort', 'descending')
    expect(screen.getByRole('columnheader', { name: /PCT/ })).toHaveAttribute('aria-sort', 'none')
  })

  it('toggles direction when the active column is clicked again', () => {
    const onSortChange = vi.fn()
    setup({ sort: { key: 'diff', dir: 'desc' }, onSortChange })
    fireEvent.click(screen.getByRole('button', { name: /DIFF/ }))
    expect(onSortChange).toHaveBeenCalledWith({ key: 'diff', dir: 'asc' })
  })

  it('starts a newly-clicked column descending', () => {
    const onSortChange = vi.fn()
    setup({ sort: { key: 'diff', dir: 'desc' }, onSortChange })
    fireEvent.click(screen.getByRole('button', { name: /PCT/ }))
    expect(onSortChange).toHaveBeenCalledWith({ key: 'pct', dir: 'desc' })
  })

  it('sorts headers with the keyboard', () => {
    const onSortChange = vi.fn()
    setup({ onSortChange })
    const header = screen.getByRole('button', { name: /DIFF/ })
    header.focus()
    fireEvent.keyDown(header, { key: 'Enter' })
    expect(onSortChange).toHaveBeenCalled()
  })

  it('moves focus between cells with the arrow keys', () => {
    setup()
    const first = screen.getByText('BUF').closest('td')!
    first.focus()
    fireEvent.keyDown(first, { key: 'ArrowRight' })
    expect(document.activeElement).toHaveTextContent('+131') // diff column sets signed: true
  })

  it('renders skeleton rows while loading and no data rows', () => {
    setup({ isLoading: true })
    expect(screen.queryByText('BUF')).not.toBeInTheDocument()
    expect(screen.getAllByTestId('stat-table-skeleton-row').length).toBeGreaterThan(0)
  })

  it('renders the empty message when there are no rows', () => {
    setup({ rows: [], emptyMessage: 'No teams match this filter.' })
    expect(screen.getByText('No teams match this filter.')).toBeInTheDocument()
  })

  it('renders a full-width heading per group', () => {
    setup({ groupBy: (r: Row) => (r.team === 'CLE' ? 'AFC North' : 'AFC East') })
    const heading = screen.getByText('AFC North').closest('td')!
    expect(heading).toHaveAttribute('colspan', '3')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun run test:unit src/components/stat-table`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement StatTable**

Requirements, all exercised by the tests above:

- Semantic `<table>` + `<caption class="sr-only">`, `table-layout: fixed`, a `<colgroup>` built from `column.width` (§1.6).
- Sticky header: `<thead>` cells `position: sticky; top: 0; z-index: 2; background: var(--gray-50)`. Sticky first column: `position: sticky; left: 0; z-index: 1; background: inherit` on the `sticky` column's `th`/`td` — header intersection needs `z-index: 3`.
- Zebra rows: even `--card`, odd `--app-row-zebra`. Row borders `1px solid var(--gray-100)`, none on the last row.
- Numeric cells get `.tabular`, `text-right`, and `toFixed(precision)` when `precision` is set. `precision` lives on the column; a cell may never choose its own.
- Sortable headers are `<button>`s inside `<th>`, so they are tabbable for free. `aria-sort` on the `th` is `ascending` / `descending` / `none`. Active header gets `--orchid` and weight 800; the arrow (`↓` / `↑`) is decorative and `aria-hidden`, since `aria-sort` already carries it.
- New column click starts `desc`; re-clicking the active column flips. Sorting is *controlled* — `StatTable` never holds sort state, so the URL stays the source of truth.
- Roving-tabindex arrow navigation over cells: `ArrowLeft/Right/Up/Down`, plus `Home`/`End` for row ends and `PageUp`/`PageDown` for ten rows. One cell holds `tabIndex={0}` at a time; the rest are `-1`.
- `isLoading` renders `emptyMessage`-free skeleton rows at the real column widths (so the layout does not jump), each `data-testid="stat-table-skeleton-row"`.
- `groupBy` emits a `<tr>` with a single `<td colspan={columns.length}>` styled as the mockup's group label: 11px/800, `letter-spacing: 0.08em`, uppercase, `--orchid`.
- Horizontal overflow lives on a wrapper with `overflow-x: auto` and a `min-width` matching the summed column widths — the page body must never scroll horizontally.

- [ ] **Step 4: Run to verify it passes**

Run: `bun run test:unit src/components/stat-table`
Expected: PASS, 11 tests.

- [ ] **Step 5: Verify keyboard and screen-reader behaviour by hand**

Render the fixture on a scratch route. Tab to the first sortable header, press Enter, confirm sort flips and focus stays put. Tab into the body, arrow around, confirm the sticky first column never occludes the focused cell. Expected: focus ring always visible, never clipped by `overflow: hidden`.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/stat-table
git commit -m "feat(ui): StatTable with sticky header/column, controlled sort, keyboard nav"
```

### Task 2.3: `SeasonWeekPicker`, `FreshnessPill`, `CardRail`, and the app shell

**Files:**
- Create: `frontend/src/components/season-week-picker.tsx`, `freshness-pill.tsx`, `card-rail.tsx`
- Modify: `frontend/src/routes/__root.tsx`

**Interfaces:**
- Produces: `useSeasonWeek()` returning `{ season, week, setSeason, setWeek }` backed by router search params; `<FreshnessPill status={'live'|'final'|'stale'} label={string} />`; `<CardRail>` with `scrollBy(±644)` controls

- [ ] **Step 1: Define the search-param schema**

In `__root.tsx`, with zod, so every child route inherits it:

```ts
const rootSearchSchema = z.object({
  season: z.coerce.number().int().min(1999).max(2100).default(2025),
  week: z.coerce.number().int().min(1).max(22).default(15),
})
```

`useSeasonWeek` reads via `useSearch({ strict: false })` and writes via `navigate({ search: (prev) => ({ ...prev, season }) })`. **State never lives in `useState`** — the handoff makes linkability the point.

- [ ] **Step 2: Build the header**

From the mockup: sticky, `z-index: 20`, `rgb(255 255 255 / 0.97)` background, `1px solid var(--gray-200)` bottom border, `0 1px 0 rgb(10 10 12 / 0.04)` shadow. `max-width: 1360px`, padding `14px 28px`, `flex-wrap: wrap`.

Left: "Snapcount" in `--font-display` at 26px/700, `letter-spacing: -0.01em`, beside an 11px/700 uppercase `--gray-500` "NFL analysis" eyebrow.

Centre: three nav items — Week / Standings & power / Leaders — as TanStack Router `<Link>`s, **not** shadcn `tabs`, because they are routes. Active: `--orchid-900` background, `--accent-secondary-ink` text, weight 800, transparent border. Inactive: white, `--gray-200` border, `--gray-600` text, weight 600. Both preserve current search params across navigation.

Right: season select, week select (18 options), and the freshness pill.

- [ ] **Step 3: Build FreshnessPill**

Pill radius, `--emerald-tint-strong` background, `1px solid --emerald-tint-border`, a 7px dot in `--emerald`, 11px/700 uppercase `--emerald-dark` label. Three states: `live` (dot animates `livePulse` 2s, suppressed under `prefers-reduced-motion`), `final`, `stale` (swap to `--warning` / `--warning-ink`). Label text comes from the API, not the client.

- [ ] **Step 4: Build CardRail**

`display: flex; gap: var(--sp-4); overflow-x: auto; scroll-snap-type: x mandatory`, children `scroll-snap-align: start`. Hide the scrollbar via `[data-rail]` (`scrollbar-width: none` + `::-webkit-scrollbar{height:0}`). Two 42px arrow buttons calling `scrollBy({ left: ±644, behavior: 'smooth' })`.

Two things the mockup omits and we add: `behavior` must become `'auto'` under `prefers-reduced-motion`, and the arrows need `disabled` at each end (`scrollLeft <= 0`, `scrollLeft + clientWidth >= scrollWidth`) so keyboard users are not left pressing a dead control.

- [ ] **Step 5: Verify linkability and responsiveness**

Change season and week, copy the URL, open in a new tab. Expected: identical state. Then narrow to 375px. Expected: header wraps to two rows, no horizontal page scroll.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components frontend/src/routes/__root.tsx
git commit -m "feat(ui): app shell with URL-backed season/week state and freshness indicator"
```

---

# Milestone M3 — Data model and ingestion

### Task 3.1: Schema and the static team seed

**Files:**
- Create: `backend/app/data/teams.json`, `backend/app/models/{team,season,game,stats}.py`, one Alembic migration
- Test: `backend/tests/ingest/test_teams.py`

**Interfaces:**
- Produces: `Team`, `Season`, `IngestRun`, `Game`, `TeamSeasonStat`, `Player`, `PlayerSeasonStat`

- [ ] **Step 1: Write `teams.json` from the design's team table**

All 32 rows, with the primary hex taken verbatim from the mockup's `T` constant (§0.5). Team colors are **design data seeded from the repo**, never ingested — that way a feed change can never alter brand identity.

```json
[
  {"abbr": "BUF", "name": "Buffalo Bills", "nickname": "Bills", "conference": "AFC", "division": "East", "color": "#00338D"},
  {"abbr": "MIA", "name": "Miami Dolphins", "nickname": "Dolphins", "conference": "AFC", "division": "East", "color": "#008E97"}
]
```

…continuing for NE `#002A5C`, NYJ `#115740`, BAL `#241773`, PIT `#101820`, CIN `#FB4F14`, CLE `#311D00`, HOU `#03202F`, JAX `#006778`, IND `#003A70`, TEN `#4B92DB`, KC `#E31837`, DEN `#FB4F14`, LAC `#0080C6`, LV `#101820`, PHI `#004C54`, WAS `#5A1414`, DAL `#041E42`, NYG `#0B2265`, DET `#0076B6`, GB `#203731`, MIN `#4F2683`, CHI `#0B162A`, TB `#D50A0A`, ATL `#A71930`, NO `#9F8958`, CAR `#0085CA`, SF `#AA0000`, LAR `#003594`, SEA `#002244`, ARI `#97233F`.

`nickname` is the last word of the name — the mockup derives it with `.split(' ').pop()`, which breaks on none of the current 32 but is fragile, so we store it.

- [ ] **Step 2: Write the failing seed test**

```python
def test_seed_teams_loads_all_32_with_valid_colors(db: Session) -> None:
    seed_teams(db)
    teams = db.exec(select(Team)).all()
    assert len(teams) == 32
    assert {t.conference for t in teams} == {"AFC", "NFC"}
    assert all(len(t.color) == 7 and t.color.startswith("#") for t in teams)
    # four divisions of four in each conference
    afc = [t for t in teams if t.conference == "AFC"]
    assert sorted(Counter(t.division for t in afc).values()) == [4, 4, 4, 4]

def test_seed_teams_is_idempotent(db: Session) -> None:
    seed_teams(db)
    seed_teams(db)
    assert len(db.exec(select(Team)).all()) == 32
```

- [ ] **Step 3: Run to verify it fails**

Run: `cd backend && uv run pytest tests/ingest/test_teams.py -v`
Expected: FAIL — `ImportError: cannot import name 'seed_teams'`.

- [ ] **Step 4: Define the models**

```python
class Team(SQLModel, table=True):
    abbr: str = Field(primary_key=True, max_length=3)
    name: str
    nickname: str
    conference: str          # AFC | NFC
    division: str            # East | North | South | West
    color: str               # #RRGGBB — design data, seeded not ingested

class Season(SQLModel, table=True):
    year: int = Field(primary_key=True)
    current_week: int
    week_count: int = 18
    last_ingested_at: datetime | None = None

class Game(SQLModel, table=True):
    id: str = Field(primary_key=True)               # nflverse game_id
    season: int = Field(foreign_key="season.year", index=True)
    week: int = Field(index=True)
    game_type: str                                   # REG | WC | DIV | CON | SB
    kickoff_at: datetime
    away_team: str = Field(foreign_key="team.abbr")
    home_team: str = Field(foreign_key="team.abbr")
    away_score: int | None = None                    # None until played
    home_score: int | None = None
    spread_line: float | None = None                 # home-relative closing line
    total_line: float | None = None
    overtime: bool = False
    status: str = "scheduled"                        # scheduled | live | final | final_ot
    recap: str | None = None                         # editorial; see plan §2

class TeamSeasonStat(SQLModel, table=True):
    season: int = Field(foreign_key="season.year", primary_key=True)
    team: str = Field(foreign_key="team.abbr", primary_key=True)
    wins: int; losses: int; ties: int
    points_for: int; points_against: int
    sos: float                                       # opponent win rate
    streak: str                                      # "W3" | "L1"
    form: str                                        # last 5, newest last: "WWLWW"
    power: float                                     # computed, see analytics/power.py
    playoff_seed: int | None = None                  # null when unknown; see plan §2

class Player(SQLModel, table=True):
    id: str = Field(primary_key=True)                # nflverse gsis_id
    name: str
    position: str                                     # QB | RB | WR | TE | …
    team: str | None = Field(default=None, foreign_key="team.abbr")

class PlayerSeasonStat(SQLModel, table=True):
    season: int = Field(foreign_key="season.year", primary_key=True)
    player_id: str = Field(foreign_key="player.id", primary_key=True)
    team: str = Field(foreign_key="team.abbr")
    position: str = Field(index=True)
    games: int
    seasons_played: int
    attempts: int = 0; carries: int = 0; targets: int = 0; receptions: int = 0
    passing_yards: int = 0; passing_tds: int = 0; passing_epa: float = 0.0
    rushing_yards: int = 0; rushing_tds: int = 0; rushing_epa: float = 0.0
    receiving_yards: int = 0; receiving_tds: int = 0; receiving_epa: float = 0.0

class IngestRun(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    source: str
    season: int
    started_at: datetime
    finished_at: datetime | None = None
    status: str                                       # running | ok | failed
    rows: int = 0
    error: str | None = None

class Champion(SQLModel, table=True):
    """Super Bowl winners. Static reference data, seeded from champions.json —
    settled history, not something to re-ingest nightly."""
    season: int = Field(primary_key=True)             # the season, not the calendar year played
    team: str = Field(foreign_key="team.abbr")
    result: str                                        # "40–22 over Kansas City"

class DynastyRun(SQLModel, table=True):
    """Editorial. Seeded from dynasties.json; see plan §2."""
    id: int | None = Field(default=None, primary_key=True)
    team: str = Field(foreign_key="team.abbr")
    label: str                                         # "New England, 2001–2018"
    titles: int
    note: str
```

Index `Game` on `(season, week)`, `PlayerSeasonStat` on `(season, position)`, and `TeamSeasonStat` on `(season,)` — that last one carries the Explorer's 32×10 read, which is the widest query in the app.

Two `Champion` subtleties worth pinning now: the primary key is the **season**, not the calendar year the game was played (the 2024 season's Super Bowl was played in February 2025, and the design labels it 2024); and pre-2002 winners include franchises whose abbreviation has since changed. The seed uses current abbreviations so the foreign key resolves, with the historical name preserved in `result` prose where it differs.

- [ ] **Step 5: Implement `seed_teams` and generate the migration**

```bash
cd backend
uv run alembic revision --autogenerate -m "snapcount core schema"
uv run alembic upgrade head
```

Read the generated migration before applying it — autogenerate misses index and constraint details often enough to be worth a look.

- [ ] **Step 6: Run to verify it passes**

Run: `uv run pytest tests/ingest/test_teams.py -v`
Expected: PASS, 2 tests.

- [ ] **Step 7: Commit**

```bash
git add backend/app/models backend/app/data backend/app/alembic backend/tests
git commit -m "feat(db): core schema and static 32-team seed with design colors"
```

### Task 3.2: Derived analytics — power score, standings, leaders, trends

Pure functions with no database or network. The mockup's sample data doubles as the fixture, which is exactly what makes these testable: the expected values are computable by hand from §1.4 and the design's own formula.

**Files:**
- Create: `backend/app/analytics/{power,standings,leaders}.py`
- Test: `backend/tests/analytics/{test_power,test_standings,test_leaders}.py`

**Interfaces:**
- Produces:
  - `power_score(*, wins, losses, points_for, points_against, sos) -> float`
  - `derive_records(games: Sequence[Game]) -> dict[str, TeamRecord]` where `TeamRecord` carries `wins, losses, ties, points_for, points_against, streak, form, opponents`
  - `strength_of_schedule(team, records) -> float`
  - `metric_value(stat: PlayerSeasonStat, metric: str) -> float`, `baseline(stats, metric) -> float`, `is_qualified(stat) -> bool`

- [ ] **Step 1: Write the failing power-score test**

Expected values derived by hand from the mockup's formula against its own sample records:

```python
import pytest
from app.analytics.power import power_score

@pytest.mark.parametrize(
    ("wins", "losses", "pf", "pa", "sos", "expected"),
    [
        (13, 4, 472, 341, 0.512, 63.9),   # BUF
        (13, 4, 481, 326, 0.492, 65.2),   # PHI — best in the league
        (3, 14, 262, 447, 0.527, 32.4),   # CLE — worst in the league
    ],
)
def test_power_score_matches_the_design_formula(wins, losses, pf, pa, sos, expected):
    assert power_score(
        wins=wins, losses=losses, points_for=pf, points_against=pa, sos=sos
    ) == pytest.approx(expected, abs=0.05)


def test_power_score_is_50_for_a_perfectly_average_team():
    # .500 record, zero differential, average schedule -> the scale's midpoint
    assert power_score(
        wins=8, losses=8, points_for=350, points_against=350, sos=0.5
    ) == pytest.approx(50.0)


def test_power_score_handles_a_team_with_no_games_played():
    assert power_score(wins=0, losses=0, points_for=0, points_against=0, sos=0.5) == 50.0
```

- [ ] **Step 2: Run to verify it fails**

Run: `uv run pytest tests/analytics/test_power.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.analytics.power'`.

- [ ] **Step 3: Implement `power_score`**

```python
def power_score(
    *, wins: int, losses: int, points_for: int, points_against: int, sos: float
) -> float:
    """Composite power score, ported verbatim from the standings mockup.

    Stated on the Standings screen as
      0.55 x point differential per game + 0.30 x strength of schedule
      + 0.15 x win rate, scaled to 100.
    The scaling constants (2.6, 120, 62) spread each input across a comparable
    range around a base of 50. Every input is exposed as its own sortable
    column, so the score is never a black box.
    """
    games = wins + losses
    if games == 0:
        return 50.0

    differential_per_game = (points_for - points_against) / games
    return round(
        50.0
        + 0.55 * (differential_per_game * 2.6)
        + 0.30 * ((sos - 0.5) * 120)
        + 0.15 * ((wins / games - 0.5) * 62),
        1,
    )
```

- [ ] **Step 4: Run to verify it passes**

Run: `uv run pytest tests/analytics/test_power.py -v`
Expected: PASS, 5 tests.

- [ ] **Step 5: Write the failing standings-derivation tests**

```python
def test_derive_records_counts_wins_losses_and_points():
    games = [
        game("BAL", 31, "CIN", 24),   # helper: home, home_score, away, away_score
        game("BUF", 34, "NYJ", 13),
        game("CIN", 20, "BUF", 27),
    ]
    records = derive_records(games)
    assert records["BUF"].wins == 2 and records["BUF"].losses == 0
    assert records["CIN"].wins == 0 and records["CIN"].losses == 2
    assert records["BUF"].points_for == 61 and records["BUF"].points_against == 33


def test_form_is_newest_last_and_capped_at_five():
    # seven games, alternating; the design renders the most recent at the right
    records = derive_records(seven_alternating_games_for("CHI"))
    assert len(records["CHI"].form) == 5
    assert records["CHI"].form == "LWLWL"


def test_streak_counts_only_the_current_run():
    records = derive_records(games_for("KC", results="LLWWWWW"))
    assert records["KC"].streak == "W5"


def test_ties_break_a_streak_and_count_separately():
    records = derive_records(games_for("NYG", results="WWT"))
    assert records["NYG"].ties == 1
    assert records["NYG"].streak == "T1"


def test_unplayed_games_are_ignored():
    records = derive_records([scheduled_game("SF", "SEA")])
    assert "SF" not in records or records["SF"].wins + records["SF"].losses == 0


def test_strength_of_schedule_is_mean_opponent_win_rate():
    # BUF played two opponents, one 3-1 and one 1-3 -> (0.75 + 0.25) / 2
    assert strength_of_schedule("BUF", records) == pytest.approx(0.5)
```

- [ ] **Step 6: Run to verify it fails, then implement**

Run: `uv run pytest tests/analytics/test_standings.py -v` → FAIL.

Implement `derive_records` as a single pass over played games (`away_score is not None and home_score is not None`), accumulating per team. `form` keeps the last five results in kickoff order; `streak` walks backwards from the most recent until the result changes. A tie is `T`, breaks both W and L streaks, and counts toward neither `wins` nor `losses`.

`strength_of_schedule` is the mean win rate of every opponent faced, opponents counted once per meeting (so a division rival played twice weighs double — that is standard).

Run again → PASS.

- [ ] **Step 7: Write and implement the leaders tests**

```python
def test_metric_value_derives_per_play_epa_not_total():
    stat = PlayerSeasonStat(position="QB", attempts=600, passing_epa=120.6, ...)
    assert metric_value(stat, "epa") == pytest.approx(0.201)


def test_metric_value_returns_zero_epa_when_a_player_has_no_attempts():
    stat = PlayerSeasonStat(position="QB", attempts=0, passing_epa=0.0, ...)
    assert metric_value(stat, "epa") == 0.0


def test_metric_source_column_depends_on_position():
    # WR/TE read receiving_*, RB reads rushing_*, QB reads passing_*
    assert metric_value(wr_stat, "yds") == wr_stat.receiving_yards
    assert metric_value(rb_stat, "yds") == rb_stat.rushing_yards
    assert metric_value(qb_stat, "yds") == qb_stat.passing_yards


def test_baseline_is_the_mean_across_qualified_players_only():
    # an unqualified outlier must not drag the positional baseline
    assert baseline([qualified_a, qualified_b, unqualified_outlier], "epa") == \
        pytest.approx((metric_value(qualified_a, "epa") + metric_value(qualified_b, "epa")) / 2)


@pytest.mark.parametrize(
    ("position", "field", "value", "qualified"),
    [
        ("QB", "games", 14, True), ("QB", "games", 13, False),
        ("RB", "carries", 120, True), ("RB", "carries", 119, False),
        ("WR", "targets", 50, True), ("WR", "targets", 49, False),
        ("TE", "targets", 50, True), ("TE", "targets", 49, False),
    ],
)
def test_qualifier_thresholds_come_from_the_design(position, field, value, qualified):
    assert is_qualified(stat_with(position, **{field: value})) is qualified
```

The thresholds are stated verbatim on the Leaders mockup: "QB 14+ starts, RB 120+ carries, WR/TE 50+ targets."

Implement, run → PASS.

- [ ] **Step 8: Write and implement the trend tests**

The team page needs a team's games in schedule order with a running differential total. Pure, and the only input the trend chart takes.

```python
def test_team_schedule_is_ordered_by_kickoff_and_marks_home_away():
    rows = team_schedule("DET", games)
    assert [r.week for r in rows] == sorted(r.week for r in rows)
    assert rows[0].is_home in (True, False)


def test_cumulative_differential_is_a_running_total_of_margins():
    # DET wins by 7, loses by 3, wins by 14
    rows = team_schedule("DET", three_games)
    assert [r.margin for r in rows] == [7, -3, 14]
    assert [r.cumulative for r in rows] == [7, 4, 18]


def test_margin_is_signed_from_the_subject_teams_perspective():
    # the same game read from either side flips sign
    det = team_schedule("DET", [game(home="DET", hs=38, away="GB", as_=34)])[0]
    gb = team_schedule("GB", [game(home="DET", hs=38, away="GB", as_=34)])[0]
    assert det.margin == 4 and gb.margin == -4


def test_unplayed_games_appear_in_the_schedule_with_no_margin():
    rows = team_schedule("SF", [scheduled_game("SF", "SEA")])
    assert rows[0].margin is None and rows[0].cumulative is None
```

That last one matters for the chart: an in-progress season must plot the played games and stop, not plot zeros to week 18.

- [ ] **Step 9: Commit**

```bash
git add backend/app/analytics backend/tests/analytics
git commit -m "feat(analytics): power score, standings, leader baselines, and team trends"
```

### Task 3.3: Static history seed — champions and dynasty runs

Settled history, seeded from the repo rather than ingested. The 25 Super Bowl results in the mockup are accurate and are used verbatim.

**Files:**
- Create: `backend/app/data/champions.json`, `backend/app/data/dynasties.json`, `backend/app/ingest/history.py`
- Test: `backend/tests/ingest/test_history.py`

- [ ] **Step 1: Write the failing seed test**

```python
def test_seed_history_loads_25_super_bowls_covering_2000_to_2024(db):
    seed_teams(db); seed_history(db)
    champs = db.exec(select(Champion)).all()
    assert len(champs) == 25
    assert {c.season for c in champs} == set(range(2000, 2025))


def test_every_champion_resolves_to_a_current_team(db):
    seed_teams(db); seed_history(db)
    abbrs = {t.abbr for t in db.exec(select(Team)).all()}
    assert all(c.team in abbrs for c in db.exec(select(Champion)).all())


def test_title_counts_match_the_known_record(db):
    seed_teams(db); seed_history(db)
    counts = Counter(c.team for c in db.exec(select(Champion)).all())
    assert counts["NE"] == 6      # 2001, 2003, 2004, 2014, 2016, 2018
    assert counts["KC"] == 3      # 2019, 2022, 2023
    assert counts["PIT"] == 2 and counts["NYG"] == 2


def test_seed_history_is_idempotent(db):
    seed_teams(db); seed_history(db); seed_history(db)
    assert len(db.exec(select(Champion)).all()) == 25
```

- [ ] **Step 2: Run to verify it fails, write the JSON, implement `seed_history`, run to verify it passes**

`champions.json` is the mockup's `CHAMPS` array, keyed by season:

```json
[
  {"season": 2024, "team": "PHI", "result": "40–22 over Kansas City"},
  {"season": 2023, "team": "KC",  "result": "25–22 over San Francisco (OT)"},
  {"season": 2022, "team": "KC",  "result": "38–35 over Philadelphia"}
]
```

…through 2000 `BAL` "34–7 over New York". Note the en dashes (U+2013) in the scores — keep them; they are what the design renders.

`dynasties.json` carries the four runs with their notes verbatim from the mockup (`NE` 2001–2018 / 6, `KC` 2019–2023 / 3, `PIT` 2005–2010 / 2, `NYG` 2007–2011 / 2).

- [ ] **Step 3: Commit**

```bash
git add backend/app/data backend/app/ingest/history.py backend/tests/ingest/test_history.py
git commit -m "feat(db): seed Super Bowl champions 2000-2024 and dynasty runs"
```

### Task 3.4: nflverse ingestion

**Files:**
- Create: `backend/app/ingest/{source,games,players,aggregate,runner}.py`
- Modify: `backend/pyproject.toml`
- Test: `backend/tests/ingest/test_games.py`, `test_players.py`, `test_runner.py`

**Interfaces:**
- Consumes: models from 3.1, analytics from 3.2
- Produces: `class NflverseSource(Protocol)` with `schedules(season) -> list[dict]`, `player_stats(season) -> list[dict]`; `NflreadpySource` implementing it; `ingest_season(db, season, source) -> IngestRun`

- [ ] **Step 1: Add the dependency**

```bash
cd backend && uv add nflreadpy
```

`nflreadpy` 0.1.5 (Nov 2025) is the maintained successor to `nfl_data_py`, whose last release was Sept 2024. It returns Polars frames and caches downloads locally. Relevant functions: `load_schedules()`, `load_player_stats()`, `load_players()`, `get_current_season()`, `get_current_week()`.

- [ ] **Step 2: Verify the feed's actual column names before writing the mapper**

Do not guess at column names — check them once and pin what you find:

```bash
uv run python -c "
import nflreadpy as nfl
s = nfl.load_schedules().filter(nfl.pl.col('season') == 2024)
print(sorted(s.columns))
p = nfl.load_player_stats(seasons=[2024])
print(sorted(p.columns))
"
```

Record the exact names you get in a comment at the top of `source.py`. The mapping below assumes the long-standing nflverse names (`game_id`, `season`, `week`, `game_type`, `gameday`, `gametime`, `away_team`, `home_team`, `away_score`, `home_score`, `spread_line`, `total_line`, `overtime`); **if any differ, the mapper changes, not the model.**

- [ ] **Step 3: Define the source behind a Protocol**

```python
class NflverseSource(Protocol):
    def schedules(self, season: int) -> list[dict[str, Any]]: ...
    def player_stats(self, season: int) -> list[dict[str, Any]]: ...
```

`NflreadpySource` implements it against `nflreadpy`, converting Polars frames with `.to_dicts()`. Everything downstream depends on the Protocol, so swapping feeds (or standing up a fake in tests) touches one file.

- [ ] **Step 4: Write the failing mapper tests against a fake source**

The fake returns three hand-written rows, so these tests never touch the network:

```python
class FakeSource:
    def schedules(self, season):
        return [
            {"game_id": "2025_15_CIN_BAL", "season": 2025, "week": 15, "game_type": "REG",
             "gameday": "2025-12-11", "gametime": "20:15", "away_team": "CIN", "home_team": "BAL",
             "away_score": 24, "home_score": 31, "spread_line": 3.5, "total_line": 47.5, "overtime": 0},
            {"game_id": "2025_15_WAS_PHI", "season": 2025, "week": 15, "game_type": "REG",
             "gameday": "2025-12-14", "gametime": "13:00", "away_team": "WAS", "home_team": "PHI",
             "away_score": 27, "home_score": 30, "spread_line": 4.0, "total_line": 49.0, "overtime": 1},
            {"game_id": "2025_16_KC_LV", "season": 2025, "week": 16, "game_type": "REG",
             "gameday": "2025-12-21", "gametime": "16:25", "away_team": "KC", "home_team": "LV",
             "away_score": None, "home_score": None, "spread_line": 10.5, "total_line": 44.0, "overtime": 0},
        ]
    def player_stats(self, season): return []


def test_ingest_games_maps_the_feed_onto_the_model(db):
    ingest_games(db, 2025, FakeSource())
    game = db.get(Game, "2025_15_CIN_BAL")
    assert game.away_team == "CIN" and game.home_team == "BAL"
    assert game.away_score == 24 and game.home_score == 31
    assert game.status == "final"


def test_overtime_games_get_the_final_ot_status(db):
    ingest_games(db, 2025, FakeSource())
    assert db.get(Game, "2025_15_WAS_PHI").status == "final_ot"


def test_unplayed_games_stay_scheduled_with_null_scores(db):
    ingest_games(db, 2025, FakeSource())
    game = db.get(Game, "2025_16_KC_LV")
    assert game.status == "scheduled"
    assert game.away_score is None and game.home_score is None
    assert game.spread_line == 10.5      # the line exists before the game does


def test_ingest_games_is_idempotent_and_updates_scores_in_place(db):
    ingest_games(db, 2025, FakeSource())
    ingest_games(db, 2025, FakeSource())
    assert len(db.exec(select(Game)).all()) == 3


def test_ingest_preserves_an_editorial_recap_across_reruns(db):
    ingest_games(db, 2025, FakeSource())
    game = db.get(Game, "2025_15_CIN_BAL")
    game.recap = "Baltimore controlled the second half."
    db.commit()
    ingest_games(db, 2025, FakeSource())
    assert db.get(Game, "2025_15_CIN_BAL").recap == "Baltimore controlled the second half."
```

That last test matters: `recap` is the one column no feed owns, so an upsert must never clobber it.

- [ ] **Step 5: Run to verify they fail, then implement `ingest_games`**

Run → FAIL. Implement as an upsert keyed on `game_id`, combining `gameday` + `gametime` into a timezone-aware `kickoff_at` (the feed is US/Eastern), deriving `status` from score presence + the `overtime` flag, and **never writing `recap`**.

Run → PASS, 5 tests.

- [ ] **Step 6: Implement `ingest_players` and `aggregate_team_seasons`**

`ingest_players` upserts `Player` and `PlayerSeasonStat` from the feed's weekly rows summed to season totals, keyed on `(season, player_id)`.

`aggregate_team_seasons` reads the season's `Game` rows, calls `derive_records`, then `strength_of_schedule`, then `power_score`, and upserts `TeamSeasonStat`. It is a pure re-derivation — safe to run any number of times. Test it end-to-end from the `FakeSource` games: with only the two played fixtures, BAL should be 1-0 with `form == "W"` and `streak == "W1"`.

- [ ] **Step 7: Implement `ingest_season` with run bookkeeping**

Opens an `IngestRun` (`status="running"`), runs teams → games → players → aggregate in order inside one transaction, then closes it `ok` with a row count, or `failed` with the exception text and a rollback. Stamps `Season.last_ingested_at` on success — that is what the freshness pill reads.

Test that a failure mid-run leaves `status == "failed"` and no partial rows committed.

- [ ] **Step 8: Add the CLI entry point and do one real run**

```bash
uv run python -m app.ingest.runner --season 2024
```

2024 is a completed season, so the output is verifiable against public record. Expected: 32 teams, ~285 games, ~1600 player-season rows. Spot-check that the standings order looks like the real 2024 final standings. **This is the first point where the data is real; do not skip the eyeball.**

- [ ] **Step 9: Make the runner multi-season and backfill the Explorer's decade**

The Analytics Explorer is a 32 teams × 10 seasons matrix, so one season is not enough. Accept a range:

```bash
uv run python -m app.ingest.runner --from 2016 --to 2025
```

Each season gets its own `IngestRun` row so a partial backfill is legible and resumable — one failed season must not invalidate the nine that succeeded. Run them sequentially, not concurrently; `nflreadpy` caches downloads locally and parallel runs fight over that cache for no gain.

Expected: ~2,850 games and ~16,000 player-season rows. This is the largest single cost the four new screens add.

- [ ] **Step 10: Verify the decade matrix is complete and correct**

```bash
uv run python -c "
from app.core.db import engine; from sqlmodel import Session, select
from app.models.stats import TeamSeasonStat
with Session(engine) as s:
    rows = s.exec(select(TeamSeasonStat)).all()
    print('rows:', len(rows))
    by_season = {}
    for r in rows: by_season.setdefault(r.season, []).append(r)
    for yr in sorted(by_season): print(yr, len(by_season[yr]))
"
```

Expected: 320 rows, 32 per season for each of 2016–2025. A season short of 32 means a franchise relocation or rename the abbreviation mapping missed — **fix the mapping, do not pad the table.** (OAK→LV in 2020, SD→LAC in 2017, and STL→LAR in 2016 all fall inside this window and are the likely culprits.)

Then sanity-check against public record. These are exact, not approximate — verified against the
ingested data on 2026-08-16:

| Season | Team | Record | PF | PA | Differential |
|---|---|---|---|---|---|
| 2023 | SF | 12-5 | 491 | 298 | **+193** |
| 2020 | JAX | 1-15 | 306 | 492 | **−186** |
| 2024 | DET | 15-2 | 564 | 342 | **+222** |

If a value is off by a handful of points, suspect the game-type filter before suspecting the feed —
a stray postseason game inflates both PF and PA.

- [ ] **Step 11: Commit**

```bash
git add backend/app/ingest backend/tests/ingest backend/pyproject.toml backend/uv.lock
git commit -m "feat(ingest): nflverse ingestion for schedules, player stats, and team aggregates"
```

---

# Milestone M4 — API

### Task 4.1: The route modules

**Files:**
- Create: `backend/app/api/routes/{meta,weeks,standings,leaders,teams,players,explorer,history}.py`, `backend/app/schemas/*.py`
- Modify: `backend/app/api/main.py`
- Test: `backend/tests/api/test_{meta,weeks,standings,leaders,teams,players,explorer,history}.py`

**Interfaces:**
- Produces the response shapes the frontend is built against. Every screen gets exactly one request; nothing is assembled client-side.

```
GET /api/v1/meta/seasons
    -> [{ year, current_week, week_count, last_ingested_at }]

GET /api/v1/meta/freshness?season=2025
    -> { status: "live"|"final"|"stale", label: "Final · updated Feb 9", last_ingested_at }

GET /api/v1/weeks/{season}/{week}
    -> { season, week, label: "Week 15 · 2025 regular season",
         games: [{ id, kickoff_at, kickoff_label: "Sun 1:00p", status,
                   away: { abbr, nickname, name, color, score },
                   home: { abbr, nickname, name, color, score },
                   spread_line, line_label: "BAL -3.5", margin, recap }],
         featured: [{ game_id, eyebrow, away_abbr, home_abbr, score_label,
                      banner_color, stats: [{ key, value }] }] }

GET /api/v1/standings/{season}?conference=AFC|NFC
    -> { season, formula_label: "0.55 × point differential per game + …",
         rows: [{ rank, team: { abbr, name, nickname, conference, division, color },
                  wins, losses, ties, record_label: "13-4", pct, points_for, points_against,
                  differential, sos, streak, form, playoff_seed, power }] }

GET /api/v1/leaders/{season}?position=QB&metric=epa&limit=5
    -> { season, position, metric, metric_label: "EPA per play", unit: "EPA",
         precision: 3, baseline, qualifier_label: "QB 14+ games",
         rows: [{ rank, player: { id, name, team_abbr, team_color, meta: "6th season · 17 g" },
                  value, secondary: { key: "YDS", value: 4712 }, vs_baseline }] }

GET /api/v1/teams/{season}/{abbr}
    -> { team: { abbr, name, nickname, conference, division, color },
         record_label: "12-5", conference_label: "NFC North",
         stats: [{ key: "points / game", value: "29.3" },
                 { key: "allowed / game", value: "21.4" },
                 { key: "differential / game", value: "+7.9" },
                 { key: "power rank", value: "#2" }],
         schedule: [{ week, week_label: "W1", opponent: { abbr, nickname, color },
                      is_home, result: "W"|"L"|"T"|null, score_label: "38–34",
                      margin, cumulative }],
         depth_groups: [{ group: "QB", slots: ["1 · starter", "2 · backup", "3 · practice squad"] }] }

GET /api/v1/players/{player_id}
    -> { player: { id, name, position, team_abbr, team_color,
                   meta: "6th season · 17 g · QB · Philadelphia Eagles" },
         rate_cards: [{ key: "epa", label: "EPA per play", precision: 3,
                        value, baseline, delta, scale_max }],
         seasons: [{ season, team_abbr, team_color, games, yards, tds, rate, epa, is_latest }] }

GET /api/v1/players?season=2025&position=QB
    -> [{ id, name, team_abbr }]        # populates the player-page select

GET /api/v1/explorer/differentials?from=2016&to=2025
    -> { seasons: [2016, …, 2025], domain: 150,
         rows: [{ team: { abbr, name, color }, values: [int|null, …], total }] }

GET /api/v1/history/champions
    -> { champions: [{ season, team: { abbr, name, nickname, color }, result }],
         most_titles: [{ team: { abbr, nickname, color }, count }],
         dynasties: [{ team: { abbr, color }, label, titles, note }] }
```

Four notes on the new shapes:

- **`depth_groups` returns slot labels with no names.** That is the design's intent, not an unfinished endpoint — see §2. The response is deliberately structural so the UI renders the em-dashes without inventing a "no data" branch.
- **`explorer` returns a null for a team-season that does not exist** (a franchise that had not yet relocated under its current abbreviation). The grid renders those as empty cells, never as zero — a zero differential and an absent season look identical on a diverging scale and must not.
- **`domain` rides on the explorer response** so the client's diverging scale is parameterised by the server rather than hard-coding 150 in two places.
- **`scale_max` rides on each rate card** because the player page's bar is scaled to the positional maximum, which only the server knows.

Three shape decisions worth stating, since they are what keep the constraint "the browser formats; it does not calculate" true:

- **Display labels are server-side.** `kickoff_label`, `line_label`, `record_label`, `metric_label`, `qualifier_label`, `formula_label` all come down formed. The client never rebuilds a string from parts.
- **The QB qualifier measures games, not starts.** The design's mockup says "QB 14+ starts", but
  `PlayerSeasonStat` has no `starts` column — nflverse seasonal player stats expose appearances, and
  deriving true starts needs snap-count or depth-chart data we do not ingest. The threshold is
  therefore applied to `games`. **Say so in the label**: a backup QB with 15 mop-up appearances and 2
  starts qualifies under this rule, so a label reading "starts" would be false. Revisit if snap
  counts are ever ingested.
- **`precision` rides on the leaders response.** Fixed precision is per column, and the metric changes which column that is — so the server names it.
- **Team color rides on every team reference.** It is data, and denormalising it saves the client a lookup table that would drift from the seed.

- [ ] **Step 1: Write the failing route tests**

One test module per route. The critical assertions:

```python
def test_week_returns_every_game_with_both_teams_resolved(client, seeded_2024):
    r = client.get("/api/v1/weeks/2024/15")
    assert r.status_code == 200
    body = r.json()
    assert len(body["games"]) == 16
    game = body["games"][0]
    assert game["away"]["color"].startswith("#")
    assert game["home"]["nickname"]

def test_week_label_names_the_season_and_phase(client, seeded_2024):
    assert client.get("/api/v1/weeks/2024/15").json()["label"] == "Week 15 · 2024 regular season"

def test_unplayed_games_return_null_scores_and_no_margin(client, seeded_future):
    game = client.get("/api/v1/weeks/2025/16").json()["games"][0]
    assert game["away"]["score"] is None and game["margin"] is None

def test_unknown_week_returns_404_not_an_empty_list(client, seeded_2024):
    assert client.get("/api/v1/weeks/2024/99").status_code == 404

def test_standings_returns_32_rows_ranked_by_power_descending(client, seeded_2024):
    rows = client.get("/api/v1/standings/2024").json()["rows"]
    assert len(rows) == 32
    assert [r["rank"] for r in rows] == list(range(1, 33))
    assert rows == sorted(rows, key=lambda r: -r["power"])

def test_standings_conference_filter_returns_16(client, seeded_2024):
    rows = client.get("/api/v1/standings/2024?conference=AFC").json()["rows"]
    assert len(rows) == 16
    assert {r["team"]["conference"] for r in rows} == {"AFC"}

def test_standings_rejects_an_unknown_conference(client, seeded_2024):
    assert client.get("/api/v1/standings/2024?conference=XFL").status_code == 422

def test_leaders_respects_the_limit_and_ranks_by_the_named_metric(client, seeded_2024):
    body = client.get("/api/v1/leaders/2024?position=QB&metric=epa&limit=5").json()
    assert len(body["rows"]) == 5
    assert [r["rank"] for r in body["rows"]] == [1, 2, 3, 4, 5]
    assert body["rows"] == sorted(body["rows"], key=lambda r: -r["value"])
    assert body["metric_label"] == "EPA per play"
    assert body["precision"] == 3

def test_leaders_excludes_unqualified_players_from_rows_and_baseline(client, seeded_2024):
    body = client.get("/api/v1/leaders/2024?position=RB&metric=yds&limit=12").json()
    assert body["qualifier_label"] == "RB 120+ carries"

def test_freshness_reports_stale_when_ingestion_is_over_a_day_old(client, stale_season):
    assert client.get("/api/v1/meta/freshness?season=2024").json()["status"] == "stale"

def test_team_page_returns_the_full_schedule_with_a_running_total(client, seeded_2024):
    body = client.get("/api/v1/teams/2024/DET").json()
    assert body["team"]["conference"] == "NFC"
    assert len(body["schedule"]) == 17
    cumulative = [g["cumulative"] for g in body["schedule"]]
    margins = [g["margin"] for g in body["schedule"]]
    assert cumulative == list(accumulate(margins))

def test_team_page_depth_groups_are_structural_and_carry_no_names(client, seeded_2024):
    groups = client.get("/api/v1/teams/2024/DET").json()["depth_groups"]
    assert [g["group"] for g in groups] == ["QB","RB","WR","TE","OL","DL","LB","DB"]
    assert all(isinstance(s, str) for g in groups for s in g["slots"])

def test_unknown_team_returns_404(client, seeded_2024):
    assert client.get("/api/v1/teams/2024/XXX").status_code == 404

def test_player_page_returns_one_row_per_ingested_season(client, seeded_decade):
    body = client.get(f"/api/v1/players/{a_qb_id}").json()
    assert len(body["seasons"]) >= 1
    assert sum(s["is_latest"] for s in body["seasons"]) == 1

def test_player_rate_cards_carry_their_own_precision_and_scale(client, seeded_decade):
    cards = {c["key"]: c for c in client.get(f"/api/v1/players/{a_qb_id}").json()["rate_cards"]}
    assert cards["epa"]["precision"] == 3
    assert cards["td"]["precision"] == 0
    assert cards["epa"]["scale_max"] >= cards["epa"]["value"]

def test_explorer_returns_32_rows_by_10_seasons(client, seeded_decade):
    body = client.get("/api/v1/explorer/differentials?from=2016&to=2025").json()
    assert len(body["seasons"]) == 10
    assert len(body["rows"]) == 32
    assert all(len(r["values"]) == 10 for r in body["rows"])
    assert body["domain"] == 150

def test_explorer_total_is_the_sum_of_present_seasons(client, seeded_decade):
    row = client.get("/api/v1/explorer/differentials?from=2016&to=2025").json()["rows"][0]
    assert row["total"] == sum(v for v in row["values"] if v is not None)

def test_explorer_returns_null_not_zero_for_a_missing_team_season(client, seeded_partial):
    body = client.get("/api/v1/explorer/differentials?from=2016&to=2025").json()
    values = next(r["values"] for r in body["rows"] if r["team"]["abbr"] == "LV")
    assert None in values          # never 0 — zero differential and no season must differ

def test_history_counts_titles_and_orders_champions_newest_first(client, seeded_history):
    body = client.get("/api/v1/history/champions").json()
    assert [c["season"] for c in body["champions"]] == sorted(
        (c["season"] for c in body["champions"]), reverse=True)
    assert body["most_titles"][0]["team"]["abbr"] == "NE"
    assert body["most_titles"][0]["count"] == 6
```

- [ ] **Step 2: Run to verify they fail**

Run: `uv run pytest tests/api -v`
Expected: FAIL — 404 on every route.

- [ ] **Step 3: Implement the routes**

Each is a single query against the pre-aggregated tables plus a mapping into the response model. No route recomputes an analytic — that all happened at ingest time.

`featured` is derived by rule, not editorial (plan §2): take the week's two highest-scoring games, preferring a division game when it decides a division. `eyebrow` is generated from that rule (`"Game of the week · NFC North"`), `note` is `game.recap` and may be null. Storyline cards are not served at all.

- [ ] **Step 4: Run to verify they pass**

Run: `uv run pytest tests/api -v`
Expected: PASS.

- [ ] **Step 5: Verify the OpenAPI schema is clean**

```bash
uv run python -c "
from app.main import app; import json
s = app.openapi()
print(json.dumps(sorted(s['paths']), indent=2))
"
```

Expected: the six routes above, each with a named response model — no inline anonymous schemas, which would generate unusable TypeScript.

- [ ] **Step 6: Commit**

```bash
git add backend/app/api backend/app/schemas backend/tests/api
git commit -m "feat(api): week, standings, leaders, and freshness endpoints"
```

### Task 4.2: Generate and wire the TypeScript client

**Files:**
- Modify: `frontend/src/client/**` (generated), `frontend/src/main.tsx`

- [ ] **Step 1: Generate**

```bash
cd backend && uv run python -c "import json;from app.main import app;print(json.dumps(app.openapi()))" > ../openapi.json
cd ../frontend && bun run generate-client
```

- [ ] **Step 2: Verify the generated types match the plan's shapes**

Open `src/client/types.gen.ts`. Expected: `StandingsRow` carries `power: number` and a nested `team` object; `LeadersResponse` carries `precision: number`. If any field is `unknown` or `Record<string, unknown>`, the response model on that route is under-specified — fix it in Python and regenerate, never by hand-editing the client.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/client openapi.json
git commit -m "chore(client): generate TypeScript client from the OpenAPI schema"
```

---

# Milestone M5 — Screens

Each screen is one task: route, query, and composition, wired to real data end to end. The one exception is Task 5.4, which builds the `TrendLine` primitive before the team page that consumes it — it is the app's single chart convention (§1.10) and deserves its own test cycle.

Order matters here. Standings comes first because it is the densest use of `StatTable`; the Explorer comes late because it depends on ten seasons of ingested data and on the diverging scale being settled across three other screens.

### Task 5.1: Standings & power

Built first because it is the densest use of `StatTable` and exercises every shared mark.

**Files:**
- Create: `frontend/src/routes/standings.tsx`, `frontend/src/features/standings/columns.tsx`
- Test: `frontend/src/features/standings/columns.test.tsx`

- [ ] **Step 1: Define the search schema**

```ts
const standingsSearchSchema = z.object({
  conference: z.enum(['ALL', 'AFC', 'NFC']).default('ALL'),
  group: z.enum(['division', 'none']).default('division'),
  sort: z.enum(['rank','name','record','pct','pf','pa','diff','sos','streak','power']).default('power'),
  dir: z.enum(['asc', 'desc']).default('desc'),
})
```

Note the mockup's behaviour: **clicking any column header turns off division grouping** (`groupByDiv: false` in the sort handler). Reproduce that — grouping and free sorting are mutually exclusive by design.

- [ ] **Step 2: Define the 11 columns**

Widths verbatim from the mockup's `grid-template-columns`: `52 / minmax(190,1fr) / 92 / 68 / 72 / 72 / 84 / 82 / 78 / 128 / 96`.

| key | label | title | align | precision |
|---|---|---|---|---|
| `rank` | `#` | Order in current sort | right | 0 |
| `name` | Team | Sort alphabetically | left | — |
| `record` | W-L | Win-loss record | right | — |
| `pct` | PCT | Win percentage | right | 3, leading zero stripped |
| `pf` | PF | Points for | right | 0 |
| `pa` | PA | Points against | right | 0 |
| `diff` | DIFF | Point differential | right | 0, `DiffCell` |
| `sos` | SOS | Opponent win rate | right | 3, leading zero stripped |
| `streak` | STRK | Current streak | right | — |
| `form` | Last 5 | Most recent game at right | right | `FormDots` |
| `power` | PWR | Composite power score | right | 1, `PowerBar` + numeral |

The `.765` / `.512` rendering (`toFixed(3).replace(/^0/, '')`) is a formatter in `lib/format.ts`, tested there, not inlined per column.

- [ ] **Step 3: Write the failing column test**

```tsx
it('renders win percentage without a leading zero at fixed precision 3', () => {
  expect(formatPct(0.7647058823529411)).toBe('.765')
  expect(formatPct(0.1764705882352941)).toBe('.176')
})

it('always signs a non-zero differential', () => {
  expect(formatDiff(131)).toBe('+131')
  expect(formatDiff(-185)).toBe('−185')   // U+2212, not a hyphen
  expect(formatDiff(0)).toBe('0')
})
```

The minus sign is U+2212 — it is what makes a column of negatives align under `tabular-nums`, since a hyphen has a different advance width in most families.

- [ ] **Step 4: Run to verify it fails, implement the formatters, run to verify it passes**

Run: `bun run test:unit src/features/standings` → FAIL → implement → PASS.

- [ ] **Step 5: Compose the screen**

Eyebrow (`2025 final standings`, 11px/700, `letter-spacing: 0.09em`, uppercase, `--orchid`), `h1` at `--text-h1-app`, and the formula paragraph with the three weights in `font-weight: 800`, capped at `62ch`.

Conference `toggle-group` pills + "Group by division" `checkbox`, then `StatTable` inside a card (`--card` background, `--gray-200` border, `--radius-lg`, `--shadow-light-sm`, `overflow: hidden`).

Below the table, the two legend lines from the mockup: the diverging gradient swatch (`linear-gradient(90deg, var(--danger), var(--gray-100), var(--emerald))`) captioned "Point differential — diverging scale, neutral at zero", and "Team color appears only on identity marks and chart series, never on interface chrome."

Sort and filters read and write search params; `useQuery` refetches on `season` and `conference` only — sorting and grouping are client-side over the fetched 32 rows.

- [ ] **Step 6: Verify against the mockup and at 375px**

Side-by-side with `resources/design-v2-seven-screens.html` at 1360px: column widths, zebra striping, chip size, diverging cell colors, group headings. Then at 375px: the card scrolls horizontally inside itself, the page body does not.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/routes/standings.tsx frontend/src/features/standings
git commit -m "feat(standings): standings and power ranking screen on live data"
```

### Task 5.2: Week view

**Files:**
- Create: `frontend/src/routes/week.tsx`, `frontend/src/features/week/{game-card,featured-card,slate-columns}.tsx`

- [ ] **Step 1: Define the search schema**

```ts
const weekSearchSchema = z.object({
  slate: z.enum(['all', 'close', 'upset']).default('all'),
})
```

`close` filters to `|margin| <= 3`; `upset` filters to games the road team won. Both are client-side over the fetched week.

- [ ] **Step 2: Build `GameCard`**

306px fixed width, `--radius-lg`, 18px padding, `--shadow-light-sm`, hover `translateY(-3px)` + a stronger shadow over 120ms. Kickoff label in mono 11px `--gray-500`; status badge pill (`Final`, or `Final / OT` on `--orchid-tint` / `--orchid`). Two team rows on a `34px 1fr auto` grid: chip, nickname, score. **The winner's row is weight 800 in default ink; the loser's is 600 in `--gray-500`, and the loser's score drops to `--gray-400`** — that contrast is how the card reads at a glance. Footer: line label + a road/home-win tag, then the recap sentence, or an em-dash when `recap` is null.

- [ ] **Step 3: Build `FeaturedCard`**

`--radius-xl`, banner in the home team's color with the eyebrow, both abbreviations at 38px display, and the score in mono 26px. All banner text uses `inkFor(bannerColor)` (§1.7 / §1.8). Body: the note paragraph, then a 3-up stat grid with `border-left: 1px solid var(--gray-200)` dividers, values in mono 23px/700.

- [ ] **Step 4: Compose the screen**

Header block + rail arrows, `CardRail` of `GameCard`s, the featured grid (`repeat(auto-fit, minmax(420px, 1fr))`), slate filter pills, and the full-slate `StatTable` (columns: Kickoff / Away / Score / Home / Margin / Close / What happened, widths `96 / minmax(150,1fr) / 74 / minmax(150,1fr) / 96 / 108 / minmax(220,1.4fr)`). Margin renders in `--orchid` when `|margin| <= 3`, else `--gray-700`.

**Omit the storylines section** — see §2. Do not render an empty heading.

- [ ] **Step 5: Verify empty and partial states**

Request a future week with no results. Expected: cards render with scheduled status, null scores render as `—` not `0`, the margin column is empty, and the slate table does not collapse.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/routes/week.tsx frontend/src/features/week
git commit -m "feat(week): week view with game rail, featured matchups, and full slate"
```

### Task 5.3: Position leaders

**Files:**
- Create: `frontend/src/routes/leaders.tsx`, `frontend/src/features/leaders/leader-card.tsx`

- [ ] **Step 1: Define the search schema**

```ts
const leadersSearchSchema = z.object({
  position: z.enum(['QB', 'RB', 'WR', 'TE']).default('QB'),
  metric: z.enum(['epa', 'yds', 'td', 'rate']).default('epa'),
  top: z.coerce.number().int().refine((n) => [5, 8, 12].includes(n)).default(5),
})
```

The mockup falls back to `epa` when the current metric is not offered for the newly-selected position. Reproduce that fallback rather than rendering an empty board.

- [ ] **Step 2: Build `LeaderCard`**

`44px minmax(220px,1fr) auto` grid, 14px radius, 16/20 padding. Rank numeral in `--font-display` at 30px in `--gray-300`. Chip + player name (17px/800) + meta (12px/600 `--gray-500`). `LeaderBar` beneath. Three right-aligned readouts: the rank metric at mono 22px/700, a secondary stat at 16px/600 `--gray-600`, and vs-baseline signed and colored (`--emerald-dark` at or above baseline, `--ink-negative` below).

Rank 1 gets `--emerald-tint-border` and the emerald glow shadow — the design's one "one glow per screen" moment.

- [ ] **Step 3: Compose the screen**

Position `tabs` in a bordered container, metric `select`, top-N `select`, and the baseline readout pushed right in mono 12px. Below the list, the qualifier note from the API's `qualifier_label`.

Note the mockup's placeholder line — "Sample figures for layout review — not live data" — **is removed**; this screen now renders real data.

- [ ] **Step 4: Verify precision switches with the metric**

Switch QB metric across EPA → yards → TD → Y/A. Expected: 3 decimals, 0, 0, 1 — driven by the API's `precision`, and constant down the whole column each time.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/routes/leaders.tsx frontend/src/features/leaders
git commit -m "feat(leaders): position leaderboards with switchable metric and baseline"
```

### Task 5.4: `TrendLine` — the chart convention

Built before the team page that consumes it, because §1.10 makes it the single chart convention for the whole app.

**Files:**
- Create: `frontend/src/components/trend-line.tsx`
- Test: `frontend/src/components/trend-line.test.tsx`

**Interfaces:**
- Produces: `<TrendLine values={(number|null)[]} width?: number height?: number floor?: number label={string} />`

- [ ] **Step 1: Write the failing tests**

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { trendPath } from './trend-line'

describe('trendPath', () => {
  it('places zero at mid-height', () => {
    // floor of 40 dominates, so a zero value sits exactly at h/2
    expect(trendPath([0, 0], 640, 132)).toBe('M0.0 66.0 L640.0 66.0')
  })

  it('applies the ±40 floor so a flat season is not amplified', () => {
    // max(|5|, 40) = 40 -> y = 66 - (5/40)*60 = 58.5
    expect(trendPath([5], 640, 132)).toBe('M0.0 58.5')
  })

  it('scales to the largest magnitude once it exceeds the floor', () => {
    // max = 120 -> y = 66 - (120/120)*60 = 6, the 6px top padding
    expect(trendPath([120], 640, 132)).toBe('M0.0 6.0')
  })

  it('is symmetric about zero', () => {
    expect(trendPath([-120], 640, 132)).toBe('M0.0 126.0')
  })

  it('stops at the last played game rather than plotting nulls as zero', () => {
    // an in-progress season: three played, the rest unplayed
    expect(trendPath([7, 4, 18, null, null], 640, 132).split('L')).toHaveLength(3)
  })
})

describe('TrendLine', () => {
  it('names itself for assistive tech instead of exposing a bare svg', () => {
    render(<TrendLine values={[7, 4, 18]} label="Cumulative point differential" />)
    expect(screen.getByRole('img', { name: /Cumulative point differential/ })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun run test:unit src/components/trend-line.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
export function trendPath(values: (number | null)[], w: number, h: number, floor = 40) {
  const played = values.filter((v): v is number => v !== null)
  if (played.length === 0) return ''
  const max = Math.max(...played.map(Math.abs), floor)
  const step = w / (values.length - 1 || 1)
  return played
    .map((v, i) => `${i ? 'L' : 'M'}${(i * step).toFixed(1)} ${(h / 2 - (v / max) * (h / 2 - 6)).toFixed(1)}`)
    .join(' ')
}
```

The component wraps it in the §1.10 SVG: `preserveAspectRatio="none"`, a dashed zero rule in `--chart-rule`, and the path in `--orchid` at 2.5px with round caps. Give the `<svg>` `role="img"` and an `<title>` from `label` — a bare `<svg>` of a path is invisible to a screen reader, and the numbers are in the adjacent table anyway.

- [ ] **Step 4: Run to verify it passes**

Run: `bun run test:unit src/components/trend-line.test.tsx`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/trend-line.tsx frontend/src/components/trend-line.test.tsx
git commit -m "feat(ui): TrendLine chart primitive with symmetric floor-scaled axis"
```

### Task 5.5: Team page

**Files:**
- Create: `frontend/src/routes/team.$abbr.tsx`, `frontend/src/features/team/{hero,schedule-columns,depth-panel}.tsx`

- [ ] **Step 1: Route and search schema**

Path param `abbr`, so `/team/DET?season=2025` is the linkable unit. The team `<select>` navigates rather than setting state. Options are all 32 sorted by full name — the mockup sorts alphabetically by `T[a][0]`, not by abbreviation.

- [ ] **Step 2: Build the hero card**

`--radius-xl`, banner `padding: 26px 28px 28px` in the team's color. 64px `TeamChip`, name at 36px display in white with `letter-spacing: -0.01em`, record + conference beneath in mono 14px at 78% white. Four stats pushed right on `repeat(4, auto)` with 26px gaps, values in mono 26px/700 white, labels 10px/700 uppercase at 70% white.

All banner text and the chip ink go through `inkFor(teamColor)` (§1.7 / §1.8) — at 78% and 70% opacity the white labels are *below* the measured 4.03:1 on Carolina blue, so this is the worst contrast case in the app, not a marginal one.

Below the banner: the `TrendLine` from Task 5.4, headed "Cumulative point differential, week by week" at 22px display, with the caption "Running total across the 17-game season. Zero line marked."

- [ ] **Step 3: Build the schedule table**

`StatTable`, widths `56 / 44 / minmax(150px,1fr) / 92 / 78 / 88`. Columns: Week (`W1`), Res (a 22px rounded W/L badge, emerald or `--gray-300`), Opponent (26px chip + `vs `/`at ` + nickname), Score, Margin, Cum.

**The margin column uses `divergingCell(margin, 25)`** — §1.11. Do not re-derive a scale; do not pass the mockup's `margin * 6` through the default domain.

- [ ] **Step 4: Build the depth panel**

Eight groups (QB, RB, WR, TE, OL, DL, LB, DB) with the mockup's slot labels, each row a `space-between` flex with a dashed bottom border and an em-dash on the right. Ship the caption verbatim: *"Personnel and formation data needs charted plays — that view is deliberately deferred rather than faked."*

This panel is intentionally empty. Do not add a loading state, an error state, or a "coming soon" badge — the caption is the state.

- [ ] **Step 5: Verify**

Layout is `minmax(0,1.6fr) minmax(0,1fr)`; below `md` it stacks with the schedule first. Switch teams and confirm the trend line rescales — a team near .500 should not render a dramatic line, which is what the ±40 floor exists to prevent.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/routes/team.\$abbr.tsx frontend/src/features/team
git commit -m "feat(team): team page with differential trend, schedule, and depth panel"
```

### Task 5.6: Player page

**Files:**
- Create: `frontend/src/routes/player.$playerId.tsx`, `frontend/src/features/player/rate-card.tsx`

- [ ] **Step 1: Route, selects, and the position fallback**

`/player/{id}?season=2025&position=QB`. Two selects: position, then player (labelled `Name · TEAM`). Changing position refetches the player list and navigates to its first entry — the mockup's `pName: null` reset. Never render an empty board because the previously-selected player does not play the new position.

- [ ] **Step 2: Build `RateCard`**

Label 11px/700 uppercase `--gray-500`; value in mono 30px/700; signed delta beside it at 14px/700 in `--emerald-dark` or `--ink-negative`, suffixed "vs baseline". Then a 10px track with the fill at `(value / scale_max) * 100%` clamped to `[6, 100]` in `--orchid-600`, and a dashed `--gray-500` baseline marker clamped to 99%. Footer: "positional baseline X" in mono 11px.

Both clamps come from the mockup and both matter: a 0% bar reads as broken, and a marker at exactly 100% falls outside the rounded track.

- [ ] **Step 3: Build the season table**

`StatTable`, widths `72 / 96 / 62 / 92 / 62 / 82 / 92`. Columns: Season, Team (24px chip), G, Yards, TD, Y/A (1dp), EPA/play (3dp).

The latest season's row highlights with `--row-highlight`, overriding the zebra stripe. `StatTable` needs a `rowClassName` escape hatch for this — add it to the component rather than wrapping rows externally.

- [ ] **Step 4: Verify a mid-career team change renders**

Pick a player whose `PlayerSeasonStat` rows span two teams. Expected: the chip changes mid-table. This is the one thing the mockup could not show — its sample data has a `pl.prev` field that is never populated, so it always renders one team.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/routes/player.\$playerId.tsx frontend/src/features/player
git commit -m "feat(player): player page with rate cards and season-by-season table"
```

### Task 5.7: Analytics Explorer — the decade differential grid

The signature screen. Everything else on the site stays visually calmer than this.

**Files:**
- Create: `frontend/src/routes/explorer.tsx`, `frontend/src/components/differential-grid/{grid,cell,selection-panel}.tsx`
- Test: `frontend/src/components/differential-grid/grid.test.tsx`

- [ ] **Step 1: Define the search schema — including the selection**

```ts
const explorerSearchSchema = z.object({
  sort: z.string().default('total'),        // 'total' | 'alpha' | 'division' | a season year
  team: z.string().optional(),              // selected cell's team
  year: z.coerce.number().int().optional(), // selected cell's season
})
```

The selected cell goes in the URL too. A drill-down that cannot be linked to defeats the point of the screen.

- [ ] **Step 2: Write the failing sort tests**

```ts
it('sorts by ten-year total descending by default', () => {
  expect(orderRows(rows, 'total').map(r => r.team.abbr)).toEqual(['NE', 'KC', 'CLE'])
})

it('sorts alphabetically by full team name, not abbreviation', () => {
  // "Arizona Cardinals" (ARI) precedes "Atlanta Falcons" (ATL) precedes "Baltimore Ravens" (BAL)
  expect(orderRows(rows, 'alpha').map(r => r.team.abbr)).toEqual(['ARI', 'ATL', 'BAL'])
})

it('sorts by conference then division', () => {
  expect(orderRows(rows, 'division').map(r => r.team.division)).toEqual(['East', 'East', 'North'])
})

it('sorts by a single season column descending', () => {
  expect(orderRows(rows, '2023')[0].team.abbr).toBe('SF')
})

it('sorts a missing team-season last rather than treating it as zero', () => {
  const ordered = orderRows([...rows, teamWithNull2023], '2023')
  expect(ordered[ordered.length - 1].team.abbr).toBe(teamWithNull2023.team.abbr)
})
```

- [ ] **Step 3: Run to verify it fails, implement `orderRows`, run to verify it passes**

- [ ] **Step 4: Build the grid**

`168px repeat(10, minmax(52px,1fr)) 76px`, `gap: 4px`, rows padded `3px 0`. Header row is `align-items: end`; each season header is a button that sorts by that season and turns `--orchid` at weight 700 when active.

Each cell: `divergingCell(value)` at the server-supplied domain, 11px, `padding: 7px 4px`, centered, `border-radius: 5px`, signed. `title` reads `"Detroit Lions · 2023 · +134 point differential"`. A null value renders an empty cell with no background — never a zero.

Selection: `outline: 2px solid var(--orchid); outline-offset: 1px; z-index: 2`, transitioning `outline-color 120ms`. **No reorder animation** (§1.12).

The 320 cells are buttons, so they are tabbable — that is 320 tab stops, which is unusable. Apply the same roving-tabindex treatment `StatTable` already uses: one cell holds `tabIndex={0}`, arrows move between cells, Enter selects.

- [ ] **Step 5: Build the selection panel**

Above the grid, shown only when a cell is selected: 44px chip, "Name · Year" at 18px/800, the computed note ("Ranked #N of 32 in point differential that season." plus a tier sentence), and the differential in a `DiffCell` pushed right. Rank is computed client-side from the fetched matrix — the server already sent every value, so a round trip would be waste.

- [ ] **Step 6: Verify the signature screen actually signifies**

Sort by 10-year total and confirm the emerald mass concentrates at the top and the red at the bottom. Then sort by 2020 and confirm the column reorders. Dynasties should be visible as horizontal emerald bands and rebuilds as red-to-green gradients across a row. **If nothing legible falls out of the sort, the diverging domain is wrong for a decade of data** — report it rather than quietly retuning the scale, since §1.4 makes ±150 the single scale for the whole app.

- [ ] **Step 7: Verify at 375px**

`min-width: 860px` inside an `overflow-x: auto` wrapper. Expected: the grid scrolls inside its card; the page body does not.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/routes/explorer.tsx frontend/src/components/differential-grid
git commit -m "feat(explorer): the decade differential grid with sortable seasons and drill-down"
```

### Task 5.8: Champions & history

**Files:**
- Create: `frontend/src/routes/history.tsx`, `frontend/src/features/history/{champion-row,dynasty-card}.tsx`

- [ ] **Step 1: Build the most-titles row**

A wrapping flex of six cards: 32px chip, count in mono 20px/700, nickname at 11px/700 uppercase `--gray-500`.

- [ ] **Step 2: Build the decade sections**

Three cards — 2020s, 2010s, 2000s — each headed at 26px display. Rows are `64px 44px minmax(180px,1fr) minmax(200px,1.1fr)`: year in mono 14px/700 `--gray-500`, 34px chip, full team name at 14px/700, and the result line in mono 12px `--gray-600`.

This is reference content, not analysis, so it is a plain list rather than a `StatTable` — no sorting, no sticky header. Resist the reuse instinct here; `StatTable`'s machinery would add keyboard semantics that imply interactivity the content does not have.

- [ ] **Step 3: Build the dynasty sidebar**

Four cards: 38px chip, label at 15px/800, "N titles" at 11px/700 uppercase `--emerald-dark`, then the note paragraph at 13.5px/1.55.

- [ ] **Step 4: Verify**

Layout `minmax(0,1.5fr) minmax(0,1fr)`, stacking below `md`. Confirm the 2000s section holds five entries and the 2020s holds five (2020–2024), since the decade filter is `>= start && < start + 10` against seasons, not calendar years.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/routes/history.tsx frontend/src/features/history
git commit -m "feat(history): champions timeline, title counts, and dynasty runs"
```

---

# Milestone M6 — Finishing

### Task 6.1: Loading, empty, and error states across all seven screens

- [ ] **Step 1:** Every `useQuery` renders `StatTable isLoading` skeletons at real column widths, and card grids render `skeleton` cards at real card dimensions — no layout shift on resolve.
- [ ] **Step 2:** Every list has a written empty message. No bare "No data".
- [ ] **Step 3:** Query errors render a retry affordance, not a blank screen. A failed request must never leave the freshness pill claiming the data is current.
- [ ] **Step 4:** Verify by throttling to offline in DevTools and reloading each screen.
- [ ] **Step 5:** Commit — `feat(ui): loading, empty, and error states across all screens`

### Task 6.2: Accessibility and responsive pass

- [ ] **Step 1:** Keyboard-only walk of all seven screens. Every control reachable, focus never invisible or clipped, sticky columns never occluding the focused cell.
- [ ] **Step 2:** Run axe (`bunx @axe-core/cli http://localhost:5173/standings`) on each route. Expected: zero violations. Fix rather than suppress.
- [ ] **Step 3:** Verify contrast on data text inside colored cells specifically — the strong end of the diverging scale and every team chip. This is the constraint most likely to have slipped.
- [ ] **Step 4:** Check 375 / 768 / 1360px on all seven. No horizontal body scroll at any width. Pay particular attention to the seven-item nav (§1.13) — confirm it collapses to a scrollable row below `md` with the active item scrolled into view, rather than wrapping to four rows.
- [ ] **Step 4a:** Verify the Explorer's 320 cells are not 320 tab stops. Tab into the grid once, arrow around, Tab out once. If Tab walks cell by cell, the roving tabindex is not wired.
- [ ] **Step 5:** Toggle `prefers-reduced-motion` in DevTools. Expected: no card hover lift, no bar width animation, rail scrolling jumps instead of smooth-scrolling.
- [ ] **Step 6:** Commit — `fix(a11y): keyboard, contrast, and reduced-motion pass`

### Task 6.3: Scheduled ingestion and the freshness contract

- [ ] **Step 1:** Add a scheduled task invoking `ingest_season` for the current season. Use whatever the template already provides; otherwise a container `cron` entry is fine — do not add a queue for one nightly job.
- [ ] **Step 2:** Wire `/meta/freshness` to real `IngestRun` state: `live` while a run is in flight or a game is in progress, `final` when the last run succeeded within 24h, `stale` beyond that or after a failure.
- [ ] **Step 3:** Test that a failed run flips the pill to `stale` and that the label names the last *successful* ingest time, not the failed attempt.
- [ ] **Step 4:** Commit — `feat(ingest): nightly scheduled ingestion wired to the freshness indicator`

### Task 6.4: Project documentation

- [ ] **Step 1:** Write `README.md` — what Snapcount is, how to run backend and frontend, how to ingest a decade of seasons, and the seven screens.
- [ ] **Step 2:** Write `CLAUDE.md` — commands, the token three-layer rule (`tokens.ds.css` and `tokens.app.css` are generated, `theme.css` is hand-maintained), the "derived values are computed server-side" rule, and a pointer to §1 and §2 of this plan.
- [ ] **Step 3:** Add the parent workspace row to `../CLAUDE.md`'s project map: `snapcount/ | NFL analysis platform | FastAPI + React/Vite | uv / bun | main`.
- [ ] **Step 4:** Commit — `docs: README, CLAUDE.md, and workspace registration`

---

## Verification gate

Before calling this done, all of the following must hold — with output, not assertion:

```bash
cd backend && uv run pytest -q                       # all green
cd ../  && bun run --filter frontend test:unit       # all green
           bun run --filter frontend build           # clean build
           bun run --filter frontend lint            # biome, no diagnostics
grep -rnE '#[0-9A-Fa-f]{3,8}' frontend/src --include='*.tsx' --include='*.ts' \
  | grep -v 'lib/contrast.ts'                        # expect: no matches
grep -rnE '\[[0-9]+(px|rem)\]' frontend/src          # expect: no matches
```

The two greps enforce the plan's first global constraint. `lib/contrast.ts` is the sole exemption — it needs literal white and near-black to compute against.
