/** Templates: usage. */

import { clockDate } from "../../shared/clock";
import { RUN_WAITING_WORDS } from "../../shell/campaign-rooms";
import { agoWords } from "../../shared/time";
import { isCount, recordOrNull } from "../../shared/unknown";

/* ------------------------------ what sends it ----------------------------- */

/**
 * What actually sends a template.
 *
 * Every send names its template: a playbook keeps `template_name`, a broadcast
 * keeps `template_name`, and the Inbox picks the booking one by rule
 * (`bookingTemplate`). So the answer to "which of my messages does anything"
 * was one join away and nobody made it -- a workspace could carry a message
 * written in WhatsApp Manager a year ago that nothing has ever sent, and the
 * page that lists every template was the one place that could not say so.
 *
 * Keyed by NAME rather than by row, because a template is one message in
 * several languages and the thing that sends it names the message.
 */
export interface TemplateUse {
  /**
   * The playbooks that send it, by the name the owner gave them: whether each is
   * paused, whether it is past its last day (00416 `until`: on, and sending nothing more; absent from a server from before
   * it), whether one of its runs is waiting on the owner, and its clock in words ("runs daily at 10:00") when the source
   * gave one.
   */
  playbooks: {
    id: string;
    name: string;
    paused: boolean;
    ended?: boolean;
    waiting: boolean;
    runs: string | null;
    /**
     * The sequence the step is a part of (decision 0060): its id, its name, and the step's place where it has more than
     * one (null where it is the only step, which the sequence's name says alone). Absent from a server from before it.
     */
    sequence?: { id: string; name: string; step: number | null };
  }[];
  /** How many one-offs a PERSON sent with it (a sequence's batch of no step); a step's runs are its own. */
  broadcasts: number;
  /** The latest of those one-offs, newest first, by the names they were given: at most two. */
  recent: string[];
  /** The Inbox sends this one when somebody asks to book. */
  booking: boolean;
  /** Every sequence that sends it, by id, its steps' and its one-offs' alike: one is where its row's link opens. */
  sequences?: string[];
}

const NOTHING: TemplateUse = { playbooks: [], broadcasts: 0, recent: [], booking: false };

export interface TemplateUseSource {
  /** `runs` is the playbook's clock in words (playbooks.ts `runsWords`), worded by the caller. */
  playbooks: readonly {
    id: string;
    name: string;
    /** Null for a hand step (Reach out, 00228), which sends no template. */
    template_name: string | null;
    state?: string | null;
    runs?: string | null;
    /** Past its last day by the business's day, as the caller judged it (contracts campaignEnded); absent where it was not. */
    ended?: boolean;
    /** The sequence it is a step of, and its place there (00440); absent from a source from before it. */
    sequence_id?: string | null;
    place?: number | null;
  }[];
  /** Every sequence's name by its id (db listSequenceNames), which a step's words name it by; absent where not read. */
  sequences?: readonly { id: string; name: string }[];
  /**
   * Every broadcast. A playbook's runs carry its id: they are not counted as broadcasts, but a
   * run `pending_approval` is how a playbook comes to be waiting on the owner.
   */
  broadcasts: readonly {
    template_name: string | null;
    playbook_id?: string | null;
    name?: string | null;
    state?: string | null;
    created_at?: string | null;
    /** The sequence the batch is part of: a one-off's own. */
    sequence_id?: string | null;
  }[];
  /** The name the Inbox books with, from `bookingTemplate`; null when the workspace has none. */
  bookingName: string | null;
}

/** One entry per template name that anything sends. A name absent from the map is sent by nothing. */
export function templateUsage(src: TemplateUseSource): Record<string, TemplateUse> {
  const out: Record<string, TemplateUse> = {};
  const at = (name: string): TemplateUse =>
    (out[name] ??= { playbooks: [], broadcasts: 0, recent: [], booking: false });
  const asking = new Set(
    src.broadcasts.filter((b) => b.playbook_id && b.state === "pending_approval").map((b) => b.playbook_id),
  );
  const names = new Map((src.sequences ?? []).map((q) => [q.id, q.name]));
  // How many steps each sequence has, a hand step's too: a step is named by its place only where it has company.
  const steps = new Map<string, number>();
  for (const p of src.playbooks) if (p.sequence_id) steps.set(p.sequence_id, (steps.get(p.sequence_id) ?? 0) + 1);
  const sendsBy = (u: TemplateUse, id: string | null | undefined) => {
    if (id && !(u.sequences ??= []).includes(id)) u.sequences.push(id);
  };
  for (const playbook of src.playbooks) {
    if (!playbook.template_name) continue;
    const item = at(playbook.template_name);
    const name = playbook.sequence_id ? names.get(playbook.sequence_id) : undefined;
    item.playbooks.push({
      id: playbook.id,
      name: playbook.name,
      paused: playbook.state === "paused",
      ended: playbook.ended === true,
      waiting: asking.has(playbook.id),
      runs: playbook.runs ?? null,
      ...(playbook.sequence_id && name !== undefined
        ? {
            sequence: {
              id: playbook.sequence_id,
              name,
              step:
                (steps.get(playbook.sequence_id) ?? 0) > 1 && typeof playbook.place === "number"
                  ? playbook.place
                  : null,
            },
          }
        : {}),
    });
    sendsBy(item, playbook.sequence_id);
  }
  // Newest first, so the two it names are the two a person remembers sending.
  const byHand = src.broadcasts
    .filter((b): b is typeof b & { template_name: string } => !!b.template_name && !b.playbook_id)
    .slice()
    .sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")));
  for (const b of byHand) {
    const u = at(b.template_name);
    u.broadcasts += 1;
    if (b.name && u.recent.length < 2) u.recent.push(b.name);
    sendsBy(u, b.sequence_id);
  }
  if (src.bookingName) at(src.bookingName).booking = true;
  return out;
}

const sayList = (parts: string[]): string =>
  parts.length < 2 ? (parts[0] ?? "") : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;

const capital = (s: string): string => (s ? (s[0] ?? "").toUpperCase() + s.slice(1) : s);

/** A step as the owner knows it: its sequence's name, and its place where the sequence has more than one step. */
const sequenceStepWords = (p: TemplateUse["playbooks"][number]): string =>
  p.sequence ? (p.sequence.step ? `${p.sequence.name} · step ${p.sequence.step}` : p.sequence.name) : p.name;

/** The words a message that nothing sends says, on its row and in its pane. */
export const TEMPLATE_UNUSED_WORDS = "Not used";

/**
 * What sends it, in one line, after "Sent by": the sequences' steps by their sequences' names ("VIP color clients · step
 * 2"; a sequence of one step by its name alone), each paused or ended one saying so, the one-offs a person sent by the
 * names they were given (the latest two, and how many more), and the Inbox where it books with it. "Not used" is the
 * answer worth showing: it is the only one that asks the owner to do something about the message.
 */
export function templateUseWords(use: TemplateUse | null | undefined): string {
  const url = use ?? NOTHING;
  const parts: string[] = [];
  for (const p of url.playbooks)
    parts.push(
      p.paused
        ? `${sequenceStepWords(p)} (paused)`
        : p.ended
          ? `${sequenceStepWords(p)} (ended)`
          : sequenceStepWords(p),
    );
  if (url.broadcasts > 0) {
    parts.push(...url.recent);
    const more = url.broadcasts - url.recent.length;
    if (more > 0) parts.push(url.recent.length ? `${more} more` : `${more} one-off${more === 1 ? "" : "s"}`);
  }
  if (url.booking) parts.push("the Inbox");
  if (parts.length === 0) return TEMPLATE_UNUSED_WORDS;
  return capital(sayList(parts));
}

/**
 * The line under what sends it: what that thing is doing, where the words above have not said it. A run waiting on the
 * owner outranks everything; one step running says its clock; several that all stopped say nothing goes out; the
 * Inbox's says what it is for. Null when the first line already said all there is (a paused step says so there).
 */
export function templateUseNote(use: TemplateUse | null | undefined): string | null {
  const url = use ?? NOTHING;
  if (url.playbooks.some((p) => p.waiting)) return `a run is ${RUN_WAITING_WORDS.toLowerCase()}`;
  // One past its last day sends nothing more, whatever its clock says (the wiring's second audit, S1-3).
  const [only] = url.playbooks;
  if (only && url.playbooks.length === 1) return only.paused || only.ended ? null : only.runs;
  if (url.playbooks.length > 1)
    return url.playbooks.every((p) => p.paused)
      ? "all paused — nothing goes out"
      : url.playbooks.every((p) => p.paused || p.ended)
        ? "none runs — nothing goes out"
        : null;
  if (url.booking && url.broadcasts === 0) return "what the receptionist sends to book";
  return null;
}

/** True when nothing sends it: the one state the page draws differently. */
export function templateUnused(use: TemplateUse | null | undefined): boolean {
  const u = use ?? NOTHING;
  return u.playbooks.length === 0 && u.broadcasts === 0 && !u.booking;
}

/* ------------------------------ what went out ----------------------------- */

/**
 * How many times a template actually went out, and when the latest did.
 *
 * Not a broadcast's `recipient_count`: that is the audience a run was scheduled
 * for, and the wire holds people back from it (no yes to offers, asked to stop,
 * no number, a person had the thread) while a run can stop part-way. Reports ›
 * Campaigns counts "Messages sent" apart from "Delivered" off the recipient rows
 * (campaign_series), and a Sent column summed from the audience would contradict
 * the page beside it. So this counts what that page counts -- a person a run
 * marked `sent` -- and the one door that page does not cover: a template the
 * Inbox sent into a thread whose window had closed, which left when WhatsApp
 * took it and the row got its wamid.
 *
 * Keyed by NAME, as `templateUsage` is: a run names its template, not a
 * language's row.
 */
export interface TemplateSends {
  /** Messages that left with it: sent, which is not delivered and not read. */
  count: number;
  /** When the latest of them left (ISO), or null when none kept its time. */
  lastAt: string | null;
}

export interface TemplateSendSource {
  /** Every broadcast -- one a person sent, or a playbook's run -- and the template it sent. */
  runs: readonly { id: string; template_name: string | null }[];
  /** The people on those runs (`broadcast_recipients`). Only the ones in state `sent` went out. */
  recipients: readonly { broadcast_id: string; state: string; sent_at: string | null }[];
  /** What the Inbox sent on a template (`messages.template_name`). Only the ones WhatsApp took -- a wamid -- went out. */
  inbox: readonly { template_name: string | null; external_id: string | null; created_at: string }[];
}

/** One entry per template name that has gone out. A name absent from the map never has. */
export function templateSends(src: TemplateSendSource): Record<string, TemplateSends> {
  const out: Record<string, TemplateSends> = {};
  const nameOf = new Map(src.runs.map((r) => [r.id, r.template_name]));
  const went = (name: string, at: string | null) => {
    const s = (out[name] ??= { count: 0, lastAt: null });
    s.count += 1;
    // As instants, not as text: two stamps in different offsets, or one with a
    // fraction of a second and one without, do not sort by their characters.
    const ms = at === null ? NaN : Date.parse(at);
    if (Number.isFinite(ms) && (s.lastAt === null || ms > Date.parse(s.lastAt))) s.lastAt = at;
  };
  for (const r of src.recipients) {
    const name = r.state === "sent" ? nameOf.get(r.broadcast_id) : undefined;
    if (name) went(name, r.sent_at);
  }
  for (const m of src.inbox) {
    if (m.template_name && m.external_id) went(m.template_name, m.created_at);
  }
  return out;
}

/**
 * template_sends' answer (00374), by message name: storage's `last_at` read into memory's `lastAt`, its count a whole
 * number (isCount). Null when it is not that shape, which the reader says as a read that failed, never as a message
 * nothing sent.
 */
export function templateSendsOf(answer: unknown): Record<string, TemplateSends> | null {
  const byName = recordOrNull(answer);
  if (!byName) return null;
  const out: Record<string, TemplateSends> = {};
  for (const [name, raw] of Object.entries(byName)) {
    const s = recordOrNull(raw);
    if (!s || !isCount(s.count) || !(s.last_at === null || typeof s.last_at === "string")) return null;
    out[name] = { count: s.count, lastAt: s.last_at };
  }
  return out;
}

export interface TemplateSentWords {
  /** "1,204": how many went out; null when none has. */
  count: string | null;
  /** "2d ago", "Jul 31" or "Never sent"; null when none of them kept its time. */
  when: string | null;
}

/**
 * The Sent cell. How long ago is said the way every page says it (time.ts):
 * "just now" · "3h ago" · "2d ago", and past a week the business's date.
 * A message that never went out says so in words: a "0" in a column of counts
 * reads as a quantity to compare with the others, and never is not one.
 */
export function templateSentWords(
  templateSends: TemplateSends | null | undefined,
  tz: string,
  nowMs: number,
): TemplateSentWords {
  if (!templateSends || templateSends.count === 0) return { count: null, when: "Never sent" };
  const at = templateSends.lastAt === null ? NaN : Date.parse(templateSends.lastAt);
  return {
    count: templateSends.count.toLocaleString("en-US"),
    when: Number.isFinite(at) ? agoWords(at, nowMs, { date: (ms) => clockDate(ms, tz, nowMs) }) : null,
  };
}
