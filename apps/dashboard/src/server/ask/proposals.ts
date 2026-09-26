import "server-only";
import {
  AUDIENCE_KINDS,
  ASK_THREAD_VERBS,
  DEAL_LOST_REASONS,
  DEAL_LOST_REASON_WORDS,
  DEAL_PERS,
  DEAL_STAGES,
  DEAL_STAGE_WORDS,
  amountWords,
  isDealLostReason,
  isRealDate,
  linkHost,
  NOTE_MAX,
  NOTE_WORDS,
  clipAtWord,
  stepDayOf,
  normalizeLink,
  whyNotALink,
  foldName,
  pickCurrentDeal,
  type DealStage,
  AskSettingsChangeSchema,
  EVERYONE_LABEL,
  BUILTIN_LISTS,
  LIST_PLAYBOOK_CLASSES,
  parseListToken,
  PERSON_MODES,
  broadcastName,
  cleanParam,
  clockWhen,
  eligibleFor,
  emptyAudienceRefusal,
  purposeOfTemplate,
  exampleParams,
  parseParamSpec,
  renderTemplate,
  shiftKey,
  type ParamSpec,
  POLICY_CLASSES,
  POLICY_MODES,
  FOLLOW_UP_NEEDS_DEALS,
  REACH_OUT_IS_NOT_A_MOMENT,
  FOLLOW_UP_ONE,
  dealPaceOf,
  dealsAreOn,
  policyClassOffered,
  triggerOffered,
  contactName,
  describeSettingsChange,
  isHeldDraft,
  violatesNoPrices,
  replyWindow,
  type AskProposal,
  AppError,
  type LeadSearchPlan,
  PLAYBOOK_CLASS_LABEL,
  MOMENT_TRIGGERS,
  ProposeLeadSearchSchema,
  planLeadSearch,
  planSentence,
  SCHEMA_SETS,
  defaultParamSpecs,
  playbookRunReach,
  purposeOfPlaybook,
  saidYesWords,
  scheduleLine,
  slotLabels,
  starterForTrigger,
  triggerOf,
  zoneMidnight,
} from "@chanlytics/contracts";
import { listPolicies } from "@chanlytics/db";
import type { ToolContext, ToolDef } from "./tools";
import { answerPlanOf, planFacts, searchRow, waitingQuestionOf, type SearchViewRow } from "../leads";
import { requireUuid } from "../request-guards";
import { archivedListWords, poolList } from "../audience";
import { dealPaceRead, sellsByOf } from "../deals";
import { checkPlaybookInput, proposalFollowUps } from "../playbooks";
import { replyChannelOf } from "../verbs";
import { load } from "../readers";
import { audiencePool } from "../readers/audience-pool";

/**
 * What the assistant may propose, and how a proposal is checked.
 *
 * An act tool never acts. It validates what the model asked for against the
 * workspace as the person sees it (the row exists, the draft is still held,
 * the call is still live), and returns a proposal: a card the person may
 * approve. The commit runs later, from the card, through the same route a
 * button would use, which checks the role and the state again. The model is
 * told, in the tool result, that nothing has happened yet.
 */

const obj = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const str = (v: unknown, max = 500): string => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** The one list, from contracts: the committer in the browser reads the same one. */
export const THREAD_VERBS = ASK_THREAD_VERBS;

export const ACT_TOOLS: ToolDef[] = [
  {
    name: "draft_reply",
    description:
      "Propose words for a customer on a WhatsApp thread, as a card the person approves before anything is sent. voice: 'you' for the person's own words, 'receptionist' for the receptionist's voice. Use the conversation id a read returned. Never quote or confirm a price.",
    input_schema: obj(
      {
        conversation_id: { type: "string" },
        text: { type: "string" },
        voice: { type: "string", enum: ["you", "receptionist"] },
      },
      ["conversation_id", "text", "voice"],
    ),
  },
  {
    name: "propose_steer",
    description:
      "Propose rewriting a reply the receptionist is holding, with an instruction ('shorter', 'mention Saturday is full', 'in Spanish'). Use the held draft's message id from a read. The rewrite waits its turn like the first draft.",
    input_schema: obj({ message_id: { type: "string" }, instruction: { type: "string" } }, [
      "message_id",
      "instruction",
    ]),
  },
  {
    name: "propose_thread_verb",
    description:
      "Propose an Inbox action on a thread: take_over (a person answers from here), hand_back (the receptionist resumes), snooze (until an ISO time, default tomorrow 10:00), wake, archive, resolve (close the open escalation).",
    input_schema: obj(
      {
        conversation_id: { type: "string" },
        verb: { type: "string", enum: [...THREAD_VERBS] },
        until: { type: "string" },
      },
      ["conversation_id", "verb"],
    ),
  },
  {
    name: "propose_person_mode",
    description:
      "Propose how the receptionist treats one person: auto (answers), ask (asks a person first), never (stays silent), inherit (the workspace's rule). Owner-only.",
    input_schema: obj(
      { contact_id: { type: "string" }, mode: { type: "string", enum: ["auto", "ask", "never", "inherit"] } },
      ["contact_id", "mode"],
    ),
  },
  {
    name: "propose_deal",
    description:
      "Propose recording a deal on a person (0004, 0008): stage proposed (a proposal went out: a new engagement), won (they said yes or paid: a client), lost (they passed), ended (the engagement ended). Optional service, amount_cents with per (once, month, year: a proposal's value, or a client's agreed amount), a note, the proposal's web address (proposal_url), the last day it stands (valid_until, YYYY-MM-DD) and, with lost only, why they passed (lost_reason). Optionally the next step on it: what (next_step, for the team) with its day (next_step_due, YYYY-MM-DD, today or later), a note with a day the team sees on the deal, written after it. This records what a person told you; it never decides money.",
    input_schema: obj(
      {
        contact_id: { type: "string" },
        stage: { type: "string", enum: [...DEAL_STAGES] },
        service: { type: "string" },
        amount_cents: { type: "number" },
        per: { type: "string", enum: [...DEAL_PERS] },
        note: { type: "string" },
        proposal_url: { type: "string" },
        valid_until: { type: "string" },
        lost_reason: { type: "string", enum: [...DEAL_LOST_REASONS] },
        next_step: { type: "string" },
        next_step_due: { type: "string" },
      },
      ["contact_id", "stage"],
    ),
  },
  {
    name: "propose_policy",
    description:
      "Propose a change to what the receptionist may do alone: a class (reply, booking, faq, reengage, campaign, reviews, and follow_up where deals are on) and a mode (auto, veto, ask, never), or the reply confidence dial (0 to 1). Never for money: that class is locked by charter, so a request to change it is answered in words, not proposed.",
    input_schema: obj(
      {
        // The classes the Autonomy pane draws: a reach-out's is set where reach-outs are made (Part 4).
        class: { type: "string", enum: POLICY_CLASSES.filter((c) => c !== "outreach") },
        mode: { type: "string", enum: ["", ...POLICY_MODES] },
        min_confidence: { type: "number" },
      },
      ["class", "mode"],
    ),
  },
  {
    name: "propose_settings",
    description:
      "Propose a settings change the receptionist will follow: add_closure (a day or range closed), set_hours (one weekday's open/close, or closed), add_note (a note the receptionist reads), add_service. Owner-only. Dates YYYY-MM-DD, times HH:MM.",
    input_schema: obj(
      {
        change: obj(
          {
            op: { type: "string", enum: ["add_closure", "set_hours", "add_note", "add_service"] },
            date: { type: "string" },
            until: { type: "string" },
            note: { type: "string" },
            day: { type: "string" },
            open: { type: "string" },
            close: { type: "string" },
            title: { type: "string" },
            text: { type: "string" },
            name: { type: "string" },
            duration_min: { type: "integer" },
          },
          ["op"],
        ),
      },
      ["change"],
    ),
  },
  {
    name: "propose_whisper",
    description:
      "Propose a sentence only the phone receptionist hears on a live call, worked into its next answer. Use a call id from list_calls with filter live.",
    input_schema: obj({ call_id: { type: "string" }, text: { type: "string" } }, ["call_id", "text"]),
  },
  {
    name: "propose_broadcast",
    description:
      "Propose a broadcast: one approved WhatsApp template to an audience — everyone who said yes, or any list list_audiences names (its kind and audience_id: a People list, or one of the workspace's own) — with the template's values in order (typed text, or @first_name, @business_name, @booking_link to fill per person) and an optional ISO time with its offset (2026-09-20T15:00:00-04:00, never a bare date). Read list_audiences first. It becomes a card the person approves; nobody without a recorded yes is ever included.",
    input_schema: obj(
      {
        template_id: { type: "string" },
        audience_kind: { type: "string", enum: ["everyone", "list", "saved"] },
        audience_id: { type: "string" },
        params: { type: "array", items: { type: "string" } },
        scheduled_for: { type: "string" },
        name: { type: "string" },
      },
      ["template_id", "audience_kind"],
    ),
  },
  {
    name: "propose_playbook",
    description:
      "Propose a playbook: a standing rule that sends one approved WhatsApp template to newly eligible people who said yes. trigger: quiet_30 (win-back), new_week (welcome), phoned_only (save our number), everyone_monthly (the month's offer), saved_list (on any list: give its token from list_audiences in list -- one of People's or one of the workspace's own -- and policy_class campaign for an offer or reengage for a win-back), or, where deals are on, proposal_waiting (the proposal follow-up: one nudge per proposal waiting past the workspace's pace, one such playbook per workspace, its message carrying the proposal's link as @proposal_link). template_id: an approved template, or omit it for the trigger's starter when the workspace holds it. params: the template's values in order (typed text, or @first_name, @business_name, @booking_link, @proposal_link); a starter's are filled in, except a typed one such as the month's offer. run_hour 9–20 by the business's clock (default 10), cap_per_run (default 25). Read list_playbooks first. It becomes a card the person approves; it then runs under its class's autonomy mode.",
    input_schema: obj(
      {
        // Every moment except the two that follow the calendar; a proposal's is refused where deals are off. A
        // reach-out's steps are not moments (MOMENT_TRIGGERS).
        trigger: { type: "string", enum: MOMENT_TRIGGERS.filter((t) => t.kind !== "visit").map((t) => t.id) },
        // On a list (saved_list): the list's token from list_audiences, and what it sends.
        list: { type: "string" },
        policy_class: { type: "string", enum: [...LIST_PLAYBOOK_CLASSES] },
        template_id: { type: "string" },
        params: { type: "array", items: { type: "string" } },
        run_hour: { type: "number" },
        cap_per_run: { type: "number" },
        name: { type: "string" },
      },
      ["trigger"],
    ),
  },
  {
    name: "propose_invite",
    description: "Propose inviting someone to the workspace by email, as operator or viewer. Owner-only.",
    input_schema: obj(
      { email: { type: "string" }, role: { type: "string", enum: [...SCHEMA_SETS["invitations.role"]] } },
      ["email", "role"],
    ),
  },
  {
    name: "propose_lead_search",
    description:
      "Propose a search for businesses in the US the owner could reach: what kind (plural, and one of them), how many (50, 100, 200 or 500 unless they said a number), where (a city and its two-letter state, a ZIP, or a state), the contact standard (phone, or email checked), the criteria each with whether it must be seen or is likely from what Claude reads -- seen is only for what a listing shows (a rating or review count, a website, an email, a phone that matches the site, open or closed) and is judged from those facts alone; what a business IS or DOES (its kind, who owns it, what it serves or sells, who it treats) is likely, never seen, because a listing's name and category do not count as seeing it; and the kind of business itself is checked on every search without being written as a criterion -- who to leave out (chains, other kinds; short chips in plain words), up to three search terms (widest first). looking_for is local_businesses, or people, online_sellers or other when that is what was asked: those are answered in words, not searched. asked: the owner's words. It becomes a plan card the owner approves; nothing is searched or spent before that. Owner-only. amends: the id of a search that stopped to ask (list_lead_searches shows its question) when the plan is that search with the owner's answer applied; the card then answers that search instead of starting a new one.",
    input_schema: obj(
      {
        looking_for: { type: "string", enum: ["local_businesses", "people", "online_sellers", "other"] },
        country: { type: "string" },
        count: { type: "integer" },
        who: { type: "string" },
        who_one: { type: "string" },
        category_key: { type: "string" },
        terms: { type: "array", items: { type: "string" } },
        city: { type: "string" },
        region: { type: "string" },
        zip: { type: "string" },
        contact: { type: "string", enum: ["phone", "email"] },
        criteria: {
          type: "array",
          items: obj(
            {
              text: { type: "string" },
              standard: { type: "string", enum: ["likely", "seen"] },
              required: { type: "boolean" },
            },
            ["text", "standard", "required"],
          ),
        },
        leave_out: { type: "array", items: obj({ words: { type: "string" } }, ["words"]) },
        asked: { type: "string" },
        amends: { type: "string" },
      },
      [
        "looking_for",
        "country",
        "count",
        "who",
        "who_one",
        "category_key",
        "terms",
        "region",
        "contact",
        "criteria",
        "asked",
      ],
    ),
  },
];

export const ACT_TOOL_NAMES = new Set(ACT_TOOLS.map((t) => t.name));

let seq = 0;
const nextId = () => `p-${Date.now().toString(36)}-${(seq++ % 1000).toString(36)}`;

export interface ProposalOutcome {
  proposal: AskProposal | null;
  /** What the model sees. */
  result: string;
  isError: boolean;
}

const refuse = (why: string): ProposalOutcome => ({
  proposal: null,
  result: JSON.stringify({ error: why }),
  isError: true,
});
/** The calendar day an instant falls on in a zone, as YYYY-MM-DD. */
const dayKeyIn = (tz: string, at: Date): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
const propose = (p: Omit<AskProposal, "id">): ProposalOutcome => {
  const proposal: AskProposal = { id: nextId(), ...p };
  return {
    proposal,
    isError: false,
    result: JSON.stringify({
      proposed: true,
      id: proposal.id,
      card: proposal.title,
      summary: proposal.summary,
      note: "Nothing has happened yet. This is a card the person can approve, edit or dismiss. Say what you proposed; never say it is done.",
    }),
  };
};

async function draftReply(t: ToolContext, input: Record<string, unknown>): Promise<ProposalOutcome> {
  const id = str(input.conversation_id, 40);
  const text = str(input.text, 1000);
  const voice = input.voice === "receptionist" ? "receptionist" : "you";
  if (!UUID.test(id)) return refuse("conversation_id must be an id a read returned");
  if (!text) return refuse("text is required");
  const { data: conv, error } = await t.ctx.supabase
    .from("conversations")
    .select(
      "id, tenant_id, state, last_wa_inbound_at, contacts (id, display_name, wa_profile_name, phone_e164, email, consent, dnc)",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!conv) return refuse("no such conversation in this workspace");
  const who = contactName({
    contact: {
      id: conv.contacts?.id ?? "",
      display_name: conv.contacts?.display_name ?? null,
      wa_profile_name: conv.contacts?.wa_profile_name ?? null,
      phone_e164: conv.contacts?.phone_e164 ?? null,
      email: conv.contacts?.email ?? null,
      consent: null,
      dnc: false,
    },
  } as Parameters<typeof contactName>[0]);
  if (conv.contacts?.dnc) return refuse(`${who} opted out; nothing can be sent to them`);
  // The window the reply route will enforce, on the channel it will send on:
  // a texting thread has none, and this card used to call one closed.
  const win = replyWindow(await replyChannelOf(t.ctx, conv), conv.last_wa_inbound_at, t.now);
  const price = violatesNoPrices(text);
  t.read.thread.add(id);
  return propose({
    kind: "reply",
    needs: "operator",
    title: `Reply to ${who}`,
    summary: text,
    payload: { conversation_id: id, text, voice, who, window_open: win.open, price_warning: price },
    undo: "Sends 15 seconds after you approve; cancel within them",
  });
}

async function proposeSteer(t: ToolContext, input: Record<string, unknown>): Promise<ProposalOutcome> {
  const id = str(input.message_id, 40);
  const instruction = str(input.instruction, 500);
  if (!UUID.test(id)) return refuse("message_id must be a held draft's id from a read");
  if (!instruction) return refuse("instruction is required");
  const { data: m, error } = await t.ctx.supabase
    .from("messages")
    .select("id, conversation_id, sender, status, body, type, direction, created_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!m) return refuse("no such message in this workspace");
  if (
    !isHeldDraft({
      id: m.id,
      sender: m.sender as "ai",
      status: m.status ?? undefined,
      direction: m.direction as "outbound",
      type: m.type,
      body: m.body,
      created_at: m.created_at,
    } as Parameters<typeof isHeldDraft>[0])
  ) {
    return refuse("that reply is not waiting any more; there is nothing to rewrite");
  }
  t.read.thread.add(m.conversation_id);
  return propose({
    kind: "steer",
    needs: "operator",
    title: "Rewrite the held reply",
    summary: instruction,
    payload: { message_id: id, conversation_id: m.conversation_id, instruction, current: (m.body ?? "").slice(0, 300) },
    undo: null,
  });
}

async function proposeThreadVerb(t: ToolContext, input: Record<string, unknown>): Promise<ProposalOutcome> {
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
  const UNDO: Record<string, string | null> = {
    take_over: "Hand back",
    hand_back: "Take over again",
    snooze: "Wake",
    wake: "Snooze again",
    archive: null,
    resolve: null,
  };
  t.read.thread.add(id);
  return propose({
    kind: "thread_verb",
    needs: "operator",
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
    undo: UNDO[verb],
  });
}

async function proposePersonMode(t: ToolContext, input: Record<string, unknown>): Promise<ProposalOutcome> {
  const id = str(input.contact_id, 40);
  const mode = str(input.mode, 10);
  if (!UUID.test(id)) return refuse("contact_id must be an id a read returned");
  if (!(["inherit", ...PERSON_MODES] as string[]).includes(mode))
    return refuse("mode must be auto, ask, never or inherit");
  const { data: c, error } = await t.ctx.supabase
    .from("contacts")
    .select("id, display_name, wa_profile_name, phone_e164, email, erased_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!c || c.erased_at) return refuse("no such person in this workspace");
  const { data: pol } = await t.ctx.supabase
    .from("policies")
    .select("mode")
    .eq("tenant_id", t.tenantId)
    .eq("class", "reply")
    .eq("subject_type", "contact")
    .eq("subject_id", id)
    .maybeSingle();
  const who = c.display_name || c.wa_profile_name || c.phone_e164 || c.email || "this person";
  const LABEL: Record<string, string> = {
    auto: "answers them",
    ask: "asks you first",
    never: "stays silent with them",
    inherit: "follows the workspace rule",
  };
  t.read.person.add(id);
  return propose({
    kind: "person_mode",
    needs: "owner",
    title: `Receptionist for ${who}`,
    summary: `The receptionist ${LABEL[mode]}`,
    payload: { contact_id: id, mode, previous: pol?.mode ?? "inherit", who },
    undo: "Set it back",
  });
}

async function proposeDeal(t: ToolContext, input: Record<string, unknown>): Promise<ProposalOutcome> {
  const id = str(input.contact_id, 40);
  const stage = str(input.stage, 10);
  if (!UUID.test(id)) return refuse("contact_id must be an id a read returned");
  if (!(DEAL_STAGES as readonly string[]).includes(stage)) return refuse("stage must be proposed, won, lost or ended");
  // The proposal's link, judged by the one normalizer the route uses; the day it stands until, a real one; and a reason
  // only for a pass (0008). Each is refused in words before it becomes a card the route would refuse.
  const typedLink = str(input.proposal_url, 600);
  const url = typedLink ? normalizeLink(typedLink) : null;
  if (typedLink && !url) return refuse(`proposal_url: ${whyNotALink(typedLink) ?? "that is not a web address"}`);
  const day = str(input.valid_until, 10);
  if (day && !isRealDate(day)) return refuse("valid_until must be a day, like 2026-09-30");
  const reason = str(input.lost_reason, 20);
  if (reason && !isDealLostReason(reason)) return refuse(`lost_reason must be one of ${DEAL_LOST_REASONS.join(", ")}`);
  if (reason && stage !== "lost") return refuse("lost_reason goes only with stage lost");
  // Its next step (0007, amended): the words and their day together, a real day from the business's today on. It is
  // a note with a day, the team's, which the commit writes after the deal, naming it (commit.ts).
  const stepWords = typeof input.next_step === "string" ? input.next_step.trim() : "";
  if (stepWords.length > NOTE_MAX) return refuse(`next_step is at most ${NOTE_MAX} characters`);
  const stepDue = str(input.next_step_due, 10);
  if (stepWords && !stepDue) return refuse("next_step needs next_step_due, the day it is due, like 2026-09-30");
  if (stepDue && !stepWords) return refuse("next_step_due goes only with next_step");
  const stepDay = stepDue ? stepDayOf(stepDue, t.timezone, t.now.getTime()) : null;
  if (stepDue && !stepDay) return refuse("next_step_due must be a day, like 2026-09-30");
  if (stepDay && stepDay.due === "past") return refuse("next_step_due must be today or later");
  const { data: c, error } = await t.ctx.supabase
    .from("contacts")
    .select("id, display_name, wa_profile_name, phone_e164, email, erased_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!c || c.erased_at) return refuse("no such person in this workspace");
  // Every deal of theirs: the current one may be the oldest, since a running engagement outlives newer proposals
  // (pickCurrentDeal). A read that fails is a card that cannot be checked, never a move proposed against no row.
  const { data: rows, error: dErr } = await t.ctx.supabase
    .from("deals")
    .select("id, stage, service, version, created_at")
    .eq("tenant_id", t.tenantId)
    .eq("contact_id", id)
    .order("created_at", { ascending: false });
  if (dErr) throw new Error(dErr.message);
  const current = pickCurrentDeal(rows ?? []);
  const who = c.display_name || c.wa_profile_name || c.phone_e164 || c.email || "this person";
  const named = str(input.service, 80) || null;
  const amount =
    typeof input.amount_cents === "number" && input.amount_cents >= 0 ? Math.round(input.amount_cents) : null;
  const per = (DEAL_PERS as readonly string[]).includes(str(input.per, 10)) ? str(input.per, 10) : null;
  const note = str(input.note, 200);
  // The rows a move may move: the open ones (proposed, won; already_open is per service, so there may be two), else
  // the current row unless it has ended -- so a passed row moves to won, lost or ended too, since the door allows
  // any move but out of ended. A named service picks its own row among them (foldName: case and accents aside);
  // unnamed, the current row moves. A proposal is a new row, unless it is a passed one sent again for its service.
  type Row = NonNullable<typeof current>;
  const isOpen = (r: Row) => r.stage === "proposed" || r.stage === "won";
  const sameService = (r: Row) => foldName((r.service ?? "").trim()) === foldName(named ?? "");
  const open = (rows ?? []).filter(isOpen);
  const movable: Row[] = open.length ? open : current && current.stage !== "ended" ? [current] : [];
  let sameRow: Row | null = null;
  if (stage !== "proposed") {
    if (!movable.length) return refuse("they have no open deal to move; record a proposal first");
    sameRow = named ? (movable.find(sameService) ?? null) : current;
    if (!sameRow) {
      const names = movable.map((r) => r.service ?? "no named service");
      const whose = open.length > 1 ? "open deals are" : open.length ? "open deal is" : "last deal is";
      return refuse(
        `their ${whose} for ${names.join(" and ")}; name ${names.length > 1 ? "one of those" : "that service"} or none`,
      );
    }
  } else if (current && current.stage === "lost" && (!named || sameService(current))) {
    sameRow = current;
  }
  // On a move the row's own service is said, never the input's: the door never changes a row's service.
  const service = sameRow ? sameRow.service : (named ?? current?.service ?? null);
  t.read.person.add(id);
  const words = DEAL_STAGE_WORDS[stage as DealStage];
  // A proposal's value is said as a client's is (0008), and the card says where the link lives and why they passed.
  const money = amount !== null ? amountWords(amount, per) : null;
  const why = reason && isDealLostReason(reason) ? DEAL_LOST_REASON_WORDS[reason] : null;
  // The step as the card says it: "Next step: send the quote, due Fri" (its words clipped; the note keeps them whole).
  const next = stepDay ? `${NOTE_WORDS.next}: ${clipAtWord(stepWords, 80)}, due ${stepDay.near}` : null;
  return propose({
    kind: "deal",
    needs: "operator",
    title: `${who} · ${words}`,
    summary: [words, service, money, url ? linkHost(url) : null, why, next].filter((x): x is string => !!x).join(" · "),
    payload: {
      contact_id: id,
      stage,
      ...(sameRow ? { deal_id: sameRow.id, version: sameRow.version } : {}),
      ...(service && !sameRow ? { service } : {}),
      ...(amount !== null ? { amount_cents: amount } : {}),
      ...(per ? { per } : {}),
      ...(note ? { note } : {}),
      ...(url ? { proposal_url: url } : {}),
      ...(day ? { valid_until: day } : {}),
      ...(reason ? { lost_reason: reason } : {}),
      who,
    },
    undo: null,
    ...(stepDay ? { step: { body: stepWords, due_on: stepDay.day } } : {}),
  });
}

async function proposePolicy(t: ToolContext, input: Record<string, unknown>): Promise<ProposalOutcome> {
  const cls = str(input.class, 20);
  const mode = str(input.mode, 10);
  const conf = typeof input.min_confidence === "number" ? input.min_confidence : null;
  if (!(POLICY_CLASSES as readonly string[]).includes(cls))
    return refuse("class must be reply, booking, faq, reengage, campaign, reviews, follow_up or money");
  if (cls === "money") return refuse("money stays owner-only by charter; that row is locked");
  if (cls === "outreach") return refuse("a reach-out's runs are set where reach-outs are made, not here");
  // A class only a proposal's moment runs under is offered only where deals are on (0006); only it asks.
  if (!policyClassOffered(cls, false) && !policyClassOffered(cls, dealsAreOn(await sellsByOf(t.ctx, t.tenantId))))
    return refuse(FOLLOW_UP_NEEDS_DEALS);
  if (mode && !(POLICY_MODES as readonly string[]).includes(mode))
    return refuse("mode must be auto, veto, ask or never");
  if (mode === "veto" && cls !== "reply") return refuse("only replies can be held for review");
  if (conf !== null && (cls !== "reply" || conf < 0 || conf > 1))
    return refuse("the confidence dial is 0 to 1 and applies to reply");
  if (!mode && conf === null) return refuse("say a mode or a confidence");
  const { data: row } = await t.ctx.supabase
    .from("policies")
    .select("mode, limits")
    .eq("tenant_id", t.tenantId)
    .eq("class", cls)
    .is("subject_type", null)
    .maybeSingle();
  const MODE_LABEL: Record<string, string> = {
    auto: "acts on its own",
    veto: "sends after a short window unless you stop it",
    ask: "asks you first",
    never: "never",
  };
  const summary = [
    mode ? `${cls}: ${MODE_LABEL[mode] ?? mode}` : null,
    conf !== null ? `confidence dial ${Math.round(conf * 100)}%` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return propose({
    kind: "policy",
    needs: "operator",
    title: `Autonomy: ${cls}`,
    summary,
    payload: {
      class: cls,
      mode: mode || null,
      min_confidence: conf,
      previous: {
        mode: row?.mode ?? null,
        min_confidence: (row?.limits as { min_confidence?: number } | null)?.min_confidence ?? null,
      },
    },
    undo: "Set it back",
  });
}

async function proposeSettings(t: ToolContext, input: Record<string, unknown>): Promise<ProposalOutcome> {
  const raw = input.change && typeof input.change === "object" ? (input.change as Record<string, unknown>) : null;
  if (!raw) return refuse("change is required");
  const clean: Record<string, unknown> = { op: raw.op };
  for (const k of ["date", "until", "note", "day", "open", "close", "title", "text", "name"])
    if (typeof raw[k] === "string" && raw[k]) clean[k] = raw[k];
  if (typeof raw.duration_min === "number") clean.duration_min = raw.duration_min;
  if (raw.op === "set_hours") {
    clean.open = typeof raw.open === "string" && raw.open ? raw.open : null;
    clean.close = typeof raw.close === "string" && raw.close ? raw.close : null;
  }
  const parsed = AskSettingsChangeSchema.safeParse(clean);
  if (!parsed.success)
    return refuse(`change rejected: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  const change = parsed.data;
  return propose({
    kind: "settings",
    needs: "owner",
    title:
      change.op === "add_closure"
        ? "Close for a day"
        : change.op === "set_hours"
          ? "Change the hours"
          : change.op === "add_note"
            ? "Remember this"
            : "Add a service",
    summary: describeSettingsChange(change),
    payload: { change },
    undo: "Put the previous settings back",
  });
}

async function proposeWhisper(t: ToolContext, input: Record<string, unknown>): Promise<ProposalOutcome> {
  const id = str(input.call_id, 40);
  const text = str(input.text, 500);
  if (!UUID.test(id)) return refuse("call_id must be an id a read returned");
  if (!text) return refuse("text is required");
  const { data: call, error } = await t.ctx.supabase
    .from("calls")
    .select("id, status, contacts (display_name, wa_profile_name, phone_e164)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!call) return refuse("no such call in this workspace");
  if (call.status !== "ongoing") return refuse("that call is not in progress; there is nobody on the line");
  const who =
    call.contacts?.display_name || call.contacts?.wa_profile_name || call.contacts?.phone_e164 || "the caller";
  t.read.call.add(id);
  return propose({
    kind: "whisper",
    needs: "operator",
    title: `Whisper on the call with ${who}`,
    summary: text,
    payload: { call_id: id, text, who },
    undo: null,
  });
}

async function proposeInvite(_t: ToolContext, input: Record<string, unknown>): Promise<ProposalOutcome> {
  const email = str(input.email, 200).toLowerCase();
  const role = str(input.role, 10);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return refuse("that is not an email address");
  if (role !== "operator" && role !== "viewer") return refuse("role must be operator or viewer");
  return propose({
    kind: "invite",
    needs: "owner",
    title: `Invite ${email}`,
    summary: `As ${role}${role === "viewer" ? " (reads everything, changes nothing)" : " (replies and handles threads; no settings or team)"}`,
    payload: { email, role },
    undo: null,
  });
}

async function proposeBroadcast(t: ToolContext, input: Record<string, unknown>): Promise<ProposalOutcome> {
  const templateId = str(input.template_id, 40);
  const kind = str(input.audience_kind, 10);
  const audienceId = str(input.audience_id, 60) || null;
  if (!UUID.test(templateId)) return refuse("template_id must be an id list_audiences returned");
  if (!(AUDIENCE_KINDS as readonly string[]).includes(kind))
    return refuse("audience_kind must be everyone, list or saved");
  if (kind === "list" && !BUILTIN_LISTS.some((l) => l.id === audienceId))
    return refuse("audience_id must be a People list id, as list_audiences names them");
  if (kind === "saved" && !(audienceId && UUID.test(audienceId)))
    return refuse("audience_id must be a saved list id from list_audiences");
  const specs: ParamSpec[] = [];
  for (const p of Array.isArray(input.params) ? (input.params as unknown[]) : []) {
    const spec = parseParamSpec(p);
    if (!spec) return refuse("each value is text, or @first_name, @business_name or @booking_link");
    if (spec.kind === "text") {
      const v = cleanParam(spec.value);
      if (v === null) return refuse("every typed value must be plain text under 1024 characters, without line breaks");
      specs.push({ kind: "text", value: v });
    } else {
      specs.push(spec);
    }
  }
  const params = specs;
  const { data: tpl } = await t.ctx.supabase
    .from("templates")
    .select("id, name, language, meta_status, category, variables, body_preview")
    .eq("id", templateId)
    .eq("tenant_id", t.tenantId)
    .eq("channel", "whatsapp")
    .maybeSingle();
  if (!tpl || tpl.meta_status !== "approved")
    return refuse("that template is not approved by WhatsApp; list_audiences names the approved ones");
  const expected = Array.isArray(tpl.variables) ? tpl.variables.length : 0;
  if (params.length !== expected)
    return refuse(`this template takes ${expected} value${expected === 1 ? "" : "s"}, in order`);

  // The audience, counted the way the route will count it.
  // The pool and the list the route will read, so the count here is the count it enrols: once a turn, so a listing of
  // the audiences before it read the same pool (readers/audience-pool.ts).
  const pool = (await load(t.rc, audiencePool, undefined)).data;
  // Any list, counted the way the send will count it (audience.ts poolList): a built-in or a saved list alike, and
  // one that can't be counted here refused with why.
  let members: Set<string> | null = null;
  let label = EVERYONE_LABEL;
  if (kind !== "everyone") {
    const found = await poolList(t.ctx, t.tenantId, pool, {
      kind: kind === "list" ? "builtin" : "saved",
      id: audienceId!,
    });
    if (!found) return refuse("no such list; list_audiences names them");
    if (found.archived) return refuse(archivedListWords(found.label, "send"));
    if ("unknown" in found) return refuse(`${found.label} can't be counted here: ${found.unknown}`);
    members = new Set(found.memberIds);
    label = found.label;
  }
  const rows = members ? pool.rows.filter((r) => members!.has(r.id)) : pool.rows;
  // The same purpose the route will derive, from the same column of the same
  // template row this function already read. An assistant that proposes a
  // broadcast the route then refuses has wasted the operator's approval.
  const purpose = purposeOfTemplate(tpl.category);
  const count = eligibleFor(rows, "everyone", null, null, purpose).length;
  // In the route's words, which say which cause it is -- nobody said this yes, or the ones who did have no number.
  if (count === 0)
    return refuse(
      `nobody on "${label}" can receive this message: ${emptyAudienceRefusal(purpose, label, rows)} Say so, and name what to do about it`,
    );
  const when = str(input.scheduled_for, 40) || null;
  // With its offset: a bare date is midnight UTC, the evening before here, and
  // the route refuses it after the person approved the card.
  if (when && (Number.isNaN(Date.parse(when)) || !/(?:Z|[+-]\d{2}:?\d{2})$/i.test(when)))
    return refuse("scheduled_for must be an ISO time with its offset, like 2026-09-20T15:00:00-04:00");
  const values = params;
  const words = renderTemplate(tpl.body_preview, exampleParams(values, "the business"));
  // Named for the business's day and said by its clock, as the route names it and the pages say it.
  const name = str(input.name, 80) || broadcastName(tpl.name, t.timezone, t.now);
  const whenWords = when ? clockWhen(Date.parse(when), t.timezone, t.now.getTime()) : "now";
  return propose({
    kind: "broadcast",
    needs: "operator",
    title: `Broadcast to ${label}`,
    summary: `${count} ${count === 1 ? "person" : "people"} who said yes · “${tpl.name}” · ${whenWords}: ${words.slice(0, 160)}${words.length > 160 ? "…" : ""}`,
    payload: {
      template_id: tpl.id,
      template_name: tpl.name,
      audience_kind: kind,
      audience_id: audienceId,
      audience_label: label,
      params: values,
      scheduled_for: when,
      name,
      count,
    },
    undo: "Cancel it, if it has not finished",
  });
}

/** What a run does under each mode, in the card's words. */
const MODE_WORDS: Record<string, string> = {
  auto: "each run sends on its own",
  veto: "each run sends 30 minutes later unless you stop it",
  ask: "each run waits for you on Today",
  never: "nothing runs until the class is changed",
};

async function proposePlaybook(t: ToolContext, input: Record<string, unknown>): Promise<ProposalOutcome> {
  const trig = triggerOf(str(input.trigger, 30));
  if (!trig) return refuse("trigger must be quiet_30, new_week, phoned_only, everyone_monthly or saved_list");
  if (trig.kind === "reach_out") return refuse(REACH_OUT_IS_NOT_A_MOMENT);
  // A playbook on a list names it by its token (decision 0009): one of People's, or one of the workspace's own.
  const listRef = trig.kind === "saved" ? parseListToken(str(input.list, 60)) : null;
  if (trig.kind === "saved" && !listRef)
    return refuse("a playbook on a list needs list: the list's token from list_audiences (seg:<id> or list:<id>)");
  // The proposal follow-up (0006): only where deals are on, and one per workspace (00167).
  if (trig.kind === "deal") {
    const [sellsBy, one] = await Promise.all([
      sellsByOf(t.ctx, t.tenantId),
      t.ctx.supabase
        .from("playbooks")
        .select("id")
        .eq("tenant_id", t.tenantId)
        .eq("trigger", trig.id)
        .limit(1)
        .maybeSingle(),
    ]);
    if (!triggerOffered(trig, dealsAreOn(sellsBy))) return refuse(FOLLOW_UP_NEEDS_DEALS);
    if (one.data) return refuse(FOLLOW_UP_ONE);
  }
  let templateId = str(input.template_id, 40);
  if (templateId && !UUID.test(templateId))
    return refuse("template_id must be an id list_audiences returned, or omitted for the trigger's starter");
  if (!templateId) {
    const s = starterForTrigger(trig.id);
    const { data: starter } = await t.ctx.supabase
      .from("templates")
      .select("id")
      .eq("tenant_id", t.tenantId)
      .eq("channel", "whatsapp")
      .eq("name", s?.name ?? "")
      .eq("meta_status", "approved")
      .is("hidden_at", null)
      .order("language")
      .limit(1)
      .maybeSingle();
    if (!starter)
      return refuse(
        `the “${s?.title ?? trig.label}” starter is not approved on this workspace yet; say so and suggest adding the starter set under Campaigns › Messages, or name an approved template from list_audiences`,
      );
    templateId = starter.id;
  }
  const { data: tpl } = await t.ctx.supabase
    .from("templates")
    .select("id, name, language, meta_status, variables, body_preview, hidden_at")
    .eq("id", templateId)
    .eq("tenant_id", t.tenantId)
    .eq("channel", "whatsapp")
    .maybeSingle();
  if (!tpl || tpl.meta_status !== "approved" || tpl.hidden_at)
    return refuse(
      "that template is not approved by WhatsApp, or the workspace keeps it out of the composers; list_audiences names the ones that may send",
    );

  // The values: the model's, or the template's own defaults — a starter's
  // slots are known; a typed slot with no words is a question for the person.
  let specs: ParamSpec[];
  const given = Array.isArray(input.params) ? (input.params as unknown[]) : [];
  if (given.length) {
    specs = [];
    for (const p of given) {
      const spec = parseParamSpec(p);
      if (!spec)
        return refuse(
          "each value is text, or @first_name, @business_name or @booking_link, or @proposal_link on the proposal follow-up",
        );
      if (spec.kind === "text") {
        const v = cleanParam(spec.value);
        if (v === null)
          return refuse("every typed value must be plain text under 1024 characters, without line breaks");
        specs.push({ kind: "text", value: v });
      } else {
        specs.push(spec);
      }
    }
  } else {
    specs = defaultParamSpecs({ name: tpl.name, variables: tpl.variables });
    const labels = slotLabels({ name: tpl.name, language: tpl.language, variables: tpl.variables });
    const blank = specs.findIndex((s) => s.kind === "text" && !s.value);
    if (blank >= 0)
      return refuse(
        `this template takes typed words for “${labels[blank] ?? `value ${blank + 1}`}”; ask the person what to say there, then propose again with params`,
      );
  }

  let checked;
  try {
    checked = await checkPlaybookInput(t.ctx, t.tenantId, {
      name: str(input.name, 80) || undefined,
      trigger: trig.id,
      ...(listRef ? (listRef.kind === "builtin" ? { list_key: listRef.id } : { list_id: listRef.id }) : {}),
      ...(listRef ? { policy_class: str(input.policy_class, 20) || undefined } : {}),
      template_id: tpl.id,
      params: specs,
      run_hour: typeof input.run_hour === "number" ? input.run_hour : undefined,
      cap_per_run: typeof input.cap_per_run === "number" ? input.cap_per_run : undefined,
    });
  } catch (e) {
    return refuse(e instanceof Error ? e.message : String(e));
  }

  const deal = trig.kind === "deal";
  const [pool, policies, paceRead, followUps] = await Promise.all([
    load(t.rc, audiencePool, undefined).then((r) => r.data),
    listPolicies(t.ctx.supabase, t.tenantId).catch(() => []),
    // A proposal's moment is counted as the page counts it (0006): by the pace, less whoever had their follow-up.
    deal ? dealPaceRead(t.ctx, t.tenantId, t.now) : Promise.resolve(null),
    deal ? proposalFollowUps(t.ctx, t.tenantId, t.now).catch(() => null) : Promise.resolve(new Map<string, number>()),
  ]);
  if (!followUps)
    return refuse("who already had a proposal follow-up could not be read just now; say so, and try again in a moment");
  const untouched = {
    byThis: new Map<string, number>(),
    byAny: new Map<string, number>(),
    followUps,
  };
  // A list's people, as a run counts them with no one looking (audience.ts poolList over the pool read for no one
  // is what the runner does; here the pool is the member's, so a list about "me" was refused by the check above).
  let listIds: Set<string> | null = null;
  let listLabel: string | null = null;
  if (listRef) {
    const found = await poolList(t.ctx, t.tenantId, pool, listRef);
    if (!found) return refuse("no such list; list_audiences names them");
    if (found.archived) return refuse(archivedListWords(found.label, "run"));
    if ("unknown" in found) return refuse(`${found.label} can't be counted right now: ${found.unknown}`);
    listIds = new Set(found.memberIds);
    listLabel = found.label;
  }
  // Who a run reaches now, and who its moment names said the yes it needs: the card said "0 on the list said yes
  // now" about a list whose yes had no number to send to. Said in the send screen's words (saidYesWords).
  const drawn = playbookRunReach(
    pool.rows,
    { trigger: trig.id, cap_per_run: 100_000, gap_days: 0, cadence_days: 0 },
    untouched,
    t.now.getTime(),
    dealPaceOf(paceRead),
    listIds,
  );
  const candidates = drawn.reach.will;
  const cls = checked.policy_class;
  const mode = policies.find((r) => r.class === cls)?.mode ?? "ask";
  const words = renderTemplate(tpl.body_preview, exampleParams(specs, "the business"));
  return propose({
    kind: "playbook",
    needs: "operator",
    title: `Playbook: ${checked.name}`,
    summary: `${listLabel ? `On ${listLabel}` : `${trig.label} — ${trig.hint.toLowerCase()}`} · ${scheduleLine(checked)} · ${saidYesWords("the list", purposeOfPlaybook(cls), candidates, drawn.saidYes)} · under “${PLAYBOOK_CLASS_LABEL[cls]}” (${mode}): ${MODE_WORDS[mode] ?? mode}. Says: ${words.slice(0, 140)}${words.length > 140 ? "…" : ""}`,
    payload: {
      trigger: trig.id,
      trigger_label: trig.label,
      template_id: tpl.id,
      template_name: tpl.name,
      params: specs,
      run_hour: checked.run_hour,
      cap_per_run: checked.cap_per_run,
      gap_days: checked.gap_days,
      cadence_days: checked.cadence_days,
      name: checked.name,
      candidates,
      policy_class: cls,
      // The list it runs on, when it runs on one: the commit names it as the composer does.
      list_id: checked.list_id,
      list_key: checked.list_key,
      mode,
    },
    undo: "Delete it — nothing will run",
  });
}

/**
 * A lead search as a card the owner approves. The model says who, how many,
 * where and the standard; the planner in contracts builds the plan, keys every
 * criterion and exclusion and checks the result against release A's own
 * schema, so what the card carries is a plan the door would accept. Nothing is
 * searched, reserved or spent here: the approval posts the plan, and the route
 * is the one that spends. With `amends` (the id of a search that stopped to
 * ask), the card answers that search instead: the plan is the same search with
 * the owner's answer applied, at the version and count the server sets.
 */
async function proposeLeadSearch(t: ToolContext, input: Record<string, unknown>): Promise<ProposalOutcome> {
  if (t.role !== "owner") return refuse("only an owner can start a lead search; say so, and that an owner can ask");
  // What a model writes that the schema, rightly, will not take as written:
  // a key in Title-Case or with a hyphen, and a country with its code in
  // brackets. Both are made the plan's own shape here; a key with no letters
  // left is passed through so the schema says so in words. The place, when
  // the model packs "Miami, FL" into one field, is the planner's to read
  // (planArea in contracts): the composer and this tool must agree on it.
  const keyed = String(input.category_key ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^[^a-z]+/, "")
    .replace(/_+$/, "")
    .slice(0, 40);
  const shaped = ProposeLeadSearchSchema.safeParse({
    ...input,
    category_key: keyed || input.category_key,
    country: String(input.country ?? "")
      .replace(/\(.*?\)/g, "")
      .trim(),
    city: str(input.city, 60) || null,
    zip: /^\d{5}$/.test(String(input.zip ?? "")) ? String(input.zip) : null,
    criteria: (Array.isArray(input.criteria) ? input.criteria : []).slice(0, 6),
    leave_out: (Array.isArray(input.leave_out) ? input.leave_out : [])
      .slice(0, 6)
      .map((l) => ({ words: str((l as Record<string, unknown>).words, 40) })),
  });
  if (!shaped.success)
    return refuse(
      `the plan is not complete: ${shaped.error.issues[0]?.path.join(".")} ${shaped.error.issues[0]?.message}`,
    );
  const amends = str(input.amends, 40);
  let row: SearchViewRow | null = null;
  let question: string | null = null;
  if (amends) {
    // The search it answers is read, never trusted from the words: one not waiting (or not this workspace's) is a
    // refusal in words, so the model says so instead of a card that would start a second search. A database
    // error is not a missing search: it is thrown on, for buildProposal to log and say it could not be checked.
    try {
      row = await searchRow(t.ctx, t.tenantId, requireUuid(amends, "search"));
    } catch (e) {
      if (!(e instanceof AppError)) throw e;
    }
    if (!row) return refuse("that search is not in this workspace; propose a new search instead");
    question = waitingQuestionOf(row);
    if (!question) return refuse("that search is not waiting for an answer; propose a new search instead");
  }
  // An answer is planned at the count the search's plan reserved, so the title and the view say the same number
  // as the plan the card carries; the model's count is only its own for a new search.
  const storedCount = row ? (row.plan as LeadSearchPlan | null)?.count : undefined;
  const r = planLeadSearch(typeof storedCount === "number" ? { ...shaped.data, count: storedCount } : shaped.data);
  // Outside the US, people rather than businesses, an ask no card fits: words
  // for the model to say, never a card with a problem in it.
  if (!r.ok) return refuse(r.refusal.text);
  // The version and the count are the server's (answerPlanOf), the same as the answer route sets them.
  const plan = row ? answerPlanOf(row, r.plan) : r.plan;
  const answer = row && question ? { search_id: row.id, name: row.name, question } : null;
  // The facts under the sentence -- the month's leads left, the duplicates
  // already theirs, what past searches for this kind of business found -- are
  // one read, `planFacts` in server/leads.ts. It lives there and not here
  // because this module reads and never writes a door of its own (a test holds
  // it to that), and the plan card is drawn from exactly what it answers.
  return propose({
    kind: "lead_search",
    needs: "owner",
    title: r.view.title,
    summary: answer ? `Answers “${answer.question}”: ${planSentence(plan)}` : planSentence(plan),
    payload: {
      plan,
      view: r.view,
      facts: await planFacts(t.ctx, t.tenantId, { categoryKey: shaped.data.category_key, now: t.now }),
      ...(answer ? { amends: answer } : {}),
    },
    // An answer carries the round on; there is nothing to undo (Stop is the strip's).
    undo: answer ? null : "Stop the search",
  });
}

export async function buildProposal(
  t: ToolContext,
  name: string,
  input: Record<string, unknown>,
): Promise<ProposalOutcome> {
  try {
    switch (name) {
      case "draft_reply":
        return await draftReply(t, input);
      case "propose_steer":
        return await proposeSteer(t, input);
      case "propose_thread_verb":
        return await proposeThreadVerb(t, input);
      case "propose_person_mode":
        return await proposePersonMode(t, input);
      case "propose_deal":
        return await proposeDeal(t, input);
      case "propose_policy":
        return await proposePolicy(t, input);
      case "propose_settings":
        return await proposeSettings(t, input);
      case "propose_whisper":
        return await proposeWhisper(t, input);
      case "propose_invite":
        return await proposeInvite(t, input);
      case "propose_broadcast":
        return await proposeBroadcast(t, input);
      case "propose_playbook":
        return await proposePlaybook(t, input);
      case "propose_lead_search":
        return await proposeLeadSearch(t, input);
      default:
        return refuse(`unknown tool ${name}`);
    }
  } catch (e) {
    console.error(
      "ask_proposal_failed",
      JSON.stringify({ tool: name, error: e instanceof Error ? e.message : String(e) }),
    );
    return refuse("that could not be checked; say so and suggest the page");
  }
}

const PROPOSAL_LABELS: Record<string, string> = {
  draft_reply: "Drafting a reply",
  propose_steer: "Preparing a rewrite",
  propose_thread_verb: "Preparing an Inbox action",
  propose_person_mode: "Preparing a receptionist change",
  propose_deal: "Preparing a deal",
  propose_policy: "Preparing an autonomy change",
  propose_settings: "Preparing a settings change",
  propose_whisper: "Preparing a whisper",
  propose_invite: "Preparing an invitation",
  propose_broadcast: "Preparing a broadcast",
  propose_playbook: "Preparing a playbook",
  propose_lead_search: "Planning a search",
};

export function proposalLabel(name: string): string {
  return PROPOSAL_LABELS[name] ?? "Preparing a card";
}
