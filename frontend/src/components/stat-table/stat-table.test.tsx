import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { type StatColumn, StatTable } from "./stat-table"

// jsdom doesn't implement ResizeObserver. Radix's Tooltip Arrow (used by
// the DIFF column's header tooltip) measures itself with it, and the
// tooltip opens on keyboard focus as well as hover — that's deliberate,
// not incidental, per the a11y requirement that focus must work like a
// mouse user's hover. This stub only fills the test-environment gap; real
// browsers have ResizeObserver natively. Scoped to this file rather than
// the shared vitest.setup.ts, since touching shared test infra is outside
// this task's declared scope.
if (typeof ResizeObserver === "undefined") {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

type Row = { team: string; diff: number; pct: number }

const rows: Row[] = [
  { team: "BUF", diff: 131, pct: 0.7647 },
  { team: "CLE", diff: -185, pct: 0.1765 },
  { team: "KC", diff: 123, pct: 0.7059 },
]

const columns: StatColumn<Row>[] = [
  {
    key: "team",
    label: "Team",
    width: 190,
    align: "left",
    sticky: true,
    sortable: true,
    value: (r) => r.team,
  },
  {
    key: "diff",
    label: "DIFF",
    title: "Point differential",
    width: 84,
    sortable: true,
    value: (r) => r.diff,
  },
  {
    key: "pct",
    label: "PCT",
    width: 68,
    precision: 3,
    sortable: true,
    value: (r) => r.pct,
  },
]

const setup = (props = {}) =>
  render(
    <StatTable
      caption="Test standings"
      columns={columns}
      rows={rows}
      rowKey={(r) => r.team}
      {...props}
    />,
  )

describe("StatTable", () => {
  it("renders a semantic table with a caption", () => {
    setup()
    expect(
      screen.getByRole("table", { name: "Test standings" }),
    ).toBeInTheDocument()
    expect(screen.getAllByRole("row")).toHaveLength(4) // header + 3
  })

  it("applies fixed per-column precision, not per cell", () => {
    setup()
    expect(screen.getByText(".765")).toBeInTheDocument()
    expect(screen.getByText(".176")).toBeInTheDocument()
  })

  it("right-aligns numeric columns and left-aligns text", () => {
    setup()
    expect(screen.getByRole("columnheader", { name: /DIFF/ })).toHaveClass(
      "text-right",
    )
    expect(screen.getByRole("columnheader", { name: /Team/ })).toHaveClass(
      "text-left",
    )
  })

  it("marks sort state with aria-sort", () => {
    setup({ sort: { key: "diff", dir: "desc" } })
    expect(screen.getByRole("columnheader", { name: /DIFF/ })).toHaveAttribute(
      "aria-sort",
      "descending",
    )
    expect(screen.getByRole("columnheader", { name: /PCT/ })).toHaveAttribute(
      "aria-sort",
      "none",
    )
  })

  it("toggles direction when the active column is clicked again", () => {
    const onSortChange = vi.fn()
    setup({ sort: { key: "diff", dir: "desc" }, onSortChange })
    fireEvent.click(screen.getByRole("button", { name: /DIFF/ }))
    expect(onSortChange).toHaveBeenCalledWith({ key: "diff", dir: "asc" })
  })

  it("starts a newly-clicked column descending", () => {
    const onSortChange = vi.fn()
    setup({ sort: { key: "diff", dir: "desc" }, onSortChange })
    fireEvent.click(screen.getByRole("button", { name: /PCT/ }))
    expect(onSortChange).toHaveBeenCalledWith({ key: "pct", dir: "desc" })
  })

  it("sorts headers with the keyboard", () => {
    const onSortChange = vi.fn()
    setup({ onSortChange })
    const header = screen.getByRole("button", { name: /DIFF/ })
    header.focus()
    fireEvent.keyDown(header, { key: "Enter" })
    expect(onSortChange).toHaveBeenCalled()
  })

  it("moves focus between cells with the arrow keys", () => {
    setup()
    const first = screen.getByText("BUF").closest("td")!
    first.focus()
    fireEvent.keyDown(first, { key: "ArrowRight" })
    expect(document.activeElement).toHaveTextContent("+131")
  })

  it("renders skeleton rows while loading and no data rows", () => {
    setup({ isLoading: true })
    expect(screen.queryByText("BUF")).not.toBeInTheDocument()
    expect(
      screen.getAllByTestId("stat-table-skeleton-row").length,
    ).toBeGreaterThan(0)
  })

  it("renders the empty message when there are no rows", () => {
    setup({ rows: [], emptyMessage: "No teams match this filter." })
    expect(screen.getByText("No teams match this filter.")).toBeInTheDocument()
  })

  it("renders a full-width heading per group", () => {
    setup({
      groupBy: (r: Row) => (r.team === "CLE" ? "AFC North" : "AFC East"),
    })
    const heading = screen.getByText("AFC North").closest("td")!
    expect(heading).toHaveAttribute("colspan", "3")
  })
})
