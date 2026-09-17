export type FreshnessStatus = "live" | "fresh" | "stale" | "complete"

/**
 * Data-freshness indicator for the header's right rail. Geometry and colors
 * ported from the mockup's freshness pill (design-v2-seven-screens.html).
 *
 * `status` and `label` are both props — this component owns no knowledge of
 * what "current" means. The label text comes from the API
 * (`GET /meta/freshness`, Task 4.1), never hard-coded here.
 *
 * The mockup only ever renders the `fresh`/`live` (emerald) styling — it has
 * no `stale` markup to copy from. The design system had no "warning tint"
 * background/border pair, so `theme.css` now derives one (§1.9a): the same
 * lightness/chroma formula the emerald tint pair uses, applied at
 * `--warning`'s hue instead of emerald's. `stale` swaps the container to
 * `--warning-tint-strong`/`--warning-tint-border` alongside the `--warning`
 * dot and `--warning-ink` label, so all three states are internally
 * consistent pill+dot+label triples rather than a green pill with orange
 * contents.
 *
 * `complete` (a finished past season, VIC-137) is neither current nor a
 * problem, so it is neutral: the `--muted` pill and `--border` edge, a
 * `--muted-foreground` dot, and `--secondary-foreground` for the label.
 * The label deliberately does NOT use `--muted-foreground` — gray-500 on
 * gray-100 is ~4.4:1 and fails AA at this 11px size; gray-600 clears it.
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
const EMERALD = {
  dotColor: "var(--emerald)",
  inkColor: "var(--emerald-ink)",
  bgColor: "var(--emerald-tint-strong)",
  borderColor: "var(--emerald-tint-border)",
}

const PALETTE: Record<
  FreshnessStatus,
  { dotColor: string; inkColor: string; bgColor: string; borderColor: string }
> = {
  live: EMERALD,
  fresh: EMERALD,
  stale: {
    dotColor: "var(--warning)",
    inkColor: "var(--warning-ink)",
    bgColor: "var(--warning-tint-strong)",
    borderColor: "var(--warning-tint-border)",
  },
  complete: {
    dotColor: "var(--muted-foreground)",
    inkColor: "var(--secondary-foreground)",
    bgColor: "var(--muted)",
    borderColor: "var(--border)",
  },
}

export function FreshnessPill({
  status,
  label,
}: {
  status: FreshnessStatus
  label: string
}) {
  const { dotColor, inkColor, bgColor, borderColor } = PALETTE[status]

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
