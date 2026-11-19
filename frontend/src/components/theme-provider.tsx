import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react"

export type Theme = "dark" | "light" | "system"
export type ResolvedTheme = "dark" | "light"

type ThemeProviderProps = {
  children: React.ReactNode
  defaultTheme?: Theme
  storageKey?: string
}

type ThemeProviderState = {
  theme: Theme
  resolvedTheme: ResolvedTheme
  setTheme: (theme: Theme) => void
}

const initialState: ThemeProviderState = {
  theme: "system",
  resolvedTheme: "light",
  setTheme: () => null,
}

const ThemeProviderContext = createContext<ThemeProviderState>(initialState)

const DARK_QUERY = "(prefers-color-scheme: dark)"

function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark" || value === "system"
}

/** Storage can throw (private windows, blocked site data); never fatal. */
function readStoredTheme(storageKey: string): Theme | null {
  try {
    const stored = window.localStorage.getItem(storageKey)
    return isTheme(stored) ? stored : null
  } catch {
    return null
  }
}

function systemPrefersDark(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia(DARK_QUERY).matches
  )
}

function applyTheme(resolved: ResolvedTheme) {
  const root = window.document.documentElement
  root.classList.remove("light", "dark")
  root.classList.add(resolved)
  root.style.colorScheme = resolved
}

/**
 * Light, dark navy, or follow the OS — "system" is the default.
 *
 * The app shipped light-only until the dark navy pass: the diverging
 * differential scale's L 0.75-0.97 tints were unreadable on a dark canvas
 * (nfl-implemnentation2.md §1.2). That is now answered by a separate dark
 * ramp in lib/diverging.ts, and the palette lives in the `:root.dark` block
 * of styles/theme.css. See theme.css §1.2 for the full decision.
 *
 * This provider is the SECOND writer of the `.light`/`.dark` class on
 * <html>. The first is the inline script in index.html, which runs before
 * any CSS or React and must agree with this file on two things: the
 * storage key (`snapcount-ui-theme`, passed from main.tsx) and the rule
 * "stored light/dark wins, otherwise follow prefers-color-scheme". If they
 * disagree, the page flashes one theme and then switches.
 *
 * Components that compute colour in JS (the diverging cells) read
 * `resolvedTheme`, which is always "light" or "dark", never "system".
 */
export function ThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = "vite-ui-theme",
  ...props
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(
    () => readStoredTheme(storageKey) ?? defaultTheme,
  )
  const [systemDark, setSystemDark] = useState(systemPrefersDark)

  // Follow OS changes live: someone on "system" whose OS flips to dark at
  // sunset should see the app flip with it, without a reload.
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return
    const mediaQuery = window.matchMedia(DARK_QUERY)
    const handleChange = () => setSystemDark(mediaQuery.matches)
    mediaQuery.addEventListener("change", handleChange)
    return () => mediaQuery.removeEventListener("change", handleChange)
  }, [])

  const resolvedTheme: ResolvedTheme =
    theme === "system" ? (systemDark ? "dark" : "light") : theme

  useEffect(() => {
    applyTheme(resolvedTheme)
  }, [resolvedTheme])

  const setTheme = useCallback(
    (next: Theme) => {
      try {
        window.localStorage.setItem(storageKey, next)
      } catch {
        // Not persisted this time; the choice still applies to this visit.
      }
      setThemeState(next)
    },
    [storageKey],
  )

  const value = useMemo(
    () => ({ theme, resolvedTheme, setTheme }),
    [theme, resolvedTheme, setTheme],
  )

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  )
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext)

  if (context === undefined)
    throw new Error("useTheme must be used within a ThemeProvider")

  return context
}
