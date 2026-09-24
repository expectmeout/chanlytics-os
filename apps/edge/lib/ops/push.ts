/**
 * The one way the edge reaches a phone: Expo's push service, which holds the
 * APNs and FCM credentials the app's builds registered (PR 3 of the phone app
 * plan). No key is needed to send; EXPO_ACCESS_TOKEN, when set, rides as a
 * bearer so only this deployment may send to this app's tokens.
 *
 * A receipt per message, in the messages' order, is the contract the job
 * stands on; a refusal or a dead wire throws with what happened, and the
 * ledger tries again (RETRY_WAITS_MS).
 */
import type { PushMessage } from "../packages/contracts.js";
import type { PushPort, PushReceipt } from "../packages/jobs.js";
import { env } from "../env.js";

export const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
/** Expo takes up to a hundred messages in one request. */
export const PUSH_BATCH = 100;
const TIMEOUT_MS = 10_000;

interface ExpoTicket {
  status: "ok" | "error";
  message?: string;
  details?: { error?: string };
}

export function expoPush(fetchImpl: typeof fetch = fetch): PushPort {
  return {
    async send(messages: PushMessage[]): Promise<PushReceipt[]> {
      const receipts: PushReceipt[] = [];
      for (let i = 0; i < messages.length; i += PUSH_BATCH) {
        const batch = messages.slice(i, i + PUSH_BATCH);
        const token = env.EXPO_ACCESS_TOKEN;
        const r = await fetchImpl(EXPO_PUSH_URL, {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(batch),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (!r.ok) {
          const detail = await r.text().catch(() => "");
          throw new Error(`push_rejected ${r.status} ${detail.slice(0, 200)}`.trim());
        }
        const { data } = (await r.json()) as { data?: ExpoTicket[] };
        batch.forEach((m, k) => {
          const t = data?.[k];
          receipts.push(
            t?.status === "ok"
              ? { to: m.to, status: "ok" }
              : { to: m.to, status: "error", error: t?.details?.error ?? t?.message ?? "unknown" },
          );
        });
      }
      return receipts;
    },
  };
}
