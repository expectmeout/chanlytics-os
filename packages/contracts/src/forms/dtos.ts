/**
 * What a business's own screens are handed about its forms (the Forms plan, 3.6; the canvas): the list in Campaigns ›
 * Forms, one form's sheet (the form as it is being changed, what happens next, where it is shared and what each place
 * brought, its requests and its held pile), and one request as Inbox answers it. Shapes only, as the wire says them;
 * what each screen says of them is the screen's own.
 */
import { z } from "zod";
import { FormDescription } from "./shape";
import type { RequestLine } from "./request-words";

export type FormStateDto = "draft" | "live" | "off";

/** Where an entry stands for its owner: nobody has answered it, it was answered, it is held for a look, or it is a test. */
export type EntryStandingDto = "open" | "answered" | "held" | "test";

/** Why an entry is held, as the database keeps it. */
export type EntryHeldWhyDto = "hidden_field" | "too_fast" | "too_many" | "member";

/** A form as Campaigns › Forms lists it. */
export interface FormListRowDto {
  id: string;
  slug: string;
  heading: string;
  state: FormStateDto;
  /** A published form whose draft holds changes that are not live yet. */
  changed: boolean;
  last_entry_at: string | null;
  /** How many entries wait in its held pile. */
  held: number;
}

export interface FormsDto {
  forms: FormListRowDto[];
  /** Whether this member may make and change forms. */
  can_change: boolean;
}

/** One place a form is shared, with what it brought over the sheet's window. */
export interface FormLinkDto {
  id: string;
  code: string;
  place: string;
  printed: boolean;
  stopped: boolean;
  opens: number;
  requests: number;
  visits: number;
}

/** One entry as the sheet lists it. */
export interface FormEntryRowDto {
  id: string;
  name: string | null;
  created_at: string;
  standing: EntryStandingDto;
  held_why: EntryHeldWhyDto | null;
  /** The place its link was shared, where it came through one. */
  place: string | null;
  /** A number alone: nothing can be sent to them first. */
  phone_only: boolean;
}

/** One form's sheet. */
export interface FormSheetDto {
  id: string;
  slug: string;
  state: FormStateDto;
  draft: FormDescription;
  /** What visitors see now; null for a draft never published. */
  live: FormDescription | null;
  changed: boolean;
  published_at: string | null;
  last_entry_at: string | null;
  links: FormLinkDto[];
  /** What the form brought over the last `days` days: opens are counted, never people. */
  results: {
    days: number;
    opens: number;
    requests: number;
    talked: number;
    visits: number;
    new_people: number;
    known_people: number;
  };
  entries: FormEntryRowDto[];
  held: FormEntryRowDto[];
  /** Whether the business has a chat a visitor can carry on in. */
  chat: boolean;
  /**
   * Whether a reply by email can go from this business now, as the send door answers it (campaigns channelsReady's
   * email): the thank-you promises one only where it can, so the sheet says where it cannot. `why` is the door's own
   * sentence; `connect`, that the business has the door that opens it (Settings › Connections); `unchecked`, that it
   * could not be asked just now, which is not a no and is said of nothing. Absent on a read from before it, which is
   * said of nothing too.
   */
  email?: { ready: boolean; why: string | null; connect: boolean; unchecked: boolean };
  can_change: boolean;
}

/** One request as Inbox answers it. */
export interface FormRequestDto {
  id: string;
  form_id: string;
  heading: string;
  created_at: string;
  lines: RequestLine[];
  reach: { name: string | null; email: string | null; phone: string | null };
  /** The place its link was shared, and who sent them where a site or a campaign said so. */
  place: string | null;
  sender: string | null;
  /** Their page, once the entry has its person; null while it is held with none. */
  person: { id: string; name: string | null; email: string | null } | null;
  /** Whether the business knew them before this request: their record is older than it. Null with no person yet. */
  known: boolean | null;
  standing: EntryStandingDto;
  held_why: EntryHeldWhyDto | null;
  /** What answered it, where it was: a reply sent from it, a conversation that took it over, or a member's word. */
  answered: { how: "reply" | "conversation" | "marked"; at: string; conversation_id: string | null } | null;
  /** A reply to it failed to reach them. */
  unreached: boolean;
  /** The address typed on this request, where their page holds a different one: the reply waits for a pick. */
  other_email: string | null;
  /** What they asked, as the note says it: what AI is handed to draft a reply from. */
  note: string;
  /** Whether the form asks AI to draft the reply. */
  drafts: boolean;
}

/**
 * A request nobody has answered, as Needs you lists it (Today's read, the Inbox's tab, the one count): who asked, in
 * their own words, through which form, and whether a reply to it failed to reach them.
 */
export interface FormOpenRequestDto {
  id: string;
  form_id: string;
  /** The form's heading, as the visitor saw it. */
  heading: string;
  created_at: string;
  person_id: string | null;
  /** Who asked, as they typed it: their name, else their address or their number. */
  name: string | null;
  /** What they wrote: their first longer answer, else the first thing they answered that is not who they are. */
  words: string;
  /** The place its link was shared, where it came through one. */
  place: string | null;
  /** A number alone: nothing can be sent to them first. */
  phone_only: boolean;
  /** A reply to it left and never reached them. */
  unreached: boolean;
}

/**
 * One form's entries held for a look that nobody has looked at in FORM_HELD_SAID_AFTER_DAYS days (limits.ts): what
 * Today's quiet line says, and the form whose held pile it opens. They go by themselves at 30 days
 * (form_entries_purge).
 */
export interface FormHeldDto {
  form_id: string;
  /** The form's heading, as the visitor of the newest of them saw it. */
  heading: string;
  /** How many of its held entries have waited that long. */
  held: number;
  /** When the oldest of them came. */
  oldest_at: string;
}

/**
 * What a workspace's forms brought over the last `days` days, as Reports › Campaigns says it: each form that was
 * ever published, with its opens, its requests, the conversations and visits that followed, who was new, and each
 * place a request came through. Opens are counted, never people.
 */
export interface FormsReportDto {
  days: number;
  forms: Array<{
    id: string;
    heading: string;
    results: Omit<FormSheetDto["results"], "days">;
    places: Array<{ place: string; requests: number; visits: number }>;
  }>;
}

/** What a member's press on Campaigns › Forms asks. */
export const FormPress = z.discriminatedUnion("act", [
  // A form made by saying what to collect: AI drafts it.
  z.strictObject({ act: z.literal("make"), sentence: z.string().trim().min(2).max(600) }),
  // The draft kept as its owner changed it, in place.
  z.strictObject({ act: z.literal("save"), form_id: z.uuid(), draft: FormDescription }),
  // AI told what to change, or asked for one question to add.
  z.strictObject({
    act: z.enum(["tell", "question"]),
    form_id: z.uuid(),
    sentence: z.string().trim().min(2).max(600),
  }),
  z.strictObject({ act: z.enum(["publish", "turn_on", "turn_off", "delete", "duplicate"]), form_id: z.uuid() }),
]);
export type FormPress = z.infer<typeof FormPress>;

/** What a press on Campaigns › Forms answers: the form it made or changed, or what AI said instead. */
export interface FormPressed {
  form_id: string | null;
  /** A draft AI wrote for the owner to keep or let go (a change told, a question proposed): never kept by itself. */
  proposed: FormDescription | null;
  /** AI's own sentence: what it changed, why a question helps, or one question back to the owner. */
  said: string | null;
  /** One question back, where the owner's words held no form. */
  asked: boolean;
  /** AI could not draft it: nothing was made and nothing changed. */
  failed: boolean;
}

/** What a press on one place a form is shared asks: a link made by saying where, one renamed, stopped or started again. */
export const FormLinkPress = z.discriminatedUnion("act", [
  z.strictObject({ act: z.literal("make"), form_id: z.uuid(), place: z.string().trim().min(1).max(60) }),
  z.strictObject({ act: z.literal("rename"), link_id: z.uuid(), place: z.string().trim().min(1).max(60) }),
  z.strictObject({ act: z.enum(["stop", "start"]), link_id: z.uuid() }),
]);
export type FormLinkPress = z.infer<typeof FormLinkPress>;

/** What a press on one request asks. */
export const FormRequestPress = z.discriminatedUnion("act", [
  // The reply, sent by the road named: by email (to the address agreed, where the request's differs from their page's)
  // or in the chat they already have.
  z.strictObject({
    act: z.literal("reply"),
    entry_id: z.uuid(),
    wire: z.enum(["email", "whatsapp"]),
    text: z.string().trim().min(1).max(4000),
    subject: z.optional(z.string().trim().min(1).max(200)),
    email_to: z.optional(z.email().max(254)),
  }),
  z.strictObject({ act: z.enum(["mark", "unmark", "hold", "let_through"]), entry_id: z.uuid() }),
]);
export type FormRequestPress = z.infer<typeof FormRequestPress>;
