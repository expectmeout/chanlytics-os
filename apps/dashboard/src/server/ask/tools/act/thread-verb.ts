import "server-only";
import { z } from "zod";
import {
  ASK_THREAD_VERBS,
  clockWhen,
  dayInZone,
  personName,
  shiftKey,
  zoneMidnight,
  UUID,
  PROPOSAL_SPECS,
  DbFailure,
} from "@chanlytics/contracts";
import { WHOSE, noteRow, str } from "../context/tool-reads";
import { defineAct, type ProposalOutcome, type ToolContext } from "../context/tool-defs";
import { propose, refuse } from "../context/context";
import { findOpenEscalationOf, findThreadCard } from "@chanlytics/db/ask";

/** The one list, from contracts: the committer in the browser reads the same one. */
export const THREAD_VERBS = ASK_THREAD_VERBS;

async function proposeThreadVerb(
  toolContext: ToolContext,
  input: { conversation_id: string; verb: string; until?: string },
): Promise<ProposalOutcome> {
  const id = str(input.conversation_id, 40);
  const verb = str(input.verb, 20) as (typeof THREAD_VERBS)[number];
  if (!UUID.test(id)) return refuse("conversation_id must be an id a read returned");
  if (!THREAD_VERBS.includes(verb)) return refuse(`verb must be one of ${THREAD_VERBS.join(", ")}`);
  const { data: conv, error } = await findThreadCard(toolContext.ctx.supabase, toolContext.tenantId, id);
  if (error) throw new DbFailure(error);
  if (!conv) return refuse("no such conversation in this workspace");
  // As the Inbox names them (personName): a saved name, else their WhatsApp name, else their number as it is printed.
  const contactName = personName(conv.contacts);
  let escalationId: string | null = null;
  if (verb === "resolve") {
    const { data: esc, error: escErr } = await findOpenEscalationOf(toolContext.ctx.supabase, toolContext.tenantId, id);
    if (escErr) throw new Error(escErr.message);
    if (!esc) return refuse("no open escalation on that thread; nothing to resolve");
    escalationId = esc.id;
  }
  if (verb === "wake" && conv.state !== "snoozed") return refuse("that thread is not snoozed");
  if (verb === "hand_back" && !conv.assignee_user_id) return refuse("nobody has taken that thread over");
  // What the thread already is, said, never a card that changes nothing (the operator stress run, 15 Oct 2026).
  if (verb === "take_over" && conv.assignee_user_id === toolContext.ctx.userId)
    return refuse(`${contactName}'s thread is already taken over by the person asking: say so, and change nothing`);
  if (verb === "archive" && conv.state === "archived")
    return refuse(`${contactName}'s thread is already archived: say so, and change nothing`);
  let until: string | null = null;
  if (verb === "snooze") {
    const raw = str(input.until, 40);
    // "Tomorrow at ten" is ten in the business's zone. This used setHours on
    // the server's clock, which on Vercel is UTC: six in the morning in New
    // York, and a test that passed on a laptop in that zone and failed in CI.
    const date = raw
      ? new Date(raw)
      : new Date(
          zoneMidnight(
            toolContext.timezone,
            shiftKey(dayInZone(toolContext.timezone, toolContext.now.getTime()).key, 1),
          ) +
            10 * 3600_000,
        );
    if (Number.isNaN(date.getTime()) || date.getTime() <= toolContext.now.getTime())
      return refuse("until must be a future ISO time");
    until = date.toISOString();
  }
  const TITLES: Record<(typeof THREAD_VERBS)[number], string> = {
    take_over: `Take over ${contactName}'s thread`,
    hand_back: `Hand ${contactName}'s thread back to the receptionist`,
    snooze: `Snooze ${contactName}'s thread`,
    wake: `Wake ${contactName}'s thread`,
    archive: `Archive ${contactName}'s thread`,
    resolve: `Resolve ${contactName}'s escalation`,
  };
  // The undo's words are the spec's (contracts ask-proposals/): a wake's card offers none (D8).
  noteRow(toolContext, "thread", id, contactName, `inbox/th-${id}`);
  return propose({
    kind: "thread_verb",
    title: TITLES[verb],
    summary:
      verb === "snooze" && until
        ? `Until ${clockWhen(Date.parse(until), toolContext.timezone, toolContext.now.getTime())}`
        : verb === "resolve"
          ? "Closes the open escalation; the thread stays"
          : verb === "take_over"
            ? "The receptionist goes quiet on it until you hand it back"
            : verb === "hand_back"
              ? "The receptionist answers again"
              : verb === "archive"
                ? "Out of the Inbox; it comes back if they write"
                : "Back in the Inbox now",
    payload: { conversation_id: id, verb, until, escalation_id: escalationId, who: contactName },
  });
}

export const propose_thread_verb = defineAct({
  name: "propose_thread_verb",
  // How the receptionist treats one person is not a thread's: whose it is to set is said to every role from its card's
  // spec (an owner's, WHOSE), so a role not offered propose_person's mode can still say who can.
  description: `Propose an Inbox action on a thread: take_over (a person answers from here), hand_back (the receptionist resumes), snooze (until an ISO time with its offset, or by default tomorrow at 10:00 by the business's clock), wake, archive, or resolve (close the open escalation; the thread stays). conversation_id is the id a read returned. Call it when they ask to take, hand back, snooze, wake, archive or resolve a thread; a reply is propose_reply with action draft, and how the receptionist treats one person is ${WHOSE[PROPOSAL_SPECS.person_mode.needs]} to set (propose_person with action mode). It refuses in words when the action does not fit the thread's state: nothing to resolve, not snoozed, or nobody to hand back from.`,
  input: z.object({
    conversation_id: z.string(),
    verb: z.enum(THREAD_VERBS),
    until: z.string().optional(),
  }),
  kind: "thread_verb",
  examples: [
    { conversation_id: "3b9d6f1e-7a2c-4d8e-9f01-2a3b4c5d6e7f", verb: "snooze", until: "2026-10-03T10:00:00-04:00" },
    { conversation_id: "3b9d6f1e-7a2c-4d8e-9f01-2a3b4c5d6e7f", verb: "take_over" },
  ],
  label: "Preparing an Inbox action",
  build: proposeThreadVerb,
});
