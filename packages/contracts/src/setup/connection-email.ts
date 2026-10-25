/**
 * Connections' two email rows (connections.ts folds them with the others): the hosted address customers write to, kept
 * only where a workspace already has one, and the business's own mailbox (decision 0056; decision 0073, R13: the
 * business's email is its mailbox, the email people write to it comes into the Inbox, and sequences to leads write from
 * it). Their own module because they read the same email line of Setup (mailbox.ts) and nothing else of the page's facts.
 */
import { agoWords } from "../shared/time";
import { EMAIL_NOT_ANSWERED_SENTENCE } from "../email/mailbox";
import { SETUP_STATE_WORDS } from "./setup";
import type { ConnectionDraft, ConnectionInputs } from "./connections";

/**
 * Email: the workspace's address when it has one, the form that makes one when this deployment has the
 * channel, and "later" where it does not. The receptionist does not answer email yet, and the row says so
 * rather than promising what Connections used to ("an address the receptionist answers").
 */
export function emailRow(i: ConnectionInputs, { nowMs }: { nowMs: number }): ConnectionDraft {
  const base = { kind: "email" as const, icon: "mail", title: "Email" };
  const mailbox = i.email?.mailbox ?? null;
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
  const sending = i.email?.sending ?? null;
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

/**
 * The mailboxes sequences to leads write from (decision 0056): the business's own Google Workspace or Microsoft 365
 * mailboxes, listed and connected under the row (mailboxes-block.tsx). Later while this deployment offers neither
 * provider and the workspace has none, so the row is there, greyed, saying what is coming and what happens meanwhile
 * (each email is handed to the owner to send). One held or signed out is the row's attention, said once, here.
 */
export function mailboxRow(i: ConnectionInputs): ConnectionDraft {
  const base = { kind: "mailbox" as const, icon: "send", title: "Your mailbox" };
  const sending = i.email?.sending ?? null;
  const boxes = sending?.mailboxes ?? [];
  if (boxes.length > 0) {
    const needs = boxes.filter((m) => m.state === "held" || m.state === "reconnect").length;
    const one = boxes.length === 1;
    return {
      ...base,
      detail: one ? (boxes[0]?.address ?? null) : `${boxes.length} mailboxes`,
      state: needs ? "attention" : "connected",
      stateWords: needs ? `${needs} to look at` : "On",
      sentence: `Email people write to ${one ? "it" : "them"} comes into your Inbox, six months of it with it, and sequences to leads write from ${one ? "it" : "them"}.`,
      verb: null,
      body: "mailboxes",
    };
  }
  if (sending && sending.providers.length > 0) {
    return {
      ...base,
      detail: null,
      state: "none",
      stateWords: "Not connected",
      sentence:
        "Connect your Google Workspace or Microsoft 365 mailbox: email from people comes into your Inbox, six months of it with it, and sequences to leads write from it.",
      verb: null,
      body: "mailboxes",
    };
  }
  return {
    ...base,
    detail: null,
    state: "later",
    stateWords: "Later",
    sentence:
      "Sequences to leads will send from your own Google Workspace or Microsoft 365 mailbox. Until then, each email is handed to you to send.",
    verb: null,
  };
}
