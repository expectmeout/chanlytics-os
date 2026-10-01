/**
 * What the page remembers between visits, per scope: the sort and the columns (`{ sortBy, sortDir, columns }`, and under
 * Leads the rail's list too), on this device and in the workspace (moved whole from legacy/pages/people.jsx, decision
 * 0015). The workspace's copy is saved one at a time (plViewSaver).
 */
import { saveView } from "../people-detail";

const PL_VIEW_KEYS: Record<string, string> = {
  people: "chanlytics-people-view",
  leads: "chanlytics-leads-view",
  pipeline: "chanlytics-pipeline-view",
};

const viewKeyOf = (scope: string): string => PL_VIEW_KEYS[scope] ?? "chanlytics-people-view";

/** This device's copy of a scope's view: `{}` where none was kept, or storage refuses. */
export const plLoadView = (scope: string): Record<string, unknown> => {
  try {
    const kept: unknown = JSON.parse(localStorage.getItem(viewKeyOf(scope)) || "{}");
    return { ...(kept as Record<string, unknown>) };
  } catch {
    return {};
  }
};

export const plSaveView = (scope: string, v: Record<string, unknown>): void => {
  try {
    localStorage.setItem(viewKeyOf(scope), JSON.stringify(v));
  } catch {
    /* private mode */
  }
};

/**
 * The workspace's copy of the view, one save at a time. Each save replaces the member's whole view (member_view_set), and
 * two in flight could land out of order and leave the older one on the row: while one is out, only the latest view waits,
 * and it goes when that one lands. A save that fails is tried once more, unless a newer view is waiting, which carries
 * every key anyway: a timeout dropped the last change.
 */
export const plViewSaver = (page: string): ((view: Record<string, unknown>, retried?: boolean) => void) => {
  let busy = false;
  let next: Record<string, unknown> | null = null;
  const push = (view: Record<string, unknown>, retried = false): void => {
    if (busy) {
      next = view;
      return;
    }
    busy = true;
    const landed = (r: { ok: boolean; message?: string } | undefined) => {
      busy = false;
      const waiting = next;
      next = null;
      if (waiting) push(waiting);
      else if (!(r && r.ok) && !retried) push(view, true);
      else if (!(r && r.ok)) console.error("people_view_not_saved", page, r && r.message);
    };
    saveView(page, view).then(landed, (e: { message?: string } | null) => landed({ ok: false, message: e?.message }));
  };
  return push;
};
