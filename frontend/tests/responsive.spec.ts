import { expect, test } from "@playwright/test"
import { SCREENS } from "./screens.ts"

/**
 * Task 6.2 Step 4: 375 / 768 / 1360, no horizontal BODY scroll at any
 * width on any screen.
 *
 * "No horizontal body scroll" is the specific claim, and it is not the
 * same as "nothing scrolls sideways": the explorer's grid and every
 * `StatTable` are *supposed* to scroll inside their own card. What must
 * never happen is the page itself scrolling, which is what makes a phone
 * layout feel broken. So this measures `document.documentElement`, not
 * inner containers.
 */
const WIDTHS = [375, 768, 1360]

for (const width of WIDTHS) {
  for (const screen of SCREENS) {
    test(`${screen.name} does not scroll the body at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.goto(screen.path)
      await page.waitForLoadState("networkidle")

      // Report the WIDEST offending element, not just that something
      // overflowed: "the page is 40px too wide" sends you hunting, while
      // "<nav aria-label=Primary> reaches 812px" is a fix.
      const overflow = await page.evaluate(() => {
        const doc = document.documentElement
        const guilty = [...document.querySelectorAll<HTMLElement>("*")]
          .map((el) => ({
            right: Math.round(el.getBoundingClientRect().right),
            desc:
              el.tagName.toLowerCase() +
              (el.getAttribute("aria-label")
                ? `[aria-label="${el.getAttribute("aria-label")}"]`
                : el.className && typeof el.className === "string"
                  ? `.${el.className.split(" ").slice(0, 2).join(".")}`
                  : ""),
          }))
          .filter((e) => e.right > doc.clientWidth + 1)
          .sort((a, b) => b.right - a.right)
          .slice(0, 3)
        return {
          scrollWidth: doc.scrollWidth,
          clientWidth: doc.clientWidth,
          guilty,
        }
      })
      expect(
        overflow.scrollWidth,
        `${screen.path} at ${width}px overflows by ${
          overflow.scrollWidth - overflow.clientWidth
        }px. Widest offenders: ${JSON.stringify(overflow.guilty)}`,
      ).toBeLessThanOrEqual(overflow.clientWidth)
    })
  }
}

test("the seven-item nav collapses to ONE scrollable row below md", async ({
  page,
}) => {
  // §1.13: the design replaced the sidebar with a seven-item top nav. On a
  // phone those seven items must become a horizontally scrollable single
  // row — NOT wrap to four stacked rows, which would push the page content
  // below the fold before it starts.
  await page.setViewportSize({ width: 375, height: 900 })
  await page.goto("/standings?season=2024")
  await page.waitForLoadState("networkidle")

  const nav = page.getByRole("navigation", { name: "Primary" })
  const links = nav.getByRole("link")
  await expect(links).toHaveCount(7)

  // One row: every item shares the first item's vertical position.
  const tops = await links.evaluateAll((els) =>
    els.map((el) => Math.round(el.getBoundingClientRect().top)),
  )
  expect(
    new Set(tops).size,
    `nav wrapped onto ${new Set(tops).size} rows`,
  ).toBe(1)

  // And that row scrolls rather than overflowing the page.
  const scrolls = await nav.evaluate((el) => el.scrollWidth > el.clientWidth)
  expect(scrolls, "nav should be horizontally scrollable at 375px").toBe(true)
})
