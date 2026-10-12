/**
 * The world campaign-ledger.db.test.mjs reads: a workspace with its two messages and its playbook (`lab`), the rows a
 * campaign leaves (`run`, `person`, `send`, `hold`, `reply`, `decide`), `ledger` to read it, and the brief's busy week
 * (`busyWeek`), whose every answer the first test spells out. Rows are written as the senders leave them: a run made
 * before it sends, a person with their one conversation, a message per send.
 */
import {
  HOUR,
  contactRow,
  conversationRow,
  dayAt,
  db,
  insert,
  iso,
  messageRow,
  ok,
  recipientRow,
  workspace,
  ymd,
} from "./_answers-world.mjs";

export const MINUTE = 60_000;
export const ZONE = "Pacific/Auckland";
export const PHONE = "+1 555 0100";
export const sum = (rows, field) => rows.reduce((total, row) => total + row[field], 0);

/** A workspace with the two messages (templates) its runs send and the playbook its moments belong to. */
export async function lab(slug, timezone = "UTC") {
  const w = await workspace(slug, timezone);
  const messages = {};
  for (const name of ["winback_offer", "spring_note"]) {
    const row = { tenant_id: w.tenantId, channel: "whatsapp", name, language: "en_US", meta_status: "approved" };
    messages[name] = ok(await db.from("templates").insert(row).select("id").single()).id;
  }
  const playbook = {
    tenant_id: w.tenantId,
    name: "Win-back",
    trigger: "quiet_30",
    template_id: messages.winback_offer,
    template_name: "winback_offer",
    template_language: "en_US",
    params: [],
    policy_class: "reengage",
    state: "running",
  };
  return { ...w, messages, playbook: ok(await db.from("playbooks").insert(playbook).select("id").single()).id };
}

/** A run: a `moment` (a playbook's), a one-off `broadcast` or a `reach_out` step, made at `created`, for `at`. */
export async function run(
  l,
  {
    name,
    kind,
    created,
    at,
    state = "sent",
    failure = null,
    template = "winback_offer",
    lang = "en_US",
    startedAt = at,
    audience = null,
    playbook = kind === "moment",
  },
) {
  const told =
    audience ??
    {
      moment: { kind: "playbook", id: l.playbook, label: name, trigger: "quiet_30" },
      broadcast: { kind: "everyone" },
      reach_out: { kind: "reach_out", label: name },
    }[kind];
  const row = {
    tenant_id: l.tenantId,
    name,
    template_id: l.messages[template] ?? l.messages.winback_offer,
    template_name: template,
    template_language: lang,
    audience: told,
    state,
    failure,
    scheduled_for: iso(at),
    started_at: state === "sent" ? iso(startedAt) : null,
    created_at: iso(created),
    playbook_id: playbook ? l.playbook : null,
    run_for: playbook ? ymd(at) : null,
  };
  return ok(await db.from("broadcasts").insert(row).select("id").single(), `run ${name}`).id;
}

/** A person with their one conversation. */
export async function person(l) {
  const [contact, conversation] = [crypto.randomUUID(), crypto.randomUUID()];
  await insert("contacts", contactRow(l, contact));
  await insert("conversations", conversationRow(l, conversation, contact, Date.now()));
  return { contact, conversation };
}

/** A person a run sent to at `at`: the message, the way it ended, and the run's record of it. */
export async function send(
  l,
  runId,
  p,
  { at, channel = "whatsapp", status = "delivered", error = null, recipient = channel },
) {
  const message = crypto.randomUUID();
  const row = messageRow(l, message, { conversation: p.conversation, contact: p.contact, channel, at });
  await insert("messages", { ...row, status, error });
  await insert(
    "broadcast_recipients",
    recipientRow(l, { run: runId, contact: p.contact, message, at, channel: recipient }),
  );
  return message;
}

/** A person a run did not send to: no message, no time of their own. */
export const hold = (l, runId, p, { state = "skipped", reason = null, channel = "whatsapp" }) =>
  insert("broadcast_recipients", {
    tenant_id: l.tenantId,
    broadcast_id: runId,
    contact_id: p.contact,
    state,
    reason,
    message_id: null,
    sent_at: null,
    channel,
  });

/** What the person wrote back, in their own words. */
export const reply = (l, p, at) =>
  insert("messages", {
    tenant_id: l.tenantId,
    conversation_id: p.conversation,
    contact_id: p.contact,
    channel: "whatsapp",
    direction: "inbound",
    sender: "customer",
    type: "text",
    body: "yes please",
    status: "received",
    meta: {},
    created_at: iso(at),
  });

/** One message in a person's thread that is not a campaign's own: `direction`, `sender` and `meta` as the writer left them. */
export const say = (l, p, { at, direction = "inbound", sender = "customer", channel = "whatsapp", meta = {} }) =>
  insert("messages", {
    tenant_id: l.tenantId,
    conversation_id: p.conversation,
    contact_id: p.contact,
    channel,
    direction,
    sender,
    type: "text",
    body: "an ordinary line",
    status: direction === "inbound" ? "received" : "sent",
    meta,
    created_at: iso(at),
  });

/** A person erased after a run sent to them: a tombstone, their thread and messages gone, the run's record of it kept. */
export async function erase(l, p) {
  ok(
    await db
      .from("contacts")
      .update({ erased_at: iso(Date.now()) })
      .eq("id", p.contact)
      .select("id"),
  );
  ok(await db.from("conversations").delete().eq("id", p.conversation).select("id"));
}

/** A decision about a run: an approval (`payload.approved`), a send written with the run, a cancel. */
export const decide = (l, runId, verb, at, payload = {}) =>
  insert("decisions", {
    tenant_id: l.tenantId,
    subject_type: "broadcast",
    subject_id: runId,
    verb,
    actor_type: "user",
    payload,
    created_at: iso(at),
  });

export const ledger = async (l, args = {}) =>
  ok(await db.rpc("campaign_ledger", { p_tenant_id: l.tenantId, p_days: 7, ...args }), "campaign_ledger");

/** The brief's busy week: three runs that sent, three that stopped, one reach-out step, and the period before. */
export async function busyWeek(slug) {
  const l = await lab(slug);
  const now = Date.now();
  const who = {};
  for (const name of ["A", "B", "C", "D", "E", "N", "G", "H", "I", "J", "K", "L", "F", "L2", "M2p", "G2"]) {
    who[name] = await person(l);
  }
  const sends = []; // the window's, with whether each was answered
  const M1 = await run(l, { name: "Win-back", kind: "moment", created: dayAt(5, 8), at: dayAt(5, 9, 40) });
  const m1 = { at: dayAt(5, 9, 40) };
  await send(l, M1, who.A, { ...m1 });
  await send(l, M1, who.B, { ...m1, status: "read" });
  await send(l, M1, who.C, { ...m1, channel: "email" });
  await send(l, M1, who.D, { ...m1, channel: "sms", status: "failed", error: { carrier: "undelivered", code: 30003 } });
  const e = { errors: [{ code: 131049 }], body: `Call ${PHONE} about it` };
  await send(l, M1, who.E, { ...m1, status: "failed", error: e });
  await send(l, M1, who.N, { ...m1, status: "failed", error: { errors: [{ code: 131049 }] } });
  sends.push(
    ...[true, true, false, false, false, false].map((replied) => ({ at: m1.at, replied })), // A, B, C, D, E, N
  );
  await hold(l, M1, who.G, { reason: "opted_out" });
  await hold(l, M1, who.H, { reason: "no_phone" });
  await hold(l, M1, who.I, { state: "failed", reason: "send_failed" });
  await hold(l, M1, who.J, { reason: `Not sent: call ${PHONE} to ask why` });
  await reply(l, who.A, dayAt(5, 9, 54));
  await reply(l, who.B, dayAt(4, 15, 40));
  await decide(l, M1, "send_broadcast", dayAt(5, 9, 30), { approved: true });

  const B1 = await run(l, {
    name: "Spring note",
    kind: "broadcast",
    template: "spring_note",
    created: dayAt(4, 7),
    at: dayAt(4, 10),
  });
  const b1 = { at: dayAt(4, 10) };
  await send(l, B1, who.A, b1);
  await send(l, B1, who.K, b1);
  await send(l, B1, who.L, { ...b1, channel: "sms" });
  sends.push({ at: b1.at, replied: true }, { at: b1.at, replied: true }, { at: b1.at, replied: false });
  await reply(l, who.A, dayAt(4, 12));
  await reply(l, who.K, dayAt(4, 10, 20));
  await decide(l, B1, "send_broadcast", dayAt(4, 7), {}); // written with the run: no wait
  await decide(l, B1, "send_broadcast", dayAt(4, 7, 55), { approved: true });
  await decide(l, B1, "cancel_broadcast", dayAt(4, 7, 30), { was: "pending_approval" });

  const M2 = await run(l, {
    name: "Win-back",
    kind: "moment",
    created: now - 90 * MINUTE,
    at: now - 65 * MINUTE,
  });
  await send(l, M2, who.F, { at: now - 60 * MINUTE });
  sends.push({ at: now - 60 * MINUTE, replied: false });

  const stopped = [
    ["moment", "failed", "paused", dayAt(3, 9)],
    ["broadcast", "failed", "wire_unavailable:sms", dayAt(2, 14)],
    ["moment", "canceled", null, dayAt(4, 9)],
    ["reach_out", "failed", "paused", dayAt(3, 11)],
    ["moment", "failed", "paused", dayAt(10, 12)], // before the window
  ];
  const stoppedRuns = [];
  for (const [kind, state, failure, at] of stopped) {
    const name = `Stopped ${kind}`;
    stoppedRuns.push(await run(l, { name, kind, state, failure, created: at - HOUR, at }));
  }
  // The reach-out step was approved twenty hours after it was made, and then stopped: a wait counts for any kind of run.
  const RO = stoppedRuns[stopped.findIndex(([kind]) => kind === "reach_out")];
  await decide(l, RO, "send_broadcast", dayAt(3, 10) + 20 * HOUR, { approved: true, reach_out: true });

  const PM = await run(l, { name: "Win-back", kind: "moment", created: dayAt(9, 8), at: dayAt(9, 10) });
  const pm = { at: dayAt(9, 10) };
  await send(l, PM, who.A, pm);
  await send(l, PM, who.L2, { ...pm, channel: "sms" });
  await send(l, PM, who.M2p, { ...pm, status: "failed", error: { errors: [{ code: 131049 }] } });
  await hold(l, PM, who.G2, { reason: "opted_out" });
  await reply(l, who.A, dayAt(9, 11));
  await decide(l, PM, "send_broadcast", dayAt(9, 9), { approved: true });
  return { l, who, sends, runs: { M1, B1, M2, PM } };
}
