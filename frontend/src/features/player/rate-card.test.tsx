import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import type { RateCard as RateCardData } from "@/client"
import { formatDelta, RateCard } from "./rate-card"

/** Joe Flacco's real 2025 EPA card — below baseline, and NEGATIVE. */
const FLACCO_EPA: RateCardData = {
  key: "epa",
  label: "EPA per play",
  precision: 3,
  value: -0.09825030100342538,
  baseline: 0.08265251986584608,
  delta: -0.18090282086927145,
  scale_max: 0.9665887170140331,
}

const renderCard = (over: Partial<RateCardData> = {}) => {
  const { container } = render(<RateCard card={{ ...FLACCO_EPA, ...over }} />)
  const track = container.querySelector(".overflow-hidden")!
  const [fill, marker] = Array.from(
    track.querySelectorAll<HTMLElement>(":scope > span"),
  )
  return { fill, marker, container }
}

const pct = (v: string) => Number.parseFloat(v)

describe("formatDelta", () => {
  it("signs at the metric's precision with a real minus", () => {
    expect(formatDelta(-0.18090282086927145, 3)).toBe("−0.181")
    expect(formatDelta(1.25, 1)).toBe("+1.3")
    expect(formatDelta(-10.09, 0)).toBe("−10")
  })

  it("does not sign a delta that rounds to zero", () => {
    expect(formatDelta(0, 3)).toBe("0.000")
    expect(formatDelta(0.4, 0)).toBe("0")
    expect(formatDelta(-0.4, 0)).toBe("0")
  })
})

describe("RateCard", () => {
  it("shows the label, value, delta and baseline footer", () => {
    renderCard()
    expect(screen.getByText("EPA per play")).toBeInTheDocument()
    expect(screen.getByText("-0.098")).toBeInTheDocument()
    expect(screen.getByText("−0.181 vs baseline")).toBeInTheDocument()
    expect(screen.getByText("positional baseline 0.083")).toBeInTheDocument()
  })

  it("colours a below-baseline delta in the negative ink", () => {
    renderCard()
    expect(screen.getByText("−0.181 vs baseline").style.color).toBe(
      "var(--ink-negative)",
    )
  })

  it("colours an at-or-above delta emerald, zero included", () => {
    renderCard({ delta: 0.05 })
    expect(screen.getByText("+0.050 vs baseline").style.color).toBe(
      "var(--emerald-ink)",
    )
    renderCard({ delta: 0 })
    expect(screen.getByText("0.000 vs baseline").style.color).toBe(
      "var(--emerald-ink)",
    )
  })

  describe("the two clamps, both of which the mockup needs", () => {
    it("floors the fill at 6% so a bar never reads as broken", () => {
      // Flacco's EPA is NEGATIVE (−0.098 against a 0.967 scale), which
      // without the floor is `width: -10.2%` — not a valid CSS length, so
      // the declaration is dropped and the bar vanishes entirely.
      const { fill } = renderCard()
      expect(pct(fill.style.width)).toBe(6)
    })

    it("keeps a proportional fill once the value clears the floor", () => {
      const { fill } = renderCard({ value: 0.4832943585070166 })
      expect(pct(fill.style.width)).toBeCloseTo(50, 0)
    })

    it("caps the fill at 100% for the scale leader", () => {
      const { fill } = renderCard({ value: FLACCO_EPA.scale_max })
      expect(pct(fill.style.width)).toBe(100)
    })

    it("caps the baseline marker at 99%, not 100%", () => {
      // At exactly 100% the marker sits on the track's rounded end cap and
      // is clipped out of sight by `overflow: hidden`.
      const { marker } = renderCard({ baseline: FLACCO_EPA.scale_max })
      expect(pct(marker.style.left)).toBe(99)
    })

    it("places the marker proportionally when it is nowhere near the end", () => {
      const { marker } = renderCard()
      expect(pct(marker.style.left)).toBeCloseTo(8.6, 1)
    })
  })

  it("hides the decorative bar from assistive tech", () => {
    // The numeral and the signed delta above it carry the actual figures,
    // and a value pinned to the 6% floor would otherwise mislead.
    const { container } = renderCard()
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull()
  })
})
