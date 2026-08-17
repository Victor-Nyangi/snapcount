import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { WeekGame, WeekResponse } from "@/client"
import { renderRouteAt, searchOf } from "./-route-harness"

vi.mock("@/hooks/useAuth", () => ({
  default: () => ({
    user: { id: "1", email: "ada@example.com" },
    logout: vi.fn(),
  }),
  isLoggedIn: () => true,
}))

const week = vi.fn()
vi.mock("@/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/client")>()),
  WeeksService: {
    week: (...args: unknown[]) => week(...args),
  },
}))

/**
 * Six REAL games from 2024 week 15, verbatim from `/api/v1/weeks/2024/15`,
 * chosen to span every case the two filters have to separate:
 *
 *   LAR at SF   — road win, home favourite lost      -> UPSET
 *   BAL at NYG  — road win by a −16.5 road FAVOURITE -> NOT an upset; the
 *                 one game that makes "road win" and "upset" differ
 *   PIT at PHI  — home favourite won                 -> neither
 *   NE  at ARI  — home favourite won                 -> neither
 *   DAL at CAR  — road win, home favourite lost      -> UPSET
 *   WAS at NO   — road win by a road favourite, by 1 -> CLOSE, not an upset
 *
 * `spread_line` is home-relative and POSITIVE means the HOME team is
 * favoured — the convention `line_label` is built from, and the one the
 * upset filter got backwards until `7c2314e`.
 */
const side = (
  abbr: string,
  nickname: string,
  name: string,
  color: string,
  score: number | null,
) => ({ abbr, nickname, name, color, score })

const game = (
  id: string,
  away: ReturnType<typeof side>,
  home: ReturnType<typeof side>,
  spread_line: number,
  line_label: string,
): WeekGame => ({
  id,
  kickoff_at: "2024-12-15T18:00:00Z",
  kickoff_label: "Sun 1:00p",
  status: "final",
  away,
  home,
  spread_line,
  line_label,
  margin: (home.score as number) - (away.score as number),
  recap: null,
})

const GAMES: WeekGame[] = [
  game(
    "2024_15_LA_SF",
    side("LA", "Rams", "Los Angeles Rams", "#003594", 12),
    side("SF", "49ers", "San Francisco 49ers", "#AA0000", 6),
    3,
    "SF -3",
  ),
  game(
    "2024_15_BAL_NYG",
    side("BAL", "Ravens", "Baltimore Ravens", "#241773", 35),
    side("NYG", "Giants", "New York Giants", "#0B2265", 14),
    -16.5,
    "BAL -16.5",
  ),
  game(
    "2024_15_PIT_PHI",
    side("PIT", "Steelers", "Pittsburgh Steelers", "#FFB612", 13),
    side("PHI", "Eagles", "Philadelphia Eagles", "#004C54", 27),
    5.5,
    "PHI -5.5",
  ),
  game(
    "2024_15_NE_ARI",
    side("NE", "Patriots", "New England Patriots", "#002A5C", 17),
    side("ARI", "Cardinals", "Arizona Cardinals", "#97233F", 30),
    6,
    "ARI -6",
  ),
  game(
    "2024_15_DAL_CAR",
    side("DAL", "Cowboys", "Dallas Cowboys", "#041E42", 30),
    side("CAR", "Panthers", "Carolina Panthers", "#0085CA", 14),
    2.5,
    "CAR -2.5",
  ),
  game(
    "2024_15_WAS_NO",
    side("WAS", "Commanders", "Washington Commanders", "#5A1414", 20),
    side("NO", "Saints", "New Orleans Saints", "#D3BC8D", 19),
    -7.5,
    "WAS -7.5",
  ),
]

const RESPONSE: WeekResponse = {
  season: 2024,
  week: 15,
  label: "Week 15 · 2024 regular season",
  games: GAMES,
  featured: [],
}

/**
 * Away-team nicknames in the order the SLATE TABLE renders them. Waits out
 * `StatTable`'s skeleton rows first — they are real `<tr>`s, so reading
 * straight after `findByRole("table")` silently returns an empty list.
 */
async function slateRowOrder() {
  const table = await screen.findByRole("table")
  await waitFor(() =>
    expect(screen.queryAllByTestId("stat-table-skeleton-row")).toHaveLength(0),
  )
  return within(table)
    .getAllByRole("row")
    .slice(1) // drop the header row
    .map((row) => {
      // The "Away" cell is a chip (abbreviation) followed by the nickname.
      const spans = row.querySelectorAll("td:nth-child(2) span")
      return spans[spans.length - 1]?.textContent
    })
    .filter(Boolean)
}

describe("/week route", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    week.mockResolvedValue({ data: RESPONSE })
  })

  it("defaults to the unfiltered slate and counts it from the fetched week", async () => {
    // The mockup hard-codes "All 16"; a real week can be short (byes), so
    // the count has to come from the fetched slate. Wait for the rows
    // BEFORE reading the pill — until the query resolves it says "All 0".
    const { router } = await renderRouteAt("/week?season=2024&week=15")

    expect(searchOf(router).slate).toBe("all")
    expect(await slateRowOrder()).toHaveLength(6)
    expect(screen.getByText("All 6")).toBeInTheDocument()
  })

  it("fetches the season and week from the layout's own search schema", async () => {
    await renderRouteAt("/week?season=2024&week=15")
    await screen.findByRole("table")

    expect(week).toHaveBeenCalledWith({ path: { season: 2024, week: 15 } })
  })

  it("puts the slate filter in the URL, and filters to the real upsets", async () => {
    // The load-bearing case: BAL at NYG is a road win by a −16.5 road
    // FAVOURITE. A "road team won" rule keeps it; "Underdog won" must not.
    const { router } = await renderRouteAt("/week?season=2024&week=15")
    await screen.findByRole("table")

    await userEvent.click(await screen.findByText("Underdog won"))

    await waitFor(() => expect(searchOf(router).slate).toBe("upset"))
    expect(await slateRowOrder()).toEqual(["Rams", "Cowboys"])
  })

  it("restores a shared URL's filter without any click", async () => {
    await renderRouteAt("/week?season=2024&week=15&slate=upset")
    expect(await slateRowOrder()).toEqual(["Rams", "Cowboys"])
  })

  it("keeps only one-score finishes under 'Decided by ≤3'", async () => {
    await renderRouteAt("/week?season=2024&week=15&slate=close")
    expect(await slateRowOrder()).toEqual(["Commanders"]) // NO lost by 1
  })

  it("never refetches on a filter change — the slate is client-side", async () => {
    // `["week", season, week]` deliberately excludes `slate`: the filter
    // runs over the fetched week, so a pill click must cost no request.
    const { router } = await renderRouteAt("/week?season=2024&week=15")
    await screen.findByRole("table")
    expect(week).toHaveBeenCalledTimes(1)

    await userEvent.click(await screen.findByText("Underdog won"))
    await waitFor(() => expect(searchOf(router).slate).toBe("upset"))
    expect(week).toHaveBeenCalledTimes(1)
  })

  it("shows the empty message when a filter selects nothing", async () => {
    week.mockResolvedValue({
      data: { ...RESPONSE, games: [GAMES[1]] }, // the lone road favourite
    })
    await renderRouteAt("/week?season=2024&week=15&slate=upset")

    expect(
      await screen.findByText("No games match this filter."),
    ).toBeInTheDocument()
  })

  it("renders one rail card per game, and the week's own eyebrow label", async () => {
    await renderRouteAt("/week?season=2024&week=15")

    expect(
      await screen.findByText("Week 15 · 2024 regular season"),
    ).toBeInTheDocument()
    // Each card names its away team; the slate table names it again, so
    // scope the count to the rail.
    const rail = await screen.findByLabelText("Every game in week 15")
    expect(within(rail).getAllByText("Final")).toHaveLength(6)
  })

  it("omits the featured grid entirely when the week has none", async () => {
    // Rather than rendering an empty grid or a heading over nothing.
    await renderRouteAt("/week?season=2024&week=15")
    await screen.findByRole("table")
    expect(screen.queryByText("at")).not.toBeInTheDocument()
  })
})
