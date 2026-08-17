import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { LeadersResponse } from "@/client"
import { renderRouteAt, searchOf } from "./-route-harness"

vi.mock("@/hooks/useAuth", () => ({
  default: () => ({
    user: { id: "1", email: "ada@example.com" },
    logout: vi.fn(),
  }),
  isLoggedIn: () => true,
}))

const leaders = vi.fn()
vi.mock("@/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/client")>()),
  LeadersService: {
    leaders: (...args: unknown[]) => leaders(...args),
  },
}))

const player = (
  id: string,
  name: string,
  team_abbr: string,
  team_color: string,
  meta: string,
) => ({ id, name, team_abbr, team_color, meta })

/** `/api/v1/leaders/2024?position=QB&metric=epa&limit=5`, verbatim. */
const QB_EPA: LeadersResponse = {
  season: 2024,
  position: "QB",
  metric: "epa",
  metric_label: "EPA per play",
  unit: "EPA",
  precision: 3,
  baseline: 0.1147782677869119,
  qualifier_label: "QB 14+ games",
  rows: [
    {
      rank: 1,
      player: player(
        "00-0034796",
        "Lamar Jackson",
        "BAL",
        "#241773",
        "7th season · 17 g",
      ),
      value: 0.36345698661607145,
      secondary: { key: "YDS", value: 4172 },
      vs_baseline: 0.24867871882915954,
    },
    {
      rank: 2,
      player: player(
        "00-0033106",
        "Jared Goff",
        "DET",
        "#0076B6",
        "9th season · 17 g",
      ),
      value: 0.3127174205728533,
      secondary: { key: "YDS", value: 4629 },
      vs_baseline: 0.19793915278594137,
    },
    {
      rank: 3,
      player: player(
        "00-0034857",
        "Josh Allen",
        "BUF",
        "#00338D",
        "7th season · 16 g",
      ),
      value: 0.2693748919169057,
      secondary: { key: "YDS", value: 3731 },
      vs_baseline: 0.1545966241299938,
    },
  ],
}

/**
 * `?position=RB&metric=epa` — the board with a NEGATIVE baseline, which
 * every one of the ten backfilled seasons has for running backs, and a
 * below-zero rusher at rank 12.
 */
const RB_EPA: LeadersResponse = {
  season: 2024,
  position: "RB",
  metric: "epa",
  metric_label: "EPA per rush",
  unit: "EPA",
  precision: 3,
  baseline: -0.0461007942848641,
  qualifier_label: "RB 120+ carries",
  rows: [
    {
      rank: 1,
      player: player(
        "00-0038542",
        "Jahmyr Gibbs",
        "DET",
        "#0076B6",
        "2nd season · 17 g",
      ),
      value: 0.14025769447896164,
      secondary: { key: "YDS", value: 1412 },
      vs_baseline: 0.18635848876382574,
    },
    {
      rank: 12,
      player: player(
        "00-0039043",
        "Tank Bigsby",
        "JAX",
        "#101820",
        "2nd season · 17 g",
      ),
      value: -0.005005316372168632,
      secondary: { key: "YDS", value: 766 },
      vs_baseline: 0.04109547791269547,
    },
  ],
}

/** `?metric=yds` — precision 0, and the secondary flips to TD. */
const QB_YDS: LeadersResponse = {
  ...QB_EPA,
  metric: "yds",
  metric_label: "Passing yards",
  unit: "YDS",
  precision: 0,
  baseline: 3836.9047619047619,
  rows: [
    {
      rank: 1,
      player: player(
        "00-0036442",
        "Joe Burrow",
        "CIN",
        "#FB4F14",
        "5th season · 17 g",
      ),
      value: 4918,
      secondary: { key: "TD", value: 43 },
      vs_baseline: 1081.0952380952381,
    },
  ],
}

/** Every rendered leader card, in order, once the query has resolved. */
async function cards() {
  return screen.findAllByRole("article")
}

describe("/leaders route", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    leaders.mockResolvedValue({ data: QB_EPA })
  })

  it("defaults to QB / EPA / top 5", async () => {
    const { router } = await renderRouteAt("/leaders?season=2024")
    await cards()

    const search = searchOf(router)
    expect(search.position).toBe("QB")
    expect(search.metric).toBe("epa")
    expect(search.top).toBe(5)
    expect(leaders).toHaveBeenCalledWith({
      path: { season: 2024 },
      query: { position: "QB", metric: "epa", limit: 5 },
    })
  })

  it("renders one card per row, ranked, with the leader first", async () => {
    await renderRouteAt("/leaders?season=2024")
    const rendered = await cards()

    expect(rendered).toHaveLength(3)
    expect(within(rendered[0]).getByText("Lamar Jackson")).toBeInTheDocument()
    expect(within(rendered[2]).getByText("Josh Allen")).toBeInTheDocument()
  })

  it("puts the position in the URL and refetches for it", async () => {
    leaders.mockResolvedValue({ data: QB_EPA })
    const { router } = await renderRouteAt("/leaders?season=2024")
    await cards()

    leaders.mockResolvedValue({ data: RB_EPA })
    await userEvent.click(screen.getByRole("button", { name: "RB" }))

    await waitFor(() => expect(searchOf(router).position).toBe("RB"))
    expect(leaders).toHaveBeenLastCalledWith({
      path: { season: 2024 },
      query: { position: "RB", metric: "epa", limit: 5 },
    })
  })

  it("keeps the chosen metric when the position changes", async () => {
    // The brief asked to reproduce the mockup's fall-back-to-`epa`. That
    // branch is dead — every position offers all four metrics, on both
    // sides — so switching position must simply keep the metric.
    const { router } = await renderRouteAt(
      "/leaders?season=2024&position=QB&metric=rate",
    )
    await cards()

    await userEvent.click(screen.getByRole("button", { name: "WR" }))

    await waitFor(() => expect(searchOf(router).position).toBe("WR"))
    expect(searchOf(router).metric).toBe("rate")
  })

  it("names the metrics for the SELECTED position", async () => {
    // "EPA per play" is a quarterback's wording; a back's is "EPA per
    // rush". The dropdown has to say the right one before any response for
    // that position exists.
    await renderRouteAt("/leaders?season=2024&position=RB")
    await cards()

    await userEvent.click(screen.getByRole("combobox", { name: "Metric" }))
    const options = await screen.findByRole("listbox")

    expect(
      within(options)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual([
      "EPA per rush",
      "Rushing yards",
      "Touchdowns",
      "Yards per carry",
    ])
  })

  it("restores a shared URL's whole board without any click", async () => {
    leaders.mockResolvedValue({ data: QB_YDS })
    await renderRouteAt("/leaders?season=2024&metric=yds&top=12")

    await cards()
    expect(leaders).toHaveBeenCalledWith({
      path: { season: 2024 },
      query: { position: "QB", metric: "yds", limit: 12 },
    })
  })

  it("drives precision off the API, not the value", async () => {
    // Step 4: EPA is 3 decimals, yards is 0. Both come from `precision`.
    leaders.mockResolvedValue({ data: QB_YDS })
    await renderRouteAt("/leaders?season=2024&metric=yds")
    const [card] = await cards()

    expect(within(card).getByText("4918")).toBeInTheDocument()
    expect(within(card).queryByText("4918.000")).not.toBeInTheDocument()
    expect(screen.getByText(/baseline 3837 YDS/)).toBeInTheDocument()
  })

  it("states the baseline at the metric's precision, with its unit", async () => {
    await renderRouteAt("/leaders?season=2024")
    await cards()
    expect(screen.getByText(/baseline 0\.115 EPA/)).toBeInTheDocument()
  })

  it("shows the qualifier the API reports, not a hard-coded one", async () => {
    // The mockup's line is static text listing all four positions at once.
    await renderRouteAt("/leaders?season=2024")
    await cards()
    expect(screen.getByText(/QB 14\+ games/)).toBeInTheDocument()
  })

  it("keeps every bar on one scale, including a negative baseline", async () => {
    // The real RB EPA board: baseline −0.046 against a 0.140 leader. Both
    // the marker and a below-zero rusher's fill must land on the track.
    leaders.mockResolvedValue({ data: RB_EPA })
    await renderRouteAt("/leaders?season=2024&position=RB&top=12")
    const rendered = await cards()

    for (const card of rendered) {
      const track = card.querySelector(".overflow-hidden")!
      const [fill, marker] = Array.from(
        track.querySelectorAll<HTMLElement>(":scope > span"),
      )
      for (const value of [fill.style.width, marker.style.left]) {
        const percent = Number.parseFloat(value)
        expect(percent).toBeGreaterThanOrEqual(0)
        expect(percent).toBeLessThanOrEqual(100)
      }
    }
  })

  it("says which season and position are empty when the API has no rows", async () => {
    // The API 404s for an un-backfilled season, and the search schema
    // accepts any season from 1999 — so this is reachable by URL.
    leaders.mockRejectedValue(new Error("404"))
    await renderRouteAt("/leaders?season=2015&position=TE")

    expect(
      await screen.findByText("No TE data for the 2015 season."),
    ).toBeInTheDocument()
  })

  it("falls back to the default rather than 404ing on a junk top-N", async () => {
    // `top` is a closed set of 5/8/12; anything else in a hand-edited URL
    // must degrade to the default instead of failing route validation.
    const { router } = await renderRouteAt("/leaders?season=2024&top=999")
    await cards()
    expect(searchOf(router).top).toBe(5)
  })
})
