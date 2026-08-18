import type { CSSProperties } from "react"
import { divergingCell } from "@/lib/diverging"
import { formatDiff } from "@/lib/format"

/**
 * One team-season in the decade grid.
 *
 * A NULL VALUE RENDERS AN EMPTY CELL WITH NO BACKGROUND — never a zero. On
 * the diverging scale zero is a real, meaningful reading (`--gray-100`, the
 * neutral midpoint), so painting an absent season that way would state that
 * the team broke even rather than that they were not there. The API keeps
 * the column nullable for exactly this reason; today's ten seasons happen
 * to be complete for all 32 teams, so this is the defensive path.
 */
export function DifferentialCell({
  value,
  teamName,
  season,
  domain,
  selected,
  tabbable,
  onSelect,
  cellRef,
  onKeyDown,
}: {
  value: number | null
  teamName: string
  season: number
  domain: number
  selected: boolean
  tabbable: boolean
  onSelect: () => void
  cellRef: (el: HTMLButtonElement | null) => void
  onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => void
}) {
  const base: CSSProperties = {
    fontFamily: "var(--font-mono)",
    fontVariantNumeric: "tabular-nums",
    fontSize: 11,
    fontWeight: 700,
    padding: "7px 4px",
    textAlign: "center",
    borderRadius: 5,
    border: "none",
    cursor: value === null ? "default" : "pointer",
    // §1.12: the outline is the only thing that moves. No reorder
    // animation — 32 rows resorting under a transition is noise, not
    // feedback.
    transition: "outline-color 120ms ease",
    outline: selected ? "2px solid var(--orchid)" : "2px solid transparent",
    outlineOffset: 1,
    zIndex: selected ? 2 : undefined,
    position: "relative",
  }

  if (value === null) {
    return (
      <button
        type="button"
        ref={cellRef}
        tabIndex={tabbable ? 0 : -1}
        onKeyDown={onKeyDown}
        aria-label={`${teamName} · ${season} · no season`}
        style={{ ...base, background: "transparent", color: "transparent" }}
      />
    )
  }

  return (
    <button
      type="button"
      ref={cellRef}
      tabIndex={tabbable ? 0 : -1}
      onClick={onSelect}
      onKeyDown={onKeyDown}
      aria-pressed={selected}
      title={`${teamName} · ${season} · ${formatDiff(value)} point differential`}
      style={{ ...base, ...divergingCell(value, domain) }}
    >
      {formatDiff(value)}
    </button>
  )
}
