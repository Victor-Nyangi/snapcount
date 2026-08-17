/**
 * The app's only chart, and therefore its chart convention (plan §1.10):
 * no axes, no ticks, no gridlines — one dashed zero rule and one series.
 * Any later chart inherits these rules.
 *
 * The series is `--orchid`, never a team colour: this is a single-series
 * chart on a page whose banner already carries team identity.
 */

const VIEW_WIDTH = 640
const VIEW_HEIGHT = 132

/**
 * Symmetric auto-scale with a floor, from the mockup's `svgLine`:
 *
 *   max  = max(|v|…, floor)   floor of ±40, so a team that finished ±5 all
 *                             season does not render as dramatic swings
 *   y    = h/2 - (v/max) * (h/2 - 6)   zero at mid-height, 6px padding
 *
 * `values` is one slot per game in kickoff order, `null` for a game with
 * no result. Nulls are not plotted — a season in progress stops at the
 * last game played rather than dropping to zero for the rest of the year.
 *
 * X COMES FROM THE SLOT, NOT FROM THE COMPACTED SERIES. The obvious
 * shape — filter the nulls out, then index the filtered array — is right
 * only while every null is trailing. `app/analytics/trends.py::team_schedule`
 * documents otherwise: a played game after a gap "resumes from the last
 * real total rather than restarting", so an interior null is a supported
 * value, produced by a postponed or cancelled game. (A merely-unplayed
 * game cannot produce one: rows are in kickoff order, so unplayed games
 * all sort last.) Indexing the filtered array would draw every game after
 * such a gap one slot to the left, silently compressing the rest of the
 * season toward the start of the chart.
 *
 * The current backfill contains no unplayed games at all — all ten seasons
 * are complete — so neither shape is reachable from today's data. This
 * costs nothing to get right and cannot be noticed later if it is wrong.
 */
export function trendPath(
  values: (number | null)[],
  w: number,
  h: number,
  floor = 40,
): string {
  const played = values.filter((v): v is number => v !== null)
  if (played.length === 0) return ""

  const max = Math.max(...played.map(Math.abs), floor)
  const step = w / (values.length - 1 || 1)

  const points: string[] = []
  values.forEach((value, slot) => {
    if (value === null) return
    const x = (slot * step).toFixed(1)
    const y = (h / 2 - (value / max) * (h / 2 - 6)).toFixed(1)
    points.push(`${points.length === 0 ? "M" : "L"}${x} ${y}`)
  })
  return points.join(" ")
}

export function TrendLine({
  values,
  label,
  width = VIEW_WIDTH,
  height = VIEW_HEIGHT,
  floor = 40,
}: {
  values: (number | null)[]
  /** Required: a bare `<svg>` holding one path is invisible to a screen
   * reader, and the numbers are in the adjacent table anyway. */
  label: string
  width?: number
  height?: number
  floor?: number
}) {
  const path = trendPath(values, width, height, floor)
  const mid = height / 2

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      style={{ width: "100%", height, display: "block" }}
    >
      <title>{label}</title>
      <line
        x1="0"
        y1={mid}
        x2={width}
        y2={mid}
        stroke="var(--chart-rule)"
        strokeWidth="1"
        strokeDasharray="4 4"
      />
      {/* No path at all before the first game is played — an empty chart,
          not a missing one: the frame and its zero rule stay put so the
          card does not change height when results start arriving. */}
      {path && (
        <path
          d={path}
          fill="none"
          stroke="var(--orchid)"
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}
    </svg>
  )
}
