/**
 * Broadcasts, the verbs: `window.__broadcasts.send(body)`, `.cancel(id)`,
 * `.approve(id)`, and `.detail(id)`, a read -- with `.report(detail)`, what
 * that read says about the run, in the contracts' words.
 *
 * Each goes through the typed client (owner or operator on the server; a
 * viewer's click returns the server's refusal), and after a write lands the
 * refresh map re-reads the Broadcasts surface, so the Scheduled and History
 * rows are the server's — never a row the page invented while it waited.
 */
import {
  REPLY_WINDOW_MS,
  broadcastFailureWords,
  heardWords,
  noNumberWords,
  noChannelWords,
  NO_CHANNEL_REACH,
  saidYesWords,
  toApprovalVM,
  toRunReportVM,
  type AudienceKind,
  type BroadcastDetailDto,
  type ConsentChannel,
  type ParamSpec,
  type PlaybookDto,
} from "@chanlytics/contracts";
import { api } from "@/legacy-bridge/api";
import { visitWordHere } from "../../workspace-word";
import type { Output } from "@/client/api";
import { surfaceValue } from "../../surface-values";
import { peekRunDetail, runDetail } from "./detail-read";

export interface SendBody {
  template_id: string;
  params: ParamSpec[];
  audience: { kind: AudienceKind; id: string | null };
  /** The channels it goes by (step 3): WhatsApp alone where it names none. */
  channels?: ConsentChannel[];
  scheduled_for?: string | null;
  name?: string | null;
  /** False sends to whoever heard from a campaign or a broadcast this week too (the composer's switch); absent, they are left out. */
  breathe?: boolean;
}

export const broadcasts = {
  // One intent per broadcast (decision 0035): a send pressed again after a timeout is the same request, answered once.
  send: (body: SendBody) => api()("POST broadcasts", { body, once: true }),
  // Each act says so the moment the server takes it (`onAccepted`, with what it answered), not once the broadcasts and
  // the playbooks are read again behind it; the page repaints from that re-read. Each is one intent (decision 0035): a
  // press again before it lands, from any page that draws the run (Today, Sent, a drawer, the ledger), is the same request,
  // which the server answers once (the wiring's second audit, S9-10).
  cancel: (id: string, opts: { onAccepted?: (data: Output<"POST broadcasts/[id]/cancel">) => void } = {}) =>
    api()("POST broadcasts/[id]/cancel", { params: { id }, onAccepted: opts.onAccepted, once: true }),
  /** A playbook's run that waited for a person goes out now. */
  approve: (id: string, opts: { onAccepted?: (data: Output<"POST broadcasts/[id]/approve">) => void } = {}) =>
    api()("POST broadcasts/[id]/approve", { params: { id }, onAccepted: opts.onAccepted, once: true }),
  /** One broadcast and every person on it, and the last answer the tab holds for it (detail-read.ts). */
  detail: runDetail,
  peekDetail: peekRunDetail,
  /** Why a whole broadcast stopped, in the owner's words, for the detail, which reads the row as the route returns it. */
  failureWords: broadcastFailureWords,
  /** Why nobody on an audience can be sent it when somebody on it said yes -- no number to send to -- in People's words. */
  noNumberWords,
  /** The same, where what they lack is a channel the send can go by now (Meta's pause on offers to US numbers). */
  noChannelWords,
  /** Why, in the pages' one sentence, after the count of who said yes when no channel can carry it. */
  NO_CHANNEL_REACH,
  /** How many on an audience said yes, as the line under it says it: the reach, and who said yes when nobody can be sent it. */
  saidYesWords,
  /** How many of those it reaches heard from a run this week, in the composer's words: left out while it breathes. */
  heardWords,
  /**
   * One run's report, as the opened run draws it: its five figures, everyone it touched in words, every reply, and
   * why it stopped -- stamped by the business's clock (zone.ts), which the page has installed before it opens a run.
   */
  report: (d: BroadcastDetailDto) =>
    toRunReportVM(d, {
      windowMs: REPLY_WINDOW_MS,
      nowMs: Date.now(),
      clock: (iso) => {
        const ms = iso ? Date.parse(iso) : NaN;
        return Number.isNaN(ms) || !window.__clock ? null : window.__clock.stamp(ms);
      },
    }),
  /**
   * A run waiting on a person, as its sheet says it (toApprovalVM): what it reaches and by which rules, the words as
   * its first person reads them, and what approving does now -- by the business's clock, whose next open moment is
   * when approveRun would send it.
   */
  approval: (
    d: BroadcastDetailDto,
    playbook: Pick<PlaybookDto, "trigger" | "cap_per_run" | "gap_days" | "cadence_days"> | null,
    businessName: string,
    /** Whether the workspace is paused, from the page's own readiness (ChannelsReady.paused); null where it was not read. */
    paused: boolean | null,
  ) => {
    const clock = window.__clock;
    const now = Date.now();
    const open = clock ? clock.nextOpen(now) : { at: now, moved: false };
    return toApprovalVM(d, {
      // The playbook with what the workspace calls an appointment (the playbooks surface's shape; unread, the workspace
      // list's word).
      playbook: playbook
        ? {
            ...playbook,
            word: surfaceValue("playbooks")?.shape.word ?? visitWordHere(),
          }
        : null,
      businessName,
      paused,
      today: clock ? clock.dayKey(now) : new Date(now).toISOString().slice(0, 10),
      // The day it would send on (a visit's run made for today does not go on a later one: toApprovalVM says so, as approveRun does).
      open: {
        time: clock ? clock.time(open.at) : "",
        moved: open.moved,
        on: clock ? clock.dayKey(open.at) : new Date(open.at).toISOString().slice(0, 10),
      },
      day: (ymd) => (clock ? clock.dayWords(ymd) : ymd),
    });
  },
};

declare global {
  interface Window {
    __broadcasts?: typeof broadcasts;
  }
}

export function installBroadcasts(): void {
  window.__broadcasts = broadcasts;
}
