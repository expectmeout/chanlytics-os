import "server-only";

/**
 * Service-role territory (Blueprint §8): jobs scheduling and the pre-Gate-1b
 * Blob pause mirror. Tenant DATA writes never happen here — those run on the
 * session client so RLS enforces. This module cannot be imported client-side.
 */
import { createServiceClient } from "@chanlytics/db";
import type { Database } from "@chanlytics/db";
import type { SupabaseClient } from "@supabase/supabase-js";
import { scheduleJob, cancelJobsFor } from "@chanlytics/jobs";
import type { JobKind } from "@chanlytics/contracts";
import type { Json } from "@chanlytics/db";

let svc: SupabaseClient<Database> | null = null;
function serviceDb(): SupabaseClient<Database> {
  svc ??= createServiceClient({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  });
  return svc;
}

export async function schedule(
  tenantId: string,
  kind: JobKind,
  dueAt: Date,
  payload: Json,
): Promise<{ jobId: string }> {
  const { jobId } = await scheduleJob(serviceDb(), {
    tenantId, kind, dueAt, payload,
    qstashToken: process.env.QSTASH_TOKEN!,
  });
  return { jobId };
}

export async function cancelKindFor(
  tenantId: string,
  kind: JobKind,
  payloadKey: string,
  payloadValue: string,
): Promise<number> {
  return cancelJobsFor(serviceDb(), tenantId, kind, payloadKey, payloadValue, process.env.QSTASH_TOKEN);
}

/** Short-lived signed URL for a private media object (call recordings). */
export async function signedMediaUrl(storagePath: string, seconds = 300): Promise<string | null> {
  const { data, error } = await serviceDb().storage.from("media").createSignedUrl(storagePath, seconds);
  if (error) {
    console.error("signed_media_url_failed", error.message);
    return null;
  }
  return data?.signedUrl ?? null;
}

const EDGE_BASE = "https://chanlytics-messaging.vercel.app";

/**
 * Pre-Gate-1b bridge: the live bot reads pause state from Blob until the read
 * flip — a dashboard pause that doesn't reach Blob doesn't pause the bot
 * (the D10 incident). Fails LOUD: callers treat a mirror failure as a failed verb.
 */
export async function mirrorBlobPause(phoneE164: string, pausedUntilMs: number): Promise<void> {
  // Only the production dashboard owns the live bot's pause state; a preview
  // must never reach into the real Blob store.
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production") return;
  const r = await fetch(`${EDGE_BASE}/api/admin/pause`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-diag-key": process.env.DIAG_KEY! },
    body: JSON.stringify({ phone_digits: phoneE164.replace(/[^\d]/g, ""), paused_until_ms: pausedUntilMs }),
  });
  if (!r.ok) throw new Error(`blob pause mirror failed (${r.status})`);
}
