# Claude Code Handoff — Design Import & Implementation

Paste this whole file as the opening prompt to Claude Code.

---

## Import the design

Use the claude_design MCP (https://api.anthropic.com/v1/design/mcp, auth via /design-login) to import this project:
https://claude.ai/design/p/602fdce0-a466-4323-b590-7205741e19a2?file=NFL+Analysis+Platform.dc.html

Focus on these files (the whole project is readable):
- `NFL Analysis Platform.dc.html`

Also read these files the selection imports:
- `_ds/victor-s-work-of-art-fa259736-569f-484e-a5f2-cf6f508b2477/_ds_bundle.js`
- `_ds/victor-s-work-of-art-fa259736-569f-484e-a5f2-cf6f508b2477/styles.css`
- `_ds/victor-s-work-of-art-fa259736-569f-484e-a5f2-cf6f508b2477/tokens/colors.css`
- `_ds/victor-s-work-of-art-fa259736-569f-484e-a5f2-cf6f508b2477/tokens/fonts.css`
- `_ds/victor-s-work-of-art-fa259736-569f-484e-a5f2-cf6f508b2477/tokens/spacing.css`
- `_ds/victor-s-work-of-art-fa259736-569f-484e-a5f2-cf6f508b2477/tokens/typography.css`
- `support.js`

---

## What you're implementing into

The target is a project bootstrapped from `fastapi/full-stack-fastapi-template` — FastAPI + SQLModel + PostgreSQL backend, React + TypeScript + Vite + Tailwind + shadcn/ui frontend, with a TypeScript client auto-generated from the OpenAPI schema.

Two companion documents define scope and architecture. Read both before writing code:
- `01-design-plan.md` — the brief the design was made from: constraints, screen list, chart conventions
- `02-implementation-plan.md` — schema, ingestion, API surface, milestones

**This handoff covers the frontend design system and the shell only.** Backend data work follows the milestones in `02-implementation-plan.md`.

---

## How the design lands in the codebase

Do these in order. Do not skip to building screens.

### 1. Read before writing

Read all six design files first and report back, before changing anything:
- the complete list of color tokens with their values and semantic names
- the type scale: families, sizes, weights, line heights, and their role names
- the spacing scale
- what `_ds_bundle.js` and `support.js` actually do — whether they're runtime behavior that needs porting, or build-time tooling that doesn't

Then state your mapping plan and wait for confirmation.

### 2. Map tokens into shadcn's variable layer — do not replace it

This is the critical step. shadcn/ui components read from a fixed set of semantic CSS variables (`--background`, `--foreground`, `--card`, `--popover`, `--primary`, `--secondary`, `--muted`, `--accent`, `--destructive`, `--border`, `--input`, `--ring`, plus chart and sidebar variables). The design ships its own names.

The rule: **the design's tokens are the source of truth; shadcn's names are the interface.** So:

- Copy the design's raw tokens into `src/styles/tokens.css` unchanged, keeping their original names. This file is regenerated on every design re-import and is never hand-edited.
- Create `src/styles/theme.css` that assigns shadcn's semantic variables *from* those tokens. This file is hand-maintained and is where the mapping decisions live.
- Never edit the design's token values to fit shadcn. If a needed semantic slot has no design equivalent, flag it rather than inventing a value.
- Do the same for both light and dark themes. If the design only defines one, say so instead of deriving the other.
- Extend `tailwind.config` from the semantic layer so utility classes and components agree.

Include a short comment block in `theme.css` recording any judgment calls, so a re-import doesn't silently lose them.

### 3. Fonts

Self-host as woff2 subsets under `public/fonts/`; do not load from a CDN. Declare `@font-face` with `font-display: swap`.

Numerics are the content of this application. Define a `.tabular` utility applying `font-variant-numeric: tabular-nums slashed-zero` and apply it to every numeric cell — not globally, since prose wants proportional figures. Verify a column of signed decimals aligns on the decimal point before moving on.

### 4. Port the HTML into shadcn components — don't transcribe it

`NFL Analysis Platform.dc.html` is a static mockup. Do not paste its markup into a React component.

Instead:
- Identify every repeated visual pattern in it and map each to a shadcn primitive (`table`, `card`, `tabs`, `select`, `badge`, `tooltip`, `separator`, `scroll-area`, `skeleton`).
- Install those primitives via the shadcn CLI so they arrive as editable local source, then restyle them from the semantic layer.
- Build genuinely custom pieces — the stat table wrapper, the differential grid, sparklines, the team identity mark — as project components in `src/components/`, composed from primitives where possible.
- Where the design does something shadcn can't express cleanly, extend the primitive rather than working around it with wrapper divs and overrides.

Report any place the design and shadcn's structure genuinely conflict. Don't quietly resolve it.

### 5. Build the shared components before the screens

In this order:

1. **StatTable** — the component everything depends on. Sortable columns, sticky header, sticky first column, right-aligned numerics, per-column fixed precision, keyboard navigable, loading and empty states. Build it against mock data and get it right before it has real consumers.
2. **Global season/week selector** — state lives in URL search params, not component state, so every view is linkable.
3. **App shell** — navigation, theme toggle, the data-staleness indicator from the design.
4. **Chart primitives** — axis, gridline, and scale conventions from the design's chart sheet, applied once and reused.

### 6. Then the first screen

Build **Standings** only, wired to mock data matching the API response shape in `02-implementation-plan.md` §M2. Stop there and show it. The remaining six screens come after the shape is confirmed.

---

## Constraints

- Every color, size, and spacing value comes from a token. No literal hex values, no arbitrary Tailwind values (`w-[347px]`), anywhere in component code.
- All server state goes through the generated TypeScript client and TanStack Query. No hand-written `fetch` calls.
- Team colors may appear in team marks and chart series only. They never drive page-level UI.
- Responsive to 375px on Standings, Team, and Week View. Visible keyboard focus everywhere. AA contrast on all data text, including text inside colored cells.
- Respect `prefers-reduced-motion`.
- Delete the template's demo `Item` model, routes, and tests in a single dedicated commit before any of this work — keep the auth machinery.

## Deliverable for this pass

A running frontend with the design system applied, the shared components built, and the Standings screen rendering from mock data. Commit at each numbered step above with a clear message. Do not build the backend ingestion in this pass.
