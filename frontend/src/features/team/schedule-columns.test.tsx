import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import type { ScheduleRowOut } from "@/client"
import { getScheduleColumns } from "./schedule-columns"

/** Detroit's real 2024 week 1: a 26–20 home win over the Rams. */
function row(overrides: Partial<ScheduleRowOut> = {}): ScheduleRowOut {
  return {
    week: 1,
    week_label: "W1",
    opponent: { abbr: "LAR", nickname: "Rams", color: "#003594" },
    is_home: true,
    result: "W",
    score_label: "26–20",
    margin: 6,
    cumulative: 6,
    ...overrides,
  }
}

const byKey = Object.fromEntries(getScheduleColumns().map((c) => [c.key, c]))

const renderCell = (key: string, r: ScheduleRowOut) =>
  render(byKey[key].render?.(r) as React.ReactElement)

describe("getScheduleColumns", () => {
  it("declares the mockup's six columns in order, at its widths", () => {
    expect(getScheduleColumns().map((c) => [c.key, c.width])).toEqual([
      ["week", 56],
      ["result", 44],
      ["opponent", "minmax(150px, 1fr)"],
      ["score", 92],
      ["margin", 78],
      ["cumulative", 88],
    ])
  })

  it("declares an explicit alignment on every column", () => {
    for (const column of getScheduleColumns()) {
      expect(column.align).toBeDefined()
    }
    expect(byKey.score.align).toBe("right")
    expect(byKey.margin.align).toBe("right")
    expect(byKey.cumulative.align).toBe("right")
  })

  it("offers no sorting — a schedule reads in week order", () => {
    for (const column of getScheduleColumns()) {
      expect(column.sortable).toBeFalsy()
    }
  })

  it("prefixes the opponent with vs at home and at on the road", () => {
    renderCell("opponent", row({ is_home: true }))
    expect(screen.getByText(/vs\s*Rams/)).toBeInTheDocument()
    renderCell("opponent", row({ is_home: false }))
    expect(screen.getByText(/at\s*Rams/)).toBeInTheDocument()
  })

  describe("the result badge", () => {
    it("is emerald for a win and grey for a loss", () => {
      renderCell("result", row({ result: "W" }))
      expect(screen.getByText("W").style.background).toBe("var(--emerald)")
      renderCell("result", row({ result: "L" }))
      expect(screen.getByText("L").style.background).toBe("var(--gray-300)")
    })

    it("gives a TIE its own treatment, not the loss colour", () => {
      // The mockup is `x.won ? emerald : gray-300`, so a tie would render
      // as a loss. Ten games in the backfill are ties, which is twenty
      // team-seasons that show a T — e.g. GB and DAL in 2025 week 4. This
      // is the same defect already fixed in the standings streak column
      // and on the week screen's game cards.
      renderCell("result", row({ result: "T", margin: 0 }))
      const badge = screen.getByText("T")
      // Assert the treatment it MUST have, not merely two it must not:
      // "neither emerald nor grey" is also satisfied by the unplayed
      // badge, so a tie silently falling through to that branch would pass.
      expect(badge.style.background).toBe("var(--orchid-tint)")
      expect(badge.style.color).toBe("var(--orchid)")
      expect(badge.style.border).toBe("")
    })

    it("claims no result at all for an unplayed game", () => {
      renderCell(
        "result",
        row({
          result: null,
          score_label: null,
          margin: null,
          cumulative: null,
        }),
      )
      const badge = screen.getByText("–")
      expect(badge.style.background).toBe("transparent")
      expect(badge.style.border).toContain("dashed")
    })
  })

  describe("the margin cell", () => {
    it("uses the GAME domain, not the season one", () => {
      // §1.11: a game margin saturates at 25 points. Under the default 150
      // domain a 6-point win would be almost colourless.
      renderCell("margin", row({ margin: 6 }))
      const cell = screen.getByText("+6")
      // mag = 6/25 = 0.24 -> lightness 0.97 - 0.24*0.22
      expect(cell.style.background).toContain("oklch(0.9172")
    })

    it("saturates a blowout rather than running off the scale", () => {
      renderCell("margin", row({ margin: 45 }))
      // |45| > 25, so mag clamps to 1 and the strong ink kicks in.
      expect(screen.getByText("+45").style.color).toBe(
        "var(--accent-primary-ink)",
      )
    })

    it("signs with a real minus, never an ASCII hyphen", () => {
      renderCell("margin", row({ margin: -4, result: "L" }))
      const cell = screen.getByText(/4/)
      expect(cell.textContent).toBe("−4")
      expect(cell.textContent?.startsWith("-")).toBe(false)
    })

    it("leaves the cell empty for an unplayed game", () => {
      expect(byKey.margin.render?.(row({ margin: null }))).toBeNull()
      expect(byKey.cumulative.render?.(row({ cumulative: null }))).toBeNull()
    })

    it("renders a tie's zero margin unsigned and neutral", () => {
      renderCell("margin", row({ result: "T", margin: 0, cumulative: 0 }))
      const cell = screen.getByText("0")
      expect(cell.style.background).toBe("var(--gray-100)")
    })
  })

  it("falls back to an em-dash for an unplayed score", () => {
    renderCell("score", row({ score_label: null }))
    expect(screen.getByText("—")).toBeInTheDocument()
  })
})
