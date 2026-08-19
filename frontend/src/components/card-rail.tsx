import { ChevronLeft, ChevronRight } from "lucide-react"
import { Children, useCallback, useEffect, useRef, useState } from "react"

const SCROLL_AMOUNT = 644

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  )
}

const arrowButtonStyle: React.CSSProperties = {
  width: 42,
  height: 42,
  borderRadius: 10,
  border: "1px solid var(--gray-300)",
  background: "var(--white)",
  fontSize: 17,
  color: "var(--gray-700)",
  flexShrink: 0,
}

/**
 * Shared scrollbar-hiding rule for any `[data-rail]` element: the horizontal
 * card rail below, and the collapsed header nav in `_layout.tsx` at narrow
 * widths (design plan §1.13). Exported as its own component so both call
 * sites can mount the rule without duplicating it — "no new pattern is
 * introduced" for the responsive nav collapse. Harmless to render more than
 * once on the same page.
 */
export function RailScrollbarStyle() {
  return (
    <style>{`
      [data-rail]::-webkit-scrollbar { height: 0; }
      [data-rail] { scrollbar-width: none; }
    `}</style>
  )
}

/**
 * Horizontally scroll-snapped rail with two 42px arrow controls. Each child
 * is wrapped so `scroll-snap-align: start` applies without every caller
 * having to remember it.
 *
 * Two deliberate departures from the mockup (design-v2-seven-screens.html),
 * per the Task 2.3 brief:
 *  1. `scrollBy`'s `behavior` is `'auto'` under `prefers-reduced-motion`,
 *     not always `'smooth'` — the mockup hard-codes `'smooth'`.
 *  2. The arrow buttons are `disabled` at each scroll extreme
 *     (`scrollLeft <= 0` / `scrollLeft + clientWidth >= scrollWidth`); the
 *     mockup's arrows are never disabled, which strands keyboard users on a
 *     dead control at either end.
 */
export function CardRail({
  children,
  "aria-label": ariaLabel,
  prevLabel = "Scroll left",
  nextLabel = "Scroll right",
}: {
  children: React.ReactNode
  "aria-label"?: string
  prevLabel?: string
  nextLabel?: string
}) {
  const railRef = useRef<HTMLElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const updateEdges = useCallback(() => {
    const el = railRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 0)
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth)
  }, [])

  useEffect(() => {
    updateEdges()
    const el = railRef.current
    if (!el || typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(updateEdges)
    observer.observe(el)
    return () => observer.disconnect()
  }, [updateEdges])

  const scrollByAmount = (delta: number) => {
    railRef.current?.scrollBy({
      left: delta,
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    })
  }

  return (
    <div className="relative flex items-center" style={{ gap: 10 }}>
      <RailScrollbarStyle />
      <button
        type="button"
        aria-label={prevLabel}
        disabled={!canScrollLeft}
        onClick={() => scrollByAmount(-SCROLL_AMOUNT)}
        className="disabled:cursor-not-allowed disabled:opacity-40"
        style={arrowButtonStyle}
      >
        <ChevronLeft aria-hidden="true" className="mx-auto size-4" />
      </button>
      {/* `tabIndex={0}` because this is a scroll container whose children
          are not focusable — the week screen's game cards are `<article>`s.
          Without it a keyboard user can reach the two arrow buttons but
          never the region itself, so arrow-key scrolling is unavailable and
          axe reports `scrollable-region-focusable`. CI never saw this: it
          runs against an empty database, so the rail has no cards and does
          not scroll. `theme.css` already gives `[tabindex]` a focus ring. */}
      <section
        ref={railRef}
        data-rail=""
        aria-label={ariaLabel}
        onScroll={updateEdges}
        className="flex-1"
        style={{
          display: "flex",
          gap: "var(--sp-4)",
          overflowX: "auto",
          scrollSnapType: "x mandatory",
        }}
      >
        {Children.map(children, (child, i) => (
          <div key={i} style={{ scrollSnapAlign: "start", flexShrink: 0 }}>
            {child}
          </div>
        ))}
      </section>
      <button
        type="button"
        aria-label={nextLabel}
        disabled={!canScrollRight}
        onClick={() => scrollByAmount(SCROLL_AMOUNT)}
        className="disabled:cursor-not-allowed disabled:opacity-40"
        style={arrowButtonStyle}
      >
        <ChevronRight aria-hidden="true" className="mx-auto size-4" />
      </button>
    </div>
  )
}
