import type { CSSProperties } from "react"
import type { TeamPageResponse } from "@/client"
import { TeamChip } from "@/components/team-chip"
import { TrendLine } from "@/components/trend-line"
import { inkFor } from "@/lib/contrast"

/**
 * The team hero: a full-bleed banner in the team's own colour, then the
 * app's only chart beneath it. Geometry verbatim from the mockup.
 *
 * EVERY piece of banner text and the chip ink go through `inkFor` (§1.7 /
 * §1.8). This is the worst contrast surface in the app, not a marginal
 * one: the mockup hard-codes plain white and then drops it to 78% and 70% for
 * the record line and the stat labels, and on Carolina blue white already
 * measures only 4.03:1 at FULL opacity — the muted layers are below it
 * again. Six hex values across seven teams are in the same position.
 * Deriving the ink flips those to near-black, where CAR reaches 4.91,
 * while Detroit (4.92 on white, 4.02 on black) correctly keeps white.
 */

// The mockup's `rgba(255,255,255,0.78)` / `0.7`, applied as opacity so the
// same two steps work over either ink rather than only over white.
const RECORD_OPACITY = 0.78
const STAT_LABEL_OPACITY = 0.7

const statValueStyle: CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontVariantNumeric: "tabular-nums",
  fontSize: 26,
  fontWeight: 700,
}

export function TeamHero({ data }: { data: TeamPageResponse }) {
  const ink = inkFor(data.team.color)
  const cumulative = data.schedule.map((row) => row.cumulative)

  return (
    <section
      style={{
        background: "var(--card)",
        border: "1px solid var(--gray-200)",
        borderRadius: "var(--radius-xl)",
        overflow: "hidden",
        boxShadow: "var(--shadow-light-sm)",
      }}
    >
      <div
        style={{
          background: data.team.color,
          padding: "26px 28px 28px",
          color: ink,
        }}
      >
        <div className="flex flex-wrap items-center" style={{ gap: 20 }}>
          <TeamChip
            abbr={data.team.abbr}
            color={data.team.color}
            name={data.team.name}
            size={64}
          />
          <div>
            <h1
              data-display="1"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 36,
                lineHeight: 1.05,
                fontWeight: 700,
                margin: 0,
                letterSpacing: "-0.01em",
              }}
            >
              {data.team.name}
            </h1>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 14,
                marginTop: 6,
                opacity: RECORD_OPACITY,
              }}
            >
              {data.record_label} · {data.conference_label}
            </div>
          </div>
          <div
            style={{
              marginLeft: "auto",
              display: "grid",
              gridTemplateColumns: "repeat(4, auto)",
              gap: 26,
            }}
          >
            {data.stats.map((stat) => (
              <div key={stat.key}>
                <div style={statValueStyle}>{stat.value}</div>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    marginTop: 4,
                    opacity: STAT_LABEL_OPACITY,
                  }}
                >
                  {stat.key}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ padding: "24px 28px 28px" }}>
        <h2
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 22,
            fontWeight: 700,
            margin: "0 0 4px",
          }}
        >
          Cumulative point differential, week by week
        </h2>
        <p
          style={{ margin: "0 0 14px", fontSize: 13, color: "var(--gray-500)" }}
        >
          Running total across the 17-game season. Zero line marked.
        </p>
        <TrendLine
          values={cumulative}
          label={`${data.team.name} cumulative point differential by week`}
        />
      </div>
    </section>
  )
}
