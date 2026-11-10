/** Sequence: cold email. */

import "server-only";
import { z } from "zod";
import {
  REACH_OUT_AFTER_DAYS,
  REACH_OUT_GAP_FIRST,
  REACH_OUT_STEPS_MAX,
  COLD_EMAIL_MAILBOX_UNREAD,
  coldEmailCannotSendWhy,
  ReachOutChainSchema,
  SEQUENCE_WORDS,
  firstNameOf,
  parseTenantConfig,
  reachOutSignedByOf,
  AppError,
  UUID,
} from "@chanlytics/contracts";
import { getJournalMemberNames } from "@chanlytics/db/ask";
import { logAndGoOn } from "@chanlytics/log";
import { getStoredConfig } from "../../../../workspace/config-row";
import { listMailboxConnections } from "../../../../connections/mailbox-connections";
import { searchRow } from "../../../../leads/leads";
import { stepNamed, str } from "../../context/tool-reads";
import { propose, refuse } from "../../context/context";
import type { ProposalOutcome, ToolContext } from "../../context/tool-defs";
import { coldEmailCard } from "../leads/cold-email-card";
import { after, isRefusal, refusedAct, sequenceOnCard } from "./steps";

/**
 * A customer's sequence that ran, ended for good (its page's End it, asked first: decision 0072): it sends nothing more
 * and nobody is added to it; its History stays. One that never ran is let go of, a sequence to leads paused.
 */
export async function proposeEnd(toolContext: ToolContext, input: { sequence_id: string }): Promise<ProposalOutcome> {
  const rec = await sequenceOnCard(toolContext, input.sequence_id);
  if (isRefusal(rec)) return refuse(rec.refusal);
  const refused = refusedAct(rec, "end", toolContext.now);
  if (refused) return refuse(refused);
  return propose({
    kind: "sequence_end",
    title: `End ${rec.sequence.name}`,
    summary: `${SEQUENCE_WORDS.endDetail} Nothing undoes it.`,
    payload: { sequence_id: rec.sequence.id, name: rec.sequence.name },
  });
}

/** A cold email's step, as the model writes it: a subject (the first email's), its words and its wait. */
export const COLD_STEP = z.object({
  subject: z
    .string()
    .optional()
    .describe("The email's subject; the steps after the first may leave it out to reply in the same thread."),
  body: z
    .string()
    .describe(
      "The email's words, the same for every business, in the owner's own voice (what you remember of how they write), claiming and supposing nothing about the business (how busy it is, its calls, what it wants); {{opening}} on its own first line is written for each business from its record, and {first_name} and {business_name} are filled for each.",
    ),
  after_days: z
    .number()
    .int()
    .optional()
    .describe(
      `Days after the email before it, ${REACH_OUT_AFTER_DAYS.min} to ${REACH_OUT_AFTER_DAYS.max}; the first has none.`,
    ),
});

/**
 * Why the workspace has no mailbox that sends now, as a new sequence's make reads it (00459: connected ones only), in
 * the door's own words; `why` null where one sends. The whole answer is null where the read failed, which is no
 * answer: telling an owner with a mailbox to connect one would send them the wrong way.
 */
async function mailboxStanding(t: ToolContext): Promise<{ why: string | null } | null> {
  const boxes = await listMailboxConnections(t.ctx.supabase, t.tenantId).catch(
    logAndGoOn("reading the mailboxes for a cold email's card", null),
  );
  return boxes && { why: coldEmailCannotSendWhy(boxes) };
}

/**
 * Who signs a sequence the model did not say a signer for: the member's first name, as New and the editor offer it
 * (use-chain.ts, firstNameOf over the name they gave themselves); none where they gave none, never their address. A read
 * that fails is none (30 Oct 2026: Ask made a sequence no one signed, whose sends ended unsigned or were held).
 */
async function signerOf(t: ToolContext): Promise<string | null> {
  const [names, config] = await Promise.all([
    getJournalMemberNames(t.ctx.supabase, [t.ctx.userId]).catch((): Record<string, string> => ({})),
    getStoredConfig(t.ctx.supabase, t.tenantId)
      .then(parseTenantConfig)
      .catch(() => null),
  ]);
  // The name Cold email signs with (decision 0113), else the member's first name, as before the page.
  return reachOutSignedByOf(config, firstNameOf(names[t.ctx.userId] ?? null, null));
}

export async function proposeColdEmail(
  toolContext: ToolContext,
  input: {
    name: string;
    search_id: string;
    steps: z.output<typeof COLD_STEP>[];
    gap_minutes?: number;
    signed_by?: string;
    include_unconfirmed?: boolean;
  },
): Promise<ProposalOutcome> {
  // A sequence to leads sends from a mailbox: with none that sends there is no card, and it says which it is.
  const mailbox = await mailboxStanding(toolContext);
  if (mailbox === null) return refuse(COLD_EMAIL_MAILBOX_UNREAD);
  if (mailbox.why) return refuse(mailbox.why);
  const searchId = str(input.search_id, 40);
  const token = stepNamed(toolContext, searchId);
  let fedBy = `the leads step ${token} keeps`;
  if (token === null) {
    if (!UUID.test(searchId))
      return refuse("search_id must be a search or a list of leads from leads with action searches");
    try {
      const row = await searchRow(toolContext.ctx, toolContext.tenantId, searchId);
      fedBy = `“${row.name ?? "the search"}”`;
    } catch (e) {
      if (e instanceof AppError) return refuse(e.message);
      throw e;
    }
  }
  const chain = {
    name: str(input.name, 80),
    // A token is checked in the shape of the id it stands for, and kept as the token for the commit to fill.
    search_id: token === null ? searchId : "00000000-0000-4000-8000-000000000000",
    include_unconfirmed: input.include_unconfirmed ?? false,
    // Unsaid, the pace every new sequence starts at (decision 0077 D7), the one New makes it at.
    gap_minutes: input.gap_minutes ?? REACH_OUT_GAP_FIRST,
    mailbox_ids: [],
    owner_sends: false,
    signed_by: input.signed_by?.trim() || (await signerOf(toolContext)),
    steps: input.steps.map((s, i) => ({
      subject: s.subject?.trim() || null,
      body: s.body,
      after_days: i === 0 ? null : (s.after_days ?? REACH_OUT_AFTER_DAYS.first),
    })),
  };
  const checked = ReachOutChainSchema.safeParse(chain);
  if (!checked.success) return refuse(checked.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  if (checked.data.steps.length > REACH_OUT_STEPS_MAX) return refuse(`at most ${REACH_OUT_STEPS_MAX} emails`);
  // Each email as the card says it: its subject, or a reply in the first's thread; the ones after the first with their wait.
  const says = (s: { subject: string | null }) => (s.subject ? `“${s.subject}”` : "a reply in the same thread");
  const [first, ...rest] = checked.data.steps;
  const card = coldEmailCard({
    to: fedBy,
    first: first ? says(first) : "",
    then: rest.map((s) => `${after(s.after_days ?? 0)}: ${says(s)}`),
    gap_minutes: checked.data.gap_minutes,
  });
  return propose({
    kind: "reach_out_make",
    title: `Cold email: ${checked.data.name}`,
    summary: card.summary,
    sheet: card.sheet,
    // A plan step's token stays the token, for the commit to fill with the list that step made.
    payload: { chain: { ...checked.data, search_id: searchId } },
  });
}
