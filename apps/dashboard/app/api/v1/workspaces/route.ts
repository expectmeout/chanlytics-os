import { read, write, account, workspace } from "@/server/route";
import { readWorkspaces, patchWorkspace } from "@/server/workspace/workspace-list";

/**
 * GET /api/v1/workspaces — the session's tenants, RLS-scoped, plus who is
 * actually signed in.
 *
 * The identity rides along here rather than in its own /me route because the
 * seam already fetches this at boot: the sidebar was hardcoding "Sarah Chen ·
 * sales@chanlytics.com" from the mockup, which is a fabricated person shown as
 * *you* on every page — and it sat one inch from data we spent the whole
 * project making honest.
 *
 * Declared on the account: this is the endpoint whose whole job is answering
 * "where am I", so it must answer for an account in no workspace yet, and it
 * chooses the active workspace itself, below, by memberContext's one rule
 * with the one degradation that keeps a stale preference from bricking the
 * app.
 *
 * The handle is readWorkspaces in src/server/workspace/workspace-list.ts: the route is its declaration (who may, how
 * often), the verb is what it does.
 */
export const GET = read({
  scope: account,
  handle: ({ ctx, req }) => readWorkspaces(ctx, req),
});

/**
 * PATCH /api/v1/workspaces — {timezone?, appointment_word?}, at least one. Owner-only,
 * and no bucket, said out loud: each is set once and read forever.
 *
 * The two fields on the tenant row a business owns rather than Chanlytics: the
 * zone its day is measured in, and what it calls a booking (0041 J4, 00458),
 * which changes words and nothing else. How its customers buy (0008) is no longer
 * asked: every workspace has deals. Name, slug and status stay concierge
 * operations -- a slug is a URL and a status is a billing state -- and the
 * column grant (00084, 00458) enforces that regardless of what this route asks
 * for. Only what was sent is written, and only what was written is read back,
 * so a zone saved on a database 00458 has not reached still saves.
 *
 * The handle is patchWorkspace in src/server/workspace/workspace-list.ts: the route is its declaration (who may, how
 * often), the verb is what it does.
 */
export const PATCH = write({
  scope: workspace,
  role: "partner",
  rate: null,
  handle: ({ ctx, req, member }) => patchWorkspace(ctx, req, member),
});
