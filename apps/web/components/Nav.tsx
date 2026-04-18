import Link from "next/link";
import { Show, UserButton } from "@clerk/nextjs";

export default function Nav() {
  return (
    <header className="border-b border-gray-200 bg-white/80 backdrop-blur dark:border-gray-800 dark:bg-gray-950/80">
      <nav className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-semibold text-maroon">
          <span className="inline-block h-3 w-3 rounded-full bg-maroon" />
          Shuttle ETA
        </Link>
        <div className="flex items-center gap-4 text-sm">
          <Link href="/routes" className="text-gray-700 hover:text-maroon dark:text-gray-300">
            Routes
          </Link>
          <Link href="/stops" className="text-gray-700 hover:text-maroon dark:text-gray-300">
            Stops
          </Link>
          <Link href="/map" className="text-gray-700 hover:text-maroon dark:text-gray-300">
            Map
          </Link>
          <Show when="signed-out">
            <Link
              href="/sign-in"
              className="rounded bg-maroon px-3 py-1.5 font-medium text-white hover:bg-maroon-700"
            >
              Sign in
            </Link>
          </Show>
          <Show when="signed-in">
            <UserButton />
          </Show>
        </div>
      </nav>
    </header>
  );
}
