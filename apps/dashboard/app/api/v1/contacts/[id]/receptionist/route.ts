import { AppError } from "@chanlytics/contracts";
import { setPersonReplyMode } from "@chanlytics/db";
import { withRoute, memberContext, requireRole } from "@/server/with-route";
import { jsonBody, requireUuid } from "@/server/request-guards";
import { recordDecision } from "@/server/verbs";
import { takeRate } from "@/server/rate-limit";

const MODES = ["auto", "ask", "never", "inherit"] as const;
type Mode = (typeof MODES)[number];

/**
 * PUT /api/v1/contacts/:id/receptionist — { mode: auto | ask | never | inherit }
 *
 * The receptionist's mode for ONE person. "auto" answers them, "ask" holds
 * every reply for a human, "never" keeps the receptionist out of their thread
 * entirely; "inherit" removes the person's own row so the workspace policy
 * applies again. Stored as a policies row scoped to the contact — the seam
 * Session A reserved — and read by the edge on every inbound message, so it
 * takes effect on the person's next text.
 *
 * Owner-only: it changes what a real customer experiences. RLS is the floor
 * (00029 lets owners insert and delete person-scoped reply rows); the role
 * check here is the door, decided against the contact's OWN tenant.
 */
export const PUT = withRoute(async (req, ctx) => {
  await takeRate(ctx.userId, "person_mode");
  const id = requireUuid(ctx.params.id, "contact");
  const body = (await jsonBody(req)) as { mode?: unknown } | null;
  const mode = body?.mode;
  if (typeof mode !== "string" || !(MODES as readonly string[]).includes(mode)) {
    throw new AppError("validation", "Mode must be one of: auto, ask, never, inherit.");
  }

  // RLS scopes this read, so a contact the caller cannot see is a 404 rather
  // than a leak; the role is then decided against the contact's tenant.
  const { data: contact, error } = await ctx.supabase
    .from("contacts")
    .select("id, tenant_id, erased_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!contact || contact.erased_at) throw new AppError("not_found", "Contact not found.", 404);
  const member = await memberContext(ctx, contact.tenant_id);
  requireRole(member, "owner");

  const m = mode as Mode;
  await setPersonReplyMode(ctx.supabase, contact.tenant_id, id, m === "inherit" ? null : m);

  // On the ledger as what it is: silencing or un-silencing the receptionist
  // for one person, with the mode in the payload.
  await recordDecision(
    ctx,
    contact.tenant_id,
    "contact",
    id,
    m === "auto" || m === "inherit" ? "resume_agent" : "pause_agent",
    { receptionist_mode: m },
  );

  return { contact_id: id, mode: m === "inherit" ? null : m };
});
