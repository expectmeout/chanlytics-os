/**
 * What a broadcast says to its owner when it stops on a wire, in the owner's words, one set per channel (broadcast.ts).
 */
import { audienceTrigger, playbookRunNext, type PlaybookRunNextBy, type RunStop } from "@chanlytics/contracts";
import type { BroadcastChannel as Channel } from "./broadcast-channels";

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
    platformKey: { down: string; told: string } | null;
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
      told: "The platform has been told, and nothing in your mailbox needs changing",
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

/** Why each stop for the workspace left the rest unsent (contracts RunStop), before how many the run had reached. */
const RUN_STOP_CAUSE: Record<RunStop, string> = {
  paused: "The workspace is paused until billing resumes, so the rest was not sent.",
  email_offers_paused: "Offers by email are paused while complaints and bounces settle, so the rest was not sent.",
  campaigns_domain_unverified:
    "The domain offers by email go out from is not verified with the mail provider right now, so the rest was not sent.",
};

/**
 * What a run says when it stops for a fact about the whole workspace (broadcast-stops.ts stopForTheWorkspace), in the
 * owner's words: the cause, with how many it reached first (`sent`, null where that could not be counted). What to do next
 * is contracts stoppedRunFix, by whose run it was. A run a pause let reach nobody says "nothing went out", as it always has.
 */
export function stoppedRunCause(why: RunStop, sent: number | null): string {
  if (why === "paused" && sent === 0) return "The workspace is paused until billing resumes, so nothing went out.";
  return [RUN_STOP_CAUSE[why], gotIt(sent)].filter(Boolean).join(" ");
}

/**
 * What a run says when the mail provider's own limit is used up (channels resendLimitOf: the day's or the month's): a no
 * until it resets, which is longer than any wait of a run, and so a run's stop, not a person's refusal.
 */
export const LIMIT_WORDS: Record<
  "daily" | "monthly",
  { reached: string; resets: string; again: string; next: PlaybookRunNextBy }
> = {
  daily: {
    reached: "The mail provider's limit for the day was reached",
    resets: "It resets on its own",
    again: "It resets on its own; send it again tomorrow.",
    next: "tomorrow",
  },
  // The month's limit outlasts tomorrow: a playbook's run is promised the next run that can go, never tomorrow's.
  monthly: {
    reached: "The mail provider's limit for the month was reached",
    resets: "It resets with the new month",
    again: "It resets with the new month; send it again then.",
    next: "when_it_can",
  },
};

/**
 * The last sentence of a stopped run's alert, after its cause and how many it reached: what its owner does next. A
 * broadcast the owner made is sent again (`again`, each stop's own words). A playbook's run is not, by anyone: it says
 * what there is to do, where there is anything (`remedy`), and what becomes of it (contracts playbookRunNext). Every
 * stop but the workspace's own (stopForTheWorkspace, which asks contracts stoppedRunFix) said "send it again" to both.
 * `by` is when a playbook's run reaches who this one did not (contracts PlaybookRunNextBy): tomorrow, or, for a stop that
 * may outlast tomorrow and is not the owner's to end, the next run that can go.
 */
export function thenWhat(
  b: { playbook_id: string | null; audience: unknown },
  remedy: string | null,
  again: string,
  by: PlaybookRunNextBy,
): string {
  const next = playbookRunNext({ playbook_id: b.playbook_id, trigger: audienceTrigger(b.audience) }, by);
  if (!next) return again;
  return remedy ? `${remedy}. ${next}` : next;
}

/**
 * The words a run kept on a person's row when it was made, for the slots that take them: a visit's time and service, a
 * follow-up's link (0006) and the freed time every send of its batch carries (0082). A word not kept is null, and the
 * slot that asks for it holds the person.
 */
export function keptWords(facts: Record<string, unknown>) {
  const word = (k: string): string | null => {
    const v = facts[k];
    return typeof v === "string" ? v : null;
  };
  return {
    visitWhen: word("visit_when"),
    visitService: word("visit_service"),
    proposalLink: word("proposal_link"),
    freedWhen: word("freed_when"),
  };
}
