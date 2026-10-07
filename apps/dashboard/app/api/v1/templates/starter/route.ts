import { write, workspace } from "@/server/route";
import { addStarterTemplates } from "@/server/campaigns/starter-templates";

/**
 * POST /api/v1/templates/starter — the starter set, added to this workspace.
 *
 * { keys?: string[], languages?: string[], channels?: ("whatsapp" | "email" | "sms")[] } — every starter the
 * workspace is offered by default (contracts startersOffered: the proposal follow-up's only
 * where deals are on, 0006), in English by default, on every channel by default. Idempotent: a starter already on file is left as it
 * is; one the number's account already holds (a shared account, or written
 * in WhatsApp Manager) is synced in rather than refused; the rest are
 * submitted to Meta for review, exactly as a template written by hand is,
 * where WhatsApp is asked for and the workspace has a number. With none, its WhatsApp
 * version is reported skipped and its email and text versions are written all the same.
 * Owner or operator. The answer says what happened to each.
 *
 * The handle is addStarterTemplates in src/server/campaigns/starter-templates.ts: the route is its declaration (who
 * may, how often), the verb is what it does.
 */

export const POST = write({
  scope: workspace,
  role: "operator",
  rate: "settings",
  handle: ({ ctx, req, member }) => addStarterTemplates(ctx, req, member),
});

/**
 * Seven starters in two languages is up to fourteen round trips to Meta, taken
 * one at a time because `syncTemplates` below runs once for the whole batch and
 * because Meta rate-limits template creation per account. Serial is the right
 * shape; what it needs is room, which the platform default (well under a
 * minute) does not give it -- and a run killed at the ceiling loses the reply
 * describing the templates it really did submit.
 */
export const maxDuration = 60;
