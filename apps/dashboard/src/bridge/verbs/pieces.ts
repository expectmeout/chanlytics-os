/**
 * A piece's writes from its own screen (the content loop's pass 1b; Campaigns › Content's viewer and its sheets): take
 * it down, say a post was deleted by hand, say who is in it, and the ask a person in it is sent (AI's draft, the send,
 * that they were asked, what they answered). Each answers as the typed client answers; the screen says what came of it.
 */
import type { FileYesUse } from "@chanlytics/contracts";
import { api } from "@/bridge/api";

/** What PATCH files/[id]/people takes of a person's answer: their yes, a no, or their yes taken back. */
export type PersonAnswer =
  | { subject_id: string; uses: FileYesUse[]; said_in: "message" | "in_person"; message_id?: string }
  | { subject_id: string; said: "no" }
  | { subject_id: string; said: "took_back"; uses?: FileYesUse[] };

/** Take down (00682): the piece comes down everywhere it is up, and what waits for its time is let go. */
export const takeDownPiece = (fileId: string) => api()("DELETE files/[id]/posts", { params: { id: fileId } });

/** "I deleted it", of a post Chanlytics could not take down: the place is asked whether it is gone. */
export const markDeletedByHand = (fileId: string, postId: string) =>
  api()("PUT files/[id]/posts", { params: { id: fileId }, body: { post_id: postId } });

/** Who is in it (00681): nobody, or not sure. People are named to AI, which keeps them by its own card. */
export const sayWhoIsIn = (fileId: string, state: "none" | "unsure") =>
  api()("POST files/[id]/people", { params: { id: fileId }, body: { state } });

/** AI's draft of the ask, for the owner to read and send (POST people/[id]/draft): asked once a person and uses. */
export const draftPersonAsk = (
  contactId: string,
  body: { how: "message"; wire?: "whatsapp" | "sms" | "email"; about: string },
) => api()("POST people/[id]/draft", { params: { id: contactId }, body, once: true });

/** The ask sent on the person's own thread; `key` makes a second press of the same words the same message. */
export const sendPersonAsk = (conversationId: string, text: string, key: string) =>
  api()("POST conversations/[id]/reply", { params: { id: conversationId }, body: { text }, idempotencyKey: key });

/** That a person in it was sent the ask, on which channel and about which uses. */
export const markPersonAsked = (fileId: string, body: { subject_id: string; via: string; uses: FileYesUse[] }) =>
  api()("PUT files/[id]/people", { params: { id: fileId }, body });

/** What a person in it answered, as the owner read it. */
export const keepPersonAnswer = (fileId: string, body: PersonAnswer) =>
  api()("PATCH files/[id]/people", { params: { id: fileId }, body });
