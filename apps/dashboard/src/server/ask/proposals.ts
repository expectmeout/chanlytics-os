import "server-only";
import {
  AUDIENCE_KINDS,
  AskSettingsChangeSchema,
  EVERYONE_LABEL,
  PEOPLE_LISTS,
  PERSON_MODES,
  broadcastName,
  cleanParam,
  eligibleFor,
  emptyAudienceRefusal,
  purposeOfTemplate,
  exampleParams,
  parseParamSpec,
  renderTemplate,
  toPersonRowVM,
  type AudienceKind,
  type ParamSpec,
  POLICY_CLASSES,
  POLICY_MODES,
  contactName,
  describeSettingsChange,
  isHeldDraft,
  violatesNoPrices,
  replyWindow,
  type AskProposal,
  PLAYBOOK_CLASS_LABEL,
  PLAYBOOK_TRIGGERS,
  SCHEMA_SETS,
  defaultParamSpecs,
  eligibleForPlaybook,
  scheduleLine,
  slotLabels,
  starterForTrigger,
  triggerOf,
} from "@chanlytics/contracts";
import { listPolicies } from "@chanlytics/db";
import type { ToolContext, ToolDef } from "./tools";
import { listPeople } from "../people";
import { checkPlaybookInput } from "../playbooks";
import { replyChannelOf } from "../verbs";

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
    description: "Propose a change to what the receptionist may do alone: a class (reply, booking, faq, reengage, campaign, reviews) and a mode (auto, veto, ask, never), or the reply confidence dial (0 to 1). Never for money: that class is locked by charter, so a request to change it is answered in words, not proposed.",
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
    name: "propose_broadcast",
    description: "Propose a broadcast: one approved WhatsApp template to an audience — everyone who said yes, a People list (needs_you, waiting_on_you, new_week, quiet, phoned_only) or a list kept by hand (its audience_id from list_audiences) — with the template's values in order (typed text, or @first_name, @business_name, @booking_link to fill per person) and an optional ISO time. Read list_audiences first. It becomes a card the person approves; nobody without a recorded yes is ever included.",
    input_schema: obj({
      template_id: { type: "string" },
      audience_kind: { type: "string", enum: ["everyone", "list", "saved"] },
      audience_id: { type: "string" },
      params: { type: "array", items: { type: "string" } },
      scheduled_for: { type: "string" },
      name: { type: "string" },
    }, ["template_id", "audience_kind"]),
  },
  {
    name: "propose_playbook",
    description: "Propose a playbook: a standing rule that sends one approved WhatsApp template to newly eligible people who said yes. trigger: quiet_30 (win-back), new_week (welcome), phoned_only (save our number) or everyone_monthly (the month's offer). template_id: an approved template, or omit it for the trigger's starter when the workspace holds it. params: the template's values in order (typed text, or @first_name, @business_name, @booking_link); a starter's are filled in, except a typed one such as the month's offer. run_hour 9–20 by the business's clock (default 10), cap_per_run (default 25). Read list_playbooks first. It becomes a card the person approves; it then runs under its class's autonomy mode.",
    input_schema: obj({
      // Every trigger except the two that follow the calendar.
      trigger: { type: "string", enum: PLAYBOOK_TRIGGERS.filter((t) => t.kind !== "visit").map((t) => t.id) },
      template_id: { type: "string" },
      params: { type: "array", items: { type: "string" } },
      run_hour: { type: "number" },
      cap_per_run: { type: "number" },
      name: { type: "string" },
    }, ["trigger"]),
  },
  {
    name: "propose_invite",
    description: "Propose inviting someone to the workspace by email, as operator or viewer. Owner-only.",
    input_schema: obj({ email: { type: "string" }, role: { type: "string", enum: [...SCHEMA_SETS["invitations.role"]] } }, ["email", "role"]),
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
    .select("id, tenant_id, state, last_wa_inbound_at, contacts (id, display_name, wa_profile_name, phone_e164, consent, dnc)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!conv) return refuse("no such conversation in this workspace");
  const who = contactName({ contact: { id: conv.contacts?.id ?? "", display_name: conv.contacts?.display_name ?? null, wa_profile_name: conv.contacts?.wa_profile_name ?? null, phone_e164: conv.contacts?.phone_e164 ?? null, consent: null, dnc: false } } as Parameters<typeof contactName>[0]);
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
  if (!(POLICY_CLASSES as readonly string[]).includes(cls)) return refuse("class must be reply, booking, faq, reengage, campaign, reviews or money");
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
    title: change.op === "add_closure" ? "Close for a day" : change.op === "set_hours" ? "Change the hours" : change.op === "add_note" ? "Remember this" : "Add a service",
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

async function proposeBroadcast(t: ToolContext, input: Record<string, unknown>): Promise<ProposalOutcome> {
  const templateId = str(input.template_id, 40);
  const kind = str(input.audience_kind, 10);
  const audienceId = str(input.audience_id, 60) || null;
  if (!UUID.test(templateId)) return refuse("template_id must be an id list_audiences returned");
  if (!(AUDIENCE_KINDS as readonly string[]).includes(kind)) return refuse("audience_kind must be everyone, list or saved");
  if (kind === "list" && !PEOPLE_LISTS.some((l) => l.id === audienceId)) return refuse("audience_id must be a People list id: needs_you, waiting_on_you, new_week, quiet or phoned_only");
  if (kind === "saved" && !(audienceId && UUID.test(audienceId))) return refuse("audience_id must be a saved list id from list_audiences");
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
  if (!tpl || tpl.meta_status !== "approved") return refuse("that template is not approved by WhatsApp; list_audiences names the approved ones");
  const expected = Array.isArray(tpl.variables) ? tpl.variables.length : 0;
  if (params.length !== expected) return refuse(`this template takes ${expected} value${expected === 1 ? "" : "s"}, in order`);

  // The audience, counted the way the route will count it.
  const rows = (await listPeople(t.ctx, t.tenantId)).map((r) => toPersonRowVM(r, t.now));
  let savedIds: Set<string> | null = null;
  let label = EVERYONE_LABEL;
  if (kind === "saved") {
    const { data: seg } = await t.ctx.supabase.from("segments").select("id, name").eq("id", audienceId!).eq("tenant_id", t.tenantId).maybeSingle();
    if (!seg) return refuse("no such list; list_audiences names them");
    const { data: members } = await t.ctx.supabase.from("segment_members").select("contact_id").eq("segment_id", seg.id);
    savedIds = new Set((members ?? []).map((m) => m.contact_id));
    label = seg.name;
  } else if (kind === "list") {
    label = PEOPLE_LISTS.find((l) => l.id === audienceId)!.label;
  }
  // The same purpose the route will derive, from the same column of the same
  // template row this function already read. An assistant that proposes a
  // broadcast the route then refuses has wasted the operator's approval.
  const purpose = purposeOfTemplate(tpl.category);
  const count = eligibleFor(rows, kind as AudienceKind, audienceId, savedIds, purpose).length;
  if (count === 0) return refuse(`nobody on "${label}" can receive this message: ${emptyAudienceRefusal(purpose)} Say so, and name what to do about it`);
  const when = str(input.scheduled_for, 40) || null;
  if (when && Number.isNaN(Date.parse(when))) return refuse("scheduled_for must be an ISO time");
  const values = params;
  const words = renderTemplate(tpl.body_preview, exampleParams(values, "the business"));
  const name = str(input.name, 80) || broadcastName(tpl.name, t.now);
  const whenWords = when ? new Date(when).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "now";
  return propose({
    kind: "broadcast",
    needs: "operator",
    title: `Broadcast to ${label}`,
    summary: `${count} ${count === 1 ? "person" : "people"} who said yes · “${tpl.name}” · ${whenWords}: ${words.slice(0, 160)}${words.length > 160 ? "…" : ""}`,
    payload: { template_id: tpl.id, template_name: tpl.name, audience_kind: kind, audience_id: audienceId, audience_label: label, params: values, scheduled_for: when, name, count },
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
  if (!trig) return refuse("trigger must be quiet_30, new_week, phoned_only or everyone_monthly");
  let templateId = str(input.template_id, 40);
  if (templateId && !UUID.test(templateId)) return refuse("template_id must be an id list_audiences returned, or omitted for the trigger's starter");
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
    if (!starter) return refuse(`the “${s?.title ?? trig.label}” starter is not approved on this workspace yet; say so and suggest adding the starter set in Settings › Message templates, or name an approved template from list_audiences`);
    templateId = starter.id;
  }
  const { data: tpl } = await t.ctx.supabase
    .from("templates")
    .select("id, name, language, meta_status, variables, body_preview, hidden_at")
    .eq("id", templateId)
    .eq("tenant_id", t.tenantId)
    .eq("channel", "whatsapp")
    .maybeSingle();
  if (!tpl || tpl.meta_status !== "approved" || tpl.hidden_at) return refuse("that template is not approved by WhatsApp, or the workspace keeps it out of the composers; list_audiences names the ones that may send");

  // The values: the model's, or the template's own defaults — a starter's
  // slots are known; a typed slot with no words is a question for the person.
  let specs: ParamSpec[];
  const given = Array.isArray(input.params) ? (input.params as unknown[]) : [];
  if (given.length) {
    specs = [];
    for (const p of given) {
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
  } else {
    specs = defaultParamSpecs({ name: tpl.name, variables: tpl.variables });
    const labels = slotLabels({ name: tpl.name, language: tpl.language, variables: tpl.variables });
    const blank = specs.findIndex((s) => s.kind === "text" && !s.value);
    if (blank >= 0) return refuse(`this template takes typed words for “${labels[blank] ?? `value ${blank + 1}`}”; ask the person what to say there, then propose again with params`);
  }

  let checked;
  try {
    checked = await checkPlaybookInput(t.ctx, t.tenantId, {
      name: str(input.name, 80) || undefined,
      trigger: trig.id,
      template_id: tpl.id,
      params: specs,
      run_hour: typeof input.run_hour === "number" ? input.run_hour : undefined,
      cap_per_run: typeof input.cap_per_run === "number" ? input.cap_per_run : undefined,
    });
  } catch (e) {
    return refuse(e instanceof Error ? e.message : String(e));
  }

  const [rows, policies] = await Promise.all([
    listPeople(t.ctx, t.tenantId).then((people) => people.map((r) => toPersonRowVM(r, t.now))),
    listPolicies(t.ctx.supabase, t.tenantId).catch(() => []),
  ]);
  const untouched = { byThis: new Map<string, number>(), byAny: new Map<string, number>() };
  const candidates = eligibleForPlaybook(rows, { trigger: trig.id, cap_per_run: 100_000, gap_days: 0, cadence_days: 0 }, untouched, t.now.getTime()).length;
  const mode = policies.find((r) => r.class === trig.cls)?.mode ?? "ask";
  const words = renderTemplate(tpl.body_preview, exampleParams(specs, "the business"));
  return propose({
    kind: "playbook",
    needs: "operator",
    title: `Playbook: ${checked.name}`,
    summary: `${trig.label} — ${trig.hint.toLowerCase()} · ${scheduleLine(checked)} · ${candidates} on the list said yes now · under “${PLAYBOOK_CLASS_LABEL[trig.cls]}” (${mode}): ${MODE_WORDS[mode] ?? mode}. Says: ${words.slice(0, 140)}${words.length > 140 ? "…" : ""}`,
    payload: {
      trigger: trig.id, trigger_label: trig.label, template_id: tpl.id, template_name: tpl.name, params: specs,
      run_hour: checked.run_hour, cap_per_run: checked.cap_per_run, gap_days: checked.gap_days, cadence_days: checked.cadence_days,
      name: checked.name, candidates, policy_class: trig.cls, mode,
    },
    undo: "Delete it — nothing will run",
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
      case "propose_broadcast": return await proposeBroadcast(t, input);
      case "propose_playbook": return await proposePlaybook(t, input);
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
  propose_broadcast: "Preparing a broadcast",
  propose_playbook: "Preparing a playbook",
};

export function proposalLabel(name: string): string {
  return PROPOSAL_LABELS[name] ?? "Preparing a card";
}
