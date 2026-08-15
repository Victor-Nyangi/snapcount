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
 *
 * `role="img"` + `aria-label` are only emitted together, and only when
 * `name` is supplied. With a name, AT announces the full team name. Without
 * one, the span stays roleless and its text content (the abbreviation) is
 * what AT announces — never an unlabelled image. This also keeps Biome's
 * `useAriaPropsSupportedByRole` happy: a bare `<span>` (role `generic`)
 * doesn't support `aria-label`, so the two attributes must appear as a pair
 * or not at all.
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
  const a11y = name ? { role: "img" as const, "aria-label": name } : {}

  return (
    <span
      {...a11y}
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
