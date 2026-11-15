/**
 * The receptionist's draft of an answer to a reach-out's reply (Reach out Part 5, PR 5; decision 0017, the plan's G14): the
 * draft port the reply_read job asks. Core's readReply decides when; the one writer of a reply (drafts/writer.ts,
 * decision 0093) asks the gates and the brain, here with a reach-out's own note and its one extra gate, the workspace's
 * reply policy. Why it was not drafted is told in a reach-out's words: a draft that named money is simply not drafted.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TenantId } from "@chanlytics/contracts";
import { findLeadOfReply } from "@chanlytics/db/campaigns";
import type { Database } from "@chanlytics/db/types";
import type { JobContext } from "@chanlytics/jobs";
import { logAndGoOn } from "@chanlytics/log";
import { draftWriter } from "../../drafts/writer.js";
import type { generateReply } from "../../ai/receptionist-brain.js";
import { askPreview } from "../../previews/make.js";
import { dashboardOrigin } from "../../shared/dashboard-origin.js";

type Db = SupabaseClient<Database>;
type Draft = NonNullable<JobContext["replies"]>["draft"];

/**
 * The link to the preview of the business a reply's thread is about, made now where it has none (decision 0079; the
 * canvas's call P8): a business that answers has shown the interest a preview is for, and before this only a send whose
 * words named the link, or a member's press, made one. Asked of the one way a preview is made (askPreview), so its switch
 * and its door's refusals hold: null where none is made, and the reply is drafted as it always was. The link stands the
 * moment its row does; its page says it is being set up for the half minute that takes.
 */
export async function previewLinkFor(db: Db, tenantId: TenantId, conversationId: string): Promise<string | null> {
  const leadId = await findLeadOfReply(db, tenantId, conversationId);
  if (!leadId) return null;
  const made = await askPreview(db, { tenantId, leadId, by: null });
  return made.ok ? `${dashboardOrigin()}/preview/${encodeURIComponent(made.value.token)}` : null;
}

/** The drafter's note with their preview's link and what to say of it; the note as it was where there is none. */
export function withPreviewNote(note: string, link: string | null): string {
  if (!link) return note;
  return [
    note,
    `Their own preview is set up for them, free to try: AI that answers as their business, from their listing and website. Its link is ${link}`,
    "Give them this link exactly as written, on a line of its own, and say it is theirs to try. Say nothing it does that this note does not.",
  ].join("\n");
}

/** The draft port over this database. The tests give their own brain, clock and preview. */
export function replyDrafter(
  db: Db,
  over: {
    brain?: typeof generateReply;
    now?: () => number;
    preview?: (tenantId: TenantId, conversationId: string) => Promise<string | null>;
  } = {},
): Draft {
  const write = draftWriter(db, over);
  const previewLink = over.preview ?? ((tenantId, conversationId) => previewLinkFor(db, tenantId, conversationId));
  return async (tenantId, ask) => {
    // An answer to a business that wrote back carries its own preview, made now where it has none. A preview that
    // could not be read or made costs the draft its link, never the draft.
    const link =
      ask.kind === "answer"
        ? await previewLink(tenantId, ask.conversationId).catch(
            logAndGoOn("making a preview for a business that answered", null),
          )
        : null;
    const out = await write.reply(tenantId, {
      conversationId: ask.conversationId,
      contactId: null,
      forMessageId: null,
      source: "reach_out",
      wire: "email",
      theirWords: ask.text,
      theirSubject: null,
      holdReason: null,
      holdDetails: null,
      instruction: null,
      // An answer offers what Cold email says it does (decision 0113); a line of thanks offers nothing.
      answersLead: ask.kind === "answer",
      given: null,
      deadline: ask.deadline,
      note: withPreviewNote(ask.note, link),
    });
    if ("why" in out) return { why: out.why === "named_money" ? "not_drafted" : out.why };
    return { text: out.text, used: out.used };
  };
}
