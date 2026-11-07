/**
 * The one way the edge reaches a phone: Expo's push service, which holds the
 * APNs and FCM credentials the app's builds registered (PR 3 of the phone app
 * plan). No key is needed to send; EXPO_ACCESS_TOKEN, when set, rides as a
 * bearer so only this deployment may send to this app's tokens.
 *
 * A ticket per message, in the messages' order, is the contract the job
 * stands on, and the receipts a quarter of an hour on (00189) are the second
 * door. A first batch the service provably did not take (it refused it, said
 * "not now", or the connection never opened: providerFetch's `refused` and
 * `retryable`) throws with what happened, and the ledger tries again
 * (RETRY_WAITS_MS). One that MAY have been taken (a timeout, a connection
 * dropped after the request left, a 5xx: `unknown`) is never thrown: a retry
 * would tell the phones a second time, so it is said in the receipts and
 * logged, as a later batch's failure always was once a batch had left.
 *
 * Messages go a hundred to a request (PUSH_BATCH) and receipts a thousand (RECEIPTS_BATCH). A refused batch whose tokens
 * belong to more than one app (PUSH_TOO_MANY_EXPERIENCE_IDS) is sent again, one request per app: this app's tokens get
 * through, and a phone whose token is another app's is forgotten by its receipt like any other dead one.
 */
import type { PushMessage } from "@chanlytics/contracts";
import type { PushPort, PushReceipt } from "@chanlytics/jobs";
import { env } from "../shared/env.js";
import { logger } from "../shared/log.js";
import { fetchFromProvider, type ProviderReply } from "@chanlytics/channels/shared";

export const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
export const EXPO_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";
/** Expo answers up to a thousand receipts in one request. */
export const RECEIPTS_BATCH = 1000;
/** Expo takes up to a hundred messages in one request. */
export const PUSH_BATCH = 100;
const TIMEOUT_MS = 10_000;

interface ExpoTicket {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
}
type ExpoReceipt = Omit<ExpoTicket, "id">;

/** The tickets of one batch, one per message in the batch's order. */
function ticketsOf(batch: PushMessage[], body: { data?: ExpoTicket[] }): PushReceipt[] {
  return batch.map((m, k) => {
    const t = body.data?.[k];
    return t?.status === "ok"
      ? { to: m.to, status: "ok", ...(t.id ? { id: t.id } : {}) }
      : { to: m.to, status: "error", error: t?.details?.error ?? t?.message ?? "unknown" };
  });
}

const refused = (batch: PushMessage[], reason: string): PushReceipt[] =>
  batch.map((m) => ({ to: m.to, status: "error", error: reason }));

/**
 * The apps a refused batch's tokens belong to, when the service says there was more than one
 * (PUSH_TOO_MANY_EXPERIENCE_IDS: `details` names each app's tokens). One app's tokens are no groups.
 */
function experienceGroups(detail: string): Set<string>[] {
  try {
    const body = JSON.parse(detail) as { errors?: { details?: unknown }[] };
    const groups: Set<string>[] = [];
    for (const e of body.errors ?? []) {
      if (!e.details || typeof e.details !== "object") continue;
      for (const tokens of Object.values(e.details as Record<string, unknown>)) {
        if (Array.isArray(tokens) && tokens.every((t) => typeof t === "string")) groups.push(new Set(tokens));
      }
    }
    return groups.length > 1 ? groups : [];
  } catch {
    return [];
  }
}

export function expoPush(fetchImpl: typeof fetch = fetch): PushPort {
  const post = async (url: string, body: unknown): Promise<ProviderReply> => {
    const token = env.EXPO_ACCESS_TOKEN;
    const item = await fetchFromProvider(
      "expo",
      url,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
        timeoutMs: TIMEOUT_MS,
      },
      { fetch: fetchImpl },
    );
    return item;
  };
  const text = (r: ProviderReply) => r.text;

  return {
    async send(messages: PushMessage[]): Promise<PushReceipt[]> {
      const receipts: PushReceipt[] = [];
      for (let index = 0; index < messages.length; index += PUSH_BATCH) {
        const batch = messages.slice(index, index + PUSH_BATCH);
        const result = await post(EXPO_PUSH_URL, batch);
        if (result.outcome === "ok") {
          receipts.push(...ticketsOf(batch, result.json as { data?: ExpoTicket[] }));
          continue;
        }
        if (result.outcome === "unknown") {
          // It may have been taken (defect 50): the phones may be told already, so nothing here asks again, and the
          // rest are not sent either. Said in the receipts and on the log; the ledger records the job done.
          const otherReason = `push_outcome_unknown ${result.status || result.error || "no answer"}`;
          logger().warn("push_outcome_unknown", {
            batch: index / PUSH_BATCH,
            messages: messages.length - index,
            why: otherReason,
          });
          receipts.push(...refused(messages.slice(index), otherReason));
          break;
        }
        if (result.status === 0) {
          // Provably not taken: the connection never opened, or this provider's breaker held the call.
          const otherReason = `push_rejected ${result.error ?? "no answer"}`;
          if (index === 0) throw new Error(otherReason);
          receipts.push(...refused(messages.slice(index), otherReason));
          break;
        }
        const detail = text(result);
        const groups = result.status === 400 ? experienceGroups(detail) : [];
        if (groups.length) {
          // Tokens of more than one app in one request: the service refuses the whole batch, so each app's tokens go
          // in a request of their own. This app's get through; the others' are the service's to answer for, and a
          // phone whose token is not this app's is forgotten by its receipt like any other dead one.
          const grouped = new Set<string>();
          for (const g of groups) {
            const sub = batch.filter((m) => g.has(m.to));
            sub.forEach((m) => grouped.add(m.to));
            if (!sub.length) continue;
            const rr = await post(EXPO_PUSH_URL, sub);
            if (rr.outcome === "ok") receipts.push(...ticketsOf(sub, rr.json as { data?: ExpoTicket[] }));
            else receipts.push(...refused(sub, `push_rejected ${rr.status || "unreachable"}`));
          }
          receipts.push(
            ...refused(
              batch.filter((m) => !grouped.has(m.to)),
              "push_rejected 400",
            ),
          );
          continue;
        }
        const reason = `push_rejected ${result.status} ${detail.slice(0, 200)}`.trim();
        if (index === 0) throw new Error(reason);
        receipts.push(...refused(messages.slice(index), reason));
        break;
      }
      return receipts;
    },
    async receipts(ids) {
      const out: Record<string, { status: "ok" | "error"; error?: string }> = {};
      for (let index = 0; index < ids.length; index += RECEIPTS_BATCH) {
        const batch = ids.slice(index, index + RECEIPTS_BATCH);
        const result = await post(EXPO_RECEIPTS_URL, { ids: batch });
        if (result.outcome !== "ok") {
          const detail = text(result);
          throw new Error(`push_receipts_rejected ${result.status || result.error} ${detail.slice(0, 200)}`.trim());
        }
        const { data } = (result.json ?? {}) as { data?: Record<string, ExpoReceipt> };
        for (const [id, rc] of Object.entries(data ?? {})) {
          out[id] =
            rc.status === "ok"
              ? { status: "ok" }
              : { status: "error", error: rc.details?.error ?? rc.message ?? "unknown" };
        }
      }
      return out;
    },
  };
}
