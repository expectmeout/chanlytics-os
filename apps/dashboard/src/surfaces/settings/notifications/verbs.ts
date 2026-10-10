/**
 * Settings › Notifications' verbs (decision 0040): the business's whole-config save, a member's phone choice, and a
 * test email. Only the pane imports them, so they load with it and not with the route every page loads (surface.ts,
 * the read, does).
 */
import type { PushKind } from "@chanlytics/contracts";
import { api } from "@/legacy-bridge/api";
import { saveSettings } from "@/legacy-bridge/inbox-verbs";
import { surfaceMoved } from "@/legacy-bridge/surface-status";
import { setSurfaceValue, surfaceValue } from "../../surface-values";

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
    const r = await api()("POST notifications/test", { body: {}, once: true });
    if (!r.ok) return { ok: false, sent: false, to: 0, why: null, message: r.message };
    return { ok: true, sent: r.data.sent, to: r.data.to, why: r.data.why, message: "" };
  },
};
