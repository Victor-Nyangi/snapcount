import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  SeasonWeekPicker,
  seasonWeekSearchSchema,
  useSeasonWeek,
} from "./season-week-picker"

/**
 * `useSeasonWeek`/`SeasonWeekPicker` resolve their route context through
 * `getRouteApi("/_layout")`, so a real router — not a mocked hook — is
 * needed to prove state genuinely round-trips through the URL rather than
 * living in `useState` (a test that only checked the rendered value would
 * pass either way).
 */
const listSeasons = vi.fn()
vi.mock("@/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/client")>()),
  MetaService: {
    listSeasons: (...a: unknown[]) => listSeasons(...a),
  },
}))

/** Ten real seasons, as `/meta/seasons` actually reports them: 17 regular
 * weeks through 2020 and 18 from 2021, with four playoff rounds on top. */
const SEASONS = [
  ...[2016, 2017, 2018, 2019, 2020].map((year) => ({
    year,
    current_week: 17,
    week_count: 18,
    max_week: 21,
    last_ingested_at: null,
  })),
  ...[2021, 2022, 2023, 2024, 2025].map((year) => ({
    year,
    current_week: 18,
    week_count: 18,
    max_week: 22,
    last_ingested_at: null,
  })),
]

function withQuery(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>
}

function buildRouter(initialUrl: string, component: () => React.ReactElement) {
  const rootRoute = createRootRoute()
  const layoutRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/_layout",
    validateSearch: seasonWeekSearchSchema,
    component,
  })
  const routeTree = rootRoute.addChildren([layoutRoute])
  return createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [initialUrl] }),
  })
}

function HookHarness() {
  const { season, week, setSeason, setWeek } = useSeasonWeek()
  return (
    <div>
      <span data-testid="season-value">{season}</span>
      <span data-testid="week-value">{week}</span>
      <button type="button" onClick={() => setSeason(2023)}>
        Set season 2023
      </button>
      <button type="button" onClick={() => setWeek(9)}>
        Set week 9
      </button>
    </div>
  )
}

describe("useSeasonWeek", () => {
  it("mounting at ?season=2024&week=3 yields exactly that state", async () => {
    const router = buildRouter("/_layout?season=2024&week=3", HookHarness)
    render(<RouterProvider router={router} />)

    expect(await screen.findByTestId("season-value")).toHaveTextContent("2024")
    expect(screen.getByTestId("week-value")).toHaveTextContent("3")
  })

  it("falls back to the schema defaults when the URL has no season/week", async () => {
    const router = buildRouter("/_layout", HookHarness)
    render(<RouterProvider router={router} />)

    expect(await screen.findByTestId("season-value")).toHaveTextContent("2025")
    expect(screen.getByTestId("week-value")).toHaveTextContent("15")
  })

  it("changing season writes to the URL search params (not local state)", async () => {
    const router = buildRouter("/_layout?season=2024&week=3", HookHarness)
    render(<RouterProvider router={router} />)
    await screen.findByTestId("season-value")

    screen.getByRole("button", { name: "Set season 2023" }).click()

    await screen.findByText("2023")
    expect(router.state.location.search).toEqual({ season: 2023, week: 3 })
    expect(router.state.location.href).toContain("season=2023")
    // week is untouched — the write merges onto the previous search rather
    // than replacing it wholesale.
    expect(router.state.location.href).toContain("week=3")
  })

  it("changing week writes to the URL search params and preserves season", async () => {
    const router = buildRouter("/_layout?season=2024&week=3", HookHarness)
    render(<RouterProvider router={router} />)
    await screen.findByTestId("season-value")

    screen.getByRole("button", { name: "Set week 9" }).click()

    await screen.findByText("9")
    expect(router.state.location.search).toEqual({ season: 2024, week: 9 })
  })

  it("a URL copied from one router instance reproduces identical state in a fresh one", async () => {
    const first = buildRouter("/_layout?season=2024&week=3", HookHarness)
    const firstRender = render(<RouterProvider router={first} />)
    await firstRender.findByTestId("season-value")
    firstRender.getByRole("button", { name: "Set season 2023" }).click()
    await firstRender.findByText("2023")

    const copiedUrl = first.state.location.href
    firstRender.unmount()

    const second = buildRouter(copiedUrl, HookHarness)
    const secondRender = render(<RouterProvider router={second} />)

    expect(await secondRender.findByTestId("season-value")).toHaveTextContent(
      "2023",
    )
    expect(secondRender.getByTestId("week-value")).toHaveTextContent("3")
  })
})

describe("SeasonWeekPicker", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listSeasons.mockResolvedValue({ data: SEASONS })
  })

  it("shows the season and week selects reflecting the URL-backed state", async () => {
    const router = buildRouter("/_layout?season=2024&week=3", () => (
      <SeasonWeekPicker />
    ))
    render(withQuery(<RouterProvider router={router} />))

    const seasonTrigger = await screen.findByRole("combobox", {
      name: "Season",
    })
    expect(seasonTrigger).toHaveTextContent("2024")

    const weekTrigger = screen.getByRole("combobox", { name: "Week" })
    expect(weekTrigger).toHaveTextContent("Week 3")
  })

  it("offers every season the API reports, not a hard-coded three", async () => {
    // `SEASON_OPTIONS` was `[2025, 2024, 2023]` while ten seasons were
    // ingested, so seven of them could only be reached by hand-editing the
    // URL — and `/meta/seasons` has existed since Task 4.1 for exactly this
    // (its schema docstring reads "populates the season selector").
    const router = buildRouter("/_layout?season=2024&week=3", () => (
      <SeasonWeekPicker />
    ))
    render(withQuery(<RouterProvider router={router} />))

    await userEvent.click(
      await screen.findByRole("combobox", { name: "Season" }),
    )
    const options = await screen.findByRole("listbox")
    const labels = within(options)
      .getAllByRole("option")
      .map((o) => o.textContent)
    expect(labels).toEqual([
      "2025",
      "2024",
      "2023",
      "2022",
      "2021",
      "2020",
      "2019",
      "2018",
      "2017",
      "2016",
    ])
  })

  it("renders a season outside the old hard-coded list instead of going blank", async () => {
    // The symptom that made this visible: /standings?season=2017 rendered
    // 2017 data with an EMPTY Season control, because Radix has no item
    // matching the value.
    const router = buildRouter("/_layout?season=2017&week=3", () => (
      <SeasonWeekPicker />
    ))
    render(withQuery(<RouterProvider router={router} />))

    expect(
      await screen.findByRole("combobox", { name: "Season" }),
    ).toHaveTextContent("2017")
  })

  it("offers the playoff weeks, named, up to the season's real last week", async () => {
    // The postseason is weeks too. 2024 runs to week 22 and the Super Bowl
    // was unreachable from a selector that stopped at 18.
    const router = buildRouter("/_layout?season=2024&week=3", () => (
      <SeasonWeekPicker />
    ))
    render(withQuery(<RouterProvider router={router} />))

    await userEvent.click(await screen.findByRole("combobox", { name: "Week" }))
    const options = await screen.findByRole("listbox")
    const labels = within(options)
      .getAllByRole("option")
      .map((o) => o.textContent)
    expect(labels).toHaveLength(22)
    expect(labels[17]).toBe("Week 18")
    expect(labels.slice(18)).toEqual([
      "Wild card round",
      "Divisional round",
      "Conference championship",
      "Super Bowl",
    ])
  })

  it("moves the playoff rounds a week earlier in the 17-week era", async () => {
    // 2016-2020 played 17 regular-season weeks, so week 18 is the wild
    // card round there and week 21 the Super Bowl — one week earlier than
    // 2021+. A fixed list cannot express that; this is why the labels are
    // derived from `current_week` rather than hard-coded per number.
    const router = buildRouter("/_layout?season=2019&week=3", () => (
      <SeasonWeekPicker />
    ))
    render(withQuery(<RouterProvider router={router} />))

    await userEvent.click(await screen.findByRole("combobox", { name: "Week" }))
    const options = await screen.findByRole("listbox")
    const labels = within(options)
      .getAllByRole("option")
      .map((o) => o.textContent)
    expect(labels).toHaveLength(21)
    expect(labels[16]).toBe("Week 17")
    expect(labels[17]).toBe("Wild card round")
    expect(labels[20]).toBe("Super Bowl")
  })
})
