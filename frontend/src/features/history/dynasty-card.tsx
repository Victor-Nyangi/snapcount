import type { DynastyRow } from "@/client"
import { TeamChip } from "@/components/team-chip"

export function DynastyCard({ row }: { row: DynastyRow }) {
  return (
    <div
      style={{
        background: "var(--card)",
        border: "1px solid var(--gray-200)",
        borderRadius: "var(--radius-lg)",
        padding: 18,
        boxShadow: "var(--shadow-light-sm)",
      }}
    >
      <div className="flex items-center" style={{ gap: 12 }}>
        <TeamChip abbr={row.team.abbr} color={row.team.color} size={38} />
        <div>
          <div style={{ fontSize: 15, fontWeight: 800 }}>{row.label}</div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "var(--emerald-dark)",
              marginTop: 2,
            }}
          >
            {row.titles} {row.titles === 1 ? "title" : "titles"}
          </div>
        </div>
      </div>
      <p
        style={{
          margin: "12px 0 0",
          fontSize: 13.5,
          lineHeight: 1.55,
          color: "var(--gray-600)",
          textWrap: "pretty",
        }}
      >
        {row.note}
      </p>
    </div>
  )
}
