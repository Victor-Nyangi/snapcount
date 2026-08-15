import { describe, expect, it } from "vitest"
import { contrastRatio, inkFor } from "./contrast"

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
