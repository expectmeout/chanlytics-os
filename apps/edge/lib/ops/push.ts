/**
 * The one way the edge reaches a phone: Expo's push service, which holds the
 * APNs and FCM credentials the app's builds registered (PR 3 of the phone app
 * plan). No key is needed to send; EXPO_ACCESS_TOKEN, when set, rides as a
 * bearer so only this deployment may send to this app's tokens.
 *
 * A ticket per message, in the messages' order, is the contract the job
 * stands on, and the receipts a quarter of an hour on (00189) are the second
 * door. A refusal or a dead wire before anything has left throws with what
 * happened, and the ledger tries again (RETRY_WAITS_MS); once a batch has
 * left, a later batch's failure is said in its receipts instead, because a
 * retry would tell the phones already told a second time.
 */
import type { PushMessage } from "../packages/contracts.js";
import type { PushPort, PushReceipt } from "../packages/jobs.js";
import { env } from "../env.js";
import { providerFetch, type ProviderReply } from "../packages/channels.js";

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

const refused = (batch: PushMessage[], why: string): PushReceipt[] =>
  batch.map((m) => ({ to: m.to, status: "error", error: why }));

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
    const r = await providerFetch(
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
    // No answer at all throws, as the bare fetch it replaces did: the batch's own catch says what it means.
    if (r.status === 0) throw new Error(r.error ?? "no answer");
    return r;
  };
  const text = (r: ProviderReply) => r.text;

  return {
    async send(messages: PushMessage[]): Promise<PushReceipt[]> {
      const receipts: PushReceipt[] = [];
      for (let i = 0; i < messages.length; i += PUSH_BATCH) {
        const batch = messages.slice(i, i + PUSH_BATCH);
        let r: ProviderReply;
        try {
          r = await post(EXPO_PUSH_URL, batch);
        } catch (e) {
          if (i === 0) throw e;
          receipts.push(...refused(messages.slice(i), `push_rejected ${e instanceof Error ? e.message : String(e)}`));
          break;
        }
        if (r.outcome === "ok") {
          receipts.push(...ticketsOf(batch, r.json as { data?: ExpoTicket[] }));
          continue;
        }
        const detail = text(r);
        const groups = r.status === 400 ? experienceGroups(detail) : [];
        if (groups.length) {
          // Tokens of more than one app in one request: the service refuses the whole batch, so each app's tokens go
          // in a request of their own. This app's get through; the others' are the service's to answer for, and a
          // phone whose token is not this app's is forgotten by its receipt like any other dead one.
          const grouped = new Set<string>();
          for (const g of groups) {
            const sub = batch.filter((m) => g.has(m.to));
            sub.forEach((m) => grouped.add(m.to));
            if (!sub.length) continue;
            const rr = await post(EXPO_PUSH_URL, sub).catch(() => null);
            if (rr?.outcome === "ok") receipts.push(...ticketsOf(sub, rr.json as { data?: ExpoTicket[] }));
            else receipts.push(...refused(sub, `push_rejected ${rr ? rr.status : "unreachable"}`));
          }
          receipts.push(
            ...refused(
              batch.filter((m) => !grouped.has(m.to)),
              "push_rejected 400",
            ),
          );
          continue;
        }
        const why = `push_rejected ${r.status} ${detail.slice(0, 200)}`.trim();
        if (i === 0) throw new Error(why);
        receipts.push(...refused(messages.slice(i), why));
        break;
      }
      return receipts;
    },
    async receipts(ids) {
      const out: Record<string, { status: "ok" | "error"; error?: string }> = {};
      for (let i = 0; i < ids.length; i += RECEIPTS_BATCH) {
        const batch = ids.slice(i, i + RECEIPTS_BATCH);
        const r = await post(EXPO_RECEIPTS_URL, { ids: batch });
        if (r.outcome !== "ok") {
          const detail = text(r);
          throw new Error(`push_receipts_rejected ${r.status} ${detail.slice(0, 200)}`.trim());
        }
        const { data } = (r.json ?? {}) as { data?: Record<string, ExpoReceipt> };
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
