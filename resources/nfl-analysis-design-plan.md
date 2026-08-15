# NFL Analysis Platform — Design Brief

**Hand this to Claude Design first.** The implementation plan (`02-implementation-plan.md`) consumes the output of this document. Do not start the build until the tokens and screen mockups here exist.

---

## 1. What this is

A personal-scale NFL analysis platform. Not a fan site, not a news aggregator, not a fantasy app. The closest reference points in spirit are Baseball Savant, FBref, and Understat: dense, honest, data-forward tools built for someone who wants to *look things up and reason about them*.

**Primary user:** one analyst (the builder), who knows the sport, wants fast access to structured facts, and is building toward predictive work.

**The page's single job, phase 1:** answer "what is true about this team / player / week?" in as few clicks as possible, and make comparisons across time legible.

**Explicit non-goal:** engagement. No feed, no hot takes, no carousel of trending stories. If a design decision would make sense on ESPN.com, interrogate it.

---

## 2. Design constraints that come from the subject

These are real constraints, not preferences. Honor them.

**Numbers are the content.** Almost every screen is a table or a chart. This means:
- Body and data faces must have **tabular (monospaced) numerals**. Non-lining or proportional figures in a stats table are a defect, not a style choice.
- Column alignment: numerics right-aligned, text left-aligned, always.
- Decimal precision is fixed per column, never per cell.

**Team color is data, not chrome.** All 32 teams have official colors and several collide (multiple navies, three or four reds). Rules:
- Team color is allowed on team identity marks and on series in multi-team charts.
- Team color must never drive page-level UI (backgrounds, buttons, nav). The app's own palette owns the interface.
- Any chart using team colors needs a fallback for the collision cases — pattern, luminance shift, or direct labeling.

**Differentials are signed.** Point differential, EPA, over/under performance vs expectation — these are diverging quantities around zero. They need a diverging color scale with a genuinely neutral midpoint, not a sequential ramp. Pick one diverging scale and use it everywhere signed values appear.

**Density is a feature.** The user wants to scan 30 rows, not 6 cards. Design at high information density and let whitespace come from disciplined alignment rather than padding.

**Time is a first-class axis.** Season, week, and career are constant dimensions. A season/week selector is a persistent global control, not a per-page filter.

---

## 3. Screens to design (phase 1)

Design these seven. For each, produce a desktop mockup; mark which are mobile-critical.

| # | Screen | Job | Mobile priority |
|---|--------|-----|-----------------|
| 1 | **Week view / home** | Current week's schedule with results, spreads, and a one-line "what happened" per game | High |
| 2 | **Team page** | Everything about one team: record, roster, schedule, rolling point differential, season-over-season trend | High |
| 3 | **Player page** | Bio, position, team history, per-season stat lines, rate stats vs positional baseline | Medium |
| 4 | **Standings / rankings** | Conference and division standings, plus a computed power ranking with its inputs visible | High |
| 5 | **Position leaderboards** | Top 5 (configurable to top N) per position, with the ranking metric explicit and switchable | Medium |
| 6 | **Analytics explorer** | The signature screen — see §4 | Low |
| 7 | **Champions / history** | Super Bowl history, dynasty runs, a decade-scale timeline | Low |

**Formations note:** the brief mentions formations. Real formation/personnel data is not in the free datasets — it requires charted play data. Design a placeholder position-group panel on the team page (depth chart by position group) and treat true formation visualization as a phase-3 screen. Do not design a formation diagram you can't populate.

---

## 4. The signature element

Spend the boldness here and keep everything else quiet.

**The decade differential grid on the Analytics Explorer.** A 32-teams × 10-seasons matrix where each cell encodes that team's season point differential on the diverging scale. Sortable by any season, with rows reorderable so dynasties, collapses, and rebuild cycles become visually obvious. Hovering a cell reveals the season summary; clicking drills into that team-season.

This is the thing the platform is remembered by, it uses data that's actually available on day one, and it directly serves the stated goal of understanding team strength over time. Everything else on the site should be visually calmer than this.

---

## 5. What to deliver

1. **Token file** — 4–6 named hex values, a type scale with named roles (display / body / data / caption), spacing scale, border and elevation rules. Delivered as CSS custom properties, since the implementation uses Tailwind and these become theme extensions.
2. **Type pairing** — a display face, a body face, and a data face with tabular figures. Justify each. Avoid the obvious sports-site reach for a condensed athletic sans as the display face unless you can defend it.
3. **Chart conventions sheet** — axis treatment, gridline weight, the diverging scale, the sequential scale, the categorical scale for up to 8 series, empty-state and insufficient-data treatment.
4. **Component sheet** — stat table (with sort, sticky header, sticky first column), team identity mark, player row, week selector, season selector, metric switcher, sparkline, comparison bar, drill-down panel.
5. **Seven screen mockups** per §3, desktop; mobile for the three marked High.
6. **Empty, loading, and stale states.** Data staleness is real here: rosters change daily, and a game in progress means partial data. Design a stale-data indicator now rather than bolting one on.

## 6. Aesthetic guardrails

- Dark-first is defensible for a dense data tool, but it is also the obvious answer. If you go dark, the light theme must be equally complete, not an afterthought.
- Avoid: gradient hero panels, glassmorphism, oversized single-stat cards, decorative numbered markers (01/02/03) where the content isn't sequential.
- Motion budget is small: sort transitions, drill-down expansion, and the differential grid's reorder. Nothing ambient. Respect `prefers-reduced-motion`.
- Quality floor, unannounced: responsive to 375px, visible keyboard focus, tables navigable by keyboard, contrast passing AA on all data text including inside colored cells.
