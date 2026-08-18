/**
 * The seven screens Task 6.2 walks, as linkable URLs.
 *
 * Every route under `_layout` carries a season/week query string from the
 * layout's `validateSearch` defaults, so these are pinned to a season the
 * backfill actually has rather than letting the default drift.
 */
export const SCREENS: { name: string; path: string }[] = [
  { name: "week", path: "/week?season=2024&week=15" },
  { name: "standings", path: "/standings?season=2024" },
  { name: "leaders", path: "/leaders?season=2024" },
  { name: "team", path: "/team/DET?season=2024" },
  { name: "player", path: "/player?season=2024" },
  { name: "explorer", path: "/explorer?season=2024" },
  { name: "history", path: "/history?season=2024" },
]
