import "server-only";

/**
 * Make it mine (decision 0079, L4): a lead's own receptionist made a workspace of the person who claims it.
 *
 *   previewForSignup  what sign-up says of a preview's link, asked by its token alone: the business's name and the
 *                     address the sender wrote to, while it can still be made theirs; else nothing, the same for a
 *                     token that names nothing. Make it mine's page draws it (app/preview/[token]/mine), and the
 *                     sign-up route asks it, for which a live link stands for an invite code (signupPostureFor)
 *   claimPreviewFor   the claim, signed in (POST preview-claims): preview_claim on the claimer's own session, then what
 *                     a first workspace's making does after its door (workspace-create.ts): the platform's notice, the
 *                     claimer's first alert address, sign-up's answers cleared. And what the preview was used for, as
 *                     the claimer's own first-run marks (previewFirstRunMarks), so its first run starts where they are
 */
import {
  AppError,
  PreviewTokenSchema,
  previewClaimable,
  previewFirstRunMarks,
  previewStateOf,
} from "@chanlytics/contracts";
import {
  claimPreview,
  leadForPreview,
  leadPreviewByToken,
  setMemberView,
  type LeadPreviewRow,
  type PreviewRefusal,
} from "@chanlytics/db";
import { linkPageDb, linkPageLookOf } from "../public/link-page";
import { notifyPlatformSignup } from "../platform/signup";
import { giveFirstAlertAddress } from "../workspace/first-alert";
import { clearPendingWorkspace } from "../workspace/workspace-create";
import { log } from "../log";
import type { RouteContext } from "../with-route";

/** The service role, where this deployment holds it: the page and sign-up know only the link. */
type Db = ReturnType<typeof linkPageDb>;

/** What sign-up says of a preview's link. */
interface PreviewForSignup {
  business: string;
  /** The address the sender wrote to, filled in on the form; the person may change it. */
  email: string | null;
}

/** A preview's row by its link, where it can still be made theirs; null for any other, or none. */
async function claimableRow(db: Db, token: string): Promise<LeadPreviewRow | null> {
  if (!db || !PreviewTokenSchema.safeParse(token).success) return null;
  const row = await leadPreviewByToken(db, token);
  return row?.preview_tenant_id && previewClaimable(previewStateOf(row, new Date())) ? row : null;
}

/** What sign-up says of a preview's link, or null where it says nothing about it. */
export async function previewForSignup(token: string): Promise<PreviewForSignup | null> {
  const db = linkPageDb();
  const row = await claimableRow(db, token);
  if (!db || !row?.preview_tenant_id) return null;
  const [look, lead] = await Promise.all([
    linkPageLookOf(db, row.preview_tenant_id),
    leadForPreview(db, row.tenant_id, row.lead_id).catch(() => null),
  ]);
  return look.business ? { business: look.business, email: lead?.email ?? null } : null;
}

/** The claim's refusal, in the door's own words: none found, someone's own already, ended, or the account's ten. */
function claimRefusalOf(reason: PreviewRefusal, message: string): AppError {
  if (reason === "not_found") return new AppError("not_found", message, 404);
  if (reason === "signed_out") return new AppError("forbidden", message, 403);
  if (reason === "taken" || reason === "ended" || reason === "limit") return new AppError("conflict", message, 409);
  return new AppError("validation", message, 400);
}

/** The preview's use, as the claimer's first-run marks. Best effort: a workspace made theirs is never undone by it. */
async function markFirstRun(ctx: RouteContext, tenantId: string, row: LeadPreviewRow | null): Promise<void> {
  const later = row ? previewFirstRunMarks(row) : [];
  if (!later.length) return;
  try {
    await setMemberView(ctx.supabase, { tenantId, page: "setup", view: { later } });
  } catch (e) {
    log.error("preview_claim_marks_failed", { tenant_id: tenantId, error: e });
  }
}

/** POST preview-claims: the preview made the claimer's own workspace, answered as /api/v1/workspaces lists one. */
export async function claimPreviewFor(ctx: RouteContext, token: string) {
  // Read before the claim, for its marks: what it was used for does not change once it is theirs.
  const used = await claimableRow(linkPageDb(), token).catch(() => null);
  const r = await claimPreview(ctx.supabase, token);
  if (!r.ok) throw claimRefusalOf(r.reason, r.message);
  const workspace = r.value;
  log.info("preview_claimed", { tenant_id: workspace.id });

  await notifyPlatformSignup(workspace.id, ctx.email ?? "", ctx.userId);
  await giveFirstAlertAddress(ctx.supabase, workspace.id, ctx.email, ctx.userId);
  await markFirstRun(ctx, workspace.id, used);
  await clearPendingWorkspace(ctx);
  return { workspace };
}
