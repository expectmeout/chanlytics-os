import { heldTenantId } from "@chanlytics/contracts";
import "server-only";

/**
 * Make it mine (decision 0079, L4): a lead's own receptionist made a workspace of the person who claims it.
 *
 *   findPreviewForSignup  what sign-up says of a preview's link, asked by its token alone: the business's name, the
 *                     address the sender wrote to and what comes with it (comesWith, from its record),
 *                     while it can still be made theirs; else nothing, the same for a
 *                     token that names nothing. Make it mine's page draws it (app/preview/[token]/mine), and the
 *                     sign-up route asks it, for which a live link stands for an invite code (signupPostureFor)
 *   claimPreviewFor   the claim, signed in (POST preview-claims): preview_claim on the claimer's own session, then what
 *                     a first workspace's making does after its door (workspace/create.ts): the platform's notice, the
 *                     claimer's first alert address, sign-up's answers cleared. And what the preview was used for, as
 *                     the claimer's own first-run marks (previewFirstRunMarks), so its first run starts where they are
 */
import {
  AppError,
  PreviewTokenSchema,
  LEAD_PREVIEW_WORDS,
  formatPhoneDisplay,
  previewClaimable,
  previewKnowsOf,
  previewTheirsOf,
  previewFirstRunMarks,
  previewStateOf,
} from "@chanlytics/contracts";
import {
  claimPreview,
  findLeadForPreview,
  findLeadPreviewByToken,
  type LeadPreviewRow,
  type PreviewRefusal,
} from "@chanlytics/db/campaigns";
import { setMemberView } from "@chanlytics/db/notices";
import { linkPageDb, linkPageLookOf } from "../public/link-page";
import { previewProfileOf } from "../public/preview-page";
import { recordWorkspaceBegun } from "../workspace/create";
import { log } from "../shared/log";
import type { RouteContext } from "../shared/with-route";
import type { TenantId } from "@chanlytics/contracts";
import { logAndGoOn } from "@chanlytics/log";

/** The service role, where this deployment holds it: the page and sign-up know only the link. */
type Db = ReturnType<typeof linkPageDb>;

/** What sign-up says of a preview's link. */
interface PreviewForSignup {
  business: string;
  /** The address the sender wrote to, filled in on the form; the person may change it. */
  email: string | null;
  /** What becomes theirs with it, a line each: what it read, and what they told it. */
  comes: string[];
  /** The same as It's yours counts it, once it is theirs: how many services, how many things they told it. */
  counts: string[];
  /** What its setup will leave out for what they did on the preview (previewFirstRunMarks), in the page's words. */
  skips: string | null;
}

/** A list as a sentence's: "a, b and c". */
const asSentence = (parts: readonly string[]): string =>
  parts.length < 2 ? (parts[0] ?? "") : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;

/**
 * What comes with a preview once it is someone's own (L4), as Make it mine's page says it before they sign up: what it
 * read, counted from the rows its page shows (previewKnowsOf), then what they told it. Only what its record holds, since
 * the record is what becomes theirs: the conversation on its page and its calls are the preview's, and are not promised.
 */
function comesWith(profile: Parameters<typeof previewKnowsOf>[0], phoneDisplay: string | null): string[] {
  const words = LEAD_PREVIEW_WORDS.signup.comesRead;
  const known = new Set(
    previewKnowsOf(profile, phoneDisplay)
      .filter((row) => !row.missing)
      .map((row) => row.key),
  );
  const services = (profile?.services ?? []).filter((service) => service.name.trim()).length;
  const parts = [
    known.has("services") && services > 0 ? words.services(services) : null,
    known.has("hours") ? words.hours : null,
    known.has("address") ? words.address : null,
    known.has("phone") ? words.phone : null,
  ].filter((part): part is string => part !== null);
  const sentence = asSentence(parts);
  const taught = previewTheirsOf(profile).taught.length;
  return [
    ...(sentence ? [`${sentence[0]?.toUpperCase()}${sentence.slice(1)}`] : []),
    ...(taught > 0 ? [LEAD_PREVIEW_WORDS.signup.comesTold(taught)] : []),
  ];
}

/** What It's yours counts of what came with it: its services, and the things they told it. */
function countsOf(profile: Parameters<typeof previewKnowsOf>[0]): string[] {
  const words = LEAD_PREVIEW_WORDS.signup;
  const services = (profile?.services ?? []).filter((service) => service.name.trim()).length;
  const taught = previewTheirsOf(profile).taught.length;
  return [
    ...(services > 0 ? [words.comesRead.services(services)] : []),
    ...(taught > 0 ? [words.yours.taught(taught)] : []),
  ];
}

/** What a preview's setup will leave out once it is theirs, said by what they did on it; null where it leaves nothing. */
function skipsOf(row: LeadPreviewRow): string | null {
  const marks = previewFirstRunMarks(row);
  if (!marks.length) return null;
  return marks.length > 1 ? LEAD_PREVIEW_WORDS.signup.yours.skips.heard : LEAD_PREVIEW_WORDS.signup.yours.skips.met;
}

/** A preview's row by its link, where it can still be made theirs; null for any other, or none. */
async function claimableRow(db: Db, token: string): Promise<LeadPreviewRow | null> {
  if (!db || !PreviewTokenSchema.safeParse(token).success) return null;
  const row = await findLeadPreviewByToken(db, token);
  return row?.preview_tenant_id && previewClaimable(previewStateOf(row, new Date())) ? row : null;
}

/** What sign-up says of a preview's link, or null where it says nothing about it. */
export async function findPreviewForSignup(token: string): Promise<PreviewForSignup | null> {
  const db = linkPageDb();
  const row = await claimableRow(db, token);
  if (!db || !row?.preview_tenant_id) return null;
  const workspace = heldTenantId(row.preview_tenant_id);
  const [look, lead, profile] = await Promise.all([
    linkPageLookOf(db, workspace),
    findLeadForPreview(db, row.tenant_id, row.lead_id).catch(logAndGoOn("findLeadForPreview", null)),
    previewProfileOf(db, workspace),
  ]);
  if (!look.business) return null;
  return {
    business: look.business,
    email: lead?.email ?? null,
    comes: comesWith(profile, formatPhoneDisplay(lead?.phone_e164 ?? null)),
    counts: countsOf(profile),
    skips: skipsOf(row),
  };
}

/** The claim's refusal, in the door's own words: none found, someone's own already, ended, or the account's ten. */
function claimRefusalOf(reason: PreviewRefusal, message: string): AppError {
  if (reason === "not_found") return new AppError("not_found", message, 404);
  if (reason === "signed_out") return new AppError("forbidden", message, 403);
  if (reason === "taken" || reason === "ended" || reason === "limit") return new AppError("conflict", message, 409);
  return new AppError("validation", message, 400);
}

/** The preview's use, as the claimer's first-run marks. Best effort: a workspace made theirs is never undone by it. */
async function markFirstRun(ctx: RouteContext, tenantId: TenantId, row: LeadPreviewRow | null): Promise<void> {
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
  const result = await claimPreview(ctx.supabase, token);
  if (!result.ok) throw claimRefusalOf(result.reason, result.message);
  const workspace = result.value;
  log.info("preview_claimed", { tenant_id: workspace.id });

  // What follows every workspace made (recordWorkspaceBegun), with the first run's marks its preview earned kept on the
  // workspace (decision 0091) as well as on the claimer's own view.
  const marks = used ? previewFirstRunMarks(used) : [];
  await recordWorkspaceBegun(ctx, heldTenantId(workspace.id), {
    by: "claimed",
    notify: ctx.email ?? "",
    alertTo: ctx.email ?? null,
    marks,
  });
  await markFirstRun(ctx, heldTenantId(workspace.id), used);
  return { workspace };
}
