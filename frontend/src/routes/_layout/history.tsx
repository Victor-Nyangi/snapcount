import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useMemo } from "react"
import type { ChampionRow as ChampionRowData } from "@/client"
import { HistoryService } from "@/client"
import { ChampionRow, TitleCountCard } from "@/features/history/champion-row"
import { DynastyCard } from "@/features/history/dynasty-card"

export const Route = createFileRoute("/_layout/history")({
  component: HistoryScreen,
  head: () => ({
    meta: [{ title: "Champions & history - Snapcount" }],
  }),
})

const DECADES = [2020, 2010, 2000] as const

/**
 * Grouped on the SEASON, not the calendar year the game was played in — a
 * Super Bowl is played the February after its season, so the 2024 champion
 * lifted the trophy in 2025. Reading the trophy year would move five
 * entries into the wrong decade section.
 *
 * The seeded reference data covers seasons 2000–2024, so the 2000s and
 * 2010s hold ten entries each and the 2020s holds five. (Task 5.8's
 * Step 4 says the 2000s holds five; that contradicts the filter the same
 * step specifies, and the live payload gives ten.)
 */
export function championsByDecade(
  champions: ChampionRowData[],
  start: number,
): ChampionRowData[] {
  return champions
    .filter((c) => c.season >= start && c.season < start + 10)
    .sort((a, b) => b.season - a.season)
}

function HistoryScreen() {
  const { data } = useQuery({
    queryKey: ["history"],
    queryFn: async () => (await HistoryService.champions()).data,
  })

  const champions = useMemo(() => data?.champions ?? [], [data])

  return (
    <div>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.09em",
          textTransform: "uppercase",
          color: "var(--orchid)",
        }}
      >
        2000–2024
      </div>
      <h1
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "var(--text-h1-app)",
          lineHeight: 1.05,
          fontWeight: 700,
          margin: "8px 0 0",
          letterSpacing: "-0.02em",
        }}
      >
        Champions &amp; history
      </h1>
      <p
        style={{
          margin: "10px 0 24px",
          fontSize: 16,
          lineHeight: 1.6,
          color: "var(--gray-600)",
          maxWidth: "62ch",
          textWrap: "pretty",
        }}
      >
        Twenty-five seasons of champions, who won most, and the runs that lasted
        long enough to be called something.
      </p>

      <div className="flex flex-wrap" style={{ gap: 12, marginBottom: 28 }}>
        {(data?.most_titles ?? []).map((entry) => (
          <TitleCountCard key={entry.team.abbr} entry={entry} />
        ))}
      </div>

      <div className="grid gap-5 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div style={{ display: "grid", gap: 20 }}>
          {DECADES.map((start) => {
            const rows = championsByDecade(champions, start)
            if (rows.length === 0) return null
            return (
              <section
                key={start}
                style={{
                  background: "var(--card)",
                  border: "1px solid var(--gray-200)",
                  borderRadius: "var(--radius-lg)",
                  padding: "20px 22px",
                  boxShadow: "var(--shadow-light-sm)",
                }}
              >
                <h2
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 26,
                    fontWeight: 700,
                    margin: "0 0 10px",
                  }}
                >
                  {start}s
                </h2>
                {rows.map((row) => (
                  <ChampionRow key={row.season} row={row} />
                ))}
              </section>
            )
          })}
        </div>

        <div>
          <h2
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 26,
              fontWeight: 700,
              margin: "0 0 12px",
            }}
          >
            Dynasty runs
          </h2>
          <div style={{ display: "grid", gap: 14 }}>
            {(data?.dynasties ?? []).map((row) => (
              <DynastyCard key={row.label} row={row} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
