const WHITE = "#FFFFFF"
const NEAR_BLACK = "#0A0A0C" // --black

function channel(v: number) {
  const c = v / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

function luminance(hex: string) {
  const h = hex.replace("#", "")
  const [r, g, b] = [0, 2, 4].map((i) =>
    channel(parseInt(h.slice(i, i + 2), 16)),
  )
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrastRatio(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/**
 * Team chips are the team's primary color with the abbreviation on top. The
 * design hard-codes white ink, which fails AA for 8 of 32 teams (plan §1.7).
 * Team color still owns the chip; only the ink adapts.
 */
export function inkFor(background: string) {
  return contrastRatio(background, WHITE) >=
    contrastRatio(background, NEAR_BLACK)
    ? WHITE
    : NEAR_BLACK
}
