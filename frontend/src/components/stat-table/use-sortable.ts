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
 * A newly-clicked column starts descending; re-clicking the active column
 * flips its direction.
 */
export function nextSort(
  current: SortState | undefined,
  key: string,
): SortState {
  if (current?.key === key) {
    return { key, dir: current.dir === "desc" ? "asc" : "desc" }
  }
  return { key, dir: "desc" }
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
    (key: string) => {
      onSortChange?.(nextSort(sort, key))
    },
    [sort, onSortChange],
  )
}
