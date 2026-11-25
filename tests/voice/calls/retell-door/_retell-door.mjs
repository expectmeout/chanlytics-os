/**
 * The world the tests of retell-door/ share. Split by behaviour from retell-webhook-door.test.mjs on 25 Nov 2026 (layer
 * 14: a test file over 1,600 lines is two files); its header, as it was:
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 *
 */
/**
 * The voice webhook, run: a delivery signed the way Retell signs it, over a
 * database in memory, with the recording CDN, the mail transport and the
 * provider's live-call API answered by a captured fetch. Until 13 Sep 2026
 * this handler's text was pinned by thirteen assertions in twelve files and
 * nothing had ever called its POST.
 *
 * The door: a signature over the raw body opens it, one over the re-serialised
 * body opens it and is recorded as such, the ?key= never opens it (the
 * RETELL_FN_SECRET is set, and a refusal is a 401 that leaves ONE evidence row
 * a minute. Past the door: a call nobody's agent owns is dead-lettered under
 * the platform; a routed call is ingested, an inbound test call marks the
 * forwarded line verified, and every delivery leaves its row. The transcript
 * rides wherever the provider put it. The note waits for the summary, the
 * recording is copied on a budget -- and never again once stored, given up
 * on, or removed on schedule -- a stale replay writes nothing, a spoken
 * price is corrected once, a call back is handed to a person on the analysis
 * and on nothing earlier, and the analysis tells the owner once -- by bell,
 * and by mail only to a mailbox that is theirs. A read the database could not
 * make -- the channel row, the call's own row, the caller's tombstone -- and
 * an ingest it refused are each a 503 that keeps the delivery with the
 * provider, never a dead letter under the platform: Retell retries a non-2xx,
 * and the row is the gate that makes the retry land once.
 */
import { after } from "node:test";
import { at, openDoor, iso } from "../_retell-webhook-world.mjs";

// The door reads its keys at import; each test file is its own process, so
// this is the whole environment.
// openDoor() imports the handler AFTER these lines, on purpose.
process.env.RETELL_WEBHOOK_KEY = "badged-key-for-this-file";

process.env.RETELL_API_KEY = "api-key-for-this-file";

process.env.RETELL_FN_SECRET = "fn-secret-for-this-file";

process.env.RESEND_API_KEY = "re_test_only";

process.env.LEAD_TO = "ops@platform.test";

process.env.LEAD_FROM = "Pager <pager@platform.test>";

// No workspace is the environment's own, and the only database is the one handed in.
for (const k of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) delete process.env[k];

export const { setPg, knock, deliver, world } = await openDoor();

export const { WEBHOOK_COPY_TIMEOUT_MS, SWEEP_COPY_TIMEOUT_MS, RECORDING_MAX_ATTEMPTS } = await import(
  at("apps/edge/lib/voice/call-recording.ts")
);

after(() => setPg(null));

/**
 * The thread's live hold, as 00132's two doors keep it on the conversation row: a holder renews its own, a call never
 * takes one somebody else holds, and a release clears only the holder it names. `asked` is every claim and release, in
 * order, by the call that made it.
 */
export function threadHolds(tables) {
  const asked = [];
  const row = (a) => tables.conversations.find((c) => c.id === a.p_conversation_id && c.tenant_id === a.p_tenant_id);
  const sameHolder = (c, a) =>
    c.control_kind === a.p_kind && (c.control_by ?? null) === (a.p_by ?? null) && (c.control_ref ?? null) === a.p_ref;
  return {
    asked,
    rpcs: {
      claim_conversation_control: (a) => {
        asked.push(["claim", a.p_ref]);
        const c = row(a);
        if (!c) return "gone";
        const live = c.control_until != null && Date.parse(c.control_until) >= Date.now();
        const same = sameHolder(c, a);
        if (live && !same && a.p_kind !== "person") return "held";
        const until = iso(Date.now() + a.p_seconds * 1000);
        Object.assign(c, { control_kind: a.p_kind, control_by: a.p_by, control_ref: a.p_ref, control_until: until });
        return live && same ? "renewed" : "claimed";
      },
      release_conversation_control: (a) => {
        asked.push(["release", a.p_ref]);
        const c = row(a);
        if (!c || !sameHolder(c, a)) return false;
        Object.assign(c, { control_kind: null, control_by: null, control_ref: null, control_until: null });
        return true;
      },
    },
  };
}
