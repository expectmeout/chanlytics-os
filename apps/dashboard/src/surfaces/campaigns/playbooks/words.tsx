/**
 * Chanlytics -- People › Playbooks: the words, icons and small helpers a playbook's card and composer share (moved from
 * legacy/pages/playbook-bits.jsx, decision 0015; before that from outbound-real.jsx, Reach out Part 2.5).
 */
import {
  PLAYBOOK_REACH_WORDS,
  appointmentWords,
  clockHour,
  consentGuardWords,
  heldBackWords,
  isWinBack,
  playbookNoNumberWords,
  playbookReach,
  playbookReachDoor,
} from "@chanlytics/contracts";
import type {
  AppointmentWord,
  AskedPurpose,
  ConsentChannel,
  MessageAbout,
  ParamSourceKind,
  PlaybookDto,
  PlaybookReach,
} from "@chanlytics/contracts";
import type { TemplateDto } from "@/surfaces/inbox/types";
import { pageClock } from "@/legacy-bridge/zone";
import { surfaceValue } from "../../surface-values";
import { bcWhenWords } from "../broadcasts/when-words";
import { cmOfferedBy } from "../parts/channels";
import { mpFill } from "../parts/message-preview";
import { starters } from "../templates/verbs";
import type { PlaybookTriggerOption } from "./surface";

// Stable empties, so a workspace without templates or triggers does not
// re-run the effects on every render.
export const PB_NONE: never[] = [];

// A list a playbook may run on, in the picker's two groups (decision 0009): People's, then the workspace's own.
export const PB_LIST_GROUPS = { people: "People's lists", own: "Your lists" };

export const pbListSub = (l: { builtin?: boolean; smart?: boolean }) =>
  l.builtin ? "One of People's lists" : l.smart ? "Keeps itself current" : "Kept by hand";

// What a playbook on a list sends, and the row of Autonomy it runs under (contracts LIST_PLAYBOOK_CLASSES). Both need
// the yes to offers.
export const PB_LIST_CLASSES = [
  { id: "campaign", label: "An offer", sub: "Runs under Standing offers in Autonomy", icon: "gift" },
  { id: "reengage", label: "A win-back", sub: "Runs under Re-engage quiet customers in Autonomy", icon: "undo" },
];

// The hours a run may start at: the sending hours the clock publishes (contracts SENDING_HOURS_WORDS).
export const pbHours = () => {
  const h = pageClock().hours;
  return Array.from({ length: h.max - h.min + 1 }, (_, i) => h.min + i);
};

/** An hour a run may start at, as the product's clock says a time: "10:00 AM" (contracts clockHour). */
export const pbHour = (h: number) => clockHour(h);

export const pbPeople = (n: number) => `${n} ${n === 1 ? "person" : "people"}`;

export const pbStatus = (p: { state: string; totals?: { waiting: unknown } | null }) =>
  p.totals && p.totals.waiting ? "approval" : p.state;

// What the next run will actually do (contracts playbookReach): a running
// playbook whose list is empty is not "running" in any sense the owner means.
export const pbReach = playbookReach;

export const pbReachWords = (r: PlaybookReach) => PLAYBOOK_REACH_WORDS[r];

// The door only where a yes fixes it: somebody named and not one of them said it (contracts playbookReachDoor).
export const pbReachDoor = playbookReachDoor;

// A list whose yes has no number to send to, in the send screen's words; null keeps the card's own count.
export const pbNoNumberWords = playbookNoNumberWords;

// Words for people: a starter's title, or the name with its underscores made spaces.
export const pbTitle = (name: string | null | undefined) => starters.title(name);

// A language code as a person reads it.
export const pbLangWords = (code: string) => starters.langWords(code);

// A run's day as words ("Aug 25"): a calendar day, not an instant, so no zone.
export const pbDay = (day: string | null | undefined) => (day ? pageClock().dayWords(day) : String(day || ""));

export const pbOrder: typeof starters.compare = (a, b) => starters.compare(a, b);

// The line under the words: the one Meta holds for this row, else the starter's
// own (contracts templateFooter). It resolved ONLY through the starter library
// before, so a template a workspace wrote here showed its footer while it was
// being drafted and never again -- on this page, on Playbooks, and on Messages.
export const pbFooter = (t: Parameters<typeof starters.footer>[0] | null | undefined) =>
  t ? starters.footer(t) : null;

// What a slot shows in a preview: what a real person would see (contracts exampleParams), in the composer and on a card alike.
const PB_EXAMPLES: Record<string, string> = {
  visit_when: "tomorrow at 2:00 PM",
  visit_service: "a consultation",
  proposal_link: "their proposal's link",
};

export const pbExample = (kind: string, businessName: string | null | undefined) =>
  kind === "first_name"
    ? "Dani"
    : kind === "business_name"
      ? businessName || "the business"
      : kind === "booking_link"
        ? "your booking link"
        : PB_EXAMPLES[kind] || "";

// A card's message: its message among the offered, found by its name and language (a WhatsApp version added since moves the
// id the message is offered by; a stored id is the fallback), with the playbook's own values in the slots; null when it is
// not among them. The body and the values
// stay apart -- the preview marks what fills per person, and `words` is the same
// thing joined up, for the one line a closed card shows.
// A slot a playbook fills with what it cannot take (contracts slotChoices), in
// words: the composer let any slot take any source, and a win-back set up with
// its first name filled by the booking link greets everyone "Hi your booking
// link" until it is changed. Null when every slot takes what it should. A link
// the workspace has since removed is a different fault, and the route's.
// The moments the surface offers are the caller's to pass: this reads no surface of its own.
export const pbWrongSlot = (
  p: Pick<PlaybookDto, "trigger" | "params">,
  t: TemplateDto | null,
  triggers: readonly PlaybookTriggerOption[] | undefined,
) => {
  if (!t || !Array.isArray(p.params)) return null;
  const trig = (triggers || PB_NONE).find((x) => x.id === p.trigger) || null;
  const choices = starters.slots(t, {
    visits: !!(trig && trig.kind === "visit"),
    bookingLink: true,
    proposal: !!(trig && trig.kind === "deal"),
  });
  if (!choices) return null;
  const at = p.params.findIndex((s, i) => s && s.kind && choices[i] && !choices[i].includes(s.kind));
  if (at < 0) return null;
  const label = starters.slotLabels(t)[at] || `Value ${at + 1}`;
  const s = p.params[at];
  if (!s) return null;
  return s.kind === "text"
    ? `“${label}” says “${s.value}” to everyone, where each person's own belongs.`
    : `“${label}” is filled with ${String(starters.sources[s.kind] || s.kind).toLowerCase()}.`;
};

export const pbMessage = (
  p: Pick<PlaybookDto, "template_id" | "template_name" | "template_language" | "params">,
  templates: readonly TemplateDto[],
  businessName: string | null | undefined,
) => {
  const t =
    cmOfferedBy(templates, p.template_name, p.template_language) ||
    templates.find((x) => x.id === p.template_id) ||
    null;
  if (!t) return null;
  const values = (p.params || PB_NONE).map((s) =>
    s && s.kind === "text" ? s.value : s && s.kind ? pbExample(s.kind, businessName) : String(s ?? ""),
  );
  return { template: t, body: t.body_preview, values, words: mpFill(t.body_preview, values) };
};

// When a run a person asked for really goes (broadcasts/when.tsx bcWhenWords). An edge older than the dashboard gives no time back, and nothing claims one.
// What a reply is, in the one window's words (contracts REPLY_WINDOW_WORDS, on the surface).
export const pbReplyTip = () => {
  const w = surfaceValue("playbooks")?.replyWindow;
  return w ? `Threads that heard from the customer ${w} of a run` : "Threads that heard from the customer after a run";
};

export const pbSentWhen = (d: { scheduled_for?: string | null; moved_from?: string | null } | null | undefined) =>
  d && d.scheduled_for ? bcWhenWords(d) : `on its way — sends go out ${pageClock().hours.between} by your clock`;

// Each moment has its glyph: the arrow that comes back, a wave hello, the
// phone that only ever rang, the gift, the calendar, the clock of the day
// after, a list's filter, and a proposal's deal. A playbook on a trigger this
// list does not know gets a bolt.
const PB_ICONS: Record<string, string> = {
  quiet_30: "undo",
  new_week: "wave",
  phoned_only: "phone",
  everyone_monthly: "gift",
  visit_tomorrow: "calendar",
  visited: "clock",
  lapsed: "undo",
  saved_list: "filter",
  proposal_waiting: "deal",
};

export const pbIcon = (trigger: string) => PB_ICONS[trigger] || "bolt";

export const pbShort = (id: string) => starters.langTag(id);

export const pbLabel = (id: string) => starters.langLabel(id);

// The composer's numbers, a few sensible ones each, chosen in place; a playbook
// made before them keeps its own among them (pbWith). The route takes any whole
// number in its range: 1-500 a run, a gap of 7-365 days, a cadence of 1-90.
export const PB_CAPS = [5, 10, 25, 50, 100, 250, 500];

export const PB_GAPS = [7, 14, 30, 60, 90, 180, 365];

export const PB_CADENCES = [7, 14, 30, 60, 90];

export const PB_TEXT: ParamSourceKind[] = ["text"];

export const pbWith = (list: number[], n: number) => (list.includes(n) ? list : [...list, n].sort((a, b) => a - b));

// The moments nothing is doing yet, among the ones a new playbook may start from (`offered`: none retired, one win-back).
// The win-backs are one moment, read the one way the workspace can, so a playbook on either leaves none to set up.
const pbUnused = (
  triggers: readonly PlaybookTriggerOption[],
  rows: readonly { trigger: string }[] | null | undefined,
) => {
  const used = new Set((rows || PB_NONE).map((p) => p.trigger));
  const winBackMade = [...used].some(isWinBack);
  return triggers.filter((t) => t.offered && !used.has(t.id) && !(winBackMade && isWinBack(t.id)));
};

// A new playbook opens on the first moment nothing is doing yet, else the first one offered.
export const pbFirstFree = (
  triggers: readonly PlaybookTriggerOption[],
  rows: readonly { trigger: string }[] | null | undefined,
) => {
  const t = pbUnused(triggers, rows)[0] || triggers.find((x) => x.offered) || triggers[0];
  return t ? t.id : "quiet_30";
};

// Who a run reaches, said in the guardrails: what each channel it goes by asks of a person (contracts consentGuardWords), so
// an email about a visit is not said to need a yes and a number. The channels are the ones the playbook keeps ticked.
export const pbWhoWords = (channels: readonly ConsentChannel[], purpose: AskedPurpose, about: MessageAbout) =>
  consentGuardWords(channels, purpose, about).join(" ");

// A sentence from a clause contracts words (heldBackWords: "people who asked to stop, ... are held back at the wire").
const pbSentence = (clause: string) => `${clause.charAt(0).toUpperCase()}${clause.slice(1)}.`;

// What every run keeps to, behind the shield: who it reaches (pbWhoWords), the moment's own rule, and who the wire holds back
// (contracts heldBackWords) for the channels it goes by.
// `about` is the moment's (contracts messageAboutOfTrigger): a visit's or a follow-up's message is theirs (decision D1).
// `on` is the moment's kind and what the workspace calls an appointment: a reminder's rule says the page's one word.
export const pbGuardWords = (
  on: { kind: string; word: AppointmentWord },
  channels: readonly ConsentChannel[],
  purpose: AskedPurpose,
  about: MessageAbout,
) => {
  const { kind } = on;
  const moment =
    kind === "visit"
      ? `One message per ${appointmentWords(on.word).one}.`
      : kind === "deal"
        ? "Their proposal has its link and nothing back. One message per proposal, and one campaign message per person a week, across every campaign."
        : "Never twice within its gap, and one campaign message per person a week, across every campaign.";
  return [pbWhoWords(channels, purpose, about), moment, pbSentence(heldBackWords(channels))].filter(Boolean).join(" ");
};
