import type { CSSProperties } from "react"
import type { ScheduleRowOut } from "@/client"
import type { StatColumn } from "@/components/stat-table"
import { TeamChip } from "@/components/team-chip"
import { divergingCell } from "@/lib/diverging"
import { formatDiff } from "@/lib/format"

/**
 * The schedule table's six columns. Widths verbatim from the mockup's
 * `grid-template-columns`; nothing is sortable, because a schedule is read
 * in week order and the mockup offers no sort affordance.
 */

/** §1.11: a game margin saturates at 25 points, not the 150 a season
 * differential does. The mockup reaches the same scale by passing
 * `margin * 6` through the default domain; naming the domain says what is
 * meant instead of encoding it in a multiplier. */
const MARGIN_DOMAIN = 25

const monoCellStyle: CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 13,
}

/**
 * The W/L/T badge.
 *
 * The mockup is `x.won ? emerald : gray-300` — two-way, because its
 * schedules are generated and always decided. `result` is `"W" | "L" | "T"
 * | null` here, and BOTH of the extra values are real: the backfill holds
 * ten tied games, so twenty team-seasons render a T, and an unplayed game
 * carries null. Folding a tie into the loss colour is the same defect
 * already fixed twice in this codebase — once in the standings streak
 * column, once on the week screen's game cards.
 */
function resultStyle(result: string | null): CSSProperties {
  const base: CSSProperties = {
    fontFamily: "var(--font-body)",
    fontSize: 11,
    fontWeight: 800,
    width: 22,
    height: 22,
    borderRadius: 6,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  }
  if (result === "W") {
    return { ...base, background: "var(--emerald)", color: "var(--white)" }
  }
  if (result === "L") {
    return { ...base, background: "var(--gray-300)", color: "var(--gray-700)" }
  }
  // A tie is neither, and gets the neutral orchid tint the app already
  // uses for "notable but not a win" (the OT pill on the week screen).
  if (result === "T") {
    return {
      ...base,
      background: "var(--orchid-tint)",
      color: "var(--orchid)",
    }
  }
  // Unplayed: an outline, so the row keeps its shape without claiming a
  // result that does not exist yet.
  return {
    ...base,
    background: "transparent",
    border: "1px dashed var(--gray-300)",
    color: "var(--gray-400)",
  }
}

export function getScheduleColumns(): StatColumn<ScheduleRowOut>[] {
  return [
    {
      key: "week",
      label: "Week",
      width: 56,
      align: "left",
      value: (row) => row.week_label,
      render: (row) => (
        <span
          style={{ ...monoCellStyle, fontSize: 12, color: "var(--gray-500)" }}
        >
          {row.week_label}
        </span>
      ),
    },
    {
      key: "result",
      label: "Res",
      width: 44,
      align: "left",
      value: (row) => row.result ?? "—",
      render: (row) => (
        <span style={resultStyle(row.result)}>{row.result ?? "–"}</span>
      ),
    },
    {
      key: "opponent",
      label: "Opponent",
      width: "minmax(150px, 1fr)",
      align: "left",
      sticky: true,
      value: (row) => row.opponent.nickname,
      render: (row) => (
        <div className="flex min-w-0 items-center" style={{ gap: 9 }}>
          <TeamChip
            abbr={row.opponent.abbr}
            color={row.opponent.color}
            size={26}
          />
          <span
            style={{
              fontSize: 13.5,
              fontWeight: 600,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {row.is_home ? "vs " : "at "}
            {row.opponent.nickname}
          </span>
        </div>
      ),
    },
    {
      key: "score",
      label: "Score",
      width: 92,
      align: "right",
      value: (row) => row.score_label ?? "—",
      render: (row) => (
        <span className="tabular" style={{ ...monoCellStyle, fontWeight: 700 }}>
          {row.score_label ?? "—"}
        </span>
      ),
    },
    {
      key: "margin",
      label: "Margin",
      width: 78,
      align: "right",
      value: (row) => row.margin ?? "",
      render: (row) =>
        row.margin === null ? null : (
          <span
            className="tabular"
            style={{
              ...monoCellStyle,
              fontWeight: 700,
              padding: "3px 8px",
              borderRadius: 6,
              ...divergingCell(row.margin, MARGIN_DOMAIN),
            }}
          >
            {formatDiff(row.margin)}
          </span>
        ),
    },
    {
      key: "cumulative",
      label: "Cum.",
      width: 88,
      align: "right",
      value: (row) => row.cumulative ?? "",
      render: (row) =>
        row.cumulative === null ? null : (
          <span
            className="tabular"
            style={{ ...monoCellStyle, color: "var(--gray-600)" }}
          >
            {formatDiff(row.cumulative)}
          </span>
        ),
    },
  ]
}
