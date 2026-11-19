import { expect, test } from "@playwright/test"

/**
 * Light / dark navy / system. Unit tests cover the provider's logic; this
 * covers what only a real browser can show — that the class is on <html>
 * before React exists (no flash), and that a choice survives a reload.
 */

const KEY = "snapcount-ui-theme"
const SCREEN = "/leaders?season=2024"

test.describe("follows the OS by default", () => {
  test.use({ colorScheme: "dark" })

  test("OS dark, nothing stored: dark navy", async ({ page }) => {
    await page.goto(SCREEN)
    await expect(page.locator("html")).toHaveClass(/\bdark\b/)
    await expect(
      page.getByRole("button", { name: "Match system theme" }),
    ).toHaveAttribute("aria-pressed", "true")
    // The canvas really is navy, not just classed: --app-canvas in dark.
    const bg = await page.evaluate(
      () => getComputedStyle(document.body).backgroundColor,
    )
    expect(bg).toBe("oklch(0.185 0.04 258)")
  })

  test("the class is set before React mounts — no flash", async ({ page }) => {
    // Block the app bundle entirely. Only index.html's inline script can
    // have set the class now, which is the point: it runs before first
    // paint, so a dark-mode visitor never sees a white frame.
    await page.route("**/src/main.tsx*", (route) => route.abort())
    await page.route("**/assets/index-*.js", (route) => route.abort())
    await page.goto(SCREEN, { waitUntil: "domcontentloaded" })
    await expect(page.locator("html")).toHaveClass(/\bdark\b/)
    expect(await page.locator("#root").innerHTML()).toBe("")
  })

  test("a stored 'light' beats the OS, also before React", async ({ page }) => {
    await page.addInitScript(
      ([key]) => localStorage.setItem(key, "light"),
      [KEY],
    )
    await page.route("**/src/main.tsx*", (route) => route.abort())
    await page.route("**/assets/index-*.js", (route) => route.abort())
    await page.goto(SCREEN, { waitUntil: "domcontentloaded" })
    await expect(page.locator("html")).toHaveClass(/\blight\b/)
    await expect(page.locator("html")).not.toHaveClass(/\bdark\b/)
  })
})

test.describe("the header toggle", () => {
  test.use({ colorScheme: "light" })

  test("switches theme and persists across a reload", async ({ page }) => {
    await page.goto(SCREEN)
    await expect(page.locator("html")).toHaveClass(/\blight\b/)

    await page.getByRole("button", { name: "Dark theme" }).click()
    await expect(page.locator("html")).toHaveClass(/\bdark\b/)
    expect(await page.evaluate((key) => localStorage.getItem(key), KEY)).toBe(
      "dark",
    )

    await page.reload()
    await expect(page.locator("html")).toHaveClass(/\bdark\b/)
    await expect(
      page.getByRole("button", { name: "Dark theme" }),
    ).toHaveAttribute("aria-pressed", "true")

    await page.getByRole("button", { name: "Match system theme" }).click()
    await expect(page.locator("html")).toHaveClass(/\blight\b/)
  })
})
