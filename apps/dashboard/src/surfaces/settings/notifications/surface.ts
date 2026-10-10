/**
 * What reaches this member's phones, for Settings › Notifications (decision 0040): their choices in this workspace and
 * their phones (`GET me/alerts`), read only where the pane is drawn (ROUTE_DRAWS names it for `admin/notifications`),
 * as Google's read is for Connections. The verbs save a choice and send a test.
 *
 * The value is the seam's (`useSurface("alerts")`): undefined until read, null when the read failed, so the pane draws
 * what it can without it (the email and the browser) and offers no phone tick.
 */
import type { MemberAlertsDto, PushKind } from "@chanlytics/contracts";
import { readAged, type SurfaceOverride } from "@/legacy-bridge/surface-data";
import { api, read } from "@/legacy-bridge/api";
import { saveSettings } from "@/legacy-bridge/inbox-verbs";
import { setSurfaceValue, surfaceValue } from "../../surface-values";
import { surfaceMoved } from "@/legacy-bridge/surface-status";

export interface AlertsSurface {
  dto: MemberAlertsDto;
  fetchedAt: number;
}

export const alertsOverride: SurfaceOverride = {
  key: "alerts",
  value: "alerts",
  onDemand: true,
  isStale: () => readAged(surfaceValue("alerts")?.fetchedAt),
  events: ["surface:alerts"],
  apply: async () => {
    try {
      const d = await read("GET me/alerts");
      setSurfaceValue("alerts", { dto: d, fetchedAt: Date.now() });
    } catch (e) {
      setSurfaceValue("alerts", null);
      throw e;
    }
  },
};

/** What a test came to: sent to how many, or why not; a refusal's own words where the route refused. The pane words it. */
interface AlertTestResult {
  ok: boolean;
  sent: boolean;
  to: number;
  why: "no_address" | "not_live" | "not_sent" | null;
  message: string;
}

export const alertVerbs = {
  /** The whole-config save the business's addresses and email choices go through (a test stands its own in). */
  saveConfig: saveSettings,
  /**
   * Save the kinds this member's phones are not told, and publish the answer at once: the pane's tick is the answer's,
   * so nothing is read again (refresh-map.ts REFRESHES_NOTHING).
   */
  async setPushOff(kinds: readonly PushKind[]): Promise<{ ok: boolean; message: string }> {
    const r = await api()("PUT me/alerts", { body: { push_off: [...kinds] } });
    if (!r.ok) return { ok: false, message: r.message };
    const held = surfaceValue("alerts");
    if (held) {
      setSurfaceValue("alerts", { ...held, dto: { ...held.dto, push_off: r.data.push_off } });
      surfaceMoved("alerts");
    }
    return { ok: true, message: "" };
  },
  /** Email every alert address once: what came of it, which the pane says in contracts' words. */
  async test(): Promise<AlertTestResult> {
    const r = await api()("POST notifications/test", { body: {} });
    if (!r.ok) return { ok: false, sent: false, to: 0, why: null, message: r.message };
    return { ok: true, sent: r.data.sent, to: r.data.to, why: r.data.why, message: "" };
  },
};
