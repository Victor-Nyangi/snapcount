import { configure } from "@testing-library/react"
import "@testing-library/jest-dom/vitest"

// Testing Library's default `findBy*` / `waitFor` budget is 1000ms, which
// the route-level tests outgrew: each mounts the whole app shell and waits
// on a react-query round-trip, and with eighteen files running in parallel
// the first assertion in a file can lose that race on a loaded machine.
// The symptom is a flaky "Unable to find …" on whichever test happens to
// start first, not a real failure. Raising the ceiling costs nothing when
// things resolve promptly — the wait ends as soon as the condition holds.
configure({ asyncUtilTimeout: 5000 })

// jsdom has no ResizeObserver; Radix's Tooltip/Popper primitives (used by
// any table with a sortable, titled column, among others) call it as soon
// as their trigger opens on hover or keyboard focus, so any test that
// focuses/hovers one crashes with an uncaught ReferenceError without this.
if (typeof ResizeObserver === "undefined") {
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

// jsdom implements no scrolling at all, so `Element.scrollIntoView` is
// simply absent. `_layout`'s nav scrolls the active item into view on every
// route change, which means ANY test that mounts a real screen through the
// route tree throws `active?.scrollIntoView is not a function` inside
// <Layout> and gets the router's error boundary instead of the page.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {}
}

// jsdom implements no Pointer Capture API either. Radix's `Select` calls
// all three while deciding whether a pointerdown became a drag, so its
// listbox never opens in a test without them — which reads as "the option
// isn't there" rather than "the dropdown didn't open".
for (const method of [
  "hasPointerCapture",
  "setPointerCapture",
  "releasePointerCapture",
] as const) {
  if (!Element.prototype[method]) {
    Element.prototype[method] = (() => false) as never
  }
}
