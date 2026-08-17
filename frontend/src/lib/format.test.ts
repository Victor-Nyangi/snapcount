import { describe, expect, it } from "vitest"
import { formatDiff, formatPct, splitFormulaLabel } from "./format"

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

describe("splitFormulaLabel", () => {
  // Verbatim from app/api/routes/standings.py's FORMULA_LABEL.
  const LABEL =
    "0.55 × point differential per game + 0.30 × strength of schedule " +
    "+ 0.15 × win rate, scaled to 100"

  it("returns the three weighted terms without the trailing clause", () => {
    expect(splitFormulaLabel(LABEL).terms).toEqual([
      "0.55 × point differential per game",
      "0.30 × strength of schedule",
      "0.15 × win rate",
    ])
  })

  it("keeps the trailing clause out of the last term", () => {
    expect(splitFormulaLabel(LABEL).tail).toBe(", scaled to 100")
  })

  it("loses nothing: terms plus tail reconstruct the label", () => {
    const { terms, tail } = splitFormulaLabel(LABEL)
    expect(terms.join(" + ") + tail).toBe(LABEL)
  })

  it("emphasises nothing rather than wrongly splitting an unexpected shape", () => {
    expect(splitFormulaLabel("a wholly different sentence")).toEqual({
      terms: [],
      tail: "a wholly different sentence",
    })
  })

  it("handles terms with no trailing clause at all", () => {
    expect(splitFormulaLabel("one + two")).toEqual({
      terms: ["one", "two"],
      tail: "",
    })
  })
})
