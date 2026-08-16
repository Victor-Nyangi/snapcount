import {
  createFileRoute,
  getRouteApi,
  Outlet,
  redirect,
  useLocation,
} from "@tanstack/react-router"
import { useEffect, useRef } from "react"

import { Footer } from "@/components/Common/Footer"
import { RailScrollbarStyle } from "@/components/card-rail"
import { FreshnessPill } from "@/components/freshness-pill"
import {
  SeasonWeekPicker,
  seasonWeekSearchSchema,
} from "@/components/season-week-picker"
import { isLoggedIn } from "@/hooks/useAuth"

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
const NAV_ITEMS: { to: string; label: string }[] = [
  { to: "/week", label: "Week" },
  { to: "/standings", label: "Standings & power" },
  { to: "/leaders", label: "Leaders" },
  { to: "/team", label: "Team" },
  { to: "/player", label: "Player" },
  { to: "/explorer", label: "Explorer" },
  { to: "/history", label: "History" },
]

// Bound to this route so `Link`'s `search` prop can be typed against the
// concrete season/week schema instead of the ambiguous root-level union
// (see the matching comment in season-week-picker.tsx for why a bare
// `Link`/`useNavigate` fails to typecheck here).
const routeApi = getRouteApi("/_layout")

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
            className="flex flex-nowrap gap-1 overflow-x-auto md:flex-wrap md:overflow-visible"
          >
            {NAV_ITEMS.map((item) => {
              const isActive = pathname === item.to
              return (
                <Link
                  key={item.to}
                  // These six routes don't exist yet (later tasks add
                  // them); casting `to` past the router's typed route union
                  // is the deliberate way to link ahead of a route's file
                  // existing rather than inventing a placeholder route.
                  to={item.to as any}
                  search={(prev) => prev}
                  aria-current={isActive ? "page" : undefined}
                  style={{
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
                  }}
                >
                  {item.label}
                </Link>
              )
            })}
          </nav>

          <div className="ml-auto flex items-center" style={{ gap: 14 }}>
            <SeasonWeekPicker />
            {/* Placeholder until Task 4.1 wires GET /meta/freshness; status
                and label are both props, never hard-coded downstream of
                this call site. */}
            <FreshnessPill status="final" label="Final · updated Feb 9" />
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
