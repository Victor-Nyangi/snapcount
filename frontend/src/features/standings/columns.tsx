import type { StandingsRow } from "@/client"
import { DiffCell } from "@/components/diff-cell"
import { FormDots } from "@/components/form-dots"
import { PowerBar } from "@/components/power-bar"
import type { StatColumn } from "@/components/stat-table"
import { TeamChip } from "@/components/team-chip"
import { formatPct } from "@/lib/format"

/**
 * The eleven sortable metrics from the mockup's `colDefs` — everything
 * except `form` (a W/L string; sorting it alphabetically is meaningless,
 * and the search schema deliberately excludes it from the sort enum).
 */
export type StandingsSortKey =
  | "rank"
  | "name"
  | "record"
  | "pct"
  | "pf"
  | "pa"
  | "diff"
  | "sos"
  | "streak"
  | "power"

/**
 * `rank` (the "#" column) is display-only: it always shows the row's
 * position in whatever order is currently on screen ("Order in current
 * sort" — the column's own tooltip), independent of the sort key that
 * produced that order. It's computed by `withDisplayRank` after sorting
 * and grouping are applied, not read off `StandingsRow.rank` (the API's
 * own canonical rank, used only as the SORT comparator's value for the
 * 'rank' key — see `sortValue` below).
 */
export type StandingsDisplayRow = StandingsRow & { displayRank: number }

/**
 * "W3" / "L2" -> +3 / -2. The mockup sorts streak with a naive
 * alphabetical string compare (`'L10'` sorts before `'L2'`), which is
 * wrong for anything past a single digit. Parsing to a signed magnitude
 * gives a numerically correct order and costs nothing extra.
 */
function parseStreak(streak: string): number {
  const sign = streak.startsWith("W") ? 1 : streak.startsWith("L") ? -1 : 0
  const magnitude = Number.parseInt(streak.slice(1), 10)
  return sign * (Number.isNaN(magnitude) ? 0 : magnitude)
}

function sortValue(row: StandingsRow, key: StandingsSortKey): number | string {
  switch (key) {
    case "rank":
      return row.rank
    case "name":
      return row.team.name
    case "record":
      // Win pct (server-computed, ties included) is the correct ordering
      // for "record" — not a naive `wins / (wins + losses)` recompute,
      // which is what the mockup falls back to only because its synthetic
      // data model never carried a real ties-aware pct field.
      return row.pct
    case "pct":
      return row.pct
    case "pf":
      return row.points_for
    case "pa":
      return row.points_against
    case "diff":
      return row.differential
    case "sos":
      return row.sos
    case "streak":
      return parseStreak(row.streak)
    case "power":
      return row.power
  }
}

/** Pure comparator-driven sort; returns a new array, never mutates. */
export function sortStandingsRows(
  rows: StandingsRow[],
  key: StandingsSortKey,
  dir: "asc" | "desc",
): StandingsRow[] {
  const sign = dir === "asc" ? 1 : -1
  return [...rows].sort((a, b) => {
    const av = sortValue(a, key)
    const bv = sortValue(b, key)
    if (typeof av === "string" && typeof bv === "string") {
      return av.localeCompare(bv) * sign
    }
    return ((av as number) - (bv as number)) * sign
  })
}

/**
 * Secondary, STABLE sort clustering rows by conference + division without
 * disturbing the primary sort's already-applied order within each group —
 * mirrors the mockup's `if (s.groupByDiv) rows.sort(...)` running after
 * the primary comparator. Must run after `sortStandingsRows`, not before.
 */
export function groupByDivision(rows: StandingsRow[]): StandingsRow[] {
  return [...rows].sort((a, b) =>
    (a.team.conference + a.team.division).localeCompare(
      b.team.conference + b.team.division,
    ),
  )
}

/** Attaches the display-only "#" position — see `StandingsDisplayRow`. */
export function withDisplayRank(rows: StandingsRow[]): StandingsDisplayRow[] {
  return rows.map((row, index) => ({ ...row, displayRank: index + 1 }))
}

/** `StatTable`'s `groupBy`: the heading text above a division's first row. */
export function groupLabelFor(row: StandingsDisplayRow): string {
  return `${row.team.conference} ${row.team.division}`
}

const monoCellStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 13,
  fontWeight: 700,
}

/**
 * The 11 standings columns. Widths are verbatim from the mockup's
 * `grid-template-columns`. `powerMin`/`powerMax` come from the CURRENTLY
 * FETCHED rows (conference-filtered, pre-sort) so `PowerBar` always scales
 * against the visible dataset, matching the mockup's `maxPwr`/`minPwr`.
 *
 * Alignment is declared explicitly on every numeric column rather than
 * left to infer from `precision`/`signed` — `rank`, `pf`, `pa` have
 * neither, and `StatColumn.align` is resolved from the column definition
 * alone (never from row data), so they render left-aligned unless told
 * otherwise. See `resolveAlign` in `stat-table/columns.ts`.
 */
export function getStandingsColumns({
  powerMin,
  powerMax,
}: {
  powerMin: number
  powerMax: number
}): StatColumn<StandingsDisplayRow>[] {
  return [
    {
      key: "rank",
      label: "#",
      title: "Order in current sort",
      width: 52,
      align: "right",
      sortable: true,
      value: (row) => row.displayRank,
    },
    {
      key: "name",
      label: "Team",
      title: "Sort alphabetically",
      width: "minmax(190px, 1fr)",
      align: "left",
      sticky: true,
      sortable: true,
      // A→Z on the first click — this column's own tooltip is "Sort
      // alphabetically", and the shared default ('desc') would open it Z→A.
      defaultSortDir: "asc",
      value: (row) => row.team.name,
      render: (row) => (
        <div className="flex min-w-0 items-center gap-2.5">
          <TeamChip
            abbr={row.team.abbr}
            color={row.team.color}
            name={row.team.name}
            size={30}
          />
          {/*
            No playoff-seed badge. The mockup has one ("Bye · 1", "Seed 5"),
            but `playoff_seed` is NULL for all 320 team-seasons and nothing
            ingests it — deriving seeds needs the full NFL tiebreaker ladder,
            which is its own project. Shipping the badge would mean shipping
            markup and tests for a state no user can reach.
          */}
          <span className="truncate text-sm font-bold">{row.team.name}</span>
        </div>
      ),
    },
    {
      key: "record",
      label: "W-L",
      title: "Win-loss record",
      width: 92,
      align: "right",
      sortable: true,
      value: (row) => row.record_label,
      render: (row) => (
        <span className="tabular" style={monoCellStyle}>
          {row.record_label}
        </span>
      ),
    },
    {
      key: "pct",
      label: "PCT",
      title: "Win percentage",
      width: 68,
      align: "right",
      precision: 3,
      sortable: true,
      value: (row) => row.pct,
      render: (row) => (
        <span
          className="tabular"
          style={{
            ...monoCellStyle,
            fontWeight: 400,
            color: "var(--gray-600)",
          }}
        >
          {formatPct(row.pct)}
        </span>
      ),
    },
    {
      key: "pf",
      label: "PF",
      title: "Points for",
      width: 72,
      align: "right",
      // No `precision`/`signed`: a plain count. Must declare `align`
      // explicitly (see the module doc comment above) or it renders left.
      sortable: true,
      value: (row) => row.points_for,
    },
    {
      key: "pa",
      label: "PA",
      title: "Points against",
      width: 72,
      align: "right",
      sortable: true,
      value: (row) => row.points_against,
    },
    {
      key: "diff",
      label: "DIFF",
      title: "Point differential",
      width: 84,
      align: "right",
      precision: 0,
      // Genuinely signed: a point differential can be negative, and a
      // positive one should read "+222", not "222".
      signed: true,
      sortable: true,
      value: (row) => row.differential,
      render: (row) => <DiffCell value={row.differential} />,
    },
    {
      key: "sos",
      label: "SOS",
      title: "Opponent win rate",
      width: 82,
      align: "right",
      precision: 3,
      sortable: true,
      value: (row) => row.sos,
      render: (row) => (
        <span
          className="tabular"
          style={{
            ...monoCellStyle,
            fontWeight: 400,
            color: "var(--gray-600)",
          }}
        >
          {formatPct(row.sos)}
        </span>
      ),
    },
    {
      key: "streak",
      label: "STRK",
      title: "Current streak",
      width: 78,
      align: "right",
      sortable: true,
      value: (row) => row.streak,
      render: (row) => (
        <span
          className="tabular"
          style={{
            ...monoCellStyle,
            // A tie streak ("T1") is neither a win nor a loss, so it gets
            // neither colour — `app/analytics/standings.py` emits W/L/T,
            // and a two-branch ternary painted every T in the loss ink.
            color: row.streak.startsWith("W")
              ? "var(--emerald-ink)"
              : row.streak.startsWith("L")
                ? "var(--ink-negative)"
                : "var(--gray-600)",
          }}
        >
          {row.streak}
        </span>
      ),
    },
    {
      key: "form",
      label: "Last 5",
      title: "Most recent game at right",
      width: 128,
      align: "right",
      // Excluded from the URL sort enum on purpose — see
      // `StandingsSortKey`'s doc comment.
      sortable: false,
      render: (row) => <FormDots form={row.form} />,
    },
    {
      key: "power",
      label: "PWR",
      title: "Composite power score",
      width: 96,
      align: "right",
      precision: 1,
      sortable: true,
      value: (row) => row.power,
      render: (row) => (
        <div className="flex items-center justify-end gap-2">
          <PowerBar value={row.power} min={powerMin} max={powerMax} />
          <span
            className="tabular"
            style={{ ...monoCellStyle, minWidth: 38, textAlign: "right" }}
          >
            {row.power.toFixed(1)}
          </span>
        </div>
      ),
    },
  ]
}
