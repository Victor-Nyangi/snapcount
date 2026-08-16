import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router"
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
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
  it("shows the season and week selects reflecting the URL-backed state", async () => {
    const router = buildRouter("/_layout?season=2024&week=3", () => (
      <SeasonWeekPicker />
    ))
    render(<RouterProvider router={router} />)

    const seasonTrigger = await screen.findByRole("combobox", {
      name: "Season",
    })
    expect(seasonTrigger).toHaveTextContent("2024")

    const weekTrigger = screen.getByRole("combobox", { name: "Week" })
    expect(weekTrigger).toHaveTextContent("Week 3")
  })
})
