/**
 * One message, every channel (step 3): the routes take and judge `channels`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "../../_fake-db.mjs";
import {
  A,
  B,
  K1,
  K2,
  K9,
  T1,
  T4,
  T9,
  USER,
  both,
  broadcasts,
  channelRows,
  ctxFor,
  getEmailWire,
  inB,
  memoryStore,
  pb,
  playbook,
  playbooks,
  refused,
  send,
  setRateStore,
  setServiceClient,
  tpl,
  writes,
} from "./_routes.mjs";

test("a broadcast ticks channels at the door: a tick the workspace is not ready on, whose message has no version, or the purpose never carries is refused before a row, in the composer's words", async () => {
  // Whether the deployment can send email is the EDGE's answer (its mail domain AND the provider's key, which the
  // dashboard never holds): here a stubbed fetch, asked through the real dashboard server, and an unreachable edge is
  // not ready and not guessed ready.
  const beforeSecret = process.env.EDGE_CALL_SECRET;
  const beforeFetch = globalThis.fetch;
  process.env.EDGE_CALL_SECRET = "edge-secret-for-this-file";
  const edgeSays = async (answer) => {
    globalThis.fetch = async () => {
      if (answer instanceof Error) throw answer;
      return new Response(JSON.stringify(answer), { status: 200, headers: { "content-type": "application/json" } });
    };
    await getEmailWire({ fresh: true });
  };
  const tablesFor = (over = {}) => ({
    memberships: both("viewer", "operator"),
    templates: [tpl(T1, B)],
    tenants: [],
    tenant_config: [],
    policies: [],
    tenant_channels: [channelRows.number],
    lines: [],
    mailboxes: [],
    ...over,
  });
  const post = (tables, body) => {
    // One broadcast bucket a minute: each refusal below is its own try.
    setRateStore(memoryStore());
    const ctx = ctxFor(tables, {}, { people_list: () => [] });
    return {
      ctx,
      run: broadcasts.POST.run(
        send("POST", { template_id: T1, params: [], audience: { kind: "everyone" }, ...body }, inB),
        ctx,
      ),
    };
  };
  try {
    await edgeSays({ ok: true, ready: false });
    // WhatsApp, as ever: with no number the broadcast says so, and the number is not asked about when it is not ticked.
    await refused(
      post(tablesFor({ tenant_channels: [] }), {}).run,
      "conflict",
      409,
      "Connect a WhatsApp number first.",
    );
    // A text: no line, a line the carriers have not approved, then no text version, then everything ready (the empty
    // audience is the next thing the route says, which proves the channel passed).
    await refused(post(tablesFor(), { channels: ["sms"] }).run, "conflict", 409, "No texting line yet.");
    const pending = { ...channelRows.line, sms_state: "pending" };
    await refused(
      post(tablesFor({ lines: [pending] }), { channels: ["sms"] }).run,
      "conflict",
      409,
      "isn't approved for your number",
    );
    await refused(
      post(tablesFor({ lines: [channelRows.line] }), { channels: ["sms"] }).run,
      "conflict",
      409,
      "This message has no text version yet.",
    );
    const ready = tablesFor({ lines: [channelRows.line], templates: [tpl(T1, B), channelRows.textVersion()] });
    await refused(post(ready, { channels: ["sms"] }).run, "conflict", 409, "Nobody there has said yes");
    // Email. A broadcast is the business's own news, which by email waits for the campaigns domain as an offer does
    // (decision D2), so a deployment that cannot send them says so first: no email wire, then none verified.
    await refused(
      post(tablesFor(), { channels: ["email"] }).run,
      "conflict",
      409,
      "Emails carry no offers or news for now.",
    );
    // The edge could not be asked: not offered, and said so, never guessed ready.
    await edgeSays(new Error("connect ECONNREFUSED"));
    await refused(
      post(tablesFor(), { channels: ["email"] }).run,
      "conflict",
      409,
      "This couldn't be checked just now.",
    );
    // The campaigns domain verified: then the business's address, the mailbox, the message's version, and the people.
    await edgeSays({ ok: true, ready: true, offers: true });
    await refused(
      post(tablesFor(), { channels: ["email"] }).run,
      "conflict",
      409,
      "Add your business's address to send offers by email.",
    );
    const address = {
      tenant_config: [
        {
          tenant_id: B,
          config: {
            brain: {
              business_name: "Bayside",
              system_prompt: "Answer as the front desk of Bayside: brief and warm.",
              fallbacks: { greeting: "g", error: "e", non_text: "n" },
              profile: { address: "12 Main St, Springfield" },
            },
          },
          version: 1,
        },
      ],
    };
    await refused(post(tablesFor(address), { channels: ["email"] }).run, "conflict", 409, "Set up email in Settings");
    await refused(
      post(tablesFor({ ...address, mailboxes: [channelRows.mailbox] }), { channels: ["email"] }).run,
      "conflict",
      409,
      "This message has no email version yet.",
    );
    const mail = tablesFor({
      ...address,
      mailboxes: [channelRows.mailbox],
      templates: [tpl(T1, B), channelRows.emailVersion()],
    });
    // By email the business's news asks a yes covering email or a relationship on record (decision D1): said as that.
    await refused(
      post(mail, { channels: ["email"] }).run,
      "conflict",
      409,
      "a yes to hearing from you by email or a relationship with you on record",
    );
    // An offer by email goes only once the workspace can send them (the campaigns domain, the business's address, no
    // pause: a state of the workspace, so a conflict); never by text (the purpose never carries it: a wrong request).
    const offer = {
      templates: [tpl(T1, B, { category: "marketing" }), channelRows.emailVersion()],
      mailboxes: [channelRows.mailbox],
    };
    await edgeSays({ ok: true, ready: true });
    await refused(
      post(tablesFor(offer), { channels: ["email"] }).run,
      "conflict",
      409,
      "Emails carry no offers or news for now.",
    );
    await refused(post(tablesFor(offer), { channels: ["sms"] }).run, "validation", 400, "Texts carry no offers.");
    await refused(
      post(tablesFor(), { channels: ["carrier pigeon"] }).run,
      "validation",
      400,
      "Pick WhatsApp, text or email to send by.",
    );
    // And nothing was written by any of them.
    const refusedOnes = post(tablesFor(), { channels: ["sms"] });
    await refused(refusedOnes.run, "conflict", 409);
    assert.equal(writes(refusedOnes.ctx), 0, "nothing enrolled, nothing scheduled, nothing on the ledger");
  } finally {
    globalThis.fetch = beforeFetch;
    if (beforeSecret === undefined) delete process.env.EDGE_CALL_SECRET;
    else process.env.EDGE_CALL_SECRET = beforeSecret;
    // What the next test reads is the answer of a deployment that cannot ask the edge, as it was before this one.
    await getEmailWire({ fresh: true });
  }
});

test("a playbook's channels alone: judged against the playbook as it stands and written alone, so a caller's copy of the rest can put nothing back", async () => {
  const tables = {
    memberships: both("viewer", "operator"),
    playbooks: [
      pb(K1, B, {
        name: "Visit reminder",
        trigger: "visit_tomorrow",
        policy_class: "booking",
        template_id: T1,
        template_name: "visit_reminder",
        run_hour: 14,
        cap_per_run: 5,
        channels: ["whatsapp"],
      }),
      // A playbook stored under the class its moment had when it was made: a channel change leaves its class as it is.
      pb(K2, B, {
        name: "The month's offer",
        trigger: "everyone_monthly",
        policy_class: "campaign",
        template_id: T4,
        template_name: "month_offer",
      }),
      pb(K9, A, { name: "Harbor's", template_id: T9 }),
    ],
    templates: [
      tpl(T1, B, { name: "visit_reminder", category: "utility" }),
      tpl("77777777-7777-4777-8777-777777777776", B, { channel: "email", name: "visit_reminder" }),
      tpl("77777777-7777-4777-8777-777777777777", B, { channel: "sms", name: "visit_reminder" }),
      tpl(T4, B, { name: "month_offer", category: "marketing" }),
      tpl("77777777-7777-4777-8777-777777777778", B, { channel: "email", name: "month_offer", category: "marketing" }),
      tpl(T9, A),
    ],
    tenants: [{ id: B, name: "Bayside", timezone: "America/Chicago" }],
    decisions: [],
    events: [],
  };
  setServiceClient(fakeDb(tables));
  const rowOf = (id) => tables.playbooks.find((p) => p.id === id);
  const before = { ...rowOf(K1) };
  let ctx = ctxFor(tables, { id: K1 });
  const out = await playbook.PUT.run(send("PUT", { channels: ["email", "whatsapp"] }), ctx);
  // What it went by before this write rides back, for an undo that puts back what was there now.
  assert.deepEqual(out, { id: K1, name: "Visit reminder", state: "running", was: { channels: ["whatsapp"] } });
  assert.deepEqual(rowOf(K1).channels, ["whatsapp", "email"], "in the product's order");
  assert.deepEqual({ ...rowOf(K1), channels: null }, { ...before, channels: null }, "nothing else of it moved");
  const written = ctx.supabase.seen
    .filter((s) => s.table === "sequence_steps" && s.op === "update")
    .map((s) => s.values);
  assert.deepEqual(written, [{ channels: ["whatsapp", "email"] }], "the one column, and no other");
  // The same channels again: nothing is written.
  ctx = ctxFor(tables, { id: K1 });
  await playbook.PUT.run(send("PUT", { channels: ["whatsapp", "email"] }), ctx);
  assert.equal(writes(ctx), 0);
  assert.deepEqual(
    tables.events.map((e) => [e.kind, e.subject_id, e.data]),
    [["playbook.changed", K1, { name: "Visit reminder", by: USER, fields: ["channels"] }]],
    "the change of channels is on the ledger once; the save that changed nothing says nothing",
  );
  // Judged as a save judges them, by its own class and message: a text carries no offer, and a tick is of the three.
  await refused(
    playbook.PUT.run(send("PUT", { channels: ["whatsapp", "sms"] }), ctxFor(tables, { id: K2 })),
    "validation",
    400,
    "Texts carry no offers.",
  );
  for (const channels of [[], ["fax"], ["email", "fax"]]) {
    await refused(
      playbook.PUT.run(send("PUT", { channels }), ctxFor(tables, { id: K1 })),
      "validation",
      400,
      "Pick WhatsApp, text or email to send by.",
    );
  }
  // Channels that are no list are no body the route takes (PLAYBOOK_PUT_BODY): refused before the check is asked, in one
  // sentence that says the three bodies, where zod said `Unrecognized key: "channels"` of a key the route does take.
  for (const channels of [null, "email"])
    await refused(
      playbook.PUT.run(send("PUT", { channels }), ctxFor(tables, { id: K1 })),
      "validation",
      400,
      "Send a change (any of state, name, run_hour, cap_per_run, gap_days, cadence_days, params, until and mode), the channels alone as a list (channels: whatsapp, sms or email), or the whole campaign with its trigger and template_id.",
    );
  assert.deepEqual(rowOf(K1).channels, ["whatsapp", "email"], "a refusal writes nothing");
  // A channel named twice is one channel.
  ctx = ctxFor(tables, { id: K1 });
  await playbook.PUT.run(send("PUT", { channels: ["email", "whatsapp", "email"] }), ctx);
  assert.equal(writes(ctx), 0, "the same two it has");
  // By email an offer waits for the workspace's offers: kept, never refused (its run holds those people until it can).
  await playbook.PUT.run(send("PUT", { channels: ["whatsapp", "email"] }), ctxFor(tables, { id: K2 }));
  assert.deepEqual(rowOf(K2).channels, ["whatsapp", "email"]);
  assert.equal(rowOf(K2).policy_class, "campaign", "its class is its own: a change of channels re-derives nothing");
  // The row is found under row security, and the role judged where it lives: another workspace's is a viewer's here.
  await refused(playbook.PUT.run(send("PUT", { channels: ["email"] }), ctxFor(tables, { id: K9 })), "forbidden", 403);
});

test("a playbook ticks channels: made with them, kept by an edit that names none, held to what its message may be on them; made before, it goes by WhatsApp alone", async () => {
  const reminder = tpl(T1, B, { name: "visit_reminder", category: "utility" });
  const tables = {
    memberships: both("viewer", "operator"),
    playbooks: [],
    // Each message holds a version on every channel the playbook below is kept on: the check asks that a tick be held.
    templates: [
      reminder,
      tpl("77777777-7777-4777-8777-777777777776", B, { channel: "email", name: "visit_reminder" }),
      tpl("77777777-7777-4777-8777-777777777777", B, { channel: "sms", name: "visit_reminder" }),
      tpl(T4, B, { name: "month_offer", category: "marketing" }),
      tpl("77777777-7777-4777-8777-777777777778", B, { channel: "email", name: "month_offer", category: "marketing" }),
    ],
    tenants: [{ id: B, name: "Bayside", timezone: "America/Chicago" }],
    // A calendar is connected: a new reminder is made only where one is (D44).
    tenant_config: [
      { tenant_id: B, config: { calendar: { ical_url: "https://calendar.example/bayside.ics" } }, version: 1 },
    ],
    decisions: [],
  };
  const body = { trigger: "visit_tomorrow", template_id: T1, params: [] };
  // By email too: the check has no readiness (a run holds the people it cannot reach), only what the message may be and
  // that it holds a version of one of the ticks.
  const made = await playbooks.POST.run(
    send("POST", { ...body, channels: ["whatsapp", "email"] }, inB),
    ctxFor(tables),
  );
  const row = tables.playbooks.find((p) => p.id === made.id);
  assert.deepEqual(row.channels, ["whatsapp", "email"]);
  assert.deepEqual(tables.decisions.at(-1).payload.channels, ["whatsapp", "email"], "the ledger says the channels");
  // Naming none is WhatsApp alone, and the door is told so: it lands with its migration (00357), long after the column's
  // (00298), so a start names every column it writes. A second reminder at the moment the first sends at is refused (a
  // twin would message each person twice), so the first is paused before it.
  await refused(playbooks.POST.run(send("POST", body, inB), ctxFor(tables)), "conflict", 409);
  row.state = "paused";
  const plain = await playbooks.POST.run(send("POST", body, inB), ctxFor(tables));
  // Turned on again while the second runs at its moment: refused the same way, and nothing written.
  await refused(
    playbook.PUT.run(send("PUT", { state: "running" }), ctxFor(tables, { id: made.id })),
    "conflict",
    409,
    "already sends at this moment",
  );
  assert.equal(row.state, "paused", "still paused");
  const before = tables.playbooks.find((p) => p.id === plain.id);
  assert.deepEqual(before.channels, ["whatsapp"], "WhatsApp alone when none is named");
  assert.deepEqual(tables.decisions.at(-1).payload.channels, ["whatsapp"]);
  // An offer is by WhatsApp alone.
  await refused(
    playbooks.POST.run(
      send("POST", { trigger: "everyone_monthly", template_id: T4, params: [], channels: ["sms"] }, inB),
      ctxFor(tables),
    ),
    "validation",
    400,
    "Texts carry no offers.",
  );
  await refused(
    playbooks.POST.run(send("POST", { ...body, channels: ["fax"] }, inB), ctxFor(tables)),
    "validation",
    400,
    "Pick WhatsApp, text or email to send by.",
  );
  // An edit that names no channels keeps them (the playbook is checked by the ones it has); one that names them rewrites.
  const rewritten = await playbook.PUT.run(send("PUT", { ...body, name: "Renamed" }), ctxFor(tables, { id: made.id }));
  assert.equal(rewritten.name, "Renamed");
  assert.deepEqual(tables.playbooks.find((p) => p.id === made.id).channels, ["whatsapp", "email"], "kept, never reset");
  await playbook.PUT.run(send("PUT", { ...body, channels: ["sms"] }), ctxFor(tables, { id: made.id }));
  assert.deepEqual(tables.playbooks.find((p) => p.id === made.id).channels, ["sms"]);
  // A playbook kept on email may be changed to an offer: its run holds the people it cannot reach by email until the
  // workspace can send offers by it (the composer's tick says why). Text is the channel an offer is never carried on.
  await playbook.PUT.run(send("PUT", { ...body, channels: ["email"] }), ctxFor(tables, { id: made.id }));
  await playbook.PUT.run(
    send("PUT", { trigger: "everyone_monthly", template_id: T4, params: [] }),
    ctxFor(tables, { id: made.id }),
  );
  assert.deepEqual(tables.playbooks.find((p) => p.id === made.id).channels, ["email"], "kept, never reset");
  await playbook.PUT.run(send("PUT", { ...body, channels: ["sms"] }), ctxFor(tables, { id: made.id }));
  await refused(
    playbook.PUT.run(
      send("PUT", { trigger: "everyone_monthly", template_id: T4, params: [] }),
      ctxFor(tables, { id: made.id }),
    ),
    "validation",
    400,
    "Texts carry no offers.",
  );
  // One made before the channels has none to keep, and an edit leaves it on WhatsApp without naming the column.
  const old = pb(K1, B, {
    name: "Old",
    template_name: "visit_reminder",
    trigger: "visit_tomorrow",
    policy_class: "booking",
  });
  tables.playbooks.push(old);
  await playbook.PUT.run(send("PUT", { ...body, name: "Old, renamed" }), ctxFor(tables, { id: K1 }));
  assert.equal(tables.playbooks.find((p) => p.id === K1).name, "Old, renamed");
  assert.ok(
    !("channels" in tables.playbooks.find((p) => p.id === K1)) ||
      tables.playbooks.find((p) => p.id === K1).channels === undefined,
  );
});
