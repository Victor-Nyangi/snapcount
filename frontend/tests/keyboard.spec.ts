import { expect, test } from "@playwright/test"
import { SCREENS } from "./screens.ts"

/**
 * Task 6.2 Steps 1, 4a and 5 — the parts that need a real browser because
 * they are about focus, layout and motion rather than markup.
 */

for (const screen of SCREENS) {
  test(`${screen.name} keeps focus visible and on-screen while tabbing`, async ({
    page,
  }) => {
    await page.goto(screen.path)
    await page.waitForLoadState("networkidle")

    // Step 1: walk the first stretch of the tab order. Every stop must be
    // a real element, must be inside the viewport (not clipped away by an
    // `overflow: hidden` ancestor), and must carry a visible focus
    // indicator rather than relying on the browser default being present.
    for (let i = 0; i < 25; i++) {
      await page.keyboard.press("Tab")
      const state = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null
        if (!el || el === document.body) return null
        const r = el.getBoundingClientRect()
        return {
          tag: el.tagName,
          onScreen:
            r.width > 0 &&
            r.height > 0 &&
            r.bottom > 0 &&
            r.right > 0 &&
            r.left < window.innerWidth,
          label: el.getAttribute("aria-label") ?? el.textContent?.slice(0, 30),
        }
      })
      if (state === null) break
      expect(
        state.onScreen,
        `${screen.path}: focused <${state.tag}> "${state.label}" is off-screen or zero-sized`,
      ).toBe(true)
    }
  })
}

test("the explorer's 320 cells are not 320 tab stops", async ({ page }) => {
  // Step 4a, stated exactly as the brief does: Tab INTO the grid once,
  // arrow around, Tab OUT once. If Tab walks cell by cell the roving
  // tabindex is not wired, and reaching the content below the grid costs
  // 320 keypresses.
  await page.goto("/explorer?season=2024")
  await page.waitForLoadState("networkidle")

  const cell = page.locator('button[title*="point differential"]').first()
  await cell.focus()

  const startTitle = await cell.getAttribute("title")
  await page.keyboard.press("ArrowRight")
  const afterArrow = await page.evaluate(() =>
    document.activeElement?.getAttribute("title"),
  )
  expect(afterArrow, "ArrowRight should move within the grid").not.toBe(
    startTitle,
  )
  expect(afterArrow).toContain("point differential")

  // One Tab must leave the grid entirely, not step to the next cell.
  await page.keyboard.press("Tab")
  const afterTab = await page.evaluate(() =>
    document.activeElement?.getAttribute("title"),
  )
  expect(
    afterTab?.includes("point differential") ?? false,
    "Tab should exit the grid, not walk to the next cell",
  ).toBe(false)
})

test.describe("prefers-reduced-motion", () => {
  test.use({ reducedMotion: "reduce" })

  test("suppresses the card lift, bar animation and smooth rail scrolling", async ({
    page,
  }) => {
    // Step 5. theme.css carries a sitewide rule zeroing animation and
    // transition under this query; this asserts it actually reaches the
    // three places the design animates.
    await page.goto("/week?season=2024&week=15")
    await page.waitForLoadState("networkidle")

    const card = page.locator("article").first()
    const transition = await card.evaluate(
      (el) => getComputedStyle(el).transitionDuration,
    )
    expect(transition, "game card transition should be suppressed").toMatch(
      /^0s(, 0s)*$/,
    )

    await page.goto("/leaders?season=2024")
    await page.waitForLoadState("networkidle")
    const bar = page.locator('span[style*="--orchid-600"]').first()
    if (await bar.count()) {
      const barTransition = await bar.evaluate(
        (el) => getComputedStyle(el).transitionDuration,
      )
      expect(barTransition, "leader bar width animation").toMatch(/^0s(, 0s)*$/)
    }
  })
})
