/**
 * A message on file changed from Ask's card (the message sheet's review, 12 Nov 2026: Ask could write a new message and
 * change none): its words on one channel, its name, put away or brought back, or deleted in a language. Each commits
 * through the door the message's own sheet presses, so a card and the sheet do one thing one way: an email's or a text's
 * words are saved as a version (POST templates/versions), WhatsApp's are sent back to WhatsApp (PUT templates/[id] {
 * words }), the name is every version's and putting away the row's that names it (PUT templates/[id]), and a delete is
 * each version's own door, WhatsApp's first, which a send using it refuses before anything goes. A new language of a
 * message is the message card's (campaigns.ts messageSpec, under the same name in that language).
 *
 * The words here are the sheet's too (surfaces/campaigns/templates): what waits while WhatsApp looks, what putting away
 * does not stop, and what a delete takes, each said once.
 */
import { messageRoute } from "../../campaigns/sequences/address";
import { MESSAGES_ROUTE } from "../../shell/address";
import {
  OWN_VERSION_CHANNELS,
  VERSION_CHANNELS,
  versionWord,
} from "../../campaigns/templates/message-versions/channels";
import { PROPOSAL_WORDS, asText, rec, refuseWith, type ProposalCall, type ProposalSpec } from "./spec";
import { isOneOf, listOrEmpty } from "../../shared/unknown";

/** Several words in a sentence: "email", "email and text", "WhatsApp, email and text". */
const namesInWords = (words: readonly string[]): string =>
  words.length > 1 ? `${words.slice(0, -1).join(", ")} and ${words.at(-1)}` : (words[0] ?? "");

/** Putting a message away hides it; something that sends it goes on sending it. */
const awayStill = (by: string): string => `Putting it away stops nothing: it is still sent by ${by}.`;

/** What a message card says, and the sheet says of the same things: titles, lines, receipts, and the undos' words. */
export const MESSAGE_CHANGE_WORDS = {
  wordsTitle: (title: string, channel: string): string => `New ${channel} words for ${title}`,
  wordsSaid: (now: string, was: string | null): string => (was ? `Now: “${now}” · It said: “${was}”` : `Now: “${now}”`),
  /** WhatsApp's look, said where nothing that sends it waits on it. */
  wordsReview: "WhatsApp looks at new words before they go out, usually within minutes.",
  /**
   * What waits while WhatsApp looks at an approved message's new words: the running sequences that send it wait for its
   * answer and send by themselves once it says yes (core campaigns/paced.ts waitsOnWhatsApp: the day's run asks again each hour,
   * never closing the day), and the receptionist does not text it to someone asking to book. Null where nothing does.
   */
  holdsWhileChecked: (sequences: readonly string[], booking: boolean): string | null => {
    const one = sequences.length === 1;
    const waits = [
      sequences.length
        ? `${sequences.map((n) => `“${n}”`).join(", ")} ${one ? "waits and sends" : "wait and send"} by ${one ? "itself" : "themselves"} once it says yes`
        : null,
      booking ? "the receptionist won't text it to someone who asks to book" : null,
    ].filter(Boolean);
    return waits.length
      ? `While WhatsApp looks at the new words, usually a few minutes, ${waits.join(", and ")}.`
      : null;
  },
  renameTitle: (was: string): string => `Rename ${was}`,
  /** WhatsApp keeps its own name for a version it holds: said only where the message has one. */
  renameSaid: (title: string, whatsapp: boolean): string =>
    `Called “${title}” in the list and the composers${whatsapp ? "; WhatsApp keeps its own name for it" : ""}.`,
  awayTitle: (title: string, away: boolean): string => (away ? `Put away ${title}` : `Bring back ${title}`),
  awayStill,
  awaySaid: (away: boolean, stillSentBy: string | null): string =>
    away
      ? `Kept on file, out of the list and the composers.${stillSentBy ? ` ${awayStill(stillSentBy)}` : ""}`
      : "Back in the list and the composers.",
  deleteTitle: (title: string, language: string | null): string =>
    `Delete ${title}${language ? ` in ${language}` : ""}`,
  /** What a delete takes: every version of the message in the language, its other languages kept, said where it has any. */
  deleteSaid: (channels: readonly string[], others: boolean): string =>
    `Its ${namesInWords(channels)} ${channels.length === 1 ? "version goes" : "versions go"}, and sends that use it fail from now on.${others ? " Its other languages stay." : ""}`,
  /** WhatsApp's words, sent back: in review again until WhatsApp answers. */
  sentBack: (title: string): string =>
    `${title} went back to WhatsApp with the new words: it looks at them, usually within minutes`,
  saved: (title: string, channel: string): string => `${title}: the new ${channel} words are saved`,
  wordsBack: "The old words are back",
  putBack: "Put the old words back",
  /** A version the card wrote where the message had none: its undo takes it away again. */
  newBack: (channel: string): string => `Remove the new ${channel} version`,
  newGone: "The new version is gone",
  renamed: (title: string, was: string): string => `${was} is now called ${title}`,
  renameBack: "Give it its old name",
  nameBack: "It has its old name again",
  away: (title: string): string => `${title} is put away — still on file`,
  back: (title: string): string => `${title} is back in the list and the composers`,
  awayBack: "Put it back as it was",
  awayAsWas: "It is as it was",
  deleted: (title: string): string => `${title} is deleted — sends that named it fail from now on`,
} as const;

/** A channel as a card says it inside a sentence (contracts versionWord); a channel it does not know, as it came. */
const channelSaid = (channel: string): string => (isOneOf(VERSION_CHANNELS, channel) ? versionWord(channel) : channel);

/** An email's or a text's words saved as its version, from what a card or its undo holds. */
const ownSave = (pl: Record<string, unknown>, words: { subject: unknown; body: unknown }): ProposalCall | null => {
  const channel = asText(pl.channel);
  if (!isOneOf(OWN_VERSION_CHANNELS, channel) || !asText(pl.name) || !asText(words.body)) return null;
  const subject = asText(words.subject);
  return {
    route: "POST templates/versions",
    body: {
      name: asText(pl.name),
      language: asText(pl.language),
      channel,
      ...(channel === "email" && subject ? { subject } : {}),
      body: asText(words.body),
    },
  };
};

/** Where a card about one message opens: the message itself, by its name; the list where it names none. */
const openMessage = ({ payload: pl }: { payload: Record<string, unknown> | undefined }): string =>
  asText(pl?.name) ? messageRoute(asText(pl?.name)) : MESSAGES_ROUTE;

/**
 * A message's words changed on one channel (payload: template_id, the version on that channel where it has one; name,
 * language, channel, title; subject and body, the new words; was, the words they replace, or null where the message had
 * no version on it). WhatsApp's go back to WhatsApp, which looks at them again, and have no undo here (WhatsApp takes an
 * approved message's change once a day). An email's or a text's are saved, and the undo, within ten minutes, puts the old
 * words back, or takes away a version the card wrote where there was none.
 */
export const messageWordsSpec: ProposalSpec = {
  needs: "operator",
  gate: "approve",
  commit: ({ payload: pl }) => {
    if (asText(pl.channel) === "whatsapp")
      return asText(pl.template_id) && asText(pl.body)
        ? {
            route: "PUT templates/[id]",
            params: { id: asText(pl.template_id) },
            body: { words: { body: asText(pl.body) } },
          }
        : refuseWith(PROPOSAL_WORDS.cannotApprove);
    return ownSave(pl, { subject: pl.subject, body: pl.body }) ?? refuseWith(PROPOSAL_WORDS.cannotApprove);
  },
  receipt: ({ payload: pl }) =>
    asText(pl.channel) === "whatsapp"
      ? MESSAGE_CHANGE_WORDS.sentBack(asText(pl.title))
      : MESSAGE_CHANGE_WORDS.saved(asText(pl.title), channelSaid(asText(pl.channel))),
  undo: {
    label: ({ payload }) => {
      if (asText(payload.channel) === "whatsapp") return null;
      return asText(rec(payload.was).body)
        ? MESSAGE_CHANGE_WORDS.putBack
        : MESSAGE_CHANGE_WORDS.newBack(channelSaid(asText(payload.channel)));
    },
    window: "ten_minutes",
    record: ({ payload: pl }, data) => {
      if (asText(pl.channel) === "whatsapp") return null;
      const was = rec(pl.was);
      if (asText(was.body))
        return {
          name: pl.name,
          language: pl.language,
          channel: pl.channel,
          subject: was.subject ?? null,
          body: was.body,
        };
      // A version the card wrote: the one the door answered it saved, taken away again.
      const newId = asText(rec(rec(data).version).id);
      return newId ? { made: newId } : null;
    },
    call: (u) =>
      asText(u.made)
        ? { route: "DELETE templates/versions/[id]", params: { id: asText(u.made) }, goneIsDone: true }
        : (ownSave(u, { subject: u.subject, body: u.body }) ?? refuseWith(PROPOSAL_WORDS.noUndo)),
    receipt: (_data, u) => (asText(u.made) ? MESSAGE_CHANGE_WORDS.newGone : MESSAGE_CHANGE_WORDS.wordsBack),
  },
  open: openMessage,
};

/** The versions a card names (payload.versions: [{ channel, id, had_title? }]), WhatsApp's first. */
const versionsNamed = (pl: Record<string, unknown>) =>
  listOrEmpty(pl.versions)
    .map(rec)
    .filter((v) => asText(v.id))
    .sort((a, b) => Number(asText(b.channel) === "whatsapp") - Number(asText(a.channel) === "whatsapp"));

/**
 * A message renamed in the workspace's own words, every version of it in the language (payload: versions, [{ channel,
 * id, had_title }]; title; was; name), so no version keeps an old name another could show again. Its undo gives each the
 * title it had.
 */
export const messageRenameSpec: ProposalSpec = {
  needs: "operator",
  gate: "approve",
  commit: ({ payload: pl }) => {
    const calls = versionsNamed(pl).map((v): ProposalCall => ({
      route: "PUT templates/[id]",
      params: { id: asText(v.id) },
      body: { title: asText(pl.title) },
    }));
    return asText(pl.title) && calls.length ? calls : refuseWith(PROPOSAL_WORDS.cannotApprove);
  },
  receipt: ({ payload: pl }) => MESSAGE_CHANGE_WORDS.renamed(asText(pl.title), asText(pl.was)),
  undo: {
    label: () => MESSAGE_CHANGE_WORDS.renameBack,
    window: "ten_minutes",
    record: ({ payload: pl }) => ({
      versions: versionsNamed(pl).map((v) => ({
        id: v.id,
        title: typeof v.had_title === "string" ? v.had_title : null,
      })),
    }),
    call: (u) =>
      listOrEmpty(u.versions)
        .map(rec)
        .map((v): ProposalCall => ({
          route: "PUT templates/[id]",
          params: { id: asText(v.id) },
          body: { title: typeof v.title === "string" ? v.title : null },
        })),
    receipt: () => MESSAGE_CHANGE_WORDS.nameBack,
  },
  open: openMessage,
};

/** A message put away (`away` true) or brought back (payload: template_id, the row that names it; away; title; name). */
export const messageAwaySpec: ProposalSpec = {
  needs: "operator",
  gate: "approve",
  commit: ({ payload: pl }) =>
    asText(pl.template_id) && typeof pl.away === "boolean"
      ? { route: "PUT templates/[id]", params: { id: asText(pl.template_id) }, body: { hidden: pl.away } }
      : refuseWith(PROPOSAL_WORDS.cannotApprove),
  receipt: ({ payload: pl }) =>
    pl.away === true ? MESSAGE_CHANGE_WORDS.away(asText(pl.title)) : MESSAGE_CHANGE_WORDS.back(asText(pl.title)),
  undo: {
    label: () => MESSAGE_CHANGE_WORDS.awayBack,
    window: "ten_minutes",
    record: ({ payload: pl }) => (typeof pl.away === "boolean" ? { template_id: pl.template_id, away: pl.away } : null),
    call: (u) => ({
      route: "PUT templates/[id]",
      params: { id: asText(u.template_id) },
      body: { hidden: u.away !== true },
    }),
    receipt: () => MESSAGE_CHANGE_WORDS.awayAsWas,
  },
  open: openMessage,
};

/**
 * A message deleted in a language, every version of it there (payload: versions, [{ channel, id }]; title; name): each
 * through its own door, WhatsApp's first, which a send using it refuses before anything goes. No undo: WhatsApp's
 * version is gone from WhatsApp, and its name is held there for a while.
 */
export const messageDeleteSpec: ProposalSpec = {
  needs: "operator",
  gate: "approve",
  commit: ({ payload: pl }) => {
    const calls = versionsNamed(pl).map((v): ProposalCall =>
      asText(v.channel) === "whatsapp"
        ? { route: "DELETE templates/[id]", params: { id: asText(v.id) } }
        : { route: "DELETE templates/versions/[id]", params: { id: asText(v.id) } },
    );
    return calls.length ? calls : refuseWith(PROPOSAL_WORDS.cannotApprove);
  },
  receipt: ({ payload: pl }) => MESSAGE_CHANGE_WORDS.deleted(asText(pl.title)),
  open: () => MESSAGES_ROUTE,
};
