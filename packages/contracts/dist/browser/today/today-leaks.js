import { addressOf } from "../activity/record-address.js";
import { NO_CHANNEL_REACH, NO_NUMBER_REACH } from "../people/people-lists.js";
import { eachOpenProposal, proposalsWaiting } from "../deals/deal-waits.js";
import { consultationsWithoutProposal, consultsHeldWords } from "../deals/deal-consultations.js";
import { pipelineRoute } from "../deals/pipeline/pipeline-views.js";
import { isOptedOutContact } from "../consent/consent.js";
import { capitalize } from "../shared/words.js";
export const TODAY_LEAK_MAX = 2;
const LEAK_ORDER = [
  "never-booked",
  "unanswered",
  "consults-waiting",
  "proposals-waiting",
  "unreachable",
  "quiet"
];
const askWhy = (text, math) => `${text} ${capitalize(math)}. Why is that?`;
function leakFactsOf(reports, people, noReply, nowMs) {
  const list = (id) => people ? people.lists.find((l) => l.id === id) ?? null : null;
  const step = (id) => {
    const l = list(id);
    return l && l.action && l.action.enabled && l.count > 0 ? { label: l.action.cta, to: l.action.to } : null;
  };
  let clock = null;
  const dealsAt = () => {
    clock ??= { at: people && people.fetchedAt || nowMs };
    return clock.at;
  };
  return { reports, people, noReply, list, step, dealsAt };
}
function neverBookedLeak({ reports, list, step }) {
  const b = reports ? reports.booking : null;
  if (!(reports && b && b.present && b.pct !== null && b.asked >= 5 && b.pct <= 25)) return null;
  const { asked, booked } = b;
  const never = list("asked_never_booked");
  const text = booked === 0 ? `${asked} people wrote or called in the last ${reports.rangeLabel}. Not one of them is on the calendar.` : `Only ${booked} of the ${asked} people who wrote or called in the last ${reports.rangeLabel} got onto the calendar.`;
  const math = never ? `${b.headline} \xB7 ${never.count} on Asked, never booked` : b.headline;
  return {
    id: "never-booked",
    tone: "warn",
    tag: "Booking gap",
    icon: "calendar",
    text,
    math,
    people: [],
    peopleLead: null,
    ask: askWhy(text, math),
    cta: { label: "See who", to: never ? `clients/seg:${never.id}` : "clients" },
    also: step("asked_never_booked")
  };
}
function unansweredLeak({ reports, noReply }) {
  const a = reports ? reports.answered : null;
  if (!(reports && a && a.none >= 2)) return null;
  const text = `${a.none} customer message${a.none === 1 ? "" : "s"} never got an answer at all.`;
  const math = `of ${reports.messages.total} in the last ${reports.rangeLabel} \xB7 the receptionist answered ${a.ai}, you answered ${a.you}`;
  return {
    id: "unanswered",
    tone: "warn",
    tag: "No reply",
    icon: "alert",
    text,
    math,
    people: noReply.slice(0, 2).map((r) => ({ id: r.conversationId, name: r.who, to: r.to, title: `Open ${r.who}'s thread` })),
    peopleLead: "Waiting now",
    ask: askWhy(text, math),
    cta: { label: "Open Reports", to: "reports" },
    also: null
  };
}
function consultsWaitingLeak({ people, dealsAt }) {
  const at = dealsAt();
  const consultRows = (people?.rows ?? []).filter(
    (r) => typeof r.id === "string" && typeof r.name === "string" && "deal" in r && "consultedMs" in r
  );
  const held = consultationsWithoutProposal(consultRows, at);
  if (!(people && people.dealsOn && held.length >= 1)) return null;
  const n = held.length;
  const text = `${n} consultation${n === 1 ? "" : "s"} in the last week ended with no proposal yet.`;
  const math = `${consultsHeldWords(n)} \xB7 on Pipeline`;
  return {
    id: "consults-waiting",
    tone: "warn",
    tag: "Next step",
    icon: "calendar",
    text,
    math,
    people: held.slice(0, 2).map((r) => ({
      id: r.id,
      name: r.name,
      to: addressOf({ kind: "person", id: r.id }),
      title: `Open ${r.name} in People`
    })),
    peopleLead: "Consultation with",
    ask: askWhy(text, math),
    cta: { label: "See who", to: "clients/pipeline" },
    also: null
  };
}
function proposalsWaitingWords(n, pace, po, inHand) {
  const ago = pace ? `${pace.waitDays} days` : "a week";
  const text = pace?.longerThanUsual ? `${n} proposal${n === 1 ? " has" : "s have"} waited longer than usual with nothing back.` : `${n} proposal${n === 1 ? "" : "s"} went out more than ${ago} ago with nothing back.`;
  const since = pace ? `${pace.words.charAt(0).toLowerCase()}${pace.words.slice(1)} \xB7 nothing heard since it went` : "nothing heard since it went";
  const counted = po ? `${po.count} on Proposal out \xB7 ${since}` : since;
  const math = inHand ? `${counted} \xB7 the follow-up has ${inHand} more` : counted;
  return { text, math };
}
function yoursToFollowUp(waiting) {
  return waiting.filter((r) => !isOptedOutContact({ consent: r.consent.state, dnc: r.consent.dnc })).filter((r, i, all) => all.findIndex((x) => x.id === r.id) === i).slice(0, 2).flatMap(
    (r) => r.id && r.name ? [{ id: r.id, name: r.name, to: addressOf({ kind: "person", id: r.id }), title: `Open ${r.name}` }] : []
  );
}
function proposalsWaitingLeak({ people, list, dealsAt }) {
  const dealRows = (people?.rows ?? []).filter((r) => "deal" in r && "askedMs" in r);
  const pace = people?.dealPace ?? null;
  const shownDeal = new Map(dealRows.map((r) => [r.id, r.deal]));
  const proposals = eachOpenProposal(dealRows).map((r) => {
    const shown = shownDeal.get(r.id) ?? null;
    const same = !!shown && !!r.deal && (r.deal === shown || r.deal.id !== null && r.deal.id === shown.id);
    return same ? r : { ...r, followUp: null };
  });
  const out = proposalsWaiting(proposals, dealsAt(), pace);
  const inHand = out.filter((r) => r.followUp?.kind === "will").length;
  const waiting = out.filter((r) => r.followUp?.kind !== "will");
  const po = list("proposal_out");
  if (!(people && people.dealsOn && waiting.length >= 1)) return null;
  const { text, math } = proposalsWaitingWords(waiting.length, pace, po, inHand);
  return {
    id: "proposals-waiting",
    tone: "warn",
    tag: "Waiting",
    icon: "clock",
    text,
    math,
    people: inHand ? yoursToFollowUp(waiting) : [],
    peopleLead: inHand ? "Yours to follow up" : null,
    ask: askWhy(text, math),
    cta: {
      label: "See who",
      to: inHand ? pipelineRoute({ view: "waiting" }) : po ? `clients/seg:${po.id}` : "clients"
    },
    also: null
  };
}
function unreachableLeak({ people, list }) {
  const yes = list("opted_in");
  const offers = list("offers_ok");
  if (!(people && yes && offers && yes.count >= 3 && offers.count === 0)) return null;
  const said = people.rows.filter((r) => r.saidYes.offers);
  const noNumber = said.length > 0;
  const why = said.some((r) => r.whyNot.offers === "no_channel") ? NO_CHANNEL_REACH : NO_NUMBER_REACH;
  const text = `${yes.count} ${yes.count === 1 ? "person has" : "people have"} said yes to messages, but ${noNumber ? "nobody can be sent an offer yet" : "nobody has said yes to offers"}.`;
  const math = `${noNumber ? why : "a broadcast reaches only the second yes"} \xB7 0 can receive one`;
  return {
    id: "unreachable",
    tone: "warn",
    tag: "Reach",
    icon: "users",
    text,
    math,
    people: [],
    peopleLead: null,
    ask: askWhy(text, math),
    cta: { label: "Open People", to: `clients/seg:${yes.id}` },
    also: !noNumber && yes.action && yes.action.enabled ? { label: yes.action.cta, to: yes.action.to } : null
  };
}
function quietLeak({ people, list, step }) {
  const quiet = list("quiet");
  if (!(quiet && quiet.count >= 5)) return null;
  const text = `${quiet.count} people have not heard from you in 30 days.`;
  const math = people && people.aggregates ? `of ${people.aggregates.total} in People` : "on the Quiet 30+ days list";
  return {
    id: "quiet",
    tone: "info",
    tag: "Gone quiet",
    icon: "clock",
    text,
    math,
    people: [],
    peopleLead: null,
    ask: askWhy(text, math),
    cta: { label: "See who", to: `clients/seg:${quiet.id}` },
    also: step("quiet")
  };
}
const LEAK_FINDERS = {
  "never-booked": neverBookedLeak,
  unanswered: unansweredLeak,
  "consults-waiting": consultsWaitingLeak,
  "proposals-waiting": proposalsWaitingLeak,
  unreachable: unreachableLeak,
  quiet: quietLeak
};
export function todayLeaks(reports, people, noReply = [], max = TODAY_LEAK_MAX, nowMs = Date.now()) {
  const facts = leakFactsOf(reports, people, noReply, nowMs);
  const all = LEAK_ORDER.map((id) => LEAK_FINDERS[id](facts)).filter((x) => !!x);
  const more = Math.max(0, all.length - max);
  return { rows: all.slice(0, max), more, moreLine: more ? `and ${more} more` : null };
}
