export type FreshnessStatus = "live" | "final" | "stale"

/**
 * Data-freshness indicator for the header's right rail. Geometry and colors
 * ported from the mockup's freshness pill (design-v2-seven-screens.html).
 *
 * `status` and `label` are both props — this component owns no knowledge of
 * what "current" means. The label text comes from the API
 * (`GET /meta/freshness`, Task 4.1), never hard-coded here.
 *
 * The mockup only ever renders the `final`/`live` (emerald) styling — it has
 * no `stale` markup to copy from. The design system had no "warning tint"
 * background/border pair, so `theme.css` now derives one (§1.9a): the same
 * lightness/chroma formula the emerald tint pair uses, applied at
 * `--warning`'s hue instead of emerald's. `stale` swaps the container to
 * `--warning-tint-strong`/`--warning-tint-border` alongside the `--warning`
 * dot and `--warning-ink` label, so all three states are internally
 * consistent pill+dot+label triples rather than a green pill with orange
 * contents.
 *
 * The `live` dot's pulse is applied via a *class*, not an inline `animation`
 * style, and suppressed for `prefers-reduced-motion` in this component's own
 * scoped <style> tag rather than relying on the sitewide rule in
 * `theme.css`. That sitewide rule (`* { animation: none; transition: none }`
 * under the reduced-motion query) has no `!important`, so it cannot win
 * against an inline `style="animation: ..."` — inline styles beat external
 * "normal" rules regardless of selector specificity. Two same-origin,
 * same-specificity class rules (this file's own `.snap-freshness-dot--live`
 * base rule and its `@media (prefers-reduced-motion: reduce)` override) sort
 * correctly by source order without needing `!important` or a change to the
 * global stylesheet, which is out of this task's file scope.
 */
export function FreshnessPill({
  status,
  label,
}: {
  status: FreshnessStatus
  label: string
}) {
  const isStale = status === "stale"
  const dotColor = isStale ? "var(--warning)" : "var(--emerald)"
  const inkColor = isStale ? "var(--warning-ink)" : "var(--emerald-dark)"
  const bgColor = isStale
    ? "var(--warning-tint-strong)"
    : "var(--emerald-tint-strong)"
  const borderColor = isStale
    ? "var(--warning-tint-border)"
    : "var(--emerald-tint-border)"

  return (
    <div
      title="Data freshness"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 7,
        padding: "6px 11px",
        borderRadius: "var(--radius-pill)",
        background: bgColor,
        // Longhand rather than the `border` shorthand: jsdom's CSS parser
        // (used by the test suite) fails to parse a `var()` reference inside
        // a compound shorthand value, even though real browsers handle it
        // fine. Longhand keeps this both correct and testable.
        borderWidth: 1,
        borderStyle: "solid",
        borderColor,
      }}
    >
      <style>{`
        @keyframes livePulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
        .snap-freshness-dot--live { animation: livePulse 2s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .snap-freshness-dot--live { animation: none; }
        }
      `}</style>
      <span
        aria-hidden="true"
        data-testid="freshness-dot"
        className={status === "live" ? "snap-freshness-dot--live" : undefined}
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: dotColor,
          display: "block",
        }}
      />
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          color: inkColor,
        }}
      >
        {label}
      </span>
    </div>
  )
}
