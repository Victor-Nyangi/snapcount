import { Monitor, Moon, Sun } from "lucide-react"
import type { CSSProperties } from "react"
import { type Theme, useTheme } from "@/components/theme-provider"

const OPTIONS: { value: Theme; label: string; Icon: typeof Sun }[] = [
  { value: "light", label: "Light theme", Icon: Sun },
  { value: "dark", label: "Dark theme", Icon: Moon },
  { value: "system", label: "Match system theme", Icon: Monitor },
]

/**
 * Light / dark / system, as a three-segment control in the header.
 *
 * Three buttons with `aria-pressed` inside a labelled group rather than a
 * dropdown: the current choice is visible without opening anything, and
 * each option is one click and one tab stop. The active segment wears the
 * same `--tab-active-*` tokens as the active nav tab, so in dark it is one
 * of the few things on the page that glows.
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme()

  return (
    <fieldset
      aria-label="Colour theme"
      data-testid="theme-toggle"
      className="flex items-center"
      style={{
        gap: 2,
        padding: 3,
        margin: 0,
        borderRadius: 10,
        border: "1px solid var(--gray-200)",
        background: "var(--card)",
      }}
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const active = theme === value
        const style: CSSProperties = {
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 30,
          height: 28,
          borderRadius: 7,
          border: "none",
          background: active ? "var(--tab-active-bg)" : "transparent",
          boxShadow: active ? "var(--tab-active-glow)" : "none",
          color: active ? "var(--accent-secondary-ink)" : "var(--gray-500)",
          transition:
            "background-color var(--duration-fast) var(--ease-standard), color var(--duration-fast) var(--ease-standard)",
        }
        return (
          <button
            key={value}
            type="button"
            aria-label={label}
            aria-pressed={active}
            title={label}
            onClick={() => setTheme(value)}
            style={style}
          >
            <Icon aria-hidden="true" className="size-4" />
          </button>
        )
      })}
    </fieldset>
  )
}
