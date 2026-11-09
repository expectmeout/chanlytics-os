/**
 * The one way the edge reaches a browser (D12 of the answers canvas): the Web Push standard, signed with this deployment's VAPID
 * keys. Dormant until they are set: `webPush()` answers null, and a push job goes on telling phones as it did. A subscription a
 * browser has forgotten answers 404 or 410, and is handed back to be forgotten here too. One that fails otherwise is a miss, and
 * never fails the job: the bell and the mail still stand.
 */
import webpush from "web-push";
import type { WebPushPort } from "@chanlytics/jobs";
import { env } from "../shared/env.js";
import { logger } from "../shared/log.js";

/** A browser push is worth little after this: an hour later "Priya wrote" is old news. */
const TTL_SECONDS = 3600;
const TIMEOUT_MS = 10_000;

export function webPush(): WebPushPort | null {
  const publicKey = env.VAPID_PUBLIC_KEY;
  const privateKey = env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return null;
  const vapidDetails = { subject: env.VAPID_SUBJECT ?? "mailto:hello@chanlytics.com", publicKey, privateKey };
  return {
    async send(subscriptions, message) {
      const gone: string[] = [];
      const payload = JSON.stringify(message);
      await Promise.all(
        subscriptions.map(async (s) => {
          try {
            await webpush.sendNotification(
              { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
              payload,
              { TTL: TTL_SECONDS, timeout: TIMEOUT_MS, vapidDetails },
            );
          } catch (e) {
            const status = (e as { statusCode?: number }).statusCode;
            if (status === 404 || status === 410) gone.push(s.endpoint);
            else logger({}).warn("web_push_failed", { status: status ?? null });
          }
        }),
      );
      return gone;
    },
  };
}
