/**
 * The SurfaceData seam (Blueprint v3.0, Slice 0 exit criterion).
 *
 * Contract: every mockup surface reads seeded window globals by default. A
 * slice flips ONE surface to real data by registering an override that
 * (1) fetches from /api/v1, (2) maps rows into the surface's viewmodel and
 * writes the SAME window globals the surface already reads, (3) dispatches the
 * mockup's own window events so mounted components re-render. Sibling surfaces
 * keep their seeds untouched. Overrides live HERE and in contracts viewmodels —
 * never inside legacy page files (the modularity rule).
 */

export interface SurfaceOverride {
  /** Surface key, matching the slice that owns it (e.g. "conversations"). */
  key: string;
  /** Fetch real data and write it into the surface's window globals. */
  apply: () => Promise<void>;
  /** Mockup events to dispatch after apply so mounted components re-render. */
  events?: string[];
}

const live = new Set<string>();

export async function activateOverride(o: SurfaceOverride): Promise<boolean> {
  try {
    await o.apply();
    for (const e of o.events ?? []) window.dispatchEvent(new CustomEvent(e));
    live.add(o.key);
    return true;
  } catch (err) {
    // A failed override NEVER breaks the surface — it just stays seeded.
    console.error("surface_override_failed", o.key, err instanceof Error ? err.message : err);
    return false;
  }
}

export const isLive = (key: string) => live.has(key);

/**
 * First consumer: the real workspace (RLS-scoped tenants via /api/v1/workspaces).
 * Stashes the result for the bridge pill; Slice 1's conversations override
 * follows this exact fetch→map→dispatch pattern against CONVERSATIONS_DATA.
 */
export interface Workspace { id: string; slug: string; name: string; status: string; timezone: string }

export const workspaceOverride: SurfaceOverride & { current: () => Workspace | null } = {
  key: "workspace",
  current: () => (window as unknown as { __WORKSPACES?: Workspace[] }).__WORKSPACES?.[0] ?? null,
  apply: async () => {
    const res = await fetch("/api/v1/workspaces");
    const j = (await res.json()) as { ok: boolean; data?: { workspaces: Workspace[] } };
    if (!j.ok || !j.data) throw new Error("workspaces fetch failed");
    (window as unknown as { __WORKSPACES?: Workspace[] }).__WORKSPACES = j.data.workspaces;
  },
};
