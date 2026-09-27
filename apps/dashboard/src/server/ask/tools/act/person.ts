import "server-only";
import { z } from "zod";
import {
  NOTE_MAX,
  NOTE_WORDS,
  PERSON_DETAIL_WORDS,
  PERSON_MODES,
  PROPOSAL_SPECS,
  normalizeEmail,
  proposalBelowNeeds,
  whyNotAnEmail,
} from "@chanlytics/contracts";
import { roleAtLeast } from "../../../with-route";
import {
  UUID,
  actAction,
  approvalWords,
  defineActions,
  noteRow,
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
}

/**
 * The person a card names: an id a read returned, of someone in this workspace who was not erased, else the refusal in
 * the model's words. One read of the profile for every action of this tool, and the person into the turn's read set,
 * so an answer may cite them.
 */
async function personOnCard(t: ToolContext, contactId: string): Promise<CardPerson | ProposalOutcome> {
  const id = str(contactId, 40);
  if (!UUID.test(id)) return refuse("contact_id must be an id a read returned");
  const { data: c, error } = await t.ctx.supabase
    .from("contacts")
    .select("id, display_name, wa_profile_name, phone_e164, email, erased_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!c || c.erased_at) return refuse("no such person in this workspace");
  const who = c.display_name || c.wa_profile_name || c.phone_e164 || c.email || "this person";
  noteRow(t, "person", id, who, `clients/${id}`);
  return { id, who, name: c.display_name ?? null, email: c.email ?? null };
}
const refused = (p: CardPerson | ProposalOutcome): p is ProposalOutcome => "result" in p;

async function proposePersonMode(
  t: ToolContext,
  input: { contact_id: string; mode: string },
): Promise<ProposalOutcome> {
  if (!roleAtLeast(t.role, PROPOSAL_SPECS.person_mode.needs)) return refuse(proposalBelowNeeds("person_mode"));
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
    summary: changed.map((k) => `${PERSON_DETAIL_WORDS[k]}: ${person[k] ?? "none"} → ${to[k]}`).join(" · "),
    payload: { contact_id: person.id, who: person.who, ...to, previous },
  });
}

/**
 * One person (D11), by action, each a card of its own (the Phase 4 plan, D2, D8, D9): how the receptionist treats them
 * (mode, once propose_person_mode; an owner's), a note on them and who reads it, and the name and address their
 * profile holds (an operator's). Each role is offered the actions it may approve, and reads only their words.
 */
export const propose_person = defineActions({
  name: "propose_person",
  description:
    "Propose a change to someone in People, by action: a card the person asking approves, and nothing changes until they do.",
  actions: {
    mode: actAction({
      kind: "person_mode",
      input: z.object({ contact_id: z.string(), mode: z.enum(["auto", "ask", "never", "inherit"]) }),
      examples: [{ contact_id: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d", mode: "never" }],
      label: "Preparing a receptionist change",
      // Its card's role clause, its own (approvalWords, one derivation): an action beside it may need another role.
      words: `Action mode takes contact_id, the id a read returned, and mode, how the receptionist treats them: auto (answers them), ask (asks a person first), never (stays silent with them), or inherit (follows the workspace's rule). Call it when they want the receptionist to stop, resume or check first with one person; propose_autonomy changes a whole class instead, and propose_thread_verb acts on one thread. ${approvalWords("person_mode")}.`,
      build: proposePersonMode,
    }),
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
      words: `Action note takes contact_id, the id a read returned, body, the note in the words to keep (at most ${NOTE_MAX} characters), and for, who reads it: receptionist (the receptionist reads it before it answers them, so it shapes what they hear) or team (the team alone; the receptionist never reads it). Say for every time, from their words: it has no default, and the card says it back. Call it for something about one person worth keeping on their page, such as a preference or what to remember next time; a fact about the business itself, such as parking or a policy, is a settings change and not a note, and a next step with a day is propose_deal's.`,
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
  },
});
