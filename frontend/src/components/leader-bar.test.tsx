import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { LeaderBar } from "./leader-bar"

/**
 * The numbers here are REAL: `/api/v1/leaders/2024?position=RB&metric=epa`.
 * EPA per rush is a signed rate, and the positional baseline for running
 * backs is NEGATIVE in all ten backfilled seasons — the leaderboard the
 * mockup's fixture data could never produce, because every sample figure in
 * it is positive.
 */
const RB_2024 = {
  top: 0.14025769447896164, // Jahmyr Gibbs, rank 1
  baseline: -0.0461007942848641,
  last: -0.005005316372168632, // Tank Bigsby, rank 12
}

function widths(props: Parameters<typeof LeaderBar>[0]) {
  const { container } = render(<LeaderBar {...props} />)
  const [fill, marker] = Array.from(
    container.querySelectorAll<HTMLElement>("span span"),
  )
  return { fill: fill.style.width, markerLeft: marker.style.left }
}

/** "12.5%" -> 12.5 */
const pct = (value: string) => Number.parseFloat(value)

describe("LeaderBar", () => {
  describe("with the all-positive data the mockup assumed", () => {
    // QB EPA 2024: top 0.363 (Lamar Jackson), baseline 0.115. Nothing here
    // may move — this is the case the mockup's formula got right, and the
    // geometry is ported verbatim from it.
    const qb = { top: 0.36345698661607145, baseline: 0.1147782677869119 }

    it("fills the whole track for the leader", () => {
      const { fill } = widths({ value: qb.top, ...qb, isLeader: true })
      expect(pct(fill)).toBe(100)
    })

    it("fills proportionally for everyone else", () => {
      // Jared Goff, rank 2, 0.3127 of a 0.3635 leader.
      const { fill } = widths({
        value: 0.3127174205728533,
        ...qb,
        isLeader: false,
      })
      expect(pct(fill)).toBeCloseTo(86.0, 0)
    })

    it("puts the baseline marker at its share of the leader", () => {
      const { markerLeft } = widths({ value: qb.top, ...qb, isLeader: true })
      expect(pct(markerLeft)).toBeCloseTo(31.6, 1)
    })
  })

  describe("with a negative baseline, which real RB EPA always has", () => {
    it("keeps the baseline marker ON the track", () => {
      // The whole point of the marker is to be seen. Scaled against the
      // leader alone, a baseline of −0.046 against a 0.140 leader lands at
      // −32.9% — off the left edge, invisible, on every RB EPA board in
      // all ten seasons.
      const { markerLeft } = widths({
        value: RB_2024.top,
        top: RB_2024.top,
        baseline: RB_2024.baseline,
        isLeader: true,
      })
      expect(pct(markerLeft)).toBeGreaterThanOrEqual(0)
      expect(pct(markerLeft)).toBeLessThanOrEqual(100)
    })

    it("never renders a negative width for a below-zero value", () => {
      // Tank Bigsby at −0.005 gave `width: -3.57%`, which is not a valid
      // CSS length: the declaration is dropped and the bar collapses, so a
      // negative rusher looks identical to a barely-positive one.
      const { fill } = widths({
        value: RB_2024.last,
        top: RB_2024.top,
        baseline: RB_2024.baseline,
        isLeader: false,
      })
      expect(pct(fill)).toBeGreaterThanOrEqual(0)
      expect(pct(fill)).toBeLessThanOrEqual(100)
    })

    it("still ranks by length — a better rusher gets a longer bar", () => {
      const shared = {
        top: RB_2024.top,
        baseline: RB_2024.baseline,
        isLeader: false,
      }
      const leader = widths({ value: RB_2024.top, ...shared })
      const middle = widths({ value: 0.059001775022334356, ...shared })
      const last = widths({ value: RB_2024.last, ...shared })
      expect(pct(leader.fill)).toBeGreaterThan(pct(middle.fill))
      expect(pct(middle.fill)).toBeGreaterThan(pct(last.fill))
    })

    it("places the marker left of a player who is above baseline", () => {
      // The marker has to stay readable AS a comparison, not merely be on
      // the track: everyone in this top 12 beat the baseline, so the marker
      // must sit left of each of their bar ends.
      const shared = {
        top: RB_2024.top,
        baseline: RB_2024.baseline,
        isLeader: false,
      }
      for (const value of [RB_2024.top, 0.059001775022334356, RB_2024.last]) {
        const { fill, markerLeft } = widths({ value, ...shared })
        expect(pct(markerLeft)).toBeLessThan(pct(fill))
      }
    })
  })

  describe("degenerate scales", () => {
    it("does not divide by zero when every value is zero", () => {
      const { fill, markerLeft } = widths({
        value: 0,
        top: 0,
        baseline: 0,
        isLeader: true,
      })
      expect(Number.isFinite(pct(fill))).toBe(true)
      expect(Number.isFinite(pct(markerLeft))).toBe(true)
    })
  })
})
