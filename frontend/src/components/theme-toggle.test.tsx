import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ThemeProvider } from "./theme-provider"
import { ThemeToggle } from "./theme-toggle"

const KEY = "snapcount-ui-theme"

/** A controllable `prefers-color-scheme: dark` — jsdom has no matchMedia. */
function mockSystemDark(initial: boolean) {
  let matches = initial
  const listeners = new Set<() => void>()
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    get matches() {
      return query === "(prefers-color-scheme: dark)" ? matches : false
    },
    media: query,
    addEventListener: (_: string, cb: () => void) => listeners.add(cb),
    removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
  })) as unknown as typeof window.matchMedia
  return (next: boolean) => {
    matches = next
    for (const cb of listeners) cb()
  }
}

function renderToggle() {
  return render(
    <ThemeProvider defaultTheme="system" storageKey={KEY}>
      <ThemeToggle />
    </ThemeProvider>,
  )
}

const root = () => document.documentElement

describe("ThemeProvider + ThemeToggle", () => {
  beforeEach(() => {
    localStorage.clear()
    root().className = ""
    root().style.colorScheme = ""
  })
  afterEach(() => {
    localStorage.clear()
  })

  it("follows the OS by default, and keeps following it live", () => {
    const setSystemDark = mockSystemDark(true)
    renderToggle()

    expect(root().classList.contains("dark")).toBe(true)
    expect(root().style.colorScheme).toBe("dark")
    expect(
      screen.getByRole("button", { name: "Match system theme" }),
    ).toHaveAttribute("aria-pressed", "true")

    act(() => setSystemDark(false))
    expect(root().classList.contains("light")).toBe(true)
    expect(root().classList.contains("dark")).toBe(false)
  })

  it("an explicit choice wins over the OS and is persisted", async () => {
    mockSystemDark(true)
    renderToggle()

    await userEvent.click(screen.getByRole("button", { name: "Light theme" }))

    expect(root().classList.contains("light")).toBe(true)
    expect(root().classList.contains("dark")).toBe(false)
    expect(localStorage.getItem(KEY)).toBe("light")
    expect(screen.getByRole("button", { name: "Light theme" })).toHaveAttribute(
      "aria-pressed",
      "true",
    )
    expect(
      screen.getByRole("button", { name: "Match system theme" }),
    ).toHaveAttribute("aria-pressed", "false")
  })

  it("restores a stored choice on mount", () => {
    mockSystemDark(false)
    localStorage.setItem(KEY, "dark")
    renderToggle()

    expect(root().classList.contains("dark")).toBe(true)
    expect(screen.getByRole("button", { name: "Dark theme" })).toHaveAttribute(
      "aria-pressed",
      "true",
    )
  })

  it("ignores a stored value that is not a theme", () => {
    mockSystemDark(false)
    localStorage.setItem(KEY, "sepia")
    renderToggle()

    expect(root().classList.contains("light")).toBe(true)
    expect(
      screen.getByRole("button", { name: "Match system theme" }),
    ).toHaveAttribute("aria-pressed", "true")
  })
})
