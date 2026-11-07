/**
 * The sheet's preview (Reach out, Part 4; F12, R11): the n-th business a chain over this search would write to, and its
 * email as that business would read it. Its opening is written and read by the check's own code (check.ts), and the
 * email is assembled by the sender's own (channels cold-request.ts reachOutRequest), so the preview holds what a send holds: a slot
 * that is none of the six, no subject, words no email may carry, no name to sign with, no booking link, no address
 * for the foot, a value this business lacks. Nothing is stored and nothing is sent: the email's From, its reply route
 * and its unsubscribe seal are stand-ins, and only its words come back. The whole run is checked by the check's clock
 * once the chain starts.
 */
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  REACH_OUT_PREVIEW_INDEX_MAX,
  previewSlotOf,
  slotCount,
  type ReachOutHold,
  type ReachOutSignsWith,
  type SlotLead,
} from "@chanlytics/contracts";
import { findLeadCountries } from "@chanlytics/db/leads";
import { findLeadPreview, findLeadSlots, listReachOutAudience, readReachOutRecord } from "@chanlytics/db/campaigns";
import { findMailboxConnection } from "@chanlytics/db/email";
import { type Database } from "@chanlytics/db/types";
import {
  askReachOutModel,
  checkBudget,
  checkInputOf,
  checkOne,
  checkWorkspaceOf,
  siteReaderOf,
  type AskModel,
  type CheckBudget,
} from "./check.js";
import { reachOutRequest, type RequestRefusal } from "@chanlytics/channels/email";
import { dashboardOrigin } from "../../shared/dashboard-origin.js";

type Db = SupabaseClient<Database>;

/** The furthest business the sheet may page to: a run's cap is 200 (F11); contracts' one number. */
export const PREVIEW_INDEX_MAX = REACH_OUT_PREVIEW_INDEX_MAX;
/** The preview's door has 30 s (vercel.json): its calls stop at 20 s, and each ends by 28 s. */
export const PREVIEW_LIMITS = { callsUntilMs: 20_000, doneByMs: 28_000 } as const;

export interface PreviewInput {
  tenantId: string;
  searchId: string;
  /** Which business, from the strongest fit: 0 is the first. */
  index: number;
  includeUnconfirmed: boolean;
  /** The first step's words. */
  words: { subject: string | null; body: string };
  signedBy: string | null;
  /** How the sequence ends its emails (00492, decision 0077). */
  signsWith: ReachOutSignsWith;
  /** The mailbox its first email would leave from (the first it writes from), whose signature it may end with; null: none. */
  mailboxId: string | null;
  /** The step's language (template_language): an opening's reader holds another (F5). */
  language: string;
}

export interface Preview {
  lead: { id: string; business_name: string; email: string } | null;
  subject: string | null;
  body: string | null;
  opening: string | null;
  angle: string | null;
  hold: ReachOutHold | null;
  detail: string | null;
  /** Why this email could not be written for this business, as the sender would hold or skip it; null when it can. */
  refused: RequestRefusal | null;
  /** The model could not answer: the owner may ask again. */
  unavailable: boolean;
  /** What the model cost, counted in Ask's daily budget by the door (R12); never shown. */
  tokens: { input: number; output: number };
}

// Stand-ins for what only a real send has: the preview's email is assembled, read, and dropped.
const STAND_IN = {
  // No mailbox stands behind the preview where the sequence names none: it signs with none.
  from: { address: "preview@preview.invalid", from_name: "Preview", signature: null, signature_off: true },
  origin: "https://preview.invalid",
};

/** No business to preview: past the audience's end, or a lead gone since. */
const NO_PREVIEW: Preview = {
  lead: null,
  subject: null,
  body: null,
  opening: null,
  angle: null,
  hold: null,
  detail: null,
  refused: null,
  unavailable: false,
  tokens: { input: 0, output: 0 },
};

/** The lead as the send fills its slots: a company's addressee for the person slots, where it was found (00430). */
const slotLeadOf = (
  lead: { business_name: string | null; city: string | null },
  slots: { kind: string | null; facts: unknown; source: string | null } | null,
): SlotLead => ({
  business_name: lead.business_name,
  city: lead.city,
  kind: slots?.kind ?? null,
  facts: slots?.facts ?? null,
  source: slots?.source ?? null,
});

/** Their preview as the send would read it (decision 0079), never made by a look: one not made yet waits for it. */
const previewSlotFor = async (db: Db, i: PreviewInput, leadId: string) =>
  slotCount(i.words.body, "their preview") > 0
    ? previewSlotOf(await findLeadPreview(db, i.tenantId, leadId), new Date(), dashboardOrigin())
    : null;

export async function previewOne(
  db: Db,
  previewInput: PreviewInput,
  ask: AskModel = askReachOutModel,
  budget: CheckBudget = checkBudget(Date.now(), PREVIEW_LIMITS),
): Promise<Preview> {
  const none = NO_PREVIEW;
  // The door refuses any other (a 400): never a silent clamp to a business the owner did not ask for.
  if (!Number.isInteger(previewInput.index) || previewInput.index < 0 || previewInput.index > PREVIEW_INDEX_MAX)
    throw new RangeError(`a preview's index is a whole number from 0 to ${PREVIEW_INDEX_MAX}`);
  const index = previewInput.index;
  const leads = await listReachOutAudience(db, {
    tenantId: previewInput.tenantId,
    searchId: previewInput.searchId,
    limit: index + 1,
    includeUnconfirmed: previewInput.includeUnconfirmed,
  });
  const lead = leads[index];
  if (!lead) return none;
  const [record, workspace, countries, slots, mailbox, preview] = await Promise.all([
    readReachOutRecord(db, { tenantId: previewInput.tenantId, searchId: previewInput.searchId, leadId: lead.lead_id }),
    checkWorkspaceOf(db, previewInput.tenantId),
    findLeadCountries(db, [lead.lead_id]),
    // A company's addressee, as the send fills the person slots from it (00430).
    findLeadSlots(db, previewInput.tenantId, lead.lead_id),
    // The mailbox it would leave from, this workspace's and not removed: its signature is the one the email may end with.
    previewInput.mailboxId
      ? findMailboxConnection(db, previewInput.tenantId, previewInput.mailboxId)
      : Promise.resolve(null),
    previewSlotFor(db, previewInput, lead.lead_id),
  ]);
  if (!record) return none;
  const input = {
    ...checkInputOf(
      record,
      previewInput.words,
      workspace.opening,
      previewInput.language,
      [],
      countries.get(lead.lead_id) ?? null,
    ),
    // Its website read as a send's is, so the preview's opening is the one the send would write.
    site: siteReaderOf(record.website_host),
  };
  const result = await checkOne(input, ask, budget, {
    tenantId: previewInput.tenantId,
    subjectId: lead.lead_id,
  });
  const checked = result.kind === "checked" ? result : null;
  const opening = checked?.opening?.opening ?? null;
  const otherReachOutRequest = reachOutRequest({
    tenantId: previewInput.tenantId,
    messageId: randomUUID(),
    contactId: randomUUID(),
    to: lead.email,
    words: previewInput.words,
    lead: { ...slotLeadOf(lead, slots), preview },
    workspace: {
      businessName: workspace.businessName,
      address: workspace.address,
      yourName: previewInput.signedBy,
      bookingLink: workspace.bookingLink,
    },
    opening,
    from: mailbox && mailbox.state !== "removed" ? mailbox : STAND_IN.from,
    signsWith: previewInput.signsWith,
    unsubscribe: { secret: randomUUID(), origin: STAND_IN.origin },
    parent: null,
  });
  return {
    lead: { id: lead.lead_id, business_name: lead.business_name ?? "", email: lead.email },
    subject: otherReachOutRequest.ok ? otherReachOutRequest.subject : null,
    // The words as the business reads them, with the signature under them where the email ends with one (0077).
    body: otherReachOutRequest.ok
      ? otherReachOutRequest.signature
        ? `${otherReachOutRequest.body}

${otherReachOutRequest.signature}`
        : otherReachOutRequest.body
      : null,
    opening,
    angle: checked?.opening?.angle ?? null,
    hold: checked?.hold ?? null,
    detail: checked?.detail ?? null,
    // An opening the model could not write is said as unavailable, not as a refusal of the words.
    refused:
      otherReachOutRequest.ok || (!checked && otherReachOutRequest.reason === "no_opening")
        ? null
        : otherReachOutRequest.reason,
    unavailable: !checked,
    tokens: { ...result.tokens },
  };
}
