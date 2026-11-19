import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"
import {
  type LeaderMetric,
  type LeaderPosition,
  LeadersService,
} from "@/client"
import { QueryError } from "@/components/query-error"
import { useSeasonWeek } from "@/components/season-week-picker"
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
// SIX BOARDS, two metric sets. The four offensive positions share the
// mockup's four metrics; DEF (every defender on one board) and ALL (every
// position, scrimmage totals) have their own. The server owns which board
// offers which — `app.analytics.leaders.BOARD_METRICS` — and this is its
// verbatim copy, needed because the controls must name a board's metrics
// before any response for it exists.
//
// The mockup's "fall back when the current metric is not offered for the
// newly selected position" branch was dead while every board offered the
// same four. It is live now (QB EPA has no defensive meaning), so it is
// implemented — in `metricFor`, used both when a tab is clicked and when a
// hand-edited URL names a pair the API would 422.
const POSITIONS = ["QB", "RB", "WR", "TE", "DEF", "ALL"] as const
type Board = (typeof POSITIONS)[number]
const METRICS = [
  "epa",
  "yds",
  "td",
  "rate",
  "tackles",
  "sacks",
  "tfl",
  "qb_hits",
  "interceptions",
  "passes_defended",
] as const
type Metric = (typeof METRICS)[number]
const TOP_OPTIONS = [5, 8, 12] as const

const OFFENCE_METRICS = ["epa", "yds", "td", "rate"] as const
const BOARD_METRICS: Record<Board, readonly Metric[]> = {
  QB: OFFENCE_METRICS,
  RB: OFFENCE_METRICS,
  WR: OFFENCE_METRICS,
  TE: OFFENCE_METRICS,
  DEF: [
    "tackles",
    "sacks",
    "tfl",
    "qb_hits",
    "interceptions",
    "passes_defended",
  ],
  ALL: ["td", "yds"],
}

/** `metric` if `board` offers it, else the board's first metric. */
function metricFor(board: Board, metric: Metric): Metric {
  return BOARD_METRICS[board].includes(metric)
    ? metric
    : BOARD_METRICS[board][0]
}

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

// Metric labels are per BOARD on the server ("EPA per play" for a QB,
// "EPA per rush" for a back), and the response carries the label for the
// selected one. The dropdown has to name every metric before a response for
// it exists, so it needs its own copy of the same table — verbatim from
// `backend/app/api/routes/_metrics.py::METRIC_LABELS`, whose offensive half
// is itself verbatim from the mockup's `METRICS`.
const METRIC_LABELS: { [B in Board]: Partial<Record<Metric, string>> } = {
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
  DEF: {
    tackles: "Total tackles",
    sacks: "Sacks",
    tfl: "Tackles for loss",
    qb_hits: "QB hits",
    interceptions: "Interceptions",
    passes_defended: "Passes defended",
  },
  ALL: {
    td: "Scrimmage touchdowns",
    yds: "Scrimmage yards",
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
    // its dark orchid is --orchid-900 and its pale orchid ink is
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
  const { position, top } = search
  // What is actually asked for and shown. A hand-edited URL can name a
  // pair the board does not offer (DEF + epa); the API would answer 422.
  const metric = metricFor(position, search.metric)
  const { season } = useSeasonWeek()

  const { data, isLoading, isError, refetch } = useQuery({
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
        {/* `flex-wrap`: six boards no longer fit one row on a phone. At
            390px the group would hold the page open past the viewport;
            wrapping keeps every tab reachable without a sideways scroll. */}
        <div
          className="flex flex-wrap items-center"
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
              onClick={() =>
                set({ position: id, metric: metricFor(id, metric) })
              }
            >
              {id}
            </button>
          ))}
        </div>

        <Select
          value={metric}
          onValueChange={(value) => set({ metric: value as Metric })}
        >
          <SelectTrigger
            size="sm"
            aria-label="Metric"
            style={selectTriggerStyle}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {BOARD_METRICS[position].map((id) => (
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

      {/* What the metric counts when its label cannot say it alone — that
          scrimmage touchdowns leave passing out, that a shared sack is half.
          Worded by the API, like every other label on this screen. */}
      {data?.note && (
        <p
          data-testid="leaders-note"
          style={{
            margin: "0 0 16px",
            fontSize: 13,
            lineHeight: 1.5,
            color: "var(--gray-600)",
          }}
        >
          {data.note}
        </p>
      )}

      {/* `minmax(0, 1fr)`, not the implicit `auto` track: a grid item will
          not shrink below its min-content, and a card's min-content is its
          name and meta line unbroken. The mixed-position boards' longer
          meta ("2026 season · DE · 9 g") beside a long name ("Will
          Anderson Jr.") pushed 390px pages 20-27px sideways — measured,
          every DEF and ALL board, no offence board. With the track allowed
          to shrink, the name truncates exactly as it already did on the
          QB board. */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr)",
          gap: 12,
        }}
      >
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
      {isError && (
        <QueryError
          message={`No ${position} data for the ${season} season.`}
          onRetry={() => refetch()}
        />
      )}

      {!isLoading && !isError && rows.length === 0 && (
        <p
          style={{
            margin: 0,
            padding: "28px 0",
            textAlign: "center",
            color: "var(--gray-500)",
          }}
        >
          No qualified players for this position.
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
