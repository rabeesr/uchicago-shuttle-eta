import { clerkMiddleware } from "@clerk/nextjs/server";

// Every route is public by default — signed-out visitors can browse the app
// (stops, routes, map) without an account. The favorite toggles and the
// home dashboard require auth, which is enforced at the data layer via RLS
// plus client-side Clerk context.
export default clerkMiddleware();

export const config = {
  matcher: [
    // Skip Next internals and static files.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes.
    "/(api|trpc)(.*)",
  ],
};
