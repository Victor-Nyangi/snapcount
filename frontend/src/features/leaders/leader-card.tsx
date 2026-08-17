import type { CSSProperties } from "react"
import type { LeaderRow } from "@/client"
import { LeaderBar } from "@/components/leader-bar"
import { TeamChip } from "@/components/team-chip"

/**
 * One row of a leaderboard. Geometry verbatim from the mockup's
 * `cardStyle` / `leaderRows`.
 *
 * Rank 1 carries the emerald border and glow — the design's one "glow per
 * screen" moment, so it is deliberately not a variant anything else can
 * opt into.
 */

const monoStyle: CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontVariantNumeric: "tabular-nums",
}

const readoutKeyStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.05em",
  textTransform: "uppercase",
  color: "var(--gray-500)",
  marginTop: 3,
}

/**
 * Fixed per metric, from the API's `precision` — never per cell, so a
 * column of values stays aligned on the decimal under `tabular-nums`.
 */
function format(value: number, precision: number): string {
  return value.toFixed(precision)
}

/**
 * The signed vs-baseline readout. `formatDiff` in `lib/format` is
 * whole-number only (it is the standings differential's formatter); this
 * one has to respect the metric's precision, so it signs the already-
 * formatted string instead.
 *
 * A value of exactly zero is unsigned — a player who sits precisely ON the
 * baseline is neither above nor below it. Note that this is decided on the
 * ROUNDED text, not the raw float: at precision 0 a +0.4 difference reads
 * "0", and "+0" would claim a distinction the number as displayed does not
 * support.
 */
export function formatVsBaseline(value: number, precision: number): string {
  const text = format(value, precision)
  if (Number.parseFloat(text) === 0) return format(0, precision)
  // U+2212 MINUS, matching every other signed numeral in the app —
  // `toFixed` emits an ASCII hyphen, which breaks tabular alignment.
  if (text.startsWith("-")) return `−${text.slice(1)}`
  return `+${text}`
}

function Readout({
  label,
  children,
  style,
}: {
  label: string
  children: React.ReactNode
  style: CSSProperties
}) {
  return (
    <div style={{ textAlign: "right" }}>
      <div style={style}>{children}</div>
      <div style={readoutKeyStyle}>{label}</div>
    </div>
  )
}

export function LeaderCard({
  row,
  top,
  baseline,
  precision,
  unit,
}: {
  row: LeaderRow
  top: number
  baseline: number
  precision: number
  unit: string
}) {
  const isLeader = row.rank === 1
  const atOrAboveBaseline = row.vs_baseline >= 0

  return (
    <article
      style={{
        display: "grid",
        gridTemplateColumns: "44px minmax(220px, 1fr) auto",
        gap: 22,
        alignItems: "center",
        background: "var(--card)",
        border: `1px solid ${
          isLeader ? "var(--emerald-tint-border)" : "var(--gray-200)"
        }`,
        borderRadius: 14,
        padding: "16px 20px",
        boxShadow: isLeader
          ? "0 4px 18px oklch(0.72 0.10 155 / 0.22)"
          : "var(--shadow-light-sm)",
      }}
    >
      <div
        data-display="1"
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 30,
          fontWeight: 700,
          color: "var(--gray-300)",
          lineHeight: 1,
          width: 44,
          textAlign: "center",
        }}
      >
        {row.rank}
      </div>

      <div style={{ minWidth: 0 }}>
        <div className="flex items-center" style={{ gap: 10 }}>
          {/* No `name`: the leaders payload carries only the abbreviation,
              and passing it as the label would make AT announce "BAL,
              image" over text that already reads "BAL". Left unnamed, the
              chip stays roleless and its own text is what is announced. */}
          <TeamChip
            abbr={row.player.team_abbr}
            color={row.player.team_color}
            size={30}
          />
          <span
            style={{
              fontSize: 17,
              fontWeight: 800,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {row.player.name}
          </span>
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "var(--gray-500)",
              whiteSpace: "nowrap",
            }}
          >
            {row.player.meta}
          </span>
        </div>
        <div style={{ marginTop: 10 }}>
          <LeaderBar
            value={row.value}
            top={top}
            baseline={baseline}
            isLeader={isLeader}
          />
        </div>
      </div>

      <div className="flex items-center" style={{ gap: 26 }}>
        <Readout
          label={`${unit} (rank metric)`}
          style={{ ...monoStyle, fontSize: 22, fontWeight: 700 }}
        >
          {format(row.value, precision)}
        </Readout>
        <Readout
          label={row.secondary.key}
          style={{
            ...monoStyle,
            fontSize: 16,
            fontWeight: 600,
            color: "var(--gray-600)",
          }}
        >
          {/* Always a whole count (yards or touchdowns), whatever the rank
              metric's own precision is. */}
          {row.secondary.value.toFixed(0)}
        </Readout>
        <Readout
          label="vs baseline"
          style={{
            ...monoStyle,
            fontSize: 16,
            fontWeight: 700,
            color: atOrAboveBaseline
              ? "var(--emerald-dark)"
              : "var(--ink-negative)",
          }}
        >
          {formatVsBaseline(row.vs_baseline, precision)}
        </Readout>
      </div>
    </article>
  )
}
