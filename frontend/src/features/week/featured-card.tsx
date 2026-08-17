import type { FeaturedGame } from "@/client"
import { inkFor } from "@/lib/contrast"

/**
 * A featured matchup: a full-bleed banner in the home team's color, then
 * the note and a 3-up stat grid. Geometry verbatim from the mockup.
 *
 * The mockup hard-codes every banner text colour to white (and to
 * `rgba(255,255,255,·)` for the two muted ones) because its two sample
 * banners happen to be dark. Team colour is runtime data and several teams
 * are light enough that white fails contrast, so all four text layers
 * derive from `inkFor(banner_color)` instead — plan §1.7 / §1.8. The two
 * muted layers keep the mockup's 0.82 / 0.6 opacity, which reads the same
 * way over either ink.
 */

const MUTED_EYEBROW_OPACITY = 0.82
const MUTED_JOINER_OPACITY = 0.6

export function FeaturedCard({ game }: { game: FeaturedGame }) {
  const ink = inkFor(game.banner_color)

  return (
    <article
      style={{
        background: "var(--card)",
        border: "1px solid var(--gray-200)",
        borderRadius: "var(--radius-xl)",
        overflow: "hidden",
        boxShadow: "var(--shadow-light-sm)",
      }}
    >
      <div style={{ background: game.banner_color, padding: "20px 22px 22px" }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.09em",
            textTransform: "uppercase",
            color: ink,
            opacity: MUTED_EYEBROW_OPACITY,
          }}
        >
          {game.eyebrow}
        </span>
        <div
          className="flex items-center"
          style={{ gap: 18, marginTop: 12, color: ink }}
        >
          <span
            data-display="1"
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 38,
              fontWeight: 700,
              lineHeight: 1,
            }}
          >
            {game.away_abbr}
          </span>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 13,
              opacity: MUTED_JOINER_OPACITY,
            }}
          >
            at
          </span>
          <span
            data-display="1"
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 38,
              fontWeight: 700,
              lineHeight: 1,
            }}
          >
            {game.home_abbr}
          </span>
          <span
            style={{
              marginLeft: "auto",
              fontFamily: "var(--font-mono)",
              fontSize: 26,
              fontWeight: 700,
            }}
          >
            {game.score_label}
          </span>
        </div>
      </div>

      <div style={{ padding: "20px 22px 22px" }}>
        {/* `note` is the game's own recap, which nothing writes yet (plan
            §2). The paragraph is omitted entirely rather than rendered as
            an em-dash: inside a card body an empty paragraph is just a
            gap, whereas on the game card and in the slate table the
            em-dash holds a column position that must stay aligned. */}
        {game.note && (
          <p
            style={{
              margin: "0 0 18px",
              fontSize: 15,
              lineHeight: 1.6,
              color: "var(--gray-700)",
              textWrap: "pretty",
            }}
          >
            {game.note}
          </p>
        )}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 14,
          }}
        >
          {game.stats.map((stat) => (
            <div
              key={stat.key}
              style={{
                borderLeft: "1px solid var(--gray-200)",
                paddingLeft: 12,
              }}
            >
              <div
                className="tabular"
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 23,
                  fontWeight: 700,
                  letterSpacing: "-0.01em",
                }}
              >
                {stat.value}
              </div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                  color: "var(--gray-500)",
                  marginTop: 4,
                  lineHeight: 1.35,
                }}
              >
                {stat.key}
              </div>
            </div>
          ))}
        </div>
      </div>
    </article>
  )
}
