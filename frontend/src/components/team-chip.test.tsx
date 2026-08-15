/// <reference types="@testing-library/jest-dom/vitest" />
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { TeamChip } from "./team-chip"

describe("TeamChip", () => {
  it("renders the abbreviation on the team color", () => {
    render(<TeamChip abbr="BUF" color="#00338D" />)
    const chip = screen.getByText("BUF")
    expect(chip).toHaveStyle({ background: "#00338D" })
  })

  it("flips ink to near-black on a light team color", () => {
    render(<TeamChip abbr="TEN" color="#4B92DB" />)
    expect(screen.getByText("TEN")).toHaveStyle({ color: "#0A0A0C" })
  })

  it("exposes the full team name to assistive tech", () => {
    render(<TeamChip abbr="BUF" color="#00338D" name="Buffalo Bills" />)
    expect(screen.getByLabelText("Buffalo Bills")).toBeInTheDocument()
  })
})
