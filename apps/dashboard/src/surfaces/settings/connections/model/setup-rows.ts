/**
 * Connections' rows that read one line of the page's facts each (connections.ts folds them with the others). The two email
 * rows: the hosted address customers write to, kept only where a workspace already has one, and the business's own
 * mailbox (decision 0056; decision 0073, R13: the business's email is its mailbox, the email people write to it comes into
 * the Inbox, and sequences to leads write from it), both from the same email line of Setup (mailbox.ts). And Instagram's
 * (decision 0001, step 8), from its account's channel and whether this deployment holds the app.
 */
import {
  agoWords,
  clockStamp,
  CONTENT_LIBRARY_ROUTE,
  EMAIL_NOT_ANSWERED_SENTENCE,
  FOOTAGE_WORDS,
  footageStandingOf,
  googleAudienceWords,
  META_LINE_OFF_WHY,
  META_LINE_WORDS,
  META_LINES,
  SETUP_STATE_WORDS,
} from "@chanlytics/contracts";
import type {
  ChannelVM,
  ConnectionNote,
  FootageAct,
  FootageDto,
  FootageStandingKey,
  MetaLines,
} from "@chanlytics/contracts";

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
      // Said of no provider: none is offered here yet, so none is promised.
      sentence: "Email from customers will come in through your own mailbox.",
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
      sentence: `Email people write to ${one ? "it" : "them"} comes into your Inbox, and cold email goes from ${one ? "it" : "them"}.`,
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
    sentence: "Cold email will go from your own mailbox.",
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
      sentence: `${ig.healthLabel}. AI answers its DMs within a day of each one, as Instagram allows.`,
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
      sentence: "Sign in with your Instagram professional account; AI answers its DMs as it answers WhatsApp.",
      verb: ig ? { ...connect, label: "Connect again" } : connect,
    };
  return {
    ...base,
    detail: null,
    state: "later",
    stateWords: "Later",
    sentence: "Direct messages, answered by AI like WhatsApp.",
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
      sentence: `${ig.healthLabel}. AI answers its DMs within a day of each one, as Instagram allows.`,
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

/* --------------------------------------------------------------------------------------------- Google Drive -- */

const DRIVE = { kind: "drive" as const, icon: "folder", title: FOOTAGE_WORDS.provider };
const driveVerb = (act: FootageAct, to: string): ConnectionVerb => ({
  label: FOOTAGE_WORDS.acts[act],
  to,
  who: "owner",
});

/** The one act each standing asks for, as the row's verb: a sign-in, the chooser, the Library, or the steps to send. */
const DRIVE_VERBS: Record<FootageAct, ConnectionVerb> = {
  connect: driveVerb("connect", "verb:drive-connect"),
  reconnect: driveVerb("reconnect", "verb:drive-connect"),
  connect_own: driveVerb("connect_own", "verb:drive-connect"),
  choose: driveVerb("choose", "verb:drive-choose"),
  choose_another: driveVerb("choose_another", "verb:drive-choose"),
  open_library: { label: FOOTAGE_WORDS.acts.open_library, to: CONTENT_LIBRARY_ROUTE, who: "operator" },
  copy_steps: driveVerb("copy_steps", "verb:drive-steps"),
};
const DRIVE_CHECK: ConnectionVerb = { label: FOOTAGE_WORDS.check, to: "verb:drive-check", who: "owner" };
const DRIVE_STOP: ConnectionVerb = { label: FOOTAGE_WORDS.stop, to: "verb:drive-stop", who: "owner" };
const DRIVE_DISCONNECT: ConnectionVerb = {
  label: FOOTAGE_WORDS.disconnect,
  to: "verb:drive-disconnect",
  who: "owner",
  danger: true,
};

/** Where each standing puts the row: joined and well, joined and asking for someone, joined with nothing watched, or not joined. */
const DRIVE_STATE: Record<FootageStandingKey, ConnectionDraft["state"]> = {
  not_connected: "none",
  blocked: "attention",
  not_watching: "off",
  looking: "connected",
  bringing_in: "connected",
  waits_tomorrow: "connected",
  waits_room: "connected",
  // Nothing can step aside, so only the owner can make room (call 3): joined, and asking for someone.
  videos_full: "attention",
  videos_off: "connected",
  checking_left: "connected",
  watching: "connected",
  library_full: "attention",
  signed_out: "attention",
  connector_left: "attention",
  // It mends itself once the folder opens again: joined, its badge amber, its way on a quiet act (the canvas's Settings 10).
  cant_open: "connected",
};

const DRIVE_TONE = { live: "accent", ok: "ok", you: "warn", rest: "plain" } as const;

/** A watched folder's quiet acts, by their own names: a look now and a stop while it is read, and Disconnect last. */
function driveActs(footage: FootageDto, key: FootageStandingKey): ConnectionVerb[] {
  if (!footage.account || key === "not_connected" || key === "blocked") return [];
  const folder = footage.folder && footage.folder.state !== "stopped" ? footage.folder : null;
  const read = folder && (folder.state === "watching" || folder.state === "frozen");
  const another = key === "cant_open" ? [DRIVE_VERBS.choose_another] : [];
  return [...another, ...(read ? [DRIVE_CHECK] : []), ...(folder ? [DRIVE_STOP] : []), DRIVE_DISCONNECT];
}

/**
 * Google Drive: the folder a business has Chanlytics watch for its photos and videos (the footage sources plan, P5).
 * One row, its state in the words Content's card and the Library's line say too (contracts footageStandingOf), the
 * folder, the account and who connected it under it, and its one act. A workspace where connecting is not offered and
 * nothing is connected has it Later, which the page leaves out until the day it is offered.
 */
export function driveRow(connectionInputs: ConnectionInputs, { nowMs }: { nowMs: number }): ConnectionDraft {
  const footage = connectionInputs.footage ?? null;
  if (!footage || (!footage.account && !footage.offered))
    return {
      ...DRIVE,
      detail: null,
      state: "later",
      stateWords: "Later",
      sentence: "New photos and videos come in from a folder by themselves.",
      verb: null,
    };
  const standing = footageStandingOf(footage, (iso) => clockStamp(Date.parse(iso), connectionInputs.tz, nowMs));
  const { account, folder } = footage;
  const watched = folder && folder.state !== "stopped" ? folder : null;
  const facts = [
    ...(watched ? [{ label: FOOTAGE_WORDS.facts.folder, value: watched.name }] : []),
    ...(account?.email ? [{ label: FOOTAGE_WORDS.facts.account, value: account.email }] : []),
    ...(account && (account.by_you || account.connected_by)
      ? [
          {
            label: FOOTAGE_WORDS.facts.by,
            value: account.by_you ? FOOTAGE_WORDS.facts.you : (account.connected_by ?? ""),
          },
        ]
      : []),
  ];
  return {
    ...DRIVE,
    detail: null,
    state: DRIVE_STATE[standing.key],
    // Coral is for what is live and now, green for quiet and well, amber for what needs someone; a wait says nothing.
    tone: DRIVE_TONE[standing.tone],
    stateWords: standing.badge,
    sentence: standing.say,
    // A member who may not change it reads where it stands, and is offered nothing to press.
    verb:
      standing.act && standing.key !== "cant_open" && (footage.can_change || standing.act === "open_library")
        ? DRIVE_VERBS[standing.act]
        : null,
    ...(facts.length > 0 && account?.health !== "blocked_by_admin" ? { facts } : {}),
    ...(footage.can_change ? { acts: driveActs(footage, standing.key) } : {}),
  };
}
