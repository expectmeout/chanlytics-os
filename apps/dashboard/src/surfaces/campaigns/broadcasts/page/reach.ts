/**
 * What the broadcasts page works out of its state on every draw (moved from legacy/pages/broadcasts.jsx, decision
 * 0015): who the send reaches, what each slot of the message may take and holds, the people behind the count, and the
 * one person the preview is drawn for. Plain functions, each taking what it reads and answering what it works out.
 */
import type { ParamSourceKind } from "@chanlytics/contracts";
import { pageClock } from "@/legacy-bridge/zone";
import { starters } from "../../templates/verbs";
import { broadcasts } from "../verbs";
import { BC_NONE } from "../run";
import { bcWhenNote } from "../when";
import type { BcBase, BcPeople, BcPreview, BcReach, BcSlotChoices, BcSlotVar, BcSlotWords } from "./types";
import { BC_TEXT, bcKey, bcSlots } from "./words";

// Who the send reaches with the message picked: the list, how many on it this message may reach, and the number it
// goes from.
export function bcReachOf({
  audiences,
  aud,
  templates,
  tplId,
  data,
}: Pick<BcBase, "audiences" | "aud" | "templates" | "tplId" | "data">): BcReach {
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
  const sizeOf = (a: BcReach["active"]) => (a && a.counts ? a.counts[purpose] || 0 : 0);
  const activeCount = sizeOf(active);
  const number = data.number || null;
  const numberOk = !!(number && number.present && number.health.canSend);
  const overLimit = !!(
    active &&
    number &&
    number.health.limitPerDay !== null &&
    activeCount > number.health.limitPerDay
  );
  return { active, tpl, purpose, sizeOf, activeCount, number, numberOk, overLimit };
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

// The words each slot holds, what the preview shows for them, what goes out, and whether it can go.
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
  overLimit,
}: Pick<BcBase, "params" | "tplId" | "setParams" | "setSources" | "data" | "busy"> &
  Pick<BcSlotChoices, "vars" | "srcOf" | "exampleOf" | "labels"> &
  Pick<BcReach, "tpl" | "active" | "activeCount" | "numberOk" | "overLimit">): BcSlotWords {
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
  const ready =
    !!tpl && !!active && activeCount > 0 && filled.every((v) => String(v).trim()) && !busy && numberOk && !overLimit;
  const shown = previewValues.map((v) => String(v).trim());
  return { typed, setTyped, chooseSource, filled, previewValues, specs, ready, shown };
}

// The people behind the count, and what the line under the list says about them.
export function bcPeopleOf({
  active,
  purpose,
  activeCount,
}: Pick<BcReach, "active" | "purpose" | "activeCount">): BcPeople {
  // Who the preview is drawing it for. The bridge keeps a handful of the rows the
  // count is a length of; a surface cached before they were published has none,
  // and then the composer shows the example values as it always did.
  const sample = (active && active.preview && active.preview[purpose]) || null;
  const people = sample ? sample.people : BC_NONE;
  // Nobody on it can be sent this, and somebody on it said yes: the ones who did have no number to send to. Said in
  // People's words (#663), with no door -- asking for their yes would ask for an answer they gave.
  const noNumber =
    active && activeCount === 0 && sample && sample.saidYes > 0
      ? broadcasts.noNumberWords(`“${active.label}”`, purpose)
      : null;
  // How many on it said yes, for the line under the audience (contracts saidYesWords): who it reaches, and who said
  // yes when nobody can be sent it -- "0 people … said yes" stood right over the no-number line, and was false.
  const yesWords = active
    ? broadcasts.saidYesWords(`“${active.label}”`, purpose, activeCount, (sample && sample.saidYes) || 0)
    : null;
  return { sample, people, noNumber, yesWords };
}

// The one person the preview is drawn for, what they read, and when it lands.
export function bcPreviewOf({
  people,
  who,
  shown,
  vars,
  srcOf,
  whenAt,
  data,
}: Pick<BcBase, "who" | "whenAt" | "data"> &
  Pick<BcPeople, "people"> &
  Pick<BcSlotWords, "shown"> &
  Pick<BcSlotChoices, "vars" | "srcOf">): BcPreview {
  const person = people.length ? people[Math.min(who, people.length - 1)] : null;
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
  return { person, forPerson, noName, personNote, goesAt, maxDays, whenNote };
}
