import Link from "next/link";
import { Show, UserButton } from "@clerk/nextjs";

const navLinks = [
  { href: "/", label: "Home" },
  { href: "/routes", label: "Routes" },
  { href: "/stops", label: "Stops" },
  { href: "/map", label: "Map" },
];

export default function Nav() {
  return (
    <header className="sticky top-0 z-50 border-b border-gray-200 bg-white">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/" className="text-lg font-bold tracking-tight text-gray-900">
          <span aria-hidden>🚌</span> ShuttleETA
        </Link>
        <div className="flex items-center gap-1 text-sm">
          {navLinks.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-lg px-2.5 py-1.5 font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
            >
              {l.label}
            </Link>
          ))}
          <span className="mx-2 h-6 w-px bg-gray-200" aria-hidden />
          <Show when="signed-out">
            <Link
              href="/sign-in"
              className="rounded-lg bg-gray-900 px-3 py-1.5 font-medium text-white hover:bg-gray-800"
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
