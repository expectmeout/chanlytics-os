import "server-only";
import {
  AskSettingsChangeSchema,
  PERSON_MODES,
  POLICY_CLASSES,
  POLICY_MODES,
  contactName,
  describeSettingsChange,
  isHeldDraft,
  violatesNoPrices,
  waWindow,
  type AskProposal,
} from "@chanlytics/contracts";
import type { ToolContext, ToolDef } from "./tools";

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

const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object", properties, required, additionalProperties: false });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const str = (v: unknown, max = 500): string => (typeof v === "string" ? v.trim().slice(0, max) : "");

export const THREAD_VERBS = ["take_over", "hand_back", "snooze", "wake", "archive", "resolve"] as const;

export const ACT_TOOLS: ToolDef[] = [
  {
    name: "draft_reply",
    description: "Propose words for a customer on a WhatsApp thread, as a card the person approves before anything is sent. voice: 'you' for the person's own words, 'receptionist' for the receptionist's voice. Use the conversation id a read returned. Never quote or confirm a price.",
    input_schema: obj({ conversation_id: { type: "string" }, text: { type: "string" }, voice: { type: "string", enum: ["you", "receptionist"] } }, ["conversation_id", "text", "voice"]),
  },
  {
    name: "propose_steer",
    description: "Propose rewriting a reply the receptionist is holding, with an instruction ('shorter', 'mention Saturday is full', 'in Spanish'). Use the held draft's message id from a read. The rewrite waits its turn like the first draft.",
    input_schema: obj({ message_id: { type: "string" }, instruction: { type: "string" } }, ["message_id", "instruction"]),
  },
  {
    name: "propose_thread_verb",
    description: "Propose an Inbox action on a thread: take_over (a person answers from here), hand_back (the receptionist resumes), snooze (until an ISO time, default tomorrow 10:00), wake, archive, resolve (close the open escalation).",
    input_schema: obj({ conversation_id: { type: "string" }, verb: { type: "string", enum: [...THREAD_VERBS] }, until: { type: "string" } }, ["conversation_id", "verb"]),
  },
  {
    name: "propose_person_mode",
    description: "Propose how the receptionist treats one person: auto (answers), ask (asks a person first), never (stays silent), inherit (the workspace's rule). Owner-only.",
    input_schema: obj({ contact_id: { type: "string" }, mode: { type: "string", enum: ["auto", "ask", "never", "inherit"] } }, ["contact_id", "mode"]),
  },
  {
    name: "propose_policy",
    description: "Propose a change to what the receptionist may do alone: a class (reply, booking, faq, reengage, campaign) and a mode (auto, veto, ask, never), or the reply confidence dial (0 to 1). The money class is locked by charter.",
    input_schema: obj({ class: { type: "string", enum: [...POLICY_CLASSES] }, mode: { type: "string", enum: ["", ...POLICY_MODES] }, min_confidence: { type: "number" } }, ["class", "mode"]),
  },
  {
    name: "propose_settings",
    description: "Propose a settings change the receptionist will follow: add_closure (a day or range closed), set_hours (one weekday's open/close, or closed), add_note (a note the receptionist reads), add_service. Owner-only. Dates YYYY-MM-DD, times HH:MM.",
    input_schema: obj({
      change: obj({
        op: { type: "string", enum: ["add_closure", "set_hours", "add_note", "add_service"] },
        date: { type: "string" }, until: { type: "string" }, note: { type: "string" },
        day: { type: "string" }, open: { type: "string" }, close: { type: "string" },
        title: { type: "string" }, text: { type: "string" },
        name: { type: "string" }, duration_min: { type: "integer" },
      }, ["op"]),
    }, ["change"]),
  },
  {
    name: "propose_whisper",
    description: "Propose a sentence only the phone receptionist hears on a live call, worked into its next answer. Use a call id from list_calls with filter live.",
    input_schema: obj({ call_id: { type: "string" }, text: { type: "string" } }, ["call_id", "text"]),
  },
  {
    name: "propose_invite",
    description: "Propose inviting someone to the workspace by email, as operator or viewer. Owner-only.",
    input_schema: obj({ email: { type: "string" }, role: { type: "string", enum: ["operator", "viewer"] } }, ["email", "role"]),
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

const refuse = (why: string): ProposalOutcome => ({ proposal: null, result: JSON.stringify({ error: why }), isError: true });
const propose = (p: Omit<AskProposal, "id">): ProposalOutcome => {
  const proposal: AskProposal = { id: nextId(), ...p };
  return {
    proposal,
    isError: false,
    result: JSON.stringify({ proposed: true, id: proposal.id, card: proposal.title, summary: proposal.summary, note: "Nothing has happened yet. This is a card the person can approve, edit or dismiss. Say what you proposed; never say it is done." }),
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
    .select("id, state, last_wa_inbound_at, contacts (id, display_name, wa_profile_name, phone_e164, consent, dnc)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!conv) return refuse("no such conversation in this workspace");
  const who = contactName({ contact: { id: conv.contacts?.id ?? "", display_name: conv.contacts?.display_name ?? null, wa_profile_name: conv.contacts?.wa_profile_name ?? null, phone_e164: conv.contacts?.phone_e164 ?? null, consent: null, dnc: false } } as Parameters<typeof contactName>[0]);
  if (conv.contacts?.dnc) return refuse(`${who} opted out; nothing can be sent to them`);
  const win = waWindow(conv.last_wa_inbound_at, t.now);
  const price = violatesNoPrices(text);
  t.read.thread.add(id);
  return propose({
    kind: "reply",
    needs: "operator",
    title: `Reply to ${who}`,
    summary: text,
    payload: { conversation_id: id, text, voice, who, window_open: win.open, price_warning: price },
    undo: "Cancel within 15 seconds of sending",
  });
}

async function proposeSteer(t: ToolContext, input: Record<string, unknown>): Promise<ProposalOutcome> {
  const id = str(input.message_id, 40);
  const instruction = str(input.instruction, 500);
  if (!UUID.test(id)) return refuse("message_id must be a held draft's id from a read");
  if (!instruction) return refuse("instruction is required");
  const { data: m, error } = await t.ctx.supabase.from("messages").select("id, conversation_id, sender, status, body, type, direction, created_at").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!m) return refuse("no such message in this workspace");
  if (!isHeldDraft({ id: m.id, sender: m.sender as "ai", status: m.status ?? undefined, direction: m.direction as "outbound", type: m.type, body: m.body, created_at: m.created_at } as Parameters<typeof isHeldDraft>[0])) {
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
    .select("id, state, assignee_user_id, snooze_until, contacts (display_name, wa_profile_name, phone_e164)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!conv) return refuse("no such conversation in this workspace");
  const who = conv.contacts?.display_name || conv.contacts?.wa_profile_name || conv.contacts?.phone_e164 || "this person";
  let escalationId: string | null = null;
  if (verb === "resolve") {
    const { data: esc } = await t.ctx.supabase.from("escalations").select("id").eq("conversation_id", id).eq("state", "open").order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!esc) return refuse("no open escalation on that thread; nothing to resolve");
    escalationId = esc.id;
  }
  if (verb === "wake" && conv.state !== "snoozed") return refuse("that thread is not snoozed");
  if (verb === "hand_back" && !conv.assignee_user_id) return refuse("nobody has taken that thread over");
  let until: string | null = null;
  if (verb === "snooze") {
    const raw = str(input.until, 40);
    const d = raw ? new Date(raw) : (() => { const x = new Date(t.now); x.setDate(x.getDate() + 1); x.setHours(10, 0, 0, 0); return x; })();
    if (Number.isNaN(d.getTime()) || d.getTime() <= t.now.getTime()) return refuse("until must be a future ISO time");
    until = d.toISOString();
  }
  const TITLES: Record<string, string> = { take_over: `Take over ${who}'s thread`, hand_back: `Hand ${who}'s thread back to the receptionist`, snooze: `Snooze ${who}'s thread`, wake: `Wake ${who}'s thread`, archive: `Archive ${who}'s thread`, resolve: `Resolve ${who}'s escalation` };
  const UNDO: Record<string, string | null> = { take_over: "Hand back", hand_back: "Take over again", snooze: "Wake", wake: "Snooze again", archive: null, resolve: null };
  t.read.thread.add(id);
  return propose({
    kind: "thread_verb",
    needs: "operator",
    title: TITLES[verb],
    summary: verb === "snooze" && until ? `Until ${new Date(until).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : verb === "resolve" ? "Closes the open escalation; the thread stays" : verb === "take_over" ? "The receptionist goes quiet on it until you hand it back" : verb === "hand_back" ? "The receptionist answers again" : verb === "archive" ? "Out of the Inbox; it comes back if they write" : "Back in the Inbox now",
    payload: { conversation_id: id, verb, until, escalation_id: escalationId, who },
    undo: UNDO[verb],
  });
}

async function proposePersonMode(t: ToolContext, input: Record<string, unknown>): Promise<ProposalOutcome> {
  const id = str(input.contact_id, 40);
  const mode = str(input.mode, 10);
  if (!UUID.test(id)) return refuse("contact_id must be an id a read returned");
  if (!(["inherit", ...PERSON_MODES] as string[]).includes(mode)) return refuse("mode must be auto, ask, never or inherit");
  const { data: c, error } = await t.ctx.supabase.from("contacts").select("id, display_name, wa_profile_name, phone_e164, erased_at").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!c || c.erased_at) return refuse("no such person in this workspace");
  const { data: pol } = await t.ctx.supabase.from("policies").select("mode").eq("tenant_id", t.tenantId).eq("class", "reply").eq("subject_type", "contact").eq("subject_id", id).maybeSingle();
  const who = c.display_name || c.wa_profile_name || c.phone_e164 || "this person";
  const LABEL: Record<string, string> = { auto: "answers them", ask: "asks you first", never: "stays silent with them", inherit: "follows the workspace rule" };
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

async function proposePolicy(t: ToolContext, input: Record<string, unknown>): Promise<ProposalOutcome> {
  const cls = str(input.class, 20);
  const mode = str(input.mode, 10);
  const conf = typeof input.min_confidence === "number" ? input.min_confidence : null;
  if (!(POLICY_CLASSES as readonly string[]).includes(cls)) return refuse("class must be reply, booking, faq, reengage, campaign or money");
  if (cls === "money") return refuse("money stays owner-only by charter; that row is locked");
  if (mode && !(POLICY_MODES as readonly string[]).includes(mode)) return refuse("mode must be auto, veto, ask or never");
  if (mode === "veto" && cls !== "reply") return refuse("only replies can be held for review");
  if (conf !== null && (cls !== "reply" || conf < 0 || conf > 1)) return refuse("the confidence dial is 0 to 1 and applies to reply");
  if (!mode && conf === null) return refuse("say a mode or a confidence");
  const { data: row } = await t.ctx.supabase.from("policies").select("mode, limits").eq("tenant_id", t.tenantId).eq("class", cls).is("subject_type", null).maybeSingle();
  const MODE_LABEL: Record<string, string> = { auto: "acts on its own", veto: "sends after a short window unless you stop it", ask: "asks you first", never: "never" };
  const summary = [mode ? `${cls}: ${MODE_LABEL[mode] ?? mode}` : null, conf !== null ? `confidence dial ${Math.round(conf * 100)}%` : null].filter(Boolean).join(" · ");
  return propose({
    kind: "policy",
    needs: "operator",
    title: `Autonomy: ${cls}`,
    summary,
    payload: { class: cls, mode: mode || null, min_confidence: conf, previous: { mode: row?.mode ?? null, min_confidence: (row?.limits as { min_confidence?: number } | null)?.min_confidence ?? null } },
    undo: "Set it back",
  });
}

async function proposeSettings(t: ToolContext, input: Record<string, unknown>): Promise<ProposalOutcome> {
  const raw = input.change && typeof input.change === "object" ? (input.change as Record<string, unknown>) : null;
  if (!raw) return refuse("change is required");
  const clean: Record<string, unknown> = { op: raw.op };
  for (const k of ["date", "until", "note", "day", "open", "close", "title", "text", "name"]) if (typeof raw[k] === "string" && raw[k]) clean[k] = raw[k];
  if (typeof raw.duration_min === "number") clean.duration_min = raw.duration_min;
  if (raw.op === "set_hours") { clean.open = typeof raw.open === "string" && raw.open ? raw.open : null; clean.close = typeof raw.close === "string" && raw.close ? raw.close : null; }
  const parsed = AskSettingsChangeSchema.safeParse(clean);
  if (!parsed.success) return refuse(`change rejected: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  const change = parsed.data;
  return propose({
    kind: "settings",
    needs: "owner",
    title: change.op === "add_closure" ? "Close the salon" : change.op === "set_hours" ? "Change the hours" : change.op === "add_note" ? "Remember this" : "Add a service",
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
  const { data: call, error } = await t.ctx.supabase.from("calls").select("id, status, contacts (display_name, wa_profile_name, phone_e164)").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!call) return refuse("no such call in this workspace");
  if (call.status !== "ongoing") return refuse("that call is not in progress; there is nobody on the line");
  const who = call.contacts?.display_name || call.contacts?.wa_profile_name || call.contacts?.phone_e164 || "the caller";
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

export async function buildProposal(t: ToolContext, name: string, input: Record<string, unknown>): Promise<ProposalOutcome> {
  try {
    switch (name) {
      case "draft_reply": return await draftReply(t, input);
      case "propose_steer": return await proposeSteer(t, input);
      case "propose_thread_verb": return await proposeThreadVerb(t, input);
      case "propose_person_mode": return await proposePersonMode(t, input);
      case "propose_policy": return await proposePolicy(t, input);
      case "propose_settings": return await proposeSettings(t, input);
      case "propose_whisper": return await proposeWhisper(t, input);
      case "propose_invite": return await proposeInvite(t, input);
      default: return refuse(`unknown tool ${name}`);
    }
  } catch (e) {
    console.error("ask_proposal_failed", JSON.stringify({ tool: name, error: e instanceof Error ? e.message : String(e) }));
    return refuse("that could not be checked; say so and suggest the page");
  }
}

const PROPOSAL_LABELS: Record<string, string> = {
  draft_reply: "Drafting a reply",
  propose_steer: "Preparing a rewrite",
  propose_thread_verb: "Preparing an Inbox action",
  propose_person_mode: "Preparing a receptionist change",
  propose_policy: "Preparing an autonomy change",
  propose_settings: "Preparing a settings change",
  propose_whisper: "Preparing a whisper",
  propose_invite: "Preparing an invitation",
};

export function proposalLabel(name: string): string {
  return PROPOSAL_LABELS[name] ?? "Preparing a card";
}
