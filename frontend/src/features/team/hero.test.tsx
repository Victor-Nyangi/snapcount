import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import type { TeamPageResponse } from "@/client"
import { contrastRatio } from "@/lib/contrast"
import { TeamHero } from "./hero"

/** Detroit's real 2024 team page, trimmed to TWO weeks of schedule. */
function page(overrides: Partial<TeamPageResponse> = {}): TeamPageResponse {
  return {
    team: {
      abbr: "DET",
      name: "Detroit Lions",
      nickname: "Lions",
      conference: "NFC",
      division: "North",
      color: "#0076B6",
    },
    record_label: "15-2",
    conference_label: "NFC North",
    stats: [
      { key: "points / game", value: "33.2" },
      { key: "allowed / game", value: "20.1" },
      { key: "differential / game", value: "+13.1" },
      { key: "power rank", value: "#1" },
    ],
    schedule: [
      {
        week: 1,
        week_label: "W1",
        opponent: { abbr: "LAR", nickname: "Rams", color: "#003594" },
        is_home: true,
        result: "W",
        score_label: "26–20",
        margin: 6,
        cumulative: 6,
      },
      {
        week: 2,
        week_label: "W2",
        opponent: { abbr: "TB", nickname: "Buccaneers", color: "#D50A0A" },
        is_home: true,
        result: "L",
        score_label: "16–20",
        margin: -4,
        cumulative: 2,
      },
    ],
    depth_groups: [],
    ...overrides,
  }
}

/** jsdom normalises colours in `style.color`, so compare in rgb. */
const asRgb = (hex: string) => {
  const h = hex.replace("#", "")
  const [r, g, b] = [0, 2, 4].map((i) => Number.parseInt(h.slice(i, i + 2), 16))
  return `rgb(${r}, ${g}, ${b})`
}

const CAROLINA = "#0085CA"
const WHITE = "#FFFFFF"
const NEAR_BLACK = "#0A0A0C"

describe("TeamHero", () => {
  it("renders the identity, record and four stats", () => {
    render(<TeamHero data={page()} />)
    expect(screen.getByText("Detroit Lions")).toBeInTheDocument()
    expect(screen.getByText("15-2 · NFC North")).toBeInTheDocument()
    expect(screen.getByText("33.2")).toBeInTheDocument()
    expect(screen.getByText("power rank")).toBeInTheDocument()
  })

  it("paints the banner in the team's own colour", () => {
    const { container } = render(<TeamHero data={page()} />)
    const banner = container.querySelector<HTMLElement>(
      'div[style*="rgb(0, 118, 182)"]',
    )
    expect(banner).not.toBeNull()
  })

  describe("banner ink — the worst contrast surface in the app (§1.7 / §1.8)", () => {
    it("keeps white on Detroit, where white is genuinely the better ink", () => {
      // 4.92 on white vs 4.02 on near-black. A rule that flipped every
      // darkish blue to black would make Detroit worse.
      const { container } = render(<TeamHero data={page()} />)
      const banner = container.querySelector<HTMLElement>(
        'div[style*="rgb(0, 118, 182)"]',
      )!
      expect(banner.style.color).toBe(asRgb(WHITE))
    })

    it("flips to near-black on Carolina, where white fails AA", () => {
      // The mockup hard-codes #fff. On Carolina blue white measures only
      // 4.03:1 at FULL opacity — and the record line and stat labels are
      // drawn at 78% and 70% of it, so they are below that again.
      expect(contrastRatio(CAROLINA, WHITE)).toBeLessThan(4.5)
      expect(contrastRatio(CAROLINA, NEAR_BLACK)).toBeGreaterThan(4.5)

      const carolina = page({
        team: {
          ...page().team,
          abbr: "CAR",
          name: "Carolina Panthers",
          color: CAROLINA,
        },
      })
      const { container } = render(<TeamHero data={carolina} />)
      const banner = container.querySelector<HTMLElement>(
        'div[style*="rgb(0, 133, 202)"]',
      )!
      expect(banner.style.color).toBe(asRgb(NEAR_BLACK))
    })

    it("mutes the two secondary layers with opacity, not a baked-in white", () => {
      // Opacity works over either ink; `rgba(255,255,255,0.78)` only works
      // over white, which is exactly what the flip has to change.
      render(<TeamHero data={page()} />)
      expect(screen.getByText("15-2 · NFC North").style.opacity).toBe("0.78")
      expect(screen.getByText("power rank").style.opacity).toBe("0.7")
    })
  })

  it("plots the cumulative series, not the per-game margins", () => {
    const { container } = render(<TeamHero data={page()} />)
    const path = container.querySelector("path")!
    // cumulative [6, 2] under the ±40 floor: y = 66 - (v/40)*60
    expect(path.getAttribute("d")).toBe("M0.0 57.0 L640.0 63.0")
  })

  it("counts the games in the season it is showing, not always 17", () => {
    // The NFL played SIXTEEN games a season through 2020 and seventeen from
    // 2021, so a hard-coded "17-game season" was wrong on five of the ten
    // ingested seasons — 160 team-seasons — including every page for a
    // 3-12-1 Detroit in 2019. The fixture carries two weeks, so a caption
    // reading anything but 2 is quoting a constant rather than the data.
    render(<TeamHero data={page()} />)
    expect(
      screen.getByText(/Running total across the 2-game season/),
    ).toBeInTheDocument()

    // And it tracks the data rather than the fixture's length by accident.
    const seventeen = page()
    seventeen.schedule = Array.from({ length: 17 }, (_, i) => ({
      ...page().schedule[0],
      week: i + 1,
      week_label: `W${i + 1}`,
    }))
    render(<TeamHero data={seventeen} />)
    expect(
      screen.getByText(/Running total across the 17-game season/),
    ).toBeInTheDocument()
  })

  it("names the chart for assistive tech", () => {
    render(<TeamHero data={page()} />)
    expect(
      screen.getByRole("img", {
        name: "Detroit Lions cumulative point differential by week",
      }),
    ).toBeInTheDocument()
  })
})
