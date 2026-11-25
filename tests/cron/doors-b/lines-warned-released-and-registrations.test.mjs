/**
 * Lines warned, a warning's mail owed and capped, a release the voice provider refuses, and registrations whose
 * token the vault does not hold.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { LOW_VOLUME_USECASE } from "@chanlytics/channels/lines";
import { fieldsOf, logLineOf } from "../../_log-lines.mjs";
import {
  DAY,
  FILING,
  HOUR,
  NOW,
  RECORD,
  SUB,
  SUB_AUTH,
  VAULT,
  VAULT_TOKEN,
  ago,
  answer,
  basic,
  endedWorld,
  knock,
  rpcs,
  silent,
  tenant,
  tenantRow,
  twilioPath,
  updatesOf,
  use,
  uuid,
  waiting,
  wired,
  withEnv,
} from "./_doors-b.mjs";

test("lines (A2): a warning whose mail fails is owed, not kept -- one bell row, the mail alone tried again the next quarter hour, and the week runs from the warning that reached them (the wiring's second audit, S6-1)", async () => {
  const { T, own, tables } = endedWorld(355);
  use(tables, VAULT_TOKEN);
  let mailUp = false;
  const net = wired((req) => {
    if (req.url === "https://api.resend.com/emails")
      return mailUp ? { status: 200, body: { id: "email-1" } } : { status: 500, body: { message: "down" } };
    throw new Error(`unexpected ${req.method} ${req.url}`);
  });
  await withEnv({ LINE_RELEASE_AFTER_DAYS: "30" }, async () => {
    const [s1, b1] = await answer(await knock("lines"));
    assert.equal(s1, 200);
    assert.deepEqual(b1.release, {
      ended: 1,
      due: 0,
      warned: 0,
      undelivered: 1,
      released: 0,
      failed: 0,
      report_only: false,
    });
    assert.equal(tables.lines.find((l) => l.id === own).facts.release_warning, undefined, "not warned: not kept");
    assert.equal(tables.notifications.length, 1, "the bell has the warning");
    assert.ok(tables.notifications[0].mail_due_at, "and says its mail is owed");
    // One failed mail pages nobody: the first try is kept on the line, and the platform hears only after a day of it.
    assert.deepEqual(
      net.mail().map((m) => m.to),
      [["owner@example.com"]],
    );
    assert.equal(tables.lines.find((l) => l.id === own).facts.release_warning_tried.ended_at, ago(40 * DAY));

    // The provider is back: the same row, its mail sent alone, and the warning kept now.
    mailUp = true;
    const [, b2] = await answer(await knock("lines"));
    assert.deepEqual(b2.release, {
      ended: 1,
      due: 0,
      warned: 1,
      undelivered: 0,
      released: 0,
      failed: 0,
      report_only: false,
    });
    assert.equal(tables.notifications.length, 1, "no second row on the bell");
    assert.equal(tables.notifications[0].mail_due_at, null, "its mail went");
    assert.deepEqual(
      net.mail().map((m) => m.to),
      [["owner@example.com"], ["owner@example.com"]],
    );
    const warned = tables.lines.find((l) => l.id === own).facts.release_warning;
    assert.ok(warned, "kept once the owner was told");
    assert.ok(
      Date.parse(warned.on) >= Date.parse(warned.at) + 7 * DAY - 1000,
      "a week after the warning that reached them",
    );

    // The next quarter hour: warned, and nothing more is said.
    const [, b3] = await answer(await knock("lines"));
    assert.deepEqual(b3.release, {
      ended: 1,
      due: 0,
      warned: 0,
      undelivered: 0,
      released: 0,
      failed: 0,
      report_only: false,
    });
    assert.equal(net.mail().length, 2);
    assert.equal(tables.notifications.filter((n) => n.tenant_id === T).length, 1);
  });
});

test("lines (A2): a workspace with no address the warning can be mailed to has it on its bell, kept, and the platform hears that a number goes with nobody told", async () => {
  const { T, own, tables } = endedWorld(357);
  tables.tenant_config[0].config.notifications = {};
  use(tables, VAULT_TOKEN);
  const net = wired((req) => {
    if (req.url === "https://api.resend.com/emails") return { status: 200, body: { id: "email-1" } };
    throw new Error(`unexpected ${req.method} ${req.url}`);
  });
  await withEnv({ LINE_RELEASE_AFTER_DAYS: "30" }, async () => {
    const [, b1] = await answer(await knock("lines"));
    assert.deepEqual(b1.release, {
      ended: 1,
      due: 0,
      warned: 1,
      undelivered: 0,
      released: 0,
      failed: 0,
      report_only: false,
    });
  });
  assert.ok(tables.lines.find((l) => l.id === own).facts.release_warning);
  assert.equal(tables.notifications.filter((n) => n.tenant_id === T).length, 1);
  const platform = net.mail().filter((m) => m.subject.startsWith("A number goes back with nobody told"));
  assert.equal(platform.length, 1);
  assert.deepEqual(platform[0].to, ["ops@platform.test"]);
});

test("lines (A2): when the platform's alert for a workspace nobody can be mailed at does not go, the warning is not kept, and the next quarter hour says the alert again and keeps it (the review's N3)", async () => {
  const { T, own, tables } = endedWorld(358);
  tables.tenant_config[0].config.notifications = {};
  use(tables, VAULT_TOKEN);
  let mailUp = false;
  const net = wired((req) => {
    if (req.url === "https://api.resend.com/emails")
      return mailUp ? { status: 200, body: { id: "email-1" } } : { status: 500, body: { message: "down" } };
    throw new Error(`unexpected ${req.method} ${req.url}`);
  });
  const nobodyTold = () => net.mail().filter((m) => m.subject.startsWith("A number goes back with nobody told"));
  await withEnv({ LINE_RELEASE_AFTER_DAYS: "30" }, async () => {
    const [, b1] = await answer(await knock("lines"));
    assert.deepEqual(b1.release, {
      ended: 1,
      due: 0,
      warned: 0,
      undelivered: 1,
      released: 0,
      failed: 0,
      report_only: false,
    });
    assert.equal(tables.lines.find((l) => l.id === own).facts.release_warning, undefined, "not kept: nobody heard");
    assert.equal(nobodyTold().length, 1, "the alert was tried");
    mailUp = true;
    const [, b2] = await answer(await knock("lines"));
    assert.deepEqual(b2.release, {
      ended: 1,
      due: 0,
      warned: 1,
      undelivered: 0,
      released: 0,
      failed: 0,
      report_only: false,
    });
    assert.ok(tables.lines.find((l) => l.id === own).facts.release_warning, "kept once the platform heard");
    assert.equal(nobodyTold().length, 2, "said again, and it went");
    assert.equal(tables.notifications.filter((n) => n.tenant_id === T).length, 1, "the bell's row once");
  });
});

test("lines (A2): at most ten warnings are asked for a quarter hour, told or not, so a mailer that is down costs a tick ten tries; the rest are asked on the next (the review's N5)", async () => {
  const { tables } = endedWorld(380);
  // Eleven more ended workspaces like the first, each with its own number and its owner on file.
  const base = {
    tenant: tables.tenants[0],
    bill: tables.billing_accounts[0],
    cfg: tables.tenant_config[0],
    line: tables.lines[0],
  };
  for (let i = 1; i <= 11; i++) {
    const t = tenant(380 * 100 + i);
    tables.tenants.push({ ...base.tenant, id: t, slug: `ended-${i}` });
    tables.billing_accounts.push({ ...base.bill, tenant_id: t });
    tables.tenant_config.push({ ...base.cfg, tenant_id: t });
    tables.lines.push({
      ...base.line,
      id: uuid(380 * 100 + i),
      tenant_id: t,
      e164: `+1305555${String(2000 + i)}`,
      created_at: new Date(Date.parse(base.line.created_at ?? ago(60 * DAY)) + i * 1000).toISOString(),
      facts: {},
    });
  }
  use(tables, VAULT_TOKEN);
  let mailUp = false;
  const net = wired((req) => {
    if (req.url === "https://api.resend.com/emails")
      return mailUp ? { status: 200, body: { id: "email-1" } } : { status: 500, body: { message: "down" } };
    throw new Error(`unexpected ${req.method} ${req.url}`);
  });
  const owners = () => net.mail().filter((m) => m.subject.startsWith("Your number")).length;
  await withEnv({ LINE_RELEASE_AFTER_DAYS: "30" }, async () => {
    const [, b1] = await answer(await knock("lines"));
    assert.equal(b1.release.warned, 0);
    assert.equal(b1.release.undelivered, 10, "ten asked, none told");
    assert.equal(owners(), 10, "ten tries of the owners' mail, not twelve");
    assert.equal(net.mail().length, 10, "and nothing else: no page for a first failure");
    mailUp = true;
    const [, b2] = await answer(await knock("lines"));
    assert.equal(b2.release.warned, 10);
    const [, b3] = await answer(await knock("lines"));
    assert.equal(b3.release.warned, 2, "the rest, a quarter hour on");
  });
});

test("lines (A2): a warning that has failed for a day pages the platform that the number is held only because its warning reaches nobody, once per pager window (the review's N2)", async () => {
  const { own, tables } = endedWorld(359);
  const line = tables.lines.find((l) => l.id === own);
  line.facts = { ...line.facts, release_warning_tried: { at: ago(2 * DAY), ended_at: ago(40 * DAY) } };
  tables.operator_pages = [];
  use(tables, VAULT_TOKEN);
  const net = wired((req) => {
    if (req.url === "https://api.resend.com/emails") {
      const to = JSON.parse(req.body).to;
      return to.includes("owner@example.com") ? { status: 500, body: { message: "down" } } : { status: 200, body: {} };
    }
    throw new Error(`unexpected ${req.method} ${req.url}`);
  });
  const pages = () =>
    net.mail().filter((m) => m.subject.includes("A number is held: its warning has not reached the owner"));
  await withEnv({ LINE_RELEASE_AFTER_DAYS: "30" }, async () => {
    const [, b1] = await answer(await knock("lines"));
    assert.equal(b1.release.undelivered, 1);
    assert.equal(pages().length, 1, "a day of failing: paged");
    assert.deepEqual(pages()[0].to, ["ops@platform.test"]);
    await answer(await knock("lines"));
    assert.equal(pages().length, 1, "once per pager window, not each quarter hour");
  });
});

test("lines (A2): a warning whose recipients cannot be read is not taken for one with nobody to tell: nothing is kept, an owed mail stays owed, and no 'nobody told' alert goes (the review's N1)", async () => {
  const { own, tables } = endedWorld(361);
  use(tables, VAULT_TOKEN);
  let mailUp = false;
  const net = wired((req) => {
    if (req.url === "https://api.resend.com/emails")
      return mailUp ? { status: 200, body: { id: "email-1" } } : { status: 500, body: { message: "down" } };
    throw new Error(`unexpected ${req.method} ${req.url}`);
  });
  await withEnv({ LINE_RELEASE_AFTER_DAYS: "30" }, async () => {
    await answer(await knock("lines"));
    assert.ok(tables.notifications[0].mail_due_at, "the mail is owed");
    // The next quarter hour, the workspace's settings cannot be read.
    mailUp = true;
    use(tables, VAULT_TOKEN, { "tenant_config.select": { message: "statement timeout" } });
    const [, b2] = await answer(await knock("lines"));
    assert.equal(b2.release.warned, 0);
    assert.equal(b2.release.undelivered, 1);
    assert.equal(tables.lines.find((l) => l.id === own).facts.release_warning, undefined, "not kept");
    assert.ok(tables.notifications[0].mail_due_at, "still owed");
    assert.equal(net.mail().filter((m) => m.subject.startsWith("A number goes back with nobody told")).length, 0);
    // Read again, it goes.
    use(tables, VAULT_TOKEN);
    const [, b3] = await answer(await knock("lines"));
    assert.equal(b3.release.warned, 1);
  });
});

test("lines (A2): a release Retell refuses stops before the carrier, keeps the row for the next quarter hour, and the platform hears", async () => {
  const { own, tables } = endedWorld(360);
  const line = tables.lines.find((l) => l.id === own);
  line.facts = { ...line.facts, release_warning: { at: ago(8 * DAY), ended_at: ago(40 * DAY), on: ago(DAY) } };
  use(tables, VAULT_TOKEN);
  const net = wired((req) => {
    if (req.url === "https://api.resend.com/emails") return { status: 200, body: { id: "email-1" } };
    if (req.url.startsWith("https://api.retellai.com/")) return { status: 500, body: { message: "down" } };
    throw new Error(`unexpected ${req.method} ${req.url}`);
  });
  await withEnv({ LINE_RELEASE_AFTER_DAYS: "30" }, async () => {
    const [, body] = await answer(await knock("lines"));
    assert.deepEqual(body.release, {
      ended: 1,
      due: 1,
      warned: 0,
      undelivered: 0,
      released: 0,
      failed: 1,
      report_only: false,
    });
  });
  assert.ok(
    tables.lines.some((l) => l.id === own),
    "the row stands until every step answers",
  );
  assert.equal(tables.tenant_channels[0].status, "active");
  assert.deepEqual(
    net.mail().map((m) => [m.to, m.subject]),
    [[["ops@platform.test"], `[Chanlytics] A number could not be given back (workspace ${tenant(360)})`]],
  );
  assert.match(net.mail()[0].text, /Retell delete-phone-number: HTTP 500/);
});

test("registrations: nothing with the carriers is a quiet 200; both waiting states are asked about, least recently asked first, and only lines with a filing; every line asked about is written, moved or not, and the owner hears on the change", async () => {
  const T = tenant(400);
  const quiet = use(
    {
      tenants: [tenantRow(T)],
      lines: [waiting(T, uuid(400), { brand_sid: null })],
      business_records: [],
      notifications: [],
      events: [],
    },
    VAULT,
  );
  const nothing = silent("nothing filed, nothing to ask about");
  await withEnv(FILING, async () => {
    assert.deepEqual(await answer(await knock("registrations")), [200, { ok: true, checked: 0 }]);
  });
  assert.equal(nothing.calls.length, 0);
  assert.equal(rpcs(quiet, "get_line_credentials").length, 0);

  const approved = uuid(401),
    registering = uuid(402),
    unfiled = uuid(403),
    active = uuid(404);
  const tables = {
    tenants: [tenantRow(T)],
    lines: [
      waiting(T, approved, {
        sms_state: "approved",
        brand_sid: "BN0002",
        messaging_service_sid: "MG0002",
        campaign_sid: "QE0001",
        updated_at: ago(HOUR),
      }),
      waiting(T, registering, { updated_at: ago(3 * HOUR) }),
      waiting(T, unfiled, { brand_sid: null, updated_at: ago(5 * HOUR) }),
      waiting(T, active, {
        sms_state: "active",
        brand_sid: "BN0003",
        campaign_sid: "QE0003",
        updated_at: ago(9 * HOUR),
      }),
    ],
    // The business on record, complete: were the sweep to file for the 'approved'
    // line -- whose campaign is already with the carriers -- nothing before the
    // wire would stop it.
    business_records: [{ tenant_id: T, ...RECORD }],
    notifications: [],
    events: [],
  };
  const db = use(tables, VAULT);
  const carrier = wired((req) => {
    if (req.url.endsWith("/BrandRegistrations/BN0001"))
      return { status: 200, body: { status: "IN_PROGRESS", failure_reason: null } };
    if (req.url.endsWith("/BrandRegistrations/BN0002"))
      return { status: 200, body: { status: "APPROVED", failure_reason: null } };
    if (req.url.endsWith("/Services/MG0001/Compliance/Usa2p"))
      return { status: 200, body: { compliance: [], meta: {} } };
    if (req.url.endsWith("/Services/MG0002/Compliance/Usa2p"))
      return {
        status: 200,
        body: { compliance: [{ sid: "QE0001", campaign_status: "VERIFIED", mock: false, errors: [] }], meta: {} },
      };
    throw new Error(`unexpected ${req.method} ${req.url}`);
  });
  await withEnv(FILING, async () => {
    assert.deepEqual(await answer(await knock("registrations")), [
      200,
      { ok: true, checked: 2, campaigns_filed: 0, states_moved: 1, unreadable: 0 },
    ]);
  });
  assert.deepEqual(
    carrier.calls.map((c) => [c.method, twilioPath(c.url)]),
    [
      ["GET", "a2p/BrandRegistrations/BN0001"],
      ["GET", "Services/MG0001/Compliance/Usa2p"],
      ["GET", "a2p/BrandRegistrations/BN0002"],
      ["GET", "Services/MG0002/Compliance/Usa2p"],
    ],
    "least recently asked about first; 'approved' is still waiting on the last check, and its campaign, already with the carriers, is not filed again; a line with no brand and a line already active are not asked",
  );
  assert.ok(
    carrier.calls.every((c) => c.headers.Authorization === SUB_AUTH),
    "read as the workspace's own subaccount",
  );

  const row = (id) => tables.lines.find((l) => l.id === id);
  assert.equal(row(approved).sms_state, "active", "a verified campaign IS the permission");
  assert.ok(Date.parse(row(approved).state_since) >= NOW, "the clock restarts on a move");
  assert.equal(row(registering).sms_state, "registering");
  assert.equal(
    row(registering).state_since,
    ago(3 * DAY),
    "no move, no new clock: Setup keeps saying how long the carriers have had it",
  );
  assert.equal(row(registering).last_error, null);
  // Written even so. The sweep reads the least recently asked first, and in
  // Postgres every write moves updated_at -- so a line that was asked about
  // goes to the back of the queue whether or not the carriers had news.
  assert.deepEqual(
    updatesOf(db, "lines").map((u) => u.filters.find(([, col]) => col === "id")[2]),
    [registering, approved],
    "every line asked about is written",
  );
  assert.deepEqual(
    tables.notifications.map((n) => [n.tenant_id, n.kind, n.title, n.route, n.subject_type, n.subject_id]),
    [[T, "number", "Texting is on: +1 (305) 555-0100", "admin/integrations", "line", approved]],
    "told once, on the change",
  );
  assert.deepEqual(
    tables.events.map((e) => [e.tenant_id, e.kind, e.subject_id, e.data.from, e.data.to, e.data.mock]),
    [[T, "line.texting_on", approved, "approved", "active", false]],
  );
});

test("registrations: a refused campaign is still asked about, so one corrected and resubmitted in Twilio's console turns texting on and its owner hears; a refused line whose campaign was taken off is not asked about at all, so the sweep never files one for it", async () => {
  // 5 Oct 2026: the Chanlytics campaign was revised in the console after its ninth refusal and approved there, and the
  // row still said `rejected` weeks later -- the sweep asked only about the two waiting states, so nothing read it
  // again, and the workspace's texting stayed off for a filing the carriers had passed.
  const T = tenant(410);
  const resubmitted = uuid(411),
    still = uuid(412),
    bare = uuid(413);
  const tables = {
    tenants: [tenantRow(T)],
    lines: [
      waiting(T, resubmitted, {
        sms_state: "rejected",
        last_error: "provided Opt-in information (30896 · MESSAGE_FLOW)",
        brand_sid: "BN0011",
        messaging_service_sid: "MG0011",
        campaign_sid: "QE0011",
        updated_at: ago(5 * HOUR),
      }),
      waiting(T, still, {
        sms_state: "rejected",
        last_error: "the carriers sent the registration back",
        brand_sid: "BN0012",
        messaging_service_sid: "MG0012",
        campaign_sid: "QE0012",
        updated_at: ago(3 * HOUR),
      }),
      // Refused, its campaign taken off and never replaced: the brand is approved and nothing is on file, which for a
      // waiting line means "file it now". For a refused one it is the owner's to decide, and a new filing is a fee.
      waiting(T, bare, {
        sms_state: "rejected",
        brand_sid: "BN0013",
        messaging_service_sid: "MG0013",
        campaign_sid: null,
        updated_at: ago(HOUR),
      }),
    ],
    business_records: [{ tenant_id: T, ...RECORD }],
    notifications: [],
    events: [],
  };
  use(tables, VAULT);
  const carrier = wired((req) => {
    if (/\/BrandRegistrations\/BN001[123]$/.test(req.url))
      return { status: 200, body: { status: "APPROVED", failure_reason: null } };
    if (req.url.endsWith("/Services/MG0011/Compliance/Usa2p"))
      return {
        status: 200,
        body: { compliance: [{ sid: "QE0011", campaign_status: "VERIFIED", mock: false, errors: [] }], meta: {} },
      };
    if (req.url.endsWith("/Services/MG0012/Compliance/Usa2p"))
      return {
        status: 200,
        body: {
          compliance: [
            {
              sid: "QE0012",
              campaign_status: "FAILED",
              mock: false,
              errors: [{ error_code: 30896, description: "provided Opt-in information", fields: ["MESSAGE_FLOW"] }],
            },
          ],
          meta: {},
        },
      };
    if (req.url.endsWith("/Services/MG0013/Compliance/Usa2p"))
      return { status: 200, body: { compliance: [], meta: {} } };
    throw new Error(`unexpected ${req.method} ${req.url}`);
  });
  await withEnv(FILING, async () => {
    const [status, body] = await answer(await knock("registrations"));
    assert.equal(status, 200);
    assert.equal(body.checked, 2, "every refused line with a campaign on file, and only those");
    assert.equal(body.campaigns_filed, 0, "and none is filed for");
  });
  assert.ok(
    carrier.calls.every((c) => c.method === "GET"),
    "nothing but reads: a refused line's campaign is never filed, replaced or deleted by the sweep",
  );
  const row = (id) => tables.lines.find((l) => l.id === id);
  assert.equal(row(resubmitted).sms_state, "active", "passed in the console: texting is on");
  assert.equal(row(resubmitted).last_error, null, "and the old refusal is cleared");
  assert.equal(row(still).sms_state, "rejected", "still refused: still refused");
  assert.ok(
    !carrier.calls.some((c) => c.url.includes("BN0013") || c.url.includes("MG0013")),
    "a refused line with no campaign on file is not asked about: read as 'brand approved, nothing filed', the next hour would file one, a fee its owner never chose",
  );
  assert.equal(row(bare).sms_state, "rejected", "and it stays refused until its owner replaces the campaign");
  assert.deepEqual(
    tables.notifications.map((n) => [n.kind, n.title, n.subject_id]),
    [["number", "Texting is on: +1 (305) 555-0100", resubmitted]],
    "the owner hears once, for the one that moved",
  );
});

test("registrations: a line the vault holds no token for is written to (last_error) so it moves down the queue instead of holding the page for ever; a refused token is re-read as the parent and kept; every line unreadable is a 503 for the sweep's watcher, some readable a 200", async () => {
  const T = tenant(401);
  const noToken = uuid(411),
    noSub = uuid(412);
  const tables = {
    tenants: [tenantRow(T)],
    lines: [
      waiting(T, noToken, { updated_at: ago(4 * HOUR) }),
      waiting(T, noSub, { subaccount_sid: null, updated_at: ago(3 * HOUR) }),
    ],
    business_records: [],
    notifications: [],
    events: [],
  };
  const db = use(tables, { get_line_credentials: () => ({}) });
  const nothing = silent("without credentials nothing can be asked");
  await withEnv(FILING, async () => {
    assert.deepEqual(
      await answer(await knock("registrations")),
      [503, { ok: false, error: "no_registration_readable", checked: 2, unreadable: 2 }],
      "the sweep ran and learned nothing: our credentials, not the carriers",
    );
  });
  for (const l of tables.lines) {
    assert.equal(
      l.last_error,
      "could not read the registration: the line has no credentials on file",
      "the reason on the row, and a write that moves it down the list",
    );
    assert.equal(l.sms_state, "registering", "the state is not guessed at");
    assert.equal(l.state_since, ago(3 * DAY));
  }
  assert.deepEqual(
    updatesOf(db, "lines").map((u) => u.filters.find(([, col]) => col === "id")[2]),
    [noToken, noSub],
  );
  assert.deepEqual(
    rpcs(db, "get_line_credentials").map((s) => s.args),
    [{ p_line_id: noToken }],
    "a line with no subaccount is not asked of the vault at all",
  );
  assert.equal(nothing.calls.length, 0);
  assert.deepEqual([tables.notifications, tables.events], [[], []], "nothing to tell the owner: nothing was learned");

  // A token rotated in the provider's console: our copy answers 401, the
  // platform re-reads it as the parent and writes it back through the one write
  // path, and asks again. A subaccount the parent does not know stays unreadable.
  const rotated = uuid(413),
    dead = uuid(414);
  const healed = {
    tenants: [tenantRow(T)],
    lines: [
      waiting(T, rotated, { updated_at: ago(4 * HOUR) }),
      waiting(T, dead, { subaccount_sid: "ACsub9999999999999999999999999999", updated_at: ago(3 * HOUR) }),
    ],
    business_records: [],
    notifications: [],
    events: [],
  };
  const kept = [];
  use(healed, {
    get_line_credentials: () => ({ auth_token: "stale-token" }),
    put_line_credentials: (a) => {
      kept.push(a);
      return null;
    },
  });
  const MASTER = basic(FILING.TWILIO_ACCOUNT_SID, FILING.TWILIO_AUTH_TOKEN);
  const carrier = wired((req) => {
    if (req.url.startsWith("https://api.twilio.com/2010-04-01/Accounts/")) {
      if (req.headers.Authorization !== MASTER) return { status: 401, body: { code: 20003, message: "Authenticate" } };
      return req.url.endsWith(`/${SUB}.json`)
        ? { status: 200, body: { sid: SUB, auth_token: "fresh-token" } }
        : { status: 404, body: { code: 20404, message: "The requested resource was not found" } };
    }
    if (req.headers.Authorization === basic(SUB, "fresh-token")) {
      if (req.url.endsWith("/BrandRegistrations/BN0001")) return { status: 200, body: { status: "IN_PROGRESS" } };
      if (req.url.endsWith("/Compliance/Usa2p")) return { status: 200, body: { compliance: [], meta: {} } };
    }
    return { status: 401, body: { code: 20003, message: "Authenticate" } };
  });
  await withEnv(FILING, async () => {
    assert.deepEqual(
      await answer(await knock("registrations")),
      [200, { ok: true, checked: 2, campaigns_filed: 0, states_moved: 0, unreadable: 1 }],
      "some readable is a 200: the one that failed carries its reason on the row",
    );
  });
  const who = (c) =>
    c.headers.Authorization === MASTER
      ? "master"
      : c.headers.Authorization === basic(SUB, "stale-token")
        ? "stale"
        : c.headers.Authorization === basic(SUB, "fresh-token")
          ? "fresh"
          : "other";
  assert.deepEqual(
    carrier.calls.map((c) => [twilioPath(c.url), who(c)]),
    [
      ["a2p/BrandRegistrations/BN0001", "stale"],
      ["Services/MG0001/Compliance/Usa2p", "stale"],
      [`Accounts/${SUB}.json`, "master"],
      ["a2p/BrandRegistrations/BN0001", "fresh"],
      ["Services/MG0001/Compliance/Usa2p", "fresh"],
      ["a2p/BrandRegistrations/BN0001", "other"],
      ["Services/MG0001/Compliance/Usa2p", "other"],
      ["Accounts/ACsub9999999999999999999999999999.json", "master"],
    ],
    "one attempt, then heal as the parent, then one more; the unknown subaccount is refused at the parent and not asked again",
  );
  assert.deepEqual(
    kept,
    [{ p_line_id: rotated, p_secret: { auth_token: "fresh-token" } }],
    "the fresh token goes back into the vault, for this line, through the one write path",
  );
  assert.equal(healed.lines[0].last_error, null, "read, and nothing wrong with it");
  assert.equal(
    healed.lines[1].last_error,
    "could not read the registration: the texting provider would not give this number's sign-in (HTTP 404)",
    "a subaccount the parent does not know is the provider's no about that line, said as that: nobody is sent to the platform's key for it (a 401 at the parent is the platform's credentials, and is worded so)",
  );
});

test("registrations: once the carriers approve the brand, the campaign they were holding is filed by the sweep — as the subaccount, from this deployment's own pages: /b/<slug> as the privacy policy and its /terms, /yes/<slug> in the flow — and the owner hears the brand is through", async () => {
  const T = tenant(402);
  const id = uuid(420);
  const tables = {
    tenants: [tenantRow(T)],
    lines: [waiting(T, id)],
    business_records: [{ tenant_id: T, ...RECORD }],
    // A plan that may spend on texting (the sweep asks the owner's own rules before it files: X4-8).
    billing_accounts: [{ tenant_id: T, mode: "stripe", status: "active" }],
    notifications: [],
    events: [],
  };
  const db = use(tables, VAULT);
  const carrier = wired((req) => {
    if (req.url.endsWith("/BrandRegistrations/BN0001"))
      return { status: 200, body: { status: "APPROVED", failure_reason: null } };
    if (req.method === "GET" && req.url.endsWith("/Services/MG0001/Compliance/Usa2p"))
      return { status: 200, body: { compliance: [], meta: {} } };
    if (req.method === "POST" && req.url.endsWith("/Services/MG0001/Compliance/Usa2p"))
      return { status: 201, body: { sid: "QE0009", campaign_status: "PENDING" } };
    throw new Error(`unexpected ${req.method} ${req.url}`);
  });
  await withEnv(FILING, async () => {
    assert.deepEqual(await answer(await knock("registrations")), [
      200,
      { ok: true, checked: 1, campaigns_filed: 1, states_moved: 1, unreadable: 0 },
    ]);
  });
  assert.deepEqual(
    carrier.calls.map((c) => [c.method, twilioPath(c.url)]),
    [
      ["GET", "a2p/BrandRegistrations/BN0001"],
      ["GET", "Services/MG0001/Compliance/Usa2p"],
      ["POST", "Services/MG0001/Compliance/Usa2p"],
    ],
    "read both, then file the one thing that was waiting",
  );
  assert.ok(
    carrier.calls.every((c) => c.headers.Authorization === SUB_AUTH),
    "read and filed as the workspace's subaccount",
  );
  const filed = new URLSearchParams(carrier.calls[2].body);
  assert.equal(filed.get("BrandRegistrationSid"), "BN0001", "under the brand the carriers approved, not a new one");
  assert.equal(filed.get("UsAppToPersonUsecase"), LOW_VOLUME_USECASE);
  // The same pages as a filing made at the door: this is the one filing that
  // finishes with nobody watching, and 30907 asks that the privacy policy be on
  // the opt-in page's domain and 30919 that it identify the business -- the
  // page we publish for this workspace, not ours.
  assert.equal(filed.get("PrivacyPolicyUrl"), "https://dash.test/b/harbor-moving");
  assert.equal(filed.get("TermsAndConditionsUrl"), "https://dash.test/b/harbor-moving/terms");
  const flow = filed.get("MessageFlow");
  assert.ok(
    flow.includes("(https://dash.test/yes/harbor-moving), public:") &&
      flow.includes("(https://dash.test/yes/harbor-moving/form), public:"),
    "the flow names this workspace's sign-up page and its paper form, whole and delimited",
  );
  assert.ok(
    flow.endsWith("Privacy policy: https://dash.test/b/harbor-moving. Terms: https://dash.test/b/harbor-moving/terms."),
    "linked in the flow too (30908, 30909)",
  );
  assert.ok(
    filed
      .get("Description")
      .startsWith(
        "Messages are sent by Harbor Moving LLC, doing business as Harbor Moving, to its own customers and prospects who opted in. A moving company in Brooklyn",
      ),
    "who sends to whom, then what the business does, so a reviewer can tell what kind of business sends (30919, 22 Sep 2026), in the shape the carriers approved (5 Oct 2026)",
  );
  assert.equal(filed.getAll("MessageSamples").length, 5);

  const row = tables.lines[0];
  assert.deepEqual(
    [row.campaign_sid, row.sms_state, row.reg_mock, row.reg_step, row.last_error],
    ["QE0009", "registering", false, null, null],
    "with the carriers again, for the campaign this time; a campaign filed for a real brand is real",
  );
  assert.ok(Date.parse(row.state_since) >= NOW, "a new wait, a new clock");
  assert.deepEqual(
    rpcs(db, "get_line_credentials").map((s) => s.args),
    [{ p_line_id: id }, { p_line_id: id }],
    "the read and the filing each take the subaccount's token from the vault",
  );
  assert.deepEqual(
    tables.notifications.map((n) => [n.tenant_id, n.kind, n.title, n.subject_id]),
    [[T, "number", "Your business is approved by the carriers", id]],
    "the slow half is through; the owner is told once",
  );
  assert.match(tables.notifications[0].body, /^\+1 \(305\) 555-0100 is through the slow half\./);
  assert.deepEqual(
    tables.events.map((e) => [e.kind, e.data.from, e.data.to, e.data.mock]),
    [["line.texting_approved", "registering", "approved", false]],
  );

  // Without our own approved primary profile nothing may be filed; the state the carriers reported still lands on the row.
  const bare = {
    tenants: [tenantRow(T)],
    lines: [waiting(T, uuid(421))],
    business_records: [{ tenant_id: T, ...RECORD }],
    // A plan that may spend on texting (the sweep asks the owner's own rules before it files: X4-8).
    billing_accounts: [{ tenant_id: T, mode: "stripe", status: "active" }],
    notifications: [],
    events: [],
  };
  use(bare, VAULT);
  const reads = wired((req) => {
    if (req.url.endsWith("/BrandRegistrations/BN0001")) return { status: 200, body: { status: "APPROVED" } };
    if (req.method === "GET" && req.url.endsWith("/Compliance/Usa2p"))
      return { status: 200, body: { compliance: [], meta: {} } };
    throw new Error(`nothing may be filed: ${req.method} ${req.url}`);
  });
  await withEnv({ ...FILING, TWILIO_PRIMARY_PROFILE_SID: undefined }, async () => {
    assert.deepEqual(await answer(await knock("registrations")), [
      200,
      { ok: true, checked: 1, campaigns_filed: 0, states_moved: 1, unreadable: 0 },
    ]);
  });
  assert.equal(reads.calls.filter((c) => c.method === "POST").length, 0);
  assert.deepEqual(
    [bare.lines[0].sms_state, bare.lines[0].campaign_sid],
    ["approved", null],
    "the wait is recorded honestly; the next tick with the profile files it",
  );
});

test("registrations: the campaign an approved brand was holding is not filed for a workspace that has paused or ended since, or whose plan may not spend on texting: it waits, said in the log, and is filed once the workspace may (the wiring's second audit, X4-8)", async () => {
  for (const [n, over, why] of [
    [0, { tenant: { status: "paused" }, bill: { status: "active" } }, "paused"],
    [1, { tenant: { left_empty_at: ago(DAY) }, bill: { status: "active" } }, "ended"],
    [2, { bill: { status: "canceled" } }, "paused"],
    // A trial files (decision 0090: the trial covers everything); a card that failed does not.
    [3, { bill: { status: "past_due" } }, "payment_required"],
    [4, { bill: null }, "no_billing_record"],
  ]) {
    const T = tenant(430 + n);
    const id = uuid(4300 + n);
    const tables = {
      tenants: [tenantRow(T, over.tenant ?? {})],
      lines: [waiting(T, id)],
      business_records: [{ tenant_id: T, ...RECORD }],
      billing_accounts: over.bill ? [{ tenant_id: T, mode: "stripe", ...over.bill }] : [],
      notifications: [],
      events: [],
    };
    use(tables, VAULT);
    const carrier = wired((req) => {
      if (req.url.endsWith("/BrandRegistrations/BN0001")) return { status: 200, body: { status: "APPROVED" } };
      if (req.method === "GET" && req.url.endsWith("/Compliance/Usa2p"))
        return { status: 200, body: { compliance: [], meta: {} } };
      throw new Error(`nothing may be filed (${why}): ${req.method} ${req.url}`);
    });
    // The sweep's own lines, read back: the hold is said in the log with its reason, and counted (the operator's signal).
    const said = [];
    const wasLog = console.log;
    console.log = (...args) => {
      const line = logLineOf(args);
      if (line) said.push(line);
      else wasLog(...args);
    };
    try {
      await withEnv(FILING, async () => {
        assert.deepEqual(
          await answer(await knock("registrations")),
          [200, { ok: true, checked: 1, campaigns_filed: 0, states_moved: 1, unreadable: 0 }],
          why,
        );
      });
    } finally {
      console.log = wasLog;
    }
    assert.deepEqual(
      said.filter((l) => l.event === "registration_filing_held").map((l) => [fieldsOf(l).tenant_id, fieldsOf(l).why]),
      [[T, why]],
      why,
    );
    assert.equal(said.find((l) => l.event === "registration_sweep")?.campaigns_held, 1, `${why}: counted`);
    assert.equal(carrier.calls.filter((c) => c.method === "POST").length, 0, `${why}: nothing filed, nothing spent`);
    assert.deepEqual([tables.lines[0].sms_state, tables.lines[0].campaign_sid], ["approved", null], why);

    // The workspace runs again on a plan that may spend: the next tick files it.
    if (n === 0) {
      tables.tenants[0].status = "active";
      const filing = wired((req) => {
        if (req.url.endsWith("/BrandRegistrations/BN0001")) return { status: 200, body: { status: "APPROVED" } };
        if (req.method === "GET" && req.url.endsWith("/Compliance/Usa2p"))
          return { status: 200, body: { compliance: [], meta: {} } };
        if (req.method === "POST" && req.url.endsWith("/Compliance/Usa2p"))
          return { status: 201, body: { sid: "QE0010", campaign_status: "PENDING" } };
        throw new Error(`unexpected ${req.method} ${req.url}`);
      });
      await withEnv(FILING, async () => {
        const [, body] = await answer(await knock("registrations"));
        assert.equal(body.campaigns_filed, 1, "open again: filed");
      });
      assert.equal(filing.calls.filter((c) => c.method === "POST").length, 1);
    }
  }
});
