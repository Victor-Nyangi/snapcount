import { expect, test } from "@playwright/test"

/**
 * Task 6.2 Step 3: contrast on data text inside COLOURED cells.
 *
 * This exists because axe does not do it. On the standings screen axe's
 * `color-contrast` rule returned 0 violations, 0 passes AND 0 incomplete
 * for all 32 diverging cells — it never evaluated them at all — while the
 * weak positive half of the scale was rendering `#158055` on backgrounds
 * down to `#94e2af`, a ratio of 3.24:1 against a 4.5 requirement. An
 * axe-only suite would let exactly this regress again, so these walk the
 * real rendered pixels themselves.
 *
 * The brief predicted the STRONG end of the diverging scale and the team
 * chips as the likely failures. Both were already clean (10.92:1 / 8.77:1,
 * and 4.62:1 worst chip). It was the weak end — which nobody had measured,
 * because it looks like a pale tint rather than a "coloured cell" — that
 * was failing, in every season, on every board.
 *
 * Colours are resolved through a canvas rather than parsed in JS: the
 * tokens are `oklch()` and the browser is the only authority on how they
 * land in sRGB.
 */

/** WCAG 2.1 AA: 3:1 for large text (>=24px, or >=18.66px when bold), else 4.5:1. */
const CONTRAST_PROBE = `(() => {
  const canvas = document.createElement("canvas")
  canvas.width = canvas.height = 1
  const ctx = canvas.getContext("2d", { willReadFrequently: true })
  const toRgb = (css) => {
    ctx.clearRect(0, 0, 1, 1)
    ctx.fillStyle = "#000"
    ctx.fillStyle = css
    ctx.fillRect(0, 0, 1, 1)
    const d = ctx.getImageData(0, 0, 1, 1).data
    return [d[0], d[1], d[2]]
  }
  const chan = (v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  }
  const lum = (c) => 0.2126 * chan(c[0]) + 0.7152 * chan(c[1]) + 0.0722 * chan(c[2])
  const ratio = (a, b) => {
    const x = lum(a), y = lum(b)
    const hi = Math.max(x, y), lo = Math.min(x, y)
    return (hi + 0.05) / (lo + 0.05)
  }
  // The nearest ancestor that actually paints something.
  const backdrop = (el) => {
    for (let e = el; e; e = e.parentElement) {
      const bg = getComputedStyle(e).backgroundColor
      if (bg && bg !== "transparent" && !/rgba\\(0, 0, 0, 0\\)/.test(bg)) return bg
    }
    return "#ffffff"
  }
  return (selector) =>
    [...document.querySelectorAll(selector)]
      .filter((el) => (el.textContent || "").trim().length > 0)
      .filter((el) => el.getBoundingClientRect().width > 0)
      .map((el) => {
        const cs = getComputedStyle(el)
        const size = parseFloat(cs.fontSize)
        const weight = parseInt(cs.fontWeight, 10) || 400
        const large = size >= 24 || (size >= 18.66 && weight >= 700)
        return {
          text: (el.textContent || "").trim().slice(0, 24),
          fg: cs.color,
          bg: backdrop(el),
          size,
          weight,
          required: large ? 3 : 4.5,
          ratio: Math.round(ratio(toRgb(cs.color), toRgb(backdrop(el))) * 1000) / 1000,
        }
      })
})()`

async function measure(
  page: import("@playwright/test").Page,
  selector: string,
) {
  return page.evaluate(
    ([probe, sel]) =>
      (new Function(`return ${probe}`)() as (s: string) => unknown[])(sel) as {
        text: string
        fg: string
        bg: string
        size: number
        weight: number
        required: number
        ratio: number
      }[],
    [CONTRAST_PROBE, selector] as const,
  )
}

function assertAllPass(
  rows: {
    text: string
    fg: string
    bg: string
    size: number
    ratio: number
    required: number
  }[],
  what: string,
) {
  const failures = rows
    .filter((r) => r.ratio < r.required)
    .map(
      (r) =>
        `"${r.text}" ${r.ratio}:1 (needs ${r.required}) fg=${r.fg} bg=${r.bg} ${r.size}px`,
    )
  expect(
    failures,
    `${what}: ${failures.length} of ${rows.length} below AA`,
  ).toEqual([])
}

test("every diverging cell on the standings board clears AA", async ({
  page,
}) => {
  await page.goto("/standings?season=2024")
  await page.waitForLoadState("networkidle")

  const cells = await measure(page, "span.tabular.inline-block")
  // Guard against the assertion passing because nothing rendered — this
  // suite runs against a database that CI has to seed, and an empty board
  // would make every check below vacuous.
  expect(cells.length, "no diverging cells rendered").toBeGreaterThan(20)
  // Both signs must be present, or a one-sided board hides half the scale.
  expect(
    cells.some((c) => c.text.startsWith("+")),
    "no positive cells",
  ).toBe(true)
  expect(
    cells.some((c) => c.text.startsWith("−")),
    "no negative cells",
  ).toBe(true)

  assertAllPass(cells, "diverging cells")
})

test("the freshness pill clears AA in all three of its states", async ({
  page,
}) => {
  // Driven through the API rather than whatever the database happens to
  // report: the emerald states are the failing ones, and on a stale
  // database they never render at all. This is how the original 4.43:1
  // reached CI as a RACE — four screens caught the pill mid-"Checking…"
  // and three did not.
  for (const [status, label] of [
    ["live", "Live · updated just now"],
    ["final", "Final · updated Aug 17"],
    ["stale", "Stale · updated Aug 16"],
  ]) {
    await page.route("**/api/v1/meta/freshness*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ status, label, last_ingested_at: null }),
      }),
    )
    await page.goto("/standings?season=2024")
    await page.waitForLoadState("networkidle")
    await expect(page.getByText(label)).toBeVisible()

    const pill = await measure(page, '[title="Data freshness"] span')
    expect(
      pill.length,
      `${status} pill did not render its label`,
    ).toBeGreaterThan(0)
    assertAllPass(pill, `freshness pill (${status})`)
  }
})

test("the active filter pills clear AA", async ({ page }) => {
  await page.goto("/explorer?season=2024")
  await page.waitForLoadState("networkidle")

  const pills = await measure(page, 'button[data-state="on"]')
  expect(pills.length, "no active filter pill rendered").toBeGreaterThan(0)
  assertAllPass(pills, "active filter pills")
})
