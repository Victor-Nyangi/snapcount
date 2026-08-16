import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { FreshnessPill } from "./freshness-pill"

describe("FreshnessPill", () => {
  it("renders whatever label it is given, not a hard-coded string", () => {
    render(<FreshnessPill status="final" label="Final · updated Feb 9" />)
    expect(screen.getByText("Final · updated Feb 9")).toBeInTheDocument()
  })

  it("renders a completely different label when told to", () => {
    render(<FreshnessPill status="live" label="Live · Q3 12:04" />)
    expect(screen.getByText("Live · Q3 12:04")).toBeInTheDocument()
    expect(screen.queryByText("Final · updated Feb 9")).not.toBeInTheDocument()
  })

  it("pulses the dot only when status is live", () => {
    render(<FreshnessPill status="live" label="Live now" />)
    expect(screen.getByTestId("freshness-dot")).toHaveClass(
      "snap-freshness-dot--live",
    )
  })

  it("does not pulse the dot when final", () => {
    render(<FreshnessPill status="final" label="Final" />)
    expect(screen.getByTestId("freshness-dot")).not.toHaveClass(
      "snap-freshness-dot--live",
    )
  })

  it("does not pulse the dot when stale", () => {
    render(<FreshnessPill status="stale" label="Stale" />)
    expect(screen.getByTestId("freshness-dot")).not.toHaveClass(
      "snap-freshness-dot--live",
    )
  })

  it("uses emerald tokens for live and final", () => {
    render(<FreshnessPill status="live" label="Live" />)
    expect(screen.getByTestId("freshness-dot")).toHaveStyle({
      background: "var(--emerald)",
    })
    expect(screen.getByText("Live")).toHaveStyle({
      color: "var(--emerald-dark)",
    })
  })

  it("swaps the dot and label ink to the warning tokens when stale", () => {
    render(<FreshnessPill status="stale" label="Stale" />)
    expect(screen.getByTestId("freshness-dot")).toHaveStyle({
      background: "var(--warning)",
    })
    expect(screen.getByText("Stale")).toHaveStyle({
      color: "var(--warning-ink)",
    })
  })

  it("declares a prefers-reduced-motion override for the pulse animation", () => {
    const { container } = render(<FreshnessPill status="live" label="Live" />)
    const styleTag = container.querySelector("style")
    expect(styleTag?.textContent).toContain("livePulse")
    expect(styleTag?.textContent).toContain("prefers-reduced-motion: reduce")
  })
})
