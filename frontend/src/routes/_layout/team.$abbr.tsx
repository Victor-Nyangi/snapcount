import { useQuery } from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useMemo } from "react"
import { StandingsService, TeamsService } from "@/client"
import { QueryError } from "@/components/query-error"
import { StatTable } from "@/components/stat-table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { DepthPanel } from "@/features/team/depth-panel"
import { TeamHero } from "@/features/team/hero"
import { getScheduleColumns } from "@/features/team/schedule-columns"

// `abbr` is a PATH param, not a search param, so `/team/DET?season=2024`
// is the linkable unit — a team page is a resource, and the season is a
// view of it. The team `<select>` therefore navigates rather than setting
// state, and season/week continue to come from `_layout`'s schema.
export const Route = createFileRoute("/_layout/team/$abbr")({
  component: TeamScreen,
  head: () => ({
    meta: [{ title: "Team - Snapcount" }],
  }),
})

function TeamScreen() {
  const { abbr } = Route.useParams()
  const { season } = Route.useSearch()
  const navigate = useNavigate()

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["team", season, abbr],
    queryFn: async () =>
      (await TeamsService.teamPage({ path: { season, abbr } })).data,
  })

  // No endpoint lists the 32 teams on its own, and standings already
  // returns every one of them with the identity fields the picker needs
  // (abbr, full name). Sharing the query key with the standings screen
  // means switching between the two screens costs no extra request.
  const { data: standings } = useQuery({
    queryKey: ["standings", season, "ALL"],
    queryFn: async () =>
      (await StandingsService.standings({ path: { season } })).data,
  })

  // The mockup sorts by FULL NAME, not by abbreviation — "Arizona
  // Cardinals" before "Atlanta Falcons", where ARI/ATL happens to agree
  // but BUF (Buffalo Bills) and CAR (Carolina Panthers) would not order
  // the same way as, say, LA/LAC/LAR against their city names.
  const teamOptions = useMemo(() => {
    const rows = standings?.rows ?? []
    return rows
      .map((row) => ({ abbr: row.team.abbr, name: row.team.name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [standings])

  const columns = useMemo(() => getScheduleColumns(), [])
  const schedule = data?.schedule ?? []

  return (
    <div>
      <div
        className="flex flex-wrap items-center"
        style={{ gap: 14, marginBottom: 20 }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "var(--gray-500)",
          }}
        >
          Team
        </span>
        <Select
          value={abbr}
          onValueChange={(next) =>
            navigate({
              to: "/team/$abbr",
              params: { abbr: next },
              search: (prev) => prev,
            })
          }
        >
          <SelectTrigger
            aria-label="Team"
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 14,
              fontWeight: 700,
              minWidth: 260,
            }}
          >
            <SelectValue placeholder={abbr} />
          </SelectTrigger>
          <SelectContent>
            {teamOptions.map((team) => (
              <SelectItem key={team.abbr} value={team.abbr}>
                {team.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            color: "var(--gray-500)",
          }}
        >
          {season}
          {data ? ` · ${data.conference_label}` : ""}
        </span>
      </div>

      {isError && (
        <QueryError
          message={`No ${abbr} data for the ${season} season.`}
          onRetry={() => refetch()}
        />
      )}

      {data && <TeamHero data={data} />}

      <div
        className="grid gap-5 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]"
        style={{ marginTop: 24 }}
      >
        {/* Schedule first in source order, so the md-and-below stack puts
            the real data above the deliberately-empty depth panel. */}
        <div>
          <h2
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 24,
              fontWeight: 700,
              margin: "0 0 12px",
            }}
          >
            Schedule &amp; results
          </h2>
          <div
            style={{
              background: "var(--card)",
              border: "1px solid var(--gray-200)",
              borderRadius: "var(--radius-lg)",
              overflow: "hidden",
              boxShadow: "var(--shadow-light-sm)",
            }}
          >
            <StatTable
              caption={`${abbr} schedule and results, ${season} season`}
              columns={columns}
              rows={schedule}
              rowKey={(row) => `${row.week}-${row.opponent.abbr}`}
              isLoading={isLoading}
              emptyMessage="No games on this schedule."
            />
          </div>
        </div>

        <div>
          <h2
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 24,
              fontWeight: 700,
              margin: "0 0 12px",
            }}
          >
            Position groups
          </h2>
          <DepthPanel groups={data?.depth_groups ?? []} />
        </div>
      </div>
    </div>
  )
}
