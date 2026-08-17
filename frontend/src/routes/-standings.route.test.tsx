import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { StandingsResponse, StandingsRow } from "@/client"
import { renderRouteAt, searchOf } from "./-route-harness"

vi.mock("@/hooks/useAuth", () => ({
  default: () => ({
    user: { id: "1", email: "ada@example.com" },
    logout: vi.fn(),
  }),
  isLoggedIn: () => true,
}))

const standings = vi.fn()
vi.mock("@/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/client")>()),
  StandingsService: {
    standings: (...args: unknown[]) => standings(...args),
  },
}))

/**
 * Five REAL 2024 rows, verbatim from `/api/v1/standings/2024` — the whole
 * AFC East plus Detroit. Two divisions is the minimum that can tell a
 * grouped view from an ungrouped one, and using real rows means the
 * expected orders below are the orders the live screen actually produces
 * (DET 15-2 / +222 / power 72.8 is the project's standing spot-check).
 */
const team = (
  abbr: string,
  name: string,
  nickname: string,
  conference: string,
  division: string,
  color: string,
) => ({ abbr, name, nickname, conference, division, color })

const ROWS: StandingsRow[] = [
  {
    rank: 1,
    team: team("DET", "Detroit Lions", "Lions", "NFC", "North", "#0076B6"),
    wins: 15,
    losses: 2,
    ties: 0,
    record_label: "15-2",
    pct: 0.8823529411764706,
    points_for: 564,
    points_against: 342,
    differential: 222,
    sos: 0.5155709342560554,
    streak: "W3",
    form: "WLWWW",
    playoff_seed: null,
    power: 72.8,
  },
  {
    rank: 4,
    team: team("BUF", "Buffalo Bills", "Bills", "AFC", "East", "#00338D"),
    wins: 13,
    losses: 4,
    ties: 0,
    record_label: "13-4",
    pct: 0.7647058823529411,
    points_for: 525,
    points_against: 368,
    differential: 157,
    sos: 0.4671280276816609,
    streak: "L1",
    form: "LWWWL",
    playoff_seed: null,
    power: 64.5,
  },
  {
    rank: 20,
    team: team("MIA", "Miami Dolphins", "Dolphins", "AFC", "East", "#008E97"),
    wins: 8,
    losses: 9,
    ties: 0,
    record_label: "8-9",
    pct: 0.47058823529411764,
    points_for: 345,
    points_against: 364,
    differential: -19,
    sos: 0.4186851211072664,
    streak: "L1",
    form: "WLWWL",
    playoff_seed: null,
    power: 45.2,
  },
  {
    rank: 24,
    team: team("NYJ", "New York Jets", "Jets", "AFC", "East", "#115740"),
    wins: 5,
    losses: 12,
    ties: 0,
    record_label: "5-12",
    pct: 0.29411764705882354,
    points_for: 338,
    points_against: 404,
    differential: -66,
    sos: 0.4948096885813149,
    streak: "W1",
    form: "LWLLW",
    playoff_seed: null,
    power: 42.3,
  },
  {
    rank: 29,
    team: team(
      "NE",
      "New England Patriots",
      "Patriots",
      "AFC",
      "East",
      "#002A5C",
    ),
    wins: 4,
    losses: 13,
    ties: 0,
    record_label: "4-13",
    pct: 0.23529411764705882,
    points_for: 289,
    points_against: 417,
    differential: -128,
    sos: 0.47058823529411764,
    streak: "W1",
    form: "LLLLW",
    playoff_seed: null,
    power: 35.7,
  },
]

const RESPONSE: StandingsResponse = {
  season: 2024,
  formula_label:
    "0.55 × point differential per game + 0.30 × strength of schedule + 0.15 × win rate, scaled to 100",
  rows: ROWS,
}

/**
 * Waits past `StatTable`'s skeleton rows, then reads the team names in the
 * order the table actually renders them.
 */
async function renderedTeamOrder() {
  await screen.findByText("Detroit Lions")
  const table = screen.getByRole("table")
  const names = ROWS.map((r) => r.team.name)
  return within(table)
    .getAllByText((_, el) => names.includes(el?.textContent ?? ""))
    .filter((el) => el.tagName === "SPAN")
    .map((el) => el.textContent)
}

/**
 * The decorative `PowerBar` inside a given team's row, by its inline width.
 * Matched on its `--orchid-700` fill: the row also holds `FormDots`, which
 * are likewise aria-hidden spans carrying an inline width.
 */
async function powerBarWidthFor(teamName: string) {
  const row = (await screen.findByText(teamName)).closest("tr")!
  const bar = row.querySelector('span[style*="--orchid-700"]')
  return (bar as HTMLElement).style.width
}

describe("/standings route", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    standings.mockResolvedValue({ data: RESPONSE })
  })

  it("defaults to power desc, grouped by division — NOT DET first", async () => {
    // The 5.1 review corrected the acceptance check for exactly this: the
    // default view groups, so the top power team is NOT the first row. BUF
    // leads because AFC East sorts before NFC North; DET is last of five.
    const { router } = await renderRouteAt("/standings?season=2024")

    expect(await renderedTeamOrder()).toEqual([
      "Buffalo Bills",
      "Miami Dolphins",
      "New York Jets",
      "New England Patriots",
      "Detroit Lions",
    ])
    expect(await screen.findByText("AFC East")).toBeInTheDocument()
    expect(await screen.findByText("NFC North")).toBeInTheDocument()

    const search = searchOf(router)
    expect(search.sort).toBe("power")
    expect(search.dir).toBe("desc")
    expect(search.group).toBe("division")
  })

  it("turns grouping OFF when any column header is sorted", async () => {
    // An explicit Step-1 requirement, and the mockup's own behaviour
    // (`groupByDiv:false` inside its sort handler): grouping and free
    // sorting are mutually exclusive. Nothing covered it until now.
    const { router } = await renderRouteAt("/standings?season=2024")
    await screen.findByText("AFC East")

    await userEvent.click(await screen.findByRole("button", { name: /Team/ }))

    await waitFor(() => expect(searchOf(router).group).toBe("none"))
    expect(screen.queryByText("AFC East")).not.toBeInTheDocument()
    expect(screen.queryByText("NFC North")).not.toBeInTheDocument()
  })

  it("writes the whole sort into the URL, opening Team A→Z", async () => {
    // Round-trip, and the 5.1 defect-1 regression: the shared default
    // direction is 'desc', which would open a name column Z→A.
    const { router } = await renderRouteAt("/standings?season=2024")
    await screen.findByRole("table")

    await userEvent.click(await screen.findByRole("button", { name: /Team/ }))

    await waitFor(() => expect(searchOf(router).sort).toBe("name"))
    expect(searchOf(router).dir).toBe("asc")
    expect(await renderedTeamOrder()).toEqual([
      "Buffalo Bills",
      "Detroit Lions",
      "Miami Dolphins",
      "New England Patriots",
      "New York Jets",
    ])
  })

  it("restores a shared URL's full view without any click", async () => {
    // The other half of the round-trip: the URL is the source of truth, so
    // a pasted link must reproduce the view it was copied from.
    await renderRouteAt("/standings?season=2024&sort=pa&dir=asc&group=none")

    expect(await renderedTeamOrder()).toEqual([
      "Detroit Lions", // 342 points against
      "Miami Dolphins", // 364
      "Buffalo Bills", // 368
      "New York Jets", // 404
      "New England Patriots", // 417
    ])
    expect(screen.queryByText("AFC East")).not.toBeInTheDocument()
  })

  it("refetches on season and conference, but never on sort or grouping", async () => {
    // The query key is `[standings, season, conference]` precisely because
    // sorting and grouping are client-side over whatever was fetched. A key
    // that included them would put a network round-trip behind every header
    // click.
    const { router } = await renderRouteAt("/standings?season=2024")
    await screen.findByRole("table")
    expect(standings).toHaveBeenCalledTimes(1)

    await userEvent.click(await screen.findByRole("button", { name: /PWR/ }))
    await waitFor(() => expect(searchOf(router).dir).toBe("asc"))
    expect(standings).toHaveBeenCalledTimes(1)

    await userEvent.click(await screen.findByText("AFC"))
    await waitFor(() => expect(standings).toHaveBeenCalledTimes(2))
  })

  it("sends no conference param at all for 'Both conferences'", async () => {
    // `ALL` is the absence of a filter, not a value the API knows.
    await renderRouteAt("/standings?season=2024")
    await screen.findByRole("table")

    expect(standings).toHaveBeenCalledWith({
      path: { season: 2024 },
      query: { conference: undefined },
    })
  })

  it("scales the power bars against the fetched rows, not the sorted view", async () => {
    // `powerMin`/`powerMax` are sourced from `rows` (pre-sort, pre-group).
    // Re-deriving them from the display rows would let the scale shift
    // under the user as they sort, so a team's bar must be the same width
    // in every view. DET is the max (72.8 -> 6+46) and NE the min (35.7 -> 6).
    await renderRouteAt("/standings?season=2024")
    expect(await powerBarWidthFor("Detroit Lions")).toBe("52px")
    expect(await powerBarWidthFor("New England Patriots")).toBe("6px")

    await userEvent.click(await screen.findByRole("button", { name: /Team/ }))
    await waitFor(async () =>
      expect(await powerBarWidthFor("Detroit Lions")).toBe("52px"),
    )
    expect(await powerBarWidthFor("New England Patriots")).toBe("6px")
  })

  it("shows the empty message rather than a bare table when nothing matches", async () => {
    standings.mockResolvedValue({ data: { ...RESPONSE, rows: [] } })
    await renderRouteAt("/standings?season=2024")
    expect(
      await screen.findByText("No teams match this filter."),
    ).toBeInTheDocument()
  })
})
