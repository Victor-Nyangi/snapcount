import { screen, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { HistoryResponse } from "@/client"
import { championsByDecade } from "./_layout/history"
import { renderRouteAt } from "./-route-harness"

vi.mock("@/hooks/useAuth", () => ({
  default: () => ({
    user: { id: "1", email: "ada@example.com" },
    logout: vi.fn(),
  }),
  isLoggedIn: () => true,
}))

const champions = vi.fn()
vi.mock("@/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/client")>()),
  HistoryService: { champions: (...a: unknown[]) => champions(...a) },
}))

const champ = (season: number, abbr: string, name: string, result: string) => ({
  season,
  team: {
    abbr,
    name,
    nickname: name.split(" ").pop() ?? name,
    color: "#004C54",
  },
  result,
})

/** The real seeded reference data: 25 seasons, 2000–2024. */
const ALL = [
  ...Array.from({ length: 5 }, (_, i) =>
    champ(2024 - i, "PHI", "Philadelphia Eagles", "40–22 over Kansas City"),
  ),
  ...Array.from({ length: 10 }, (_, i) =>
    champ(2019 - i, "NE", "New England Patriots", "13–3 over Los Angeles"),
  ),
  ...Array.from({ length: 10 }, (_, i) =>
    champ(2009 - i, "PIT", "Pittsburgh Steelers", "27–23 over Arizona"),
  ),
]

const RESPONSE: HistoryResponse = {
  champions: ALL,
  most_titles: [
    { team: { abbr: "NE", nickname: "Patriots", color: "#002A5C" }, count: 6 },
    { team: { abbr: "KC", nickname: "Chiefs", color: "#E31837" }, count: 3 },
  ],
  dynasties: [
    {
      team: { abbr: "NE", color: "#002A5C" },
      label: "New England, 2001–2018",
      titles: 6,
      note: "Six titles in eighteen seasons, nine Super Bowl appearances.",
    },
    {
      team: { abbr: "NYG", color: "#0B2265" },
      label: "New York, 2007–2011",
      titles: 2,
      note: "Two titles as an underdog, both over the same opponent.",
    },
  ],
}

describe("championsByDecade", () => {
  it("puts ten seasons in the 2000s and the 2010s, five in the 2020s", () => {
    // Task 5.8's Step 4 says the 2000s holds FIVE. That contradicts the
    // filter the same step specifies (`>= start && < start + 10`), and the
    // live payload gives ten: the seeded data runs 2000–2024, so only the
    // 2020s is a partial decade.
    expect(championsByDecade(ALL, 2000)).toHaveLength(10)
    expect(championsByDecade(ALL, 2010)).toHaveLength(10)
    expect(championsByDecade(ALL, 2020)).toHaveLength(5)
  })

  it("groups on the SEASON, not the year the game was played", () => {
    // A Super Bowl is played the February after its season, so the 2019
    // champion lifted the trophy in 2020. Reading the trophy year would
    // move that row into the 2020s.
    expect(championsByDecade(ALL, 2010).map((c) => c.season)).toContain(2019)
    expect(championsByDecade(ALL, 2020).map((c) => c.season)).not.toContain(
      2019,
    )
  })

  it("orders each decade newest first", () => {
    expect(championsByDecade(ALL, 2020).map((c) => c.season)).toEqual([
      2024, 2023, 2022, 2021, 2020,
    ])
  })

  it("does not mutate the source array", () => {
    const before = ALL.map((c) => c.season)
    championsByDecade(ALL, 2000)
    expect(ALL.map((c) => c.season)).toEqual(before)
  })
})

describe("/history route", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    champions.mockResolvedValue({ data: RESPONSE })
  })

  it("renders the three decade sections with the right counts", async () => {
    const { container } = await renderRouteAt("/history")
    await screen.findByRole("heading", { name: "2020s" })

    const sections = Array.from(container.querySelectorAll("section"))
    expect(sections.map((s) => s.querySelector("h2")?.textContent)).toEqual([
      "2020s",
      "2010s",
      "2000s",
    ])
    // Each champion row carries exactly one season numeral.
    expect(within(sections[0]).getAllByText(/^20\d\d$/)).toHaveLength(5)
    expect(within(sections[2]).getAllByText(/^20\d\d$/)).toHaveLength(10)
  })

  it("renders the most-titles summary", async () => {
    await renderRouteAt("/history")
    expect(await screen.findByText("Patriots")).toBeInTheDocument()
    expect(screen.getByText("6")).toBeInTheDocument()
  })

  it("renders a dynasty card per run, pluralising the title count", async () => {
    await renderRouteAt("/history")
    expect(
      await screen.findByText("New England, 2001–2018"),
    ).toBeInTheDocument()
    expect(screen.getByText("6 titles")).toBeInTheDocument()
    expect(screen.getByText("2 titles")).toBeInTheDocument()
  })

  it("is a plain list, not a StatTable", async () => {
    // Reference content, not analysis: no sortable headers, no roving
    // tabindex, nothing that announces interactivity it does not have.
    await renderRouteAt("/history")
    await screen.findByRole("heading", { name: "2020s" })
    expect(screen.queryByRole("table")).not.toBeInTheDocument()
  })
})
