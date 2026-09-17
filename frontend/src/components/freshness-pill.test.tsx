import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { FreshnessPill } from "./freshness-pill"

describe("FreshnessPill", () => {
  it("renders whatever label it is given, not a hard-coded string", () => {
    render(<FreshnessPill status="fresh" label="Final · updated Feb 9" />)
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

  it("does not pulse the dot when fresh", () => {
    render(<FreshnessPill status="fresh" label="Up to date" />)
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

  it("uses emerald tokens for live and fresh", () => {
    render(<FreshnessPill status="live" label="Live" />)
    expect(screen.getByTestId("freshness-dot")).toHaveStyle({
      background: "var(--emerald)",
    })
    expect(screen.getByText("Live")).toHaveStyle({
      color: "var(--emerald-ink)",
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

  it("gives stale a container visually distinct from fresh's — not a green pill with orange contents", () => {
    // Round 1 fix: this is the test that would have caught the original bug
    // — checking only the label text let a mismatched (emerald) container
    // ship under a "stale" status.
    const { unmount: unmountFinal } = render(
      <FreshnessPill status="fresh" label="Up to date" />,
    )
    const finalPill = screen.getByTitle("Data freshness")
    const finalBackground = finalPill.style.background
    const finalBorderColor = finalPill.style.borderColor
    unmountFinal()

    render(<FreshnessPill status="stale" label="Stale" />)
    const stalePill = screen.getByTitle("Data freshness")

    expect(stalePill.style.background).not.toBe(finalBackground)
    expect(stalePill.style.borderColor).not.toBe(finalBorderColor)
    // Asserted on the raw inline style, not jest-dom's `toHaveStyle`
    // (which resolves via `getComputedStyle`): jsdom's computed-style color
    // resolution doesn't round-trip a `var()` border-color the way it does
    // `background`, even though the literal inline value is correct — a
    // jsdom quirk, not a real-browser one.
    expect(stalePill.style.background).toBe("var(--warning-tint-strong)")
    expect(stalePill.style.borderColor).toBe("var(--warning-tint-border)")
  })

  it("keeps live and fresh on the same (emerald) container tint", () => {
    const { unmount: unmountLive } = render(
      <FreshnessPill status="live" label="Live" />,
    )
    const livePill = screen.getByTitle("Data freshness")
    const liveBackground = livePill.style.background
    unmountLive()

    render(<FreshnessPill status="fresh" label="Up to date" />)
    expect(screen.getByTitle("Data freshness").style.background).toBe(
      liveBackground,
    )
  })

  it("renders a complete season settled and neutral — not emerald, not a warning", () => {
    render(<FreshnessPill status="complete" label="Season complete" />)
    const pill = screen.getByTitle("Data freshness")
    expect(pill.style.background).toBe("var(--muted)")
    expect(pill.style.borderColor).toBe("var(--border)")
    expect(screen.getByTestId("freshness-dot").style.background).toBe(
      "var(--muted-foreground)",
    )
    expect(screen.getByText("Season complete").style.color).toBe(
      "var(--secondary-foreground)",
    )
  })

  it("does not pulse the dot when complete", () => {
    render(<FreshnessPill status="complete" label="Season complete" />)
    expect(screen.getByTestId("freshness-dot")).not.toHaveClass(
      "snap-freshness-dot--live",
    )
  })
})
