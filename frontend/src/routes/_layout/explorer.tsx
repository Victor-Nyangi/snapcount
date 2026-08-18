import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useMemo } from "react"
import { z } from "zod"
import { ExplorerService } from "@/client"
import { DifferentialGrid } from "@/components/differential-grid/grid"
import { orderRows } from "@/components/differential-grid/order"
import { SelectionPanel } from "@/components/differential-grid/selection-panel"
import { filterPillStyle } from "@/components/filter-pill"
import { QueryError } from "@/components/query-error"
import { Skeleton } from "@/components/ui/skeleton"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

const FROM = 2016
const TO = 2025

// The SELECTED CELL lives in the URL beside the sort. A drill-down that
// cannot be linked to defeats the point of the screen — the whole reason
// this view exists is to point at one team-season and say "look at this".
const explorerSearchSchema = z.object({
  sort: z.string().default("total"),
  team: z.string().optional(),
  year: z.coerce.number().int().optional(),
})

export const Route = createFileRoute("/_layout/explorer")({
  component: ExplorerScreen,
  validateSearch: explorerSearchSchema,
  head: () => ({
    meta: [{ title: "Analytics explorer - Snapcount" }],
  }),
})

const NAMED_SORTS: { id: string; label: string }[] = [
  { id: "total", label: "10-year total" },
  { id: "alpha", label: "A–Z" },
  { id: "division", label: "Division" },
]

function ExplorerScreen() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["explorer", FROM, TO],
    queryFn: async () =>
      (await ExplorerService.differentials({ query: { from: FROM, to: TO } }))
        .data,
  })

  const seasons = useMemo(() => data?.seasons ?? [], [data])
  const rows = useMemo(
    () => orderRows(data?.rows ?? [], search.sort, seasons),
    [data, search.sort, seasons],
  )

  const selectedRow = data?.rows.find((r) => r.team.abbr === search.team)
  const seasonIndex = search.year ? seasons.indexOf(search.year) : -1

  return (
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
        {FROM}–{TO}
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
        A decade of point differential
      </h1>
      <p
        style={{
          margin: "10px 0 24px",
          fontSize: 16,
          lineHeight: 1.6,
          color: "var(--gray-600)",
          maxWidth: "62ch",
          textWrap: "pretty",
        }}
      >
        Every team, every season, on one scale. Sort by any column to read the
        league from that year&rsquo;s perspective; pick a cell for its rank.
      </p>

      <div
        className="flex flex-wrap items-center"
        style={{ gap: 10, marginBottom: 18 }}
      >
        <ToggleGroup
          type="single"
          value={
            NAMED_SORTS.some((s) => s.id === search.sort) ? search.sort : ""
          }
          onValueChange={(value) => {
            if (!value) return
            navigate({ search: (prev) => ({ ...prev, sort: value }) })
          }}
          className="flex flex-wrap gap-2"
        >
          {NAMED_SORTS.map((option) => (
            <ToggleGroupItem
              key={option.id}
              value={option.id}
              className="h-auto min-w-0 rounded-none border-0 bg-transparent p-0 shadow-none first:rounded-none last:rounded-none data-[spacing=0]:first:rounded-none data-[spacing=0]:last:rounded-none"
              style={filterPillStyle(search.sort === option.id)}
            >
              {option.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {selectedRow && seasonIndex !== -1 && search.year && (
        <SelectionPanel
          row={selectedRow}
          season={search.year}
          seasonIndex={seasonIndex}
          rows={data?.rows ?? []}
          domain={data?.domain ?? 150}
        />
      )}

      {isError && (
        <QueryError
          message="Could not load the decade differential grid."
          onRetry={() => refetch()}
        />
      )}

      {!isError && (
        <div
          style={{
            background: "var(--card)",
            border: "1px solid var(--gray-200)",
            borderRadius: "var(--radius-lg)",
            padding: "16px 18px",
            boxShadow: "var(--shadow-light-sm)",
          }}
        >
          {/* Skeleton rows at the grid's REAL row height, so the card does
            not jump when 32 rows arrive. */}
          {isLoading ? (
            <div style={{ display: "grid", gap: 4 }}>
              {Array.from({ length: 12 }, (_, i) => (
                <Skeleton
                  key={`explorer-skeleton-${i}`}
                  data-testid="explorer-skeleton-row"
                  style={{ height: 28 }}
                />
              ))}
            </div>
          ) : (
            <DifferentialGrid
              rows={rows}
              seasons={seasons}
              domain={data?.domain ?? 150}
              sort={search.sort}
              selection={
                search.team && search.year
                  ? { team: search.team, year: search.year }
                  : undefined
              }
              onSort={(next) =>
                navigate({ search: (prev) => ({ ...prev, sort: next }) })
              }
              onSelect={(next) =>
                navigate({
                  search: (prev) => ({
                    ...prev,
                    team: next.team,
                    year: next.year,
                  }),
                })
              }
            />
          )}
        </div>
      )}
    </div>
  )
}
