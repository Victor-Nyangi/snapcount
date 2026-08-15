import { divergingCell } from "@/lib/diverging"

/**
 * A signed numeric cell on the app's one diverging scale. `divergingCell`
 * (Task 1.4) owns the color math; this component only owns layout. The
 * background/ink pair is data-derived, mirroring `TeamChip`'s inline style
 * for the same reason.
 */
export function DiffCell({
  value,
  domain,
}: {
  value: number
  domain?: number
}) {
  const { background, color } = divergingCell(value, domain)
  const sign = value > 0 ? "+" : ""

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
      {sign}
      {value}
    </span>
  )
}
