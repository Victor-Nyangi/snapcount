import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import type { StandingsRow } from "@/client"
import {
  getStandingsColumns,
  groupByDivision,
  groupLabelFor,
  sortStandingsRows,
  withDisplayRank,
} from "./columns"

function row(overrides: Partial<StandingsRow> = {}): StandingsRow {
  return {
    rank: 1,
    team: {
      abbr: "DET",
      name: "Detroit Lions",
      nickname: "Lions",
      conference: "NFC",
      division: "North",
      color: "#0076B6",
    },
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
    ...overrides,
  }
}

describe("sortStandingsRows", () => {
  const rows = [
    row({ team: { ...row().team, abbr: "A", name: "Team A" }, power: 50 }),
    row({ team: { ...row().team, abbr: "B", name: "Team B" }, power: 80 }),
    row({ team: { ...row().team, abbr: "C", name: "Team C" }, power: 65 }),
  ]

  it("sorts numerically descending by power", () => {
    const sorted = sortStandingsRows(rows, "power", "desc")
    expect(sorted.map((r) => r.team.abbr)).toEqual(["B", "C", "A"])
  })

  it("sorts numerically ascending by power", () => {
    const sorted = sortStandingsRows(rows, "power", "asc")
    expect(sorted.map((r) => r.team.abbr)).toEqual(["A", "C", "B"])
  })

  it("sorts alphabetically by name", () => {
    const shuffled = [rows[1], rows[2], rows[0]]
    const sorted = sortStandingsRows(shuffled, "name", "asc")
    expect(sorted.map((r) => r.team.abbr)).toEqual(["A", "B", "C"])
  })

  it("does not mutate the input array", () => {
    const original = [...rows]
    sortStandingsRows(rows, "power", "asc")
    expect(rows).toEqual(original)
  })

  it("orders streaks by signed magnitude, not string comparison", () => {
    // A naive string sort would put 'L10' before 'L2' ('1' < '2').
    const streakRows = [
      row({ team: { ...row().team, abbr: "X" }, streak: "L10" }),
      row({ team: { ...row().team, abbr: "Y" }, streak: "L2" }),
      row({ team: { ...row().team, abbr: "Z" }, streak: "W1" }),
    ]
    const sorted = sortStandingsRows(streakRows, "streak", "desc")
    expect(sorted.map((r) => r.team.abbr)).toEqual(["Z", "Y", "X"])
  })

  it("sorts 'record' by win pct (ties-aware), same order as 'pct'", () => {
    const recordRows = [
      row({ team: { ...row().team, abbr: "X" }, pct: 0.5 }),
      row({ team: { ...row().team, abbr: "Y" }, pct: 0.9 }),
    ]
    expect(
      sortStandingsRows(recordRows, "record", "desc").map((r) => r.team.abbr),
    ).toEqual(
      sortStandingsRows(recordRows, "pct", "desc").map((r) => r.team.abbr),
    )
  })

  it("sorts 'rank' using the server's raw rank field", () => {
    const rankRows = [
      row({ team: { ...row().team, abbr: "X" }, rank: 5 }),
      row({ team: { ...row().team, abbr: "Y" }, rank: 1 }),
    ]
    expect(
      sortStandingsRows(rankRows, "rank", "asc").map((r) => r.team.abbr),
    ).toEqual(["Y", "X"])
  })
})

describe("groupByDivision", () => {
  it("clusters rows by conference+division without disturbing intra-group order", () => {
    const rows = [
      row({
        team: {
          ...row().team,
          abbr: "AFC-N-2",
          conference: "AFC",
          division: "North",
        },
        power: 60,
      }),
      row({
        team: {
          ...row().team,
          abbr: "NFC-E-1",
          conference: "NFC",
          division: "East",
        },
        power: 90,
      }),
      row({
        team: {
          ...row().team,
          abbr: "AFC-N-1",
          conference: "AFC",
          division: "North",
        },
        power: 80,
      }),
    ]
    // Pre-sorted by power desc, as the screen would do before grouping.
    const preSorted = sortStandingsRows(rows, "power", "desc")
    const grouped = groupByDivision(preSorted)
    expect(grouped.map((r) => r.team.abbr)).toEqual([
      "AFC-N-1",
      "AFC-N-2",
      "NFC-E-1",
    ])
  })
})

describe("withDisplayRank", () => {
  it("numbers rows 1..N in the order given, independent of the API's rank field", () => {
    const rows = [row({ rank: 17 }), row({ rank: 3 })]
    const withRank = withDisplayRank(rows)
    expect(withRank.map((r) => r.displayRank)).toEqual([1, 2])
  })
})

describe("groupLabelFor", () => {
  it("joins conference and division", () => {
    const [display] = withDisplayRank([row()])
    expect(groupLabelFor(display)).toBe("NFC North")
  })
})

describe("getStandingsColumns", () => {
  const columns = getStandingsColumns({ powerMin: 50, powerMax: 90 })
  const byKey = Object.fromEntries(columns.map((c) => [c.key, c]))

  it("declares all 11 columns from the mockup's colDefs", () => {
    expect(columns.map((c) => c.key)).toEqual([
      "rank",
      "name",
      "record",
      "pct",
      "pf",
      "pa",
      "diff",
      "sos",
      "streak",
      "form",
      "power",
    ])
  })

  it("explicitly right-aligns plain-count columns that have neither precision nor signed", () => {
    // rank, pf, pa: no precision, no signed -> would default LEFT unless
    // align is declared explicitly (see stat-table/columns.ts resolveAlign).
    expect(byKey.rank.align).toBe("right")
    expect(byKey.rank.precision).toBeUndefined()
    expect(byKey.rank.signed).toBeUndefined()

    expect(byKey.pf.align).toBe("right")
    expect(byKey.pf.precision).toBeUndefined()
    expect(byKey.pf.signed).toBeUndefined()

    expect(byKey.pa.align).toBe("right")
    expect(byKey.pa.precision).toBeUndefined()
    expect(byKey.pa.signed).toBeUndefined()
  })

  it("only signs the differential column", () => {
    expect(byKey.diff.signed).toBe(true)
    expect(byKey.pf.signed).toBeFalsy()
    expect(byKey.pa.signed).toBeFalsy()
    expect(byKey.rank.signed).toBeFalsy()
  })

  it("excludes 'form' from sorting", () => {
    expect(byKey.form.sortable).toBe(false)
  })

  it("marks every other column sortable", () => {
    for (const key of [
      "rank",
      "name",
      "record",
      "pct",
      "pf",
      "pa",
      "diff",
      "sos",
      "streak",
      "power",
    ]) {
      expect(byKey[key].sortable).toBe(true)
    }
  })

  it("renders pct with the leading zero stripped", () => {
    const [display] = withDisplayRank([row({ pct: 0.7647058823529411 })])
    render(byKey.pct.render?.(display))
    expect(screen.getByText(".765")).toBeInTheDocument()
  })

  it("renders sos with the leading zero stripped", () => {
    const [display] = withDisplayRank([row({ sos: 0.1764705882352941 })])
    render(byKey.sos.render?.(display))
    expect(screen.getByText(".176")).toBeInTheDocument()
  })

  it("renders diff through DiffCell with the U+2212 minus sign", () => {
    const [display] = withDisplayRank([row({ differential: -185 })])
    render(byKey.diff.render?.(display))
    expect(screen.getByText("−185")).toBeInTheDocument()
  })

  it("renders a positive differential with a plus sign", () => {
    const [display] = withDisplayRank([row({ differential: 222 })])
    render(byKey.diff.render?.(display))
    expect(screen.getByText("+222")).toBeInTheDocument()
  })

  it("colors a losing streak differently from a winning streak", () => {
    const [win] = withDisplayRank([row({ streak: "W3" })])
    const [loss] = withDisplayRank([row({ streak: "L2" })])
    const { container: winContainer } = render(byKey.streak.render?.(win))
    const { container: lossContainer } = render(byKey.streak.render?.(loss))
    const winColor = (winContainer.querySelector("span") as HTMLElement).style
      .color
    const lossColor = (lossContainer.querySelector("span") as HTMLElement).style
      .color
    expect(winColor).not.toBe(lossColor)
  })

  it("colors a tie streak as neither a win nor a loss", () => {
    // app/analytics/standings.py emits "W3" | "L1" | "T1". A two-branch
    // ternary on startsWith("W") painted every tie in the loss ink.
    const colorFor = (streak: string) => {
      const [display] = withDisplayRank([row({ streak })])
      const { container } = render(byKey.streak.render?.(display))
      return (container.querySelector("span") as HTMLElement).style.color
    }
    const tie = colorFor("T1")
    expect(tie).not.toBe(colorFor("W3"))
    expect(tie).not.toBe(colorFor("L2"))
  })

  it("renders the power numeral to one decimal place alongside the bar", () => {
    const [display] = withDisplayRank([row({ power: 72.8 })])
    render(byKey.power.render?.(display))
    expect(screen.getByText("72.8")).toBeInTheDocument()
  })

  it("renders the '#' column from the computed display rank, not the API's raw rank", () => {
    const [display] = withDisplayRank([row({ rank: 17 })])
    expect(byKey.rank.value?.(display)).toBe(1)
  })

  it("shows a playoff seed badge when playoff_seed is present", () => {
    const [seeded] = withDisplayRank([row({ playoff_seed: 3 })])
    render(byKey.name.render?.(seeded))
    expect(screen.getByText("Seed 3")).toBeInTheDocument()
  })

  it("shows no seed badge when playoff_seed is null", () => {
    const [unseeded] = withDisplayRank([row({ playoff_seed: null })])
    render(byKey.name.render?.(unseeded))
    expect(screen.queryByText(/Seed/)).not.toBeInTheDocument()
  })

  it("labels the #1 seed 'Bye · 1'", () => {
    const [display] = withDisplayRank([row({ playoff_seed: 1 })])
    render(byKey.name.render?.(display))
    expect(screen.getByText("Bye · 1")).toBeInTheDocument()
  })
})
