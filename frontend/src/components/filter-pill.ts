import type { CSSProperties } from "react"

/**
 * The rounded filter pill used by every single-select filter group —
 * Standings' conference toggle, Week's slate toggle, and the screens after
 * them. Geometry verbatim from the mockup's own `pill(on)` helper, which is
 * likewise one function shared across its screens rather than a style
 * repeated per section.
 *
 * A style function rather than a component: these render as the `style` of
 * a Radix `ToggleGroupItem`, so the caller owns the element and only needs
 * the appearance.
 */
export function filterPillStyle(active: boolean): CSSProperties {
  return {
    fontFamily: "var(--font-body)",
    fontSize: 13,
    fontWeight: active ? 800 : 600,
    padding: "8px 14px",
    borderRadius: 999,
    cursor: "pointer",
    border: `1px solid ${active ? "var(--emerald)" : "var(--gray-300)"}`,
    background: active ? "var(--emerald-tint)" : "var(--card)",
    color: active ? "var(--emerald-dark)" : "var(--gray-600)",
    transition: "background 120ms ease",
  }
}
