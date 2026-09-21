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
import { REPLY_WINDOW_MS, broadcastFailureWords, noNumberWords, toApprovalVM, toRunReportVM, type BroadcastDetailDto, type PlaybookDto } from "@chanlytics/contracts";
import { api } from "./api";
import { broadcastsOverride } from "./surface-data";
import { refreshSurfaces } from "./surface-runner";

export interface SendBody {
  template_id: string;
  params: string[];
  audience: { kind: "everyone" | "list" | "saved"; id: string | null };
  scheduled_for?: string | null;
  name?: string | null;
}

/** Re-read the surface: for Ask's cards and anything else that changes a broadcast elsewhere. */
export async function refreshBroadcasts(): Promise<void> {
  api().forget();
  await refreshSurfaces([broadcastsOverride]);
}

export const broadcasts = {
  send: (body: SendBody) => api()("POST broadcasts", { body }),
  cancel: (id: string) => api()("POST broadcasts/[id]/cancel", { params: { id } }),
  /** A playbook's run that waited for a person goes out now. */
  approve: (id: string) => api()("POST broadcasts/[id]/approve", { params: { id } }),
  /** One broadcast and every person on it. A read: nothing refreshes. */
  detail: (id: string) => api()("GET broadcasts/[id]", { params: { id } }),
  /** Why a whole broadcast stopped, in the owner's words, for the detail, which reads the row as the route returns it. */
  failureWords: broadcastFailureWords,
  /** Why nobody on an audience can be sent it when somebody on it said yes -- no number to send to -- in People's words. */
  noNumberWords,
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
  approval: (d: BroadcastDetailDto, playbook: Pick<PlaybookDto, "trigger" | "cap_per_run" | "gap_days" | "cadence_days"> | null, businessName: string) => {
    const clock = window.__clock;
    const now = Date.now();
    const open = clock ? clock.nextOpen(now) : { at: now, moved: false };
    return toApprovalVM(d, {
      playbook,
      businessName,
      today: clock ? clock.dayKey(now) : new Date(now).toISOString().slice(0, 10),
      open: { time: clock ? clock.time(open.at) : "", moved: open.moved },
      day: (ymd) => (clock ? clock.dayWords(ymd) : ymd),
    });
  },
};

declare global {
  interface Window {
    __broadcasts?: typeof broadcasts;
    __refreshBroadcasts?: () => Promise<void>;
  }
}

export function installBroadcasts(): void {
  window.__broadcasts = broadcasts;
  window.__refreshBroadcasts = refreshBroadcasts;
}
