import type { CSSProperties } from "react"
import type { PlayerSeasonRow } from "@/client"
import type { StatColumn } from "@/components/stat-table"
import { TeamChip } from "@/components/team-chip"

/**
 * The player page's season-by-season table. Widths verbatim from the
 * mockup's `grid-template-columns`.
 *
 * THE RATE COLUMN'S HEADER IS POSITION-DEPENDENT. The mockup hard-codes
 * "Y/A" for every position, which is the same global-unit mistake fixed on
 * the API side in `_metrics.py` — a running back's rate metric is yards per
 * CARRY and a receiver's is yards per TARGET. The player payload carries no
 * unit field of its own, so the header is derived here from the player's
 * position, using the same mapping the API now serves to the leaders board.
 */
const RATE_UNIT: Record<string, string> = {
  QB: "Y/A",
  RB: "Y/C",
  WR: "Y/T",
  TE: "Y/T",
}

const RATE_TITLE: Record<string, string> = {
  QB: "Yards per attempt",
  RB: "Yards per carry",
  WR: "Yards per target",
  TE: "Yards per target",
}

const monoCellStyle: CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 13,
}

export function getSeasonColumns(
  position: string,
): StatColumn<PlayerSeasonRow>[] {
  return [
    {
      key: "season",
      label: "Season",
      width: 72,
      align: "left",
      value: (row) => row.season,
      render: (row) => (
        <span style={{ ...monoCellStyle, fontWeight: 700 }}>{row.season}</span>
      ),
    },
    {
      key: "team",
      label: "Team",
      width: 96,
      align: "left",
      sticky: true,
      value: (row) => row.team_abbr,
      render: (row) => (
        <div className="flex min-w-0 items-center" style={{ gap: 8 }}>
          <TeamChip abbr={row.team_abbr} color={row.team_color} size={24} />
        </div>
      ),
    },
    {
      key: "games",
      label: "G",
      title: "Games played",
      width: 62,
      align: "right",
      value: (row) => row.games,
    },
    {
      key: "yards",
      label: "Yards",
      width: 92,
      align: "right",
      precision: 0,
      value: (row) => row.yards,
    },
    {
      key: "tds",
      label: "TD",
      title: "Touchdowns",
      width: 62,
      align: "right",
      precision: 0,
      value: (row) => row.tds,
    },
    {
      key: "rate",
      label: RATE_UNIT[position] ?? "Y/A",
      title: RATE_TITLE[position] ?? "Yards per attempt",
      width: 82,
      align: "right",
      precision: 1,
      value: (row) => row.rate,
    },
    {
      key: "epa",
      label: "EPA/play",
      title: "Expected points added per play",
      width: 92,
      align: "right",
      precision: 3,
      value: (row) => row.epa,
    },
  ]
}
