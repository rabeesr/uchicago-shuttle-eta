import Link from "next/link";
import { getSupabaseServer } from "@/lib/supabase-server";

export default async function Nav() {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <header className="border-b border-gray-200 bg-white/80 backdrop-blur dark:border-gray-800 dark:bg-gray-950/80">
      <nav className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-semibold text-maroon">
          <span className="inline-block h-3 w-3 rounded-full bg-maroon" />
          Shuttle ETA
        </Link>
        <div className="flex items-center gap-4 text-sm">
          <Link href="/stops" className="text-gray-700 hover:text-maroon dark:text-gray-300">
            Stops
          </Link>
          <Link href="/map" className="text-gray-700 hover:text-maroon dark:text-gray-300">
            Map
          </Link>
          {user ? (
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                className="text-gray-500 hover:text-maroon dark:text-gray-400"
              >
                Sign out
              </button>
            </form>
          ) : (
            <Link
              href="/auth"
              className="rounded bg-maroon px-3 py-1.5 font-medium text-white hover:bg-maroon-700"
            >
              Sign in
            </Link>
          )}
        </div>
      </nav>
    </header>
  );
}
