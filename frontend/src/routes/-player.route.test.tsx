import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { PlayerPageResponse } from "@/client"
import { renderRouteAt, searchOf } from "./-route-harness"

vi.mock("@/hooks/useAuth", () => ({
  default: () => ({
    user: { id: "1", email: "ada@example.com" },
    logout: vi.fn(),
  }),
  isLoggedIn: () => true,
}))

const listPlayers = vi.fn()
const playerPage = vi.fn()
vi.mock("@/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/client")>()),
  PlayersService: {
    listPlayers: (...a: unknown[]) => listPlayers(...a),
    playerPage: (...a: unknown[]) => playerPage(...a),
  },
}))

const season = (
  year: number,
  team_abbr: string,
  team_color: string,
  games: number,
  yards: number,
  tds: number,
  rate: number,
  epa: number,
  is_latest = false,
) => ({
  season: year,
  team_abbr,
  team_color,
  games,
  yards,
  tds,
  rate,
  epa,
  is_latest,
})

/**
 * Joe Flacco's real page. TEN seasons across SIX teams — the mid-career
 * team change Step 4 asks for, and the one thing the mockup could not
 * show: its sample data has a `pl.prev` field that is never populated, so
 * it always renders a single team down the whole column.
 */
const FLACCO: PlayerPageResponse = {
  player: {
    id: "00-0026158",
    name: "Joe Flacco",
    position: "QB",
    team_abbr: "CIN",
    team_color: "#FB4F14",
    meta: "10th season · 13 g · QB · Cincinnati Bengals",
  },
  rate_cards: [
    {
      key: "epa",
      label: "EPA per play",
      precision: 3,
      value: -0.09825030100342538,
      baseline: 0.08265251986584608,
      delta: -0.18090282086927145,
      scale_max: 0.9665887170140331,
    },
    {
      key: "rate",
      label: "Yards per attempt",
      precision: 1,
      value: 5.959134615384615,
      baseline: 7.211589829344238,
      delta: -1.2524552139596228,
      scale_max: 12.057142857142857,
    },
    {
      key: "td",
      label: "Touchdowns",
      precision: 0,
      value: 15,
      baseline: 25.09090909090909,
      delta: -10.09090909090909,
      scale_max: 46,
    },
  ],
  seasons: [
    season(2016, "BAL", "#241773", 16, 4317, 20, 6.42, -0.036),
    season(2017, "BAL", "#241773", 16, 3141, 18, 5.72, -0.0938),
    season(2018, "BAL", "#241773", 9, 2465, 12, 6.5, 0.0456),
    season(2019, "DEN", "#FB4F14", 8, 1822, 6, 6.95, -0.0848),
    season(2020, "NYJ", "#125740", 5, 864, 6, 6.45, -0.0684),
    season(2023, "CLE", "#FF3C00", 5, 1616, 13, 7.92, -0.0027),
    season(2024, "IND", "#002C5F", 7, 1761, 12, 7.1, 0.0083),
    season(2025, "CIN", "#FB4F14", 13, 2479, 15, 5.96, -0.0983, true),
  ],
}

/** A running back, to check the rate column's header follows the position. */
const BARKLEY: PlayerPageResponse = {
  player: {
    id: "00-0034844",
    name: "Saquon Barkley",
    position: "RB",
    team_abbr: "PHI",
    team_color: "#004C54",
    meta: "7th season · 16 g · RB · Philadelphia Eagles",
  },
  rate_cards: [
    {
      key: "rate",
      label: "Yards per carry",
      precision: 1,
      value: 5.8,
      baseline: 4.4,
      delta: 1.4,
      scale_max: 6,
    },
  ],
  seasons: [season(2024, "PHI", "#004C54", 16, 2005, 13, 5.8, 0.108, true)],
}

const QB_ROSTER = [
  { id: "00-0026158", name: "Joe Flacco", team_abbr: "CIN" },
  { id: "00-0023459", name: "Aaron Rodgers", team_abbr: "PIT" },
]
const RB_ROSTER = [
  { id: "00-0034844", name: "Saquon Barkley", team_abbr: "PHI" },
  { id: "00-0038542", name: "Jahmyr Gibbs", team_abbr: "DET" },
]

async function tableRows() {
  const table = await screen.findByRole("table")
  await waitFor(() =>
    expect(screen.queryAllByTestId("stat-table-skeleton-row")).toHaveLength(0),
  )
  return within(table).getAllByRole("row").slice(1)
}

describe("/player/$playerId route", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listPlayers.mockResolvedValue({ data: QB_ROSTER })
    playerPage.mockResolvedValue({ data: FLACCO })
  })

  it("takes the player from the PATH and the position from the search", async () => {
    const { router } = await renderRouteAt(
      "/player/00-0026158?season=2025&position=QB",
    )
    await tableRows()

    expect(playerPage).toHaveBeenCalledWith({
      path: { player_id: "00-0026158" },
    })
    expect(listPlayers).toHaveBeenCalledWith({
      query: { season: 2025, position: "QB" },
    })
    expect(searchOf(router).position).toBe("QB")
  })

  it("renders the header, three rate cards and the season table", async () => {
    await renderRouteAt("/player/00-0026158?season=2025")

    expect(
      await screen.findByRole("heading", { name: "Joe Flacco" }),
    ).toBeInTheDocument()
    expect(screen.getByText("EPA per play")).toBeInTheDocument()
    expect(screen.getByText("Yards per attempt")).toBeInTheDocument()
    expect(screen.getByText("Touchdowns")).toBeInTheDocument()
    expect(await tableRows()).toHaveLength(8)
  })

  describe("a mid-career team change (Step 4)", () => {
    it("changes the chip down the column instead of repeating one team", async () => {
      // The mockup's `pl.prev` is never populated, so it always renders a
      // single team for a whole career. Flacco played for six.
      await renderRouteAt("/player/00-0026158?season=2025")
      const rows = await tableRows()

      const chips = rows.map(
        (row) => row.querySelector("td:nth-child(2) span")?.textContent,
      )
      expect(chips).toEqual([
        "BAL",
        "BAL",
        "BAL",
        "DEN",
        "NYJ",
        "CLE",
        "IND",
        "CIN",
      ])
      expect(new Set(chips).size).toBe(6)
    })

    it("highlights only the latest season, over the zebra stripe", async () => {
      const rows = await (async () => {
        await renderRouteAt("/player/00-0026158?season=2025")
        return tableRows()
      })()

      const highlighted = rows.filter((row) =>
        row.className.includes("row-highlight"),
      )
      expect(highlighted).toHaveLength(1)
      expect(highlighted[0]).toHaveTextContent("2025")
    })
  })

  describe("the rate column names the position's own metric", () => {
    it("is Y/A for a quarterback", async () => {
      await renderRouteAt("/player/00-0026158?season=2025")
      await tableRows()
      expect(
        screen.getByRole("columnheader", { name: /Y\/A/ }),
      ).toBeInTheDocument()
    })

    it("is Y/C for a running back, not the mockup's global Y/A", async () => {
      // Same lying-label class as the leaders board's unit, fixed there in
      // the API. The player payload carries no unit, so the header is
      // derived from the player's own position.
      playerPage.mockResolvedValue({ data: BARKLEY })
      listPlayers.mockResolvedValue({ data: RB_ROSTER })
      await renderRouteAt("/player/00-0034844?season=2024&position=RB")
      await tableRows()

      expect(
        screen.getByRole("columnheader", { name: /Y\/C/ }),
      ).toBeInTheDocument()
      expect(screen.queryByRole("columnheader", { name: /Y\/A/ })).toBeNull()
    })
  })

  describe("changing position", () => {
    it("navigates to the first player of the new pool", async () => {
      // The mockup resets `pName` to null and falls back to the first of
      // the new pool. Here the player is in the URL, so the equivalent is
      // to navigate — otherwise the page shows a quarterback under an RB
      // filter, or an empty board for someone who does not play it.
      const { router } = await renderRouteAt(
        "/player/00-0026158?season=2024&position=QB",
      )
      await tableRows()

      listPlayers.mockResolvedValue({ data: RB_ROSTER })
      playerPage.mockResolvedValue({ data: BARKLEY })
      await userEvent.click(screen.getByRole("combobox", { name: "Position" }))
      await userEvent.click(await screen.findByRole("option", { name: "RB" }))

      await waitFor(() =>
        expect(router.state.location.pathname).toBe("/player/00-0034844"),
      )
      expect(searchOf(router).position).toBe("RB")
    })

    it("never leaves a player from the old position on screen", async () => {
      const { router } = await renderRouteAt(
        "/player/00-0026158?season=2024&position=QB",
      )
      await tableRows()

      listPlayers.mockResolvedValue({ data: RB_ROSTER })
      playerPage.mockResolvedValue({ data: BARKLEY })
      await userEvent.click(screen.getByRole("combobox", { name: "Position" }))
      await userEvent.click(await screen.findByRole("option", { name: "RB" }))

      await waitFor(() =>
        expect(router.state.location.pathname).toBe("/player/00-0034844"),
      )
      expect(
        await screen.findByRole("heading", { name: "Saquon Barkley" }),
      ).toBeInTheDocument()
    })
  })

  it("navigates on player change rather than holding it in state", async () => {
    const { router } = await renderRouteAt("/player/00-0026158?season=2025")
    await tableRows()

    await userEvent.click(screen.getByRole("combobox", { name: "Player" }))
    await userEvent.click(
      await screen.findByRole("option", { name: /Aaron Rodgers/ }),
    )

    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/player/00-0023459"),
    )
  })

  it("labels each option Name · TEAM", async () => {
    await renderRouteAt("/player/00-0026158?season=2025")
    await tableRows()

    await userEvent.click(screen.getByRole("combobox", { name: "Player" }))
    const options = await screen.findByRole("listbox")
    expect(
      within(options)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["Joe Flacco · CIN", "Aaron Rodgers · PIT"])
  })

  it("names the missing player when the API has no page", async () => {
    playerPage.mockRejectedValue(new Error("404"))
    await renderRouteAt("/player/00-0000000?season=2025")

    expect(
      await screen.findByText("No player page for 00-0000000."),
    ).toBeInTheDocument()
  })
})

describe("/player index route", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listPlayers.mockResolvedValue({ data: QB_ROSTER })
    playerPage.mockResolvedValue({ data: FLACCO })
  })

  it("redirects to the first player rather than 404ing out of the nav", async () => {
    // The nav links to a bare `/player`. A player id is an opaque nflverse
    // string, so unlike the team tab it cannot be hard-coded there.
    const { router } = await renderRouteAt("/player?season=2025")

    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/player/00-0026158"),
    )
  })

  it("says so when the season has no players of that position", async () => {
    listPlayers.mockResolvedValue({ data: [] })
    await renderRouteAt("/player?season=2015&position=TE")

    expect(
      await screen.findByText("No TE data for the 2015 season."),
    ).toBeInTheDocument()
  })
})
