import { CHANNEL_WORDS } from "../broadcasts/reach-for.js";
import { BREATH_WHY, goesToOf, heardWords } from "../broadcasts/run-words.js";
import {
  CONSENT_CHANNELS,
  CONSENT_CHANNEL_WORDS,
  channelsWords
} from "../consent/consent-channels.js";
import { LIFECYCLE_TOAST, LIFECYCLE_WORDS, channelsGoesByWords } from "../playbooks/lifecycle/lifecycle-words.js";
import { PLAYBOOK_PATCH_CLEARS, PLAYBOOK_PATCH_KEYS } from "../playbooks/playbook-patch.js";
import { SEND_ONCE_STOP_WORDS, SENDING_NOW_WORDS, whenItGoes } from "../playbooks/playbook-triggers.js";
import { SEQUENCES_ROUTE, newSequenceRoute, runRoute, sequenceRoute } from "../sequences/sequence-address.js";
import { clockWhen } from "../shared/clock.js";
import { joinWords } from "../shared/words.js";
import { CAMPAIGN_ROOMS, LIBRARY_STARTER_WORDS, LIBRARY_WORDS, runApprovedTail } from "../shell/campaign-rooms.js";
import { MESSAGE_BEGIN_WORDS, metaStatusOf } from "../templates/campaign-message.js";
import { OWN_VERSION_CHANNELS, versionWord } from "../templates/message-versions.js";
import { languageName } from "../templates/template-languages.js";
import { TEMPLATE_BODY_WORDS, TEMPLATE_SAME_NAME_WORDS } from "../templates/templates.js";
import {
  PROPOSAL_WORDS,
  asText,
  decisionOf,
  idIn,
  rec,
  refuseWith,
  wasIn
} from "./spec.js";
export const RUN_VERBS = ["approve", "skip"];
export function proposalChannelsWords(channels, byChannel) {
  const goes = channelsWords(channels);
  const carrying = channels.filter((c) => byChannel[c] > 0);
  if (carrying.length < 2) return goes;
  return `${goes} (${carrying.map((c) => `${byChannel[c].toLocaleString("en-US")} ${CONSENT_CHANNEL_WORDS[c]}`).join(", ")})`;
}
export const PLAYBOOK_CARD_REFUSALS = {
  /** A typed slot the proposal gave no words for: a question for the person. */
  typedSlot: (label) => `this template takes typed words for \u201C${label}\u201D; ask the person what to say there, then propose again with params`,
  value: "each value is text, or @first_name, @business_name, @booking_link or @review_link, or @visit_when or @visit_service on a reminder or a check after an appointment, or @proposal_link on the proposal follow-up",
  plainText: "every typed value must be plain text under 1024 characters, without line breaks",
  /** The moment's starter, hidden in this workspace's Library: no card adds it back. */
  starterHidden: (title, from) => `${LIBRARY_STARTER_WORDS.hiddenInLibrary(title)} Say so; ${from} names the messages that may send.`,
  starterUnsent: (title, from) => `the \u201C${title}\u201D starter has no version this workspace can send yet; say so and suggest adding the starter set under ${CAMPAIGN_ROOMS.home} \u203A ${CAMPAIGN_ROOMS.library}, or name a message from ${from}`,
  hiddenTemplate: (from) => `that template is one the workspace keeps out of the composers; ${from} names the ones that may send`,
  noList: (from) => `no such list; ${from} names them`,
  uncounted: (list, why) => `${list} can't be counted right now: ${why}`,
  /**
   * A second running campaign on the same moment, list and message, where they named none of its own (D9). The model's
   * words, when the card is made; a card's start that meets one is answered in twinRunsWords, the owner's.
   */
  twin: (name) => `\u201C${name}\u201D already runs on this moment with this message: say so, and propose a second only when they ask for another by a name of its own`,
  followUpsUnread: "who already had a proposal follow-up could not be read just now; say so, and try again in a moment",
  /**
   * The week's breath: every message sent or due within a week of a run, a member's own too, holds its person, so the
   * count waits on it. The stem a broadcast's door says it in (core createBroadcast).
   */
  weekUnread: "who has had a message from you lately, or has one due, could not be read just now; say so, and try again in a moment",
  /**
   * The autonomy modes, unread: what a card says of its runs after the first is what its class's row says a new sequence
   * starts as (decision 0064), so no card is made on a guess.
   */
  modeUnread: "the sending mode of this campaign's class could not be read just now, so the card cannot say what its runs would do; say so, and try again in a moment",
  /** The action named a message and a starter both: a campaign sends one. */
  starterOrMessage: "name template_id for a message the workspace holds, or starter for the moment's starter to file at Approve, never both",
  trigger: (triggers) => `trigger must be one of ${triggers.join(", ")}`,
  listToken: (from) => `a playbook on a list needs list: the list's token from ${from} (seg:<id> or list:<id>)`,
  templateId: (from) => `template_id must be an id ${from} returned, or omitted for the trigger's starter`
};
export const twinRunsWords = (name) => `\u201C${name}\u201D already runs on this moment with this message, so nothing was started.`;
export const PLAYBOOK_CARD_WORDS = {
  /**
   * Every new sequence's first batch, and its first after new words, waits for the owner's OK whatever its mode (decision
   * 0064): the card says so beside what its batches do after that.
   */
  asksFirst: "its first batch waits for your OK",
  /**
   * A reminder the day before or a check after an appointment (D2): one message per appointment, sent whatever else
   * the person hears from you within a week of it, sent or due (BREATH_WHY), since the run is daily and the appointment
   * is on one day (contracts playbookRunReach), so the week's breath, which holds every other moment, does not hold it.
   */
  appointmentBreath: `exempt from one a week per person: each goes whatever else they hear ${BREATH_WHY}`
};
export const stepOfferWords = (quotes) => quotes.length === 0 ? "" : `, with the offer ${joinWords(quotes)}`;
const channelsNamed = (pl) => Array.isArray(pl.channels) ? { channels: pl.channels } : {};
const cancelCall = (u) => ({
  route: "POST broadcasts/[id]/cancel",
  params: { id: asText(u.broadcast_id) }
});
const canceled = (data) => rec(data).was === "sending" ? "Stopped \u2014 it ends after this batch" : "Canceled \u2014 nothing will send";
export const broadcastSpec = {
  needs: "operator",
  gate: "approve",
  commit: ({ payload: pl }) => ({
    route: "POST broadcasts",
    body: {
      template_id: pl.template_id,
      params: Array.isArray(pl.params) ? pl.params : [],
      audience: { kind: pl.audience_kind, id: pl.audience_id ?? null },
      scheduled_for: pl.scheduled_for ?? null,
      name: pl.name ?? null,
      ...channelsNamed(pl)
    }
  }),
  // The count and the name are the route's answer where it gave them, the card's where it did not: who it goes to, the
  // people it enrolled less those it left out for the breath (goesToOf), and how many were left out.
  receipt: ({ payload: pl }, data) => {
    const d = rec(data);
    const leftOut = typeof d.left_out === "number" ? d.left_out : 0;
    const n = typeof d.recipient_count === "number" ? goesToOf({ recipient_count: d.recipient_count, left_out: leftOut }) : Number(pl.count ?? 0);
    const ahead = d.scheduled_ahead === true;
    const goes = ahead ? "scheduled" : d.pressed_now === true ? `goes in ${SEND_ONCE_STOP_WORDS} unless you stop it` : SENDING_NOW_WORDS;
    const said = heardWords(leftOut, true);
    return `Broadcast \u201C${d.name ?? asText(pl.name)}\u201D \u2014 ${n} ${n === 1 ? "person" : "people"}, ${goes}${said ? ` \xB7 ${said}` : ""}`;
  },
  undo: {
    label: () => "Cancel it, if it has not finished",
    window: "ten_minutes",
    record: (_p, data) => ({ broadcast_id: rec(data).id, decision_id: decisionOf(data) }),
    call: cancelCall,
    receipt: canceled
  },
  open: () => SEQUENCES_ROUTE
};
export const playbookSpec = {
  needs: "operator",
  gate: "approve",
  commit: ({ payload: pl }) => ({
    route: "POST playbooks",
    body: {
      name: pl.name ?? null,
      trigger: pl.trigger,
      // On a list (decision 0009): the list it names, and whether it sends an offer or a win-back.
      ...pl.list_key ? { list_key: pl.list_key } : pl.list_id ? { list_id: pl.list_id } : {},
      ...pl.list_key || pl.list_id ? { policy_class: pl.policy_class } : {},
      // A starter named and no message (A0): the route files the starter, then starts the playbook on it.
      ...pl.starter_key && !pl.template_id ? { starter_key: pl.starter_key } : { template_id: pl.template_id },
      params: Array.isArray(pl.params) ? pl.params : [],
      run_hour: pl.run_hour,
      cap_per_run: pl.cap_per_run,
      gap_days: pl.gap_days,
      cadence_days: pl.cadence_days,
      ...channelsNamed(pl),
      // Its last day (00416), where the card named one: the route judges it again at its own clock.
      ...typeof pl.until === "string" ? { until: pl.until } : {}
    }
  }),
  // "Campaign", the word a person reads; and, where the route says it sent the starter's WhatsApp version for review, so.
  receipt: ({ payload: pl }, data) => `Campaign \u201C${rec(data).name ?? asText(pl.name)}\u201D is running \u2014 its next run is under Coming up in Campaigns${rec(rec(data).starter).status === "submitted" ? " \xB7 its starter's WhatsApp version is with WhatsApp for review" : ""}`,
  undo: {
    label: () => "Delete it \u2014 nothing will run",
    window: "ten_minutes",
    record: (_p, data) => ({ playbook_id: rec(data).id, decision_id: decisionOf(data) }),
    call: (u) => ({ route: "DELETE playbooks/[id]", params: { id: asText(u.playbook_id) } }),
    receipt: () => "Deleted \u2014 nothing will run"
  },
  // The new campaign's sequence once it is made (spec 2026-10-09 §4.6, one landing rule: `campaigns/moment:<id>` lands on
  // it), by the id its commit kept for the undo, as the list card opens the list it made; before then New sequence on its
  // moment, its line written in, and Sequences where the card names no moment (the composer's moment mode went: the
  // closed-loop audit of 17 Oct 2026, G).
  open: ({ payload }, outcome) => {
    const id = idIn(rec(outcome?.undo), "playbook_id");
    if (id) return sequenceRoute(id);
    const trigger = idIn(payload, "trigger");
    return trigger ? newSequenceRoute(trigger) : SEQUENCES_ROUTE;
  }
};
const channelsIn = (v) => Array.isArray(v) ? CONSENT_CHANNELS.filter((c) => v.includes(c)) : [];
export const playbookChannelsSpec = {
  needs: "operator",
  gate: "approve",
  commit: ({ payload: pl }) => {
    const id = idIn(pl, "playbook_id");
    const channels = channelsIn(pl.channels);
    if (!id || channels.length === 0) return refuseWith(PROPOSAL_WORDS.cannotApprove);
    return { route: "PUT playbooks/[id]", params: { id }, body: { channels } };
  },
  // The drawer's own sentence, whole (LIFECYCLE_TOAST.channels): "Visit reminder goes by WhatsApp and Email now", and
  // after it that the run which waits keeps the channels it was made with, where one does.
  receipt: ({ payload: pl }) => LIFECYCLE_TOAST.channels(asText(pl.name) || "The campaign", channelsIn(pl.channels), pl.run_waits === true).map((part) => typeof part === "string" ? part : part.b).join(""),
  undo: {
    label: ({ payload }) => `Put it back to ${channelsGoesByWords(channelsIn(payload.was))}`,
    window: "ten_minutes",
    // The channels the route found when it wrote (its answer's `was`), the card's own reading where an older route
    // answers none.
    record: (p, data) => ({ playbook_id: p.payload.playbook_id, was: wasIn(data, "channels") ?? p.payload.was }),
    call: (u) => {
      const was = channelsIn(u.was);
      return was.length === 0 || !asText(u.playbook_id) ? refuseWith(PROPOSAL_WORDS.noUndo) : { route: "PUT playbooks/[id]", params: { id: asText(u.playbook_id) }, body: { channels: was } };
    },
    receipt: () => "Its channels are as they were"
  },
  // Its sequence, where its record shows what it goes by now.
  open: ({ payload }) => {
    const id = idIn(payload, "playbook_id");
    return id ? sequenceRoute(id) : SEQUENCES_ROUTE;
  }
};
const patchIn = (pl, modeKey) => {
  const body = Object.fromEntries(
    PLAYBOOK_PATCH_KEYS.filter(
      (k) => k !== "mode" && pl[k] !== void 0 && (pl[k] !== null || PLAYBOOK_PATCH_CLEARS.includes(k))
    ).map((k) => [k, pl[k]])
  );
  if (typeof pl[modeKey] === "string") body.mode = pl[modeKey];
  return body;
};
const resumeUndoLabel = (mode) => mode === "auto" ? `Resume it. ${LIFECYCLE_WORDS.ledger.resume.auto}` : "Resume it";
const toastWords = (parts) => parts.map((part) => typeof part === "string" ? part : part.b).join("");
export const playbookChangeSpec = {
  needs: "operator",
  gate: "approve",
  commit: ({ payload: pl }) => {
    const id = idIn(pl, "playbook_id");
    const body = patchIn(pl, "sequence_mode");
    if (!id || Object.keys(body).length === 0) return refuseWith(PROPOSAL_WORDS.cannotApprove);
    return { route: "PUT playbooks/[id]", params: { id }, body };
  },
  receipt: ({ payload: pl }, data) => {
    const name = asText(rec(data).name ?? pl.name ?? pl.playbook_name) || LIFECYCLE_TOAST.nameless;
    if (pl.state === "paused") return toastWords(LIFECYCLE_TOAST.paused(name));
    if (pl.state === "running") return toastWords(LIFECYCLE_TOAST.resumed(name));
    return toastWords(LIFECYCLE_TOAST.changed(name));
  },
  undo: {
    label: ({ payload }) => payload.state === "paused" ? resumeUndoLabel(payload.mode) : payload.state === "running" ? "Pause it again" : "Put it back",
    window: "ten_minutes",
    // What the route found when it wrote (its answer's `was`), the card's own reading only where a route answers none, and
    // the ledger row the change wrote, which the undo names (commit.ts: undo_of). A route that wrote nothing (somebody
    // made the same change first) answers it empty: no undo, which would undo theirs.
    record: (p, data) => {
      const was = rec(data).was;
      if (was && typeof was === "object" && Object.keys(was).length === 0) return null;
      return {
        playbook_id: p.payload.playbook_id,
        was: was && typeof was === "object" ? was : p.payload.was,
        decision_id: decisionOf(data)
      };
    },
    call: (u) => {
      const was = patchIn(rec(u.was), "mode");
      return !asText(u.playbook_id) || Object.keys(was).length === 0 ? refuseWith(PROPOSAL_WORDS.noUndo) : { route: "PUT playbooks/[id]", params: { id: asText(u.playbook_id) }, body: was };
    },
    receipt: () => "It is as it was"
  },
  // Its sequence's record, where its state, clock and name are.
  open: ({ payload }) => {
    const id = idIn(payload, "playbook_id");
    return id ? sequenceRoute(id) : SEQUENCES_ROUTE;
  }
};
function runGoes(pl, data) {
  const d = rec(data);
  const at = Date.parse(asText(d.scheduled_for));
  const from = Date.parse(asText(d.moved_from));
  const tz = asText(pl.timezone) || "UTC";
  const asked = Number.isFinite(from) ? from : at;
  return whenItGoes(
    { scheduled_for: asText(d.scheduled_for) || null, moved_from: asText(d.moved_from) || null },
    (ms) => clockWhen(ms, tz, asked),
    asked
  );
}
const skipped = (data) => {
  const was = rec(data).was;
  return was === "sending" ? "stops after this batch" : was === "pending_approval" ? "skipped \u2014 nothing will send" : "canceled \u2014 nothing will send";
};
export const runSpec = {
  needs: "operator",
  gate: "approve",
  // The run's own doors, as the Playbooks card and the Broadcasts sheet press them: approve sends it, skip is its
  // cancel. The verb is the card's to say (no default, the Phase 4 plan, D11): a card that says neither is never sent.
  commit: ({ payload: pl }) => {
    const id = idIn(pl, "broadcast_id");
    if (!id || !RUN_VERBS.includes(pl.verb)) return refuseWith(PROPOSAL_WORDS.cannotApprove);
    return {
      route: pl.verb === "approve" ? "POST broadcasts/[id]/approve" : "POST broadcasts/[id]/cancel",
      params: { id }
    };
  },
  // The Broadcasts page's words: approved, with how many and when it goes; or what the skip did.
  receipt: ({ payload: pl }, data) => {
    const name = asText(pl.name) || "The run";
    if (pl.verb !== "approve") return `${name} ${skipped(data)}`;
    const n = Number(rec(data).recipient_count ?? pl.people ?? 0);
    return `${name} ${runApprovedTail(n, runGoes(pl, data))}`;
  },
  // An approved run is canceled as a broadcast is; a skip has nothing to undo.
  undo: {
    label: ({ payload }) => payload.verb === "approve" ? "Cancel it, if it has not finished" : null,
    window: "ten_minutes",
    record: (p, data) => p.payload.verb === "approve" ? { broadcast_id: rec(data).id, decision_id: decisionOf(data) } : null,
    call: cancelCall,
    receipt: canceled
  },
  // The run's sheet, where Today and the Playbooks card open it.
  open: ({ payload }) => {
    const id = idIn(payload, "broadcast_id");
    return id ? runRoute(id) : SEQUENCES_ROUTE;
  }
};
export const playbookRunSpec = {
  needs: "operator",
  gate: "approve",
  commit: ({ payload: pl }) => {
    const id = idIn(pl, "playbook_id");
    return id ? { route: "POST playbooks/[id]/run", params: { id } } : refuseWith(PROPOSAL_WORDS.cannotApprove);
  },
  receipt: ({ payload: pl }, data) => {
    const d = rec(data);
    const name = asText(d.name ?? pl.name) || LIFECYCLE_TOAST.nameless;
    const n = Number(d.eligible) || 0;
    const people = `${n} ${n === 1 ? "person" : "people"}`;
    if (d.outcome === "sent") return `${name} \u2014 ${people}, ${runGoes(pl, data)}`;
    if (d.outcome === "held") return `${name} \u2014 ${people} waiting for your approval`;
    return `${name} \u2014 nobody new to send to right now`;
  },
  undo: {
    label: () => "Cancel it, if it has not finished",
    window: "ten_minutes",
    record: (_p, data) => {
      const d = rec(data);
      const id = asText(d.broadcast_id);
      return d.outcome === "sent" && id ? { broadcast_id: id, decision_id: decisionOf(data) } : null;
    },
    call: cancelCall,
    receipt: canceled
  },
  open: ({ payload }) => {
    const id = idIn(payload, "playbook_id");
    return id ? sequenceRoute(id) : SEQUENCES_ROUTE;
  }
};
const whatsappFiledWords = (state) => {
  const at = metaStatusOf(state);
  const where = `(see ${CAMPAIGN_ROOMS.home} \u203A ${CAMPAIGN_ROOMS.library})`;
  if (at === "approved") return "is approved";
  if (at === "pending") return "is with WhatsApp for review";
  return at === "rejected" ? `was refused by WhatsApp ${where}` : `is ${at} by WhatsApp ${where}`;
};
const versionsWords = (own) => `${own.map(versionWord).join(" and ")} version${own.length === 1 ? "" : "s"}`;
export const MESSAGE_WORDS = {
  /** A text version of an offer: the door's sentence (contracts channelNeverCarries). */
  smsOffer: `${CHANNEL_WORDS.noOffersByText} Say so, and write the offer for WhatsApp and email alone.`,
  /** A message about their own booking or proposal with no WhatsApp version for WhatsApp to review: the door's sentence. */
  utilityNeedsWhatsapp: `${MESSAGE_BEGIN_WORDS.utilityNeedsWhatsapp} Add one, or write it as an offer or news (marketing).`,
  /** A WhatsApp version past what WhatsApp takes: the door's sentence (templateBodyTooLong). */
  tooLong: `${TEMPLATE_BODY_WORDS} Shorten its WhatsApp version, and propose it again.`,
  /** A WhatsApp version where no number is connected: what the door answers when the edge finds none. */
  noNumber: `${LIBRARY_WORDS.writeNeedsNumber} Say so, and write it for email or text alone, or once a number is connected.`,
  /**
   * An email version where email cannot send, which is known (channelsReady: no mailbox, or no email for the deployment):
   * why, in its sentence, else the mailbox's.
   */
  noMailbox: (why) => `${why ?? CHANNEL_WORDS.noMailbox} Say so, and write it without an email version.`,
  /**
   * An email version where whether email can send could not be asked just now (channelsReady's `unchecked`): not a no, so
   * the email stays in the message, and the card is asked for again in a moment.
   */
  emailUnchecked: `Whether email can send here could not be checked just now. Say so, and propose it again in a moment, with its email version.`,
  /** A name and language the Library holds: the door's sentence for a twin, and where that message's versions change. */
  twin: (name) => `${TEMPLATE_SAME_NAME_WORDS} Say so: \u201C${name}\u201D in this language is in ${CAMPAIGN_ROOMS.home} \u203A ${CAMPAIGN_ROOMS.library}, where its versions are changed.`,
  /** The card's title: the name the door files the message under, and its language in words ("in English"). */
  title: (name, language) => `${CAMPAIGN_ROOMS.newMessage}: ${name}, in ${languageName(language)}`,
  /**
   * When its versions are ready to send: an email's and a text's once Approve files them (the card itself sends nothing,
   * and in a plan it sits among the silent steps), WhatsApp's once WhatsApp has reviewed it, in the product's voice (a
   * person reads WhatsApp, never Meta, as STARTER_LINE_WORDS say the review).
   */
  goes: (now, review) => {
    const reviewed = "once WhatsApp has reviewed it (usually minutes, sometimes a day)";
    if (now.length === 0) return review ? `Its WhatsApp version is ready ${reviewed}` : "";
    return `Ready ${channelsWords(now)} once approved${review ? `; its WhatsApp version ${reviewed}` : ""}`;
  },
  /**
   * What the door filed (its answer): each version, ready, in review or as WhatsApp answered its filing (refused at once,
   * say, which is said with where it is seen), and the one it could not file, in its words.
   */
  filed: (name, filed, refused) => {
    const said = filed.map(
      (v) => v.channel === "whatsapp" ? `its WhatsApp version ${whatsappFiledWords(v.state)}` : `its ${versionWord(v.channel)} version is ready`
    );
    if (said.length === 0) return `\u201C${name}\u201D was not filed${refused ? `: ${refused.words}` : ""}`;
    const not = refused ? ` \xB7 its ${versionWord(refused.channel)} version was not filed: ${refused.words}` : "";
    return `\u201C${name}\u201D is in ${CAMPAIGN_ROOMS.library} \u2014 ${said.join("; ")}${not}`;
  },
  /** The undo's button: the email and text versions it deletes; none where the card writes none. */
  undo: (own) => own.length > 0 ? `Delete its ${versionsWords(own)}` : null,
  /**
   * What the undo did: those versions deleted, and the WhatsApp version, where the door filed one, left, said so, and
   * where a person deletes it if it should go.
   */
  undone: (own, whatsapp) => {
    const gone = `Its ${versionsWords(own)} ${own.length === 1 ? "is" : "are"} deleted`;
    return whatsapp ? `${gone}. Its WhatsApp version stays, held by WhatsApp: delete it in ${CAMPAIGN_ROOMS.home} \u203A ${CAMPAIGN_ROOMS.library} if it should go.` : gone;
  },
  /**
   * An undo refused part-way: the versions already deleted, the ones that are not, and the door's refusal; nothing deleted
   * yet, the refusal alone. Pressed again, the deleted ones are answered as they were and the rest is tried.
   */
  partlyUndone: (gone, left, refused) => gone.length === 0 ? refused : `Its ${versionsWords(gone)} ${gone.length === 1 ? "is" : "are"} deleted; its ${versionsWords(left)} ${left.length === 1 ? "is" : "are"} not: ${refused}`
};
const versionsIn = (v) => Array.isArray(v) ? v.map(rec).flatMap(
  (x) => CONSENT_CHANNELS.includes(x.channel) && typeof x.id === "string" && x.id ? [{ channel: x.channel, id: x.id, state: asText(x.state) }] : []
) : [];
const writtenHere = (c) => c !== "whatsapp";
const ownKept = (u) => versionsIn(u.versions).map((v) => v.channel).filter(writtenHere);
export const messageSpec = {
  needs: "operator",
  gate: "approve",
  commit: ({ payload: pl }) => {
    const name = asText(pl.name);
    const versions = rec(pl.versions);
    if (!name || Object.keys(versions).length === 0) return refuseWith(PROPOSAL_WORDS.cannotApprove);
    return {
      route: "POST templates/message",
      body: {
        name,
        language: pl.language,
        category: pl.category,
        versions,
        slots: Array.isArray(pl.slots) ? pl.slots : []
      }
    };
  },
  receipt: ({ payload: pl }, data) => {
    const d = rec(data);
    const refused = rec(d.refused);
    const not = CONSENT_CHANNELS.includes(refused.channel) ? { channel: refused.channel, words: asText(refused.words) } : null;
    return MESSAGE_WORDS.filed(asText(d.name ?? pl.name), versionsIn(d.versions), not);
  },
  // The first version the door filed: a broadcast and a playbook take any version's id for the message (core
  // templateValues), so a plan's send names this one. None where nothing was filed.
  made: (_p, data) => versionsIn(rec(data).versions).at(0)?.id ?? null,
  undo: {
    // The versions the card writes that an undo can delete, in the order the door files them.
    label: ({ payload }) => MESSAGE_WORDS.undo(OWN_VERSION_CHANNELS.filter((c) => rec(payload.versions)[c] != null)),
    window: "ten_minutes",
    // The email and text versions the door answered it filed, and the state of a WhatsApp version it filed beside them.
    record: (_p, data) => {
      const filed = versionsIn(rec(data).versions);
      const own = filed.filter((v) => writtenHere(v.channel)).map(({ channel, id }) => ({ channel, id }));
      if (own.length === 0) return null;
      return { versions: own, whatsapp: filed.find((v) => v.channel === "whatsapp")?.state ?? null };
    },
    call: (u) => {
      const own = versionsIn(u.versions).filter((v) => writtenHere(v.channel));
      return own.length === 0 ? refuseWith(PROPOSAL_WORDS.noUndo) : own.map(
        // A version gone already (an earlier press deleted it, or a member did) is what the undo wants.
        (v) => ({ route: "DELETE templates/versions/[id]", params: { id: v.id }, goneIsDone: true })
      );
    },
    receipt: (_data, u) => MESSAGE_WORDS.undone(ownKept(u), u.whatsapp != null),
    // The calls go in the order the kept versions are named, so the first `landed` of them are the ones deleted.
    partial: (u, landed, refused) => {
      const own = ownKept(u);
      return MESSAGE_WORDS.partlyUndone(own.slice(0, landed), own.slice(landed), refused);
    }
  },
  open: () => "messages"
};
