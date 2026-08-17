import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useMemo } from "react"
import { z } from "zod"
import { WeeksService } from "@/client"
import { CardRail } from "@/components/card-rail"
import { filterPillStyle } from "@/components/filter-pill"
import { StatTable } from "@/components/stat-table"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { FeaturedCard } from "@/features/week/featured-card"
import { GameCard } from "@/features/week/game-card"
import {
  filterSlate,
  getSlateColumns,
  type SlateFilter,
} from "@/features/week/slate-columns"

// Slate filtering is client-side over the fetched week, so it lives in the
// URL rather than in `useState` — same rule the whole app follows. Season
// and week come from `_layout`'s own schema; this route only adds `slate`.
const weekSearchSchema = z.object({
  slate: z.enum(["all", "close", "upset"]).default("all"),
})

export const Route = createFileRoute("/_layout/week")({
  component: WeekScreen,
  validateSearch: weekSearchSchema,
  head: () => ({
    meta: [{ title: "Week - Snapcount" }],
  }),
})

function WeekScreen() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const { season, week } = search

  const { data, isLoading } = useQuery({
    queryKey: ["week", season, week],
    queryFn: async () =>
      (await WeeksService.week({ path: { season, week } })).data,
  })

  const games = data?.games ?? []
  const featured = data?.featured ?? []

  const slateRows = useMemo(
    () => filterSlate(games, search.slate),
    [games, search.slate],
  )
  const columns = useMemo(() => getSlateColumns(), [])

  const slateFilters: { id: SlateFilter; label: string }[] = [
    // The mockup hard-codes "All 16"; a real week can be short (byes) or
    // long, so the count comes from the fetched slate.
    { id: "all", label: `All ${games.length}` },
    { id: "close", label: "Decided by ≤3" },
    { id: "upset", label: "Underdog won" },
  ]

  const handleSlateChange = (value: string) => {
    if (!value) return // Radix emits "" when re-clicking the active pill.
    navigate({ search: (prev) => ({ ...prev, slate: value as SlateFilter }) })
  }

  return (
    <div>
      <div
        className="flex flex-wrap items-end justify-between"
        style={{ gap: 24, marginBottom: 20 }}
      >
        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.09em",
              textTransform: "uppercase",
              color: "var(--orchid)",
            }}
          >
            {data?.label ?? `Week ${week} · ${season}`}
          </div>
          <h1
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "var(--text-h1-app)",
              lineHeight: 1.05,
              fontWeight: 700,
              margin: "8px 0 0",
              letterSpacing: "-0.02em",
            }}
          >
            Analyse all games in one screen
          </h1>
          <p
            style={{
              margin: "10px 0 0",
              fontSize: 16,
              lineHeight: 1.6,
              color: "var(--gray-600)",
              maxWidth: "56ch",
              textWrap: "pretty",
            }}
          >
            Results, closing spreads, and a single honest sentence per game.
            Scroll the rail for scores, drop into the table for the full slate.
          </p>
        </div>
      </div>

      {/* The mockup puts the two rail arrows in the header block, top-right.
          `CardRail` (Task 2.3) owns its own arrows so it can disable them at
          each scroll extreme — the mockup's never disable, stranding
          keyboard users on a dead control. Reusing the shared component
          keeps that fix rather than re-implementing raw arrows here. */}
      <CardRail aria-label={`Every game in week ${week}`}>
        {games.map((game) => (
          <GameCard key={game.id} game={game} />
        ))}
      </CardRail>

      {featured.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))",
            gap: 20,
            marginTop: 34,
          }}
        >
          {featured.map((game) => (
            <FeaturedCard key={game.game_id} game={game} />
          ))}
        </div>
      )}

      {/* No storylines section. The mockup has three editorial cards here;
          nothing serves them and nothing ever will (plan §2), so the
          heading is omitted too rather than left standing above nothing. */}

      <div
        className="flex flex-wrap items-center justify-between"
        style={{ margin: "46px 0 14px", gap: 20 }}
      >
        <h2
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 28,
            fontWeight: 700,
            margin: 0,
            letterSpacing: "-0.01em",
          }}
        >
          Full slate
        </h2>
        <ToggleGroup
          type="single"
          value={search.slate}
          onValueChange={handleSlateChange}
          className="flex flex-wrap gap-2"
        >
          {slateFilters.map((filter) => (
            <ToggleGroupItem
              key={filter.id}
              value={filter.id}
              className="h-auto min-w-0 rounded-none border-0 bg-transparent p-0 shadow-none first:rounded-none last:rounded-none data-[spacing=0]:first:rounded-none data-[spacing=0]:last:rounded-none"
              style={filterPillStyle(search.slate === filter.id)}
            >
              {filter.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

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
          caption={`Every game in week ${week} of the ${season} season`}
          columns={columns}
          rows={slateRows}
          rowKey={(game) => game.id}
          isLoading={isLoading}
          emptyMessage="No games match this filter."
        />
      </div>
    </div>
  )
}
