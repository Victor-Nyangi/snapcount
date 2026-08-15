/**
 * Leaderboard bar: fill scaled to the leader, with a dashed marker at the
 * positional baseline. Geometry ported verbatim from the mockup's
 * `barStyle` / `baselineStyle`.
 */
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
          width: `${(value / top) * 100}%`,
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
          left: `${(baseline / top) * 100}%`,
          width: 0,
          borderLeft: "2px dashed var(--gray-500)",
        }}
      />
    </span>
  )
}
