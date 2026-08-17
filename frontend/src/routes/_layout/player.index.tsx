import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Navigate } from "@tanstack/react-router"
import { z } from "zod"
import { type LeaderPosition, PlayersService } from "@/client"

const POSITIONS = ["QB", "RB", "WR", "TE"] as const

/**
 * `/player` with nobody named yet — what the nav links to.
 *
 * The team page could point its nav straight at `/team/DET`, because a team
 * abbreviation is stable and meaningful. A player id is neither: it is an
 * opaque nflverse string, and hard-coding one in the nav would rot the
 * moment that player left the league or the season default moved past
 * their last year. So this resolves the FIRST player of the default
 * position for the current season and redirects, replacing the history
 * entry so Back does not bounce off it.
 */
export const Route = createFileRoute("/_layout/player/")({
  component: PlayerIndex,
  validateSearch: z.object({
    position: z.enum(POSITIONS).default("QB"),
  }),
  head: () => ({
    meta: [{ title: "Player - Snapcount" }],
  }),
})

function PlayerIndex() {
  const { season, position } = Route.useSearch()

  // Same key the player screen itself uses, so the redirect costs no extra
  // request once it lands.
  const { data: roster = [], isLoading } = useQuery({
    queryKey: ["players", season, position],
    queryFn: async () =>
      (
        await PlayersService.listPlayers({
          query: { season, position: position as LeaderPosition },
        })
      ).data ?? [],
  })

  if (roster.length > 0) {
    return (
      <Navigate
        to="/player/$playerId"
        params={{ playerId: roster[0].id }}
        search={(prev) => prev}
        replace
      />
    )
  }

  return (
    <p style={{ padding: "28px 0", color: "var(--gray-500)" }}>
      {isLoading
        ? "Finding a player…"
        : `No ${position} data for the ${season} season.`}
    </p>
  )
}
