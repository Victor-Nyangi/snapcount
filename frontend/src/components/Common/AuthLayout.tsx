import { Logo } from "@/components/Common/Logo"
import { Footer } from "./Footer"

interface AuthLayoutProps {
  children: React.ReactNode
}

export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      <div className="bg-muted dark:bg-zinc-900 relative hidden lg:flex lg:items-center lg:justify-center">
        {/* `h-16` sized the old SVG; the mark is type now, so the panel asks
         * for it on the type scale instead. */}
        <Logo variant="full" className="text-5xl" asLink={false} />
      </div>
      <div className="flex flex-col gap-4 p-6 md:p-10">
        <div className="flex justify-end" />
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-xs">{children}</div>
        </div>
        <Footer />
      </div>
    </div>
  )
}
