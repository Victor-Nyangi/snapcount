import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import type { ExplorerRow } from "@/client"
import { rankIn, SelectionPanel, tierNote } from "./selection-panel"

const row = (
  abbr: string,
  name: string,
  values: (number | null)[],
): ExplorerRow => ({
  team: { abbr, name, color: "#0076B6", conference: "NFC", division: "North" },
  values,
  total: values.reduce<number>((s, v) => s + (v ?? 0), 0),
})

/** Real 2024 differentials: DET +222 led the league; JAX was well below. */
const ROWS = [
  row("DET", "Detroit Lions", [222]),
  row("BUF", "Buffalo Bills", [157]),
  row("PHI", "Philadelphia Eagles", [124]),
  row("JAX", "Jacksonville Jaguars", [-105]),
]

describe("rankIn", () => {
  it("ranks the best differential #1", () => {
    expect(rankIn(ROWS, 0, 222)).toEqual({ rank: 1, of: 4 })
  })

  it("ranks the worst last", () => {
    expect(rankIn(ROWS, 0, -105)).toEqual({ rank: 4, of: 4 })
  })

  it("excludes teams with no season from the denominator", () => {
    // "#3 of 4" would count a franchise that was not there as a team this
    // one finished ahead of.
    const withGap = [...ROWS, row("LV", "Las Vegas Raiders", [null])]
    expect(rankIn(withGap, 0, 124)).toEqual({ rank: 3, of: 4 })
  })

  it("gives tied values the same rank", () => {
    const tied = [row("A", "A", [100]), row("B", "B", [100])]
    expect(rankIn(tied, 0, 100)).toEqual({ rank: 1, of: 2 })
  })
})

describe("tierNote", () => {
  it("calls out the league's best separately", () => {
    expect(tierNote(1, 32)).toMatch(/best mark/)
  })

  it("moves through four tiers as the rank falls", () => {
    const notes = [
      tierNote(5, 32),
      tierNote(14, 32),
      tierNote(20, 32),
      tierNote(30, 32),
    ]
    expect(new Set(notes).size).toBe(4)
  })
})

describe("SelectionPanel", () => {
  it("states the rank, the tier and the differential", () => {
    render(
      <SelectionPanel
        row={ROWS[0]}
        season={2024}
        seasonIndex={0}
        rows={ROWS}
        domain={150}
      />,
    )
    expect(screen.getByText("Detroit Lions · 2024")).toBeInTheDocument()
    expect(screen.getByText(/Ranked #1 of 4/)).toBeInTheDocument()
    expect(screen.getByText("+222")).toBeInTheDocument()
  })

  it("renders nothing for a season the team did not have", () => {
    const { container } = render(
      <SelectionPanel
        row={row("LV", "Las Vegas Raiders", [null])}
        season={2024}
        seasonIndex={0}
        rows={ROWS}
        domain={150}
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
