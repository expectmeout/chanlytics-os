/**
 * What a broadcast says to its owner when it stops on a wire, in the owner's words, one set per channel (broadcast.ts).
 */
import type { WorkspaceFailure } from "@chanlytics/contracts";
import type { Channel } from "../deliver";

/**
 * What a run says of each wire it goes out on, in the owner's words: the credentials it could not read, why the wire is
 * down and what to do, when the provider limits it, and when it cannot be reached. One set per channel; WhatsApp's are
 * what every broadcast has always said.
 */
export const WIRE_WORDS: Record<
  Channel,
  {
    credentials: string;
    down: string;
    notConnected: string;
    noWire: string;
    answered: string;
    reconnect: string;
    /**
     * What an owner is told when the provider refuses the credentials outright (HTTP 401 or 403) and they are not the
     * owner's to change: the platform's key on every workspace, which the platform has been paged about. Null where they
     * are the owner's own (their number's or their line's), who reconnect.
     */
    platformKey: { down: string; fix: string } | null;
    limiting: string;
    lifts: string;
    reach: string;
    fine: string;
    to: string;
  }
> = {
  whatsapp: {
    credentials: "This workspace's WhatsApp credentials",
    down: "WhatsApp could not be reached on this workspace's number",
    notConnected: "the number is not connected",
    noWire: "this runtime has no WhatsApp wire",
    answered: "WhatsApp answered HTTP",
    reconnect: "Reconnect the number in Settings › Channels",
    platformKey: null,
    limiting: "WhatsApp kept limiting how fast this number may send",
    lifts: "WhatsApp lifts these limits on its own",
    reach: "WhatsApp could not be reached",
    fine: "Nothing is wrong with the number",
    to: "WhatsApp",
  },
  sms: {
    credentials: "This workspace's texting line",
    down: "Texts could not be sent on this workspace's line",
    notConnected: "the line is not connected",
    noWire: "this runtime has no texting wire",
    answered: "the texting provider answered HTTP",
    reconnect: "Check the line in Settings › Channels",
    platformKey: null,
    limiting: "The texting provider kept limiting how fast this line may send",
    lifts: "It lifts these limits on its own",
    reach: "The texting provider could not be reached",
    fine: "Nothing is wrong with the line",
    to: "the texting provider",
  },
  email: {
    credentials: "This workspace's mailbox",
    down: "Email could not be sent from this workspace's mailbox",
    notConnected: "the mailbox is not set up",
    noWire: "this runtime has no email wire",
    answered: "the mail provider answered HTTP",
    reconnect: "Check the mailbox in Settings › Connections",
    // The key every workspace's email goes out on is the deployment's, so a 401 or 403 is not the mailbox's.
    platformKey: {
      down: "Email could not be sent: the mail provider refused the platform's key",
      fix: "The platform has been told, and nothing in your mailbox needs changing. Send it again later.",
    },
    limiting: "The mail provider kept limiting how fast this workspace may send",
    lifts: "It lifts these limits on its own",
    reach: "The mail provider could not be reached",
    fine: "Nothing is wrong with the mailbox",
    to: "the mail provider",
  },
};

/** "N people got it", "One person got it", "Nobody got it", or nothing when the count could not be read. */
export function gotIt(sent: number | null): string {
  if (sent === null) return "";
  return sent === 0 ? "Nobody got it." : sent === 1 ? "One person got it." : `${sent} people got it.`;
}

/**
 * What a run says when it stops for a fact about the whole workspace (contracts workspaceRefusalFailure; broadcast.ts
 * stopForTheWorkspace), in the owner's words: the cause, with how many it reached first (`sent`, null where that could not
 * be counted), and what to do. A run that reached nobody says "nothing went out" for a pause, as it always has.
 */
export const WORKSPACE_STOP_WORDS: Record<WorkspaceFailure, { cause: (sent: number | null) => string; fix: string }> = {
  paused: {
    cause: (sent: number | null): string =>
      sent === 0
        ? "The workspace is paused until billing resumes, so nothing went out."
        : ["The workspace is paused until billing resumes, so the rest was not sent.", gotIt(sent)]
            .filter(Boolean)
            .join(" "),
    fix: "Resume from Settings › Billing and send it again.",
  },
  email_offers_paused: {
    cause: (sent: number | null): string =>
      ["Offers by email are paused while complaints and bounces settle, so the rest was not sent.", gotIt(sent)]
        .filter(Boolean)
        .join(" "),
    fix: "Check your list for old or wrong addresses; offers by email come back on once it looks right. Send it again then.",
  },
  campaigns_domain_unverified: {
    cause: (sent: number | null): string =>
      [
        "The domain offers by email go out from is not verified with the mail provider right now, so the rest was not sent.",
        gotIt(sent),
      ]
        .filter(Boolean)
        .join(" "),
    fix: "Nothing is wrong with your mailbox, and the platform has been told; send it again once the domain is verified.",
  },
};

/**
 * What a run says when the mail provider's own limit is used up (channels resendLimitOf: the day's or the month's): a no
 * until it resets, which is longer than any wait of a run, and so a run's stop, not a person's refusal.
 */
export const LIMIT_WORDS: Record<"daily" | "monthly", { reached: string; again: string }> = {
  daily: {
    reached: "The mail provider's limit for the day was reached",
    again: "It resets on its own; send it again tomorrow.",
  },
  monthly: {
    reached: "The mail provider's limit for the month was reached",
    again: "It resets with the new month; send it again then.",
  },
};
