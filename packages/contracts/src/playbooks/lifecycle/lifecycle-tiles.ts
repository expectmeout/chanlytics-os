/**
 * The three tiles under Campaigns' rail (lifecycle.ts): who can hear the workspace, what goes out in the next seven days, and
 * what came back in the last thirty. Each is made from what the surfaces carry and says nothing it does not know: a count the
 * workspace could not make is left out, a surface not read yet leaves its tile out, and a zero is shown as zero.
 */
import { zoneMidnight, shiftKey } from "../../calendar/day-keys";
import { purposeOfPlaybook } from "../../consent/consent";
import { CONSENT_CHANNELS, countsByChannelWords, type ConsentChannel } from "../../consent/consent-channels";
import { GET_YES_ROUTE } from "../../people/people-lists";
import type { PersonRowVM } from "../../people/person-row";
import { fmtDay } from "../../reports/reports";
import { clockHour, clockNear, clockTime, zoneDayKey } from "../../shared/clock";
import { HOUR_MS } from "../../shared/time";
import { plural } from "../../shared/words";
import type {
  LifecycleAct,
  LifecycleCameBack,
  LifecycleComing,
  LifecycleComingTile,
  LifecycleInput,
  LifecyclePlaybook,
  LifecycleReachTile,
  LifecycleResultsTile,
  LifecycleRun,
  LifecycleRung,
  LifecycleStage,
  LifecycleTileRead,
  ReachCounts,
} from "./lifecycle-types";
import { LIFECYCLE_WORDS } from "./lifecycle-words";
import { todayRunWords } from "../../today/today-runs";
import { waitingRunOffer } from "../playbook-approval";
import { DAY_MS } from "../playbook-time";
import { playbookReach } from "../playbook-reach";
import { nextOpenMoment, nextRunOf } from "../playbook-schedule";
import { triggerOf } from "../playbook-triggers";

/** How far ahead "Coming up" looks, and how far back "What came back" does. */
const COMING_DAYS = 7;
const RESULTS_DAYS = 30;

/** How many runs "What came back" lists. */
const RUNS_SHOWN = 3;

/** Which read a tile of the broadcasts is in while there is nothing to draw it from: not read yet, or failed. */
const outOf = (b: LifecycleInput["broadcasts"]): LifecycleTileRead => (b === undefined ? "reading" : "failed");

/**
 * Who can hear the workspace, counted once over everyone in People from the rule every page asks (reach-any.ts personReachOf,
 * which each row carries): can be sent a message on some channel the workspace can send on now, said yes to messages, said
 * yes to offers. The broadcasts surface keeps it, over the rows it already read; the home only draws it.
 */
export function reachCountsOf(
  rows: ReadonlyArray<Pick<PersonRowVM, "saidYes" | "canReceive"> & Partial<Pick<PersonRowVM, "reachedOn">>>,
): ReachCounts {
  // Each person once, on the channel a send would reach them by (reach-any.ts reachedOn), where the rows carry it: a row
  // from before the channels does not. They add up to `canHear`.
  const byChannel = Object.fromEntries(
    CONSENT_CHANNELS.map((c) => [c, rows.filter((r) => r.reachedOn === c).length]),
  ) as Record<ConsentChannel, number>;
  return {
    people: rows.length,
    canHear: rows.filter((r) => r.canReceive.messages).length,
    saidMessages: rows.filter((r) => r.saidYes.messages).length,
    saidOffers: rows.filter((r) => r.saidYes.offers).length,
    ...(rows.some((r) => r.reachedOn !== undefined) ? { byChannel } : {}),
  };
}

/** The names of the moments a yes opens, in their order: "visit reminder, how did it go". */
function opensOf(stages: readonly LifecycleStage[], needs: "messages" | "offers", more: readonly string[]): string {
  const names = stages.filter((s) => s.needs === needs && s.state !== "not_here").map((s) => s.name.toLowerCase());
  return `${LIFECYCLE_WORDS.reach.opensMessages} ${[...names, ...more].join(", ")}`;
}

/**
 * One rung of the ladder: a count, its share of everyone, and what it opens. The "messages" rung's meter is drawn in parts,
 * one per channel that reaches anyone, where the count knows its channels and more than one reaches someone; its words
 * say the same ("5 on WhatsApp, 3 by email"). Each person is under one channel, the one a send would reach them by, so
 * the parts are the rung's own bar cut by channel and the numbers add up to its count.
 */
function rung(
  id: LifecycleRung["id"],
  label: string,
  n: number,
  people: number,
  opens: string | null,
  by: ReachCounts["byChannel"] = undefined,
): LifecycleRung {
  const byWords = countsByChannelWords(by);
  const parts =
    byWords && by && people > 0
      ? CONSENT_CHANNELS.filter((c) => by[c] > 0).map((c) => ({ channel: c, share: by[c] / people }))
      : null;
  return {
    id,
    label,
    n,
    share: people > 0 ? n / people : 0,
    opens,
    tone: id === "offers" && n === 0 ? "warn" : "plain",
    meter: id === "people" ? `${n} in People` : `${label}: ${n} of ${people}${byWords ? ` · ${byWords}` : ""}`,
    parts,
    byWords,
  };
}

/** "Who can hear you": the ladder, and where the yes is got where there is a number to ask on. */
export function lifecycleReach(input: LifecycleInput, stages: readonly LifecycleStage[]): LifecycleReachTile {
  const b = input.broadcasts;
  const reach = b?.reach ?? null;
  // Out, failed, or its people could not be counted: said as that, never a ladder of nothing.
  if (!b || !reach) return { read: outOf(b), rungs: null, yes: null, phone: null };
  const W = LIFECYCLE_WORDS.reach;
  const rungs = [
    rung("people", W.people, reach.people, reach.people, null),
    rung("messages", W.messages, reach.canHear, reach.people, opensOf(stages, "messages", []), reach.byChannel),
    rung("offers", W.offers, reach.saidOffers, reach.people, opensOf(stages, "offers", W.ownOffers)),
  ];
  const door: LifecycleAct = { kind: "route", label: W.code, route: GET_YES_ROUTE };
  const asks = b.number.present && b.optIn.link !== null;
  const [, , offers] = rungs;
  return {
    read: "read",
    rungs,
    yes: asks ? { note: W.asks, code: door, phrase: b.optIn.phrase, copy: W.copy } : null,
    phone: {
      words: W.phoneHear(reach.canHear, reach.people),
      offers: { words: `${reach.saidOffers} to offers`, tone: offers ? offers.tone : "plain" },
      yes: asks ? { label: W.phoneYes, route: GET_YES_ROUTE } : null,
    },
  };
}

/**
 * A running moment's next run on Coming up's line: its day and its hour in the tile's words, and the moment the line is
 * sorted by. Made from the schedule's own rule over the playbook's hour and the day it last ran for (playbook-schedule.ts
 * nextRunOf, which the card's label is said from too), at the moment the page is read: never from the label's words.
 */
function nextRunLine(p: LifecyclePlaybook, nowMs: number, tz: string): { day: string; at: string; atMs: number } {
  const next = nextRunOf(p, tz, new Date(nowMs));
  const word = next.day === "tomorrow" ? "Tomorrow" : "Today";
  if (next.soon) return { day: word, at: "Within the hour", atMs: nowMs };
  const today = zoneDayKey(nowMs, tz);
  const atMs = zoneMidnight(tz, next.day === "tomorrow" ? shiftKey(today, 1) : today) + next.hour * HOUR_MS;
  return { day: word, at: clockHour(next.hour), atMs };
}

/** Who a running moment will reach on its next run, and the reason when it reaches nobody. */
function whoWill(p: LifecyclePlaybook): { why: string; pill: LifecycleComing["pill"] } | null {
  const reach = playbookReach({ state: p.state, candidates: p.candidates, held: p.held, waiting: p.totals.waiting });
  const of = p.named ? ` of ${p.named.pool}` : "";
  const offers = purposeOfPlaybook(triggerOf(p.trigger)?.cls ?? null) === "marketing";
  switch (reach) {
    case "sends": {
      // A run sends its cap and no more (core run-playbook draws the longest-unheard first, at most cap_per_run): a new
      // win-back with 300 quiet people said "300 will get it" over a run that sends 25. The next run's share is what
      // "will get it" promises. The rest are "up to": a later run draws them again, less whoever its own gap, the
      // week's breath or the number's limit holds then. A visit's moment has no cap (contracts playbookRunReach: a
      // reminder is owed to everyone with a visit, and tomorrow's visits have no later run), so its count is whole.
      const all = p.candidates ?? 0;
      const cap = triggerOf(p.trigger)?.kind === "visit" ? 0 : (p.cap_per_run ?? 0);
      const next = cap > 0 ? Math.min(all, cap) : all;
      const later = all - next;
      return {
        why:
          `${next}${of} will get it` +
          (later > 0 ? ` · up to ${later} more on later runs, ${cap} a run` : "") +
          (p.held ? ` · ${p.held} heard from you this week and wait` : ""),
        pill: { tone: "ok", label: plural(next, "person", "people") },
      };
    }
    case "nobody":
      return {
        why:
          p.named && p.named.pool > 0 && p.named.saidYes === 0
            ? `0${of} will get it · none said yes to ${offers ? "offers" : "messages"}`
            : p.named && p.named.pool === 0
              ? "Nobody is on it yet"
              : `0${of} will get it`,
        pill: { tone: "warn", label: LIFECYCLE_WORDS.coming.nobody },
      };
    case "all-heard":
      return {
        why: `${p.held ?? 0} heard from you this week and wait`,
        pill: { tone: "warn", label: "Waiting out the week" },
      };
    case "uncounted":
      return { why: "Who it reaches could not be counted", pill: null };
    default:
      return null;
  }
}

/**
 * A running moment's next run. While the workspace is paused (`workspacePaused`: contracts ChannelsReady.paused, which the
 * surfaces read) the row says so where the time stood, and promises nobody: nothing goes until billing resumes.
 */
function momentRow(p: LifecyclePlaybook, nowMs: number, tz: string, workspacePaused: boolean): LifecycleComing | null {
  if (p.state !== "running" || p.off || p.listArchived) return null;
  const who = whoWill(p);
  if (!who) return null;
  if (workspacePaused) {
    const words = LIFECYCLE_WORDS.coming.paused;
    return {
      id: `moment:${p.id}`,
      kind: "moment",
      when: words.when,
      what: p.name,
      why: words.why,
      pill: { tone: "warn", label: words.pill },
      act: { kind: "open", label: "Open", playbookId: p.id },
      waiting: null,
      atMs: nowMs,
    };
  }
  const next = nextRunLine(p, nowMs, tz);
  return {
    id: `moment:${p.id}`,
    kind: "moment",
    when: { day: next.day, at: next.at },
    what: p.name,
    why: who.why,
    pill: who.pill,
    act: { kind: "open", label: "Open", playbookId: p.id },
    waiting: null,
    atMs: next.atMs,
  };
}

/** Where a waiting run stands when its line is drawn: the workspace's pause, and whether the page holds its playbook. */
interface WaitingAt {
  paused: boolean;
  known: boolean;
}

/**
 * What a waiting run's line may offer (playbook-approval.ts waitingRunOffer, THE reading), asked by the business's
 * clock as the verb asks it (the business's day now, and the day of the next open sending moment), so the line never
 * offers an Approve the route then answers 409 or 402, nor a one-tap approval of a reach-out's first cold emails.
 */
function offerOf(r: LifecycleRun, nowMs: number, tz: string, at: WaitingAt) {
  return waitingRunOffer(
    { playbook_id: r.playbook_id, run_for: r.run_for ?? null, audience: r.audience },
    {
      today: zoneDayKey(nowMs, tz),
      sendsOn: zoneDayKey(nextOpenMoment(tz, new Date(nowMs)).at.getTime(), tz),
      say: fmtDay,
    },
    at,
  );
}

/**
 * A run on its way: scheduled, or waiting for the person's approval. One that waits says what Today's row says of it
 * ("7 people. Nothing sends until you say so.", or "12 businesses." for a reach-out's), and is approved or skipped on
 * its own line (`waiting`) where a row may offer that; where the verb would refuse the approval it says the verb's
 * sentence instead and Skip is the act left; a run decided on its sheet alone keeps its name as the door to it.
 */
function runRow(r: LifecycleRun, name: string, nowMs: number, tz: string, at: WaitingAt): LifecycleComing {
  const atMs = Date.parse(r.scheduled_for);
  const waits = r.state === "pending_approval";
  const offer = waits ? offerOf(r, nowMs, tz, at) : null;
  const refusal = offer?.kind === "skip" ? offer.why : null;
  return {
    id: `run:${r.id}`,
    kind: "run",
    when: { day: clockNear(atMs, tz, nowMs), at: clockTime(atMs, tz) },
    what: name,
    why: waits ? (refusal ?? todayRunWords(r).waiting.sentence) : "Scheduled",
    pill: waits
      ? { tone: "warn", label: LIFECYCLE_WORDS.coming.waiting }
      : { tone: "ok", label: plural(r.recipient_count, "person", "people") },
    act: { kind: "route", label: "Open", route: `broadcasts/run:${r.id}` },
    waiting: offer && offer.kind !== "open" ? { runId: r.id, people: r.recipient_count, refusal } : null,
    atMs,
  };
}

/** What an off moment with people waiting says: how many, in the moment's words. */
function offWhy(id: LifecycleStage["id"], n: number): string {
  const people = plural(n, "person", "people");
  switch (id) {
    case "visit":
      return `Off · ${people} ${n === 1 ? "visits" : "visit"} tomorrow`;
    case "after":
      return `Off · ${people} visited yesterday`;
    case "quiet":
      return `Off · ${people} ${n === 1 ? "has" : "have"} gone quiet`;
    default:
      return `Off · ${plural(n, "proposal")} waiting`;
  }
}

/** When an off moment would run, as its words say it where it has no clock. */
const OFF_WHEN: Record<LifecycleStage["id"], { day: string; at: string }> = {
  first_contact: { day: "", at: "" },
  visit: { day: "Every", at: "day" },
  after: { day: "The day", at: "after" },
  quiet: { day: "Every", at: "day" },
  proposal: { day: "When one", at: "waits" },
};

/** An off moment that has people waiting offers to be turned on. */
function offRows(stages: readonly LifecycleStage[], nowMs: number): LifecycleComing[] {
  return stages.flatMap((s, i) =>
    s.state === "off" && s.act?.kind === "turn_on" && (s.people ?? 0) > 0
      ? [
          {
            id: `off:${s.id}`,
            kind: "off" as const,
            when: OFF_WHEN[s.id],
            what: s.name,
            why: offWhy(s.id, s.people ?? 0),
            pill: null,
            act: { kind: "turn_on" as const, label: "Turn on", moment: s.act.moment },
            waiting: null,
            atMs: nowMs + COMING_DAYS * DAY_MS + i,
          },
        ]
      : [],
  );
}

/**
 * "Coming up": each running moment's next run with who will get it, the runs scheduled or waiting on you within the week
 * (which stand in for their playbook's own line), and the moments that are off with people waiting, each offering Turn on.
 * Null while the playbooks have not landed. The runs are the broadcasts' read: while it is out or failed the tile has no
 * rows and no "nothing is set to go out", which a week it could not see would be a false thing to say.
 */
export function lifecycleComing(input: LifecycleInput, stages: readonly LifecycleStage[]): LifecycleComingTile | null {
  const playbooks = input.playbooks;
  if (!playbooks) return null;
  const { nowMs, tz, broadcasts } = input;
  const rules = LIFECYCLE_WORDS.coming.rules;
  if (!broadcasts) return { read: outOf(broadcasts), rows: [], empty: null, rules };
  const playbookOf = (id: string | null) => playbooks.rows.find((p) => p.id === id);
  // The workspace's pause, as either surface's readiness says it (the playbooks' own, else the broadcasts').
  const paused = playbooks.ready?.paused === true || broadcasts.ready?.paused === true;
  const end = nowMs + COMING_DAYS * DAY_MS;
  const runs = broadcasts.rows
    .filter((r) => (r.state === "scheduled" || r.state === "pending_approval") && Date.parse(r.scheduled_for) <= end)
    .map((r) => {
      const p = playbookOf(r.playbook_id);
      return runRow(r, p?.name ?? r.name, nowMs, tz, { paused, known: p !== undefined });
    });
  const covered = new Set(
    broadcasts.rows.filter((r) => runs.some((x) => x.id === `run:${r.id}`) && r.playbook_id).map((r) => r.playbook_id),
  );
  const moments = playbooks.rows
    .filter((p) => !covered.has(p.id))
    .flatMap((p) => momentRow(p, nowMs, tz, paused) ?? []);
  const timed = [...moments, ...runs].sort((a, b) => a.atMs - b.atMs);
  const rows = [...timed, ...offRows(stages, nowMs)];
  return { read: "read", rows, empty: LIFECYCLE_WORDS.coming.empty, rules };
}

/** The day a run went, from what the surface keeps of it: when it finished, else began, else was scheduled. */
function wentAt(r: LifecycleRun): number {
  return Date.parse(r.finished_at ?? r.started_at ?? r.scheduled_for);
}

/** The runs that went out in the period, newest first, each linking to its run. */
function cameBack(input: LifecycleInput, days: number): LifecycleCameBack[] {
  const b = input.broadcasts;
  if (!b) return [];
  const since = input.nowMs - days * DAY_MS;
  const names = new Map((input.playbooks?.rows ?? []).map((p) => [p.id, p.name]));
  return b.rows
    .filter((r) => r.state === "sent" && wentAt(r) >= since)
    .sort((a, c) => wentAt(c) - wentAt(a))
    .slice(0, RUNS_SHOWN)
    .map((r) => ({
      id: r.id,
      name: (r.playbook_id ? names.get(r.playbook_id) : null) ?? r.name,
      words: `${r.when} · ${r.counts.sent} sent`,
      result: plural(r.counts.replied, "reply", "replies"),
      route: `broadcasts/run:${r.id}`,
    }));
}

/**
 * "What came back": the period's funnel from the campaign report (sent, delivered, read, replied: counts over what is stored),
 * who said yes and who asked to stop, and the latest runs. A report that could not be read leaves the numbers out and says
 * so; the runs, which are the surface's own, stand.
 */
export function lifecycleResults(input: LifecycleInput): LifecycleResultsTile {
  const b = input.broadcasts;
  if (!b) {
    const days = RESULTS_DAYS;
    return {
      read: outOf(b),
      days,
      note: plural(days, "day"),
      headline: null,
      funnel: null,
      funnelLabel: null,
      yes: null,
      readNote: null,
      byChannel: null,
      runs: [],
      quiet: false,
    };
  }
  const days = b.report?.days ?? RESULTS_DAYS;
  const note = plural(days, "day");
  const runs = cameBack(input, days);
  if (!b.report)
    return {
      read: "read",
      days,
      note,
      headline: null,
      funnel: null,
      funnelLabel: null,
      yes: null,
      readNote: null,
      byChannel: null,
      runs,
      quiet: false,
    };
  const t = b.report.totals;
  const W = LIFECYCLE_WORDS.results.funnel;
  // A read is a share of WhatsApp's own sends (0030): a text or an email keeps no read receipt. Absent, of every send.
  const readOf = t.readOf ?? t.sent;
  const step = (id: "sent" | "delivered" | "read" | "replied", n: number, of = t.sent) => ({
    id,
    label: W[id],
    meter: id === "read" && of !== t.sent ? `${W[id]}: ${n} of WhatsApp's ${of}` : `${W[id]}: ${n}`,
    n,
    share: id === "sent" ? 1 : of > 0 ? n / of : 0,
  });
  const readNote =
    t.sent === 0 || readOf === t.sent
      ? null
      : readOf > 0
        ? LIFECYCLE_WORDS.results.readOf(readOf)
        : LIFECYCLE_WORDS.results.noRead;
  return {
    read: "read",
    days,
    note,
    headline:
      t.sent > 0
        ? { n: t.replied, words: `wrote back, of ${t.sent} sent` }
        : { n: 0, words: `messages sent in ${days} days` },
    funnel:
      t.sent > 0
        ? [
            step("sent", t.sent),
            step("delivered", t.delivered),
            // No WhatsApp sent, no read to count: the step is left out, and the note says why.
            ...(readOf > 0 ? [step("read", t.read, readOf)] : []),
            step("replied", t.replied),
          ]
        : null,
    funnelLabel:
      t.sent > 0
        ? readOf > 0
          ? LIFECYCLE_WORDS.results.funnelLabel
          : LIFECYCLE_WORDS.results.funnelLabelNoRead
        : null,
    yes: `${t.optIns} said yes · ${t.optOuts} asked to stop`,
    readNote,
    // What went by each channel (0030), where more than one sent: a line under the funnel in the channels' own words.
    byChannel: countsByChannelWords(
      b.report.byChannel ? Object.fromEntries(b.report.byChannel.map((c) => [c.channel, c.sent])) : null,
    ),
    runs,
    quiet: t.sent === 0 && t.optIns === 0 && t.optOuts === 0,
  };
}
