import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { TrendLine, trendPath } from "./trend-line"

/**
 * Detroit's real 2024 cumulative point differential, week by week — the
 * series the team page actually plots. It ends at +222, the season total
 * the standings screen reports for the same team.
 */
const DET_2024 = [
  6, 2, 9, 22, 60, 62, 100, 110, 113, 159, 177, 180, 183, 177, 194, 200, 222,
]

describe("trendPath", () => {
  it("places zero at mid-height", () => {
    // floor of 40 dominates, so a zero value sits exactly at h/2
    expect(trendPath([0, 0], 640, 132)).toBe("M0.0 66.0 L640.0 66.0")
  })

  it("applies the ±40 floor so a flat season is not amplified", () => {
    // max(|5|, 40) = 40 -> y = 66 - (5/40)*60 = 58.5
    expect(trendPath([5], 640, 132)).toBe("M0.0 58.5")
  })

  it("scales to the largest magnitude once it exceeds the floor", () => {
    // max = 120 -> y = 66 - (120/120)*60 = 6, the 6px top padding
    expect(trendPath([120], 640, 132)).toBe("M0.0 6.0")
  })

  it("is symmetric about zero", () => {
    expect(trendPath([-120], 640, 132)).toBe("M0.0 126.0")
  })

  it("stops at the last played game rather than plotting nulls as zero", () => {
    // an in-progress season: three played, the rest unplayed
    expect(trendPath([7, 4, 18, null, null], 640, 132).split("L")).toHaveLength(
      3,
    )
  })

  it("returns an empty path when nothing has been played", () => {
    expect(trendPath([null, null, null], 640, 132)).toBe("")
  })

  describe("x positions come from the slot, not from the compacted series", () => {
    it("keeps a played game at its own slot after an unplayed one", () => {
      // `team_schedule` in app/analytics/trends.py commits to this in its
      // docstring: a game after a gap "resumes from the last real total
      // rather than restarting", so an interior null is a supported shape,
      // not a malformed one. It arises from a POSTPONED OR CANCELLED game
      // — every unplayed game in a normal in-progress season sorts after
      // every played one, because the rows are in kickoff order.
      //
      // Indexing by position in the FILTERED array would draw the third
      // game at the second game's x, dragging the whole tail of the season
      // leftward and quietly compressing the chart.
      const path = trendPath([7, null, 18], 640, 132)
      expect(path).toBe("M0.0 55.5 L640.0 39.0")
    })

    it("leaves a trailing-null series exactly where it already was", () => {
      // The guarantee that the fix costs nothing. Until the first gap a
      // played game's slot and its index in the filtered array are the
      // same number, so every case reachable from today's data — where no
      // season has an unplayed game at all — is untouched. Five slots
      // means step 160, and the three played games sit on the first three.
      expect(trendPath([7, 4, 18, null, null], 640, 132)).toBe(
        "M0.0 55.5 L160.0 60.0 L320.0 39.0",
      )
    })
  })

  describe("against Detroit's real 2024 season", () => {
    it("plots one point per game and ends at the season total", () => {
      const path = trendPath(DET_2024, 640, 132)
      const points = path.split(/[ML]/).filter(Boolean)
      expect(points).toHaveLength(17)

      // +222 is the maximum magnitude, so the last point sits at the top
      // padding — 6px — and at the full width.
      expect(path.endsWith("L640.0 6.0")).toBe(true)
    })

    it("never leaves the 6px padding, in either direction", () => {
      const ys = trendPath(DET_2024, 640, 132)
        .split(/[ML]/)
        .filter(Boolean)
        .map((point) => Number.parseFloat(point.split(" ")[1]))
      for (const y of ys) {
        expect(y).toBeGreaterThanOrEqual(6)
        expect(y).toBeLessThanOrEqual(126)
      }
    })

    it("keeps a mid-season dip below the point before it", () => {
      // Week 14 dropped from 183 to 177 — a real loss. Lower cumulative
      // must mean a LOWER point on screen, i.e. a larger y.
      const ys = trendPath(DET_2024, 640, 132)
        .split(/[ML]/)
        .filter(Boolean)
        .map((point) => Number.parseFloat(point.split(" ")[1]))
      expect(ys[13]).toBeGreaterThan(ys[12])
    })
  })
})

describe("TrendLine", () => {
  it("names itself for assistive tech instead of exposing a bare svg", () => {
    render(
      <TrendLine values={[7, 4, 18]} label="Cumulative point differential" />,
    )
    expect(
      screen.getByRole("img", { name: /Cumulative point differential/ }),
    ).toBeInTheDocument()
  })

  it("draws the dashed zero rule at mid-height, and nothing else", () => {
    // §1.10: no axes, no ticks, no gridlines — one rule and one path.
    const { container } = render(<TrendLine values={DET_2024} label="Trend" />)
    const rule = container.querySelector("line")!
    expect(rule).toHaveAttribute("y1", "66")
    expect(rule).toHaveAttribute("y2", "66")
    expect(rule).toHaveAttribute("stroke-dasharray", "4 4")
    expect(container.querySelectorAll("line")).toHaveLength(1)
    expect(container.querySelectorAll("path")).toHaveLength(1)
  })

  it("strokes the series in orchid at 2.5, round join and cap", () => {
    const { container } = render(<TrendLine values={DET_2024} label="Trend" />)
    const path = container.querySelector("path")!
    expect(path).toHaveAttribute("stroke", "var(--orchid)")
    expect(path).toHaveAttribute("stroke-width", "2.5")
    expect(path).toHaveAttribute("stroke-linecap", "round")
    expect(path).toHaveAttribute("stroke-linejoin", "round")
    expect(path).toHaveAttribute("fill", "none")
  })

  it("stretches to its container rather than keeping its ratio", () => {
    const { container } = render(<TrendLine values={DET_2024} label="Trend" />)
    const svg = container.querySelector("svg")!
    expect(svg).toHaveAttribute("preserveAspectRatio", "none")
    expect(svg).toHaveAttribute("viewBox", "0 0 640 132")
  })

  it("still renders the zero rule for a season with no games played", () => {
    // The empty state is an empty chart, not a missing one: the frame and
    // its zero rule stay so the card does not change height.
    const { container } = render(
      <TrendLine values={[null, null]} label="Trend" />,
    )
    expect(container.querySelector("line")).toBeInTheDocument()
    expect(container.querySelector("path")).toBeNull()
  })
})
