import { clerkMiddleware } from "@clerk/nextjs/server";

/**
 * Populates the Clerk session for every request; it deliberately protects nothing.
 *
 * `auth.protect()` answers a signed-out request with an opaque 404, which is wrong for
 * both halves of this app: the deck routes are a documented JSON API that should say
 * 401, and job status/download must stay reachable by whoever holds the job UUID because
 * email-originated jobs have no Clerk user at all. So the rules live in the handlers —
 * `POST /api/decks` requires a session, and the per-job routes check ownership via
 * `canAccessJob`. The webhook route is signature-authenticated by Svix, not by Clerk.
 */
// Next 16 renamed the middleware convention to `proxy`; the behaviour is unchanged and
// Clerk 7 expects the handler here on Next 16+.
export default clerkMiddleware();

export const config = {
  matcher: [
    // Skip Next.js internals and static files (including /sw.js and the icons).
    "/((?!_next|[^?]*\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes.
    "/(api|trpc)(.*)",
  ],
};
