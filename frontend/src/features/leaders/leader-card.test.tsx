import { render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import type { LeaderRow } from "@/client"
import { formatVsBaseline, LeaderCard } from "./leader-card"

/** Lamar Jackson's real 2024 EPA-per-play row. */
function row(overrides: Partial<LeaderRow> = {}): LeaderRow {
  return {
    rank: 1,
    player: {
      id: "00-0034796",
      name: "Lamar Jackson",
      team_abbr: "BAL",
      team_color: "#241773",
      meta: "7th season · 17 g",
    },
    value: 0.36345698661607145,
    secondary: { key: "YDS", value: 4172 },
    vs_baseline: 0.24867871882915954,
    ...overrides,
  }
}

const QB_2024 = {
  top: 0.36345698661607145,
  baseline: 0.1147782677869119,
  precision: 3,
  unit: "EPA",
}

const renderCard = (r: LeaderRow, over: Partial<typeof QB_2024> = {}) =>
  render(<LeaderCard row={r} {...QB_2024} {...over} />)

/** The value above a given readout label. */
function readout(label: string) {
  const key = screen.getByText(label)
  return key.previousElementSibling as HTMLElement
}

describe("formatVsBaseline", () => {
  it("signs at the metric's own precision, not as a whole number", () => {
    expect(formatVsBaseline(0.24867871882915954, 3)).toBe("+0.249")
    expect(formatVsBaseline(16.4, 1)).toBe("+16.4")
    expect(formatVsBaseline(5.2, 0)).toBe("+5")
  })

  it("uses a real minus sign, never an ASCII hyphen", () => {
    // Everything numeric in this app is tabular-nums; a hyphen has a
    // different advance width and breaks the column.
    const text = formatVsBaseline(-0.051, 3)
    expect(text).toBe("−0.051")
    expect(text.startsWith("-")).toBe(false)
  })

  it("leaves an exact zero unsigned", () => {
    expect(formatVsBaseline(0, 3)).toBe("0.000")
  })

  it("does not sign a difference that ROUNDS to zero", () => {
    // At precision 0 a +0.4 gap displays as "0". Signing it "+0" would
    // assert a distinction the rendered number cannot show.
    expect(formatVsBaseline(0.4, 0)).toBe("0")
    expect(formatVsBaseline(-0.4, 0)).toBe("0")
  })
})

describe("LeaderCard", () => {
  it("renders the rank, player, team and meta line", () => {
    renderCard(row())
    expect(screen.getByText("1")).toBeInTheDocument()
    expect(screen.getByText("Lamar Jackson")).toBeInTheDocument()
    expect(screen.getByText("BAL")).toBeInTheDocument()
    expect(screen.getByText("7th season · 17 g")).toBeInTheDocument()
  })

  it("applies the metric's precision to the rank metric", () => {
    renderCard(row())
    expect(readout("EPA (rank metric)")).toHaveTextContent("0.363")
  })

  it("re-renders the same value at whatever precision the metric carries", () => {
    // Step 4 of the brief: precision is driven by the API and is constant
    // down the column. 4918 passing yards is precision 0, not "4918.000".
    renderCard(row({ value: 4918, secondary: { key: "TD", value: 43 } }), {
      precision: 0,
      unit: "YDS",
      top: 4918,
      baseline: 3836.9,
    })
    expect(readout("YDS (rank metric)")).toHaveTextContent("4918")
  })

  it("shows the secondary stat as a whole count whatever the metric's precision", () => {
    renderCard(row())
    expect(readout("YDS")).toHaveTextContent("4172")
  })

  it("colours a player at or above the baseline emerald", () => {
    renderCard(row())
    expect(readout("vs baseline").style.color).toBe("var(--emerald-dark)")
    expect(readout("vs baseline")).toHaveTextContent("+0.249")
  })

  it("colours a player below the baseline in the negative ink", () => {
    // Reachable on real data: RB EPA boards carry below-baseline rushers.
    renderCard(row({ rank: 9, vs_baseline: -0.051, value: 0.064 }))
    expect(readout("vs baseline").style.color).toBe("var(--ink-negative)")
    expect(readout("vs baseline")).toHaveTextContent("−0.051")
  })

  it("treats exactly zero as at-baseline, not below it", () => {
    renderCard(row({ vs_baseline: 0 }))
    expect(readout("vs baseline").style.color).toBe("var(--emerald-dark)")
  })

  it("gives rank 1 the emerald border and the glow — the one per screen", () => {
    const { container } = renderCard(row({ rank: 1 }))
    const card = container.querySelector("article")!
    expect(card.style.border).toContain("var(--emerald-tint-border)")
    expect(card.style.boxShadow).toContain("oklch(0.72 0.10 155 / 0.22)")
  })

  it("gives every other rank the plain border and shadow", () => {
    const { container } = renderCard(row({ rank: 2 }))
    const card = container.querySelector("article")!
    expect(card.style.border).toContain("var(--gray-200)")
    expect(card.style.boxShadow).toBe("var(--shadow-light-sm)")
  })

  it("leaves the team chip unnamed so AT does not announce it twice", () => {
    // The payload has only an abbreviation, which is already the chip's
    // visible text; labelling it would read "BAL, image" over "BAL".
    const { container } = renderCard(row())
    const chip = within(container).getByText("BAL")
    expect(chip).not.toHaveAttribute("role", "img")
    expect(chip).not.toHaveAttribute("aria-label")
  })
})
