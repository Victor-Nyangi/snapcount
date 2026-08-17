import { useCallback } from "react"

/**
 * Sort logic for `StatTable`. `StatTable` never owns sort state — the URL
 * is the source of truth (a later task wires search params) — so this file
 * only computes the *next* state from the *current* one; the caller is
 * always responsible for storing what comes back.
 */

export interface SortState {
  key: string
  dir: "asc" | "desc"
}

/**
 * A newly-clicked column starts at `defaultDir`; re-clicking the active
 * column flips its direction.
 *
 * `defaultDir` exists because "the useful first click" is not the same for
 * every kind of column. For a quantity it is descending — biggest first.
 * For a name it is ascending — A→Z, which is what a column labelled "Sort
 * alphabetically" has to do on its first click. Resolving that here rather
 * than by inverting the comparator for strings is deliberate: `dir` is what
 * the URL carries and what `ariaSortFor` announces, so a column showing
 * A→Z must genuinely be in the "asc" state, not in "desc" with a
 * comparator quietly reversing it.
 */
export function nextSort(
  current: SortState | undefined,
  key: string,
  defaultDir: "asc" | "desc" = "desc",
): SortState {
  if (current?.key === key) {
    return { key, dir: current.dir === "desc" ? "asc" : "desc" }
  }
  return { key, dir: defaultDir }
}

export type AriaSort = "ascending" | "descending" | "none"

export function ariaSortFor(
  current: SortState | undefined,
  key: string,
): AriaSort {
  if (!current || current.key !== key) return "none"
  return current.dir === "asc" ? "ascending" : "descending"
}

/**
 * Returns a stable `activate(key)` callback that computes the next sort
 * state and hands it to `onSortChange`. Used by both the header's click
 * and keyboard (Enter/Space) handlers so the two can never disagree.
 */
export function useSortableHeader(
  sort: SortState | undefined,
  onSortChange?: (sort: SortState) => void,
) {
  return useCallback(
    (key: string, defaultDir?: "asc" | "desc") => {
      onSortChange?.(nextSort(sort, key, defaultDir))
    },
    [sort, onSortChange],
  )
}
