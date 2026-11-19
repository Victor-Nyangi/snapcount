import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { LeadersResponse, SeasonSummary } from "@/client"
import { renderRouteAt as renderAt, searchOf } from "./-route-harness"

// This file is about `/meta/seasons`, so it fetches it (mocked above)
// rather than taking the harness's empty seed.
const renderRouteAt = (url: string) => renderAt(url, { fetchSeasons: true })

/**
 * What the app opens on when the URL names no season or week. It used to
 * be a hard-coded 2025 week 15, so with 2026 ingested nightly the site
 * still opened on last season. It is the API's newest played season now.
 */

vi.mock("@/hooks/useAuth", () => ({
  default: () => ({
    user: { id: "1", email: "ada@example.com" },
    logout: vi.fn(),
  }),
  isLoggedIn: () => true,
}))

const listSeasons = vi.fn()
const leaders = vi.fn()
vi.mock("@/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/client")>()),
  MetaService: {
    listSeasons: (...a: unknown[]) => listSeasons(...a),
    freshness: async () => ({
      data: { status: "fresh", label: "Up to date", last_ingested_at: null },
    }),
  },
  LeadersService: {
    leaders: (...a: unknown[]) => leaders(...a),
  },
}))

const season = (
  year: number,
  last_played_week: number | null,
): SeasonSummary => ({
  year,
  current_week: 18,
  week_count: 18,
  max_week: last_played_week === 22 ? 22 : 18,
  last_played_week,
  last_ingested_at: null,
})

const SEASONS = [season(2024, 22), season(2025, 22), season(2026, 10)]

const EMPTY_BOARD: LeadersResponse = {
  season: 2026,
  position: "QB",
  metric: "epa",
  metric_label: "EPA per play",
  unit: "EPA",
  precision: 3,
  baseline: 0,
  qualifier_label: "QB 8+ games · pro-rated to week 10 of 18",
  note: null,
  rows: [],
}

describe("the default season and week", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listSeasons.mockResolvedValue({ data: SEASONS })
    leaders.mockResolvedValue({ data: EMPTY_BOARD })
  })

  it("opens on the newest season at its last played week", async () => {
    const { router } = await renderRouteAt("/leaders")

    await waitFor(() =>
      expect(leaders).toHaveBeenCalledWith(
        expect.objectContaining({ path: { season: 2026 } }),
      ),
    )
    // Written into the URL, so the page that opened is the page a copied
    // link reproduces.
    expect(searchOf(router)).toMatchObject({ season: 2026, week: 10 })
  })

  it("never fetches the fallback season first", async () => {
    // Rendering the screen on the fallback and correcting it afterwards
    // would be two requests and an eyebrow that visibly changes year.
    await renderRouteAt("/leaders")
    await waitFor(() => expect(leaders).toHaveBeenCalled())

    expect(leaders).toHaveBeenCalledTimes(1)
    expect(leaders).not.toHaveBeenCalledWith(
      expect.objectContaining({ path: { season: 2025 } }),
    )
  })

  it("lets an explicit season and week win", async () => {
    const { router } = await renderRouteAt("/leaders?season=2024&week=3")

    await waitFor(() => expect(leaders).toHaveBeenCalled())
    expect(leaders).toHaveBeenCalledWith(
      expect.objectContaining({ path: { season: 2024 } }),
    )
    expect(searchOf(router)).toMatchObject({ season: 2024, week: 3 })
  })

  it("fills in only the week when the URL names a season", async () => {
    const { router } = await renderRouteAt("/leaders?season=2024")

    await waitFor(() => expect(searchOf(router).week).toBe(22))
    expect(searchOf(router).season).toBe(2024)
  })

  it("still renders, on the fallback, when the seasons request fails", async () => {
    listSeasons.mockRejectedValue(new Error("503"))
    await renderRouteAt("/leaders")

    await waitFor(() => expect(leaders).toHaveBeenCalled())
    expect(leaders).toHaveBeenCalledWith(
      expect.objectContaining({ path: { season: 2025 } }),
    )
  })
})

describe("the header picker", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listSeasons.mockResolvedValue({ data: SEASONS })
    leaders.mockResolvedValue({ data: EMPTY_BOARD })
  })

  it("changes the week without leaving the screen", async () => {
    // The write resolved from `/_layout`, a pathless route at "/", so
    // picking a week on /leaders navigated to the dashboard at "/".
    const { router } = await renderRouteAt("/leaders?season=2024&week=3")
    await screen.findByText("2024 season leaders")

    await userEvent.click(screen.getByRole("combobox", { name: "Week" }))
    await userEvent.click(await screen.findByRole("option", { name: "Week 2" }))

    await waitFor(() => expect(searchOf(router).week).toBe(2))
    expect(router.state.location.pathname).toBe("/leaders")
  })

  it("completes a bare URL without leaving the screen", async () => {
    const { router } = await renderRouteAt("/leaders?position=RB")

    await waitFor(() => expect(searchOf(router).season).toBe(2026))
    expect(router.state.location.pathname).toBe("/leaders")
    // ...and keeps the screen's own params.
    expect(searchOf(router).position).toBe("RB")
  })
})
