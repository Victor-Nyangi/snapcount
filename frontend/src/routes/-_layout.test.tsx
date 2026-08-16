import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { UserPublic } from "@/client"
import { seasonWeekSearchSchema } from "@/components/season-week-picker"
import useAuth from "@/hooks/useAuth"
import { UserMenu } from "./_layout"

// `UserMenu` (round-3 fix: the top nav's only logout control, and its only
// link to /settings and /admin, replacing what AppSidebar's footer used to
// offer) calls `useAuth()` for `user`/`logout`. `useAuth` itself wraps a
// react-query `useQuery` hitting the real API, which this unit suite has no
// business calling — mock the hook module directly rather than standing up
// a query client against a live backend.
vi.mock("@/hooks/useAuth", () => ({
  default: vi.fn(),
  isLoggedIn: () => true,
}))

function mockUser(overrides: Partial<UserPublic> = {}) {
  vi.mocked(useAuth).mockReturnValue({
    user: {
      id: "1",
      email: "ada@example.com",
      full_name: "Ada Lovelace",
      is_superuser: false,
      is_active: true,
      ...overrides,
    },
    logout: vi.fn(),
    // Only `user`/`logout` are used by UserMenu; the rest of useAuth's
    // return shape isn't relevant here.
  } as any)
}

/**
 * `UserMenu` resolves `Link` via `getRouteApi("/_layout")`, so — same as
 * `season-week-picker.test.tsx` — it needs to be mounted inside a real
 * router with a route registered at id `/_layout`, not a mocked router.
 */
function renderUserMenu() {
  const rootRoute = createRootRoute()
  const layoutRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/_layout",
    validateSearch: seasonWeekSearchSchema,
    component: UserMenu,
  })
  const routeTree = rootRoute.addChildren([layoutRoute])
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ["/_layout"] }),
  })
  const queryClient = new QueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

async function openMenu() {
  const trigger = await screen.findByTestId("user-menu")
  // Radix's DropdownMenu trigger listens for real pointer events, not just
  // `click` — `fireEvent.click` alone never opens it in jsdom.
  // `user-event` simulates the full pointerdown/pointerup/click sequence.
  await userEvent.click(trigger)
  return trigger
}

describe("UserMenu", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("exposes the exact trigger the e2e suite targets", async () => {
    mockUser()
    renderUserMenu()
    expect(await screen.findByTestId("user-menu")).toBeInTheDocument()
  })

  it('renders a "Log out" menu item, matching what the e2e suite clicks', async () => {
    mockUser()
    renderUserMenu()
    await openMenu()
    expect(
      await screen.findByRole("menuitem", { name: "Log out" }),
    ).toBeInTheDocument()
  })

  it("always links to /settings", async () => {
    mockUser()
    renderUserMenu()
    await openMenu()
    expect(
      await screen.findByRole("menuitem", { name: /settings/i }),
    ).toBeInTheDocument()
  })

  it("hides the /admin link for a non-superuser", async () => {
    mockUser({ is_superuser: false })
    renderUserMenu()
    await openMenu()
    await screen.findByRole("menuitem", { name: "Log out" })
    expect(
      screen.queryByRole("menuitem", { name: /admin/i }),
    ).not.toBeInTheDocument()
  })

  it("shows the /admin link for a superuser", async () => {
    mockUser({ is_superuser: true })
    renderUserMenu()
    await openMenu()
    expect(
      await screen.findByRole("menuitem", { name: /admin/i }),
    ).toBeInTheDocument()
  })

  it("renders nothing while there is no user (e.g. auth query still loading)", () => {
    vi.mocked(useAuth).mockReturnValue({
      user: undefined,
      logout: vi.fn(),
    } as any)
    renderUserMenu()
    expect(screen.queryByTestId("user-menu")).not.toBeInTheDocument()
  })
})
