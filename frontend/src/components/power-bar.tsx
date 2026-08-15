/**
 * Miniature power-ranking bar. Width formula ported verbatim from the
 * mockup's `pwrBarStyle`. Purely decorative — the adjacent numeral carries
 * the value — so the mark itself is `aria-hidden`.
 */
export function PowerBar({
  value,
  min,
  max,
}: {
  value: number
  min: number
  max: number
}) {
  const width = 6 + ((value - min) / (max - min || 1)) * 46

  return (
    <span
      aria-hidden="true"
      className="inline-block"
      style={{
        width,
        height: 8,
        borderRadius: 4,
        background: "var(--orchid-700)",
      }}
    />
  )
}
