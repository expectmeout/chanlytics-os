/**
 * The calls a new conversation makes (a conversation begins from the Inbox): who matches a search, someone added, how
 * a person can be reached, Ask's draft, the approved messages, the send, and the note that follows it. A courier: every
 * rule is the server's, and what it refuses is said in its own words. The sheet makes no request of its own.
 *
 * It asks the routes themselves and imports none of People's pages: the sheet is loaded on demand from the Inbox's
 * three tabs, and a module of People's page pulled into it regroups the chunks four other pages load (measured on
 * 7 October 2026: thirteen to twenty kilobytes on each of People, Campaigns, Sent and Templates).
 */
import {
  NEW_CONVERSATION_WORDS as W,
  poolRowOf,
  type ConsentChannel,
  type PersonDraftInput,
  type PersonRowVM,
} from "@chanlytics/contracts";
import { api } from "@/legacy-bridge/api";
import { workspaceZone } from "@/legacy-bridge/zone";
import { surfaceValue } from "../../surface-values";
import type { ApprovedTemplate } from "../types";

/**
 * Who matches, from the server (GET contacts, which matches a name, a WhatsApp name or three digits of a number), read
 * as People reads a row (contracts poolRowOf). With no words, the first page: who was heard from last.
 */
export async function findPeople(q: string): Promise<PersonRowVM[]> {
  const [r, tz] = await Promise.all([api()("GET contacts", { query: q ? { q } : undefined }), workspaceZone()]);
  if (!r.ok) return [];
  const now = new Date();
  return r.data.people.map((p) => poolRowOf(p, { tz, now, dealsOn: !!r.data.deals_on, viewer: null, ready: null }));
}

/**
 * Someone the business meets before they ever write, added by number through People's own door (POST contacts): a
 * number already here answers with that person, never a second one.
 */
export async function addByNumber(d: {
  name: string;
  phone: string;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const name = d.name.trim();
  const r = await api()("POST contacts", { body: { phone: d.phone.trim(), ...(name ? { name } : {}) } });
  if (r.ok) return { ok: true, id: r.data.contact_id };
  // The field's own sentence where the route named one, else the refusal's.
  return { ok: false, error: (r.fields && Object.values(r.fields)[0]) || r.message || W.who.notAdded };
}

/** How one person can be written to and called now (GET people/[id]/reach). */
export const readReach = (id: string) => api()("GET people/[id]/reach", { params: { id } });

/** Ask writes the words, or a call's brief, or asks what it needs to know first (POST people/[id]/draft). */
export const askDraft = (id: string, body: PersonDraftInput) =>
  api()("POST people/[id]/draft", { params: { id }, body, once: true });

/**
 * What a send carries: the wire the member chose, the words or the approved message, a subject for an email, who
 * answers, and the plan as the note the receptionist reads (state.ts firstMessageOf says when).
 */
export interface FirstMessage {
  wire: ConsentChannel;
  text?: string;
  subject?: string;
  template?: { name: string; language: string };
  /** The address the member agreed an email goes to, where the server asked (Refusal.confirmEmailTo). */
  email_to?: string;
  then: "receptionist" | "me";
  note?: string;
}

/**
 * The send (POST people/[id]/message), sent once however often it is pressed: the client's own key, made at the first
 * send and kept until it lands (api.ts `once`, decision 0035), so a press after a timeout is the same request and is
 * answered with the first receipt, and the same words sent again on purpose, later, are a new intent and go. Never a
 * key made from the words: one such answered a second send of the same approved message to the same person, the same
 * day, with the first receipt, and sent nothing.
 */
export const sendFirst = (id: string, body: FirstMessage) =>
  api()("POST people/[id]/message", { params: { id }, body, once: true });

/**
 * A queued send taken back inside its window (POST messages/[id]/cancel-send, the reply's own undo). The note that
 * said the team wrote to them goes with it (POST contacts/[id]/notes/remove): with nothing delivered it would not be
 * true, and the receptionist reads a note as a fact. Answers the cancel's own result: too late is said in its words.
 */
export async function undoFirst(sent: { personId: string; messageId: string; noteId: string | null }) {
  const canceled = await api()("POST messages/[id]/cancel-send", { params: { id: sent.messageId } });
  if (canceled.ok && sent.noteId) {
    await api()("POST contacts/[id]/notes/remove", {
      params: { id: sent.personId },
      body: { note_id: sent.noteId },
      refresh: "behind",
    });
  }
  return canceled;
}

/**
 * A note on their page, through the notes door (POST contacts/[id]/notes): the plan the receptionist reads, or how a
 * call went. People is read again behind it, as after any note.
 */
export const keepNote = (id: string, body: string, teamOnly: boolean) =>
  api()("POST contacts/[id]/notes", {
    params: { id },
    body: { body, team_only: teamOnly },
    refresh: "behind",
    once: true,
  });

/**
 * The workspace's approved WhatsApp messages: the ones the Inbox already holds, else read now (Conversations and Live
 * draw the act without the Inbox's read). Null when they could not be read.
 */
export async function approvedMessages(): Promise<ApprovedTemplate[] | null> {
  const held = surfaceValue("inbox")?.templates;
  if (Array.isArray(held)) return held;
  const r = await api()("GET templates");
  return r.ok ? (r.data.templates ?? []).filter((t) => t.channel === "whatsapp") : null;
}
