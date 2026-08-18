import { describe, expect, it } from "vitest"
import type { ExplorerRow } from "@/client"
import { orderRows } from "./order"

const row = (
  abbr: string,
  name: string,
  conference: string,
  division: string,
  values: (number | null)[],
): ExplorerRow => ({
  team: { abbr, name, color: "#000000", conference, division },
  values,
  total: values.reduce<number>((sum, v) => sum + (v ?? 0), 0),
})

/**
 * Seasons 2022, 2023, 2024 — three columns is the fewest that can tell a
 * season sort from a total sort.
 */
const SEASONS = [2022, 2023, 2024]

const NE = row("NE", "New England Patriots", "AFC", "East", [100, 100, 100])
const KC = row("KC", "Kansas City Chiefs", "AFC", "West", [50, 50, 50])
const CLE = row("CLE", "Cleveland Browns", "AFC", "North", [-10, -10, -10])
const rows = [KC, CLE, NE]

describe("orderRows", () => {
  it("sorts by ten-year total descending by default", () => {
    expect(orderRows(rows, "total", SEASONS).map((r) => r.team.abbr)).toEqual([
      "NE",
      "KC",
      "CLE",
    ])
  })

  it("sorts alphabetically by full team name, not abbreviation", () => {
    // The brief's example is ARI / ATL / BAL, which sorts identically under
    // BOTH rules and so cannot fail. LV / LAC / LAR is the one trio where
    // they disagree: Las Vegas precedes both Los Angeles clubs by name and
    // follows them both by abbreviation.
    const alpha = [
      row("LAC", "Los Angeles Chargers", "AFC", "West", [1, 1, 1]),
      row("LAR", "Los Angeles Rams", "NFC", "West", [2, 2, 2]),
      row("LV", "Las Vegas Raiders", "AFC", "West", [3, 3, 3]),
    ]
    expect(orderRows(alpha, "alpha", SEASONS).map((r) => r.team.abbr)).toEqual([
      "LV",
      "LAC",
      "LAR",
    ])
  })

  it("sorts by conference then division", () => {
    const divisional = [
      row("CHI", "Chicago Bears", "NFC", "North", [0, 0, 0]),
      row("MIA", "Miami Dolphins", "AFC", "East", [0, 0, 0]),
      row("BUF", "Buffalo Bills", "AFC", "East", [0, 0, 0]),
    ]
    expect(
      orderRows(divisional, "division", SEASONS).map((r) => r.team.division),
    ).toEqual(["East", "East", "North"])
    // …and the conference is the outer key, so both AFC rows come first.
    expect(
      orderRows(divisional, "division", SEASONS).map((r) => r.team.conference),
    ).toEqual(["AFC", "AFC", "NFC"])
  })

  it("sorts by a single season column descending", () => {
    const SF = row("SF", "San Francisco 49ers", "NFC", "West", [0, 200, 0])
    expect(orderRows([...rows, SF], "2023", SEASONS)[0].team.abbr).toBe("SF")
  })

  it("sorts a missing team-season last rather than treating it as zero", () => {
    // A null is the absence of a season, not a zero differential. Sorted
    // as zero it would land in the middle of the column, above every team
    // that actually had a losing year.
    const teamWithNull2023 = row("LV", "Las Vegas Raiders", "AFC", "West", [
      0,
      null,
      0,
    ])
    const ordered = orderRows([...rows, teamWithNull2023], "2023", SEASONS)
    expect(ordered[ordered.length - 1].team.abbr).toBe("LV")
  })

  it("keeps a missing season last even when every real value is negative", () => {
    // The trap the previous test cannot spring: with CLE at −10, a null
    // read as 0 would sort ABOVE it and look like the better season.
    const teamWithNull = row("LV", "Las Vegas Raiders", "AFC", "West", [
      0,
      null,
      0,
    ])
    const ordered = orderRows([CLE, teamWithNull], "2023", SEASONS)
    expect(ordered.map((r) => r.team.abbr)).toEqual(["CLE", "LV"])
  })

  it("leaves the caller's array untouched", () => {
    const original = [...rows]
    orderRows(rows, "alpha", SEASONS)
    expect(rows).toEqual(original)
  })

  it("falls back to the total order for an unknown sort key", () => {
    // `sort` is a free string in the URL, so a hand-edited one must not
    // produce an arbitrary order.
    expect(
      orderRows(rows, "nonsense", SEASONS).map((r) => r.team.abbr),
    ).toEqual(["NE", "KC", "CLE"])
  })

  it("ignores a season that is not in this response", () => {
    // e.g. a link shared from a different from/to range.
    expect(orderRows(rows, "1999", SEASONS).map((r) => r.team.abbr)).toEqual([
      "NE",
      "KC",
      "CLE",
    ])
  })
})

describe("orderRows — comparator safety", () => {
  const mk = (abbr: string, v: number | null) => ({
    team: {
      abbr,
      name: abbr,
      color: "#000",
      conference: "AFC",
      division: "East",
    },
    values: [v],
    total: v ?? 0,
  })

  it("returns a real number for two missing values, never NaN", () => {
    // A comparator that returns NaN has undefined behaviour; two absent
    // seasons must simply compare equal and keep their existing order.
    const ordered = orderRows(
      [mk("A", null), mk("B", null)] as never,
      "2022",
      [2022],
    )
    expect(ordered.map((r) => r.team.abbr)).toEqual(["A", "B"])
  })
})
