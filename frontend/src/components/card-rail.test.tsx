import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { CardRail } from "./card-rail"

function setRailDims(
  rail: HTMLElement,
  dims: { scrollLeft: number; clientWidth: number; scrollWidth: number },
) {
  Object.defineProperty(rail, "scrollLeft", {
    value: dims.scrollLeft,
    configurable: true,
  })
  Object.defineProperty(rail, "clientWidth", {
    value: dims.clientWidth,
    configurable: true,
  })
  Object.defineProperty(rail, "scrollWidth", {
    value: dims.scrollWidth,
    configurable: true,
  })
}

function mockMatchMedia(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia
}

describe("CardRail", () => {
  beforeEach(() => {
    mockMatchMedia(false)
  })

  it("renders each child wrapped so scroll-snap-align: start applies", () => {
    render(
      <CardRail aria-label="Games">
        <div>Card A</div>
        <div>Card B</div>
      </CardRail>,
    )
    expect(screen.getByText("Card A").parentElement).toHaveStyle({
      scrollSnapAlign: "start",
    })
    expect(screen.getByText("Card B").parentElement).toHaveStyle({
      scrollSnapAlign: "start",
    })
  })

  it("disables both arrows when content does not overflow the rail", () => {
    render(
      <CardRail aria-label="Games">
        <div>Card A</div>
      </CardRail>,
    )
    expect(screen.getByRole("button", { name: "Scroll left" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Scroll right" })).toBeDisabled()
  })

  it("enables only the right arrow at the start of overflowing content", () => {
    render(
      <CardRail aria-label="Games">
        <div>Card A</div>
      </CardRail>,
    )
    const rail = screen.getByRole("region", { name: "Games" })
    setRailDims(rail, { scrollLeft: 0, clientWidth: 300, scrollWidth: 1000 })
    fireEvent.scroll(rail)

    expect(screen.getByRole("button", { name: "Scroll left" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Scroll right" })).toBeEnabled()
  })

  it("enables only the left arrow once scrolled to the end", () => {
    render(
      <CardRail aria-label="Games">
        <div>Card A</div>
      </CardRail>,
    )
    const rail = screen.getByRole("region", { name: "Games" })
    setRailDims(rail, { scrollLeft: 700, clientWidth: 300, scrollWidth: 1000 })
    fireEvent.scroll(rail)

    expect(screen.getByRole("button", { name: "Scroll left" })).toBeEnabled()
    expect(screen.getByRole("button", { name: "Scroll right" })).toBeDisabled()
  })

  it("enables both arrows in the middle of overflowing content", () => {
    render(
      <CardRail aria-label="Games">
        <div>Card A</div>
      </CardRail>,
    )
    const rail = screen.getByRole("region", { name: "Games" })
    setRailDims(rail, { scrollLeft: 400, clientWidth: 300, scrollWidth: 1000 })
    fireEvent.scroll(rail)

    expect(screen.getByRole("button", { name: "Scroll left" })).toBeEnabled()
    expect(screen.getByRole("button", { name: "Scroll right" })).toBeEnabled()
  })

  it("scrolls by ±644 with smooth behavior by default", () => {
    render(
      <CardRail aria-label="Games">
        <div>Card A</div>
      </CardRail>,
    )
    const rail = screen.getByRole("region", { name: "Games" })
    setRailDims(rail, { scrollLeft: 400, clientWidth: 300, scrollWidth: 1000 })
    fireEvent.scroll(rail)
    const scrollBy = vi.fn()
    rail.scrollBy = scrollBy

    fireEvent.click(screen.getByRole("button", { name: "Scroll left" }))
    expect(scrollBy).toHaveBeenCalledWith({ left: -644, behavior: "smooth" })

    fireEvent.click(screen.getByRole("button", { name: "Scroll right" }))
    expect(scrollBy).toHaveBeenCalledWith({ left: 644, behavior: "smooth" })
  })

  it("uses 'auto' scroll behavior under prefers-reduced-motion instead of 'smooth'", () => {
    mockMatchMedia(true)
    render(
      <CardRail aria-label="Games">
        <div>Card A</div>
      </CardRail>,
    )
    const rail = screen.getByRole("region", { name: "Games" })
    setRailDims(rail, { scrollLeft: 0, clientWidth: 300, scrollWidth: 1000 })
    fireEvent.scroll(rail)
    const scrollBy = vi.fn()
    rail.scrollBy = scrollBy

    fireEvent.click(screen.getByRole("button", { name: "Scroll right" }))
    expect(scrollBy).toHaveBeenCalledWith({ left: 644, behavior: "auto" })
  })

  it("hides the rail's native scrollbar via the shared [data-rail] rule", () => {
    const { container } = render(
      <CardRail aria-label="Games">
        <div>Card A</div>
      </CardRail>,
    )
    const styleTag = container.querySelector("style")
    expect(styleTag?.textContent).toContain("[data-rail]")
    expect(styleTag?.textContent).toContain("scrollbar-width: none")
    expect(screen.getByRole("region", { name: "Games" })).toHaveAttribute(
      "data-rail",
      "",
    )
  })
})
