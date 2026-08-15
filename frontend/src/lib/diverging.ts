const round = (n: number) => Math.round(n * 1e4) / 1e4

/**
 * The one diverging scale, ported verbatim from `diffCell(v)` in
 * `NFL Analysis Platform.dc.html`. See plan §1.4.
 *
 * `domain` is the magnitude at which the scale saturates. It defaults to 150
 * season points; any other signed quantity must pass its own domain rather
 * than getting a scale of its own.
 */
export function divergingCell(value: number, domain = 150) {
  if (value === 0) {
    return { background: 'var(--gray-100)', color: 'var(--gray-600)' }
  }
  const mag = Math.min(Math.abs(value) / domain, 1)
  const strong = mag > 0.55

  if (value > 0) {
    return {
      background: `oklch(${round(0.97 - mag * 0.22)} ${round(0.04 + mag * 0.12)} 155)`,
      color: strong ? 'var(--accent-primary-ink)' : 'var(--emerald-dark)',
    }
  }
  return {
    background: `oklch(${round(0.97 - mag * 0.2)} ${round(0.04 + mag * 0.13)} 25)`,
    color: strong ? 'var(--ink-negative-strong)' : 'var(--ink-negative-mid)',
  }
}
