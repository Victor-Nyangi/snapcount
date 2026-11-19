import { describe, expect, it } from "vitest"
import { divergingCell } from "./diverging"

describe("divergingCell", () => {
  it("returns the neutral pair at exactly zero", () => {
    expect(divergingCell(0)).toEqual({
      background: "var(--gray-100)",
      color: "var(--gray-600)",
    })
  })

  it("scales a strong positive toward emerald with strong ink", () => {
    // mag = 131/150 = 0.873333 -> L 0.97-0.19213 = 0.77787, C 0.04+0.10480 = 0.14480
    expect(divergingCell(131)).toEqual({
      background: "oklch(0.7779 0.1448 155)",
      color: "var(--accent-primary-ink)",
    })
  })

  it("uses mid ink below the 0.55 magnitude threshold", () => {
    // mag = 30/150 = 0.2 -> L 0.926, C 0.064
    expect(divergingCell(30)).toEqual({
      background: "oklch(0.926 0.064 155)",
      color: "var(--emerald-ink)",
    })
  })

  it("saturates at the domain edge for negatives", () => {
    // |-185|/150 clamps to 1 -> L 0.77, C 0.17, hue 25
    expect(divergingCell(-185)).toEqual({
      background: "oklch(0.77 0.17 25)",
      color: "var(--ink-negative-strong)",
    })
  })

  it("normalises other signed quantities onto the same ±150 domain", () => {
    // EPA/play of +0.201 against a ±0.30 domain == the same visual weight as +100.5 points
    expect(divergingCell(0.201, 0.3)).toEqual(divergingCell(100.5))
  })
})

describe("divergingCell, dark navy ramp", () => {
  it("defaults to the light ramp, so existing callers are unchanged", () => {
    expect(divergingCell(131)).toEqual(divergingCell(131, 150, "light"))
  })

  it("starts near the navy surface and climbs in lightness and chroma", () => {
    // mag = 30/150 = 0.2 -> L 0.28+0.04 = 0.32, C 0.04+0.02 = 0.06
    expect(divergingCell(30, 150, "dark")).toEqual({
      background: "oklch(0.32 0.06 155)",
      color: "var(--diff-ink-pos)",
    })
    // clamps at 1 -> L 0.46, C 0.175, hue 25, strong ink
    expect(divergingCell(-185, 150, "dark")).toEqual({
      background: "oklch(0.46 0.175 25)",
      color: "var(--diff-ink-neg-strong)",
    })
  })

  it("keeps the neutral zero on tokens, which theme.css redefines for dark", () => {
    expect(divergingCell(0, 150, "dark")).toEqual(divergingCell(0))
  })
})
