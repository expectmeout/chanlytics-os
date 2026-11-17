/**
 * Whether no channel can carry a message here now (Campaigns, one tab, call C13, 17 Nov 2026): every channel refused for
 * it (channelChoices over what the message holds on each, readyForMessage: Meta's pause on offers to US numbers, email
 * not set up for offers, no texting line, a version not written or not approved). Something that sends such a message
 * waits, and goes by itself once a channel can carry it: said quietly, never as needing you, since nothing on the page
 * mends it. It was the Messages list's own reading of a message ("Waiting"); a campaign's step and its row say it too, so
 * it is said once, here.
 */
import { CHANNEL_WORDS, channelChoices, type ChannelsReady } from "../broadcasts/reach-for";
import type { MessageAbout } from "../../consent/consent";
import { readyForMessage, type CampaignMessage } from "./campaign-message";

/** Whose words a message is, as a send judges it: an offer is ours, anything else theirs (consent.ts MessageAbout). */
export const aboutOfMessage = (message: Pick<CampaignMessage, "purpose">): MessageAbout =>
  message.purpose === "marketing" ? "ours" : "theirs";

/**
 * Whether nothing can carry the message here now. Never where the business's channels were not read (`ready` null, the
 * campaigns' read), nor where it has an email and email could not be asked about just now: a question nobody answered is
 * not a no, and says nothing.
 */
export function messageCarriedNowhere(ready: ChannelsReady | null, message: CampaignMessage | null): boolean {
  if (!ready || !message) return false;
  // A WhatsApp version WhatsApp is reviewing is read as the approved one it will be: what would hold it after (Meta's
  // pause on offers) still holds it.
  const whatsapp = message.versions.whatsapp;
  const judged =
    whatsapp && whatsapp.status === "pending"
      ? { ...message, versions: { ...message.versions, whatsapp: { ...whatsapp, status: "approved" as const } } }
      : message;
  const choices = channelChoices(readyForMessage(ready, judged), message.purpose, aboutOfMessage(message));
  if (choices.some((c) => c.ok)) return false;
  const unasked =
    !!message.versions.email &&
    (!!ready.email.unchecked || choices.some((c) => c.channel === "email" && c.why === CHANNEL_WORDS.unchecked));
  return !unasked;
}
