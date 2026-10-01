/**
 * Chanlytics -- People › Playbooks: the words, icons and small helpers a playbook's card and composer share (moved from
 * legacy/pages/playbook-bits.jsx, decision 0015; before that from outbound-real.jsx, Reach out Part 2.5).
 */
import { PLAYBOOK_REACH_WORDS, playbookNoNumberWords, playbookReach, playbookReachDoor } from "@chanlytics/contracts";
import type { ParamSourceKind, PlaybookDto, PlaybookReach } from "@chanlytics/contracts";
import type { TemplateDto } from "@/surfaces/inbox/types";
import { pageClock } from "@/legacy-bridge/zone";
import { Icon } from "../../kit/icon/icon";
import { surfaceValue } from "../../surface-values";
import { bcWhenWords } from "../broadcasts/when";
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

// A number said as a word inside a sentence -- "the six moments", "two set up" -- the way a person says it.
const PB_WORDS = [
  "no",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
];

export const pbSpell = (n: number, capital = false) => {
  const w = PB_WORDS[n] || String(n);
  return capital ? w.charAt(0).toUpperCase() + w.slice(1) : w;
};

export const pbHour = (h: number) => `${String(h).padStart(2, "0")}:00`;

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

// A card's message: its template among the approved, with the playbook's own
// values in the slots; null when it is not among them. The body and the values
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
  p: Pick<PlaybookDto, "template_id" | "params">,
  templates: readonly TemplateDto[],
  businessName: string | null | undefined,
) => {
  const t = templates.find((x) => x.id === p.template_id) || null;
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

// What a moment is for, said once on its empty card: who it reaches and why it
// is worth a message. The count of who it would reach today follows it.
export const PB_BLURBS: Record<string, string> = {
  quiet_30: "Everyone you have not heard from in a month — the easiest customer to win back is one who already came.",
  new_week:
    "Everyone who wrote or phoned for the first time this week — the welcome that saves your number in their phone.",
  phoned_only: "Everyone who only ever phoned — one message, and they can text you instead of calling.",
  everyone_monthly: "Everyone who said yes to offers, once a month — this month's offer, on a clock.",
  visit_tomorrow: "Everyone with a visit tomorrow — the reminder that keeps the chair from sitting empty.",
  visited:
    "Everyone who came in yesterday and has nothing on the calendar — the shortest path from a visit to the next booking.",
  lapsed:
    "Everyone whose last visit was 45 days ago or more, with nothing ahead on the calendar — the regulars drifting away.",
  saved_list:
    "Everyone on a list — one of People's, or one of yours, kept by hand or kept current by a rule you described.",
  proposal_waiting:
    "Everyone whose proposal has waited with nothing back — one nudge each, with the link to it, before it goes cold.",
};

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

// A new playbook opens on the first moment nothing is doing yet, else the first.
export const pbFirstFree = (
  triggers: readonly PlaybookTriggerOption[],
  rows: readonly { trigger: string }[] | null | undefined,
) => {
  const used = new Set((rows || PB_NONE).map((p) => p.trigger));
  const t = triggers.find((x) => !used.has(x.id)) || triggers[0];
  return t ? t.id : "quiet_30";
};

interface PbTokProps {
  value: number;
  options: readonly { v: number; t: string }[];
  onChange: (n: number) => void;
  label: string;
  testid?: string | null;
}

// A number inside a sentence, chosen where it is said: a select drawn as the
// words it says, with its chevron. As wide as its longest choice, so picking
// one moves nothing around it.
export const PbTok = ({ value, options, onChange, label, testid = null }: PbTokProps) => (
  <span className="pb-tok">
    <select
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      aria-label={label}
      data-testid={testid || undefined}
    >
      {options.map((o) => (
        <option key={o.v} value={o.v}>
          {o.t}
        </option>
      ))}
    </select>
    <Icon name="chevron-down" size={9} />
  </span>
);

// What every run keeps to, behind the shield.
export const pbGuardWords = (kind: string) =>
  kind === "visit"
    ? "Only people with a recorded yes and a number. One message per visit. Anyone who asked to stop, or is mid-thread with a person, is held back at the wire."
    : kind === "deal"
      ? "Only people with a recorded yes and a number, whose proposal has its link and nothing back. One message per proposal, and one playbook message per person a week, across every playbook. Anyone who asked to stop, or is mid-thread with a person, is held back at the wire."
      : "Only people with a recorded yes and a number. Never twice within its gap, and one playbook message per person a week, across every playbook. Anyone who asked to stop, or is mid-thread with a person, is held back at the wire.";
