// Chanlytics — Settings › Business: what a save writes, and the one saver every save goes through.
//
// The page (tab.tsx) draws; this file decides what its saves write. Here: each row's check (the
// sentence that stops a save before any round trip, or null), what a row's draft stores, and its patch (the one-key
// change a save makes: a pure function of the stored brain and profile that returns the brain); the tab's one saver,
// which every row and fold saves through; and how a number is written for people (phoneShown). Each fold's helpers
// (what it opens with, what stops its save, and the config its save writes) are folds.ts's, which adds them to what
// this holds in the tab's saver (saver.ts).
//
// The tab's saver (saver.ts) is this file's SAVE with folds.ts's FOLDS added, one object that every consumer imports.

import type { ReactNode } from "react";
import { BUSINESS_TAB } from "@/legacy-bridge/business-tab";
import type { LegacyFlash } from "../../legacy-verbs";
import { btSellsByNow } from "./offer";
import {
  handoffE164,
  normalizeLink,
  pageConsole,
  phoneDisplay,
  receptionistDefaults,
  saveSettingsFn,
  settingsNow,
  tzApi,
  whyNotAHandoff,
  whyNotAPhone,
  workspaceApi,
} from "./shell";

/* ------------------------------------ the config, as far as this tab reads it ------------------------------------ */

/** A day as it is stored: an open/close pair, a list of intervals, or both (contracts dayIntervals unions them). */
export interface StoredDay {
  open?: string;
  close?: string;
  intervals?: { open?: string; close?: string }[];
}

/** A closed day or stretch as it is stored. */
export interface StoredClosure {
  date?: string;
  until?: string;
  note?: string;
}

/** A service as it is stored. */
export interface StoredService {
  name?: string;
  duration_min?: number;
  price_note?: string;
}

/** A note as it is stored. */
export interface StoredNote {
  title?: string;
  text?: string;
}

/** The booking rules as they are stored: the five numbers, the notes, the email switch and the consult-first list. */
export interface StoredRules {
  [key: string]: unknown;
  notes?: string[];
  ask_email?: boolean;
  consult_first?: string[];
}

/** The business profile, as far as the tab reads it; any other key it keeps is kept (the index). */
export interface Profile {
  [key: string]: unknown;
  address?: string;
  website?: string;
  handoff_number?: string;
  tone?: string;
  hours?: Record<string, StoredDay | undefined>;
  closures?: StoredClosure[];
  services?: StoredService[];
  languages?: string[];
  notes?: StoredNote[];
  escalate_when?: string[];
  booking_rules?: StoredRules;
  guardrails?: Record<string, boolean | undefined>;
  extra_instructions?: string;
}

/** The receptionist's brain, as far as the tab reads it. */
export interface Brain {
  [key: string]: unknown;
  business_name?: string;
  phone_display?: string;
  booking_link?: string;
  system_prompt?: string;
  fallbacks?: Record<string, string>;
  profile?: Profile;
}

/** The whole stored config, as far as the tab reads it. */
export interface Config {
  [key: string]: unknown;
  brain?: Brain;
  features?: { [key: string]: unknown; vision?: boolean };
  calendar?: { [key: string]: unknown; ical_url?: string };
  /** The booking tool the owner named (00345, contracts BOOKING_TOOL_IDS), in a section of its own. */
  bookings?: { [key: string]: unknown; tool?: string };
}

/** A row's change: a function of the brain and its profile that returns the brain. */
export type RowChange = (brain: Brain, profile: Profile) => Brain;

interface JobBase {
  /** The row's or the fold's id. */
  row: string;
  /** The toast once the server takes it. */
  said?: ReactNode;
  /** Runs then too (the row closes). */
  done?: () => unknown;
  flash?: (flash: LegacyFlash) => unknown;
}

/** A row's job: its one-key change. */
interface RowJob extends JobBase {
  change: RowChange;
  patch?: undefined;
}

/** A fold's job: a function of the whole config that returns the next one. */
export interface FoldJob extends JobBase {
  patch: (config: Config) => Config;
  change?: undefined;
}

export type SaveJob = RowJob | FoldJob;

/** An error a patch throws to refuse the config it is about to go on: `said` is the sentence for the owner. */
interface Refusal extends Error {
  said: string;
}

/** What the server holds, as far as this tab knows. */
interface Held {
  config: Config;
  version: number;
}

/** What a patch tried gives: { patched } when it ran and handed back a config, { failed } when it threw or handed back none. */
interface Tried {
  patched?: Config;
  failed?: unknown;
}

/**
 * A number as people write it, "+1 (305) 555-0100", the way Setup and Connections show one (contracts
 * formatPhoneDisplay, published by the bridge). Business showed the line it answers and the transfer number in the
 * E.164 they are stored as (the wiring audit's L7). Only E.164 is rewritten: anything else is shown as it was written,
 * which for the number it gives out is what the receptionist says.
 *
 * Exported as `phoneShown`, since the Business tab shows a number in more than one of its folds: one rule for
 * writing them.
 */
export const phoneShown = (v: string | null | undefined) => {
  const show = phoneDisplay();
  return v && typeof show === "function" && /^\+[1-9][0-9]{6,14}$/.test(v) ? show(v) : v;
};

// Two drafts are the same when saving either would write the same thing.
const btSame = (a: unknown, b: unknown) =>
  JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b);
const btTrimmed = (d: unknown) => {
  const text = (d == null ? "" : d) as string;
  return String(text).trim();
};

/**
 * A job's patch, applied to a config: the config it would send, with the config it was applied to left exactly as it
 * was. The one place a patch is run, by the saver as it sends and by a row working out what it will say, so the two
 * never apply one patch two ways.
 *
 * A job carries its patch one of two ways. A row's is `change`, its one-key change: a function of the brain and its
 * profile that returns the brain. A fold's is `patch`, a function of the whole config that returns the next one, since
 * a fold may write beside the brain (the calendar, the photos switch); saveFold builds it (folds.ts).
 *
 * On a copy all the way down (structuredClone). A patch was handed shallow copies, so one that changed a nested object
 * in place (p.booking_rules.lead_hours = 5) changed the config it was about to be compared with as well: the saver
 * found nothing to send, the row closed as if saved, and the settings read showed a value no server held.
 */
const btPatched = (config: Config, job: SaveJob): Config => {
  const copy = structuredClone(config);
  if (typeof job.patch === "function") return job.patch(copy);
  const brain = copy.brain || {};
  return { ...copy, brain: job.change(brain, { ...(brain.profile || {}) }) };
};

/**
 * A patch's own refusal: an error whose `said` is the sentence for the owner. A patch throws one when it finds, on the
 * config it is about to go on, that it must not go (a fold whose part of the settings changed after it opened,
 * folds.ts). The saver says `said` in the danger tone and drops the job; any other throw is said in the
 * saver's own words.
 */
const btRefusal = (words: string): Refusal => Object.assign(new Error(words), { said: words });

/** What a refused or failed answer says: its `message`, when it has one. */
const btMessageOf = (answer: unknown): ReactNode => (answer ? (answer as { message?: ReactNode }).message : undefined);

/** A throw as an Error to reject with: an Error as it is, anything else as an Error that says what it said (its `message`). */
const btAsError = (thrown: unknown): Error => {
  if (thrown instanceof Error) return thrown;
  const said = thrown ? (thrown as { message?: unknown }).message : undefined;
  return new Error(typeof said === "string" ? said : "");
};

/**
 * A job's own callbacks are the page's, and one that throws (a fold already gone, a toast with nowhere to go) must not
 * stop the save behind it or the re-read that follows an accepted one.
 */
const btSafely = <A = undefined,>(fn: ((arg: A) => unknown) | undefined, arg?: A) => {
  if (typeof fn !== "function") return;
  try {
    fn(arg as A);
  } catch (err) {
    const log = pageConsole();
    if (log) log.error(err);
  }
};

/** Each page listening hears every move, whatever another does: one that throws is reported and the rest still hear. */
const btTell = (subs: Set<() => void>) => {
  for (const fn of [...subs]) {
    try {
      fn();
    } catch (err) {
      const log = pageConsole();
      if (log) log.error(err);
    }
  }
};

/**
 * A patch, tried: { patched } when it ran and handed back a config, { failed } when it threw or handed back none.
 * The page is untyped and a fold's draft is whatever its fields held, so a patch can throw on a draft nobody foresaw;
 * and base() runs every waiting patch each time the page draws. Unguarded, one bad draft waiting behind a save took the
 * page down on its next draw, and then threw inside the accepted save's callback, which skipped the settings re-read.
 */
const btTried = (config: Config, job: SaveJob): Tried => {
  try {
    const patched = btPatched(config, job);
    if (!patched || typeof patched !== "object") throw new Error("A save's patch handed back no config.");
    return { patched };
  } catch (failed) {
    // A patch's own refusal is an answer, not a fault: base() meets it on every draw while the job waits.
    const log = pageConsole();
    if (log && typeof (failed as { said?: unknown }).said !== "string") log.error(failed);
    return { failed };
  }
};

/** What the server holds, as far as this tab knows: its answer to the last save it took, or the settings read when that is newer. */
const btHeldOf = (last: Held | null): Held | null => {
  const read = settingsNow() || null;
  const r = read && read.config ? { config: read.config as Config, version: read.version } : null;
  return last && (!r || last.version > r.version) ? last : r;
};

/** What base() last worked out, and from what: kept while nothing it was worked out from moves. */
interface Memo {
  key: unknown[];
  config: Config;
}

/** The saver, as a page uses it. */
export interface Saver {
  save(job: SaveJob): void;
  pending(row: string): boolean;
  takenAt(row: string): number | null;
  base(): Config | null;
  subscribe(fn: () => void): () => void;
  reset(): void;
}

/**
 * One saver for the browser tab, so saves made close together go one at a time, and each builds on the one before.
 *
 * PUT /settings is a versioned compare-and-swap of the whole config -- sending a fragment would delete the rest -- and
 * that brings the new version lands about half a second after the server accepts. Each row saving on its own sent the
 * config and version as the page last drew them, so "Use Google's" on the address and then on the name sent version 7
 * twice, and the server refused the second as a colleague's save that never happened. So every row asks this saver:
 * a patch waits while another is out, and goes on the config the server answered the last one with (the bridge hands
 * it to onAccepted), or on the settings read when that is newer. A patch is a pure function of what is stored, so it
 * applies to whatever is current when it goes, and one that would change nothing is not sent. The next waits while one
 * is out: plViewSaver's shape (clients-a.jsx).
 *
 * One for the tab rather than one for each page drawn (btTabSaver, below, is the one): the page goes when the Settings
 * rail shows another tab, and a page drawn on coming back held a new saver on the settings read it was drawn with. Back
 * before the re-read landed, its next save went out on the version the server had moved past, and was refused as a
 * colleague's; and a save still waiting its turn was one the new page's row could not see. A page subscribes as it
 * mounts, and is drawn again whenever a save moves (queued, sent, taken, refused).
 *
 * A job is { row, change or patch, said, done, flash } (btPatched says which patch is which): `row` is the row's or the
 * fold's id, `said` is the toast once the server takes it, `done` runs then too (the row closes), and a refusal, or a
 * promise that fails before the server took it, is said in the danger tone. So is a patch that cannot run, or that
 * refuses the config it would go on (btRefusal): said, dropped, and the save behind it goes. `reset()` is for tests: it
 * forgets the queue, the save out and the last answer, as a new browser tab would start, and a save from before it
 * closes nothing and says nothing when its answer comes.
 */
const btSaver = (): Saver => {
  let last: Held | null = null;
  let out: SaveJob | null = null;
  // When the server last took each row's or fold's save, by its id: what was read before that moment is from before
  // the save (the calendar row says nothing of a read from before its address was saved).
  const taken: Record<string, number> = {};
  // Which life of the saver a save was sent in: reset() starts a new one, and an answer from an earlier life closes
  // nothing and says nothing.
  let life = 0;
  const queue: SaveJob[] = [];
  const subs = new Set<() => void>();
  const onChange = () => btTell(subs);
  // What base() last worked out, and from what: kept while nothing it was worked out from moves.
  let memo: Memo | null = null;
  /**
   * The config the next save goes on: what the server holds, with the save out and each one waiting its turn applied
   * to it in order, as if taken. A refused one drops out of it as it is refused, and a save the server has taken is in
   * what it holds (its answer) before the settings read brings it back.
   *
   * What a row or a fold will say, and whether its save crosses the resolver's line, are worked out on this, since it
   * is what their save will be applied to. Worked out on the settings read, as they first were, they described a brain
   * that was not the one saved whenever another save was out or taken and not yet read back: with the website's save
   * out, emptying the address said nothing, and its save, landing on a record with no website, stopped the prompt
   * composing. The same object comes back while nothing moves, so what a row will say is worked out once for it
   * rather than on every keystroke. Null with nothing read to save onto. Never change what it returns: apply a patch
   * with patched(), which works on a copy.
   */
  const base = (): Config | null => {
    const from = btHeldOf(last);
    if (!from) return null;
    const ahead = out ? [out].concat(queue) : queue.slice();
    const key: unknown[] = [from.config, ...ahead];
    if (memo && memo.key.length === key.length && memo.key.every((k, i) => k === key[i])) return memo.config;
    // A patch that cannot run is left out: next() says it and drops it when its turn comes.
    const config = ahead.reduce((cfg, job) => btTried(cfg, job).patched || cfg, from.config);
    memo = { key, config };
    return config;
  };
  const next = (): void => {
    if (out || !queue.length) return;
    const job = queue.shift();
    if (!job) return;
    const from = btHeldOf(last);
    const saveSettings = saveSettingsFn();
    // No door to save through, or nothing read to save onto: nothing goes, and nothing waits on a save that never lands.
    if (!from || typeof saveSettings !== "function") {
      onChange();
      next();
      return;
    }
    const cfg = from.config;
    const mine = life;
    let accepted = false;
    const refused = (words: ReactNode) => {
      if (!accepted && mine === life) {
        btSafely(job.flash, { tone: "danger", msg: <>{words || "That didn't go through."}</> });
      }
    };
    // Compared with the config as it was: the patch ran on a copy (btPatched). One that cannot run, or refuses to go on
    // this config, is said and dropped, and the fold stays open with what was typed.
    const tried = btTried(cfg, job);
    if (tried.failed) {
      const said = (tried.failed as { said?: unknown }).said;
      refused(typeof said === "string" ? said : null);
      onChange();
      next();
      return;
    }
    const patched = tried.patched;
    if (btSame(patched, cfg)) {
      btSafely(job.done);
      onChange();
      next();
      return;
    }
    out = job;
    onChange();
    const free = () => {
      if (out !== job) return;
      out = null;
      onChange();
      next();
    };
    let sent: unknown;
    try {
      sent = saveSettings(patched, from.version, (saved) => {
        // After a reset, an answer from before it is no answer to anything now.
        if (mine !== life) return;
        accepted = true;
        const answer = saved as { config?: Config; version?: unknown } | undefined;
        if (out === job && answer && answer.config && typeof answer.version === "number") {
          last = { config: answer.config, version: answer.version };
        }
        taken[job.row] = Date.now();
        btSafely(job.done);
        btSafely(job.flash, { msg: job.said });
        // With the server's answer in hand the next patch goes on it now; without one, it waits for the re-read,
        // which is when the promise settles.
        if (answer && answer.config) free();
      });
    } catch (e) {
      sent = Promise.reject(btAsError(e));
    }
    Promise.resolve(sent).then(
      (r) => {
        if (!(r && (r as { ok?: unknown }).ok)) refused(btMessageOf(r));
        free();
      },
      (e: unknown) => {
        refused(btMessageOf(e));
        free();
      },
    );
  };
  return {
    save(job) {
      queue.push(job);
      onChange();
      next();
    },
    // A row's save is in hand while it waits its turn or is out: its Save says so, and takes no second press.
    pending(row) {
      return !!((out && out.row === row) || queue.some((j) => j.row === row));
    },
    // When the server last took this row's save in this tab, in ms, or null.
    takenAt(row) {
      return Object.prototype.hasOwnProperty.call(taken, row) ? (taken[row] ?? null) : null;
    },
    base,
    // A page hears every move while it is on screen; call what this returns as it goes.
    subscribe(fn) {
      subs.add(fn);
      return () => {
        subs.delete(fn);
      };
    },
    reset() {
      life += 1;
      last = null;
      out = null;
      queue.length = 0;
      memo = null;
      Object.keys(taken).forEach((k) => {
        delete taken[k];
      });
      onChange();
    },
  };
};

// The tab's one saver: made once, as this module loads, and kept for as long as the tab is open, so every page drawn in
// it finds the queue and the last answer.
const btTabSaver = btSaver();

/** What a workspace door's job carries: the editor's close and the toast. */
interface DoorJob {
  done?: () => unknown;
  flash?: (flash: LegacyFlash) => unknown;
}

/** What a courier answers. */
interface DoorReply {
  ok?: boolean;
  message?: string;
}

/** A workspace door, as a page uses it. */
interface WorkspaceDoor<J> {
  save(job: J): void;
  pending(): boolean;
  subscribe(fn: () => void): () => void;
  reset(): void;
}

/**
 * The workspace's own doors, for what this tab states that the settings save does not write: the two fields of the
 * tenant row its owner may change (PATCH workspaces, workspaceApi()), which are no key of the config. The timezone
 * is one (`zone`), and how customers buy (0008) the other (`sellsBy`); each is a door made here, once, by the one rule.
 *
 * It is here, beside the saver, for the saver's reason: it outlives the page. The row once kept "my save is out" in its
 * own state, so a pane left mid-save and come back to drew an editor that was not busy and told the rail nothing was
 * saving; a new zone could be picked, and the old save's answer closed the new editor and dropped the pick without a
 * question. Held here, a page drawn again finds the save still out, its row busy and its box read-only, as a settings
 * row's is.
 *
 * save(job) sends one at a time (a press while one is out sends nothing), and only while `ready()`: the workspace's
 * courier is there to send it through (the standalone mockup has none). `send(job)` is the courier's call. Taken, the
 * job's `done` runs (the editor closes) and the toast says `taken(r, job)`, from what the courier answered (`r`);
 * refused, or failed before an answer, the server's words are said in the danger tone and the editor stays open with the
 * pick. pending() is whether one is out; a page subscribes while it is on screen; reset() is for tests, as the saver's is.
 */
const btWorkspaceDoor = <J extends DoorJob, R extends DoorReply>({
  ready,
  send,
  taken,
}: {
  ready: () => boolean;
  send: (job: J) => Promise<R>;
  taken: (r: R, job: J) => ReactNode;
}): WorkspaceDoor<J> => {
  let out: J | null = null;
  let life = 0;
  const subs = new Set<() => void>();
  const tell = () => btTell(subs);
  return {
    save(job) {
      if (out || !ready()) return;
      const mine = life;
      out = job;
      tell();
      const answered = (r: DoorReply | undefined) => {
        if (mine !== life) return;
        out = null;
        tell();
        const ok = !!(r && r.ok);
        if (ok) btSafely(job.done);
        btSafely(job.flash, {
          tone: ok ? "ok" : "danger",
          msg: ok ? taken(r as R, job) : <>{(r && r.message) || "That didn't go through."}</>,
        });
      };
      let sent: Promise<DoorReply | undefined>;
      try {
        sent = send(job);
      } catch (e) {
        sent = Promise.reject(btAsError(e));
      }
      Promise.resolve(sent).then(answered, (e: unknown) =>
        answered({ ok: false, message: e ? (e as { message?: string }).message : undefined }),
      );
    },
    pending: () => !!out,
    subscribe(fn) {
      subs.add(fn);
      return () => {
        subs.delete(fn);
      };
    },
    reset() {
      life += 1;
      out = null;
      tell();
    },
  };
};

/** The zone's job: the zone picked, the editor's close and the toast. */
interface ZoneJob extends DoorJob {
  tz: string;
}

/** How customers buy: the answer, the toast the fold worked out, the editor's close and the flash. */
interface SellsByJob extends DoorJob {
  answer: string;
  said?: ReactNode;
}

// The courier's answer to either door, when it is there to ask: the workspace API is read as it is called.
const btWorkspaceOrThrow = () => {
  const api = workspaceApi();
  if (!api) throw new TypeError("The workspace's courier is not there.");
  return api;
};

// The zone: save({ tz, done, flash }), through the courier's own call for it, and said in the old row's words.
const btZoneDoor = btWorkspaceDoor({
  ready: () => !!(workspaceApi() && typeof workspaceApi()?.setTimezone === "function"),
  send: (job: ZoneJob) => btWorkspaceOrThrow().setTimezone(job.tz),
  taken: (r) => {
    const tz = tzApi();
    return (
      <>
        Your day is measured in <b>{tz && tz.city ? tz.city(r.tz) : r.tz}</b> now.
      </>
    );
  },
});

// How customers buy: save({ answer, said, done, flash }), the answer alone in the patch, so the zone is never sent
// again with it. `said` is the toast the fold worked out (contracts sellsBySaved), since what it says depends on the
// answer this one replaces.
const btSellsByDoor = btWorkspaceDoor({
  ready: () => !!(workspaceApi() && typeof workspaceApi()?.patch === "function"),
  send: (job: SellsByJob) => btWorkspaceOrThrow().patch({ sells_by: job.answer }),
  taken: (_r, job) => <>{job.said}</>,
});

/* ------------------------------------ what each row stores ------------------------------------ */

// The pattern every web address on this tab is checked by: the old form's, which the save's own URL rule backs up.
// A web address as it is stored: contracts' one normalizer (normalizeLink, which supplies a missing https://), or null
// when the draft cannot be one. Without the bridge (the standalone mockup before it loads, a test that never installed
// it) there is nothing to ask, as for the booking link's own check: it is taken as typed.
const btWebOf = (v: string | null | undefined): string | null => {
  if (!v) return null;
  const normalize = normalizeLink();
  return normalize ? normalize(v) : v;
};

/** The number it gives out as PublishedNumberRow holds it: the line it answers (`own`), or a different one typed. */
interface PublishedDraft {
  own?: boolean;
  typed?: unknown;
}

// The number it gives out, as PublishedNumberRow held it: absent is "the line it answers", so choosing the line stores
// nothing. `own` means the line only where there is one to follow.
const btPublishedOf = (d: PublishedDraft, line: string | null | undefined) => (d.own && line ? "" : btTrimmed(d.typed));

// The transfer number is stored as E.164, or not at all (contracts handoffE164).
const btTransferOf = (d: string | null | undefined) => {
  const e164 = handoffE164();
  return e164 ? e164(d) : btTrimmed(d) || null;
};

/** What a row's draft stores, by the row's id. */
interface StoredAs {
  name: (d: unknown) => string;
  address: (d: unknown) => string;
  website: (d: unknown) => string;
  booking_link: (d: unknown) => string;
  phone_display: (d: PublishedDraft, line: string | null | undefined) => string;
  handoff_number: (d: string | null | undefined) => string | null;
}

/**
 * What a row's draft stores: the value its patch writes, and what "holds changes" is judged by. Each takes the draft
 * and the line the workspace answers on ("" when there is none); a row of words stores its draft trimmed.
 */
const BT_STORED_AS: StoredAs = {
  name: btTrimmed,
  address: btTrimmed,
  // Stored with the https:// an owner leaves off, as contracts' normalizer stores an address; what it cannot read, as
  // typed, for the row's check to refuse.
  website: (d) => btWebOf(btTrimmed(d)) || btTrimmed(d),
  booking_link: (d) => btWebOf(btTrimmed(d)) || btTrimmed(d),
  phone_display: btPublishedOf,
  handoff_number: btTransferOf,
};

/* What stops each row's save before any round trip: its sentence, said under the box, or null. Each takes the draft;
   the two numbers take the line the workspace answers on ("" when there is none) too, and the booking link the
   workspace's answer to how its customers buy. The address takes anything, empty included. */

// The API refuses an empty name too, but names no field: checked here, the owner is told where.
const btCheckName = (d: unknown) =>
  btTrimmed(d) ? null : "The receptionist needs a business name before it can answer anyone.";
const btCheckWebsite = (d: unknown) => {
  const v = btTrimmed(d);
  return v && !btWebOf(v) ? "The website needs to be a web address, like example.com." : null;
};
// Asked of a business that books or has not said (contracts bookingLinkOptional, by the answer the caller holds): a
// business that quotes may leave it empty, and its receptionist takes the customer's details instead. Without the
// bridge (the standalone mockup before it loads, a test that never installed it) there is nothing to ask.
const btCheckBookingLink = (d: unknown, sellsBy: string | null | undefined) => {
  const v = btTrimmed(d);
  if (!v) return !BUSINESS_TAB.bookingLinkOptional(sellsBy) ? BUSINESS_TAB.BOOKING_LINK_NEEDED : null;
  return btWebOf(v) ? null : "That booking link needs to be a web address, like booksy.com/your-page.";
};
const btCheckPublished = (d: PublishedDraft, line: string | null | undefined) => {
  const v = btPublishedOf(d, line);
  const why = whyNotAPhone();
  const bad = v && why ? why(v) : null;
  if (bad) return bad;
  return !v && !line ? "There is no line yet, so the receptionist needs a number to give out." : null;
};
// `kept` is the number the business keeps and forwards to the receptionist (contracts kept_line): a transfer there comes straight back.
const btCheckTransfer = (d: string | null | undefined, line: string | null | undefined, kept?: string | null) => {
  const why = whyNotAHandoff();
  return why ? why(d, line, kept) : null;
};

/** What stops each row's save, by the row's id. */
interface CheckOf {
  name: (d: unknown) => string | null;
  website: (d: unknown) => string | null;
  booking_link: (d: unknown, sellsBy: string | null | undefined) => string | null;
  phone_display: (d: PublishedDraft, line: string | null | undefined) => string | null;
  handoff_number: (
    d: string | null | undefined,
    line: string | null | undefined,
    kept?: string | null,
  ) => string | null;
}

const BT_CHECK_OF: CheckOf = {
  name: btCheckName,
  website: btCheckWebsite,
  booking_link: btCheckBookingLink,
  phone_display: btCheckPublished,
  handoff_number: btCheckTransfer,
};

/* ------------------------------------ what each row's save writes ------------------------------------ */

/**
 * Whether a brain's stored prompt is exactly the product's opening lines under the business's stored name: what the
 * product writes for it (contracts newReceptionistDefaults, which the bridge publishes), and nothing else.
 *
 * Not isBaselinePrompt, which reads only the opening and the closing and takes anything between them as a name. That
 * is right for saying whose words a prompt is, but a rename overwrites what this matches, and words an owner put
 * between the two would go with it (config.ts, isBaselineInOwnersField, says where the loose test is unsafe). Missed,
 * a rename leaves the prompt as it is, which loses nothing. Space around the prompt is not a word of it.
 */
const btIsBaseline = (brain: Brain | null | undefined) => {
  const text = brain && typeof brain.system_prompt === "string" ? brain.system_prompt.trim() : "";
  const defaults = receptionistDefaults();
  if (!text || !defaults) return false;
  return text === defaults((brain && brain.business_name) || "").system_prompt;
};

/**
 * A new name for the business, as one patch: `business_name`, and the product's opening lines written again under the
 * new name where the stored prompt is them. Every workspace the product sets up stores them as its prompt, and the
 * resolver carries that prompt in the owner's place until they write their own (config.ts ownWordsOf), so a rename
 * that left it behind had the receptionist told it was the assistant for both businesses, one line after the other.
 * The old form wrote them on every save; a rename here writes them when it renames. A stored prompt that is not them,
 * word for word under the name stored beside it, is the owner's own words, carried, and a rename leaves it as they
 * wrote it.
 */
const btPatchName = (name: string) => (b: Brain) => {
  if (name !== b.business_name && btIsBaseline(b)) b.system_prompt = receptionistDefaults()(name).system_prompt;
  b.business_name = name;
  return b;
};

// A key of the profile, written from what the draft stores: an emptied box deletes its key rather than storing "", or
// the composed prompt would state an address of nothing (the rule the old form's `put` held).
const btPatchProfile = (key: string) => (value: string | null | undefined) => (b: Brain, p: Profile) => {
  if (value) p[key] = value;
  else delete p[key];
  b.profile = p;
  return b;
};

// A key of the brain an emptied box removes rather than storing "": the published number, whose absence is the
// schema's "the line it answers", and the booking link, whose empty one would fail the read's web-address check and the
// whole config with it, which leaves the receptionist silent.
const btPatchBrain = (key: string) => (value: string | null | undefined) => (b: Brain) => {
  if (value) b[key] = value;
  else delete b[key];
  return b;
};

/** Each row's patch, by the row's id. */
interface PatchOf {
  name: (name: string) => (b: Brain) => Brain;
  address: (value: string | null | undefined) => RowChange;
  website: (value: string | null | undefined) => RowChange;
  booking_link: (value: string | null | undefined) => (b: Brain) => Brain;
  phone_display: (value: string | null | undefined) => (b: Brain) => Brain;
  handoff_number: (value: string | null | undefined) => RowChange;
}

/** Each row's patch, from the value its draft stores (BT_STORED_AS): a function of (brain, profile) that returns the brain. */
const BT_PATCH_OF: PatchOf = {
  name: btPatchName,
  address: btPatchProfile("address"),
  website: btPatchProfile("website"),
  booking_link: btPatchBrain("booking_link"),
  phone_display: btPatchBrain("phone_display"),
  // Emptied, the phone receptionist takes a message instead of transferring.
  handoff_number: btPatchProfile("handoff_number"),
};

// The workspace's answer to how its customers buy, as the workspace list carries it (offer.tsx btSellsByNow), asked as
// it is needed; null where it was never said.
const btAnswer = () => btSellsByNow();
// The answer a create fold's draft stands on: the one chosen in it, else the workspace's (create.tsx).
const btAnswerOf = (draft: { sells_by?: string | null } | null | undefined) => (draft && draft.sells_by) || btAnswer();

// The tab's one saver (`saver`: { save(job), pending(row), takenAt(row), base(), subscribe(fn), reset() }),
// the workspace's own doors for the timezone (`zone`: { save({ tz, done, flash }), pending(), subscribe(fn), reset() }) and
// for how customers buy (`sellsBy`: the same, saving { answer, said, done, flash }),
// how a job's patch is applied (`patched`) and how one refuses the config it would go on (`refusal`), the two helpers a row's draft is judged by (`same`, `trimmed`), whether a
// brain's prompt is the product's own lines under its stored name (`isBaseline`), each row's STORED_AS, CHECK_OF and
// PATCH_OF by its id. folds.ts adds each fold's paths, keys and helpers to it (saver.ts).
export const SAVE = {
  saver: btTabSaver,
  zone: btZoneDoor,
  sellsBy: btSellsByDoor,
  patched: btPatched,
  refusal: btRefusal,
  same: btSame,
  trimmed: btTrimmed,
  isBaseline: btIsBaseline,
  answer: btAnswer,
  answerOf: btAnswerOf,
  STORED_AS: BT_STORED_AS,
  CHECK_OF: BT_CHECK_OF,
  PATCH_OF: BT_PATCH_OF,
};

// Each member, by name too: the tab's pages import the one they use.
export const { refusal, same, trimmed, answerOf, STORED_AS, CHECK_OF } = SAVE;
