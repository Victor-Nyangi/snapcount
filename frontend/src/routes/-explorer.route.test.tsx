import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ExplorerResponse } from "@/client"
import { renderRouteAt, searchOf } from "./-route-harness"

vi.mock("@/hooks/useAuth", () => ({
  default: () => ({
    user: { id: "1", email: "ada@example.com" },
    logout: vi.fn(),
  }),
  isLoggedIn: () => true,
}))

const differentials = vi.fn()
const listSeasons = vi.fn()
const freshness = vi.fn()
vi.mock("@/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/client")>()),
  ExplorerService: { differentials: (...a: unknown[]) => differentials(...a) },
  MetaService: {
    listSeasons: (...a: unknown[]) => listSeasons(...a),
    freshness: (...a: unknown[]) => freshness(...a),
  },
}))

/** `/meta/seasons` as it really answers — the shell's picker reads the
 * same query, so the explorer costs no extra request. */
const seasonList = (years: number[]) =>
  years.map((year) => ({
    year,
    current_week: 18,
    week_count: 18,
    max_week: 22,
    last_ingested_at: "2026-08-16T11:48:39Z",
  }))

const row = (
  abbr: string,
  name: string,
  conference: string,
  division: string,
  values: (number | null)[],
) => ({
  team: { abbr, name, color: "#0076B6", conference, division },
  values,
  total: values.reduce<number>((s, v) => s + (v ?? 0), 0),
})

/** Real 2023–2024 differentials for four teams. */
const RESPONSE: ExplorerResponse = {
  seasons: [2023, 2024],
  domain: 150,
  total_domain: 222,
  rows: [
    row("BUF", "Buffalo Bills", "AFC", "East", [74, 157]),
    row("DET", "Detroit Lions", "NFC", "North", [41, 222]),
    row("SF", "San Francisco 49ers", "NFC", "West", [193, -3]),
    row("NYJ", "New York Jets", "AFC", "East", [-87, -113]),
  ],
}

/** Team names in the order the grid actually renders their rows. */
async function rowOrder() {
  await screen.findByText("Detroit Lions")
  return RESPONSE.rows
    .map((r) => r.team.name)
    .filter((name) => screen.queryByText(name))
    .sort((a, b) =>
      screen.getByText(a).compareDocumentPosition(screen.getByText(b)) &
      Node.DOCUMENT_POSITION_FOLLOWING
        ? -1
        : 1,
    )
}

describe("/explorer route", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    differentials.mockResolvedValue({ data: RESPONSE })
    listSeasons.mockResolvedValue({
      data: seasonList([
        2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025,
      ]),
    })
    freshness.mockResolvedValue({
      data: { status: "final", label: "Final · updated Aug 16" },
    })
  })

  describe("the season range comes from the API, not a constant", () => {
    it("spans whatever seasons /meta/seasons reports", async () => {
      // An eleventh season lands in the next ingest. Nobody edits a
      // constant for it to appear.
      listSeasons.mockResolvedValue({
        data: seasonList([2017, 2018, 2019, 2020, 2021, 2022, 2023, 2026]),
      })

      await renderRouteAt("/explorer")
      await screen.findByText("Detroit Lions")

      expect(differentials).toHaveBeenCalledWith({
        query: { from: 2017, to: 2026 },
      })
      expect(screen.getByText("2017–2026")).toBeInTheDocument()
    })

    it("never asks for a range before it knows one", async () => {
      // Asking 2016–2025 first and the real range second would be two
      // requests and a visibly wrong eyebrow between them.
      let release: (value: unknown) => void = () => {}
      listSeasons.mockReturnValue(
        new Promise((resolve) => {
          release = resolve
        }),
      )

      await renderRouteAt("/explorer")
      await screen.findAllByTestId("explorer-skeleton-row")
      expect(differentials).not.toHaveBeenCalled()

      release({ data: seasonList([2019, 2020, 2021]) })
      await screen.findByText("Detroit Lions")
      expect(differentials).toHaveBeenCalledTimes(1)
      expect(differentials).toHaveBeenCalledWith({
        query: { from: 2019, to: 2021 },
      })
    })

    it("falls back to the known decade when the season list fails", async () => {
      // A grid of ten real seasons beats an empty screen when the only
      // thing that failed is the range.
      listSeasons.mockRejectedValue(new Error("meta is down"))

      await renderRouteAt("/explorer")
      await screen.findByText("Detroit Lions")

      expect(differentials).toHaveBeenCalledWith({
        query: { from: 2016, to: 2025 },
      })
      expect(screen.getByText("2016–2025")).toBeInTheDocument()
    })
  })

  it("defaults to the ten-year total order", async () => {
    const { router } = await renderRouteAt("/explorer")
    await screen.findByText("Detroit Lions")

    expect(searchOf(router).sort).toBe("total")
    expect(differentials).toHaveBeenCalledWith({
      query: { from: 2016, to: 2025 },
    })
    expect(await rowOrder()).toEqual([
      "Detroit Lions", // 263
      "Buffalo Bills", // 231
      "San Francisco 49ers", // 190
      "New York Jets", // -200
    ])
  })

  it("sorts by a season column when its header is clicked, via the URL", async () => {
    const { router } = await renderRouteAt("/explorer")
    await screen.findByText("Detroit Lions")

    await userEvent.click(screen.getByRole("button", { name: "2023" }))

    await waitFor(() => expect(searchOf(router).sort).toBe("2023"))
    expect((await rowOrder())[0]).toBe("San Francisco 49ers") // +193 in 2023
  })

  it("restores a shared sort without any click", async () => {
    await renderRouteAt("/explorer?sort=alpha")
    expect(await rowOrder()).toEqual([
      "Buffalo Bills",
      "Detroit Lions",
      "New York Jets",
      "San Francisco 49ers",
    ])
  })

  it("puts the SELECTED CELL in the URL so a drill-down can be linked", async () => {
    const { router } = await renderRouteAt("/explorer")
    await screen.findByText("Detroit Lions")

    await userEvent.click(
      screen.getByTitle("Detroit Lions · 2024 · +222 point differential"),
    )

    await waitFor(() => expect(searchOf(router).team).toBe("DET"))
    expect(searchOf(router).year).toBe(2024)
  })

  it("opens the drill-down straight from a shared URL", async () => {
    await renderRouteAt("/explorer?team=DET&year=2024")
    expect(await screen.findByText("Detroit Lions · 2024")).toBeInTheDocument()
    expect(screen.getByText(/Ranked #1 of 4/)).toBeInTheDocument()
  })

  it("shows no drill-down until a cell is chosen", async () => {
    await renderRouteAt("/explorer")
    await screen.findByText("Detroit Lions")
    expect(screen.queryByText(/Ranked #/)).not.toBeInTheDocument()
  })

  it("keeps the selection when the sort changes", async () => {
    // The row moves; the drill-down is about a team-season, not a position.
    const { router } = await renderRouteAt("/explorer?team=DET&year=2024")
    await screen.findByText("Detroit Lions · 2024")

    await userEvent.click(screen.getByRole("button", { name: "2023" }))

    await waitFor(() => expect(searchOf(router).sort).toBe("2023"))
    expect(searchOf(router).team).toBe("DET")
    expect(screen.getByText("Detroit Lions · 2024")).toBeInTheDocument()
  })

  describe("roving tabindex — 320 cells must not be 320 tab stops", () => {
    it("leaves exactly one cell tabbable", async () => {
      await renderRouteAt("/explorer")
      await screen.findByText("Detroit Lions")

      const cells = screen
        .getAllByRole("button")
        .filter((b) => b.getAttribute("title")?.includes("point differential"))
      expect(cells).toHaveLength(8)
      expect(cells.filter((c) => c.tabIndex === 0)).toHaveLength(1)
    })

    it("moves focus with the arrow keys", async () => {
      await renderRouteAt("/explorer")
      await screen.findByText("Detroit Lions")

      const first = screen.getByTitle(
        "Buffalo Bills · 2023 · +74 point differential",
      )
      first.focus()
      await userEvent.keyboard("{ArrowRight}")
      expect(document.activeElement).toHaveAttribute(
        "title",
        "Buffalo Bills · 2024 · +157 point differential",
      )
    })
  })

  it("scales the total column by the API's total_domain, not the season one", async () => {
    // -1193 and -751 both saturated under the old client-side `domain * 4`
    // = 600, so the decade's worst team and a merely bad one were the same
    // colour. Nine of the 32 teams were pinned that way.
    differentials.mockResolvedValue({
      data: {
        seasons: [2016],
        domain: 150,
        total_domain: 1193,
        rows: [
          row("NYJ", "New York Jets", "AFC", "East", [-1193]),
          row("CLE", "Cleveland Browns", "AFC", "North", [-751]),
        ],
      },
    })

    await renderRouteAt("/explorer")
    await screen.findByText("New York Jets")

    // One season means each row holds its number twice — the season cell,
    // then the total. Asserting the pair exists first keeps the [1] from
    // silently reading a season cell if that ever stops being true.
    const worst = screen.getAllByText("−1193")
    const bad = screen.getAllByText("−751")
    expect(worst).toHaveLength(2)
    expect(bad).toHaveLength(2)
    expect(worst[1]).toHaveStyle({ background: "oklch(0.77 0.17 25)" })
    expect(bad[1]).toHaveStyle({ background: "oklch(0.8441 0.1218 25)" })
  })

  it("titles every cell with team, season and signed differential", async () => {
    await renderRouteAt("/explorer")
    await screen.findByText("Detroit Lions")
    expect(
      screen.getByTitle("New York Jets · 2024 · −113 point differential"),
    ).toBeInTheDocument()
  })
})
