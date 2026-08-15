import "@testing-library/jest-dom/vitest"

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
