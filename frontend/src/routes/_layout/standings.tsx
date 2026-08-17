import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { Fragment, useMemo } from "react"
import { z } from "zod"
import { StandingsService } from "@/client"
import { type SortState, StatTable } from "@/components/stat-table"
import { Checkbox } from "@/components/ui/checkbox"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  getStandingsColumns,
  groupByDivision,
  groupLabelFor,
  type StandingsSortKey,
  sortStandingsRows,
  withDisplayRank,
} from "@/features/standings/columns"
import { splitFormulaLabel } from "@/lib/format"

// Everything the mockup's `s.conf`/`s.groupByDiv`/`s.sort`/`s.dir` state
// held is URL search-param state here instead — the URL is the source of
// truth, never local `useState` (see `useSeasonWeek`'s doc comment for
// why that rule holds across the whole app, not just season/week).
const standingsSearchSchema = z.object({
  conference: z.enum(["ALL", "AFC", "NFC"]).default("ALL"),
  group: z.enum(["division", "none"]).default("division"),
  sort: z
    .enum([
      "rank",
      "name",
      "record",
      "pct",
      "pf",
      "pa",
      "diff",
      "sos",
      "streak",
      "power",
    ])
    .default("power"),
  dir: z.enum(["asc", "desc"]).default("desc"),
})

export const Route = createFileRoute("/_layout/standings")({
  component: StandingsScreen,
  validateSearch: standingsSearchSchema,
  head: () => ({
    meta: [{ title: "Standings & power ranking - Snapcount" }],
  }),
})

const CONFERENCE_FILTERS: { id: "ALL" | "AFC" | "NFC"; label: string }[] = [
  { id: "ALL", label: "Both conferences" },
  { id: "AFC", label: "AFC" },
  { id: "NFC", label: "NFC" },
]

function pillStyle(active: boolean): React.CSSProperties {
  return {
    fontFamily: "var(--font-body)",
    fontSize: 13,
    fontWeight: active ? 800 : 600,
    padding: "8px 14px",
    borderRadius: 999,
    cursor: "pointer",
    border: `1px solid ${active ? "var(--emerald)" : "var(--gray-300)"}`,
    background: active ? "var(--emerald-tint)" : "var(--card)",
    color: active ? "var(--emerald-dark)" : "var(--gray-600)",
  }
}

/**
 * The mockup emphasises only the three weighted terms
 * (`<strong style="font-weight:800">`) inside an otherwise normal-weight
 * paragraph, so the weight cannot go on the `<p>`. `splitFormulaLabel`
 * recovers the terms from the server's single flat string.
 */
function FormulaParagraph({ label }: { label: string }) {
  const { terms, tail } = splitFormulaLabel(label)

  return (
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
      Power score is{" "}
      {terms.map((term, index) => (
        <Fragment key={term}>
          {index > 0 && " + "}
          <strong style={{ fontWeight: 800 }}>{term}</strong>
        </Fragment>
      ))}
      {tail}. Every input is a column — sort on any of them.
    </p>
  )
}

function StandingsScreen() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const { season } = search

  // `useQuery` refetches on season/conference only — the server already
  // does the conference filter (StandingsService's `conference` query
  // param), so sorting and grouping stay entirely client-side over
  // whatever it returns.
  const conferenceParam =
    search.conference === "ALL" ? undefined : search.conference
  const { data, isLoading } = useQuery({
    queryKey: ["standings", season, search.conference],
    queryFn: async () =>
      (
        await StandingsService.standings({
          path: { season },
          query: { conference: conferenceParam },
        })
      ).data,
  })

  const rows = data?.rows ?? []

  const displayRows = useMemo(() => {
    const sorted = sortStandingsRows(
      rows,
      search.sort as StandingsSortKey,
      search.dir,
    )
    const grouped =
      search.group === "division" ? groupByDivision(sorted) : sorted
    return withDisplayRank(grouped)
  }, [rows, search.sort, search.dir, search.group])

  const columns = useMemo(() => {
    const powerValues = rows.map((row) => row.power)
    return getStandingsColumns({
      powerMin: powerValues.length ? Math.min(...powerValues) : 0,
      powerMax: powerValues.length ? Math.max(...powerValues) : 1,
    })
  }, [rows])

  // Clicking any header turns grouping off — grouping and free sorting
  // are mutually exclusive by design (mockup: `groupByDiv:false` in the
  // sort handler). `StatTable` already computed the next {key,dir} via
  // its own `nextSort`; this just also clears `group`.
  const handleSortChange = (next: SortState) => {
    navigate({
      search: (prev) => ({
        ...prev,
        sort: next.key as StandingsSortKey,
        dir: next.dir,
        group: "none",
      }),
    })
  }

  const handleGroupToggle = (checked: boolean) => {
    navigate({
      search: (prev) => ({ ...prev, group: checked ? "division" : "none" }),
    })
  }

  const handleConferenceChange = (value: string) => {
    if (!value) return // Radix emits "" when re-clicking the active pill.
    navigate({
      search: (prev) => ({
        ...prev,
        conference: value as "ALL" | "AFC" | "NFC",
      }),
    })
  }

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
        {season} final standings
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
        Standings &amp; power ranking
      </h1>
      {data?.formula_label && <FormulaParagraph label={data.formula_label} />}

      <div
        className="flex flex-wrap items-center"
        style={{ gap: 10, marginBottom: 18 }}
      >
        <ToggleGroup
          type="single"
          value={search.conference}
          onValueChange={handleConferenceChange}
          className="flex flex-wrap gap-2.5"
        >
          {CONFERENCE_FILTERS.map((filter) => (
            <ToggleGroupItem
              key={filter.id}
              value={filter.id}
              className="h-auto min-w-0 rounded-none border-0 bg-transparent p-0 shadow-none first:rounded-none last:rounded-none data-[spacing=0]:first:rounded-none data-[spacing=0]:last:rounded-none"
              style={pillStyle(search.conference === filter.id)}
            >
              {filter.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        <label
          htmlFor="group-by-division"
          className="flex items-center"
          style={{
            gap: 9,
            marginLeft: "auto",
            fontSize: 13,
            fontWeight: 600,
            color: "var(--gray-600)",
            cursor: "pointer",
          }}
        >
          <Checkbox
            id="group-by-division"
            checked={search.group === "division"}
            onCheckedChange={(checked) => handleGroupToggle(checked === true)}
          />
          Group by division
        </label>
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
          caption={`${season} NFL standings and power ranking`}
          columns={columns}
          rows={displayRows}
          rowKey={(row) => row.team.abbr}
          sort={{ key: search.sort, dir: search.dir }}
          onSortChange={handleSortChange}
          groupBy={search.group === "division" ? groupLabelFor : undefined}
          isLoading={isLoading}
          emptyMessage="No teams match this filter."
        />
      </div>

      <div
        className="flex flex-wrap items-center"
        style={{
          gap: 22,
          marginTop: 14,
          fontSize: 12,
          color: "var(--gray-500)",
        }}
      >
        <span className="flex items-center" style={{ gap: 8 }}>
          <span
            aria-hidden="true"
            style={{
              width: 34,
              height: 10,
              borderRadius: 3,
              background:
                "linear-gradient(90deg, var(--danger), var(--gray-100), var(--emerald))",
              display: "block",
            }}
          />
          Point differential — diverging scale, neutral at zero
        </span>
        <span>
          Team color appears only on identity marks and chart series, never on
          interface chrome.
        </span>
      </div>
    </div>
  )
}
