/**
 * What the person doors take: one schema per door, the route's input, the shape the verb layer sends (the sheets and
 * Ask's cards through one commit, legacy-bridge/verbs), and what an act tool checks a card's body against before it
 * proposes it. They stood in each route file and again in the act tools' own checks, so a rule changed in one place
 * left the other answering in older words (the sheets as verbs, 14 Oct 2026). Moved whole: each answers what its
 * route answered.
 */
import { z } from "zod";
import { isRealDate } from "../../config/workspace-config/config-rules";
import { NOTE_LINE_MAX, NOTE_MAX } from "../../notes/person-notes";
import { CONSENT_STATES } from "../../shared/enums";

/** How the receptionist treats one person: its own way, asking first, never, or the workspace's (inherit). */
export const PERSON_RECEPTIONIST_MODES = ["auto", "ask", "never", "inherit"] as const;
export type PersonReceptionistMode = (typeof PERSON_RECEPTIONIST_MODES)[number];

/** A batch door's people: fifty at a time, as each batch door has always taken them. */
const SOME_PEOPLE = z.array(z.string().uuid()).min(1, "Pick at least one person.").max(50, "Fifty at a time.");
const CONSENT = z.enum(CONSENT_STATES, { message: "Consent must be one of: opted_in, opted_out, unknown." });
const MODE = z.enum(PERSON_RECEPTIONIST_MODES, { message: "Mode must be one of: auto, ask, never, inherit." });

/**
 * One person's answer to one of the two questions (PUT contacts/[id]/consent, PUT contacts/[id]/marketing-consent):
 * the answer, how it was given, a note, and the message they said it in where it was their own.
 */
export const ConsentAnswerBody = z.object({
  consent: CONSENT,
  source: z.string().optional(),
  note: z.string().optional(),
  message_id: z.string().uuid({ message: "Choose one of their messages." }).optional(),
});
export type ConsentAnswer = z.infer<typeof ConsentAnswerBody>;

/** The same answer for many people at once (PUT contacts/consent, PUT contacts/marketing-consent). */
export const ConsentManyBody = z.object({
  ids: SOME_PEOPLE,
  consent: CONSENT,
  source: z.string().optional(),
  note: z.string().optional(),
});

/** How the receptionist treats one person (PUT contacts/[id]/receptionist). */
export const ReceptionistModeBody = z.object({ mode: MODE });

/** The same for many people (PUT contacts/receptionist). */
export const ReceptionistManyBody = z.object({ ids: SOME_PEOPLE, mode: MODE });

/** One line under many people's notes (PUT contacts/notes), appended and never replacing. */
export const NotesAppendManyBody = z.object({
  ids: SOME_PEOPLE,
  append: z
    .string()
    .trim()
    .min(1, "Write the note first.")
    .max(NOTE_LINE_MAX, `A note line is at most ${NOTE_LINE_MAX} characters.`),
});

/** The other record of the same person, merged into this one (POST contacts/[id]/merge). */
export const PersonMergeBody = z.object({
  merge: z.uuid({ message: "Choose the record to merge into this one." }),
});

/**
 * A person added by hand (POST contacts): a number or an address, and a name. Which door it came through is the
 * caller's word, kept only where it names a door the hand may (the route says which).
 */
export const PersonAddBody = z.object({
  phone: z.string().optional(),
  email: z.string().optional(),
  name: z.string().optional(),
  source: z.string().optional(),
});
export type PersonAdd = z.infer<typeof PersonAddBody>;

/**
 * A note on a person, new or changed (POST contacts/[id]/notes): its words, who it is for, whether the receptionist
 * reads it, and a day, which makes it a step (00166), on the deal it moves where it names one.
 */
export const NoteWriteBody = z
  .object({
    body: z.string().trim().min(1).max(NOTE_MAX),
    /** The member it is for; absent or null is for everyone. */
    for_user_id: z.string().uuid().nullable().optional(),
    /** For the team only: the receptionist never reads it. */
    team_only: z.boolean().optional(),
    /** Absent: a new note. Present: its author's change, with the version the page saw. */
    note_id: z.string().uuid().optional(),
    version: z.number().int().min(1).optional(),
    /** Its day, which makes it a step, and the team's (00166): a real day by the business's calendar. */
    due_on: z.string().refine(isRealDate, "A day, as 2026-09-30.").nullable().optional(),
    /** The person's own deal it moves, when it names one. */
    deal_id: z.string().uuid().nullable().optional(),
    /** On a change: take its day away. A change that does not name a day keeps the one it has. */
    clear_due: z.boolean().optional(),
  })
  .strict();
export type NoteWrite = z.infer<typeof NoteWriteBody>;
