/* global React, Icon */
// Chanlytics -- People › Playbooks: the words, icons and small helpers a playbook's card and composer share. Moved whole from outbound-real.jsx
// (Reach out Part 2.5), which reads it from window.

// Stable empties, so a workspace without templates or triggers does not
// re-run the effects on every render.
const PB_NONE = [];

// A list a playbook may run on, in the picker's two groups (decision 0009): People's, then the workspace's own.
const PB_LIST_GROUPS = { people: "People's lists", own: "Your lists" };

const pbListSub = (l) => (l.builtin ? "One of People's lists" : l.smart ? "Keeps itself current" : "Kept by hand");

// What a playbook on a list sends, and the row of Autonomy it runs under (contracts LIST_PLAYBOOK_CLASSES). Both need
// the yes to offers.
const PB_LIST_CLASSES = [
  { id: "campaign", label: "An offer", sub: "Runs under Standing offers in Autonomy", icon: "gift" },
  { id: "reengage", label: "A win-back", sub: "Runs under Re-engage quiet customers in Autonomy", icon: "undo" },
];

// The hours a run may start at: the sending hours the clock publishes (contracts SENDING_HOURS_WORDS).
const pbHours = () => { const h = window.__clock && window.__clock.hours; return h ? Array.from({ length: h.max - h.min + 1 }, (_, i) => h.min + i) : []; };

// A number said as a word inside a sentence -- "the six moments", "two set up" -- the way a person says it.
const PB_WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];

const pbSpell = (n, capital = false) => { const w = PB_WORDS[n] || String(n); return capital ? w[0].toUpperCase() + w.slice(1) : w; };

const pbHour = (h) => `${String(h).padStart(2, "0")}:00`;

const pbPeople = (n) => `${n} ${n === 1 ? "person" : "people"}`;

const pbStatus = (p) => (p.totals && p.totals.waiting ? "approval" : p.state);

// What the next run will actually do (contracts playbookReach): a running
// playbook whose list is empty is not "running" in any sense the owner means.
const pbReach = (p) => (window.__playbookReach ? window.__playbookReach(p) : "sends");

const pbReachWords = (r) => (window.__playbookReachWords ? window.__playbookReachWords[r] : null);

// The door only where a yes fixes it: somebody named and not one of them said it (contracts playbookReachDoor).
const pbReachDoor = (r, named) => (window.__playbookReachDoor ? window.__playbookReachDoor(r, named) : null);

// A list whose yes has no number to send to, in the send screen's words; null keeps the card's own count.
const pbNoNumberWords = (p, named) => (window.__playbookNoNumberWords ? window.__playbookNoNumberWords(p, named) : null);

// Words for people: a starter's title, or the name with its underscores made spaces.
const pbTitle = (name) => (window.__starters ? window.__starters.title(name) : String(name || "").replace(/_/g, " "));

const pbIsStarter = (name) => !!(window.__starters && window.__starters.byName(name));

// A language code as a person reads it; the code itself when the library is not read.
const pbLangWords = (code) => (window.__starters && window.__starters.langWords ? window.__starters.langWords(code) : String(code || ""));

// A run's day as words ("Aug 25"): a calendar day, not an instant, so no zone.
const pbDay = (day) => (day && window.__clock && window.__clock.dayWords ? window.__clock.dayWords(day) : String(day || ""));

const pbOrder = (a, b) => (window.__starters ? window.__starters.compare(a, b) : 0);

// The line under the words: the one Meta holds for this row, else the starter's
// own (contracts templateFooter). It resolved ONLY through the starter library
// before, so a template a workspace wrote here showed its footer while it was
// being drafted and never again -- on this page, on Playbooks, and on Messages.
const pbFooter = (t) => (t && window.__starters && window.__starters.footer ? window.__starters.footer(t) : null);

// What a slot shows in a preview: what a real person would see (contracts exampleParams), in the composer and on a card alike.
const PB_EXAMPLES = { visit_when: "tomorrow at 2:00 PM", visit_service: "a consultation", proposal_link: "their proposal's link" };

const pbExample = (kind, businessName) => (kind === "first_name" ? "Dani" : kind === "business_name" ? (businessName || "the business") : kind === "booking_link" ? "your booking link" : (PB_EXAMPLES[kind] || ""));

// A card's message: its template among the approved, with the playbook's own
// values in the slots; null when it is not among them. The body and the values
// stay apart -- the preview marks what fills per person, and `words` is the same
// thing joined up, for the one line a closed card shows.
// A slot a playbook fills with what it cannot take (contracts slotChoices), in
// words: the composer let any slot take any source, and a win-back set up with
// its first name filled by the booking link greets everyone "Hi your booking
// link" until it is changed. Null when every slot takes what it should. A link
// the workspace has since removed is a different fault, and the route's.
const pbWrongSlot = (p, t) => {
  const S = window.__starters;
  if (!t || !S || !S.slots || !Array.isArray(p.params)) return null;
  const trig = (window.__PLAYBOOKS && window.__PLAYBOOKS.triggers || PB_NONE).find((x) => x.id === p.trigger) || null;
  const choices = S.slots(t, { visits: !!(trig && trig.kind === "visit"), bookingLink: true, proposal: !!(trig && trig.kind === "deal") });
  if (!choices) return null;
  const at = p.params.findIndex((s, i) => s && s.kind && choices[i] && !choices[i].includes(s.kind));
  if (at < 0) return null;
  const label = S.slotLabels(t)[at] || `Value ${at + 1}`;
  const s = p.params[at];
  return s.kind === "text"
    ? `“${label}” says “${s.value}” to everyone, where each person's own belongs.`
    : `“${label}” is filled with ${String((S.sources || {})[s.kind] || s.kind).toLowerCase()}.`;
};

const pbMessage = (p, templates, businessName) => {
  const t = templates.find((x) => x.id === p.template_id) || null;
  if (!t) return null;
  const values = (p.params || PB_NONE).map((s) => (s && s.kind === "text" ? s.value : s && s.kind ? pbExample(s.kind, businessName) : String(s ?? "")));
  // No fallback: message-preview.jsx is loaded before every page, in both lists,
  // and a quiet `String(body)` here would put raw {{1}} on a card rather than
  // the words -- which is what a test that had not loaded it drew.
  return { template: t, body: t.body_preview, values, words: window.mpFill(t.body_preview, values) };
};

// When a run a person asked for really goes (broadcasts-real.jsx bcWhenWords). An edge older than the dashboard gives no time back, and nothing claims one.
// What a reply is, in the one window's words (contracts REPLY_WINDOW_WORDS, on the surface).
const pbReplyTip = () => { const w = window.__PLAYBOOKS && window.__PLAYBOOKS.replyWindow; return w ? `Threads that heard from the customer ${w} of a run` : "Threads that heard from the customer after a run"; };

const pbSentWhen = (d) => (d && d.scheduled_for && window.bcWhenWords ? window.bcWhenWords(d) : window.__clock && window.__clock.hours ? `on its way — sends go out ${window.__clock.hours.between} by your clock` : "on its way");

// Each moment has its glyph: the arrow that comes back, a wave hello, the
// phone that only ever rang, the gift, the calendar, the clock of the day
// after, a list's filter, and a proposal's deal. A playbook on a trigger this
// list does not know gets a bolt.
const PB_ICONS = { quiet_30: "undo", new_week: "wave", phoned_only: "phone", everyone_monthly: "gift", visit_tomorrow: "calendar", visited: "clock", lapsed: "undo", saved_list: "filter", proposal_waiting: "deal" };

const pbIcon = (trigger) => PB_ICONS[trigger] || "bolt";

// What a moment is for, said once on its empty card: who it reaches and why it
// is worth a message. The count of who it would reach today follows it.
const PB_BLURBS = {
  quiet_30: "Everyone you have not heard from in a month — the easiest customer to win back is one who already came.",
  new_week: "Everyone who wrote or phoned for the first time this week — the welcome that saves your number in their phone.",
  phoned_only: "Everyone who only ever phoned — one message, and they can text you instead of calling.",
  everyone_monthly: "Everyone who said yes to offers, once a month — this month's offer, on a clock.",
  visit_tomorrow: "Everyone with a visit tomorrow — the reminder that keeps the chair from sitting empty.",
  visited: "Everyone who came in yesterday and has nothing on the calendar — the shortest path from a visit to the next booking.",
  lapsed: "Everyone whose last visit was 45 days ago or more, with nothing ahead on the calendar — the regulars drifting away.",
  saved_list: "Everyone on a list — one of People's, or one of yours, kept by hand or kept current by a rule you described.",
  proposal_waiting: "Everyone whose proposal has waited with nothing back — one nudge each, with the link to it, before it goes cold.",
};

const pbShort = (id) => (window.__starters && window.__starters.langTag ? window.__starters.langTag(id) : String(id || "").slice(0, 2).toUpperCase());

const pbLabel = (id) => (window.__starters && window.__starters.langLabel ? window.__starters.langLabel(id) : pbLangWords(id));

// The composer's numbers, a few sensible ones each, chosen in place; a playbook
// made before them keeps its own among them (pbWith). The route takes any whole
// number in its range: 1-500 a run, a gap of 7-365 days, a cadence of 1-90.
const PB_CAPS = [5, 10, 25, 50, 100, 250, 500];

const PB_GAPS = [7, 14, 30, 60, 90, 180, 365];

const PB_CADENCES = [7, 14, 30, 60, 90];

const PB_TEXT = ["text"];

const pbWith = (list, n) => (list.includes(n) ? list : [...list, n].sort((a, b) => a - b));

// A new playbook opens on the first moment nothing is doing yet, else the first.
const pbFirstFree = (triggers, rows) => {
  const used = new Set((rows || PB_NONE).map((p) => p.trigger));
  const t = triggers.find((x) => !used.has(x.id)) || triggers[0];
  return t ? t.id : "quiet_30";
};

// A number inside a sentence, chosen where it is said: a select drawn as the
// words it says, with its chevron. As wide as its longest choice, so picking
// one moves nothing around it.
const PbTok = ({ value, options, onChange, label, testid = null }) => (
  <span className="pb-tok">
    <select value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={label} data-testid={testid || undefined}>
      {options.map((o) => <option key={o.v} value={o.v}>{o.t}</option>)}
    </select>
    <Icon name="chevron-down" size={9} />
  </span>
);

// What every run keeps to, behind the shield.
const pbGuardWords = (kind) => (kind === "visit"
  ? "Only people with a recorded yes and a number. One message per visit. Anyone who asked to stop, or is mid-thread with a person, is held back at the wire."
  : kind === "deal"
    ? "Only people with a recorded yes and a number, whose proposal has its link and nothing back. One message per proposal, and one playbook message per person a week, across every playbook. Anyone who asked to stop, or is mid-thread with a person, is held back at the wire."
    : "Only people with a recorded yes and a number. Never twice within its gap, and one playbook message per person a week, across every playbook. Anyone who asked to stop, or is mid-thread with a person, is held back at the wire.");

Object.assign(window, { pbStatus, PB_NONE, pbIcon, pbReplyTip, PB_BLURBS, pbPeople, pbOrder, pbFirstFree, PB_TEXT, pbTitle, pbExample, pbLabel, pbLangWords, pbListSub, PB_LIST_GROUPS, PB_LIST_CLASSES, pbSpell, pbShort, pbFooter, PbTok, pbHours, pbHour, pbWith, PB_CAPS, PB_CADENCES, PB_GAPS, pbGuardWords, pbMessage, pbWrongSlot, pbReach, pbReachWords, pbReachDoor, pbNoNumberWords, pbSentWhen, pbDay });
