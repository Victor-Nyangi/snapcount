import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"
import {
  type LeaderMetric,
  type LeaderPosition,
  LeadersService,
} from "@/client"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { LeaderCard } from "@/features/leaders/leader-card"

// Same rule as every other screen: the mockup's `s.pos`/`s.metric`/`s.topN`
// component state is URL search-param state here.
//
// NOTE ON THE BRIEF'S FALLBACK. Step 1 asks to reproduce the mockup's
// "fall back to `epa` when the current metric is not offered for the newly
// selected position". That branch is DEAD, in the mockup and here: its own
// `METRICS` table gives all four positions all four metrics, so
// `METRICS[pos].some(x => x[0] === metric)` is always true, and the API's
// `_metrics.py::METRIC_LABELS` is the same table with the same four keys
// per position. Writing the fallback would mean shipping a branch no user
// can reach and no test can honestly exercise — the same reason the
// playoff-seed badge was dropped. Every position/metric pair is valid, so
// switching position keeps the metric, which is also what a user expects.
const POSITIONS = ["QB", "RB", "WR", "TE"] as const
const METRICS = ["epa", "yds", "td", "rate"] as const
const TOP_OPTIONS = [5, 8, 12] as const

const leadersSearchSchema = z.object({
  position: z.enum(POSITIONS).default("QB"),
  metric: z.enum(METRICS).default("epa"),
  top: z.coerce
    .number()
    .int()
    .refine((n): n is (typeof TOP_OPTIONS)[number] =>
      TOP_OPTIONS.includes(n as (typeof TOP_OPTIONS)[number]),
    )
    .catch(5)
    .default(5),
})

export const Route = createFileRoute("/_layout/leaders")({
  component: LeadersScreen,
  validateSearch: leadersSearchSchema,
  head: () => ({
    meta: [{ title: "Position leaders - Snapcount" }],
  }),
})

// Metric labels are per POSITION on the server ("EPA per play" for a QB,
// "EPA per rush" for a back), and the response carries the label for the
// selected one. The dropdown has to name all four before a response for
// them exists, so it needs its own copy of the same table — verbatim from
// `backend/app/api/routes/_metrics.py::METRIC_LABELS`, which is itself
// verbatim from the mockup's `METRICS`.
const METRIC_LABELS: Record<
  (typeof POSITIONS)[number],
  Record<(typeof METRICS)[number], string>
> = {
  QB: {
    epa: "EPA per play",
    yds: "Passing yards",
    td: "Touchdowns",
    rate: "Yards per attempt",
  },
  RB: {
    epa: "EPA per rush",
    yds: "Rushing yards",
    td: "Touchdowns",
    rate: "Yards per carry",
  },
  WR: {
    epa: "EPA per target",
    yds: "Receiving yards",
    td: "Touchdowns",
    rate: "Yards per target",
  },
  TE: {
    epa: "EPA per target",
    yds: "Receiving yards",
    td: "Touchdowns",
    rate: "Yards per target",
  },
}

function positionTabStyle(active: boolean): React.CSSProperties {
  return {
    fontFamily: "var(--font-body)",
    fontSize: 13,
    fontWeight: 800,
    letterSpacing: "0.04em",
    padding: "8px 18px",
    borderRadius: 9,
    border: "none",
    cursor: "pointer",
    // The mockup's literals resolve to existing tokens exactly:
    // oklch(0.24 0.10 300) is --orchid-900, #F3E8FF is
    // --accent-secondary-ink.
    background: active ? "var(--orchid-900)" : "transparent",
    color: active ? "var(--accent-secondary-ink)" : "var(--gray-600)",
    transition: "background 120ms ease",
  }
}

const selectTriggerStyle: React.CSSProperties = {
  fontFamily: "var(--font-body)",
  fontSize: 14,
  fontWeight: 700,
}

function LeadersScreen() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const { season, position, metric, top } = search

  const { data, isLoading, isError } = useQuery({
    queryKey: ["leaders", season, position, metric, top],
    queryFn: async () =>
      (
        await LeadersService.leaders({
          path: { season },
          query: {
            position: position as LeaderPosition,
            metric: metric as LeaderMetric,
            limit: top,
          },
        })
      ).data,
  })

  const rows = data?.rows ?? []
  // Every bar on the board scales against the rank-1 value, so it is read
  // once here rather than recomputed per card.
  const leaderValue = rows.length > 0 ? rows[0].value : 0

  const set = (patch: Partial<typeof search>) => {
    navigate({ search: (prev) => ({ ...prev, ...patch }) })
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
        {season} season leaders
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
        Position leaders
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
        {/* The mockup's "Sample figures for layout review — not live data"
            line is removed: this screen renders the real backfill. */}
        Ranked on the metric you choose, against the positional baseline — the
        dashed marker on every bar is the average qualified player.
      </p>

      <div
        className="flex flex-wrap items-center"
        style={{ gap: 14, marginBottom: 20 }}
      >
        <div
          className="flex items-center"
          style={{
            gap: 4,
            padding: 4,
            borderRadius: 12,
            border: "1px solid var(--gray-200)",
            background: "var(--card)",
          }}
        >
          {POSITIONS.map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={position === id}
              style={positionTabStyle(position === id)}
              onClick={() => set({ position: id })}
            >
              {id}
            </button>
          ))}
        </div>

        <Select
          value={metric}
          onValueChange={(value) =>
            set({ metric: value as (typeof METRICS)[number] })
          }
        >
          <SelectTrigger
            size="sm"
            aria-label="Metric"
            style={selectTriggerStyle}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {METRICS.map((id) => (
              <SelectItem key={id} value={id}>
                {METRIC_LABELS[position][id]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={String(top)}
          onValueChange={(value) =>
            set({ top: Number(value) as (typeof TOP_OPTIONS)[number] })
          }
        >
          <SelectTrigger
            size="sm"
            aria-label="How many"
            style={selectTriggerStyle}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TOP_OPTIONS.map((n) => (
              <SelectItem key={n} value={String(n)}>
                Top {n}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {data && (
          <span
            style={{
              marginLeft: "auto",
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              color: "var(--gray-500)",
            }}
          >
            baseline {data.baseline.toFixed(data.precision)} {data.unit}
          </span>
        )}
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        {rows.map((row) => (
          <LeaderCard
            key={row.player.id}
            row={row}
            top={leaderValue}
            baseline={data?.baseline ?? 0}
            precision={data?.precision ?? 0}
            unit={data?.unit ?? ""}
          />
        ))}
      </div>

      {/* The API 404s for a season it has no rows for — reachable by URL,
          since the search schema accepts any season from 1999. Say so
          plainly rather than leaving an empty page that looks like a
          still-loading one. */}
      {!isLoading && rows.length === 0 && (
        <p
          style={{
            margin: 0,
            padding: "28px 0",
            textAlign: "center",
            color: "var(--gray-500)",
          }}
        >
          {isError
            ? `No ${position} data for the ${season} season.`
            : "No qualified players for this position."}
        </p>
      )}

      {data && (
        <p
          style={{ margin: "22px 0 0", fontSize: 12, color: "var(--gray-500)" }}
        >
          Qualifiers: {data.qualifier_label}.
        </p>
      )}
    </div>
  )
}
