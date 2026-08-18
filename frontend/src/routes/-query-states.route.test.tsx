import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { renderRouteAt } from "./-route-harness"

vi.mock("@/hooks/useAuth", () => ({
  default: () => ({
    user: { id: "1", email: "ada@example.com" },
    logout: vi.fn(),
  }),
  isLoggedIn: () => true,
}))

const fail = () => Promise.reject(new Error("offline"))
const standings = vi.fn()
const week = vi.fn()
const leaders = vi.fn()
const teamPage = vi.fn()
const playerPage = vi.fn()
const listPlayers = vi.fn()
const differentials = vi.fn()
const champions = vi.fn()
const freshness = vi.fn()

vi.mock("@/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/client")>()),
  StandingsService: { standings: (...a: unknown[]) => standings(...a) },
  WeeksService: { week: (...a: unknown[]) => week(...a) },
  LeadersService: { leaders: (...a: unknown[]) => leaders(...a) },
  TeamsService: { teamPage: (...a: unknown[]) => teamPage(...a) },
  PlayersService: {
    playerPage: (...a: unknown[]) => playerPage(...a),
    listPlayers: (...a: unknown[]) => listPlayers(...a),
  },
  ExplorerService: { differentials: (...a: unknown[]) => differentials(...a) },
  HistoryService: { champions: (...a: unknown[]) => champions(...a) },
  MetaService: { freshness: (...a: unknown[]) => freshness(...a) },
}))

beforeEach(() => {
  vi.clearAllMocks()
  for (const m of [
    standings,
    week,
    leaders,
    teamPage,
    playerPage,
    differentials,
    champions,
  ]) {
    m.mockImplementation(fail)
  }
  listPlayers.mockResolvedValue({ data: [] })
  freshness.mockResolvedValue({
    data: {
      status: "final",
      label: "Final · updated Aug 17",
      last_ingested_at: null,
    },
  })
})

/**
 * Task 6.1 Step 3. Before this, a dropped connection on the week screen
 * rendered "All 0" and "No games match this filter" — a confident, wrong
 * statement that the week was empty. An empty state says "there is nothing
 * here"; an error state has to say "we could not find out".
 */
describe("a failed query is never mistaken for an empty result", () => {
  const screens: [string, string][] = [
    ["/standings?season=2024", "Could not load the 2024 standings."],
    ["/week?season=2024&week=15", "Could not load week 15 of the 2024 season."],
    ["/leaders?season=2024", "No QB data for the 2024 season."],
    ["/team/DET?season=2024", "No DET data for the 2024 season."],
    ["/player/00-0026158?season=2024", "No player page for 00-0026158."],
    ["/explorer", "Could not load the decade differential grid."],
    ["/history", "Could not load the champions list."],
  ]

  for (const [url, message] of screens) {
    it(`${url} states the failure and offers a retry`, async () => {
      await renderRouteAt(url)
      const alert = await screen.findByRole("alert")
      expect(alert).toHaveTextContent(message)
      expect(
        await screen.findByRole("button", { name: "Try again" }),
      ).toBeInTheDocument()
    })
  }

  it("does not also claim the list is empty", async () => {
    // The specific defect: both messages at once is worse than either.
    await renderRouteAt("/week?season=2024&week=15")
    await screen.findByRole("alert")
    expect(screen.queryByText("No games match this filter.")).toBeNull()
  })

  it("refetches when the retry is pressed", async () => {
    await renderRouteAt("/standings?season=2024")
    await screen.findByRole("alert")
    const before = standings.mock.calls.length

    await userEvent.click(screen.getByRole("button", { name: "Try again" }))

    await waitFor(() =>
      expect(standings.mock.calls.length).toBeGreaterThan(before),
    )
  })
})

/**
 * The pill had been hard-coded to `status="final" label="Final · updated
 * Feb 9"` since Task 2.3 — the mockup's literal sample text — behind a
 * comment saying it was a placeholder until Task 4.1 wired the endpoint.
 * 4.1 built the endpoint and never changed the call site.
 */
describe("the freshness pill reports the API, not a fixed date", () => {
  it("renders the label the server formed", async () => {
    standings.mockResolvedValue({
      data: { season: 2024, formula_label: "", rows: [] },
    })
    await renderRouteAt("/standings?season=2024")

    expect(
      await screen.findByText("Final · updated Aug 17"),
    ).toBeInTheDocument()
    expect(screen.queryByText("Final · updated Feb 9")).toBeNull()
    expect(freshness).toHaveBeenCalledWith({ query: { season: 2024 } })
  })

  it("passes a stale season through as stale", async () => {
    freshness.mockResolvedValue({
      data: {
        status: "stale",
        label: "Stale · updated Mar 2",
        last_ingested_at: null,
      },
    })
    standings.mockResolvedValue({
      data: { season: 2024, formula_label: "", rows: [] },
    })
    await renderRouteAt("/standings?season=2024")

    expect(await screen.findByText("Stale · updated Mar 2")).toBeInTheDocument()
  })

  it("never claims the data is current when freshness itself fails", async () => {
    // If we cannot reach the API we cannot know how fresh the data is, and
    // "stale" is the only honest answer — not the last good value, and not
    // a hopeful default.
    freshness.mockImplementation(fail)
    standings.mockResolvedValue({
      data: { season: 2024, formula_label: "", rows: [] },
    })
    await renderRouteAt("/standings?season=2024")

    expect(await screen.findByText("Freshness unknown")).toBeInTheDocument()
    expect(screen.queryByText(/Final/)).toBeNull()
  })
})
