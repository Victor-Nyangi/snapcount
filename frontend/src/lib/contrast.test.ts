import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { contrastRatio, inkFor, toRgb } from "./contrast"
import { divergingCell } from "./diverging"

describe("contrastRatio", () => {
  it("is 21 for black on white", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 1)
  })
  it("confirms Tennessee blue fails AA against white", () => {
    expect(contrastRatio("#4B92DB", "#FFFFFF")).toBeLessThan(4.5)
  })
})

describe("inkFor", () => {
  it("picks white on dark team colors", () => {
    expect(inkFor("#0A0A0C")).toBe("#FFFFFF") // PIT / LV
    expect(inkFor("#002244")).toBe("#FFFFFF") // SEA
  })

  it("flips to near-black on the light team colors that fail AA on white", () => {
    // These six teams fail 4.5:1 AA on white (DET #0076B6 passes at 4.92:1 and gets white)
    for (const hex of [
      "#4B92DB",
      "#0085CA",
      "#008E97",
      "#FB4F14",
      "#9F8958",
      "#0080C6",
    ]) {
      expect(inkFor(hex)).toBe("#0A0A0C")
    }
  })

  it("always clears AA for whichever ink it picks, across all 32 team colors", () => {
    const colors = [
      "#00338D",
      "#008E97",
      "#002A5C",
      "#115740",
      "#241773",
      "#101820",
      "#FB4F14",
      "#311D00",
      "#03202F",
      "#006778",
      "#003A70",
      "#4B92DB",
      "#E31837",
      "#FB4F14",
      "#0080C6",
      "#101820",
      "#004C54",
      "#5A1414",
      "#041E42",
      "#0B2265",
      "#0076B6",
      "#203731",
      "#4F2683",
      "#0B162A",
      "#D50A0A",
      "#A71930",
      "#9F8958",
      "#0085CA",
      "#AA0000",
      "#003594",
      "#002244",
      "#97233F",
    ]
    for (const hex of colors) {
      expect(contrastRatio(hex, inkFor(hex))).toBeGreaterThanOrEqual(4.5)
    }
  })
})

/*
 * THEMES. Everything below measures the REAL token files, read from disk —
 * not a copy of their values — so changing a token in theme.css re-runs
 * these checks against the new value. Light is every `:root` block in
 * cascade order (tokens.ds → tokens.app → theme); dark is light plus
 * theme.css's `:root.dark` overrides, exactly as the browser layers them
 * on <html>. Custom properties resolve lazily (at use), so `--card:
 * var(--surface-card-light)` picks up the dark surface on its own.
 */
type Theme = "light" | "dark"

// A path, not `new URL(..., import.meta.url)`: under jsdom the global `URL`
// is jsdom's, which node's fileURLToPath does not accept.
const STYLES = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../styles",
)

function readStyle(name: string) {
  return readFileSync(path.join(STYLES, name), "utf8")
}

function declarations(css: string, selector: string) {
  const out = new Map<string, string>()
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "")
  for (const [, sel, body] of stripped.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (sel.trim() !== selector) continue
    for (const [, prop, value] of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
      out.set(prop, value.trim().replace(/\s+/g, " "))
    }
  }
  return out
}

const SHEETS = ["tokens.ds.css", "tokens.app.css", "theme.css"].map(readStyle)
const LIGHT = new Map(SHEETS.flatMap((css) => [...declarations(css, ":root")]))
const DARK_ONLY = declarations(readStyle("theme.css"), ":root.dark")
const DARK = new Map([...LIGHT, ...DARK_ONLY])

/** A token, or a literal colour, resolved to a literal colour. */
function resolve(color: string, theme: Theme, seen: string[] = []): string {
  const ref = color.match(/^var\((--[\w-]+)\)$/)
  if (!ref) return color
  const value = (theme === "dark" ? DARK : LIGHT).get(ref[1])
  if (value === undefined) {
    throw new Error(`${ref[1]} is not defined in the ${theme} theme`)
  }
  if (seen.includes(ref[1])) throw new Error(`cycle: ${seen.join(" → ")}`)
  return resolve(value, theme, [...seen, ref[1]])
}

const lightnessOf = (oklch: string) =>
  Number(oklch.match(/^oklch\(([\d.]+)/)?.[1])

/** −200…+200 against the default ±150 domain: every integer step of both
 * ramps, the neutral zero, and the clamp beyond the domain edge. */
const STEPS = Array.from({ length: 401 }, (_, i) => i - 200)

describe("token resolution (the harness the theme checks stand on)", () => {
  it("reads the light canvas the design specifies", () => {
    expect(resolve("var(--app-canvas)", "light")).toBe("#faf9f6")
  })

  it("layers :root.dark over light, and resolves through aliases", () => {
    expect(DARK_ONLY.size).toBeGreaterThan(20)
    // --card → --surface-card-light, overridden in dark only
    expect(resolve("var(--card)", "light")).toBe("#ffffff")
    expect(resolve("var(--card)", "dark")).toBe("oklch(0.235 0.05 258)")
  })

  it("converts oklch() to sRGB per CSS Color 4", () => {
    // The spec's own reference points: sRGB red, white, black.
    expect(toRgb("oklch(0.62796 0.25768 29.2339)")).toEqual([255, 0, 0])
    expect(toRgb("oklch(1 0 0)")).toEqual([255, 255, 255])
    expect(toRgb("oklch(0 0 0)")).toEqual([0, 0, 0])
    expect(toRgb("#0a1628")).toEqual([10, 22, 40])
  })
})

describe("diverging scale contrast, both themes", () => {
  for (const theme of ["light", "dark"] as const) {
    it(`every ${theme} step clears AA 4.5:1 for its own ink`, () => {
      const failures: string[] = []
      for (const value of STEPS) {
        const cell = divergingCell(value, 150, theme)
        const background = resolve(cell.background, theme)
        const ink = resolve(cell.color, theme)
        const ratio = contrastRatio(ink, background)
        if (ratio < 4.5) {
          failures.push(
            `${value}: ${ink} on ${background} = ${ratio.toFixed(2)}`,
          )
        }
      }
      expect(failures).toEqual([])
    })
  }

  it("dark never reuses a light background — every step is its own, and dark", () => {
    const reused: number[] = []
    for (const value of STEPS.filter((v) => v !== 0)) {
      const light = divergingCell(value, 150, "light").background
      const dark = divergingCell(value, 150, "dark").background
      if (dark === light) reused.push(value)
      // Positive, not just "different": the light ramp is pale tints
      // (L ≥ 0.75) and the dark ramp must sit low, near the navy surface.
      expect(lightnessOf(light)).toBeGreaterThanOrEqual(0.75)
      expect(lightnessOf(dark)).toBeLessThanOrEqual(0.5)
    }
    expect(reused).toEqual([])
  })

  it("the neutral zero follows the canvas instead of staying pale", () => {
    const light = divergingCell(0, 150, "light")
    const dark = divergingCell(0, 150, "dark")
    expect(resolve(dark.background, "dark")).not.toBe(
      resolve(light.background, "light"),
    )
    expect(resolve(dark.background, "dark")).toBe("oklch(0.285 0.05 258)")
  })

  it("dark ink tokens exist only in dark, so light can never pick them up", () => {
    for (const token of [
      "--diff-ink-pos",
      "--diff-ink-pos-strong",
      "--diff-ink-neg",
      "--diff-ink-neg-strong",
    ]) {
      expect(DARK.has(token)).toBe(true)
      expect(LIGHT.has(token)).toBe(false)
    }
  })
})

describe("dark navy UI pairs clear AA", () => {
  // [ink, background, where it appears]
  const PAIRS: [string, string, string][] = [
    ["--text-primary-light", "--app-canvas", "body text on the canvas"],
    ["--text-primary-light", "--card", "body text on cards"],
    ["--text-primary-light", "--app-row-zebra", "table zebra rows"],
    ["--text-primary-light", "--row-highlight", "player page latest season"],
    ["--gray-500", "--card", "the ubiquitous label gray"],
    ["--gray-500", "--app-canvas", "labels on the canvas"],
    ["--gray-500", "--app-row-zebra", "labels in zebra rows"],
    ["--gray-600", "--gray-100", "freshness pill label"],
    ["--gray-600", "--card", "inactive nav tab"],
    ["--gray-700", "--gray-300", "L badge, loss form dot"],
    ["--orchid", "--card", "accent text, sort indicators"],
    ["--orchid", "--orchid-tint", "OT pill, tie badge"],
    ["--accent-secondary-ink", "--orchid-900", "active tab (solid)"],
    ["--on-emerald", "--emerald", "W badge, win form dot"],
    ["--emerald-ink", "--card", "positive readouts"],
    ["--emerald-ink", "--emerald-tint", "active filter pill"],
    ["--emerald-ink", "--emerald-tint-strong", "fresh freshness pill"],
    ["--ink-negative", "--card", "negative readouts"],
    ["--warning-ink", "--warning-tint-strong", "stale freshness pill"],
    ["--danger", "--card", "form error text"],
    ["--accent-foreground", "--accent", "menu item hover"],
  ]

  for (const [ink, background, where] of PAIRS) {
    it(`${ink} on ${background} (${where})`, () => {
      const ratio = contrastRatio(
        resolve(`var(${ink})`, "dark"),
        resolve(`var(${background})`, "dark"),
      )
      expect(ratio).toBeGreaterThanOrEqual(4.5)
    })
  }

  it("active-tab ink clears AA across the whole gradient", () => {
    const gradient = resolve("var(--tab-active-bg)", "dark")
    const stops = [...gradient.matchAll(/oklch\([^)]*\)/g)].map((m) => m[0])
    expect(stops).toHaveLength(2)
    const ink = resolve("var(--accent-secondary-ink)", "dark")
    for (const stop of stops) {
      expect(contrastRatio(ink, stop)).toBeGreaterThanOrEqual(4.5)
    }
  })

  it("light keeps the design's values for the tokens dark reuses", () => {
    expect(resolve("var(--tab-active-bg)", "light")).toBe("oklch(0.24 0.1 300)")
    expect(resolve("var(--on-emerald)", "light")).toBe("#ffffff")
  })
})
