import {
  createFileRoute,
  getRouteApi,
  Outlet,
  redirect,
  useLocation,
} from "@tanstack/react-router"
import { ChevronDown, LogOut, Settings, Shield, User } from "lucide-react"
import { type CSSProperties, useEffect, useRef } from "react"

import { Footer } from "@/components/Common/Footer"
import { RailScrollbarStyle } from "@/components/card-rail"
import { Freshness } from "@/components/freshness"
import {
  SeasonWeekPicker,
  seasonWeekSearchSchema,
} from "@/components/season-week-picker"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import useAuth, { isLoggedIn } from "@/hooks/useAuth"

// §1.13 of the design plan: the design has no sidebar — a single sticky top
// nav with seven items replaces the template's AppSidebar. AppSidebar /
// sidebar.tsx are intentionally left in place but unreferenced; removing
// them is a separate cleanup, out of scope here.
export const Route = createFileRoute("/_layout")({
  component: Layout,
  // Registered here (not on __root.tsx, contra the stale task-2.3 brief)
  // because this is the route every real screen — week/standings/leaders/
  // team/player/explorer/history — actually lives under. /login, /signup,
  // etc. have no use for season/week and stay outside the schema.
  validateSearch: seasonWeekSearchSchema,
  beforeLoad: async () => {
    if (!isLoggedIn()) {
      throw redirect({
        to: "/login",
      })
    }
  },
})

// Only "/" exists as a real route today (the template's dashboard, still
// mounted at `_layout/index.tsx`). The other six 404 via the root
// `notFoundComponent` until later tasks add their route files — per
// instruction, no placeholder routes are invented here to paper over that.
//
// `prefix` exists for the screens whose route takes a path param. A team
// page is `/team/$abbr`, so `/team` on its own matches no route at all and
// would 404 straight out of the nav — the link has to name a concrete
// team. Detroit is the mockup's own default (`s.teamAbbr || 'DET'`). The
// prefix then keeps the tab lit for every other team, which an exact
// pathname comparison against `/team/DET` would not do.
// Typed as the router's own path literals rather than `string`, which is
// what lets the cast below disappear: a typo in any of these is now a
// build error instead of a nav item that quietly 404s.
type NavTo =
  | "/week"
  | "/standings"
  | "/leaders"
  | "/team/$abbr"
  | "/player"
  | "/explorer"
  | "/history"

const NAV_ITEMS: { to: NavTo; label: string; prefix?: string }[] = [
  { to: "/week", label: "Week" },
  { to: "/standings", label: "Standings & power" },
  { to: "/leaders", label: "Leaders" },
  { to: "/team/$abbr", label: "Team", prefix: "/team/" },
  { to: "/player", label: "Player", prefix: "/player" },
  { to: "/explorer", label: "Explorer" },
  { to: "/history", label: "History" },
]

/** The team the nav's "Team" tab opens on — the mockup's own default
 * (`s.teamAbbr || 'DET'`), and the team this project spot-checks against
 * everywhere else (15-2, +222, power 72.8 in 2024). */
const DEFAULT_TEAM = "DET"

// Bound to this route so `Link`'s `search` prop can be typed against the
// concrete season/week schema instead of the ambiguous root-level union
// (see the matching comment in season-week-picker.tsx for why a bare
// `Link`/`useNavigate` fails to typecheck here).
const routeApi = getRouteApi("/_layout")

// The sidebar's footer (components/Sidebar/User.tsx) was the app's only
// logout control and its only link to /settings and /admin. Removing
// AppSidebar removed all three. Not reused as-is: User.tsx calls
// `useSidebar()` and renders `SidebarMenuButton`, which throws outside a
// `SidebarProvider` — reintroducing that provider just to reuse the
// component would put the sidebar back for a menu, which is the tail
// wagging the dog (the design has no sidebar, §1.13). This is the top-nav
// equivalent, built on the same shadcn `dropdown-menu` primitive.
export function UserMenu() {
  const { user, logout } = useAuth()
  const Link = routeApi.Link

  if (!user) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-testid="user-menu"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 10px",
            borderRadius: 10,
            border: "1px solid var(--gray-200)",
            background: "var(--white)",
            fontFamily: "var(--font-body)",
            fontSize: 13,
            fontWeight: 600,
            color: "var(--gray-600)",
            maxWidth: 160,
          }}
        >
          <User aria-hidden="true" className="size-4 shrink-0" />
          <span className="truncate">{user.full_name || user.email}</span>
          <ChevronDown aria-hidden="true" className="size-3.5 shrink-0" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="min-w-48">
        <DropdownMenuLabel className="truncate font-normal text-muted-foreground">
          {user.email}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/settings" search={(prev) => prev}>
            <Settings />
            Settings
          </Link>
        </DropdownMenuItem>
        {user.is_superuser && (
          <DropdownMenuItem asChild>
            <Link to="/admin" search={(prev) => prev}>
              <Shield />
              Admin
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => logout()}>
          <LogOut />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  )
}

function Layout() {
  const { pathname } = useLocation()
  const navRef = useRef<HTMLElement>(null)
  const Link = routeApi.Link

  // Below `md`, the nav becomes a horizontally scrollable single row (see
  // the `data-rail`/`md:flex-wrap` split below). Keep the active pill in
  // view when the route changes instead of leaving it scrolled off-screen.
  // `pathname` isn't read inside the effect body — it's a re-run trigger,
  // since the DOM query re-derives "active" from the freshly-rendered
  // `aria-current` attribute — so it's referenced explicitly to keep it in
  // the dependency array under exhaustive-deps.
  useEffect(() => {
    void pathname
    const active = navRef.current?.querySelector('[aria-current="page"]')
    active?.scrollIntoView({
      inline: "center",
      block: "nearest",
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    })
  }, [pathname])

  return (
    <div className="flex min-h-screen flex-col">
      <RailScrollbarStyle />
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 20,
          background: "rgb(255 255 255 / 0.97)",
          borderBottom: "1px solid var(--gray-200)",
          boxShadow: "0 1px 0 rgb(10 10 12 / 0.04)",
        }}
      >
        <div
          className="mx-auto flex flex-wrap items-center"
          style={{ maxWidth: 1360, padding: "14px 28px", gap: 28 }}
        >
          <div className="flex items-baseline" style={{ gap: 10 }}>
            <span
              data-display="1"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 26,
                fontWeight: 700,
                letterSpacing: "-0.01em",
              }}
            >
              Snapcount
            </span>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--gray-500)",
              }}
            >
              NFL analysis
            </span>
          </div>

          <nav
            ref={navRef}
            data-rail=""
            aria-label="Primary"
            // `min-w-0` is load-bearing, not tidiness. A flex item's default
            // `min-width: auto` refuses to shrink below its CONTENT, so a
            // seven-item nowrap row forced the header — and with it the
            // document — wider than a 375px viewport, giving every screen a
            // horizontally scrolling page. `overflow-x-auto` alone does not
            // help: the scroll container has to be allowed to be narrower
            // than what it scrolls. Caught by responsive.spec.ts at 375px on
            // all seven screens at once, which is what identified it as a
            // shell problem rather than a per-screen one.
            className="flex min-w-0 flex-nowrap gap-1 overflow-x-auto md:flex-wrap md:overflow-visible"
          >
            {NAV_ITEMS.map((item) => {
              const isActive = item.prefix
                ? pathname.startsWith(item.prefix)
                : pathname === item.to
              const navLinkStyle: CSSProperties = {
                fontFamily: "var(--font-body)",
                fontSize: 14,
                fontWeight: isActive ? 800 : 600,
                padding: "9px 15px",
                borderRadius: 10,
                border: `1px solid ${isActive ? "transparent" : "var(--gray-200)"}`,
                background: isActive ? "var(--orchid-900)" : "var(--white)",
                color: isActive
                  ? "var(--accent-secondary-ink)"
                  : "var(--gray-600)",
                whiteSpace: "nowrap",
              }
              // The team page is the first parameterised route, so it also
              // needs `params` — `/team` alone matches nothing and would
              // 404 straight out of the nav.
              if (item.to === "/team/$abbr") {
                return (
                  <Link
                    key={item.to}
                    to="/team/$abbr"
                    params={{ abbr: DEFAULT_TEAM }}
                    search={(prev) => prev}
                    aria-current={isActive ? "page" : undefined}
                    style={navLinkStyle}
                  >
                    {item.label}
                  </Link>
                )
              }
              // EVERY OTHER NAV TARGET IS NOW A REAL ROUTE, so the
              // `to={... as any}` escape hatch that carried this nav from
              // Task 2.3 through all of M5 is gone with the last screen it
              // was for. `to` typechecks against the router's own route
              // union again, which is what makes a typo in one of these
              // paths a build error rather than a 404 nobody clicks.
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  search={(prev) => prev}
                  aria-current={isActive ? "page" : undefined}
                  style={navLinkStyle}
                >
                  {item.label}
                </Link>
              )
            })}
          </nav>

          <div className="ml-auto flex items-center" style={{ gap: 14 }}>
            <SeasonWeekPicker />
            <Freshness />
            <UserMenu />
          </div>
        </div>
      </header>
      <main className="flex-1 p-6 md:p-8">
        <div className="mx-auto max-w-7xl">
          <Outlet />
        </div>
      </main>
      <Footer />
    </div>
  )
}
