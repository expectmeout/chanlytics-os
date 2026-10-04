/**
 * The three tiles under Campaigns' rail (lifecycle.ts): who can hear the workspace, what goes out in the next seven days, and
 * what came back in the last thirty. Each is made from what the surfaces carry and says nothing it does not know: a count the
 * workspace could not make is left out, a surface not read yet leaves its tile out, and a zero is shown as zero.
 */
import { zoneMidnight, shiftKey } from "../calendar/day-keys";
import { purposeOfPlaybook } from "../consent/consent";
import { GET_YES_ROUTE } from "../people/people-lists";
import type { PersonRowVM } from "../people/person-row";
import { clockNear, clockTime, zoneDayKey } from "../shared/clock";
import { HOUR_MS, MIN_MS } from "../shared/time";
import { plural } from "../shared/words";
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
import { DAY_MS } from "./playbook-time";
import { playbookReach } from "./playbook-reach";
import { triggerOf } from "./playbook-triggers";

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
export function reachCountsOf(rows: ReadonlyArray<Pick<PersonRowVM, "saidYes" | "canReceive">>): ReachCounts {
  return {
    people: rows.length,
    canHear: rows.filter((r) => r.canReceive.messages).length,
    saidMessages: rows.filter((r) => r.saidYes.messages).length,
    saidOffers: rows.filter((r) => r.saidYes.offers).length,
  };
}

/** The names of the moments a yes opens, in their order: "visit reminder, how did it go". */
function opensOf(stages: readonly LifecycleStage[], needs: "messages" | "offers", more: readonly string[]): string {
  const names = stages.filter((s) => s.needs === needs && s.state !== "not_here").map((s) => s.name.toLowerCase());
  return `${LIFECYCLE_WORDS.reach.opensMessages} ${[...names, ...more].join(", ")}`;
}

/** One rung of the ladder: a count, its share of everyone, and what it opens. */
function rung(id: LifecycleRung["id"], label: string, n: number, people: number, opens: string | null): LifecycleRung {
  return {
    id,
    label,
    n,
    share: people > 0 ? n / people : 0,
    opens,
    tone: id === "offers" && n === 0 ? "warn" : "plain",
    meter: id === "people" ? `${n} in People` : `${label}: ${n} of ${people}`,
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
    rung("messages", W.messages, reach.canHear, reach.people, opensOf(stages, "messages", [])),
    rung("offers", W.offers, reach.saidOffers, reach.people, opensOf(stages, "offers", W.ownOffers)),
  ];
  const door: LifecycleAct = { kind: "route", label: W.code, route: GET_YES_ROUTE };
  const asks = b.number.present && b.optIn.link !== null;
  const [, messages, offers] = rungs;
  return {
    read: "read",
    rungs,
    yes: asks ? { note: W.asks, code: door, phrase: b.optIn.phrase, copy: W.copy } : null,
    phone: {
      n: reach.canHear,
      of: `of ${reach.people} can hear you`,
      share: messages ? messages.share : 0,
      meter: messages ? messages.meter : "",
      offers: { words: `${reach.saidOffers} to offers`, tone: offers ? offers.tone : "plain" },
      note: asks ? W.phoneAsks : null,
    },
  };
}

/** A next run as the card says it ("today 10:00", "tomorrow 10:00", "today, within the hour"), and when that is. */
function nextRunOf(next: string, nowMs: number, tz: string): { day: string; at: string; atMs: number } | null {
  const m = /^(today|tomorrow)(?:, (within the hour)| (\d{2}):(\d{2}))$/.exec(next);
  if (!m) return null;
  const today = zoneDayKey(nowMs, tz);
  const day = m[1] === "tomorrow" ? shiftKey(today, 1) : today;
  const word = m[1] === "tomorrow" ? "Tomorrow" : "Today";
  if (m[2]) return { day: word, at: "Within the hour", atMs: nowMs };
  const atMs = zoneMidnight(tz, day) + Number(m[3]) * HOUR_MS + Number(m[4]) * MIN_MS;
  return { day: word, at: `${m[3]}:${m[4]}`, atMs };
}

/** Who a running moment will reach on its next run, and the reason when it reaches nobody. */
function whoWill(p: LifecyclePlaybook): { why: string; pill: LifecycleComing["pill"] } | null {
  const reach = playbookReach({ state: p.state, candidates: p.candidates, held: p.held, waiting: p.totals.waiting });
  const of = p.named ? ` of ${p.named.pool}` : "";
  const offers = purposeOfPlaybook(triggerOf(p.trigger)?.cls ?? null) === "marketing";
  switch (reach) {
    case "sends":
      return {
        why: `${p.candidates ?? 0}${of} will get it${p.held ? ` · ${p.held} heard from you this week and wait` : ""}`,
        pill: { tone: "ok", label: plural(p.candidates ?? 0, "person", "people") },
      };
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

/** A running moment's next run. */
function momentRow(p: LifecyclePlaybook, nowMs: number, tz: string): LifecycleComing | null {
  if (p.state !== "running" || p.off || p.listArchived) return null;
  const next = nextRunOf(p.next, nowMs, tz);
  const who = whoWill(p);
  if (!next || !who) return null;
  return {
    id: `moment:${p.id}`,
    kind: "moment",
    when: { day: next.day, at: next.at },
    what: p.name,
    why: who.why,
    pill: who.pill,
    act: { kind: "open", label: "Open", playbookId: p.id },
    atMs: next.atMs,
  };
}

/** A run on its way: scheduled, or waiting for the person's approval. */
function runRow(r: LifecycleRun, name: string, nowMs: number, tz: string): LifecycleComing {
  const atMs = Date.parse(r.scheduled_for);
  const waiting = r.state === "pending_approval";
  return {
    id: `run:${r.id}`,
    kind: "run",
    when: { day: clockNear(atMs, tz, nowMs), at: clockTime(atMs, tz) },
    what: name,
    why: waiting ? "A run is waiting for your approval" : "Scheduled",
    pill: waiting
      ? { tone: "warn", label: LIFECYCLE_WORDS.coming.waiting }
      : { tone: "ok", label: plural(r.recipient_count, "person", "people") },
    act: { kind: "route", label: "Open", route: `broadcasts/run:${r.id}` },
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
  const nameOf = (id: string | null, fallback: string) => playbooks.rows.find((p) => p.id === id)?.name ?? fallback;
  const end = nowMs + COMING_DAYS * DAY_MS;
  const runs = broadcasts.rows
    .filter((r) => (r.state === "scheduled" || r.state === "pending_approval") && Date.parse(r.scheduled_for) <= end)
    .map((r) => runRow(r, nameOf(r.playbook_id, r.name), nowMs, tz));
  const covered = new Set(
    broadcasts.rows.filter((r) => runs.some((x) => x.id === `run:${r.id}`) && r.playbook_id).map((r) => r.playbook_id),
  );
  const moments = playbooks.rows.filter((p) => !covered.has(p.id)).flatMap((p) => momentRow(p, nowMs, tz) ?? []);
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
      yes: null,
      runs: [],
      quiet: false,
    };
  }
  const days = b.report?.days ?? RESULTS_DAYS;
  const note = plural(days, "day");
  const runs = cameBack(input, days);
  if (!b.report) return { read: "read", days, note, headline: null, funnel: null, yes: null, runs, quiet: false };
  const t = b.report.totals;
  const W = LIFECYCLE_WORDS.results.funnel;
  const share = (n: number) => (t.sent > 0 ? n / t.sent : 0);
  const step = (id: "sent" | "delivered" | "read" | "replied", n: number) => ({
    id,
    label: W[id],
    meter: `${W[id]}: ${n}`,
    n,
    share: id === "sent" ? 1 : share(n),
  });
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
        ? [step("sent", t.sent), step("delivered", t.delivered), step("read", t.read), step("replied", t.replied)]
        : null,
    yes: `${t.optIns} said yes · ${t.optOuts} asked to stop`,
    runs,
    quiet: t.sent === 0 && t.optIns === 0 && t.optOuts === 0,
  };
}
