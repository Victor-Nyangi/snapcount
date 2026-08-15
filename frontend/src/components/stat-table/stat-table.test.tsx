import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { type StatColumn, StatTable } from "./stat-table"

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
    signed: true,
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

  it("renders an unsigned numeric column without a plus sign", () => {
    const unsignedColumns: StatColumn<Row>[] = [
      { key: "team", label: "Team", width: 190, value: (r) => r.team },
      { key: "diff", label: "PF", width: 84, value: (r) => r.diff },
    ]
    render(
      <StatTable
        caption="Unsigned"
        columns={unsignedColumns}
        rows={[{ team: "BUF", diff: 472, pct: 0 }]}
        rowKey={(r) => r.team}
      />,
    )
    expect(screen.getByText("472")).toBeInTheDocument()
    expect(screen.queryByText("+472")).not.toBeInTheDocument()
  })

  it("signs positive values on a `signed` column, leaves negative natural, and never signs zero", () => {
    const signedColumns: StatColumn<Row>[] = [
      { key: "team", label: "Team", width: 190, value: (r) => r.team },
      {
        key: "diff",
        label: "DIFF",
        width: 84,
        signed: true,
        value: (r) => r.diff,
      },
    ]
    render(
      <StatTable
        caption="Signed"
        columns={signedColumns}
        rows={[
          { team: "BUF", diff: 131, pct: 0 },
          { team: "CLE", diff: -185, pct: 0 },
          { team: "KC", diff: 0, pct: 0 },
        ]}
        rowKey={(r) => r.team}
      />,
    )
    expect(screen.getByText("+131")).toBeInTheDocument()
    expect(screen.getByText("-185")).toBeInTheDocument()
    expect(screen.getByText("0")).toBeInTheDocument()
    expect(screen.queryByText("+0")).not.toBeInTheDocument()
  })
})
