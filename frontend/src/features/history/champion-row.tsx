import type { ChampionRow as ChampionRowData, TitleCount } from "@/client"
import { TeamChip } from "@/components/team-chip"

/**
 * The champions timeline and the most-titles summary.
 *
 * These are a PLAIN LIST, not a `StatTable`. This is reference content —
 * twenty-five seeded rows of who won what — not analysis: there is nothing
 * to sort by and nothing to compare across columns. `StatTable` would
 * bring a sticky header, sortable headers and roving-tabindex cell
 * navigation, all of which announce interactivity the content does not
 * have. Reuse is right when the semantics match; here they do not.
 */

export function TitleCountCard({ entry }: { entry: TitleCount }) {
  return (
    <div
      className="flex items-center"
      style={{
        gap: 10,
        padding: "12px 16px",
        background: "var(--card)",
        border: "1px solid var(--gray-200)",
        borderRadius: "var(--radius-md)",
        boxShadow: "var(--shadow-light-sm)",
      }}
    >
      <TeamChip
        abbr={entry.team.abbr}
        color={entry.team.color}
        name={entry.team.nickname}
        size={32}
      />
      <div>
        <div
          className="tabular"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 20,
            fontWeight: 700,
            lineHeight: 1.1,
          }}
        >
          {entry.count}
        </div>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "var(--gray-500)",
          }}
        >
          {entry.team.nickname}
        </div>
      </div>
    </div>
  )
}

export function ChampionRow({ row }: { row: ChampionRowData }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns:
          "64px 44px minmax(180px, 1fr) minmax(200px, 1.1fr)",
        gap: 12,
        alignItems: "center",
        padding: "10px 0",
        borderBottom: "1px solid var(--gray-100)",
      }}
    >
      <span
        className="tabular"
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 14,
          fontWeight: 700,
          color: "var(--gray-500)",
        }}
      >
        {row.season}
      </span>
      <TeamChip
        abbr={row.team.abbr}
        color={row.team.color}
        name={row.team.name}
        size={34}
      />
      <span style={{ fontSize: 14, fontWeight: 700 }}>{row.team.name}</span>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 12,
          color: "var(--gray-600)",
        }}
      >
        {row.result}
      </span>
    </div>
  )
}
