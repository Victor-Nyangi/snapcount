import { useQuery } from "@tanstack/react-query"
import { MetaService } from "@/client"
import { FreshnessPill } from "@/components/freshness-pill"
import { useSeasonWeek } from "@/components/season-week-picker"

/**
 * The header's freshness pill, wired to `GET /meta/freshness`.
 *
 * It had been hard-coded to `status="final" label="Final · updated Feb 9"`
 * since Task 2.3 — the mockup's literal sample text, behind a comment
 * reading "Placeholder until Task 4.1 wires GET /meta/freshness". Task 4.1
 * built the endpoint (live / final / stale, with the label fully formed
 * server-side) but the call site was never changed, so the app claimed its
 * data was current on a fixed February date no matter what the database
 * actually held.
 *
 * TASK 6.1 STEP 3: a failed request must never leave this pill claiming the
 * data is current. So an error resolves to `stale`, not to the last good
 * value and not to a hopeful default — if we cannot reach the API we cannot
 * know how fresh the data is, and "stale" is the only honest answer.
 */
export function Freshness() {
  const { season } = useSeasonWeek()

  const { data, isError } = useQuery({
    queryKey: ["freshness", season],
    queryFn: async () =>
      (await MetaService.freshness({ query: { season } })).data,
    // The whole point of the pill is to age; refetch so it does not sit on
    // a value that was true when the tab was opened an hour ago.
    refetchInterval: 60_000,
  })

  if (isError || !data) {
    return (
      <FreshnessPill
        status={isError ? "stale" : "final"}
        label={isError ? "Freshness unknown" : "Checking…"}
      />
    )
  }

  return (
    <FreshnessPill
      status={data.status as "live" | "final" | "stale"}
      label={data.label}
    />
  )
}
