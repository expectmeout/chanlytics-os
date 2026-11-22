import "server-only";
import { z } from "zod";
import { FILE_YES_USES, SUBJECT_LABELS, asContactId, fileSaidOf } from "@chanlytics/contracts";
import { findPersonsNewestConversation } from "@chanlytics/db/conversations";
import { listFileSubjects } from "@chanlytics/db/files";
import { load } from "../../../../shared/reader";
import { filesNamedForAsk } from "../../../../readers/files";
import { actAction, type ProposalOutcome, type ToolContext } from "../../context/tool-defs";
import { approvalWords, propose, refuse } from "../../context/context";
import { filesNamed } from "../../read/files";
import { draftThreadReply } from "../reply";

/**
 * Rights per person (00691; the content loop PRD's 5.3, 12.1 act/rights, call 13), as three of keep_yes's actions: who is
 * in a photo or a video (as the owner or an operator tells AI, never read from a face); the ask to one of them, a reply in
 * their own conversation that AI drafts and the owner sends through the one send door (the reply card); and that person's
 * own yes, kept with where it was said. AI never decides who is in a file or that anyone said yes.
 */

/** A file by the name a call gives it, and the uses a yes is for: said once, for every action of keep_yes. */
export const fileInput = z.string().min(1).max(120).describe("The photo's or the video's name, as files says it.");
export const usesInput = z
  .array(z.enum(FILE_YES_USES))
  .optional()
  .describe("post, ad, reply, cold_email: each one they said; left out of take_back, every use.");
const personInput = z.string().min(1).max(120).describe("The person's name, as who is in it names them.");

/** The file a call names, or null where the workspace holds none by that name. */
export async function findFileNamed(toolContext: ToolContext, name: string) {
  const { files } = (await load(toolContext.rc, filesNamedForAsk, { names: [name] })).data;
  return filesNamed(files, [name]).found.at(0) ?? null;
}

/** The person a call names among who is in the file, or why not, for the model. */
async function personIn(toolContext: ToolContext, fileId: string, name: string) {
  const people = await listFileSubjects(toolContext.ctx.supabase, toolContext.tenantId, fileId);
  const found = people.find((p) => p.name.toLowerCase() === name.trim().toLowerCase());
  return found ?? `${name} is not named as in it yet: say who is in it first, with action people`;
}

async function peopleOutcome(
  toolContext: ToolContext,
  input: {
    file: string;
    state: "named" | "none" | "unsure";
    people?: { name: string; label: (typeof SUBJECT_LABELS)[number] }[] | undefined;
  },
): Promise<ProposalOutcome> {
  const file = await findFileNamed(toolContext, input.file);
  if (!file) return refuse(`no file named ${input.file}; names come from files with action list`);
  if (input.state === "named" && !input.people?.length) return refuse("name each person in it, or say state none");
  const names = (input.people ?? []).map((p) => p.name.trim()).join(", ");
  return propose({
    kind: "file_people",
    title: input.state === "named" ? `In ${fileSaidOf(file.name)}: ${names}` : `Who is in ${fileSaidOf(file.name)}`,
    summary: input.state === "none" ? "Nobody is in it." : input.state === "unsure" ? "Not sure who is in it." : names,
    payload: { file_id: file.id, file: file.name, state: input.state, people: input.people ?? [] },
  });
}

async function askOutcome(toolContext: ToolContext, input: { file: string; person: string; text: string }) {
  const file = await findFileNamed(toolContext, input.file);
  if (!file) return refuse(`no file named ${input.file}; names come from files with action list`);
  const person = await personIn(toolContext, file.id, input.person);
  if (typeof person === "string") return refuse(person);
  if (!person.contact_id)
    return refuse(
      `${person.name} is not in People, so nothing can be sent to them here. Say so: they can be asked in person, then tell AI their answer with action person_yes`,
    );
  const conversation = await findPersonsNewestConversation(
    toolContext.ctx.supabase,
    toolContext.tenantId,
    asContactId(person.contact_id),
  );
  if (!conversation) return refuse(`${person.name} has no conversation here yet, so the ask goes in person`);
  // The ask is a reply in their own conversation: consent, the window and a first message are the reply card's to judge.
  return draftThreadReply(toolContext, { conversation_id: conversation, text: input.text, voice: "you" });
}

async function personYesOutcome(
  toolContext: ToolContext,
  input: {
    file: string;
    person: string;
    uses?: (typeof FILE_YES_USES)[number][] | undefined;
    said_in: "ai" | "message" | "in_person";
    message_id?: string | undefined;
  },
): Promise<ProposalOutcome> {
  const file = await findFileNamed(toolContext, input.file);
  if (!file) return refuse(`no file named ${input.file}; names come from files with action list`);
  const person = await personIn(toolContext, file.id, input.person);
  if (typeof person === "string") return refuse(person);
  const uses = FILE_YES_USES.filter((use) => (input.uses ?? []).includes(use) && !person.yes_for.includes(use));
  if (!input.uses?.length) return refuse("name what they said yes to: post, ad, reply, cold_email or website");
  if (uses.length === 0) return refuse(`${person.name}'s yes for that is already kept. Say so in a few words`);
  return propose({
    kind: "person_yes",
    title: `Keep ${person.name}'s yes`,
    summary: fileSaidOf(file.name),
    payload: {
      file_id: file.id,
      subject_id: person.id,
      who: person.name,
      uses,
      said_in: input.said_in,
      ...(input.message_id ? { message_id: input.message_id } : {}),
    },
  });
}

/** keep_yes's three actions for a person: who is in it, the ask, and their own yes. */
export const RIGHTS_ACTIONS = {
  people: actAction({
    kind: "file_people",
    input: z.object({
      file: fileInput,
      state: z.enum(["named", "none", "unsure"]).describe("named with people; none when nobody is in it; unsure."),
      people: z
        .array(z.object({ name: personInput, label: z.enum(SUBJECT_LABELS) }))
        .max(20)
        .optional()
        .describe("Each person in it, as the owner named them: a client, staff or other."),
    }),
    examples: [{ file: "chair-by-the-window", state: "named", people: [{ name: "Paola", label: "client" }] }],
    label: "Saying who is in it",
    words:
      "Action people takes file, state and people: only as the person asking says, never from a face. The card waits for their press.",
    build: peopleOutcome,
  }),
  ask: actAction({
    kind: "reply",
    input: z.object({
      file: fileInput,
      person: personInput,
      text: z
        .string()
        .min(1)
        .max(600)
        .describe("The ask, in the owner's voice: what it shows, where it goes, yes or no."),
    }),
    examples: [
      {
        file: "chair-by-the-window",
        person: "Paola",
        text: "Hi Paola! May we share the photo you're in on our Instagram? A yes or no is perfect.",
      },
    ],
    label: "Drafting the ask",
    words: "Action ask takes file, person and text: a reply in that person's own conversation, sent only by its press.",
    build: askOutcome,
  }),
  person_yes: actAction({
    kind: "person_yes",
    input: z.object({
      file: fileInput,
      person: personInput,
      uses: usesInput,
      said_in: z
        .enum(["ai", "message", "in_person"])
        .describe("message when they wrote it; in_person when told face to face."),
      message_id: z.string().max(40).optional().describe("The message they said it in, as a read returned it."),
    }),
    examples: [{ file: "chair-by-the-window", person: "Paola", uses: ["post"], said_in: "message" }],
    label: "Keeping their yes",
    words: `Action person_yes takes file, person, uses, said_in and message_id: only a yes the person gave. ${approvalWords("person_yes")}.`,
    build: personYesOutcome,
  }),
};
