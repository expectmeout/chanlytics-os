import { channelsStandingParts } from "../../broadcasts/channels-standing.js";
import { offersPausedLine } from "../../broadcasts/email-offers.js";
import { purposeOfPlaybook } from "../../consent/consent.js";
import { CONSENT_CHANNELS } from "../../consent/consent-channels.js";
import { journeyOf, journeyStageOf } from "../../journey/journey.js";
import { emailTemplateRowsOf } from "../../reach-out/reach-out-sheet.js";
import { CALENDAR_SETTING_ROUTE } from "../../setup/calendar-source.js";
import { libraryCount } from "../../templates/library-count.js";
import { channelMarksOf, lifecycleLedger, readyOf, stagePlaybooks, tallyOf } from "./lifecycle-ledger.js";
import { lifecycleComing, lifecycleReach, lifecycleResults } from "./lifecycle-tiles.js";
import { LIFECYCLE_WORDS, lifecycleStateOf, tallyWords } from "./lifecycle-words.js";
import { isWinBack, triggerOf } from "../playbook-triggers.js";
function winBackMoment(playbooks, fallback) {
  return playbooks.triggers.find((t) => t.offered && isWinBack(t.id))?.id ?? fallback;
}
function poolOf(playbooks, key) {
  return playbooks.pools[key] ?? null;
}
function calendarRead(playbooks, shape) {
  if (shape.calendar === "feed") return playbooks;
  const why = LIFECYCLE_WORDS.needsCalendar[shape.calendar];
  return {
    ...playbooks,
    rows: playbooks.rows.map((p) => !p.off && triggerOf(p.trigger)?.kind === "visit" ? { ...p, off: why } : p)
  };
}
function stageSummaryOf(own) {
  if (own.length > 1) return tallyWords(own.length, tallyOf(own));
  const p = own.at(0);
  if (!p) return null;
  const short = lifecycleStateOf(p).short;
  return `${p.name} \xB7 ${short.charAt(0).toLowerCase()}${short.slice(1)}`;
}
function barOf(own) {
  if (own.length < 2) return null;
  const t = tallyOf(own);
  return { on: t.on, waiting: t.waiting, paused: t.paused, of: own.length };
}
function hasLine(broadcasts) {
  const ready = broadcasts?.ready;
  if (!broadcasts || broadcasts.number.present || !ready) return true;
  return CONSENT_CHANNELS.some((c) => ready[c].ready);
}
function receptionistStage(base, line) {
  if (!line)
    return {
      ...base,
      needsWords: LIFECYCLE_WORDS.noLine.needs,
      state: "off",
      stateWords: LIFECYCLE_WORDS.noLine.state,
      phoneWords: "Off",
      tone: "plain",
      covered: false,
      act: null
    };
  return {
    ...base,
    state: "always",
    stateWords: LIFECYCLE_WORDS.receptionist,
    phoneWords: "Live",
    tone: "ok",
    covered: true,
    act: null
  };
}
function unmetStage(base, shape) {
  const words = LIFECYCLE_WORDS.needsCalendar[shape.calendar === "email" ? "email" : "none"];
  const act = base.playbookId ? { kind: "open", label: "Open", playbookId: base.playbookId } : { kind: "route", label: LIFECYCLE_WORDS.needsCalendar.door, route: CALENDAR_SETTING_ROUTE };
  return {
    ...base,
    people: null,
    channels: [],
    state: "not_here",
    stateWords: words,
    phoneWords: words,
    tone: "plain",
    covered: false,
    act
  };
}
function playbookStage(base, p) {
  const s = lifecycleStateOf(p);
  const state = p.off ? "not_here" : s.paused ? "paused" : "on";
  return {
    ...base,
    state,
    stateWords: s.words,
    phoneWords: s.short,
    tone: s.tone,
    covered: state === "on",
    // A run of it waits for the person, paused or not: the node is a clock (the pill beside it says so, lifecycleStateOf).
    waits: state !== "not_here" && !!p.totals.waiting,
    act: { kind: "open", label: "Open", playbookId: p.id }
  };
}
function emptyStage(base, offered, moment) {
  if (!offered) {
    const words = "Not offered here";
    return {
      ...base,
      state: "not_here",
      stateWords: words,
      phoneWords: words,
      tone: "plain",
      covered: false,
      act: null
    };
  }
  return {
    ...base,
    state: "off",
    stateWords: "Off",
    phoneWords: "Off",
    tone: "plain",
    covered: false,
    act: { kind: "turn_on", label: "Turn on", moment }
  };
}
function stageOf(def, at) {
  const { playbooks } = at;
  const own = def.kind === "moment" ? stagePlaybooks(def, playbooks.rows) : [];
  const p = own.find((x) => x.state === "running") ?? own.at(0) ?? null;
  const moment = def.id === "quiet" ? winBackMoment(playbooks, def.trigger) : def.trigger;
  const poolKey = def.kind === "receptionist" ? def.poolKey : p?.trigger ?? moment ?? def.poolKey;
  const pool = def.unmet ? null : poolOf(playbooks, poolKey);
  const needs = moment === null ? "none" : purposeOfPlaybook(triggerOf(moment)?.cls ?? null) === "marketing" ? "offers" : "messages";
  const base = {
    id: def.id,
    caps: def.caps,
    name: p ? p.name : def.name,
    glyph: def.glyph,
    moment,
    playbookId: p ? p.id : null,
    people: pool ? pool.pool : null,
    unit: def.unit,
    needs,
    needsWords: LIFECYCLE_WORDS.needs[needs],
    hint: null,
    waits: false,
    // A campaign's channels; the receptionist's and an empty moment's are none (what Turn on ticks is the composer's to say).
    channels: p ? channelMarksOf(p, playbooks.templates, at.ready) : [],
    summary: stageSummaryOf(own),
    bar: barOf(own)
  };
  if (def.kind === "receptionist") return receptionistStage(base, at.line);
  if (def.unmet) return unmetStage(base, at.shape);
  if (p) return playbookStage(base, p);
  const offered = moment !== null && playbooks.triggers.some((t) => t.id === moment && t.offered);
  return emptyStage(base, offered, moment ?? def.poolKey);
}
function withHint(stages, defs, playbooks) {
  const reachOf = (s) => poolOf(playbooks, s.moment ?? "")?.candidates ?? 0;
  const at = stages.findIndex((s) => s.state === "off" && reachOf(s) > 0);
  if (at < 0) return [...stages];
  return stages.map((s, i) => {
    if (i !== at || s.act?.kind !== "turn_on") return s;
    const hint = `Turn on \xB7 ${reachOf(s)} ${defs.find((d) => d.id === s.id)?.off?.hint ?? ""}`;
    return { ...s, hint, act: { ...s.act, label: hint } };
  });
}
function lifecycleStages(at) {
  const held = new Set(
    at.playbooks.rows.flatMap((p) => {
      const id = journeyStageOf(p.trigger);
      return id ? [id] : [];
    })
  );
  const defs = journeyOf({
    calendarOn: at.shape.calendar === "feed",
    dealsOn: at.shape.dealsOn,
    word: at.shape.word,
    held
  });
  return {
    defs,
    stages: withHint(
      defs.map((d) => stageOf(d, at)),
      defs,
      at.playbooks
    )
  };
}
function emailRowsOf(reachOuts) {
  return reachOuts ? emailTemplateRowsOf(reachOuts).length : 0;
}
function lifecycleHeadOf(input, count) {
  const { covered, of } = count;
  const reach = input.broadcasts?.reach ?? null;
  const parts = [];
  if (of > 0) {
    parts.push({ b: `${covered} of ${of}` }, " moments are covered");
    if (reach) parts.push(", and ", { b: `${reach.canHear} of your ${reach.people}` }, " people can hear from you");
    parts.push(".");
  }
  return {
    title: LIFECYCLE_WORDS.title,
    sentence: parts,
    library: { label: LIFECYCLE_WORDS.library, count: libraryCount(input.messages, emailRowsOf(input.reachOuts)) },
    newMessage: LIFECYCLE_WORDS.newMessage,
    // The email channel's own read carries whether its offers are paused: said under the sentence while they are. Read as the
    // channels line is (readyOf: the playbooks' reading first, which the home hears; the wiring's second audit,
    // W-campaign-run-template-reachout-1), so a pause by the gates reaches the line while the home is open.
    pausedLine: offersPausedLine(readyOf(input)?.email.offers),
    channels: channelsStandingParts(readyOf(input))
  };
}
export function lifecycleKicker(home, id) {
  const stage = home.rail.stages.find((s) => s.playbookId === id);
  if (stage) return stage.caps;
  const group = home.ledger.groups.find((g) => g.rows.some((r) => r.id === id));
  return group ? group.caps : LIFECYCLE_WORDS.ledger.kicker;
}
function failedOf(input) {
  const F = LIFECYCLE_WORDS.failed;
  const b = input.broadcasts;
  return {
    templates: input.library === null ? F.templates : null,
    counts: input.playbooks && !input.playbooks.countsRead ? F.counts : null,
    chains: input.reachOuts === null ? F.chains : null,
    report: input.report === null ? F.report : null,
    reach: b === null || b !== void 0 && !b.reach ? F.reach : null,
    coming: b === null ? F.coming : null,
    results: b === null ? F.results : null
  };
}
export function campaignsHomeOf(input) {
  const at = input.playbooks && input.shape ? { ...input, playbooks: calendarRead(input.playbooks, input.shape) } : input;
  const made = at.playbooks && at.shape ? lifecycleStages({ playbooks: at.playbooks, shape: at.shape, line: hasLine(at.broadcasts), ready: readyOf(at) }) : { defs: [], stages: [] };
  const { defs, stages } = made;
  const count = { covered: stages.filter((s) => s.covered).length, of: stages.length };
  return {
    head: lifecycleHeadOf(at, count),
    rail: {
      title: LIFECYCLE_WORDS.rail,
      ...count,
      coveredWords: count.of > 0 ? `${count.covered} of ${count.of} moments covered` : null,
      phoneWords: count.of > 0 ? `${count.covered} of ${count.of} on` : null,
      stages
    },
    ledger: lifecycleLedger({ input: at, defs, stages }),
    reach: lifecycleReach(at, stages),
    coming: lifecycleComing(at, stages, defs),
    results: lifecycleResults(at),
    failed: failedOf(at)
  };
}
