const round = (n: number) => Math.round(n * 1e4) / 1e4

export type ScaleTheme = "light" | "dark"

/**
 * One ramp per sign, per theme: background lightness and chroma as linear
 * functions of magnitude, an ink for each half of the ramp.
 *
 * LIGHT is ported verbatim from `diffCell(v)` in
 * `NFL Analysis Platform.dc.html` (plan §1.4): pale tints that darken toward
 * the saturated end, dark ink on top.
 *
 * DARK is NOT the light ramp on a dark canvas. Those L 0.75-0.97 tints are
 * the brightest things on a navy page, so every cell glared and the colour
 * stopped meaning anything (theme.css §1.2). The dark ramp starts near the
 * surface's own lightness (L 0.28) and climbs in lightness AND chroma, so
 * magnitude still reads as "more colour", with light ink on top throughout.
 * Its inks are tokens defined only under `.dark` in theme.css. Every step of
 * both ramps is held to WCAG AA by `contrast.test.ts`.
 */
type Ramp = {
  l: [base: number, slope: number]
  c: [base: number, slope: number]
  hue: number
  ink: { weak: string; strong: string }
}

const SCALES: Record<ScaleTheme, { positive: Ramp; negative: Ramp }> = {
  light: {
    positive: {
      l: [0.97, -0.22],
      c: [0.04, 0.12],
      hue: 155,
      ink: { weak: "var(--emerald-ink)", strong: "var(--accent-primary-ink)" },
    },
    negative: {
      l: [0.97, -0.2],
      c: [0.04, 0.13],
      hue: 25,
      ink: {
        weak: "var(--ink-negative-mid)",
        strong: "var(--ink-negative-strong)",
      },
    },
  },
  dark: {
    positive: {
      l: [0.28, 0.2],
      c: [0.04, 0.1],
      hue: 155,
      ink: {
        weak: "var(--diff-ink-pos)",
        strong: "var(--diff-ink-pos-strong)",
      },
    },
    negative: {
      l: [0.28, 0.18],
      c: [0.045, 0.13],
      hue: 25,
      ink: {
        weak: "var(--diff-ink-neg)",
        strong: "var(--diff-ink-neg-strong)",
      },
    },
  },
}

/**
 * The one diverging scale. See plan §1.4.
 *
 * `domain` is the magnitude at which the scale saturates. It defaults to 150
 * season points; any other signed quantity must pass its own domain rather
 * than getting a scale of its own.
 *
 * `theme` is the RESOLVED theme (`useTheme().resolvedTheme`), never
 * "system". It defaults to light so every existing caller and test is
 * byte-for-byte what it was.
 */
export function divergingCell(
  value: number,
  domain = 150,
  theme: ScaleTheme = "light",
) {
  if (value === 0) {
    // Tokens, not literals: --gray-100/--gray-600 are themselves redefined
    // under `.dark`, so the neutral midpoint follows the canvas on its own.
    return { background: "var(--gray-100)", color: "var(--gray-600)" }
  }
  const mag = Math.min(Math.abs(value) / domain, 1)
  const strong = mag > 0.55
  const ramp = value > 0 ? SCALES[theme].positive : SCALES[theme].negative

  return {
    background: `oklch(${round(ramp.l[0] + mag * ramp.l[1])} ${round(ramp.c[0] + mag * ramp.c[1])} ${ramp.hue})`,
    color: strong ? ramp.ink.strong : ramp.ink.weak,
  }
}
