import type { CSSProperties } from "react"
import type { WeekGame, WeekTeamSide } from "@/client"
import { TeamChip } from "@/components/team-chip"

/**
 * One game in the week rail. 306px fixed, geometry verbatim from the
 * mockup's game card.
 *
 * The mockup only ever renders played games, so every style there is a
 * two-way `win ? … : …`. Real weeks contain scheduled games, and a game
 * nobody has played has no loser — dimming both sides would read as "both
 * teams lost". So the sides resolve to THREE outcomes, not two, and
 * `undecided` keeps the default ink at the loser's weight: nothing is
 * emphasised, nothing is greyed out as beaten.
 */

type Outcome = "won" | "lost" | "undecided"

function outcomeFor(side: number | null, other: number | null): Outcome {
  if (side === null || other === null) return "undecided"
  if (side === other) return "undecided" // a tie: neither side is the winner
  return side > other ? "won" : "lost"
}

function nameStyle(outcome: Outcome): CSSProperties {
  return {
    fontSize: 14,
    fontWeight: outcome === "won" ? 800 : 600,
    color: outcome === "lost" ? "var(--gray-500)" : "inherit",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  }
}

function scoreStyle(outcome: Outcome): CSSProperties {
  return {
    fontFamily: "var(--font-mono)",
    fontSize: 19,
    fontWeight: 700,
    color: outcome === "won" ? "inherit" : "var(--gray-400)",
  }
}

/**
 * The status pill's label. The mockup knows only `final` and `final/ot`;
 * the API also emits `scheduled` and `live`, which a real week always has.
 */
export function statusLabel(status: string): string {
  if (status === "final_ot") return "Final / OT"
  if (status === "final") return "Final"
  if (status === "live") return "Live"
  return "Scheduled"
}

function statusPillStyle(status: string): CSSProperties {
  const isOvertime = status === "final_ot"
  return {
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: "0.07em",
    textTransform: "uppercase",
    padding: "3px 8px",
    borderRadius: 999,
    whiteSpace: "nowrap",
    background: isOvertime ? "var(--orchid-tint)" : "var(--gray-100)",
    color: isOvertime ? "var(--orchid)" : "var(--gray-600)",
  }
}

function TeamRow({ side, outcome }: { side: WeekTeamSide; outcome: Outcome }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "34px 1fr auto",
        alignItems: "center",
        gap: 11,
      }}
    >
      <TeamChip
        abbr={side.abbr}
        color={side.color}
        name={side.name}
        size={34}
      />
      <span style={nameStyle(outcome)}>{side.nickname}</span>
      <span style={scoreStyle(outcome)}>
        {/* An unplayed game has no score. An em-dash, never a 0 — a 0 is a
            real result a team can be held to. */}
        {side.score ?? "—"}
      </span>
    </div>
  )
}

export function GameCard({ game }: { game: WeekGame }) {
  const awayOutcome = outcomeFor(game.away.score, game.home.score)
  const homeOutcome = outcomeFor(game.home.score, game.away.score)
  const roadWin = awayOutcome === "won"
  const decided = awayOutcome !== "undecided"

  return (
    <article
      // Hover lift has to be a class, not inline style — the mockup's
      // `style-hover` has no React equivalent. The global
      // `prefers-reduced-motion` rule in theme.css already drops the
      // transition for anyone who asks for that.
      className="transition-[transform,box-shadow] duration-[120ms] ease-out hover:-translate-y-[3px] hover:shadow-[var(--shadow-light-md)]"
      style={{
        width: 306,
        background: "var(--card)",
        border: "1px solid var(--gray-200)",
        borderRadius: "var(--radius-lg)",
        padding: 18,
        boxShadow: "var(--shadow-light-sm)",
      }}
    >
      <div
        className="flex items-center justify-between"
        style={{ marginBottom: 14 }}
      >
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            fontWeight: 500,
            color: "var(--gray-500)",
          }}
        >
          {game.kickoff_label}
        </span>
        <span style={statusPillStyle(game.status)}>
          {statusLabel(game.status)}
        </span>
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        <TeamRow side={game.away} outcome={awayOutcome} />
        <TeamRow side={game.home} outcome={homeOutcome} />
      </div>

      <div
        className="flex flex-wrap items-center"
        style={{
          marginTop: 14,
          paddingTop: 13,
          borderTop: "1px solid var(--gray-200)",
          gap: 8,
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            fontWeight: 500,
            color: "var(--gray-500)",
          }}
        >
          {game.line_label ?? "—"}
        </span>
        {/* No road/home tag before kickoff — there is no winner to tag. */}
        {decided && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: roadWin ? "var(--orchid)" : "var(--gray-500)",
            }}
          >
            {roadWin ? "road win" : "home win"}
          </span>
        )}
      </div>

      <p
        style={{
          margin: "11px 0 0",
          fontSize: 13,
          lineHeight: 1.5,
          color: "var(--gray-600)",
          textWrap: "pretty",
        }}
      >
        {/* `recap` is the one column no feed writes (plan §2: "populate it
            later"), so this is an em-dash for every real game today. The
            em-dash is the documented empty state, not a placeholder. */}
        {game.recap ?? "—"}
      </p>
    </article>
  )
}
