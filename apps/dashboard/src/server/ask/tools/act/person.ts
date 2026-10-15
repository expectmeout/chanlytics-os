import "server-only";
import { z } from "zod";
import {
  addressOf,
  CONSENT_SOURCES,
  MERGE_WORDS,
  NOTE_MAX,
  NOTE_WORDS,
  PERSON_DETAIL_WORDS,
  PERSON_MODES,
  answerSaidOf,
  normalizeEmail,
  normalizePhone,
  offersYesRefusal,
  ownMessageRefusal,
  personName,
  proposalBelowNeeds,
  whyNotAPhone,
  whyNotAnEmail,
  type WriteWay,
} from "@chanlytics/contracts";
import { load } from "../../../readers";
import { personReach } from "../../../readers/person";
import {
  UUID,
  actAction,
  unlessNotFound,
  approvalWords,
  defineActions,
  noteRow,
  offeredTo,
  propose,
  refuse,
  str,
  type ProposalOutcome,
  type ToolContext,
} from "../context";

/** The person a card names, as every action of this tool reads them: the name the card calls them, and the profile's. */
interface CardPerson {
  id: string;
  who: string;
  /** The profile's own two fields as they stand: what a details card changes, and what its undo sets back. */
  name: string | null;
  email: string | null;
  /** What the page shows in place of a name of their own (their WhatsApp name, number or address), or null. */
  shows: string | null;
}

/**
 * The person a card names: an id a read returned, of someone in this workspace who was not erased, else the refusal in
 * the model's words. One read of the profile for every action of this tool, and the person into the turn's read set,
 * so an answer may cite them. This workspace's alone: RLS shows a member everyone in every workspace they belong to.
 */
async function personOnCard(t: ToolContext, contactId: string): Promise<CardPerson | ProposalOutcome> {
  const id = str(contactId, 40);
  if (!UUID.test(id)) return refuse("contact_id must be an id a read returned");
  const { data: c, error } = await t.ctx.supabase
    .from("contacts")
    .select("id, display_name, wa_profile_name, phone_e164, email, erased_at")
    .eq("tenant_id", t.tenantId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!c || c.erased_at) return refuse("no such person in this workspace");
  // As People names them (personName). What the page shows in place of a name of their own is that, minus the typed name.
  const who = personName(c);
  const shows = c.wa_profile_name || c.phone_e164 || c.email ? personName({ ...c, display_name: null }) : null;
  noteRow(t, "person", id, who, addressOf({ kind: "person", id }));
  return { id, who, name: c.display_name ?? null, email: c.email ?? null, shows };
}
const refused = (p: CardPerson | ProposalOutcome): p is ProposalOutcome => "result" in p;

async function proposePersonMode(
  t: ToolContext,
  input: { contact_id: string; mode: string },
): Promise<ProposalOutcome> {
  // Below the card's role, by the one predicate the registry offers it by (context.ts offeredTo).
  if (!offeredTo(modeAction, t.role)) return refuse(proposalBelowNeeds("person_mode"));
  const mode = str(input.mode, 10);
  if (!(["inherit", ...PERSON_MODES] as string[]).includes(mode))
    return refuse("mode must be auto, ask, never or inherit");
  const person = await personOnCard(t, input.contact_id);
  if (refused(person)) return person;
  const { data: pol } = await t.ctx.supabase
    .from("policies")
    .select("mode")
    .eq("tenant_id", t.tenantId)
    .eq("class", "reply")
    .eq("subject_type", "contact")
    .eq("subject_id", person.id)
    .maybeSingle();
  const LABEL: Record<string, string> = {
    auto: "answers them",
    ask: "asks you first",
    never: "stays silent with them",
    inherit: "follows the workspace rule",
  };
  return propose({
    kind: "person_mode",
    title: `Receptionist for ${person.who}`,
    summary: `The receptionist ${LABEL[mode]}`,
    payload: { contact_id: person.id, mode, previous: pol?.mode ?? "inherit", who: person.who },
  });
}

/** Who reads a note (D8), in the model's word; there is no default. */
const NOTE_FOR = ["receptionist", "team"] as const;
type NoteFor = (typeof NOTE_FOR)[number];
/**
 * What a note's card says of who reads it: the receptionist, before it answers them (00157: a note not for the team
 * alone is read before every answer to that person), or the team alone, in the person page's own words (NOTE_WORDS).
 */
const NOTE_READERS: Record<NoteFor, (who: string) => string> = {
  receptionist: (who) => `The receptionist reads it before it answers ${who}`,
  team: () =>
    `${NOTE_WORDS.teamOnly}: ${NOTE_WORDS.teamOnlyHint.charAt(0).toLowerCase()}${NOTE_WORDS.teamOnlyHint.slice(1)}`,
};

async function proposePersonNote(
  t: ToolContext,
  input: { contact_id: string; body: string; for: NoteFor },
): Promise<ProposalOutcome> {
  // As the route takes it: trimmed, something, and no longer than the table holds -- refused, never cut.
  const body = typeof input.body === "string" ? input.body.trim() : "";
  if (!body) return refuse("body must be the note's words");
  if (body.length > NOTE_MAX) return refuse(`body is ${body.length} characters; a note is at most ${NOTE_MAX}`);
  if (!(NOTE_FOR as readonly string[]).includes(input.for)) return refuse("for must be receptionist or team");
  const person = await personOnCard(t, input.contact_id);
  if (refused(person)) return person;
  return propose({
    kind: "note",
    title: `Note on ${person.who}`,
    summary: `“${body}” · ${NOTE_READERS[input.for](person.who)}`,
    payload: { contact_id: person.id, body, team_only: input.for === "team", who: person.who },
  });
}

async function proposePersonDetails(
  t: ToolContext,
  input: { contact_id: string; name?: string; email?: string },
): Promise<ProposalOutcome> {
  if (input.name === undefined && input.email === undefined) return refuse("details takes name, email or both");
  // As the route takes them: a name trimmed and cut at 80, its spaces one as the door keeps it; an address judged by
  // the one normalizer and kept in its spelling. A card sets a field; it never clears one.
  const name = input.name?.trim().slice(0, 80).replace(/\s+/g, " ").trim();
  if (name === "") return refuse("name must be the name they gave; a card never clears one");
  const typed = input.email?.trim();
  const email = typed === undefined ? undefined : normalizeEmail(typed);
  if (typed !== undefined && !email) return refuse(whyNotAnEmail(typed) ?? "That is not an email address.");
  const person = await personOnCard(t, input.contact_id);
  if (refused(person)) return person;
  // Only what would change: a field that already says it is left out, and a card that changes nothing is none.
  const asked = { name, email: email ?? undefined };
  const changed = (["name", "email"] as const).filter((k) => asked[k] !== undefined && asked[k] !== person[k]);
  if (!changed.length)
    return refuse(`already their ${(["name", "email"] as const).filter((k) => asked[k] !== undefined).join(" and ")}`);
  const to = Object.fromEntries(changed.map((k) => [k, asked[k] as string]));
  const previous = Object.fromEntries(changed.map((k) => [k, person[k]]));
  return propose({
    kind: "person_details",
    title: `Details for ${person.who}`,
    summary: changed
      .map((k) => {
        const was = person[k] ?? PERSON_DETAIL_WORDS.none[k](person.shows);
        return `${PERSON_DETAIL_WORDS.label[k]}: ${was} → ${to[k]}`;
      })
      .join(" · "),
    payload: { contact_id: person.id, who: person.who, ...to, previous },
  });
}

/** The two questions a person is asked, in the words a model is given them. */
const QUESTIONS = { messages: "conversational", offers: "marketing" } as const;
/** Their answer, in a model's words, as the door stores it. */
const ANSWERS = { yes: "opted_in", no: "opted_out", not_asked: "unknown" } as const;
const SOURCE_IDS = CONSENT_SOURCES.map((x) => x.id) as [string, ...string[]];

/**
 * A person's answer, heard by a member (PUT contacts/:id/consent or marketing-consent): a yes or a no, with how they gave
 * it, or "not asked" again. The door's rules first, in its words: a yes to offers is written (a form, or their own
 * message), and an answer "in their own message" names that message.
 */
async function proposeAnswer(
  t: ToolContext,
  input: {
    contact_id: string;
    question: keyof typeof QUESTIONS;
    answer: keyof typeof ANSWERS;
    how?: string;
    message_id?: string;
    note?: string;
  },
): Promise<ProposalOutcome> {
  const purpose = QUESTIONS[input.question];
  const consent = ANSWERS[input.answer];
  const source = consent === "unknown" ? undefined : input.how;
  if (consent !== "unknown" && !source) return refuse("how is required: in_person, phone, form or customer_message");
  if (purpose === "marketing" && consent === "opted_in") {
    const no = offersYesRefusal(source);
    if (no) return refuse(no);
  }
  const messageId = str(input.message_id, 40) || null;
  if (source) {
    const own = ownMessageRefusal(source, messageId);
    if (own) return refuse(own);
  }
  const person = await personOnCard(t, input.contact_id);
  if (refused(person)) return person;
  const how = source ? (CONSENT_SOURCES.find((x) => x.id === source)?.label ?? source) : null;
  return propose({
    kind: "answer",
    title: `${person.who}'s answer`,
    summary: `${person.who} ${answerSaidOf(purpose, consent)}${how ? ` · ${how}` : ""}`,
    payload: {
      contact_id: person.id,
      who: person.who,
      purpose,
      consent,
      ...(source ? { source } : {}),
      ...(messageId ? { message_id: messageId } : {}),
      ...(input.note?.trim() ? { note: input.note.trim().slice(0, 280) } : {}),
    },
  });
}

/** Someone added to People by hand (POST contacts): a number, an address or both, and a name; nobody is messaged. */
function proposeAdd(_t: ToolContext, input: { phone?: string; email?: string; name?: string }): ProposalOutcome {
  const phoneTyped = input.phone?.trim();
  const emailTyped = input.email?.trim();
  if (!phoneTyped && !emailTyped) return refuse("add takes a phone, an email or both");
  const phone = phoneTyped ? normalizePhone(phoneTyped) : null;
  if (phoneTyped && !phone) return refuse(whyNotAPhone(phoneTyped) ?? "That is not a phone number.");
  const email = emailTyped ? normalizeEmail(emailTyped) : null;
  if (emailTyped && !email) return refuse(whyNotAnEmail(emailTyped) ?? "That is not an email address.");
  const name = input.name?.trim().slice(0, 80).replace(/\s+/g, " ") || undefined;
  const who = name || phone || email || "them";
  return propose({
    kind: "person_add",
    title: `Add ${who} to People`,
    summary: `${[name, phone, email].filter(Boolean).join(" · ")} — nobody is messaged by adding them, and their answers start as not asked.`,
    payload: { ...(phone ? { phone } : {}), ...(email ? { email } : {}), ...(name ? { name } : {}) },
  });
}

/** Two records of one person made one (POST contacts/:id/merge): the owner's, and it cannot be undone. */
async function proposeMerge(t: ToolContext, input: { contact_id: string; other_id: string }): Promise<ProposalOutcome> {
  if (!offeredTo(mergeAction, t.role)) return refuse(proposalBelowNeeds("person_merge"));
  if (str(input.contact_id, 40) === str(input.other_id, 40)) return refuse("they are the same record");
  const kept = await personOnCard(t, input.contact_id);
  if (refused(kept)) return kept;
  const other = await personOnCard(t, input.other_id);
  if (refused(other)) return other;
  return propose({
    kind: "person_merge",
    title: MERGE_WORDS.question(kept.who, other.who),
    summary: MERGE_WORDS.detail(kept.who, other.who),
    payload: { contact_id: kept.id, merge: other.id, who: kept.who, other: other.who },
  });
}

/**
 * A first message to someone in People (POST people/:id/message), where they have no thread to answer or a new one is
 * wanted: on a wire their answers allow now (the person's reach, the rule the send asks again: readers/person.ts
 * personReach), the member's words where the wire carries words and an approved message where only one can go.
 */
/** A first message as the model asks it (propose_person action message). */
interface MessageAsk {
  contact_id: string;
  wire?: "whatsapp" | "sms" | "email";
  text?: string;
  subject?: string;
  template_name?: string;
  template_language?: string;
  then?: "receptionist" | "me";
  note?: string;
}

/** What a first message carries on its wire: its words, or a message WhatsApp approved where only one can go; or why not. */
function carried(
  input: MessageAsk,
  carries: WriteWay["carries"],
  who: string,
): { text: string; template: { name: string; language: string } | null } | { refusal: string } {
  const text = input.text?.trim() ?? "";
  const name = input.template_name?.trim();
  const language = input.template_language?.trim();
  const template = name && language ? { name, language } : null;
  if (carries === "approved" && !template)
    return {
      refusal: `only a message WhatsApp approved can go to ${who} on WhatsApp now: name it with template_name and template_language (sequences with action messages lists them)`,
    };
  if (carries === "words" && !text && !template) return { refusal: "text is required: the words to send" };
  return { text, template };
}

async function proposeMessage(t: ToolContext, input: MessageAsk): Promise<ProposalOutcome> {
  const person = await personOnCard(t, input.contact_id);
  if (refused(person)) return person;
  const read = await unlessNotFound(load(t.rc, personReach, { id: person.id }));
  if (!read) return refuse("no such person in this workspace");
  const reach = read.data.reach;
  const wire = input.wire ?? reach.default_wire;
  if (!wire) return refuse(reach.ways.find((w) => w.why)?.why ?? "No message can go to them now.");
  const way = reach.ways.find((w) => w.wire === wire);
  if (!way || !way.ok) return refuse(way?.why ?? `No message can go to them by ${wire} now.`);
  const words = carried(input, way.carries, person.who);
  if ("refusal" in words) return refuse(words.refusal);
  const { text, template } = words;
  const subject = wire === "email" ? input.subject?.trim().slice(0, 200) : undefined;
  const then = input.then ?? "receptionist";
  const firstText =
    reach.first_text_line && wire === "sms" ? ` · the first text carries: ${reach.first_text_line}` : "";
  return propose({
    kind: "person_message",
    title: `Message ${person.who}`,
    summary: `${template ? `“${template.name}” (approved message)` : text} · by ${wire}${subject ? `, subject “${subject}”` : ""} · then ${then === "me" ? "you have the thread" : "the receptionist has it"}${firstText}`,
    payload: {
      contact_id: person.id,
      who: person.who,
      wire,
      ...(template ? { template } : { text }),
      ...(subject ? { subject } : {}),
      then,
      ...(input.note?.trim() ? { note: input.note.trim().slice(0, 280) } : {}),
    },
  });
}

/** Two records made one: propose_person's action merge, an owner's, named so its builder asks its role. */
const mergeAction = actAction({
  kind: "person_merge",
  input: z.object({
    contact_id: z.string().describe("The record kept: an id a read returned."),
    other_id: z.string().describe("The other record of the same person, merged into the kept one."),
  }),
  examples: [{ contact_id: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d", other_id: "b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e" }],
  label: "Preparing a merge",
  words: `Action merge takes contact_id, the record kept, and other_id, another record of the same person: the kept one takes the other's messages, calls, deals, notes and lists. It cannot be undone. Call it only when two records are plainly one person (the same name with the same number or address, or they said so). ${approvalWords("person_merge")}.`,
  build: proposeMerge,
});

/** How the receptionist treats one person: propose_person's action mode, an owner's, named so its builder asks its role. */
const modeAction = actAction({
  kind: "person_mode",
  input: z.object({ contact_id: z.string(), mode: z.enum(["auto", "ask", "never", "inherit"]) }),
  examples: [{ contact_id: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d", mode: "never" }],
  label: "Preparing a receptionist change",
  // Its card's role clause, its own (approvalWords, one derivation): an action beside it may need another role.
  words: `Action mode takes contact_id, the id a read returned, and mode, how the receptionist treats them: auto (answers them), ask (asks a person first), never (stays silent with them), or inherit (follows the workspace's rule). Call it when they want the receptionist to stop, resume or check first with one person; propose_settings with action autonomy changes a whole class instead, and propose_thread_verb acts on one thread. ${approvalWords("person_mode")}.`,
  build: proposePersonMode,
});

/**
 * One person (D11), by action, each a card of its own (the Phase 4 plan, D2, D8, D9): how the receptionist treats them
 * (mode, once propose_person_mode; an owner's), a note on them and who reads it, and the name and address their
 * profile holds (an operator's). Each role is offered the actions it may approve, and reads only their words.
 */
export const propose_person = defineActions({
  name: "propose_person",
  description:
    "Propose an act on one person in People, by action: how the receptionist treats them, a note, their name or email, their answer to messages or offers, a new person, two records merged, or a first message. A card the person asking approves; nothing changes until they do.",
  actions: {
    mode: modeAction,
    note: actAction({
      kind: "note",
      input: z.object({ contact_id: z.string(), body: z.string(), for: z.enum(NOTE_FOR) }),
      examples: [
        {
          contact_id: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
          body: "Prefers morning appointments.",
          for: "receptionist",
        },
      ],
      label: "Preparing a note",
      words: `Action note takes contact_id, the id a read returned, body, the note in the words to keep (at most ${NOTE_MAX} characters), and for, who reads it: receptionist, for what should shape how the receptionist answers them (it reads the note before every answer to them), or team, for the team's own reminders and judgments (the receptionist never reads it). Always give for, from their words: it has no default, and the card says it back. Call it for something about one person worth keeping on their page, such as a preference or what to remember next time; a fact about the business itself, such as parking or a policy, is a settings change and not a note, and a next step with a day is not a note: it rides on a deal's move (propose_deal), or is set on their page.`,
      build: proposePersonNote,
    }),
    details: actAction({
      kind: "person_details",
      input: z.object({ contact_id: z.string(), name: z.string().optional(), email: z.string().optional() }),
      examples: [{ contact_id: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d", name: "Rosa Diaz", email: "rosa@example.com" }],
      label: "Preparing a profile change",
      words:
        "Action details takes contact_id, the id a read returned, and name, email or both: the name the business calls them by and the address they can be written to, the two fields of their profile. Call it when a customer gave their name or an email address in a message and their profile lacks it or says otherwise; read them first (people with action get), since an address a customer writes back when the receptionist asks for one is kept already, and never propose what the profile holds. It never touches their notes, and the card shows each field as it was and as it becomes.",
      build: proposePersonDetails,
    }),
    answer: actAction({
      kind: "answer",
      input: z.object({
        contact_id: z.string().describe("Whose answer: an id a read returned."),
        question: z
          .enum(["messages", "offers"])
          .describe("messages: about their own bookings; offers: offers and news."),
        answer: z.enum(["yes", "no", "not_asked"]).describe("What they said, or not_asked to clear it."),
        how: z
          .enum(SOURCE_IDS)
          .optional()
          .describe("How they told you: in_person, phone, form or customer_message (required for a yes or a no)."),
        message_id: z.string().optional().describe("The message they said it in, for customer_message."),
        note: z.string().optional().describe("A few words kept with the answer."),
      }),
      examples: [
        { contact_id: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d", question: "messages", answer: "yes", how: "in_person" },
      ],
      label: "Preparing their answer",
      words:
        "Action answer records what one person said to one of the two questions: messages (about their own bookings) or offers (offers and news): yes, no, or not_asked again, with how they told you. Only what they said: never record a yes they did not give. A yes to offers has to be in writing (form, or customer_message naming the message), and a spoken yes covers messages alone; a no is honoured however it came.",
      build: proposeAnswer,
    }),
    add: actAction({
      kind: "person_add",
      input: z.object({
        phone: z.string().optional().describe("Their phone number as given."),
        email: z.string().optional().describe("Their email address."),
        name: z.string().optional().describe("Their name."),
      }),
      examples: [{ name: "Rosa Diaz", phone: "+1 555 010 0199" }],
      label: "Preparing a new person",
      words:
        "Action add puts someone in People by hand: a phone, an email or both, and a name. Nobody is messaged by adding them and their answers start as not asked; a number or address already in People opens that person instead.",
      build: (t, input) => Promise.resolve(proposeAdd(t, input)),
    }),
    merge: mergeAction,
    message: actAction({
      kind: "person_message",
      input: z.object({
        contact_id: z.string().describe("Who: an id a read returned."),
        wire: z
          .enum(["whatsapp", "sms", "email"])
          .optional()
          .describe("The channel; leave out for the one their page offers first."),
        text: z.string().optional().describe("The words to send, where the channel carries words."),
        subject: z.string().optional().describe("An email's subject."),
        template_name: z.string().optional().describe("An approved WhatsApp message's name, where only one can go."),
        template_language: z.string().optional().describe("That message's language code, such as en or es."),
        then: z
          .enum(["receptionist", "me"])
          .optional()
          .describe("Who has the thread after it: the receptionist (the default) or the member."),
        note: z.string().optional().describe("A note the receptionist reads before it answers them."),
      }),
      examples: [
        { contact_id: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d", text: "Hi Rosa, your order is ready to pick up." },
      ],
      label: "Preparing a message",
      words:
        "Action message writes first to someone in People: a new conversation on a channel their answers allow now, in the member's words or, where only a message WhatsApp approved can go, that message by name. Use propose_reply for a thread that waits on an answer. The card says the channel and who has the thread after; it leaves 15 seconds after it is approved and can be cancelled within them.",
      build: proposeMessage,
    }),
  },
});
