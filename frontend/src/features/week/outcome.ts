import type { WeekGame } from "@/client"

/**
 * How one side of a game finished, for every surface that dims the beaten
 * team — the rail's `GameCard` and the full slate's team cells.
 *
 * The mockup expresses this as a two-way `win ? … : …` because its sixteen
 * games are invented and every one of them was played and decided. Real
 * weeks contain games nobody has played yet, and the backfill contains ten
 * real ties (all `final_ot`, e.g. 2025 week 4, GB 40 at DAL 40). A two-way
 * ternary calls both sides of those games losers and greys them both out,
 * which reads as "both teams lost".
 *
 * So there are THREE outcomes, and `undecided` is styled as neither: it
 * keeps the default ink and the loser's weight, so nothing is emphasised
 * and nothing is greyed out as beaten.
 */
export type Outcome = "won" | "lost" | "undecided"

export function outcomeFor(side: number | null, other: number | null): Outcome {
  if (side === null || other === null) return "undecided" // unplayed
  if (side === other) return "undecided" // a tie: neither side is the winner
  return side > other ? "won" : "lost"
}

/** Both sides of a game at once, in `[away, home]` order. */
export function outcomesFor(game: WeekGame): [Outcome, Outcome] {
  return [
    outcomeFor(game.away.score, game.home.score),
    outcomeFor(game.home.score, game.away.score),
  ]
}
