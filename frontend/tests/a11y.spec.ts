import AxeBuilder from "@axe-core/playwright"
import { expect, test } from "@playwright/test"
import { SCREENS } from "./screens.ts"

/**
 * Task 6.2 Step 2: axe on every route, expecting zero violations, fixing
 * rather than suppressing.
 *
 * Run through Playwright rather than `@axe-core/cli` because every screen
 * is behind the login guard — the CLI would scan the login page seven
 * times and report a clean bill of health for pages it never saw.
 */
for (const screen of SCREENS) {
  test(`${screen.name} has no axe violations`, async ({ page }) => {
    await page.goto(screen.path)
    // Wait for real content, not just navigation: axe on a skeleton
    // screen tests the skeleton.
    await page.waitForLoadState("networkidle")

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze()

    // Name the offending rules in the failure, so a red run says what is
    // wrong instead of just how many things are.
    const summary = results.violations.map(
      (v) => `${v.id} (${v.impact}, ${v.nodes.length} nodes): ${v.help}`,
    )
    expect(summary, `axe violations on ${screen.path}`).toEqual([])
  })
}
