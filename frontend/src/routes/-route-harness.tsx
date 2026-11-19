import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router"
import { render } from "@testing-library/react"
import { seasonsQueryOptions } from "@/components/season-week-picker"
import { routeTree } from "@/routeTree.gen"

/**
 * Mounts a real screen at a real URL, through the REAL generated route
 * tree — `_layout` shell, auth guard, `seasonWeekSearchSchema` and all.
 *
 * The component tests under `features/` cover pure functions and single
 * presentational components; they cannot see anything the route file owns.
 * That is where the whole of a screen's behaviour actually lives: which
 * search params exist and what they default to, what a click writes back
 * into the URL, what the query key is (and therefore what does and does
 * not refetch), and what the sorted/grouped pipeline puts on screen. All
 * of it was untested across both shipped screens.
 *
 * Going through `routeTree.gen.ts` rather than hand-registering a route is
 * the point: a screen that stopped inheriting the layout's search schema,
 * or landed at the wrong path, would still pass a hand-built harness.
 *
 * Callers must `vi.mock("@/hooks/useAuth", …)` — `_layout.beforeLoad`
 * redirects to /login otherwise — and mock whichever service their screen
 * fetches through.
 *
 * `/meta/seasons` is SEEDED EMPTY unless `fetchSeasons` is set. The shell
 * holds every screen until that query settles (it decides the default
 * season and week), so an unmocked request would stall every route test
 * on real network. Empty is the API's "no seasons" answer, which keeps the
 * schema's fallback season and week — what these tests were written
 * against. Tests ABOUT the seasons (the default, the explorer's range)
 * mock `MetaService.listSeasons` and pass `fetchSeasons: true`.
 */
export async function renderRouteAt(
  url: string,
  { fetchSeasons = false }: { fetchSeasons?: boolean } = {},
) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [url] }),
  })
  const queryClient = new QueryClient({
    // A failed query must surface as a failed assertion here, not as three
    // silent retries that time the test out.
    defaultOptions: { queries: { retry: false } },
  })
  if (!fetchSeasons) queryClient.setQueryData(seasonsQueryOptions.queryKey, [])

  const result = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return { ...result, router }
}

/** The screen's current search params, read back off the router. */
export function searchOf(router: { state: { location: { search: unknown } } }) {
  return router.state.location.search as Record<string, unknown>
}
