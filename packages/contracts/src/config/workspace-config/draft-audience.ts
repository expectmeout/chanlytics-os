/**
 * What a draft is told that a reply the receptionist sends itself is not (decision 0093): it is written for the person who
 * will send it, so it has no hand-off to give them, its shape is its wire's, and what the send adds is left to the send.
 */
import { NO_LINK_DETAILS } from "../no-booking-link";

/** The shape of a draft by email: the subject is the send's (contracts replySubject), and so is the signature (0081). */
export const EMAIL_DRAFT_SHAPE =
  "Write an email: plain paragraphs, no emoji, no subject line, no markdown and no signature.";

/**
 * What a draft does where the business has no booking link to send: asks for what the team needs, with no hand-off
 * (noLinkBooking's chat line ends in one, and the person writing is the team).
 */
export function noLinkDraft(): string {
  return `There is no booking link to send. When someone wants to book, change or cancel a booking, or get a quote, ask for ${NO_LINK_DETAILS}.`;
}

/**
 * What a draft is (decision 0093), said among the rules so a hand-written prompt's own hand-off gives way to it too: words
 * a person reads, changes and sends as themselves, on a thread that may be held for exactly that person. The receptionist
 * told to hand off whenever "the customer asks for a person, is upset, or asks something these instructions do not
 * cover" escalated on the threads a draft is written for, and the draft was never written.
 */
export const DRAFT_RULES = [
  "You are writing as the business's owner or a member of their team, who will read this, change what they like and send it themselves. Nothing goes without them.",
  "They are the person the customer asked for: never say you will fetch someone, pass it on, or have someone get back to them. Set escalate to false.",
  "Answer what the customer wrote from the details here. Where a detail is missing, say you will find out and come back to them. Never name a day or a time for coming back.",
] as const;
