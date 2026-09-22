/**
 * The owner's own reply, arriving twice -- on a real database.
 *
 * When a business owner answers from the WhatsApp Business app, Meta sends us
 * the echo and the receptionist stands down for the workspace's pause window.
 * Meta also redelivers a webhook it could not deliver, for up to seven days.
 * The pause used to be written BEFORE the message insert could say whether the
 * echo was new, so each redelivery moved `paused_until` another whole window
 * out and the receptionist stayed silent for longer than anyone chose.
 *
 * What makes the second delivery knowable is a unique index -- one wamid, one
 * row -- and an upsert that really does update on conflict. Neither exists in
 * an in-memory double, which is why this lives here and not beside the door.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite writes customers"
      : false;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const { recordEchoAndPause } = await import(pathToFileURL(path.join(ROOT, "packages/db/dist/index.js")).href);

let db;
let tenantId;
const stamp = Date.now().toString(36);
/** Digits, as the door hands them over: Meta reports a number without its plus. */
const CUSTOMER = `1646555${String(Date.now() % 10000).padStart(4, "0")}`;

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  const { data, error } = await db
    .from("tenants")
    .insert({ slug: `echo-replay-${stamp}`, name: "echo-replay" })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  tenantId = data.id;
});

after(async () => {
  if (skip) return;
  if (tenantId) await db.from("tenants").delete().eq("id", tenantId);
});

const threadOf = async () => {
  const { data } = await db.from("conversations").select("id, state, paused_until").eq("tenant_id", tenantId).single();
  return data;
};

test(
  "REGRESSION: a redelivered echo is the same words arriving twice, not a second reason to mute the receptionist",
  { skip },
  async () => {
    const echo = (pausedUntilIso) =>
      recordEchoAndPause(db, {
        tenantId,
        customerPhoneDigits: CUSTOMER,
        body: "On my way.",
        externalId: `wamid.echo.${stamp}`,
        pausedUntilIso,
      });

    const first = new Date(Date.now() + 6 * 3_600_000).toISOString();
    await echo(first);
    const opened = await threadOf();
    assert.equal(opened.state, "needs_human");
    assert.equal(
      Date.parse(opened.paused_until),
      Date.parse(first),
      "the owner spoke, so the receptionist stands down for their window",
    );

    // Meta, redelivering. The pause it carries is a fresh one, computed at the
    // moment of THIS delivery -- which is exactly what must not be written.
    const later = new Date(Date.now() + 6 * 3_600_000 + 90_000).toISOString();
    await echo(later);
    const after_ = await threadOf();
    assert.equal(
      Date.parse(after_.paused_until),
      Date.parse(opened.paused_until),
      "the same pause: a redelivery is not a second time the owner spoke",
    );

    const { count } = await db
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("external_id", `wamid.echo.${stamp}`);
    assert.equal(count, 1, "and one wamid is one row, which is what told us it was a redelivery");
  },
);

test(
  "an echo with no id of its own still pauses: its own replay cannot be told apart, and a receptionist talking over the owner is the worse failure",
  { skip },
  async () => {
    const other = `1646555${String((Date.now() + 7777) % 10000).padStart(4, "0")}`;
    const at = (ms) => new Date(Date.now() + ms).toISOString();
    await recordEchoAndPause(db, {
      tenantId,
      customerPhoneDigits: other,
      body: "Anonymous echo.",
      externalId: null,
      pausedUntilIso: at(3_600_000),
    });
    const second = at(7_200_000);
    await recordEchoAndPause(db, {
      tenantId,
      customerPhoneDigits: other,
      body: "Anonymous echo.",
      externalId: null,
      pausedUntilIso: second,
    });
    const { data: contact } = await db
      .from("contacts")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("phone_e164", `+${other}`)
      .single();
    const { data: thread } = await db
      .from("conversations")
      .select("paused_until")
      .eq("tenant_id", tenantId)
      .eq("contact_id", contact.id)
      .single();
    assert.equal(
      Date.parse(thread.paused_until),
      Date.parse(second),
      "nothing here can say 'seen it', so the receptionist stays down",
    );
  },
);
