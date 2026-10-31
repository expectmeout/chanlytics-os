import "server-only";

/**
 * The doors of a lead's own receptionist's page (decision 0079), app/api/v1/previews/[token]/…: public by a deliberate
 * edit to the proxy's PUBLIC_PREFIXES, so they do not go through withRoute (there is no session to verify). What each
 * keeps instead, as /api/v1/signup does: the same-origin check every mutating route makes, a bucket per network in the
 * shared limiter (preview_ip; a call's own, preview_call_ip), a body read for what it is, the token as the only authority, and one envelope back.
 */
import { NextResponse } from "next/server";
import { AppError, err, ok } from "@chanlytics/contracts";
import { isSameOrigin } from "../request-guards";
import { takeRate, type RateBucket } from "../rate-limit";
import { hashKey, ipOf } from "../request-ip";
import { log } from "../log";

const PRIVATE = { "cache-control": "private, no-store", "x-robots-tag": "noindex, nofollow" } as const;
/** The most a body of these doors holds: a message, or a fact and what is right. */
const BODY_MAX_BYTES = 4096;

type Ctx = { params: Promise<{ token: string }> };

/** A body read as an object of fields, or an empty one: a field of the wrong kind is each door's to refuse. */
async function fieldsOf(req: Request): Promise<Record<string, unknown>> {
  const text = await req.text().catch(() => "");
  if (text.length > BODY_MAX_BYTES) throw new AppError("validation", "That is too long.", 413);
  try {
    const parsed: unknown = JSON.parse(text || "{}");
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * A door of the page: the knock, its bucket per network, then `run(token, body)`, whose answer is the envelope's. A door
 * that `spends` (a model's answer, the provider's minutes) is counted strictly, as route() counts a route that spends:
 * the shared count or a refusal, never one this instance alone would hold.
 */
export function previewRoute<T>(
  door: { bucket: Extract<RateBucket, "preview_ip" | "preview_call_ip">; spends: boolean },
  run: (token: string, body: Record<string, unknown>) => Promise<T>,
): (req: Request, ctx: Ctx) => Promise<Response> {
  return async (req, ctx) => {
    try {
      if (!isSameOrigin(req)) throw new AppError("forbidden", "This page's own buttons ask here.", 403);
      await takeRate(`ip:${hashKey(ipOf(req))}`, door.bucket, undefined, door.spends);
      const { token } = await ctx.params;
      return NextResponse.json(ok(await run(token, await fieldsOf(req))), { headers: PRIVATE });
    } catch (e) {
      if (e instanceof AppError)
        return NextResponse.json(err(e.code, e.message), { status: e.status, headers: PRIVATE });
      log.error("preview_route_failed", { error: e });
      return NextResponse.json(err("internal", "Something went wrong. Try again in a moment."), {
        status: 500,
        headers: PRIVATE,
      });
    }
  };
}
