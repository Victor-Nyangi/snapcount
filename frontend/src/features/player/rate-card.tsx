import type { CSSProperties } from "react"
import type { RateCard as RateCardData } from "@/client"

/**
 * One of the player page's three rate cards: a value, its signed distance
 * from the positional baseline, and a bar with a dashed marker at that
 * baseline. Geometry verbatim from the mockup's `rateCard`.
 *
 * BOTH CLAMPS ARE LOAD-BEARING and come from the mockup:
 *
 *  - the fill is clamped to a 6% MINIMUM, because a 0%-wide bar reads as a
 *    broken element rather than as a low value. This also absorbs a
 *    NEGATIVE value, which `epa` genuinely can be — Joe Flacco's 2025 EPA
 *    per play is −0.098 — and which would otherwise produce a negative CSS
 *    width, an invalid declaration that collapses the bar entirely.
 *  - the marker is clamped to 99%, because at exactly 100% it sits on the
 *    track's rounded end cap and is clipped out of view.
 *
 * The bar is decorative: the exact figure is the 30px numeral above it and
 * the signed delta beside that, so a value pinned to the 6% floor is never
 * the only thing telling the reader where the player stands.
 */

const FILL_MIN_PERCENT = 6
const MARKER_MAX_PERCENT = 99

const monoStyle: CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontVariantNumeric: "tabular-nums",
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

/**
 * Signs at the metric's own precision. A delta that ROUNDS to zero is left
 * unsigned — at precision 0 a +0.4 gap displays as "0", and "+0" would
 * claim a distinction the rendered number cannot show.
 */
export function formatDelta(value: number, precision: number): string {
  const text = value.toFixed(precision)
  if (Number.parseFloat(text) === 0) return (0).toFixed(precision)
  // U+2212 MINUS, not the ASCII hyphen `toFixed` emits — every signed
  // numeral in this app has to share the tabular advance width.
  if (text.startsWith("-")) return `−${text.slice(1)}`
  return `+${text}`
}

export function RateCard({ card }: { card: RateCardData }) {
  const fill = clamp((card.value / card.scale_max) * 100, FILL_MIN_PERCENT, 100)
  const marker = clamp(
    (card.baseline / card.scale_max) * 100,
    0,
    MARKER_MAX_PERCENT,
  )
  const atOrAbove = card.delta >= 0

  return (
    <div
      style={{
        background: "var(--card)",
        border: "1px solid var(--gray-200)",
        borderRadius: "var(--radius-lg)",
        padding: "18px 20px",
        boxShadow: "var(--shadow-light-sm)",
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "var(--gray-500)",
        }}
      >
        {card.label}
      </div>

      <div
        className="flex flex-wrap items-baseline"
        style={{ gap: 10, marginTop: 8 }}
      >
        <span style={{ ...monoStyle, fontSize: 30, fontWeight: 700 }}>
          {card.value.toFixed(card.precision)}
        </span>
        <span
          style={{
            ...monoStyle,
            fontSize: 14,
            fontWeight: 700,
            color: atOrAbove ? "var(--emerald-ink)" : "var(--ink-negative)",
          }}
        >
          {formatDelta(card.delta, card.precision)} vs baseline
        </span>
      </div>

      <span
        aria-hidden="true"
        className="relative mt-3 block overflow-hidden"
        style={{ height: 10, borderRadius: 5, background: "var(--gray-100)" }}
      >
        <span
          className="absolute inset-y-0 left-0 block"
          style={{
            width: `${fill}%`,
            borderRadius: 5,
            background: "var(--orchid-600)",
          }}
        />
        <span
          className="absolute block"
          style={{
            top: -2,
            bottom: -2,
            left: `${marker}%`,
            width: 0,
            borderLeft: "2px dashed var(--gray-500)",
          }}
        />
      </span>

      <div
        style={{
          ...monoStyle,
          marginTop: 8,
          fontSize: 11,
          color: "var(--gray-500)",
        }}
      >
        positional baseline {card.baseline.toFixed(card.precision)}
      </div>
    </div>
  )
}
