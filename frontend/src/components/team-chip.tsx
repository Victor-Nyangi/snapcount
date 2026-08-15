import { inkFor } from "@/lib/contrast"

/**
 * The team's primary color with its abbreviation on top. Geometry ported
 * verbatim from the mockup's `chip(abbr, size)`. See plan §2.1.
 *
 * Sizes in use across screens: 24, 26, 30, 32, 34, 38, 44, 52, 64 — wider
 * than the brief's `26 | 30 | 34` literal union, so `size` is typed `number`.
 *
 * Team color is data arriving at runtime from the API, so it cannot resolve
 * through a static token: this is one of the two places (with `DiffCell`'s
 * background) where inline `style` is correct.
 */
export function TeamChip({
  abbr,
  color,
  name,
  size = 30,
}: {
  abbr: string
  color: string
  name?: string
  size?: number
}) {
  return (
    <span
      role="img"
      aria-label={name}
      title={name}
      style={{
        width: size,
        height: size,
        minWidth: size,
        borderRadius: "var(--radius-sm)",
        background: color,
        color: inkFor(color),
        fontFamily: "var(--font-body)",
        fontSize: size >= 30 ? 11 : 10,
        fontWeight: 800,
        letterSpacing: "0.02em",
        boxShadow: "inset 0 0 0 1px rgb(255 255 255 / 0.18)",
      }}
      className="inline-flex items-center justify-center"
    >
      {abbr}
    </span>
  )
}
