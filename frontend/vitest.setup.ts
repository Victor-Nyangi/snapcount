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

// jsdom implements no scrolling at all, so `Element.scrollIntoView` is
// simply absent. `_layout`'s nav scrolls the active item into view on every
// route change, which means ANY test that mounts a real screen through the
// route tree throws `active?.scrollIntoView is not a function` inside
// <Layout> and gets the router's error boundary instead of the page.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {}
}
