import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import type { WeekGame } from "@/client"
import { filterSlate, getSlateColumns } from "./slate-columns"

function game(overrides: Partial<WeekGame> = {}): WeekGame {
  return {
    id: "2024_15_KC_LV",
    kickoff_at: "2024-12-15T18:00:00Z",
    kickoff_label: "Sun 1:00p",
    status: "final",
    away: {
      abbr: "KC",
      nickname: "Chiefs",
      name: "Kansas City Chiefs",
      color: "#E31837",
      score: 24,
    },
    home: {
      abbr: "LV",
      nickname: "Raiders",
      name: "Las Vegas Raiders",
      color: "#000000",
      score: 17,
    },
    spread_line: -3.5,
    line_label: "LV -3.5",
    margin: -7,
    recap: null,
    ...overrides,
  }
}

/** `spread_line` is home-relative: negative means the home team is favoured. */
const scored = (id: string, away: number, home: number, spread_line = -3.5) =>
  game({
    id,
    away: { ...game().away, score: away },
    home: { ...game().home, score: home },
    margin: home - away,
    spread_line,
  })

const unplayed = (id: string) =>
  game({
    id,
    status: "scheduled",
    away: { ...game().away, score: null },
    home: { ...game().home, score: null },
    margin: null,
    line_label: null,
  })

describe("filterSlate", () => {
  const games = [
    scored("blowout", 31, 10), // margin -21
    scored("nailbiter", 20, 23), // margin +3, home won
    scored("roadUpset", 27, 24), // margin -3, road won
    unplayed("future"),
  ]

  it("returns every game under 'all', including unplayed ones", () => {
    expect(filterSlate(games, "all").map((g) => g.id)).toEqual([
      "blowout",
      "nailbiter",
      "roadUpset",
      "future",
    ])
  })

  it("keeps only one-score finishes under 'close'", () => {
    expect(filterSlate(games, "close").map((g) => g.id)).toEqual([
      "nailbiter",
      "roadUpset",
    ])
  })

  it("keeps games the closing favourite lost under 'upset'", () => {
    // All three played games above have the HOME team favoured (-3.5), so
    // the two road wins are upsets and the home win is not.
    expect(filterSlate(games, "upset").map((g) => g.id)).toEqual([
      "blowout",
      "roadUpset",
    ])
  })

  it("does not call a favoured road team's win an upset", () => {
    // The brief said "road team won"; the pill says "Underdog won". On real
    // data those differ — 2024 week 15 had eleven road wins but four of
    // them were by the favourite. A positive line means the ROAD team is
    // favoured, so this road win is not an upset.
    const favouredRoadWin = scored("chalk", 27, 24, +3.5)
    expect(filterSlate([favouredRoadWin], "upset")).toEqual([])
  })

  it("counts a favoured home team losing as an upset, though no road-win rule would", () => {
    const homeFavouriteLost = scored("homeChoke", 30, 20, -6.5)
    expect(filterSlate([homeFavouriteLost], "upset").map((g) => g.id)).toEqual([
      "homeChoke",
    ])
  })

  it("counts an underdog home team winning as an upset", () => {
    const roadFavouriteLost = scored("homeShock", 13, 20, +4.5)
    expect(filterSlate([roadFavouriteLost], "upset").map((g) => g.id)).toEqual([
      "homeShock",
    ])
  })

  it("treats a pick'em as having no underdog", () => {
    expect(filterSlate([scored("pickem", 24, 21, 0)], "upset")).toEqual([])
  })

  it("drops unplayed games from both real filters", () => {
    // A game with no result is neither close nor an upset, and its margin
    // is null — including it would put a blank row under a filter that
    // claims to have selected something.
    for (const filter of ["close", "upset"] as const) {
      expect(filterSlate(games, filter).map((g) => g.id)).not.toContain(
        "future",
      )
    }
  })

  it("treats a tie as neither close-only nor an upset", () => {
    const tie = [scored("tie", 20, 20)]
    expect(filterSlate(tie, "close").map((g) => g.id)).toEqual(["tie"])
    expect(filterSlate(tie, "upset")).toEqual([])
  })
})

describe("getSlateColumns", () => {
  const byKey = Object.fromEntries(getSlateColumns().map((c) => [c.key, c]))

  it("declares the mockup's seven columns in order, at its widths", () => {
    expect(getSlateColumns().map((c) => [c.key, c.width])).toEqual([
      ["kickoff", 96],
      ["away", "minmax(150px, 1fr)"],
      ["score", 74],
      ["home", "minmax(150px, 1fr)"],
      ["margin", 96],
      ["close", 108],
      ["recap", "minmax(220px, 1.4fr)"],
    ])
  })

  it("declares an explicit alignment on every column", () => {
    // StatTable resolves alignment from the column alone, so a column with
    // neither precision nor signed renders left unless it says otherwise.
    for (const column of getSlateColumns()) {
      expect(column.align).toBeDefined()
    }
    expect(byKey.score.align).toBe("center")
    expect(byKey.margin.align).toBe("right")
    expect(byKey.close.align).toBe("right")
  })

  it("offers no sorting — the slate reads in kickoff order", () => {
    for (const column of getSlateColumns()) {
      expect(column.sortable).toBeFalsy()
    }
  })

  it("signs the margin and uses a real minus, not a hyphen", () => {
    render(byKey.margin.render?.(scored("g", 31, 10)) as React.ReactElement)
    const cell = screen.getByText(/21/)
    expect(cell.textContent).toBe("−21") // U+2212
    expect(cell.textContent?.[0]).not.toBe("-")
  })

  it("colours a one-score margin orchid and a blowout grey", () => {
    const { rerender } = render(
      byKey.margin.render?.(scored("close", 20, 23)) as React.ReactElement,
    )
    expect(screen.getByText("+3").style.color).toBe("var(--orchid)")
    rerender(
      byKey.margin.render?.(scored("wide", 31, 10)) as React.ReactElement,
    )
    expect(screen.getByText("−21").style.color).toBe("var(--gray-700)")
  })

  it("leaves the margin cell empty for an unplayed game", () => {
    expect(byKey.margin.render?.(unplayed("future"))).toBeNull()
  })

  it("renders an unplayed score as an em-dash, never 0–0", () => {
    render(byKey.score.render?.(unplayed("future")) as React.ReactElement)
    expect(screen.getByText("—")).toBeInTheDocument()
    expect(screen.queryByText("0–0")).not.toBeInTheDocument()
  })

  it("falls back to an em-dash for a missing closing line and recap", () => {
    for (const key of ["close", "recap"]) {
      const { unmount } = render(
        byKey[key].render?.(unplayed("future")) as React.ReactElement,
      )
      expect(screen.getByText("—")).toBeInTheDocument()
      unmount()
    }
  })
})
