/**
 * Connections' rows that read one line of the page's facts each (connections.ts folds them with the others). The two email
 * rows: the hosted address customers write to, kept only where a workspace already has one, and the business's own
 * mailbox (decision 0056; decision 0073, R13: the business's email is its mailbox, the email people write to it comes into
 * the Inbox, and sequences to leads write from it), both from the same email line of Setup (mailbox.ts). And Instagram's
 * (decision 0001, step 8), from its account's channel and whether this deployment holds the app.
 */
import {
  agoWords,
  EMAIL_NOT_ANSWERED_SENTENCE,
  googleAudienceWords,
  META_LINE_OFF_WHY,
  META_LINE_WORDS,
  META_LINES,
  SETUP_STATE_WORDS,
} from "@chanlytics/contracts";
import type { ChannelVM, ConnectionNote, MetaLines } from "@chanlytics/contracts";

import type { ConnectionDraft, ConnectionInputs, ConnectionVerb } from "./setup";

/**
 * Email: the workspace's address when it has one, the form that makes one when this deployment has the
 * channel, and "later" where it does not. The receptionist does not answer email yet, and the row says so
 * rather than promising what Connections used to ("an address the receptionist answers").
 */
export function emailRow(connectionInputs: ConnectionInputs, { nowMs }: { nowMs: number }): ConnectionDraft {
  const base = { kind: "email" as const, icon: "mail", title: "Email" };
  const mailbox = connectionInputs.email?.mailbox ?? null;
  if (mailbox) {
    const last = mailbox.last_received_at
      ? ` Last email ${agoWords(Date.parse(mailbox.last_received_at), nowMs)}.`
      : "";
    // An email that could not be taken in is said HERE, where the owner looks
    // at the channel itself — the way the Google listing row carries
    // check_error above. It is ours to fix, not theirs, so the row says so and
    // keeps the verb it had; the next email that arrives clears it, so this is
    // never an old alarm about mail that has since been flowing for a week.
    const working = `Customers write to this address and you reply from the Inbox, as ${mailbox.from_name}.${last}`;
    // The mailboxes sequences write from are their own row (mailboxRow), which says one held or signed out.
    return {
      ...base,
      detail: mailbox.address,
      state: mailbox.last_error ? "attention" : "connected",
      stateWords: mailbox.last_error ? SETUP_STATE_WORDS.waiting_them : "On",
      sentence: mailbox.last_error ? `${mailbox.last_error} ${working}` : working,
      verb: { label: "Change the name", to: "verb:email-setup", who: "owner" },
      body: "email_setup",
    };
  }
  // No hosted address is made any more (R13): a workspace's email is its own mailbox, the row below. Where this
  // deployment offers no mailbox to connect, that row is later, and so is this one.
  const sending = connectionInputs.email?.sending ?? null;
  if (!sending?.mailboxes.length && !sending?.providers.length)
    return {
      ...base,
      detail: null,
      state: "later",
      stateWords: "Later",
      sentence: "Email from customers will come in through your own Google Workspace or Microsoft 365 mailbox.",
      verb: null,
    };
  return {
    ...base,
    detail: null,
    state: "none",
    stateWords: "Through your mailbox",
    sentence: `Email from customers comes in through the mailbox you connect below. ${EMAIL_NOT_ANSWERED_SENTENCE}`,
    verb: null,
  };
}

/** Whose mailboxes connect here: only the providers this deployment offers. */
const providersSaid = (providers: readonly string[]): string =>
  [providers.includes("google") && "Google Workspace", providers.includes("microsoft") && "Microsoft 365"]
    .filter(Boolean)
    .join(" or ");

/**
 * The mailboxes cold email goes from (decision 0056, 0116): the business's own, listed and connected under the row
 * (mailboxes-block.tsx). Later while this deployment offers no provider and the workspace has none, so the row is there,
 * greyed, saying what is coming. One held or signed out is the row's attention, said once, here.
 */
export function mailboxRow(connectionInputs: ConnectionInputs): ConnectionDraft {
  const base = { kind: "mailbox" as const, icon: "send", title: "Your mailbox" };
  const sending = connectionInputs.email?.sending ?? null;
  const boxes = sending?.mailboxes ?? [];
  if (boxes.length > 0) {
    const needs = boxes.filter((m) => m.state === "held" || m.state === "reconnect").length;
    const one = boxes.length === 1;
    return {
      ...base,
      detail: one ? (boxes[0]?.address ?? null) : `${boxes.length} mailboxes`,
      state: needs ? "attention" : "connected",
      stateWords: needs ? `${needs} to look at` : "On",
      sentence: `Email people write to ${one ? "it" : "them"} comes into your Inbox, and sequences to leads write from ${one ? "it" : "them"}.`,
      verb: null,
      body: "mailboxes",
    };
  }
  if (sending && sending.providers.length > 0) {
    // Google's mailbox connect is the Business Profile app's (decision 0073, R18): its consent screen's warning is said
    // here too, where the owner is about to press Connect Google.
    const audience = sending.google_audience ?? connectionInputs.google?.ready.audience;
    const note = sending.providers.includes("google") ? googleAudienceWords(audience) : null;
    return {
      ...base,
      detail: null,
      state: "none",
      stateWords: "Not connected",
      sentence: `Connect your ${providersSaid(sending.providers)} mailbox: email from people comes into your Inbox, and cold email goes from it.${note ? ` ${note}` : ""}`,
      verb: null,
      body: "mailboxes",
    };
  }
  return {
    ...base,
    detail: null,
    state: "later",
    stateWords: "Later",
    sentence: "Cold email will go from your own Google Workspace mailbox.",
    verb: null,
  };
}

/**
 * Instagram (decision 0001, step 8): an account connected answers its DMs, and says how recently one came; one whose
 * token Instagram stopped taking answers nothing until it is connected again, and says so; with none, Connect, where this
 * deployment holds the app, and Later where it does not. Where the account came through Meta (the Meta link), or this
 * workspace may connect Meta, the row is Meta's (metaRow).
 */
export function instagramRow(connectionInputs: ConnectionInputs, { ig }: { ig: ChannelVM | null }): ConnectionDraft {
  const metaReady = !!connectionInputs.meta?.ready;
  if (ig?.metaLines || (metaReady && !ig?.on)) return metaRow(ig, metaReady);
  const base = { kind: "instagram" as const, icon: "instagram", title: "Instagram" };
  const detail = ig?.handle ? `@${ig.handle}` : null;
  const connect: ConnectionVerb = { label: "Connect Instagram", to: "verb:instagram-connect", who: "owner" };
  if (ig?.on && ig.lapsedAt)
    return {
      ...base,
      detail,
      state: "attention",
      stateWords: "Needs connecting again",
      sentence: "Instagram stopped accepting the connection, so its DMs are not being answered. Connect it again.",
      verb: { ...connect, label: "Connect again" },
    };
  if (ig?.on)
    return {
      ...base,
      detail,
      state: "connected",
      stateWords: "Connected",
      sentence: `${ig.healthLabel}. The receptionist answers its DMs within a day of each one, as Instagram allows.`,
      verb: { label: "Disconnect", to: "verb:instagram-disconnect", who: "owner" },
      // The same account, moved to Meta's one connection: its DMs keep flowing (the Meta link takes the row over).
      ...(metaReady ? { also: META_CONNECT_VERB, notes: [{ text: MOVE_TO_META, live: true as const }] } : {}),
    };
  if (connectionInputs.instagram?.ready)
    return {
      ...base,
      detail,
      state: "none",
      stateWords: "Not connected",
      sentence:
        "Sign in with your Instagram professional account; the receptionist answers its DMs as it answers WhatsApp.",
      verb: ig ? { ...connect, label: "Connect again" } : connect,
    };
  return {
    ...base,
    detail: null,
    state: "later",
    stateWords: "Later",
    sentence: "Direct messages, answered by the receptionist like WhatsApp.",
    verb: null,
  };
}

const META_CONNECT_VERB: ConnectionVerb = { label: "Connect Meta", to: "verb:meta-connect", who: "owner" };
const MOVE_TO_META =
  "Connect Meta to move this account to one connection: its DMs keep flowing, and posting, trending sounds, comments and numbers come through it as each is built.";

/**
 * What Meta allowed, one line: the permissions the token carries, by the five lines' words (contracts metaLinesOf). Said as
 * what Meta allowed, never as what works: the DMs are the one line answered today, and the others come as each is built.
 */
function metaLinesNotes(lines: MetaLines): ConnectionNote[] {
  const allowed = META_LINES.filter((l) => lines[l]).map((l) => META_LINE_WORDS[l]);
  const not = META_LINES.filter((l) => !lines[l]).map((l) => META_LINE_WORDS[l]);
  return [
    ...(allowed.length ? [{ text: `Meta allows: ${allowed.join(", ")}.` }] : []),
    ...(not.length ? [{ text: `Not allowed: ${not.join(", ")}. ${META_LINE_OFF_WHY}`, live: true as const }] : []),
  ];
}

/**
 * The Meta link's row (decision 0117): one connection for the account, through Meta's Unified Login. Connected, it
 * answers the account's DMs and says what Meta allowed; lapsed, it says so and asks for a reconnect; not connected, where
 * this workspace may connect Meta, Connect Meta. A workspace without the switch never draws this row for an unconnected
 * account: the Instagram row stands as before.
 */
function metaRow(ig: ChannelVM | null, metaReady: boolean): ConnectionDraft {
  const base = { kind: "instagram" as const, icon: "instagram", title: "Meta" };
  const detail = ig?.handle ? `@${ig.handle}` : null;
  const lines = ig?.metaLines ?? null;
  if (ig?.on && lines && ig.lapsedAt)
    return {
      ...base,
      detail,
      state: "attention",
      stateWords: "Needs connecting again",
      sentence: "Meta stopped accepting the connection, so the account's DMs are not being answered. Connect it again.",
      verb: metaReady ? { ...META_CONNECT_VERB, label: "Connect again" } : null,
    };
  if (ig?.on && lines)
    return {
      ...base,
      detail,
      state: "connected",
      stateWords: "Connected",
      sentence: `${ig.healthLabel}. The receptionist answers its DMs within a day of each one, as Instagram allows.`,
      verb: { label: "Disconnect", to: "verb:meta-disconnect", who: "owner" },
      notes: metaLinesNotes(lines),
    };
  return {
    ...base,
    detail,
    state: "none",
    stateWords: "Not connected",
    sentence:
      "Sign in with Instagram or Facebook. One connection answers your Instagram DMs now, and brings posting, trending sounds, comments and numbers as each is built.",
    verb: metaReady ? (ig ? { ...META_CONNECT_VERB, label: "Connect again" } : META_CONNECT_VERB) : null,
  };
}
