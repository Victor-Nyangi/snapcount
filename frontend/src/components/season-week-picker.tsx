import { useQuery } from "@tanstack/react-query"
import { getRouteApi, useSearch } from "@tanstack/react-router"
import { useEffect, useMemo, useRef } from "react"
import { z } from "zod"

import { MetaService, type SeasonSummary } from "@/client"

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
 *
 * NO DEFAULTS IN THE SCHEMA. They used to be `.default(2025)` and
 * `.default(15)`, which left the site opening on last season with 2026
 * ingested every night. A schema default cannot be the answer: the router
 * writes validated search into the URL on mount and on every navigation,
 * so a default is indistinguishable from a season the user chose. Absent
 * stays absent here, and `useSeasonWeekDefaults` fills the URL from
 * `/meta/seasons` — the newest played season at its last played week —
 * before any screen renders. Screens read the value through
 * `useSeasonWeek`, which is never undefined.
 */
export const seasonWeekSearchSchema = z.object({
  season: z.coerce.number().int().min(1999).max(2100).optional(),
  week: z.coerce.number().int().min(1).max(22).optional(),
})

export type SeasonWeekSearch = z.infer<typeof seasonWeekSearchSchema>

// Used ONLY when `/meta/seasons` fails or holds no seasons, so that a
// broken metadata request degrades to a plausible screen rather than none.
// Never what the app opens on while the API is healthy.
const FALLBACK_SEASON = 2025
const FALLBACK_WEEK = 15

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

  // `unsafeRelative: "path"` keeps the CURRENT page. Without it the
  // navigation resolves from `/_layout` — a pathless route whose path is
  // "/" — so changing the week on /leaders landed on the template's
  // dashboard at "/". The picker tests never saw it: their harness mounts
  // the layout at a real "/_layout" path, where staying put and going to
  // the layout are the same URL.
  const setSeason = (season: number) => {
    navigate({
      search: (prev) => ({ ...prev, season }),
      unsafeRelative: "path",
    })
  }
  const setWeek = (week: number) => {
    navigate({ search: (prev) => ({ ...prev, week }), unsafeRelative: "path" })
  }

  return {
    season: search.season ?? FALLBACK_SEASON,
    week: search.week ?? FALLBACK_WEEK,
    setSeason,
    setWeek,
  }
}

/**
 * `/meta/seasons`, under the one query key every caller shares — the
 * shell's picker, the default below and the explorer's range all read the
 * same cached response, so the endpoint is fetched once per session.
 */
export const seasonsQueryOptions = {
  queryKey: ["meta", "seasons"],
  queryFn: async () => (await MetaService.listSeasons()).data,
  staleTime: Number.POSITIVE_INFINITY,
  // The first screen waits on this request (see `useSeasonWeekDefaults`),
  // so a failure must reach the fallback quickly rather than after the
  // default three retries with backoff.
  retry: 1,
} as const

/**
 * The season and week the app should show for `explicit` — whatever the
 * URL already names, with the gaps filled from `seasons`.
 *
 * The default season is the newest one with a played week, NOT simply the
 * newest row: from August 1 the next season's schedule is ingested, so a
 * season with no final score and no player stats exists for a month every
 * year. The default week is that season's last played week (the Super
 * Bowl for a finished season), and week 1 if nothing at all is played.
 *
 * `null` means there is nothing to resolve against; the caller keeps the
 * fallback.
 */
export function latestSeasonWeek(
  seasons: SeasonSummary[] | undefined,
  explicit: { season?: number; week?: number },
): { season: number; week: number } | null {
  if (!seasons?.length) return null
  const newestFirst = [...seasons].sort((a, b) => b.year - a.year)
  const played = newestFirst.find((s) => s.last_played_week != null)
  const season = explicit.season ?? (played ?? newestFirst[0]).year
  const row = seasons.find((s) => s.year === season)
  const week = explicit.week ?? row?.last_played_week ?? 1
  return { season, week }
}

/**
 * Completes a URL that names no season or week with `latestSeasonWeek`,
 * as a REPLACE navigation — the URL is the only home for this state, so
 * the page that opened is exactly the page a copied link reproduces, and
 * Back does not return to the bare URL only to be redirected again.
 *
 * Returns whether the screens may render. Until the seasons arrive they
 * may not: rendering on the fallback and correcting it afterwards fires
 * every screen's request twice and shows the wrong year first. A URL that
 * already names both is ready at once, with no wait on the request. A
 * failed request, or an empty season list, is ready on the fallback.
 */
export function useSeasonWeekDefaults(): boolean {
  const search = useSearch({ strict: false }) as SeasonWeekSearch
  const navigate = routeApi.useNavigate()
  const { data: seasons, isError } = useQuery(seasonsQueryOptions)
  // LATCHED, because the error does not stay put. A query with no data
  // goes back to `pending` whenever another component mounts it and
  // refetches — the explorer does, the moment the gate opens — which
  // closed the gate, unmounted the explorer, failed again and reopened it,
  // forever. Once the seasons have failed, the fallback stands.
  const failed = useRef(false)
  if (isError) failed.current = true

  const complete = search.season !== undefined && search.week !== undefined
  // Memoised so the effect below fires once per change of the answer, not
  // once per render while the navigation is in flight.
  const resolved = useMemo(
    () =>
      complete
        ? null
        : latestSeasonWeek(seasons, {
            season: search.season,
            week: search.week,
          }),
    [complete, seasons, search.season, search.week],
  )

  useEffect(() => {
    if (resolved === null) return
    navigate({
      search: (prev) => ({ ...prev, ...resolved }),
      replace: true,
      // Stay on the page being completed — see `useSeasonWeek`.
      unsafeRelative: "path",
    })
  }, [navigate, resolved])

  return (
    complete || failed.current || (seasons !== undefined && resolved === null)
  )
}

/**
 * The four playoff rounds, in order, as `_format.py::phase_label` names
 * them — one vocabulary shared with the week screen's own header rather
 * than a second one invented here.
 */
const PLAYOFF_ROUNDS = [
  "Wild card round",
  "Divisional round",
  "Conference championship",
  "Super Bowl",
]

/**
 * Week `w` of `season`, labelled the way that season actually played it.
 *
 * The postseason is weeks too, and which number it starts on moved: the
 * league played 17 regular-season weeks through 2020 and 18 from 2021, so
 * week 18 is the wild card round in 2019 and an ordinary Sunday in 2024.
 * Deriving the label from `current_week` is what lets one control describe
 * both eras; a fixed list cannot.
 */
export function weekLabel(week: number, currentWeek: number): string {
  if (week <= currentWeek) return `Week ${week}`
  return PLAYOFF_ROUNDS[week - currentWeek - 1] ?? `Week ${week}`
}

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

  // WHAT THE DATABASE ACTUALLY HOLDS, not a hard-coded list. This used to
  // be `[2025, 2024, 2023]` and `Array.from({length: 18})`, against ten
  // ingested seasons that each run to week 21 or 22 — so seven seasons and
  // every postseason week, the Super Bowl included, could only be reached
  // by hand-editing the URL. Worse, the page honoured such a URL while the
  // control went BLANK, because Radix has no item matching the value: the
  // control contradicted the screen beside it.
  //
  // `/meta/seasons` has existed since Task 4.1 for exactly this — its
  // schema docstring reads "populates the season selector" — and was never
  // wired up. `max_week` is derived there from the games themselves;
  // `week_count` is a stored constant of 18 and describes nothing.
  const { data: seasons } = useQuery(seasonsQueryOptions)

  // Newest first, matching the old list's order and the way anyone reads a
  // season picker. Falls back to the season in the URL so the control still
  // names the page it is on while the request is in flight or has failed —
  // never blank, which was the original defect.
  const seasonOptions = seasons?.length
    ? [...seasons].sort((a, b) => b.year - a.year).map((s) => s.year)
    : [season]

  const active = seasons?.find((s) => s.year === season)
  const maxWeek = active?.max_week ?? week
  const currentWeek = active?.current_week ?? maxWeek
  const weekOptions = Array.from({ length: maxWeek }, (_, i) => i + 1)

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
            {seasonOptions.map((s) => (
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
            {weekOptions.map((w) => (
              <SelectItem key={w} value={String(w)}>
                {weekLabel(w, currentWeek)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
