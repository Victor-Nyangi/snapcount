import { render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import type { WeekGame } from "@/client"
import { GameCard, statusLabel } from "./game-card"

function game(overrides: Partial<WeekGame> = {}): WeekGame {
  return {
    id: "2024_15_KC_LV",
    kickoff_at: "2024-12-15T18:00:00Z",
    kickoff_label: "Sun 1:00p",
    status: "final",
    away: {
      abbr: "KC",
      nickname: "Chiefs",
      name: "Kansas City Chiefs",
      color: "#E31837",
      score: 24,
    },
    home: {
      abbr: "LV",
      nickname: "Raiders",
      name: "Las Vegas Raiders",
      color: "#000000",
      score: 17,
    },
    spread_line: -3.5,
    line_label: "LV -3.5",
    margin: -7,
    recap: null,
    ...overrides,
  }
}

/** The rendered `<span>` holding a team's nickname. */
function nameCell(nickname: string) {
  return screen.getByText(nickname, { selector: "span" }) as HTMLElement
}

describe("statusLabel", () => {
  it("spells out the four statuses the API can emit", () => {
    // The mockup only ever knows final and final/ot; a real week has the
    // other two from the moment the schedule is published.
    expect(statusLabel("final")).toBe("Final")
    expect(statusLabel("final_ot")).toBe("Final / OT")
    expect(statusLabel("live")).toBe("Live")
    expect(statusLabel("scheduled")).toBe("Scheduled")
  })
})

describe("GameCard", () => {
  it("emphasises the winner and dims the loser", () => {
    render(<GameCard game={game()} />)
    const winner = nameCell("Chiefs")
    const loser = nameCell("Raiders")
    expect(winner.style.fontWeight).toBe("800")
    expect(loser.style.fontWeight).toBe("600")
    expect(winner.style.color).toBe("inherit")
    expect(loser.style.color).toBe("var(--gray-500)")
  })

  it("tags a road win when the away team wins", () => {
    render(<GameCard game={game()} />)
    expect(screen.getByText("road win")).toBeInTheDocument()
  })

  it("tags a home win when the home team wins", () => {
    render(
      <GameCard
        game={game({
          away: { ...game().away, score: 17 },
          home: { ...game().home, score: 24 },
        })}
      />,
    )
    expect(screen.getByText("home win")).toBeInTheDocument()
  })

  it("renders an unplayed game's scores as an em-dash, never as 0", () => {
    render(
      <GameCard
        game={game({
          status: "scheduled",
          away: { ...game().away, score: null },
          home: { ...game().home, score: null },
          margin: null,
        })}
      />,
    )
    expect(screen.getAllByText("—")).toHaveLength(3) // two scores + the recap
    expect(screen.queryByText("0")).not.toBeInTheDocument()
    expect(screen.getByText("Scheduled")).toBeInTheDocument()
  })

  it("dims neither side of an unplayed game — nobody has lost yet", () => {
    // The mockup's two-way `win ? … : …` would grey out both teams here,
    // reading as though both had been beaten.
    render(
      <GameCard
        game={game({
          status: "scheduled",
          away: { ...game().away, score: null },
          home: { ...game().home, score: null },
          margin: null,
        })}
      />,
    )
    for (const nickname of ["Chiefs", "Raiders"]) {
      const cell = nameCell(nickname)
      expect(cell.style.color).toBe("inherit")
      expect(cell.style.fontWeight).toBe("600")
    }
  })

  it("carries no road/home tag before kickoff", () => {
    render(
      <GameCard
        game={game({
          status: "scheduled",
          away: { ...game().away, score: null },
          home: { ...game().home, score: null },
          margin: null,
        })}
      />,
    )
    expect(screen.queryByText(/road win|home win/)).not.toBeInTheDocument()
  })

  it("treats a tie as having no winner", () => {
    render(
      <GameCard
        game={game({
          away: { ...game().away, score: 20 },
          home: { ...game().home, score: 20 },
          margin: 0,
        })}
      />,
    )
    expect(nameCell("Chiefs").style.fontWeight).toBe("600")
    expect(nameCell("Raiders").style.fontWeight).toBe("600")
    expect(screen.queryByText(/road win|home win/)).not.toBeInTheDocument()
  })

  it("gives an overtime finish the orchid pill, a regulation one the grey", () => {
    const { rerender } = render(<GameCard game={game()} />)
    expect(screen.getByText("Final").style.background).toBe("var(--gray-100)")
    rerender(<GameCard game={game({ status: "final_ot" })} />)
    const overtime = screen.getByText("Final / OT")
    expect(overtime.style.background).toBe("var(--orchid-tint)")
    expect(overtime.style.color).toBe("var(--orchid)")
  })

  it("falls back to an em-dash for a missing recap", () => {
    const { container } = render(<GameCard game={game({ recap: null })} />)
    expect(
      within(container).getByText("—", { selector: "p" }),
    ).toBeInTheDocument()
  })

  it("renders a recap when one exists", () => {
    render(<GameCard game={game({ recap: "Kansas City pulled away late." })} />)
    expect(
      screen.getByText("Kansas City pulled away late."),
    ).toBeInTheDocument()
  })
})
