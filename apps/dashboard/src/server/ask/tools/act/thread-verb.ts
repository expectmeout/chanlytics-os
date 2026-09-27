import "server-only";
import { z } from "zod";
import { ASK_THREAD_VERBS, clockWhen, shiftKey, zoneMidnight } from "@chanlytics/contracts";
import { UUID, defineAct, propose, refuse, str, type ProposalOutcome, type ToolContext } from "../context";

/** The one list, from contracts: the committer in the browser reads the same one. */
export const THREAD_VERBS = ASK_THREAD_VERBS;

/** The calendar day an instant falls on in a zone, as YYYY-MM-DD. */
const dayKeyIn = (tz: string, at: Date): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);

async function proposeThreadVerb(
  t: ToolContext,
  input: { conversation_id: string; verb: string; until?: string },
): Promise<ProposalOutcome> {
  const id = str(input.conversation_id, 40);
  const verb = str(input.verb, 20) as (typeof THREAD_VERBS)[number];
  if (!UUID.test(id)) return refuse("conversation_id must be an id a read returned");
  if (!THREAD_VERBS.includes(verb)) return refuse(`verb must be one of ${THREAD_VERBS.join(", ")}`);
  const { data: conv, error } = await t.ctx.supabase
    .from("conversations")
    .select("id, state, assignee_user_id, snooze_until, contacts (display_name, wa_profile_name, phone_e164, email)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!conv) return refuse("no such conversation in this workspace");
  const who =
    conv.contacts?.display_name ||
    conv.contacts?.wa_profile_name ||
    conv.contacts?.phone_e164 ||
    conv.contacts?.email ||
    "this person";
  let escalationId: string | null = null;
  if (verb === "resolve") {
    const { data: esc } = await t.ctx.supabase
      .from("escalations")
      .select("id")
      .eq("conversation_id", id)
      .eq("state", "open")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!esc) return refuse("no open escalation on that thread; nothing to resolve");
    escalationId = esc.id;
  }
  if (verb === "wake" && conv.state !== "snoozed") return refuse("that thread is not snoozed");
  if (verb === "hand_back" && !conv.assignee_user_id) return refuse("nobody has taken that thread over");
  let until: string | null = null;
  if (verb === "snooze") {
    const raw = str(input.until, 40);
    // "Tomorrow at ten" is ten in the business's zone. This used setHours on
    // the server's clock, which on Vercel is UTC: six in the morning in New
    // York, and a test that passed on a laptop in that zone and failed in CI.
    const d = raw
      ? new Date(raw)
      : new Date(zoneMidnight(t.timezone, shiftKey(dayKeyIn(t.timezone, t.now), 1)) + 10 * 3600_000);
    if (Number.isNaN(d.getTime()) || d.getTime() <= t.now.getTime()) return refuse("until must be a future ISO time");
    until = d.toISOString();
  }
  const TITLES: Record<string, string> = {
    take_over: `Take over ${who}'s thread`,
    hand_back: `Hand ${who}'s thread back to the receptionist`,
    snooze: `Snooze ${who}'s thread`,
    wake: `Wake ${who}'s thread`,
    archive: `Archive ${who}'s thread`,
    resolve: `Resolve ${who}'s escalation`,
  };
  // The undo's words are the spec's (contracts ask-proposals/): a wake's card offers none (D8).
  t.read.thread.add(id);
  return propose({
    kind: "thread_verb",
    title: TITLES[verb],
    summary:
      verb === "snooze" && until
        ? `Until ${clockWhen(Date.parse(until), t.timezone, t.now.getTime())}`
        : verb === "resolve"
          ? "Closes the open escalation; the thread stays"
          : verb === "take_over"
            ? "The receptionist goes quiet on it until you hand it back"
            : verb === "hand_back"
              ? "The receptionist answers again"
              : verb === "archive"
                ? "Out of the Inbox; it comes back if they write"
                : "Back in the Inbox now",
    payload: { conversation_id: id, verb, until, escalation_id: escalationId, who },
  });
}

export const propose_thread_verb = defineAct({
  name: "propose_thread_verb",
  description:
    "Propose an Inbox action on a thread: take_over (a person answers from here), hand_back (the receptionist resumes), snooze (until an ISO time, default tomorrow 10:00), wake, archive, resolve (close the open escalation).",
  input: z.object({
    conversation_id: z.string(),
    verb: z.enum(THREAD_VERBS),
    until: z.string().optional(),
  }),
  label: "Preparing an Inbox action",
  build: proposeThreadVerb,
});
