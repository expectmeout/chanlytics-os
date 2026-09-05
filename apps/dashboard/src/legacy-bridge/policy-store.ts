/**
 * The workspace policy matrix, on the mockup's own store interface.
 *
 * The mockup keeps its charter in `window.POLICY` — rows, modes, `modeOf(id)`,
 * `set(id, mode)` — and three surfaces read it: the Settings matrix, the
 * policy chip beside every approval in the Inbox and Today, and Fleet. Rather
 * than teach each reader about the API, this installs a store with the SAME
 * interface that answers from `window.__POLICIES` (fed by the settings
 * override) and from the seeded store only in the standalone mockup. One
 * swap, every reader truthful.
 *
 * `window.__POLICIES` has three states, and the store treats each as its own:
 *   undefined  the bridge is not running — the standalone mockup, seeds are right
 *   null       the bridge ran and the read FAILED — no modes, never the seeds
 *   object     the workspace's real rows
 *
 * Honesty rule for the rows: the runtime consults exactly one class today —
 * `reply` — and `money` is locked by a database trigger. The other four are
 * stored but not enforced, and the rows say so; only a class with an
 * enforcer is offered as a switch.
 */

export type UiMode = "Auto" | "Veto" | "Ask" | "Never";
export const UI_MODES: readonly UiMode[] = ["Auto", "Veto", "Ask", "Never"];

export interface UiRowMeta {
  /** The mockup's id (the chip callers use these). */
  id: string;
  /** The policies.class it maps to. */
  cls: string;
  label: string;
  note: string;
  chip: string;
  locked?: boolean;
  /** True only where the runtime actually consults the class. */
  enforced: boolean;
}

export const UI_ROWS: readonly UiRowMeta[] = [
  { id: "reply", cls: "reply", label: "Replies to customers", note: "every text the receptionist sends", chip: "Replies", enforced: true },
  { id: "faq", cls: "faq", label: "Service & pricing questions", note: "answered from your business profile", chip: "FAQs", enforced: false },
  { id: "book", cls: "booking", label: "Book · reschedule", note: "sends your booking link", chip: "Booking", enforced: false },
  { id: "reengage", cls: "reengage", label: "Re-engage quiet customers", note: "nothing sends yet", chip: "Re-engage", enforced: false },
  { id: "campaign", cls: "campaign", label: "Standing offers", note: "nothing sends yet", chip: "Campaigns", enforced: false },
  { id: "money", cls: "money", label: "Refunds · rates · negotiation", note: "always goes to you", chip: "Money", locked: true, enforced: true },
];

export interface PolicyRecordLike {
  class: string;
  mode: string;
  limits?: Record<string, unknown> | null;
}

/** What the settings override publishes as `window.__POLICIES`. */
export interface PoliciesSurface {
  rows: PolicyRecordLike[];
  role: string | null;
}

export interface UiRow extends UiRowMeta {
  /** The stored mode as the UI spells it; null when no row exists. Money is
   *  always Never: the trigger makes anything else impossible. */
  mode: UiMode | null;
  limits: Record<string, unknown>;
}

const LABELS: Record<string, UiMode> = { auto: "Auto", veto: "Veto", ask: "Ask", never: "Never" };
const EMPTY: PoliciesSurface = { rows: [], role: null };

export function modeLabel(dbMode: string | null | undefined): UiMode | null {
  return dbMode ? LABELS[dbMode] ?? null : null;
}

export function dbMode(label: string | null | undefined): string | null {
  if (!label) return null;
  const hit = Object.entries(LABELS).find(([, v]) => v === label);
  return hit ? hit[0] : null;
}

export function uiRows(p: PoliciesSurface): UiRow[] {
  return UI_ROWS.map((r) => {
    const rec = p.rows.find((x) => x.class === r.cls);
    return {
      ...r,
      mode: r.locked ? "Never" : modeLabel(rec?.mode),
      limits: (rec?.limits as Record<string, unknown> | null | undefined) ?? {},
    };
  });
}

interface SeedStore {
  MODES: readonly string[];
  ROWS: unknown[];
  forPerm?: Record<string, string>;
  row?: (id: string) => unknown;
  modeOf: (id: string) => string | null;
  set: (id: string, m: string) => void;
}

interface PolicyWindow {
  POLICY?: SeedStore;
  __POLICIES?: PoliciesSurface | null;
  __setPolicy?: (cls: string, mode: string, replyDelayMs?: number, minConfidence?: number) => Promise<unknown>;
}

/**
 * Replace the seeded store with one that answers from real data. Called once
 * at bridge boot, after the manifest has installed the seeds and before React
 * renders.
 */
export function installPolicyStore(win: PolicyWindow = window as unknown as PolicyWindow): void {
  const seed = win.POLICY;
  const surface = (): PoliciesSurface | null | undefined => win.__POLICIES;
  const store = {
    get MODES(): readonly string[] {
      return surface() === undefined ? seed?.MODES ?? UI_MODES : UI_MODES;
    },
    get ROWS(): unknown[] {
      const s = surface();
      if (s === undefined) return seed?.ROWS ?? [];
      return uiRows(s ?? EMPTY);
    },
    forPerm: seed?.forPerm ?? { booking: "book", money: "money", discount: "money", winback: "reengage", scope: "faq" },
    row(id: string): unknown {
      return (this.ROWS as { id: string }[]).find((r) => r.id === id) ?? null;
    },
    modeOf(id: string): string | null {
      const s = surface();
      if (s === undefined) return seed ? seed.modeOf(id) : null;
      // A failed read has no modes. A chip with nothing after the dot is the
      // truth; a chip reading the mockup's "Veto" beside a real approval is not.
      return uiRows(s ?? EMPTY).find((r) => r.id === id)?.mode ?? null;
    },
    set(id: string, m: string): void {
      const s = surface();
      if (s === undefined) {
        seed?.set(id, m);
        return;
      }
      if (!s) return; // the read failed; there is nothing to write against
      const r = UI_ROWS.find((x) => x.id === id);
      const mode = dbMode(m);
      if (!r || r.locked || !r.enforced || !mode || !win.__setPolicy) return;
      void win.__setPolicy(r.cls, mode);
    },
    /** True when the store answers from the workspace's real rows. */
    real(): boolean {
      return !!surface();
    },
  };
  win.POLICY = store as unknown as SeedStore;
}
