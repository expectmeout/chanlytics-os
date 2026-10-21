import { agoWords } from "../shared/time.js";
import { EMAIL_NOT_ANSWERED_SENTENCE } from "../email/mailbox.js";
import { SETUP_STATE_WORDS } from "./setup.js";
export function emailRow(i, { nowMs }) {
  const base = { kind: "email", icon: "mail", title: "Email" };
  const mailbox = i.email?.mailbox ?? null;
  if (mailbox) {
    const last = mailbox.last_received_at ? ` Last email ${agoWords(Date.parse(mailbox.last_received_at), nowMs)}.` : "";
    const working = `Customers write to this address and you reply from the Inbox, as ${mailbox.from_name}.${last}`;
    return {
      ...base,
      detail: mailbox.address,
      state: mailbox.last_error ? "attention" : "connected",
      stateWords: mailbox.last_error ? SETUP_STATE_WORDS.waiting_them : "On",
      sentence: mailbox.last_error ? `${mailbox.last_error} ${working}` : working,
      verb: { label: "Change the name", to: "verb:email-setup", who: "owner" },
      body: "email_setup"
    };
  }
  if (i.email?.ready) {
    return {
      ...base,
      detail: null,
      state: "none",
      stateWords: "Not set up",
      sentence: `Give customers an address to write to. ${EMAIL_NOT_ANSWERED_SENTENCE}`,
      verb: { label: "Choose the address", to: "verb:email-setup", who: "owner" },
      body: "email_setup"
    };
  }
  return {
    ...base,
    detail: null,
    state: "later",
    stateWords: "Later",
    sentence: "An address customers write to, answered from your Inbox.",
    verb: null
  };
}
export function mailboxRow(i) {
  const base = { kind: "mailbox", icon: "send", title: "Mailboxes you write from" };
  const sending = i.email?.sending ?? null;
  const boxes = sending?.mailboxes ?? [];
  if (boxes.length > 0) {
    const needs = boxes.filter((m) => m.state === "held" || m.state === "reconnect").length;
    const one = boxes.length === 1;
    return {
      ...base,
      detail: one ? boxes[0]?.address ?? null : `${boxes.length} mailboxes`,
      state: needs ? "attention" : "connected",
      stateWords: needs ? `${needs} to look at` : "On",
      sentence: `Sequences to leads write from ${one ? "it" : "them"}, and replies come back to ${one ? "it" : "them"} and to your Inbox.`,
      verb: null,
      body: "mailboxes"
    };
  }
  if (sending && sending.providers.length > 0) {
    return {
      ...base,
      detail: null,
      state: "none",
      stateWords: "Not connected",
      sentence: "Send sequences to leads from your own Google Workspace or Microsoft 365 mailbox; replies come back to it and to your Inbox.",
      verb: null,
      body: "mailboxes"
    };
  }
  return {
    ...base,
    detail: null,
    state: "later",
    stateWords: "Later",
    sentence: "Sequences to leads will send from your own Google Workspace or Microsoft 365 mailbox. Until then, each email is handed to you to send.",
    verb: null
  };
}
