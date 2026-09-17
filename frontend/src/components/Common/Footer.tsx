import { FaGithub } from "react-icons/fa"

/* The template shipped FastAPI's own GitHub, X and LinkedIn here. The repo
 * link is now snapcount's; X and LinkedIn are gone rather than repointed,
 * because snapcount has no account on either and a plausible-looking guess
 * is worse than no link. Add entries here if those accounts ever exist. */
const socialLinks = [
  {
    icon: FaGithub,
    href: "https://github.com/Victor-Nyangi/snapcount",
    label: "GitHub",
  },
]

export function Footer() {
  const currentYear = new Date().getFullYear()

  return (
    <footer className="border-t py-4 px-6">
      <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
        <p className="text-muted-foreground text-sm">
          snapcount - {currentYear}
        </p>
        <div className="flex items-center gap-4">
          {socialLinks.map(({ icon: Icon, href, label }) => (
            <a
              key={label}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={label}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <Icon className="h-5 w-5" />
            </a>
          ))}
        </div>
      </div>
    </footer>
  )
}
