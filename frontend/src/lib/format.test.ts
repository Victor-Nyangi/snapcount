import { describe, expect, it } from "vitest"
import { formatDiff, formatPct } from "./format"

describe("formatPct", () => {
  it("renders win percentage without a leading zero at fixed precision 3", () => {
    expect(formatPct(0.7647058823529411)).toBe(".765")
    expect(formatPct(0.1764705882352941)).toBe(".176")
  })

  it("renders exactly zero as .000", () => {
    expect(formatPct(0)).toBe(".000")
  })

  it("renders exactly one as 1.000, with nothing stripped off a non-zero leading digit", () => {
    expect(formatPct(1)).toBe("1.000")
  })
})

describe("formatDiff", () => {
  it("always signs a non-zero differential", () => {
    expect(formatDiff(131)).toBe("+131")
    expect(formatDiff(-185)).toBe("−185") // U+2212, not a hyphen
    expect(formatDiff(0)).toBe("0")
  })

  it("uses U+2212 MINUS SIGN for negatives, not U+002D HYPHEN-MINUS", () => {
    const result = formatDiff(-1)
    expect(result[0]).toBe("−")
    expect(result[0]).not.toBe("-")
  })
})
