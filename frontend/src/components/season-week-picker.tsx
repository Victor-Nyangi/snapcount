import { getRouteApi, useSearch } from "@tanstack/react-router"
import { z } from "zod"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

/**
 * Season/week search-param schema. Registered on the `_layout` route's
 * `validateSearch` (see `_layout.tsx`) so every route under the app shell
 * inherits typed, coerced, defaulted `season`/`week` search params. This is
 * the ONLY home for this state — nothing here or downstream should ever
 * hold season/week in `useState`; the URL is the source of truth so every
 * view stays linkable and back-button correct.
 *
 * Colocated here rather than duplicated between this file and the route
 * file, and imported into `_layout.tsx`'s `validateSearch`.
 */
export const seasonWeekSearchSchema = z.object({
  season: z.coerce.number().int().min(1999).max(2100).default(2025),
  week: z.coerce.number().int().min(1).max(22).default(15),
})

export type SeasonWeekSearch = z.infer<typeof seasonWeekSearchSchema>

const DEFAULT_SEASON = seasonWeekSearchSchema.shape.season.parse(undefined)
const DEFAULT_WEEK = seasonWeekSearchSchema.shape.week.parse(undefined)

// `_layout` is where `seasonWeekSearchSchema` is registered as
// `validateSearch` (see `_layout.tsx`), and `SeasonWeekPicker`/
// `useSeasonWeek` are only ever rendered inside that route's own header, so
// scoping the *write* side to it is safe at runtime and — unlike a bare
// `useNavigate()` — gives TypeScript a concrete search schema to type the
// `prev => ({ ...prev, season })` reducer against. A bare `useNavigate()`
// defaults to the router root, where TS must satisfy every route's search
// schema at once (including e.g. `/reset-password`'s unrelated `token`
// param), which made the reducer's return type fail to typecheck.
const routeApi = getRouteApi("/_layout")

/**
 * Reads/writes season & week exclusively through the router's URL search
 * params. Read via `useSearch({ strict: false })` — works from any route,
 * not just ones that declare the schema themselves; write via
 * `navigate({ search: prev => ({ ...prev, season }) })`, which preserves
 * every other search param already present.
 */
export function useSeasonWeek() {
  const search = useSearch({ strict: false }) as Partial<SeasonWeekSearch>
  const navigate = routeApi.useNavigate()

  const setSeason = (season: number) => {
    navigate({ search: (prev) => ({ ...prev, season }) })
  }
  const setWeek = (week: number) => {
    navigate({ search: (prev) => ({ ...prev, week }) })
  }

  return {
    season: search.season ?? DEFAULT_SEASON,
    week: search.week ?? DEFAULT_WEEK,
    setSeason,
    setWeek,
  }
}

// Faithful to the mockup's static <option> list (resources/design-v2-seven-
// screens.html) rather than a computed range: no season-availability
// endpoint exists yet (that lands with GET /meta/freshness, Task 4.1).
// Revisit once the API can report which seasons actually have ingested data.
const SEASON_OPTIONS = [2025, 2024, 2023]
const WEEK_OPTIONS = Array.from({ length: 18 }, (_, i) => i + 1)

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "var(--gray-500)",
}

const triggerStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 13,
  fontWeight: 500,
}

/**
 * The header's season + week selects — a thin shadcn `Select` wrapper
 * around `useSeasonWeek`. No local state; every change is a URL write.
 */
export function SeasonWeekPicker() {
  const { season, week, setSeason, setWeek } = useSeasonWeek()

  return (
    <div className="flex items-center" style={{ gap: 14 }}>
      <div className="flex items-center gap-2">
        <span style={labelStyle}>Season</span>
        <Select
          value={String(season)}
          onValueChange={(value) => setSeason(Number(value))}
        >
          <SelectTrigger size="sm" aria-label="Season" style={triggerStyle}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SEASON_OPTIONS.map((s) => (
              <SelectItem key={s} value={String(s)}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-2">
        <span style={labelStyle}>Week</span>
        <Select
          value={String(week)}
          onValueChange={(value) => setWeek(Number(value))}
        >
          <SelectTrigger size="sm" aria-label="Week" style={triggerStyle}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {WEEK_OPTIONS.map((w) => (
              <SelectItem key={w} value={String(w)}>
                Week {w}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
