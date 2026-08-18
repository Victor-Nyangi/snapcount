import type { ExplorerRow } from "@/client"

/**
 * The explorer's four row orders. `sort` arrives as a free string from the
 * URL — `'total'`, `'alpha'`, `'division'`, or a season year — so anything
 * unrecognised falls back to the default rather than producing an
 * arbitrary order from a hand-edited link.
 */
export type ExplorerSort = string

/**
 * A missing team-season sorts LAST, never as zero.
 *
 * The distinction is the whole reason `values` is `(number | null)[]`
 * rather than `number[]`: a franchise with no row for a season did not
 * have a zero differential, it had no season. Ranked as zero it would land
 * mid-column, above every team that actually played and lost — which reads
 * as the better year.
 *
 * Today's backfill has all 32 teams in all 10 seasons, so nothing exercises
 * this from the live API. It stays exact because the column is nullable in
 * the response and a relocation gap is the case it exists for.
 */
function compareSeason(a: number | null, b: number | null): number {
  // Both absent: equal, and `Array#sort` is stable, so they keep whatever
  // order the previous sort left them in. Subtracting two sentinels would
  // give NaN here, which a comparator must never return.
  if (a === null && b === null) return 0
  if (a === null) return 1 // a sorts after
  if (b === null) return -1
  return b - a // descending
}

export function orderRows(
  rows: ExplorerRow[],
  sort: ExplorerSort,
  seasons: number[],
): ExplorerRow[] {
  // Never sort the caller's array in place — `rows` comes straight from
  // react-query's cache, and mutating it would reorder the cached payload
  // for every other reader.
  const ordered = [...rows]

  if (sort === "alpha") {
    // By FULL NAME, not abbreviation: the grid's row label is the name, so
    // the order the reader sees has to be the order it is sorted in.
    return ordered.sort((a, b) => a.team.name.localeCompare(b.team.name))
  }

  if (sort === "division") {
    return ordered.sort((a, b) =>
      `${a.team.conference} ${a.team.division}`.localeCompare(
        `${b.team.conference} ${b.team.division}`,
      ),
    )
  }

  const seasonIndex = seasons.indexOf(Number(sort))
  if (seasonIndex !== -1) {
    return ordered.sort((a, b) =>
      compareSeason(a.values[seasonIndex], b.values[seasonIndex]),
    )
  }

  // 'total', and anything unrecognised.
  return ordered.sort((a, b) => b.total - a.total)
}
