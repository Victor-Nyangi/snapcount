const WHITE = "#FFFFFF"
const NEAR_BLACK = "#0A0A0C" // --black

function channel(v: number) {
  const c = v / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

/** sRGB gamma encode a linear channel, clipped to the gamut. */
function encode(linear: number) {
  const x = Math.min(1, Math.max(0, linear))
  return x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055
}

/**
 * `oklch(L C H)` to 0-255 sRGB, via OKLab (Björn Ottosson's matrices, the
 * ones CSS Color 4 specifies). Out-of-gamut values are clipped per channel,
 * which is what browsers do for a plain `background:` today — so the
 * contrast measured here is the contrast that lands on screen.
 */
function oklchToRgb(l: number, c: number, hDeg: number): number[] {
  const h = (hDeg * Math.PI) / 180
  const a = c * Math.cos(h)
  const b = c * Math.sin(h)
  const l1 = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m1 = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s1 = (l - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * l1 - 3.3077115913 * m1 + 0.2309699292 * s1,
    -1.2684380046 * l1 + 2.6097574011 * m1 - 0.3413193965 * s1,
    -0.0041960863 * l1 - 0.7034186147 * m1 + 1.707614701 * s1,
  ].map((v) => Math.round(encode(v) * 255))
}

/** `#rgb`, `#rrggbb` or `oklch(L C H)` (opaque) to 0-255 sRGB. */
export function toRgb(color: string): number[] {
  const css = color.trim()
  const oklch = css.match(
    /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*1\s*)?\)$/i,
  )
  if (oklch) {
    return oklchToRgb(Number(oklch[1]), Number(oklch[2]), Number(oklch[3]))
  }
  let h = css.replace("#", "")
  if (h.length === 3) {
    h = [...h].map((ch) => ch + ch).join("")
  }
  if (!/^[0-9a-f]{6}$/i.test(h)) {
    throw new Error(`toRgb: unsupported colour "${color}"`)
  }
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
}

function luminance(color: string) {
  const [r, g, b] = toRgb(color).map(channel)
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
