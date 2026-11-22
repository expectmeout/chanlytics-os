/**
 * Who is in a piece, as its sheet says it (00691; the content loop PRD's 5.3 and 21.3, call 13; the journey canvas, board
 * Piece, cells 25 to 35): each person the owner named, in the piece itself or in what it was drawn from, and where their
 * yes for one use stands. Rights are per person and per use, and never read from a face. Pure: the record and a clock are
 * handed in.
 */
import { fileYesUsesSaid } from "../files/yes";
import type { FileYesUse } from "../files/limits";
import type { SubjectLabel, SubjectsState } from "../files/subjects";

/** A yes of one person's that stands, with where it was said and, where it was said in a message, their own words. */
export interface PersonYesDto {
  use: FileYesUse;
  said_in: string;
  at: string;
  quote: string | null;
}

/** One person in a piece, as GET files/[id] answers them. */
export interface PiecePersonDto {
  /** Their row in the file they were named in: the piece itself, or a photo or clip it was drawn from. */
  id: string;
  file_id: string;
  name: string;
  label: SubjectLabel;
  /** The person in People, where the workspace knows them; an ask can go only to one it does. */
  contact_id: string | null;
  /** Their newest conversation, and the channel a reply there goes out on; null where they have none. */
  conversation: { id: string; channel: string } | null;
  yes: PersonYesDto[];
  /** The uses a yes of theirs was taken back for, newest first. */
  took_back: { use: FileYesUse; at: string }[];
  asked: { at: string; via: string; uses: FileYesUse[] } | null;
  said_no_at: string | null;
  /** What they wrote since they were asked, where nothing has been kept of it yet: the owner reads it as a yes or a no. */
  answered: { at: string; words: string; message_id: string } | null;
}

/** Who is in a piece: whether its people are known, and each of them. */
export interface PiecePeopleDto {
  state: SubjectsState;
  people: PiecePersonDto[];
}

/** Where one person stands for one use, the first that is so: what the sheet's line says of them. */
export type PersonStands =
  | { is: "yes"; yes: PersonYesDto; also: FileYesUse[] }
  | { is: "took_back"; at: string }
  | { is: "no"; at: string }
  | { is: "answered"; at: string; words: string; messageId: string }
  | { is: "asked"; at: string; via: string }
  | { is: "none" };

/** Where a person stands for a use: a yes that stands, then what was said last, then nothing. */
export function personStandsOf(person: PiecePersonDto, use: FileYesUse): PersonStands {
  const yes = person.yes.find((y) => y.use === use);
  if (yes) return { is: "yes", yes, also: person.yes.filter((y) => y.use !== use).map((y) => y.use) };
  const back = person.took_back.find((b) => b.use === use);
  // Asked again since they took it back: the ask is what stands.
  if (back && !(person.asked && person.asked.at > back.at)) return { is: "took_back", at: back.at };
  if (person.said_no_at) return { is: "no", at: person.said_no_at };
  if (person.answered)
    return {
      is: "answered",
      at: person.answered.at,
      words: person.answered.words,
      messageId: person.answered.message_id,
    };
  if (person.asked?.uses.includes(use)) return { is: "asked", at: person.asked.at, via: person.asked.via };
  return { is: "none" };
}

/** The first person whose yes for a use is missing: who the piece's one fix names. Null where every one has said yes. */
export const personToAskOf = (people: PiecePeopleDto | null, use: FileYesUse): PiecePersonDto | null =>
  people?.people.find((p) => personStandsOf(p, use).is !== "yes") ?? null;

/** A person's initials, for their mark: "Paola Ruiz" is PR, "Maria" is MA. */
export function personInitialsOf(name: string): string {
  const words = name.trim().split(/\s+/u).filter(Boolean);
  const first = words[0] ?? "";
  const letters = words.length > 1 ? `${first.charAt(0)}${(words.at(-1) ?? "").charAt(0)}` : first.slice(0, 2);
  return letters.toUpperCase() || "?";
}

/** The clock a line reads its times through: a short moment ("Mon 3:40 PM"), as the page's zone says it. */
type SaysWhen = (iso: string) => string;

const WHERE_SAID: Record<string, string> = { message: "", in_person: " in person", ai: "", before: "" };

export const PIECE_PEOPLE_WORDS = {
  title: "Who's in it",
  noOne: "No one's in it",
  change: "Change",
  /** Nobody named yet: what the look counted, where it counted anyone. */
  whoAreThey: (seen: number | null) =>
    seen && seen > 0 ? `AI sees ${seen} ${seen === 1 ? "person" : "people"} in it. Who are they?` : "Who's in it?",
  nameHint: "Say who's in it",
  /** What the line to AI is begun with, for the owner to finish. */
  nameAsk: (piece: string) => `In ${piece}: `,
  noOneKnown: "No one you'd know",
  unsure: "Not sure who's in it",
  unsureNote: "Nothing new is posted with it until you say.",
  nameThem: "Name them",
  ask: (name: string) => `Ask ${name}`,
  /** A person the workspace cannot write to from here. */
  askInPerson: (name: string) => `${name} isn't in People, so ask in person.`,
  saidYesInPerson: "They said yes in person",
  thatsAYes: "That's a yes",
  thatsANo: "That's a no",
  notAYes: "Not a yes?",
  undo: "Undo",
  again: (name: string) => `Make it again without ${name}`,
  followed: "What followed",
} as const;

/** A person's line: where their yes for this use stands, in the owner's words. */
export function personSaidOf(
  person: Pick<PiecePersonDto, "label">,
  stands: PersonStands,
  use: FileYesUse,
  says: { when: SaysWhen; channel: (via: string) => string },
): { line: string; tone: "ok" | "you" | "" } {
  const { when } = says;
  const team = person.label === "staff";
  if (stands.is === "yes") {
    const uses = fileYesUsesSaid([use, ...stands.also]);
    const where = WHERE_SAID[stands.yes.said_in] ?? "";
    const said = `said yes to ${uses}${where}`;
    return {
      line: team
        ? `On your team · ${said}`
        : `${said.charAt(0).toUpperCase()}${said.slice(1)} · ${when(stands.yes.at)}`,
      tone: "ok",
    };
  }
  if (stands.is === "took_back") return { line: `Took back their yes · ${when(stands.at)}`, tone: "you" };
  if (stands.is === "no") return { line: `Said no · ${when(stands.at)}`, tone: "you" };
  if (stands.is === "answered") return { line: `Answered ${when(stands.at)}`, tone: "you" };
  if (stands.is === "asked")
    return { line: `Asked ${when(stands.at)} on ${says.channel(stands.via)} · no answer yet`, tone: "" };
  return { line: `Hasn't said yes to ${fileYesUsesSaid([use])}`, tone: "you" };
}

/** The ask a person is sent (the canvas's cell 30): its sheet's words, and what AI is told to write. */
export const PERSON_ASK_WORDS = {
  title: (name: string) => `Ask ${name}`,
  sub: (piece: string) => `For “${piece}”`,
  to: "To",
  about: "About",
  aboutSaid: (uses: readonly FileYesUse[], places: string) =>
    uses.includes("ad") ? `Posts and ads on ${places}` : `Posts on ${places}`,
  writtenByAi: "Written by AI",
  writing: "AI is writing it",
  adsToo: "Ask about ads too",
  send: "Send",
  changeWords: "Change the words",
  sent: (name: string) => `Asked ${name}`,
  /** What the draft is asked for (POST people/[id]/draft): what it shows, where it would go, and that a yes or no is enough. */
  instruction: (piece: { what: string; name: string }, uses: readonly FileYesUse[], places: string) =>
    `Ask them whether we may share ${piece.what} they are in (“${piece.name}”) ${
      uses.includes("ad") ? `in posts and ads on ${places}` : `on our ${places}`
    }. Warm and short. Say a yes or no is all we need. No offer, no price.`,
} as const;
