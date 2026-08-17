import { divergingCell } from "@/lib/diverging"
import { formatDiff } from "@/lib/format"

/**
 * A signed numeric cell on the app's one diverging scale. `divergingCell`
 * (Task 1.4) owns the color math; this component only owns layout. The
 * background/ink pair is data-derived, mirroring `TeamChip`'s inline style
 * for the same reason.
 *
 * Text goes through `formatDiff` (Task 5.1) rather than a plain template
 * literal: a negative value must render with U+2212 MINUS SIGN, not the
 * ASCII hyphen `${value}` would produce, or a column of negatives loses
 * its `tabular-nums` alignment (a hyphen has a different advance width).
 */
export function DiffCell({
  value,
  domain,
}: {
  value: number
  domain?: number
}) {
  const { background, color } = divergingCell(value, domain)

  return (
    <span
      className="tabular inline-block"
      style={{
        padding: "4px 8px",
        borderRadius: 6,
        background,
        color,
        fontSize: 13,
        fontWeight: 700,
        textAlign: "right",
      }}
    >
      {formatDiff(value)}
    </span>
  )
}
