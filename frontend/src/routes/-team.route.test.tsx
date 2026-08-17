import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { StandingsResponse, TeamPageResponse } from "@/client"
import { renderRouteAt } from "./-route-harness"

vi.mock("@/hooks/useAuth", () => ({
  default: () => ({
    user: { id: "1", email: "ada@example.com" },
    logout: vi.fn(),
  }),
  isLoggedIn: () => true,
}))

const teamPage = vi.fn()
const standings = vi.fn()
vi.mock("@/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/client")>()),
  TeamsService: { teamPage: (...a: unknown[]) => teamPage(...a) },
  StandingsService: { standings: (...a: unknown[]) => standings(...a) },
}))

const schedRow = (
  week: number,
  abbr: string,
  nickname: string,
  color: string,
  is_home: boolean,
  result: string | null,
  score_label: string | null,
  margin: number | null,
  cumulative: number | null,
) => ({
  week,
  week_label: `W${week}`,
  opponent: { abbr, nickname, color },
  is_home,
  result,
  score_label,
  margin,
  cumulative,
})

/** Detroit's real 2024 page — the first four weeks of the real schedule. */
const DET: TeamPageResponse = {
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
    schedRow(1, "LAR", "Rams", "#003594", true, "W", "26–20", 6, 6),
    schedRow(2, "TB", "Buccaneers", "#D50A0A", true, "L", "16–20", -4, 2),
    schedRow(3, "ARI", "Cardinals", "#97233F", false, "W", "20–13", 7, 9),
    schedRow(4, "SEA", "Seahawks", "#002244", true, "W", "42–29", 13, 22),
  ],
  depth_groups: [
    { group: "QB", slots: ["1 · starter", "2 · backup"] },
    { group: "OL", slots: ["LT", "LG", "C", "RG", "RT"] },
  ],
}

const BUF: TeamPageResponse = {
  ...DET,
  team: {
    abbr: "BUF",
    name: "Buffalo Bills",
    nickname: "Bills",
    conference: "AFC",
    division: "East",
    color: "#00338D",
  },
  record_label: "13-4",
  conference_label: "AFC East",
}

/** Only the identity fields the team picker reads. */
const STANDINGS = {
  season: 2024,
  formula_label: "",
  // LV / LAC / LAR are the only trio where sorting by ABBREVIATION and
  // sorting by FULL NAME give different answers — Las Vegas comes before
  // both Los Angeles clubs by name, and after both by abbreviation. A
  // fixture of ARI/BUF/DET cannot tell the two rules apart at all.
  rows: [
    { team: { abbr: "LAC", name: "Los Angeles Chargers" } },
    { team: { abbr: "DET", name: "Detroit Lions" } },
    { team: { abbr: "LV", name: "Las Vegas Raiders" } },
    { team: { abbr: "LAR", name: "Los Angeles Rams" } },
    { team: { abbr: "BUF", name: "Buffalo Bills" } },
  ],
} as unknown as StandingsResponse

async function scheduleRows() {
  const table = await screen.findByRole("table")
  await waitFor(() =>
    expect(screen.queryAllByTestId("stat-table-skeleton-row")).toHaveLength(0),
  )
  return within(table).getAllByRole("row").slice(1)
}

describe("/team/$abbr route", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    teamPage.mockResolvedValue({ data: DET })
    standings.mockResolvedValue({ data: STANDINGS })
  })

  it("takes the team from the PATH and the season from the layout", async () => {
    // `/team/DET?season=2024` is the linkable unit: the team is a resource,
    // the season a view of it.
    await renderRouteAt("/team/DET?season=2024")
    await scheduleRows()

    expect(teamPage).toHaveBeenCalledWith({
      path: { season: 2024, abbr: "DET" },
    })
    // The name appears twice — the hero heading and the picker's own
    // value — so target the heading specifically.
    expect(
      await screen.findByRole("heading", { name: "Detroit Lions" }),
    ).toBeInTheDocument()
  })

  it("renders the hero, the schedule and the depth panel together", async () => {
    await renderRouteAt("/team/DET?season=2024")

    expect(await screen.findByText("15-2 · NFC North")).toBeInTheDocument()
    expect(await scheduleRows()).toHaveLength(4)
    expect(screen.getByText("LT")).toBeInTheDocument()
  })

  it("navigates on team change instead of holding it in state", async () => {
    // The whole point of the path param: switching teams must produce a
    // new URL that can be shared, not a re-render of the same one.
    const { router } = await renderRouteAt("/team/DET?season=2024")
    await scheduleRows()

    teamPage.mockResolvedValue({ data: BUF })
    await userEvent.click(screen.getByRole("combobox", { name: "Team" }))
    await userEvent.click(
      await screen.findByRole("option", { name: "Buffalo Bills" }),
    )

    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/team/BUF"),
    )
    expect(teamPage).toHaveBeenLastCalledWith({
      path: { season: 2024, abbr: "BUF" },
    })
  })

  it("keeps the season across a team change", async () => {
    const { router } = await renderRouteAt("/team/DET?season=2024")
    await scheduleRows()

    teamPage.mockResolvedValue({ data: BUF })
    await userEvent.click(screen.getByRole("combobox", { name: "Team" }))
    await userEvent.click(
      await screen.findByRole("option", { name: "Buffalo Bills" }),
    )

    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/team/BUF"),
    )
    expect(router.state.location.search).toMatchObject({ season: 2024 })
  })

  it("lists all teams sorted by FULL NAME, not by abbreviation", async () => {
    // The mockup sorts on `T[a][0]`, the full name, and the picker shows
    // names — so the order the user reads must be the order they are
    // sorted in. See the fixture note: LV vs LAC/LAR is what makes this
    // test able to fail.
    await renderRouteAt("/team/DET?season=2024")
    await scheduleRows()

    await userEvent.click(screen.getByRole("combobox", { name: "Team" }))
    const options = await screen.findByRole("listbox")
    expect(
      within(options)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual([
      "Buffalo Bills",
      "Detroit Lions",
      "Las Vegas Raiders", // LV — by abbreviation this would come LAST
      "Los Angeles Chargers",
      "Los Angeles Rams",
    ])
  })

  it("shares the standings query key so the picker costs no extra request", async () => {
    await renderRouteAt("/team/DET?season=2024")
    await scheduleRows()
    expect(standings).toHaveBeenCalledWith({ path: { season: 2024 } })
    expect(standings).toHaveBeenCalledTimes(1)
  })

  it("names the missing team and season when the API has no page", async () => {
    // The API 404s for a team with no row that season — reachable both by
    // URL and by a relocated franchise (OAK/LV, SD/LAC, STL/LAR).
    teamPage.mockRejectedValue(new Error("404"))
    await renderRouteAt("/team/OAK?season=2024")

    expect(
      await screen.findByText("No OAK data for the 2024 season."),
    ).toBeInTheDocument()
  })

  it("puts the schedule before the depth panel in source order", async () => {
    // Below `md` the grid stacks in source order, and the real data has to
    // come before the deliberately-empty panel.
    const { container } = await renderRouteAt("/team/DET?season=2024")
    await scheduleRows()

    const headings = Array.from(container.querySelectorAll("h2")).map(
      (h) => h.textContent,
    )
    expect(headings.indexOf("Schedule & results")).toBeLessThan(
      headings.indexOf("Position groups"),
    )
  })
})
