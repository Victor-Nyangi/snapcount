import { useRef, useState } from "react"
import type { ExplorerRow } from "@/client"
import { DiffCell } from "@/components/diff-cell"
import { TeamChip } from "@/components/team-chip"
import { DifferentialCell } from "./cell"

export type Selection = { team: string; year: number }

/**
 * The 32 × 10 decade grid — the signature screen. Geometry verbatim from
 * the mockup.
 *
 * ROVING TABINDEX, for the same reason `StatTable` has one: 320 cells as
 * plain buttons is 320 tab stops, so reaching the content after the grid
 * means 320 presses. Exactly one cell is tabbable; arrows move within the
 * grid, Enter/Space selects. This mirrors `StatTable`'s implementation
 * rather than inventing a second convention.
 */
export function DifferentialGrid({
  rows,
  seasons,
  domain,
  totalDomain,
  sort,
  selection,
  onSort,
  onSelect,
}: {
  rows: ExplorerRow[]
  seasons: number[]
  domain: number
  /** The total column's own saturation magnitude — a decade of
   * differentials is roughly an order of magnitude wider than a season's,
   * so it cannot share `domain`. Comes from the API, which is the only
   * place that can see every row. */
  totalDomain: number
  sort: string
  selection?: Selection
  onSort: (next: string) => void
  onSelect: (next: Selection) => void
}) {
  const cellRefs = useRef<Map<string, HTMLButtonElement>>(new Map())
  const [active, setActive] = useState({ row: 0, col: 0 })

  // Clamped at render time, not in an effect: re-sorting never changes the
  // row COUNT here, but the guard costs nothing and means there is never a
  // paint where zero cells are tab stops.
  const activeRow = rows.length > 0 ? Math.min(active.row, rows.length - 1) : 0
  const activeCol = Math.min(active.col, Math.max(seasons.length - 1, 0))

  const focusCell = (row: number, col: number) => {
    const r = Math.min(Math.max(row, 0), rows.length - 1)
    const c = Math.min(Math.max(col, 0), seasons.length - 1)
    setActive({ row: r, col: c })
    cellRefs.current.get(`${r}:${c}`)?.focus()
  }

  const handleKeyDown =
    (row: number, col: number) =>
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      const moves: Record<string, [number, number]> = {
        ArrowRight: [row, col + 1],
        ArrowLeft: [row, col - 1],
        ArrowDown: [row + 1, col],
        ArrowUp: [row - 1, col],
        Home: [row, 0],
        End: [row, seasons.length - 1],
        PageDown: [row + 10, col],
        PageUp: [row - 10, col],
      }
      const next = moves[event.key]
      if (next) {
        event.preventDefault()
        focusCell(next[0], next[1])
      }
    }

  const columns = `168px repeat(${seasons.length}, minmax(52px, 1fr)) 76px`

  return (
    // The grid scrolls inside its own card; the page body never scrolls
    // sideways. `min-width` is what forces the scroll rather than letting
    // 12 columns crush at 375px.
    <div className="w-full overflow-x-auto">
      <div style={{ minWidth: 860 }}>
        {/* A CSS grid, not a table: the cells are buttons with their own
            labels, so a lone `rowgroup` role here would describe a table
            structure that does not exist. */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: columns,
            gap: 4,
            alignItems: "end",
            padding: "3px 0",
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "var(--gray-500)",
            }}
          >
            Team
          </div>
          {seasons.map((season) => {
            const isActive = sort === String(season)
            return (
              <button
                key={season}
                type="button"
                onClick={() => onSort(String(season))}
                aria-pressed={isActive}
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  fontWeight: isActive ? 700 : 500,
                  color: isActive ? "var(--orchid)" : "var(--gray-500)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: "4px 0",
                  textAlign: "center",
                }}
              >
                {season}
              </button>
            )
          })}
          <button
            type="button"
            onClick={() => onSort("total")}
            aria-pressed={sort === "total"}
            style={{
              fontSize: 11,
              fontWeight: sort === "total" ? 700 : 500,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: sort === "total" ? "var(--orchid)" : "var(--gray-500)",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "4px 0",
              textAlign: "right",
            }}
          >
            10-yr
          </button>
        </div>

        {rows.map((row, rowIndex) => (
          <div
            key={row.team.abbr}
            style={{
              display: "grid",
              gridTemplateColumns: columns,
              gap: 4,
              alignItems: "center",
              padding: "3px 0",
            }}
          >
            <div className="flex min-w-0 items-center" style={{ gap: 8 }}>
              <TeamChip abbr={row.team.abbr} color={row.team.color} size={24} />
              <span
                style={{
                  fontSize: 12.5,
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {row.team.name}
              </span>
            </div>
            {row.values.map((value, colIndex) => (
              <DifferentialCell
                key={seasons[colIndex]}
                value={value}
                teamName={row.team.name}
                season={seasons[colIndex]}
                domain={domain}
                selected={
                  selection?.team === row.team.abbr &&
                  selection?.year === seasons[colIndex]
                }
                tabbable={rowIndex === activeRow && colIndex === activeCol}
                onSelect={() =>
                  onSelect({ team: row.team.abbr, year: seasons[colIndex] })
                }
                cellRef={(el) => {
                  const key = `${rowIndex}:${colIndex}`
                  if (el) cellRefs.current.set(key, el)
                  else cellRefs.current.delete(key)
                }}
                onKeyDown={handleKeyDown(rowIndex, colIndex)}
              />
            ))}
            <div className="flex justify-end">
              <DiffCell value={row.total} domain={totalDomain} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
