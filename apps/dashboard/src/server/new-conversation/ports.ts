/**
 * A member begins a conversation, in this runtime: what core's beginConversation needs of the world. The reply's and
 * the hand-back's ports are the ones those verbs already run on; a person is read as People reads them, on the
 * member's own session; the channels are asked fresh, since a send is about to be committed on them; and a thread is
 * opened through the door (conversation_open, 00351), then read back as every conversation verb reads one; and the plan
 * is kept through the notes door (person_note_add, 0007), as the person's page keeps a note.
 */
import "server-only";
import { SMS_FOOTER, smsBody } from "@chanlytics/channels";
import { asContactId } from "@chanlytics/contracts";
import type { BeginPorts } from "@chanlytics/core";
import { addPersonNote, openConversation, personRow, textReached } from "@chanlytics/db";
import { channelsReadyOf } from "../campaigns/channels-ready";
import { noteAnswer } from "../people/person-notes";
import { replyPorts, threadPorts } from "../ports/core-ports";
import { loadConversation } from "../verbs";
import { dbRefusal, type RouteContext } from "../with-route";

export function beginPorts(ctx: RouteContext): BeginPorts {
  return {
    reply: replyPorts(ctx),
    handBack: threadPorts(ctx),
    person: (tenantId, personId) => personRow(ctx.supabase, tenantId, personId),
    ready: (tenantId) => channelsReadyOf(ctx, tenantId, { fresh: true, withPause: false }),
    open: async (tenantId, personId) => {
      const id = await openConversation(ctx.supabase, tenantId, personId).catch((e: unknown) => {
        // The door's own refusal keeps its words and its status; anything else is the database's, and a 503.
        throw dbRefusal(e as { code?: string | null; message: string });
      });
      const conv = await loadConversation(ctx, id);
      return { ...conv, contact_id: asContactId(conv.contact_id) };
    },
    textedBefore: (tenantId, conversationId) => textReached(ctx.supabase, tenantId, conversationId),
    // The words whole and the line whole, or nothing: the carrier's ceiling cuts a text that is too long (smsBody), and
    // would cut the line that says how to stop with it.
    firstText: (text) => {
      const out = smsBody(text, true);
      return out === text.trim() || out.endsWith(SMS_FOOTER) ? out : null;
    },
    // For the receptionist to read, never for the team alone: what the door answers is read as the notes route reads it.
    keepNote: async (personId, body) => {
      const { data, error } = await addPersonNote(ctx.supabase, personId, body, false);
      return noteAnswer("person_note_add", data, error).note?.id ?? null;
    },
  };
}
