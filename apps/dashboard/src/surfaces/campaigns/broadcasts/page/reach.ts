/**
 * What the broadcasts page works out of its state on every draw (moved from legacy/pages/broadcasts.jsx, decision
 * 0015): who the send reaches, what each slot of the message may take and holds, the people behind the count, and the
 * one person the preview is drawn for. Plain functions, each taking what it reads and answering what it works out.
 */
import {
  CAMPAIGNS_PAUSED_WORDS,
  DEFAULT_CAMPAIGN_CHANNELS,
  emptyAudienceRefusal,
  overLimitRefusal,
  readyForMessage,
} from "@chanlytics/contracts";
import type { AskedPurpose, AudiencePreview, ConsentChannel, ParamSourceKind } from "@chanlytics/contracts";
import { sameChannels } from "@/lib/campaign-channels";
import { pageClock } from "@/legacy-bridge/zone";
import {
  CM_NO_MESSAGE_YET,
  CM_VIA_WORDS,
  cmChannelsOn,
  cmHeldLines,
  cmReachBy,
  cmReadyOf,
  cmSplitWords,
  cmStandInOf,
  cmViaTicks,
} from "../../parts/channels";
import { cmChannelOfPerson, cmOfferFoot, cmPreviewBy } from "../../parts/preview-by";
import { starters } from "../../templates/verbs";
import type { AudienceOption } from "../surface";
import { broadcasts } from "../verbs";
import { BC_NONE } from "../run";
import { bcWhenNote } from "../when";
import type { BcBase, BcPeople, BcPreview, BcReach, BcSay, BcSlotChoices, BcSlotVar, BcSlotWords } from "./types";
import { BC_SAYS, BC_TEXT, bcFooter, bcKey, bcSlots } from "./words";

/**
 * Nobody on the list is reached: no channel the send ticks can carry this message, so the whole list is held on that. The
 * list's size is the reading it was made from (reached and held are the whole of it, whatever channels).
 */
function bcNobodyOn(base: AudiencePreview): AudiencePreview {
  const pool = base.sending + base.held;
  return {
    people: [],
    split: { reached: 0, byChannel: { whatsapp: 0, sms: 0, email: 0 }, held: pool, heldBy: { no_channel: pool } },
    sending: 0,
    held: pool,
    saidYes: 0,
    heard: 0,
  };
}

/**
 * An audience read for the channels the send goes by (contracts reachFor: each person once, on one of them). WhatsApp alone
 * is the reading every audience carries, with its own count; any other set is the one kept for it (surface.ts `by`), and
 * none on reaches nobody. Null where the surface holds no preview for it, which the page then says nothing of.
 */
function bcReadingOf(
  a: AudienceOption | null,
  purpose: AskedPurpose,
  on: readonly ConsentChannel[],
): { sending: number; preview: AudiencePreview | null } {
  if (!a) return { sending: 0, preview: null };
  const base = a.preview ? a.preview[purpose] : null;
  if (sameChannels(on, DEFAULT_CAMPAIGN_CHANNELS))
    return { sending: a.counts ? a.counts[purpose] || 0 : 0, preview: base };
  if (on.length === 0) return { sending: 0, preview: base ? bcNobodyOn(base) : null };
  const kept = a.by ? a.by[purpose].find((k) => sameChannels(k.channels, on)) : undefined;
  return { sending: kept ? kept.preview.sending : 0, preview: kept ? kept.preview : null };
}

// Who the send reaches with the message picked: the list, how many on it this message may reach by the channels it goes
// by, and the number it goes from.
export function bcReachOf({
  audiences,
  aud,
  templates,
  tplId,
  data,
  channels,
}: Pick<BcBase, "audiences" | "aud" | "templates" | "tplId" | "data" | "channels">): BcReach {
  const active = audiences.find((a) => bcKey(a) === aud) || audiences[0] || null;
  // The template comes BEFORE the counts now, because the counts depend on it.
  //
  // An audience has two sizes, not one: a `utility` template reaches everybody who
  // said yes to hearing from the business, a marketing one reaches only those who
  // separately said yes to offers. The chip used to show a single number computed
  // before any template was picked, which meant the composer promised an audience
  // the enrolment route would then refuse. `purpose` is stamped on each template by
  // the bridge from Meta's own category, so the page never decides it.
  const tpl = templates.find((t) => t.id === tplId) || null;
  const purpose = (tpl && tpl.purpose) || "marketing";
  const number = data.number || null;
  // The channels it goes by: the ones ticked that the workspace can send on and the message has a version for. Before a
  // message is picked there is no version to ask after, so only what the workspace cannot send on closes a switch: "This
  // message has no email version yet" over no message was a reason for nothing (Send by stands above Says, 8 Oct 2026).
  const ready = cmReadyOf(data.ready);
  const channelReady = tpl ? readyForMessage(ready, tpl.message ?? CM_NO_MESSAGE_YET) : ready;
  // A broadcast is the business's news, whatever its template's category: by email it waits for the workspace's offers as an
  // offer does (contracts isOfferByEmail, decision D2), so a channel is open to it by what an offer's is.
  const on = cmChannelsOn(channels, channelReady, purpose, "ours");
  // The switches before a message is picked: the count above is an offer's until then (the smaller of an audience's two
  // sizes), but a switch closed by "Texts carry no offers" over no message would be a reason for nothing, as a missing
  // version's was. Only the workspace closes one until a message says what it is.
  const viaPurpose = tpl ? purpose : "conversational";
  const sizeOf = (a: BcReach["active"]) => bcReadingOf(a, purpose, on).sending;
  const reading = bcReadingOf(active, purpose, on);
  const activeCount = reading.sending;
  const viaWhatsApp = on.includes("whatsapp");
  // The number matters to the send only where it goes by WhatsApp: a send that does not tick it never asks.
  const numberOk = !viaWhatsApp || !!(number && number.present && number.health.canSend);
  // The number's daily limit is WhatsApp's: only who the send reaches on it counts against it.
  const onWhatsApp = reading.preview && reading.preview.split ? reading.preview.split.byChannel.whatsapp : activeCount;
  const overLimitWords = active && viaWhatsApp && number ? overLimitRefusal(number.health, onWhatsApp) : null;
  return {
    active,
    tpl,
    purpose,
    sizeOf,
    activeCount,
    number,
    numberOk,
    overLimit: overLimitWords !== null,
    overLimitWords,
    channelReady,
    on,
    // A broadcast goes now: a channel closed now cannot be ticked.
    ticks: cmViaTicks(channels, channelReady, { purpose: viaPurpose, about: "ours" }, false),
    reading: reading.preview,
  };
}

// What each slot of the message may take, and what it takes now.
export function bcSlotChoicesOf({
  tpl,
  link,
  sources,
  tplId,
  data,
}: Pick<BcBase, "link" | "sources" | "tplId" | "data"> & Pick<BcReach, "tpl">): BcSlotChoices {
  const vars = tpl && Array.isArray(tpl.variables) ? (tpl.variables as BcSlotVar[]) : [];
  const SRC = starters.sources;
  const HINTS = starters.sourceHints;
  // What each slot may take, its default first: a starter's slots come filled in,
  // and a template written elsewhere gets a guess from its labels. A booking link
  // the workspace has not set can only be typed, so nothing is offered that
  // cannot be sent.
  const choices = tpl ? bcSlots(tpl, link) || BC_NONE : BC_NONE;
  // A slot's source: the one chosen when the slot may take it, else its first. A
  // source kept from before that the slot may not take -- a run sent again, a
  // link since removed -- is not kept.
  const srcOf = (i: number) => {
    const c = choices[i] || BC_TEXT;
    const s = (sources[tplId] || BC_NONE)[i];
    return c.includes(s) ? s : c[0];
  };
  const exampleOf = (kind: ParamSourceKind) =>
    kind === "first_name"
      ? "Dani"
      : kind === "business_name"
        ? data.businessName || "the business"
        : kind === "booking_link"
          ? "your booking link"
          : "";
  // Each slot's words: a starter's own, else the labels the row carries.
  const labels = tpl ? starters.slotLabels(tpl) : vars.map((v, i) => v.label || `Value ${v.position || i + 1}`);
  return { vars, SRC, HINTS, choices, srcOf, exampleOf, labels };
}

/**
 * The first thing that keeps the send from going, in the foot's words, or null when nothing does. A paused workspace first:
 * nothing it sends leaves, whatever else is filled in, so the foot says so instead of offering Send. Then, in the order a
 * person fills the screen in: the message, who it goes to, each value, and what is wrong with sending it -- nobody it
 * reaches, a number that cannot carry it, the day's limit. `ready` is this being null (bcSlotWordsOf), so the sentence under
 * the foot and the Send it disables are one rule, never two that can disagree.
 */
function bcStopOf(
  f: Pick<
    BcReach,
    "tpl" | "active" | "activeCount" | "on" | "purpose" | "number" | "numberOk" | "overLimitWords" | "channelReady"
  > &
    Pick<BcSlotChoices, "labels"> & { filled: readonly unknown[] },
): BcSay | null {
  const { tpl, active, activeCount, on, purpose, number, numberOk, overLimitWords, channelReady, labels, filled } = f;
  if (channelReady.paused) return { tone: "warn", words: CAMPAIGNS_PAUSED_WORDS };
  if (!tpl) return { tone: "plain", words: BC_SAYS.pickMessage };
  if (!active) return { tone: "plain", words: BC_SAYS.pickList };
  const blank = filled.findIndex((v) => !String(v).trim());
  if (blank >= 0) return { tone: "plain", words: BC_SAYS.fill(labels[blank] || `Value ${blank + 1}`) };
  // Nobody on the list: no channel is on to reach them by, or none of them can be sent this.
  if (!(activeCount > 0))
    return { tone: "warn", words: on.length === 0 ? CM_VIA_WORDS.nowhere : BC_SAYS.nobody(active.label, purpose) };
  if (!numberOk)
    return {
      tone: "warn",
      words: number && number.present ? (number.health.refusal ?? number.health.label) : BC_SAYS.noNumber,
    };
  if (overLimitWords) return { tone: "warn", words: overLimitWords };
  return null;
}

// The words each slot holds, what the preview shows for them, what goes out, and whether it can go -- and, if not, the first
// thing that stops it (bcStopOf), which the foot says.
export function bcSlotWordsOf({
  vars,
  params,
  tplId,
  setParams,
  setSources,
  srcOf,
  data,
  exampleOf,
  labels,
  tpl,
  active,
  activeCount,
  busy,
  numberOk,
  overLimitWords,
  on,
  purpose,
  number,
  channelReady,
}: Pick<BcBase, "params" | "tplId" | "setParams" | "setSources" | "data" | "busy"> &
  Pick<BcSlotChoices, "vars" | "srcOf" | "exampleOf" | "labels"> &
  Pick<
    BcReach,
    "tpl" | "active" | "activeCount" | "numberOk" | "overLimitWords" | "on" | "purpose" | "number" | "channelReady"
  >): BcSlotWords {
  const typed = vars.map((v, i) => (params[tplId] || [])[i] || "");
  const setTyped = (i: number, words: string) =>
    setParams((p) => {
      const next = [...(p[tplId] || [])];
      next[i] = words;
      return { ...p, [tplId]: next };
    });
  const chooseSource = (i: number, kind: ParamSourceKind) => {
    const was = srcOf(i);
    setSources((s) => {
      const next = [...(s[tplId] || [])];
      next[i] = kind;
      return { ...s, [tplId]: next };
    });
    // Typing over the business name starts from it, as on a playbook.
    if (kind === "text" && was === "business_name" && !typed[i].trim() && data.businessName)
      setTyped(i, data.businessName);
  };
  const filled = vars.map((v, i) => (srcOf(i) === "text" ? typed[i] : exampleOf(srcOf(i))));
  // The preview shows an unfilled slot by its name, never as {{n}}.
  const previewValues = vars.map((v, i) =>
    srcOf(i) === "text" ? typed[i].trim() || `[${labels[i]}]` : exampleOf(srcOf(i)),
  );
  const specs = vars.map((v, i) => (srcOf(i) === "text" ? typed[i].trim() : { kind: srcOf(i) }));
  // Nothing stops it, and it is not already on its way. What is said while something does is the same call's answer.
  const say = bcStopOf({
    tpl,
    active,
    activeCount,
    on,
    purpose,
    number,
    numberOk,
    overLimitWords,
    channelReady,
    labels,
    filled,
  });
  const ready = say === null && !busy;
  const shown = previewValues.map((v) => String(v).trim());
  return { typed, setTyped, chooseSource, filled, previewValues, specs, ready, say, shown };
}

// The people behind the count, and what the line under the list says about them.
export function bcPeopleOf({
  active,
  purpose,
  activeCount,
  reading,
  on,
}: Pick<BcReach, "active" | "purpose" | "activeCount" | "reading" | "on">): BcPeople {
  // Who the preview is drawing it for. The bridge keeps a handful of the rows the
  // count is a length of; a surface cached before they were published has none,
  // and then the composer shows the example values as it always did.
  const sample = reading;
  const people = sample ? sample.people : BC_NONE;
  // Nobody on it can be sent this, and somebody on it said yes: the ones who did have no number to send to. Said in
  // People's words (#663), with no door -- asking for their yes would ask for an answer they gave. A send that ticks email
  // is said as the route refuses it (contracts emptyAudienceRefusal): what each ticked channel asks, never "a number".
  const noNumber =
    active && activeCount === 0 && sample && sample.saidYes > 0
      ? on.includes("email")
        ? emptyAudienceRefusal(purpose, active.label, [], { channels: on, about: "ours" })
        : broadcasts.noNumberWords(`“${active.label}”`, purpose)
      : null;
  // How many on it said yes, for the line under the audience (contracts saidYesWords): who it reaches, and who said
  // yes when nobody can be sent it -- "0 people … said yes" stood right over the no-number line, and was false.
  const yesWords = active
    ? broadcasts.saidYesWords(`“${active.label}”`, purpose, activeCount, (sample && sample.saidYes) || 0)
    : null;
  // Said only where the send goes by more than WhatsApp alone: for WhatsApp alone the line is what it always was.
  const splitWords = cmSplitWords(sample && sample.split, on);
  const heldLines = splitWords ? cmHeldLines(sample && sample.split, purpose) : [];
  // The same split as the To line's clause after the count, and what the preview labels each person's channel by.
  const reachBy = cmReachBy(sample && sample.split, on);
  return { sample, people, noNumber, yesWords, splitWords, heldLines, reachBy };
}

// The one person the preview is drawn for, what they read, and when it lands. They read the message on the channel the send
// reaches them on: the email's subject, words and foot, the text's words and STOP line, WhatsApp's template otherwise
// (parts/preview-by.ts), the channel named where the send goes by more than WhatsApp alone.
export function bcPreviewOf({
  people,
  who,
  shown,
  vars,
  srcOf,
  whenAt,
  data,
  tpl,
  reachBy,
}: Pick<BcBase, "who" | "whenAt" | "data"> &
  Pick<BcPeople, "people" | "reachBy"> &
  Pick<BcReach, "tpl"> &
  Pick<BcSlotWords, "shown"> &
  Pick<BcSlotChoices, "vars" | "srcOf">): BcPreview {
  const person = people.length ? people[Math.min(who, people.length - 1)] : null;
  const channel = person ? cmChannelOfPerson(person) : null;
  // What this person really reads. A first-name slot takes THEIR name, and the
  // words the wire uses when nobody has one -- "Hi there" (contracts
  // resolveParams) -- had never been shown to anybody before a send.
  const forPerson = !person
    ? shown
    : vars.map((v, i) => (srcOf(i) === "first_name" ? person.firstName || "there" : shown[i]));
  const noName = !!person && !person.refusal && !person.firstName;
  const personNote = !person
    ? null
    : person.refusal
      ? person.refusal
      : noName
        ? "No first name on file, only a number — the message opens “Hi there”."
        : null;
  // When the message really lands, for the stamp on it: the box's time, or now,
  // moved to the next nine o'clock exactly as the route moves it (bcWhenNote).
  const goesAt = pageClock().nextOpen(whenAt === null ? Date.now() : whenAt).at;
  // A surface cached before the ceiling was published carries none; the route's is thirty days.
  const maxDays = data.scheduleMaxDays || 30;
  const whenNote = bcWhenNote(whenAt, maxDays);
  // With nobody to walk through (a surface cached before the people were kept), the preview is the message's own words,
  // WhatsApp's where it has a version there, as it was; a person held back is those words too, marked Not sent.
  const standIn = tpl ? cmStandInOf(tpl) : "whatsapp";
  const preview = tpl
    ? cmPreviewBy(
        { body: tpl.body_preview, header: tpl.header, footer: bcFooter(tpl), buttons: tpl.buttons ?? null },
        person ? channel : standIn,
        {
          versions: tpl.versions,
          language: tpl.language,
          business: data.businessName,
          address: data.businessAddress,
          labelled: reachBy !== null,
          standIn,
          // An offer's email reads with the offer's foot: why they get it, and the way out (step 4). A broadcast is the
          // business's news, which is an offer by email whatever its template's category (decision D2).
          ...cmOfferFoot(tpl.category, "ours"),
        },
      )
    : null;
  return { person, channel, preview, forPerson, noName, personNote, goesAt, maxDays, whenNote };
}
