/**
 * WhatsApp's door: a signature checked before anything is read, what a caption keeps, the account's own news routed
 * by its WABA, a number's standing, a cost the database refuses, and a workspace that never chose its hours.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { pauseMsOf } from "@chanlytics/contracts";
import {
  GREETING,
  HELD,
  IngestFailed,
  MAIL,
  PLATFORM,
  PORTFOLIO,
  answer,
  at,
  deliver,
  handshake,
  keeper,
  kind,
  knock,
  listening,
  nameNotice,
  now,
  partnerNotice,
  readWorld,
  receptionist,
  runAnswers,
  sign,
  text,
  wire,
  withEnv,
  world,
} from "./_door.mjs";

/* -------------------------------------------------------------- the door */

test("the door: no app secret and a wrong signature are each a 401 that reads nothing, and only the bytes Meta signed open it", async () => {
  const w = world();
  const db = w.open();
  const seen = receptionist();
  const raw = JSON.stringify(
    w.change({ messages: [text(w.customer(), `wamid.${w.i}.door`, "hi, do you take walk-ins?")] }),
  );
  await listening(async (log) => {
    // A missing secret is a configuration error, never a check skipped: even
    // the right signature is refused while the door has nothing to check it with.
    for (const secret of [undefined, ""]) {
      await withEnv({ META_APP_SECRET: secret }, async () => {
        const res = await knock(raw, { "x-hub-signature-256": sign(raw, "meta-app-secret-for-this-file") });
        assert.deepEqual(
          await answer(res),
          [401, { ok: false, error: "bad_signature" }],
          `META_APP_SECRET ${JSON.stringify(secret)}`,
        );
      });
    }
    assert.equal(log.said("wa_missing_app_secret").length, 2, "and it says so where an operator looks");

    const reserialised = JSON.stringify(JSON.parse(raw), null, 2);
    for (const [headers, why] of [
      [{}, "no signature at all"],
      [{ "x-hub-signature-256": sign(raw, "another-apps-secret") }, "another app's secret"],
      [{ "x-hub-signature-256": sign(reserialised) }, "the same JSON serialised again: Meta signs the bytes it sent"],
      [{ "x-hub-signature-256": sign(raw).slice("sha256=".length) }, "the digest without its prefix"],
      [{ "x-hub-signature-256": `sha256=${"0".repeat(64)}` }, "a guess of the right length"],
    ]) {
      assert.deepEqual(await answer(await knock(raw, headers)), [401, { ok: false, error: "bad_signature" }], why);
    }
    assert.equal(db.seen.length, 0, "not one row read before the signature holds");
    assert.deepEqual([seen.ingested, seen.sent], [[], []], "and nobody's receptionist ran");

    // A signed body that is not JSON carries nothing to route: acknowledged, kept as every proven delivery is (00336),
    // and nothing read.
    assert.deepEqual(await answer(await knock("{ not json")), [200, { ok: true }]);
    assert.deepEqual(
      db.seen.map((q) => [q.table, q.op]),
      [["provider_events", "upsert"]],
      "the delivery is kept, and nothing else is touched",
    );

    // The same bytes, signed with the secret, open it: the refusals above were the signature's doing.
    assert.deepEqual(await answer(await knock(raw)), [200, { ok: true }]);
    assert.equal(seen.sent.length, 0, "nobody is answered in the door");
    await runAnswers(w, db);
    assert.equal(seen.sent.length, 1, "its job answers");
  });
});

test("the handshake: the verify token echoes Meta's challenge, and anything else is a 403", async () => {
  const token = process.env.WHATSAPP_VERIFY_TOKEN;
  const ok = await handshake({ "hub.mode": "subscribe", "hub.verify_token": token, "hub.challenge": "1158201444" });
  assert.deepEqual([ok.status, await ok.text()], [200, "1158201444"]);
  for (const [params, why] of [
    [{ "hub.mode": "subscribe", "hub.verify_token": "not-the-token", "hub.challenge": "1" }, "the wrong token"],
    [{ "hub.mode": "unsubscribe", "hub.verify_token": token, "hub.challenge": "1" }, "not a subscription"],
    [{ "hub.verify_token": token, "hub.challenge": "1" }, "no mode"],
    [{ "hub.mode": "subscribe", "hub.challenge": "1" }, "no token"],
  ]) {
    const res = await handshake(params);
    assert.deepEqual([res.status, await res.text()], [403, "verification failed"], why);
  }
  // With no token configured, a knock that sends none matches nothing either.
  await withEnv({ WHATSAPP_VERIFY_TOKEN: undefined }, async () => {
    const res = await handshake({ "hub.mode": "subscribe", "hub.challenge": "1" });
    assert.equal(res.status, 403);
  });
});

/* ----------------------------------------------------------- the routing */

test("a routed number runs its own workspace's receptionist: the channel the database named, the workspace's record, the workspace's wire", async () => {
  const w = world();
  const db = w.open();
  const seen = receptionist();
  const from = w.customer();
  const id = `wamid.${w.i}.routed`;
  await listening(async (log) => {
    const res = await deliver(
      w.change({
        contacts: [{ wa_id: from, profile: { name: "Dana" } }],
        messages: [text(from, id, "hi, do you have time tomorrow?")],
      }),
    );
    assert.deepEqual(await answer(res), [200, { ok: true }]);
    assert.deepEqual(seen.sent, [], "nobody is answered in Meta's request");
    await runAnswers(w, db);

    assert.deepEqual(
      db.seen.filter((q) => q.table === "tenant_channels").map((q) => q.filters),
      [
        [
          ["eq", "kind", "whatsapp"],
          ["eq", "external_id", w.PHONE_ID],
        ],
      ],
      "one read, by the provider's id for this number",
    );
    const named = {
      channelId: `ch-${w.i}`,
      tenantId: w.T,
      kind: "whatsapp",
      externalId: w.PHONE_ID,
      numberE164: w.LINE,
      credentialsRef: null,
      config: {},
    };
    assert.deepEqual(
      seen.runtimes,
      [named, named],
      "the runtime is loaded for the channel the database named, at the door and in its job",
    );
    assert.deepEqual(
      seen.ingested,
      [
        { tenantId: w.T, body: "hi, do you have time tomorrow?" },
        { tenantId: w.T, body: "hi, do you have time tomorrow?" },
      ],
      "recorded under the workspace the number belongs to, and taken up again by its job",
    );
    assert.deepEqual(
      seen.wires,
      [{ phoneId: w.PHONE_ID, accessToken: `token-${w.T}` }],
      "the wire is bound to that workspace's own number and token",
    );
    assert.deepEqual(
      seen.sent,
      [{ tenantId: w.T, to: from, body: GREETING, meta: { ack: true, fallback: "no_model" } }],
      "and that workspace's greeting left for the customer who wrote",
    );
    assert.equal(kind(w.tables, "ingest.unroutable").length, 0);

    const [line] = log.said("wa_inbound");
    assert.deepEqual(line.fields, { from_tail: from.slice(-4), type: "text", id }, "a tail, a type and an id");
    assert.ok(!line.args.join(" ").includes(from), "never the number");
  });
});

test("an image captioned with an address keeps nothing, and the same words typed keep it: a caption is not an answer", async () => {
  const w = world();
  const db = w.open();
  const seen = receptionist();
  const from = w.customer();
  const words = "my email is ana@example.com";
  await listening(async () => {
    const captioned = await deliver(
      w.change({
        contacts: [{ wa_id: from, profile: { name: "Dana" } }],
        messages: [
          {
            from,
            id: `wamid.${w.i}.captioned`,
            timestamp: now(),
            type: "image",
            image: { id: `media-${w.i}`, mime_type: "image/jpeg", caption: words },
          },
        ],
      }),
    );
    assert.deepEqual(await answer(captioned), [200, { ok: true }]);
    await runAnswers(w, db);
    assert.deepEqual(seen.emails, [], "a caption is not an answer");

    const typed = await deliver(
      w.change({
        contacts: [{ wa_id: from, profile: { name: "Dana" } }],
        messages: [text(from, `wamid.${w.i}.typed`, words)],
      }),
    );
    assert.deepEqual(await answer(typed), [200, { ok: true }]);
    await runAnswers(w, db);
    assert.deepEqual(seen.emails, ["ana@example.com"], "the same words typed are the customer's own");
  });
});

test("a number the database answers is not ours: dead-lettered under the platform, the platform told once a window, 200, and no receptionist runs", async () => {
  const w = world();
  w.tables.tenant_channels[0].status = "disabled";
  w.open();
  const seen = receptionist();
  const line = wire();
  try {
    await withEnv(MAIL, () =>
      listening(async (log) => {
        const off = await deliver(
          w.change({
            messages: [
              text(w.customer(), `wamid.${w.i}.off1`, "hello?"),
              text(w.customer(), `wamid.${w.i}.off2`, "anyone there?"),
            ],
          }),
        );
        assert.deepEqual(
          await answer(off),
          [200, { ok: true }],
          "a switched-off channel is a decision; Meta retrying it would change nothing",
        );
        const never = await deliver(
          w.change({ messages: [text(w.customer(), `wamid.${w.i}.never`, "hi")] }, { phoneId: w.stranger }),
        );
        assert.deepEqual(await answer(never), [200, { ok: true }], "and so is a number no row names");

        assert.deepEqual(
          kind(w.tables, "ingest.unroutable").map((e) => [
            e.tenant_id,
            e.category,
            e.subject_type,
            e.subject_id,
            e.data,
          ]),
          [
            [PLATFORM, "ingest", null, null, { channel: "whatsapp", phone_number_id: w.PHONE_ID }],
            [PLATFORM, "ingest", null, null, { channel: "whatsapp", phone_number_id: w.stranger }],
          ],
          "kept where a count can find it, under nobody's workspace",
        );

        const mail = line.mail();
        assert.equal(mail.length, 2, "one note per number");
        for (const [m, key, count] of [
          [mail[0], w.PHONE_ID, 2],
          [mail[1], w.stranger, 1],
        ]) {
          assert.equal(m.subject, "WhatsApp messages are arriving for a channel that is switched off");
          assert.deepEqual([m.from, m.to], [MAIL.LEAD_FROM, [MAIL.LEAD_TO]], "the platform's own mailbox");
          assert.ok(m.text.startsWith(`${count} message(s) just arrived for phone_number_id ${key},`), m.text);
        }
        assert.ok(
          !mail.some((m) => /hello\?|anyone there|1646555/.test(m.text)),
          "a count and an id: no customer and no words",
        );

        assert.deepEqual(
          [seen.runtimes, seen.ingested, seen.sent],
          [[], [], []],
          "nobody's receptionist ran and nothing was recorded for a workspace",
        );
        assert.equal(w.tables.notifications.length, 0, "there is no workspace whose bell could ring");
        assert.deepEqual(
          log.said("wa_skip_unroutable").map((l) => l.fields),
          [
            { phone_number_id: w.PHONE_ID, messages: 2 },
            { phone_number_id: w.stranger, messages: 1 },
          ],
        );
        // The routing's own line, said before the plan's: the number's id, never who wrote. Its name is the contract
        // (edge/log-envelope.test.mjs), read there from the intake's text until 26 Nov 2026.
        assert.deepEqual(
          log.said("wa_unroutable").map((l) => [l.stream, l.fields]),
          [
            ["error", { phone_number_id: w.PHONE_ID }],
            ["error", { phone_number_id: w.stranger }],
          ],
        );

        // More traffic inside the window: kept again, and nobody is mailed again.
        assert.equal(
          (await deliver(w.change({ messages: [text(w.customer(), `wamid.${w.i}.off3`, "hello??")] }))).status,
          200,
        );
        assert.equal(kind(w.tables, "ingest.unroutable").length, 3, "every delivery is kept");
        assert.equal(line.mail().length, 2, "but the note is not repeated inside fifteen minutes");
      }),
    );
  } finally {
    line.restore();
  }
});

test("a number the database could not answer for is not acknowledged: 503 with the count, the platform told the control plane is unreadable, nothing handled, and Meta's redelivery lands once the read works", async () => {
  const w = world();
  w.open({ "tenant_channels.select": { message: "connection terminated unexpectedly" } });
  const seen = receptionist();
  const line = wire();
  const body = w.change({
    messages: [
      text(w.customer(), `wamid.${w.i}.blip1`, "hi"),
      text(w.customer(), `wamid.${w.i}.blip2`, "are you open?"),
    ],
  });
  try {
    await withEnv(MAIL, () =>
      listening(async (log) => {
        assert.deepEqual(
          await answer(await deliver(body)),
          [503, { ok: false, unrecorded: 2 }],
          "not acknowledged, so Meta redelivers",
        );
        const mail = line.mail();
        assert.equal(mail.length, 1);
        assert.equal(mail[0].subject, "WhatsApp messages are arriving and the control plane cannot be read");
        assert.ok(
          mail[0].text.startsWith(
            `2 message(s) just arrived for phone_number_id ${w.PHONE_ID} and the channel row could not be read`,
          ),
          mail[0].text,
        );
        assert.deepEqual([seen.runtimes, seen.ingested, seen.sent], [[], [], []], "nothing recorded and nothing said");
        assert.equal(
          kind(w.tables, "ingest.unroutable").length,
          0,
          "a blip is not a decision: nothing is dead-lettered",
        );
        assert.deepEqual(
          log.said("wa_routing_lookup_failed").map((l) => l.fields.phone_number_id),
          [w.PHONE_ID],
        );
        assert.deepEqual(
          log.said("wa_skip_routing_failed").map((l) => l.fields),
          [{ phone_number_id: w.PHONE_ID, messages: 2 }],
        );

        // The redelivery, with the database well. A failed lookup is never
        // cached, so the same batch routes, and both messages are recorded and answered by their jobs.
        const well = w.open();
        assert.deepEqual(await answer(await deliver(body)), [200, { ok: true }]);
        await runAnswers(w, well);
        assert.deepEqual(
          seen.ingested.map((x) => x.tenantId),
          [w.T, w.T, w.T, w.T],
        );
        assert.equal(seen.sent.length, 2);
        assert.equal(line.mail().length, 1, "and the platform is not told again");
      }),
    );
  } finally {
    line.restore();
  }
});

/* ------------------------------------------------------- the account's news */

test("the account's own news is routed by its WABA and never by a number: kept as the workspace's event, remembered on the channel, the owner's bell and mailbox told", async () => {
  const w = world();
  const OWNER = "owner@harbor.test";
  w.tables.tenant_config.push({ tenant_id: w.T, config: { notifications: { escalation_emails: [OWNER] } } });
  const db = w.open();
  const seen = receptionist();
  const line = wire();
  // Meta's account fields carry no number. This one is given the workspace's
  // routable number on purpose: were the account's branch below the routing by
  // number, that number would be looked up, and the reads below would show it.
  const quality = {
    display_phone_number: w.LINE.slice(1),
    event: "FLAGGED",
    current_limit: "TIER_1K",
    metadata: { phone_number_id: w.PHONE_ID },
  };
  const news = (entryId) => ({
    object: "whatsapp_business_account",
    entry: [
      { ...(entryId ? { id: entryId } : {}), changes: [{ field: "phone_number_quality_update", value: quality }] },
    ],
  });
  const byNumber = () =>
    db.seen.filter((q) => q.table === "tenant_channels" && q.filters.some(([, col]) => col === "external_id"));
  try {
    await withEnv(MAIL, () =>
      listening(async (log) => {
        assert.deepEqual(await answer(await deliver(news(w.WABA))), [200, { ok: true }]);

        const channelReads = db.seen.filter((q) => q.table === "tenant_channels" && q.op === "select");
        assert.deepEqual(
          channelReads[0].filters,
          [
            ["eq", "kind", "whatsapp"],
            ["eq", "waba_id", w.WABA],
            ["eq", "status", "active"],
          ],
          "routed by the account",
        );
        assert.deepEqual(byNumber(), [], "and no number was routed");
        assert.deepEqual(seen.runtimes, [], "no receptionist runs for the account's news");

        assert.deepEqual(
          kind(w.tables, "channel.phone_number_quality_update").map((e) => [
            e.tenant_id,
            e.category,
            e.subject_type,
            e.subject_id,
            e.data,
          ]),
          [[w.T, "system", "channel", `ch-${w.i}`, { waba_id: w.WABA, ...quality }]],
        );
        const cfg = w.tables.tenant_channels[0].config;
        assert.deepEqual(
          [cfg.messaging_limit, cfg.quality_event],
          ["TIER_1K", "FLAGGED"],
          "the channel row keeps the newest rating for Settings",
        );
        assert.ok(!Number.isNaN(Date.parse(cfg.quality_at)));

        assert.deepEqual(
          w.tables.notifications.map((n) => [n.tenant_id, n.kind, n.route, n.title]),
          [[w.T, "number", "admin/integrations", "WhatsApp flagged your number"]],
          "the workspace's bell",
        );
        const mail = line.mail();
        assert.equal(mail.length, 1);
        assert.deepEqual(
          [mail[0].to, mail[0].subject],
          [[OWNER], "WhatsApp flagged your number"],
          "and the workspace's own mailbox",
        );
        assert.ok(mail[0].text.includes(`Your WhatsApp number ${w.LINE} has been flagged`), mail[0].text);
        assert.deepEqual(
          log.said("wa_waba_event").map((l) => l.fields),
          [{ field: "phone_number_quality_update", waba_id: w.WABA, outcome: "alerted" }],
        );

        // No entry id: there is nothing to route the news by, so not one row is read; the delivery is kept, as every
        // proven one is (00336).
        const before = db.seen.length;
        assert.deepEqual(await answer(await deliver(news(null))), [200, { ok: true }]);
        assert.deepEqual(
          db.seen.slice(before).map((q) => [q.table, q.op]),
          [["provider_events", "upsert"]],
        );
        // A WABA no workspace holds: looked up, not found, kept nowhere.
        assert.deepEqual(await answer(await deliver(news(`${w.WABA}0`))), [200, { ok: true }]);
        assert.deepEqual(
          log
            .said("wa_waba_event")
            .slice(1)
            .map((l) => l.fields),
          [
            { field: "phone_number_quality_update", waba_id: null, outcome: "unrouted" },
            { field: "phone_number_quality_update", waba_id: `${w.WABA}0`, outcome: "unrouted" },
          ],
        );
        assert.equal(kind(w.tables, "channel.phone_number_quality_update").length, 1);
        assert.equal(line.mail().length, 1);
        assert.deepEqual(byNumber(), [], "and still no number was routed");
      }),
    );
  } finally {
    line.restore();
  }
});

test("a partner's notice is routed by the account it names, never by the portfolio it was addressed to: kept as the workspace's event with its waba_info, a removal told to the owner, an addition told to nobody", async () => {
  const w = world();
  const OWNER = "owner@harbor.test";
  w.tables.tenant_config.push({ tenant_id: w.T, config: { notifications: { escalation_emails: [OWNER] } } });
  const db = w.open();
  receptionist();
  const line = wire();
  try {
    await withEnv(MAIL, () =>
      listening(async (log) => {
        const added = partnerNotice(w, "PARTNER_ADDED", w.WABA);
        assert.deepEqual(await answer(await deliver(added)), [200, { ok: true }]);
        const channelReads = db.seen.filter((q) => q.table === "tenant_channels" && q.op === "select");
        assert.deepEqual(
          channelReads[0].filters,
          [
            ["eq", "kind", "whatsapp"],
            ["eq", "waba_id", w.WABA],
            ["eq", "status", "active"],
          ],
          "routed by the account the notice names: the portfolio it was addressed to holds no channel",
        );
        assert.deepEqual(
          kind(w.tables, "channel.account_update").map((e) => [e.tenant_id, e.subject_id, e.data]),
          [[w.T, `ch-${w.i}`, { waba_id: w.WABA, ...added.entry[0].changes[0].value }]],
          "kept as Meta sent it, under the account that routed it",
        );
        assert.deepEqual(
          [w.tables.notifications.length, line.mail().length],
          [0, 0],
          "a partner added is nobody's alert",
        );

        // Removed: the notice that says the receptionist can no longer answer, which an unrouted notice could never tell anyone.
        assert.deepEqual(await answer(await deliver(partnerNotice(w, "PARTNER_REMOVED", w.WABA))), [200, { ok: true }]);
        assert.deepEqual(
          w.tables.notifications.map((n) => [n.tenant_id, n.kind, n.route, n.title]),
          [[w.T, "number", "admin/integrations", "WhatsApp connection removed"]],
          "the workspace's bell",
        );
        const mail = line.mail();
        assert.deepEqual([mail.length, mail[0].to, mail[0].subject], [1, [OWNER], "WhatsApp connection removed"]);

        // Addressed to nobody: the account it names is enough.
        assert.deepEqual(await answer(await deliver(partnerNotice(w, "PARTNER_ADDED", w.WABA, ""))), [
          200,
          { ok: true },
        ]);
        assert.equal(kind(w.tables, "channel.account_update").length, 3);

        assert.deepEqual(
          log.said("wa_waba_event").map((l) => l.fields),
          [
            { field: "account_update", waba_id: w.WABA, outcome: "kept" },
            { field: "account_update", waba_id: w.WABA, outcome: "alerted" },
            { field: "account_update", waba_id: w.WABA, outcome: "kept" },
          ],
          "the line says the account the notice was about",
        );
        assert.deepEqual([log.said("waba_unroutable").length, log.said("wa_signup_finished_unclaimed").length], [0, 0]);
      }),
    );
  } finally {
    line.restore();
  }
});

test("a partner's notice for an account no workspace holds is a sign-up that has not reached Chanlytics: one line at info, kept nowhere, nobody told; a notice addressed to an account we cannot find is still a fault", async () => {
  const w = world();
  const db = w.open();
  receptionist();
  const line = wire();
  const stranger = `${w.WABA}0`;
  try {
    await withEnv(MAIL, () =>
      listening(async (log) => {
        assert.deepEqual(await answer(await deliver(partnerNotice(w, "PARTNER_ADDED", stranger))), [200, { ok: true }]);
        assert.deepEqual(
          log.said("wa_signup_finished_unclaimed").map((l) => [l.stream, l.fields]),
          [["log", { waba_id: stranger, entry_id: PORTFOLIO(w), account_event: "PARTNER_ADDED" }]],
          "news, said at info: the account, what the notice was addressed to, and the event",
        );
        assert.equal(log.said("waba_unroutable").length, 0, "not the error it was on 6 October");
        assert.deepEqual(
          log.said("wa_waba_event").map((l) => l.fields),
          [{ field: "account_update", waba_id: stranger, outcome: "unclaimed" }],
        );
        const lookups = db.seen.filter((q) => q.table === "tenant_channels" && q.op === "select");
        assert.deepEqual(
          lookups.map((q) => q.filters.find(([, col]) => col === "waba_id")[2]),
          [stranger],
          "the account it names was looked up, and nothing else",
        );
        assert.deepEqual(
          [w.tables.events.length, w.tables.notifications.length, line.mail().length],
          [0, 0, 0],
          "kept nowhere, nobody told",
        );

        // A notice that names no account, addressed to one nobody holds, is what waba_unroutable always meant.
        const lost = {
          object: "whatsapp_business_account",
          entry: [{ id: stranger, changes: [{ field: "account_update", value: { event: "PARTNER_REMOVED" } }] }],
        };
        assert.deepEqual(await answer(await deliver(lost)), [200, { ok: true }]);
        assert.deepEqual(
          log.said("waba_unroutable").map((l) => [l.stream, l.fields]),
          [["error", { waba_id: stranger, field: "account_update" }]],
        );
        assert.equal(log.said("wa_signup_finished_unclaimed").length, 1, "and is not said again as a sign-up");
        assert.equal(log.said("wa_waba_event").at(-1).fields.outcome, "unrouted");
        assert.deepEqual([w.tables.events.length, w.tables.notifications.length], [0, 0]);
      }),
    );
  } finally {
    line.restore();
  }
});

test("accountOf: the account a notice names itself, else the one it was addressed to; an id that is not text names nothing, and a notice with neither is about no account", async () => {
  const { accountOf } = await import(at("apps/edge/lib/whatsapp/waba-events.ts"));
  assert.deepEqual(accountOf("2076", { event: "FLAGGED" }), { waba: "2076", named: false });
  assert.deepEqual(accountOf("3076", { waba_info: { waba_id: " 2076 " } }), { waba: "2076", named: true });
  assert.deepEqual(accountOf("", { waba_info: { waba_id: "2076" } }), { waba: "2076", named: true });
  for (const info of [
    undefined,
    null,
    "2076",
    2076,
    [],
    {},
    { waba_id: "" },
    { waba_id: "  " },
    { waba_id: 2076 },
    { waba_id: null },
  ])
    assert.deepEqual(accountOf("3076", { waba_info: info }), { waba: "3076", named: false }, JSON.stringify(info));
  assert.equal(accountOf("", {}), null);
  assert.equal(accountOf("", { waba_info: { waba_id: " " } }), null);
});

test("Meta's decision on the display name is kept as the workspace's event and applied to the standing the channel keeps, through the door the reading keeps it by: approved and in review are told to nobody", async () => {
  for (const [decision, status] of [
    ["APPROVED", "APPROVED"],
    ["PENDING", "PENDING_REVIEW"],
    ["DEFERRED", "PENDING_REVIEW"],
  ]) {
    const w = readWorld();
    const k = keeper(w);
    const db = w.open({}, k.rpcs);
    receptionist();
    const line = wire();
    try {
      await withEnv(MAIL, () =>
        listening(async (log) => {
          const notice = nameNotice(w, decision);
          assert.deepEqual(await answer(await deliver(notice)), [200, { ok: true }], decision);
          const channelReads = db.seen.filter((q) => q.table === "tenant_channels" && q.op === "select");
          assert.deepEqual(
            channelReads[0].filters,
            [
              ["eq", "kind", "whatsapp"],
              ["eq", "waba_id", w.WABA],
              ["eq", "status", "active"],
            ],
            "routed by the entry's id, which is the account, as the other account fields are",
          );
          assert.deepEqual(
            kind(w.tables, "channel.phone_number_name_update").map((e) => [e.tenant_id, e.subject_id, e.data]),
            [[w.T, `ch-${w.i}`, { waba_id: w.WABA, ...notice.entry[0].changes[0].value }]],
            "kept as Meta sent it",
          );
          assert.deepEqual(
            k.kept,
            [
              {
                p_tenant_id: w.T,
                p_channel_id: `ch-${w.i}`,
                p_standing: { ...HELD, name: "Harbor Moving", name_status: status },
              },
            ],
            `${decision}: the name and its word move, and nothing else of the standing`,
          );
          const cfg = w.tables.tenant_channels[0].config;
          assert.deepEqual(
            [cfg.standing.name_status, cfg.quality_rating],
            [status, "GREEN"],
            "on the config, beside what was there",
          );
          assert.deepEqual(
            [w.tables.notifications.length, line.mail().length],
            [0, 0],
            `${decision} is nobody's alert`,
          );
          assert.deepEqual(
            log.said("wa_waba_event").map((l) => l.fields),
            [{ field: "phone_number_name_update", waba_id: w.WABA, outcome: "kept" }],
          );
        }),
      );
    } finally {
      line.restore();
    }
  }
});

test("a declined display name is told to the owner with the way on and Meta's reason, and the row says it at once: the bell, the owner's mail and the kept standing", async () => {
  const w = readWorld();
  const k = keeper(w);
  w.open({}, k.rpcs);
  receptionist();
  const line = wire();
  try {
    await withEnv(MAIL, () =>
      listening(async (log) => {
        const declined = nameNotice(w, "REJECTED", { rejection_reason: "NAME_FORMAT_UNACCEPTABLE" });
        assert.deepEqual(await answer(await deliver(declined)), [200, { ok: true }]);
        assert.deepEqual(
          w.tables.notifications.map((n) => [n.tenant_id, n.kind, n.route, n.title, n.body]),
          [
            [
              w.T,
              "number",
              "admin/integrations",
              "WhatsApp display name declined",
              "Meta declined the display name “Harbor Moving” · change it in WhatsApp Manager. Meta's reason: name format unacceptable.",
            ],
          ],
          "the workspace's bell",
        );
        const mail = line.mail();
        assert.deepEqual(
          [mail.length, mail[0].to, mail[0].subject],
          [1, ["owner@harbor.test"], "WhatsApp display name declined"],
          "and the owner's mailbox",
        );
        assert.deepEqual(
          [w.tables.tenant_channels[0].config.standing.name_status, w.tables.tenant_channels[0].config.standing.name],
          ["DECLINED", "Harbor Moving"],
          "and the row's note",
        );
        assert.deepEqual(
          log.said("wa_waba_event").map((l) => l.fields),
          [{ field: "phone_number_name_update", waba_id: w.WABA, outcome: "alerted" }],
        );
      }),
    );
  } finally {
    line.restore();
  }
});

test("a number whose standing was never read is left for the read, a decision that is none of Meta's four changes nothing, and a database that will not keep the standing costs the row its word and never the webhook its answer", async () => {
  // Never read: the event is kept, no door is asked, and an approval is told to nobody.
  const fresh = world();
  const kFresh = keeper(fresh);
  fresh.open({}, kFresh.rpcs);
  receptionist();
  const line = wire();
  try {
    await withEnv(MAIL, () =>
      listening(async (log) => {
        assert.deepEqual(await answer(await deliver(nameNotice(fresh, "APPROVED"))), [200, { ok: true }]);
        assert.equal(kind(fresh.tables, "channel.phone_number_name_update").length, 1);
        assert.deepEqual([kFresh.kept, fresh.tables.tenant_channels[0].config], [[], {}], "nothing to correct");

        // A word that is none of Meta's four: kept as the event, nothing corrected, nothing said.
        const odd = readWorld();
        const kOdd = keeper(odd);
        odd.open({}, kOdd.rpcs);
        assert.deepEqual(await answer(await deliver(nameNotice(odd, "MAYBE"))), [200, { ok: true }]);
        assert.deepEqual(
          [kind(odd.tables, "channel.phone_number_name_update").length, kOdd.kept, odd.tables.notifications.length],
          [1, [], 0],
        );

        // The database refuses the keeping: the owner is still told of a decline, the event is kept, the line says what failed.
        const refused = readWorld();
        refused.open(
          {},
          {
            channel_keep_standing: () => {
              throw new Error("the database is not keeping standings today");
            },
          },
        );
        assert.deepEqual(await answer(await deliver(nameNotice(refused, "REJECTED"))), [200, { ok: true }]);
        assert.deepEqual(
          [
            kind(refused.tables, "channel.phone_number_name_update").length,
            refused.tables.notifications.map((n) => n.title),
            refused.tables.tenant_channels[0].config.standing.name_status,
          ],
          [1, ["WhatsApp display name declined"], "PENDING_REVIEW"],
          "kept, told, and the row's word waits for the read",
        );
        assert.deepEqual(
          log.said("wa_standing_keep_failed").map((l) => l.stream),
          ["error"],
        );
      }),
    );
  } finally {
    line.restore();
  }
});

/* ------------------------------------------------- statuses and echoes */

test("receipts land on the routed workspace's own messages by external id, a failure with what Meta said, and a status the ledger does not keep lands nowhere", async () => {
  const w = world();
  const OTHER = "bbbbbbbb-0000-4000-8000-000000000001";
  const to = w.customer();
  const wamid = (k) => `wamid.${w.i}.out.${k}`;
  w.tables.messages.push(
    { id: "queued", tenant_id: w.T, external_id: wamid(1), status: "queued" },
    { id: "sent", tenant_id: w.T, external_id: wamid(2), status: "sent" },
    { id: "delivered", tenant_id: w.T, external_id: wamid(3), status: "delivered" },
    { id: "failing", tenant_id: w.T, external_id: wamid(4), status: "sent" },
    { id: "read", tenant_id: w.T, external_id: wamid(5), status: "read" },
    { id: "theirs", tenant_id: OTHER, external_id: wamid(1), status: "queued" },
  );
  const db = w.open();
  receptionist();
  const errors = [{ code: 131047, title: "Re-engagement message", message: "Re-engagement message" }];
  const receipt = (k, status, over = {}) => ({ id: wamid(k), status, timestamp: now(), recipient_id: to, ...over });
  const res = await deliver(
    w.change({
      statuses: [
        receipt(1, "sent"),
        receipt(2, "delivered"),
        receipt(3, "read"),
        receipt(4, "failed", { errors }),
        receipt(5, "deleted"),
      ],
    }),
  );
  assert.deepEqual(await answer(res), [200, { ok: true }]);

  const row = (id) => w.tables.messages.find((m) => m.id === id);
  assert.deepEqual(
    ["queued", "sent", "delivered", "failing", "read"].map((id) => row(id).status),
    ["sent", "delivered", "read", "failed", "read"],
  );
  assert.deepEqual(row("failing").error, { errors }, "a failure keeps what Meta said about it");
  assert.ok(!("error" in row("sent")), "and a receipt without errors writes none");
  assert.equal(row("theirs").status, "queued", "another workspace's message under the same id is untouched");
  const writes = () => db.seen.filter((q) => q.table === "messages" && q.op === "update");
  assert.equal(writes().length, 4, "the deleted receipt is not written");
  assert.ok(
    writes().every((q) => q.filters.some(([op, col, v]) => op === "eq" && col === "tenant_id" && v === w.T)),
    "and every write names the routed workspace",
  );

  // The same receipt on a number no workspace holds: kept as a dead letter, and not one row written.
  const lost = await deliver(w.change({ statuses: [receipt(1, "read")] }, { phoneId: w.stranger }));
  assert.deepEqual(await answer(lost), [200, { ok: true }]);
  assert.equal(row("queued").status, "sent");
  assert.equal(writes().length, 4);
  assert.deepEqual(
    kind(w.tables, "ingest.unroutable").map((e) => e.data),
    [{ channel: "whatsapp", phone_number_id: w.stranger }],
  );
});

test("a receipt that carries Meta's pricing has it kept on the message it is about, once, through the real door; the status moves as always and the answer is 200", async () => {
  const w = world();
  const to = w.customer();
  const wamid = `wamid.${w.i}.price`;
  w.tables.messages.push({
    id: "out",
    tenant_id: w.T,
    external_id: wamid,
    status: "queued",
    direction: "outbound",
    meta: {},
  });
  w.open();
  receptionist();
  const pricing = { billable: true, pricing_model: "PMP", category: "utility", type: "regular" };
  const receipt = (status, over = {}) => ({ id: wamid, status, timestamp: now(), recipient_id: to, ...over });
  assert.deepEqual(await answer(await deliver(w.change({ statuses: [receipt("sent", { pricing })] }))), [
    200,
    { ok: true },
  ]);
  const row = w.tables.messages.find((m) => m.id === "out");
  assert.deepEqual([row.status, row.meta.pricing], ["sent", pricing]);
  // Meta says it once; a second pricing (a retry, a delivered after a sent that carried it) finds the key there.
  await deliver(w.change({ statuses: [receipt("delivered", { pricing: { ...pricing, category: "marketing" } })] }));
  assert.deepEqual([row.status, row.meta.pricing.category], ["delivered", "utility"]);
});

test("a cost the database refuses costs the delivery nothing: the door is asked after the status has landed, says so on its log, answers 200, and finishes the whole body, the rest of the receipts and the messages after it", async () => {
  const w = world();
  const to = w.customer();
  const from = w.customer();
  const wamid = (k) => `wamid.${w.i}.cost.${k}`;
  w.tables.messages.push(
    { id: "priced", tenant_id: w.T, external_id: wamid(1), status: "queued", direction: "outbound", meta: {} },
    { id: "after", tenant_id: w.T, external_id: wamid(2), status: "queued", direction: "outbound", meta: {} },
  );
  w.open();
  w.refuseCost();
  const seen = receptionist();
  const pricing = { billable: true, pricing_model: "PMP", category: "utility", type: "regular" };
  const receipt = (k, status, over = {}) => ({ id: wamid(k), status, timestamp: now(), recipient_id: to, ...over });
  // One delivery, three changes: the priced receipt whose cost is refused, then another change with a receipt and a
  // customer's message. Everything after the refusal is still the door's to do.
  const body = w.change({ statuses: [receipt(1, "sent", { pricing })] });
  body.entry[0].changes.push(
    w.change({ statuses: [receipt(2, "delivered")] }).entry[0].changes[0],
    w.change({ messages: [text(from, `wamid.${w.i}.in`, "hello after the refused cost")] }).entry[0].changes[0],
  );
  await listening(async (log) => {
    assert.deepEqual(await answer(await deliver(body)), [200, { ok: true }], "the cost never changes the answer");
    const row = (id) => w.tables.messages.find((m) => m.id === id);
    assert.deepEqual(
      [row("priced").status, "pricing" in row("priced").meta],
      ["sent", false],
      "the status landed, no cost",
    );
    assert.equal(row("after").status, "delivered", "the next change's receipt landed");
    assert.deepEqual(
      seen.ingested.map((x) => x.body),
      ["hello after the refused cost"],
      "and so did the customer's message after it",
    );
    assert.deepEqual(
      log.lines.filter((l) => l.event.startsWith("pg_")).map((l) => l.event),
      ["pg_cost_failed"],
      "one line says the cost was lost, and nothing else of the delivery failed",
    );
    assert.equal(log.said("wa_webhook_error").length, 0, "no throw reached the door's own catch");
  });
});

test("REGRESSION (S7-5): an owner's typed reply from the Business app settles the hold it answers; a STOP's hold stands", async () => {
  const w = world();
  w.open();
  receptionist();
  const to = w.customer();
  const echo = (n, body) => ({
    from: w.LINE.slice(1),
    to,
    id: `wamid.${w.i}.echo.${n}`,
    timestamp: now(),
    type: "text",
    text: { body },
  });
  await listening(async () => {
    // The thread as the first echo leaves it, then the customer's ask two minutes back and the holds it raised.
    await deliver(w.change({ message_echoes: [echo(1, "One moment.")] }, { field: "smb_message_echoes" }));
    const [conversation] = w.tables.conversations;
    const ago = (ms) => new Date(Date.now() - ms).toISOString();
    w.tables.messages.push({
      id: `in-${w.i}`,
      tenant_id: w.T,
      conversation_id: conversation.id,
      contact_id: conversation.contact_id,
      channel: "whatsapp",
      direction: "inbound",
      sender: "customer",
      type: "text",
      body: "Can someone call me?",
      external_id: `wamid.${w.i}.in`,
      status: "received",
      created_at: ago(120_000),
    });
    w.tables.escalations = [
      {
        id: `hold-${w.i}`,
        tenant_id: w.T,
        conversation_id: conversation.id,
        reason: "human_token",
        state: "open",
        created_at: ago(100_000),
      },
      {
        id: `stop-${w.i}`,
        tenant_id: w.T,
        conversation_id: conversation.id,
        reason: "opt_out",
        state: "open",
        created_at: ago(90_000),
      },
    ];
    const res = await deliver(
      w.change({ message_echoes: [echo(2, "Calling you now.")] }, { field: "smb_message_echoes" }),
    );
    assert.deepEqual(await answer(res), [200, { ok: true }]);
    const by = Object.fromEntries(w.tables.escalations.map((e) => [e.reason, e.state]));
    assert.deepEqual(
      by,
      { human_token: "resolved", opt_out: "open" },
      "the hold that waits on a person, and not a STOP's",
    );
    const decision = w.tables.decisions.find((d) => d.id === w.tables.escalations[0].decision_id);
    assert.deepEqual([decision.verb, decision.payload.via], ["resolve", "whatsapp_business_app"]);
  });
});

test("an owner's reply from the Business app pauses the receptionist for the workspace's own hours: recorded as a person's words, the conversation handed over, no thread touched", async () => {
  const w = world();
  w.tables.policies.push({
    id: `pol-${w.i}`,
    tenant_id: w.T,
    class: "reply",
    mode: "auto",
    subject_type: null,
    subject_id: null,
    limits: { pause_hours: 6 },
  });
  const db = w.open();
  receptionist();
  const to = w.customer();
  const echo = {
    from: w.LINE.slice(1),
    to,
    id: `wamid.${w.i}.echo`,
    timestamp: now(),
    type: "text",
    text: { body: "Hi Dana, this is Marisa. I'll call you in five minutes." },
  };
  await listening(async (log) => {
    const t0 = Date.now();
    const res = await deliver(w.change({ message_echoes: [echo] }, { field: "smb_message_echoes" }));
    const t1 = Date.now();
    assert.deepEqual(await answer(res), [200, { ok: true }]);

    assert.ok(
      db.seen.some(
        (q) =>
          q.table === "policies" && q.filters.some(([op, col, v]) => op === "eq" && col === "tenant_id" && v === w.T),
      ),
      "the hours are the workspace's own policy, read from the control plane",
    );
    assert.equal(w.tables.contacts.length, 1);
    const [contact] = w.tables.contacts;
    assert.deepEqual([contact.tenant_id, contact.phone_e164], [w.T, `+${to}`]);
    assert.equal(w.tables.conversations.length, 1);
    const [conversation] = w.tables.conversations;
    assert.deepEqual(
      [conversation.tenant_id, conversation.contact_id, conversation.state],
      [w.T, contact.id, "needs_human"],
    );
    const until = Date.parse(conversation.paused_until);
    assert.ok(
      until >= t0 + 6 * 3600_000 && until <= t1 + 6 * 3600_000,
      `paused for the six hours Settings shows, not a day: ${conversation.paused_until}`,
    );

    assert.equal(w.tables.messages.length, 1);
    const { id: _id, created_at: _at, ...kept } = w.tables.messages[0];
    assert.deepEqual(
      kept,
      {
        tenant_id: w.T,
        conversation_id: conversation.id,
        contact_id: contact.id,
        channel: "whatsapp",
        direction: "outbound",
        sender: "human",
        type: "text",
        body: echo.text.body,
        external_id: echo.id,
        status: "sent",
        meta: { echo: true },
      },
      "the owner's words, kept as a person's",
    );

    assert.deepEqual(
      log.said("echo_pause_not_persisted"),
      [],
      "with the store retired nothing tries to mirror the pause into a thread",
    );
    assert.deepEqual([log.said("echo_handling_error"), log.said("pg_echo_failed")], [[], []]);
    const [paused] = log.said("wa_paused_by_echo");
    assert.deepEqual([paused.fields.to_tail], [to.slice(-4)], "said with a tail, never the number");
  });
});

test("a workspace that never chose its hours pauses for the default day, and an echo on a number no workspace holds is recorded for nobody", async () => {
  const w = world();
  w.open();
  receptionist();
  const t0 = Date.now();
  const res = await deliver(
    w.change(
      {
        message_echoes: [
          {
            from: w.LINE.slice(1),
            to: w.customer(),
            id: `wamid.${w.i}.echo1`,
            type: "text",
            text: { body: "On my way." },
          },
        ],
      },
      { field: "smb_message_echoes" },
    ),
  );
  const t1 = Date.now();
  assert.deepEqual(await answer(res), [200, { ok: true }]);
  assert.equal(w.tables.conversations.length, 1);
  const until = Date.parse(w.tables.conversations[0].paused_until);
  const day = pauseMsOf(null);
  assert.ok(until >= t0 + day && until <= t1 + day, `the default: ${w.tables.conversations[0].paused_until}`);

  const lost = await deliver(
    w.change(
      {
        message_echoes: [
          { from: w.LINE.slice(1), to: w.customer(), id: `wamid.${w.i}.echo2`, type: "text", text: { body: "Hello?" } },
        ],
      },
      { field: "smb_message_echoes", phoneId: w.stranger },
    ),
  );
  assert.deepEqual(await answer(lost), [200, { ok: true }]);
  assert.deepEqual(
    [w.tables.contacts.length, w.tables.conversations.length, w.tables.messages.length],
    [1, 1, 1],
    "no contact, conversation or message for a number no workspace holds",
  );
});

/* ------------------------------------------------------------ the ack rule */

test("the ack rule: a message the database refused is not acknowledged, 503 with the count, while the rest of the batch is still handled; any other failure is logged and the batch keeps its 200", async () => {
  const w = world();
  const db = w.open();
  const seen = receptionist({
    ingest: (n) => {
      if (n.body === "the refused one") throw new IngestFailed("connection reset by peer");
    },
  });
  const refused = w.customer();
  const kept = w.customer();
  await listening(async (log) => {
    const res = await deliver(
      w.change({
        messages: [
          text(refused, `wamid.${w.i}.refused`, "the refused one"),
          text(kept, `wamid.${w.i}.kept`, "the kept one"),
        ],
      }),
    );
    assert.deepEqual(await answer(res), [503, { ok: false, unrecorded: 1 }]);
    await runAnswers(w, db);
    assert.deepEqual(
      seen.ingested.map((x) => x.body),
      ["the refused one", "the kept one", "the kept one"],
      "the message after the failure was still recorded, and its job took it up",
    );
    assert.deepEqual(
      seen.sent.map((s) => s.to),
      [kept],
      "and the customer whose words were kept was answered",
    );
    assert.deepEqual(
      seen.alerts.filter((a) => a.reason === "message not recorded").map((a) => a.thread),
      [refused],
      "a copy of the refused words went to the workspace",
    );
    assert.deepEqual(
      log.said("wa_inbound_failed").map((l) => [l.fields.id, l.fields.error]),
      [[`wamid.${w.i}.refused`, "IngestFailed: connection reset by peer"]],
    );
  });

  const v = world();
  const db2 = v.open();
  const seen2 = receptionist({
    ingest: (n) => {
      if (n.body === "the broken one") throw new TypeError("cannot read properties of undefined");
    },
  });
  const broken = v.customer();
  const fine = v.customer();
  await listening(async (log) => {
    const res = await deliver(
      v.change({
        messages: [
          text(broken, `wamid.${v.i}.broken`, "the broken one"),
          text(fine, `wamid.${v.i}.fine`, "the fine one"),
        ],
      }),
    );
    assert.deepEqual(
      await answer(res),
      [200, { ok: true }],
      "a failure that is not the database's refusal is acknowledged",
    );
    await runAnswers(v, db2);
    assert.deepEqual(
      seen2.ingested.map((x) => x.body),
      ["the broken one", "the fine one", "the fine one"],
    );
    assert.deepEqual(
      seen2.sent.map((s) => s.to),
      [fine],
    );
    assert.deepEqual(
      seen2.alerts.filter((a) => a.reason === "message not recorded"),
      [],
      "and nobody is told a message went unrecorded",
    );
    assert.deepEqual(
      log.said("wa_inbound_failed").map((l) => [l.fields.id, l.fields.error]),
      [[`wamid.${v.i}.broken`, "TypeError: cannot read properties of undefined"]],
      "but it is said",
    );
  });
});
