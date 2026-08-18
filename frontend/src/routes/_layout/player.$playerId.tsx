import { useQuery } from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useEffect, useMemo } from "react"
import { z } from "zod"
import { type LeaderPosition, PlayersService } from "@/client"
import { QueryError } from "@/components/query-error"
import { StatTable } from "@/components/stat-table"
import { TeamChip } from "@/components/team-chip"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { RateCard } from "@/features/player/rate-card"
import { getSeasonColumns } from "@/features/player/season-columns"

const POSITIONS = ["QB", "RB", "WR", "TE"] as const

// `position` is a SEARCH param while the player is a PATH param: the page
// is about a player, and the position is the lens the picker used to find
// them. Season comes from `_layout` as everywhere else.
const playerSearchSchema = z.object({
  position: z.enum(POSITIONS).default("QB"),
})

export const Route = createFileRoute("/_layout/player/$playerId")({
  component: PlayerScreen,
  validateSearch: playerSearchSchema,
  head: () => ({
    meta: [{ title: "Player - Snapcount" }],
  }),
})

const selectTriggerStyle: React.CSSProperties = {
  fontFamily: "var(--font-body)",
  fontSize: 14,
  fontWeight: 700,
}

function PlayerScreen() {
  const { playerId } = Route.useParams()
  const { season, position } = Route.useSearch()
  const navigate = useNavigate()

  const { data: roster = [] } = useQuery({
    queryKey: ["players", season, position],
    queryFn: async () =>
      (
        await PlayersService.listPlayers({
          query: { season, position: position as LeaderPosition },
        })
      ).data ?? [],
  })

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["player", playerId],
    queryFn: async () =>
      (await PlayersService.playerPage({ path: { player_id: playerId } })).data,
  })

  // The mockup resets `pName` to null on a position change and falls back
  // to the first player of the new pool. The player lives in the URL here,
  // so the equivalent is to NAVIGATE to that first player — otherwise the
  // page keeps showing a quarterback under an "RB" filter.
  //
  // The trigger is the LOADED PLAYER'S OWN POSITION disagreeing with the
  // selected one, not "this id is absent from the roster list". Roster
  // membership is the wrong test twice over: a 404 for a bad id leaves the
  // list unmatched and would bounce the reader off the error message
  // before they could read it, and a real player who simply did not
  // qualify that season is absent from the list while still having a
  // perfectly good page — a deep link to either would be silently thrown
  // away. Waiting for `data` costs one render and makes the rule exact.
  const mismatched = data ? data.player.position !== position : false
  useEffect(() => {
    if (!mismatched || roster.length === 0) return
    navigate({
      to: "/player/$playerId",
      params: { playerId: roster[0].id },
      search: (prev) => prev,
      replace: true,
    })
  }, [mismatched, roster, navigate])

  const columns = useMemo(
    () => getSeasonColumns(data?.player.position ?? position),
    [data?.player.position, position],
  )

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
          Player
        </span>
        <Select
          value={position}
          onValueChange={(next) =>
            navigate({
              to: "/player/$playerId",
              params: { playerId },
              search: (prev) => ({
                ...prev,
                position: next as (typeof POSITIONS)[number],
              }),
            })
          }
        >
          <SelectTrigger
            size="sm"
            aria-label="Position"
            style={selectTriggerStyle}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {POSITIONS.map((p) => (
              <SelectItem key={p} value={p}>
                {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={roster.some((p) => p.id === playerId) ? playerId : ""}
          onValueChange={(next) =>
            navigate({
              to: "/player/$playerId",
              params: { playerId: next },
              search: (prev) => prev,
            })
          }
        >
          <SelectTrigger
            aria-label="Player"
            style={{ ...selectTriggerStyle, minWidth: 280 }}
          >
            <SelectValue placeholder="Select a player" />
          </SelectTrigger>
          <SelectContent>
            {roster.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name} · {p.team_abbr}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isError && (
        <QueryError
          message={`No player page for ${playerId}.`}
          onRetry={() => refetch()}
        />
      )}

      {data && (
        <>
          <div
            className="flex flex-wrap items-center"
            style={{ gap: 16, marginBottom: 20 }}
          >
            <TeamChip
              abbr={data.player.team_abbr}
              color={data.player.team_color}
              size={52}
            />
            <div>
              <h1
                data-display="1"
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 40,
                  lineHeight: 1.05,
                  fontWeight: 700,
                  margin: 0,
                  letterSpacing: "-0.02em",
                }}
              >
                {data.player.name}
              </h1>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 13,
                  color: "var(--gray-500)",
                  marginTop: 6,
                }}
              >
                {data.player.meta}
              </div>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: 16,
              marginBottom: 28,
            }}
          >
            {data.rate_cards.map((card) => (
              <RateCard key={card.key} card={card} />
            ))}
          </div>
        </>
      )}

      <h2
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 24,
          fontWeight: 700,
          margin: "0 0 12px",
        }}
      >
        Season by season
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
          caption={`${data?.player.name ?? "Player"} season by season`}
          columns={columns}
          rows={data?.seasons ?? []}
          rowKey={(row) => `${row.season}-${row.team_abbr}`}
          // The most recent completed season is highlighted over the zebra
          // stripe — `StatTable.rowClassName` exists for exactly this.
          rowClassName={(row) =>
            row.is_latest ? "bg-[var(--row-highlight)]" : undefined
          }
          isLoading={isLoading}
          emptyMessage="No seasons for this player."
        />
      </div>
    </div>
  )
}
