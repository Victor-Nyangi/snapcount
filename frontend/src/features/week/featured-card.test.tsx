import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import type { FeaturedGame } from "@/client"
import { inkFor } from "@/lib/contrast"
import { FeaturedCard } from "./featured-card"

function featured(overrides: Partial<FeaturedGame> = {}): FeaturedGame {
  return {
    game_id: "2024_15_DET_BUF",
    eyebrow: "Game of the week",
    away_abbr: "DET",
    home_abbr: "BUF",
    score_label: "42–48",
    banner_color: "#00338D",
    note: null,
    stats: [
      { key: "total points", value: "90" },
      { key: "margin", value: "6" },
      { key: "closing line", value: "BUF -2.5" },
    ],
    ...overrides,
  }
}

/** jsdom normalises any colour it is given to `rgb(r, g, b)`. */
function asRgb(hex: string): string {
  const n = Number.parseInt(hex.slice(1), 16)
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`
}

describe("FeaturedCard", () => {
  it("renders both abbreviations and the score", () => {
    render(<FeaturedCard game={featured()} />)
    expect(screen.getByText("DET")).toBeInTheDocument()
    expect(screen.getByText("BUF")).toBeInTheDocument()
    expect(screen.getByText("42–48")).toBeInTheDocument()
  })

  it("renders all three stats with their labels", () => {
    render(<FeaturedCard game={featured()} />)
    for (const [value, key] of [
      ["90", "total points"],
      ["6", "margin"],
      ["BUF -2.5", "closing line"],
    ]) {
      expect(screen.getByText(value)).toBeInTheDocument()
      expect(screen.getByText(key)).toBeInTheDocument()
    }
  })

  it("takes banner ink from the banner colour, not a hard-coded white", () => {
    // The mockup hard-codes #fff because both its sample banners are dark.
    // A light team colour has to flip to the dark ink or the banner is
    // unreadable — plan §1.7 / §1.8.
    const light = "#FFB612" // Pittsburgh gold, too light for white text
    render(<FeaturedCard game={featured({ banner_color: light })} />)
    expect(screen.getByText("DET").parentElement?.style.color).toBe(
      asRgb(inkFor(light)),
    )
  })

  it("uses the light ink on a dark banner", () => {
    const dark = "#00338D"
    render(<FeaturedCard game={featured({ banner_color: dark })} />)
    expect(screen.getByText("DET").parentElement?.style.color).toBe(
      asRgb(inkFor(dark)),
    )
  })

  it("inks the eyebrow from the banner colour too", () => {
    const light = "#FFB612"
    render(<FeaturedCard game={featured({ banner_color: light })} />)
    expect(screen.getByText("Game of the week").style.color).toBe(
      asRgb(inkFor(light)),
    )
  })

  it("omits the note paragraph entirely when there is no recap", () => {
    const { container } = render(
      <FeaturedCard game={featured({ note: null })} />,
    )
    // Not an em-dash: inside a card body an empty paragraph is just a gap.
    expect(container.querySelector("p")).toBeNull()
  })

  it("renders the note when a recap exists", () => {
    render(
      <FeaturedCard
        game={featured({ note: "Buffalo answered with seventeen unanswered." })}
      />,
    )
    expect(
      screen.getByText("Buffalo answered with seventeen unanswered."),
    ).toBeInTheDocument()
  })
})
