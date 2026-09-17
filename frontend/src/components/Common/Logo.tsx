import { Link } from "@tanstack/react-router"

import { cn } from "@/lib/utils"

interface LogoProps {
  variant?: "full" | "icon" | "responsive"
  className?: string
  asLink?: boolean
}

/* The mark is TYPE, not an image.
 *
 * This replaced the template's `fastapi-logo.svg` / `fastapi-logo-light.svg`
 * pair, which also meant carrying a light and a dark file and a `useTheme()`
 * read to pick between them. A wordmark needs neither: `data-display` is
 * theme.css's existing hook for the display face (Archivo, `--stretch-display`,
 * weight 700), and the colour is inherited from whatever the mark sits in, so
 * it follows the foreground in both themes with no second asset and no
 * per-theme branch. No new font is loaded — Archivo is already the h1/h2 face.
 *
 * Sizes are the type scale, chosen to keep the old images' boxes: `text-2xl`
 * with `leading-none` is a 24px box where the full logo was `h-6`, and the
 * monogram is centred in a `size-5` square where the icon was `size-5`.
 */

function Wordmark({ className }: { className?: string }) {
  return (
    <span
      data-display="1"
      className={cn(
        "inline-flex items-center text-2xl leading-none tracking-tight",
        className,
      )}
    >
      snapcount
    </span>
  )
}

function Monogram({ className }: { className?: string }) {
  return (
    <span
      data-display="1"
      className={cn(
        "inline-flex size-5 items-center justify-center text-lg leading-none tracking-tight",
        className,
      )}
    >
      {/* The collapsed sidebar shows two letters; screen readers still get the
       * whole name, so the link's accessible name does not change with the
       * sidebar's width. */}
      <span aria-hidden="true">sc</span>
      <span className="sr-only">snapcount</span>
    </span>
  )
}

export function Logo({
  variant = "full",
  className,
  asLink = true,
}: LogoProps) {
  const content =
    variant === "responsive" ? (
      <>
        <Wordmark
          className={cn("group-data-[collapsible=icon]:hidden", className)}
        />
        <Monogram
          className={cn(
            "hidden group-data-[collapsible=icon]:inline-flex",
            className,
          )}
        />
      </>
    ) : variant === "full" ? (
      <Wordmark className={className} />
    ) : (
      <Monogram className={className} />
    )

  if (!asLink) {
    return content
  }

  return <Link to="/">{content}</Link>
}
