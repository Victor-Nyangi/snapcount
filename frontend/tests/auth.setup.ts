import { test as setup } from "@playwright/test"
import { firstSuperuser, firstSuperuserPassword } from "./config.ts"

const authFile = "playwright/.auth/user.json"

setup("authenticate", async ({ page }) => {
  await page.goto("/login")
  await page.getByTestId("email-input").fill(firstSuperuser)
  await page.getByTestId("password-input").fill(firstSuperuserPassword)
  await page.getByRole("button", { name: "Log In" }).click()
  // Routes under `_layout` carry a `validateSearch`-defaulted season/week
  // query string (Task 2.3), so the post-login URL is "/?season=...&week=...",
  // never a bare "/". Match on pathname, not the exact URL string.
  await page.waitForURL((url) => url.pathname === "/")
  await page.context().storageState({ path: authFile })
})
