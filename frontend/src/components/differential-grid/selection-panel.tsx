import type { ExplorerRow } from "@/client"
import { DiffCell } from "@/components/diff-cell"
import { TeamChip } from "@/components/team-chip"

/**
 * The drill-down above the grid, shown only when a cell is selected.
 *
 * RANK IS COMPUTED HERE, not fetched. The response already carries every
 * team's value for every season, so asking the server to rank one of them
 * would be a round trip for arithmetic the client can do on data it holds.
 *
 * Teams with no row that season are excluded from the ranking entirely —
 * "#12 of 31" is the honest denominator when a franchise was not there,
 * and counting them would silently rank a team against absences.
 */
export function rankIn(
  rows: ExplorerRow[],
  seasonIndex: number,
  value: number,
): { rank: number; of: number } {
  const played = rows
    .map((row) => row.values[seasonIndex])
    .filter((v): v is number => v !== null)
  return {
    rank: played.filter((v) => v > value).length + 1,
    of: played.length,
  }
}

/** The tier sentence beneath the rank — the mockup's own thresholds. */
export function tierNote(rank: number, of: number): string {
  if (rank === 1) return "The best mark in the league that year."
  if (rank <= Math.ceil(of / 4))
    return "Top-quarter territory — a contender's margin."
  if (rank <= Math.ceil(of / 2))
    return "Above the midpoint, without separating from it."
  if (rank <= Math.ceil((of * 3) / 4))
    return "Below the midpoint — a season spent chasing."
  return "Bottom-quarter territory."
}

export function SelectionPanel({
  row,
  season,
  seasonIndex,
  rows,
  domain,
}: {
  row: ExplorerRow
  season: number
  seasonIndex: number
  rows: ExplorerRow[]
  domain: number
}) {
  const value = row.values[seasonIndex]
  if (value === null || value === undefined) return null

  const { rank, of } = rankIn(rows, seasonIndex, value)

  return (
    <div
      className="flex flex-wrap items-center"
      style={{
        gap: 16,
        marginBottom: 16,
        padding: "16px 20px",
        background: "var(--card)",
        border: "1px solid var(--gray-200)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--shadow-light-sm)",
      }}
    >
      <TeamChip
        abbr={row.team.abbr}
        color={row.team.color}
        name={row.team.name}
        size={44}
      />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 18, fontWeight: 800 }}>
          {row.team.name} · {season}
        </div>
        <div
          style={{
            fontSize: 13,
            color: "var(--gray-600)",
            marginTop: 4,
            textWrap: "pretty",
          }}
        >
          Ranked #{rank} of {of} in point differential that season.{" "}
          {tierNote(rank, of)}
        </div>
      </div>
      <div style={{ marginLeft: "auto" }}>
        <DiffCell value={value} domain={domain} />
      </div>
    </div>
  )
}
