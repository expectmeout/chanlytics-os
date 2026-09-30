/**
 * The sheet's preview (Reach out, Part 4; F12, R11): the n-th business a chain over this search would write to, and its
 * email as that business would read it. Its opening is written and read by the check's own code (check.ts), and the
 * email is assembled by the sender's own (request.ts reachOutRequest), so the preview holds what a send holds: a slot
 * that is none of the six, no subject, words no email may carry, no name to sign with, no booking link, no address
 * for the foot, a value this business lacks. Nothing is stored and nothing is sent: the email's From, its reply route
 * and its unsubscribe seal are stand-ins, and only its words come back. The whole run is checked by the check's clock
 * once the chain starts.
 */
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { REACH_OUT_PREVIEW_INDEX_MAX, type ReachOutHold } from "../packages/contracts.js";
import { reachOutAudience, reachOutRecord, type Database } from "../packages/db.js";
import {
  askReachOutModel,
  checkBudget,
  checkInputOf,
  checkOne,
  checkWorkspaceOf,
  type AskModel,
  type CheckBudget,
} from "./check.js";
import { reachOutRequest, type RequestRefusal } from "./request.js";

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
  domain: { host: "preview.invalid", from_local: "preview", from_name: "Preview" },
  mailbox: { reply_token: "p".repeat(24) },
  replyDomain: "preview.invalid",
  origin: "https://preview.invalid",
};

export async function previewOne(
  db: Db,
  i: PreviewInput,
  ask: AskModel = askReachOutModel,
  budget: CheckBudget = checkBudget(Date.now(), PREVIEW_LIMITS),
): Promise<Preview> {
  const none: Preview = {
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
  // The door refuses any other (a 400): never a silent clamp to a business the owner did not ask for.
  if (!Number.isInteger(i.index) || i.index < 0 || i.index > PREVIEW_INDEX_MAX)
    throw new RangeError(`a preview's index is a whole number from 0 to ${PREVIEW_INDEX_MAX}`);
  const index = i.index;
  const leads = await reachOutAudience(db, {
    tenantId: i.tenantId,
    searchId: i.searchId,
    limit: index + 1,
    includeUnconfirmed: i.includeUnconfirmed,
  });
  const lead = leads[index];
  if (!lead) return none;
  const [record, workspace] = await Promise.all([
    reachOutRecord(db, { tenantId: i.tenantId, searchId: i.searchId, leadId: lead.lead_id }),
    checkWorkspaceOf(db, i.tenantId),
  ]);
  if (!record) return none;
  const c = await checkOne(checkInputOf(record, i.words, workspace.opening, i.language), ask, budget, {
    tenantId: i.tenantId,
    subjectId: lead.lead_id,
  });
  const checked = c.kind === "checked" ? c : null;
  const opening = checked?.opening?.opening ?? null;
  const r = reachOutRequest({
    tenantId: i.tenantId,
    messageId: randomUUID(),
    contactId: randomUUID(),
    to: lead.email,
    words: i.words,
    lead: { business_name: lead.business_name, city: lead.city },
    workspace: {
      businessName: workspace.businessName,
      address: workspace.address,
      yourName: i.signedBy,
      bookingLink: workspace.bookingLink,
    },
    opening,
    domain: STAND_IN.domain,
    mailbox: STAND_IN.mailbox,
    replyDomain: STAND_IN.replyDomain,
    unsubscribe: { secret: randomUUID(), origin: STAND_IN.origin },
    parent: null,
  });
  return {
    lead: { id: lead.lead_id, business_name: lead.business_name ?? "", email: lead.email },
    subject: r.ok ? r.subject : null,
    body: r.ok ? r.body : null,
    opening,
    angle: checked?.opening?.angle ?? null,
    hold: checked?.hold ?? null,
    detail: checked?.detail ?? null,
    // An opening the model could not write is said as unavailable, not as a refusal of the words.
    refused: r.ok || (!checked && r.reason === "no_opening") ? null : r.reason,
    unavailable: !checked,
    tokens: { ...c.tokens },
  };
}
