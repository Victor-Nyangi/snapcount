/**
 * Leaderboard bar: fill scaled to the leader, with a dashed marker at the
 * positional baseline. Geometry ported verbatim from the mockup's
 * `barStyle` / `baselineStyle`.
 *
 * The mockup scales everything against the leader alone — `value / top` and
 * `baseline / top`. That is right only while nothing is negative, which is
 * true of every figure in its sample data and false of real EPA: EPA per
 * rush is a signed rate, and the RB baseline is NEGATIVE in all ten
 * backfilled seasons. Against a 0.140 leader a −0.046 baseline put the
 * marker at −33%, off the left edge and invisible on every RB EPA board,
 * and a below-zero rusher got `width: -3.6%` — not a valid CSS length, so
 * the declaration was dropped and the bar silently collapsed to nothing.
 *
 * So the scale runs from `min(0, baseline)` rather than always from zero.
 * When the baseline is positive — every other position, and every yards /
 * TD / rate board — that floor IS zero and the arithmetic is identical to
 * the mockup's, byte for byte. The floor is derived only from `top` and
 * `baseline`, both shared by every row, so all bars on a board stay on one
 * scale and their lengths stay comparable.
 */

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value))
}

export function LeaderBar({
  value,
  top,
  baseline,
  isLeader,
}: {
  value: number
  top: number
  baseline: number
  isLeader: boolean
}) {
  const floor = Math.min(0, baseline)
  const span = top - floor
  // A board where every qualified player scored exactly zero has no scale
  // to speak of; render an empty track rather than dividing by zero.
  const position = (at: number) =>
    span > 0 ? clampPercent(((at - floor) / span) * 100) : 0

  return (
    <span
      className="relative block overflow-hidden"
      style={{
        height: 10,
        borderRadius: 5,
        background: "var(--gray-100)",
      }}
    >
      <span
        className="absolute inset-y-0 left-0 block"
        style={{
          width: `${position(value)}%`,
          borderRadius: 5,
          background: isLeader ? "var(--emerald)" : "var(--orchid-600)",
          transition: "width 180ms var(--ease-standard)",
        }}
      />
      <span
        title={`Baseline: ${baseline}`}
        className="absolute block"
        style={{
          top: -2,
          bottom: -2,
          left: `${position(baseline)}%`,
          width: 0,
          borderLeft: "2px dashed var(--gray-500)",
        }}
      />
    </span>
  )
}
