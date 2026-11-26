/**
 * Notifications (decision 0040): what the workspace is told and where each goes, a member's own phone ticks, every save
 * with its version, and one save at a time.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ALERT_TOPICS, ALERT_PANE_WORDS, alertGrid } from "@chanlytics/contracts";
import {
  PHONE,
  alertVerbs,
  alertsRead,
  all,
  buttonSaying,
  byTestId,
  find,
  flashes,
  flush,
  labelled,
  openEmail,
  press,
  restoreVerbs,
  saved,
  settings,
  settingsHeld,
  settle,
  textOf,
  ticks,
  type,
  workspace,
} from "./_settings-owner-panes.mjs";

/* ------------------------------ Notifications (decision 0040) ------------------------------ */

test("F32: a config the parser refuses closes every notifications write, and says why on each", () => {
  // The bridge reads a refused config as its own state: no config, and what was wrong (bridge/surfaces/settings.ts).
  workspace("owner", {
    record: { role: "owner", version: 3, config: null, broken: { issues: ["brain.business_name"] } },
  });
  alertsRead(null);
  // Nothing was read, so no address: the email row is open by itself, and says nobody is emailed.
  const tree = settings("notifications");
  const why = "Couldn't load this workspace's settings. Chanlytics has to fix them before anything here can change.";
  const add = buttonSaying(tree, "Add");
  const box = labelled(tree, "input", ALERT_PANE_WORDS.addLabel);
  assert.equal(box.props.disabled, true, "nothing can be typed to save over the broken row");
  assert.equal(box.props.title, why);
  type(box, "new@northside.example");
  const typed = settle("notifications");
  assert.equal(buttonSaying(typed, "Add").props.disabled, true, "and Add stays closed with an address typed");
  assert.equal(add.props.title, why);
  assert.equal(buttonSaying(tree, "Remove"), null, "nothing was read, so there is nothing to remove");
  assert.ok(textOf(tree).includes(ALERT_PANE_WORDS.emailNobody));
  // What the business is emailed is held the same way: the tick says why, and saves nothing.
  const tick = byTestId(typed, "ntf-email-call");
  assert.equal(tick.props["data-tip"], why);
  press(tick);
  assert.equal(saved.length, 0);
});

test("Notifications: what the workspace is told, a topic a row in its group, where each goes beside it; nothing of Chanlytics' own, and no tick no code reads (0040)", () => {
  workspace("owner");
  alertsRead({ push_off: [], phones: [], choosable: true });
  const tree = settings("notifications");
  const grid = byTestId(tree, "ntf-grid");
  // No phone: the topics with nothing to choose (no email, no phone of theirs) are named in the bell's line instead.
  const groups = alertGrid({
    notifications: settingsHeld().config.notifications,
    emailHeld: null,
    phone: null,
    ads: false,
  });
  assert.deepEqual(
    groups.map((g) => g.group),
    ["needs_you", "worth_knowing"],
  );
  for (const g of groups) {
    const body = byTestId(grid, `ntf-group-${g.group}`);
    assert.ok(textOf(body).startsWith(g.title), `${g.title} heads its rows`);
    assert.deepEqual(
      all(body, (n) => /^ntf-topic-/.test(n.props?.["data-testid"] ?? "")).map((n) =>
        n.props["data-testid"].slice("ntf-topic-".length),
      ),
      g.rows.map((r) => r.topic.key),
      `${g.title}: contracts' topics, in order`,
    );
  }
  assert.ok(
    textOf(tree).includes(
      "Also on the bell: replies about to go, finished searches, new Google reviews, notes left for you,",
    ),
    "the bell's line names them",
  );
  // The two the receptionist must always reach someone with are locked: a switch drawn on that takes no press, saying why.
  for (const key of ["handoff", "deadman"]) {
    const row = byTestId(grid, `ntf-topic-${key}`);
    const lock = find(row, (n) => n.props?.role === "switch");
    assert.equal(lock?.props["data-tip"], ALERT_PANE_WORDS.always, key);
    assert.deepEqual([lock.props["aria-checked"], lock.props["aria-readonly"]], [true, true], `${key}: on, and held`);
    assert.equal(byTestId(row, `ntf-email-${key}`), null, `${key}: nothing to turn off`);
  }
  // Every other emailed topic is the kit's switch, on until the business turns it off; and no phone column without a
  // phone. Ads' own is drawn only where Campaigns › Ads is, which it is not here.
  assert.deepEqual(
    ticks(grid, "email").map((n) => [n.props["data-testid"], n.props["aria-checked"]]),
    ALERT_TOPICS.filter((t) => t.email === "choice" && t.ads !== true).map((t) => [`ntf-email-${t.key}`, true]),
  );
  assert.equal(byTestId(grid, "ntf-topic-ads"), null, "no choice about ads where no ad can run");
  assert.equal(ticks(grid, "phone").length, 0);
  assert.ok(!textOf(grid).includes(ALERT_PANE_WORDS.phoneHead), "no column of a phone nobody has");
  assert.ok(!textOf(tree).includes("to Chanlytics"), "Chanlytics' own alerts are not the workspace's");
  assert.ok(textOf(tree).includes(ALERT_PANE_WORDS.never));
  assert.equal(
    all(byTestId(tree, "ntf-channels"), (n) => n.props?.role === "switch").length,
    0,
    "a browser that cannot alert draws no switch (none can here)",
  );
});

test("where Campaigns › Ads is drawn, an ad that needs its owner is a topic under Needs you, mailed until the business turns it off (0050 call 15)", () => {
  const config = { notifications: { escalation_emails: ["dana@northside.example"] } };
  workspace("owner", { record: { role: "owner", version: 3, ads: true, config } });
  alertsRead({ push_off: [], phones: [], choosable: true });
  const grid = byTestId(settings("notifications"), "ntf-grid");
  const row = byTestId(byTestId(grid, "ntf-group-needs_you"), "ntf-topic-ads");
  assert.ok(textOf(row).startsWith("An ad needs you"));
  assert.equal(byTestId(row, "ntf-email-ads").props["aria-checked"], true, "mailed until turned off");
  const ads = ALERT_TOPICS.find((t) => t.key === "ads");
  // An ad on that AI can't answer, and ads Chanlytics paused for the workspace, are mailed the same way (00676).
  assert.deepEqual(
    [ads.kinds, ads.email, ads.phone],
    [["ad_refused", "ad_unpaid", "ad_way_in", "ads_paused"], "choice", false],
  );
});

test("a member with a phone ticks what reaches it, whatever their role; a kind no phone is told has no tick, and a choice that cannot be saved yet shows what is told (0040)", async () => {
  workspace("operator");
  alertsRead({ push_off: ["call"], phones: [PHONE], choosable: true });
  const tree = settings("notifications");
  assert.ok(textOf(byTestId(tree, "ntf-channels")).includes("iPhone"), "their phone, by what it is");
  const grid = byTestId(tree, "ntf-grid");
  assert.equal(byTestId(grid, "ntf-phone-call").props["aria-checked"], false, "turned off");
  assert.equal(byTestId(grid, "ntf-phone-handoff").props["aria-checked"], true);
  assert.equal(byTestId(grid, "ntf-phone-handoff").props["aria-disabled"], undefined, "a phone is the member's own");
  assert.equal(byTestId(grid, "ntf-phone-templates"), null, "a template's news never reaches a phone");
  assert.ok(byTestId(grid, "ntf-topic-review"), "with a phone, the topics a phone alone carries are rows");
  const asked = [];
  alertVerbs.setPushOff = async (kinds) => {
    asked.push(kinds);
    return { ok: true, message: "" };
  };
  press(byTestId(grid, "ntf-phone-review"));
  await flush();
  assert.deepEqual(asked, [["call", "review"]], "the member's list, with the rest of it kept");
  assert.equal(saved.length, 0, "and nothing of the business's config");
  restoreVerbs();
  // Where the choice cannot be saved yet (00372 not applied), the phone column says what is told and offers nothing.
  alertsRead({ push_off: [], phones: [PHONE], choosable: false });
  const told = settings("notifications");
  assert.equal(ticks(byTestId(told, "ntf-grid"), "phone").length, 0);
  assert.equal(
    all(told, (n) => n.props?.role === "switch" && n.props?.["data-tip"] === ALERT_PANE_WORDS.phoneTold).length,
    ALERT_TOPICS.filter((t) => t.phone).length,
  );
});

test("an email tick saves what the business is emailed in the whole config, with its version, and draws the answer at once (0040)", async () => {
  workspace("owner");
  alertsRead(null);
  flashes.length = 0;
  const tree = settings("notifications");
  press(byTestId(tree, "ntf-email-call"));
  await flush();
  assert.equal(saved.length, 1);
  assert.equal(saved[0].version, 3);
  assert.deepEqual(saved[0].config.notifications, {
    escalation_emails: ["dana@northside.example", "desk@northside.example"],
    email_off: ["call"],
  });
  assert.equal(saved[0].config.brain.business_name, "Northside Studio", "the rest of the config rides along");
  const after = settle("notifications");
  assert.equal(
    byTestId(after, "ntf-email-call").props["aria-checked"],
    false,
    "drawn from what the server accepted, not the read before it, which says the opposite until it is read again",
  );
  // Undo turns it back on, against the version the save answered.
  flashes.at(-1).undo();
  await flush();
  assert.equal(saved[1].version, 4);
  assert.deepEqual(saved[1].config.notifications.email_off, []);
});

test("REGRESSION (0040): Undo after Remove saves the address back with the version the remove made -- it sent the version read before, which the server refused", async () => {
  workspace("owner");
  alertsRead(null);
  flashes.length = 0;
  openEmail(settings("notifications"));
  const tree = settle("notifications");
  press(labelled(tree, "button", "Remove desk@northside.example"));
  await flush();
  assert.deepEqual(
    [saved[0].version, saved[0].config.notifications.escalation_emails],
    [3, ["dana@northside.example"]],
  );
  flashes.at(-1).undo();
  await flush();
  assert.deepEqual(
    [saved[1].version, saved[1].config.notifications.escalation_emails],
    [4, ["dana@northside.example", "desk@northside.example"]],
    "REGRESSION: it sent 3 again, and the server answered that someone else had saved",
  );
});

test("the addresses say whose they are: a teammate by name, the member's own as theirs, any other as not on the team; a teammate not emailed is one press (0040)", async () => {
  workspace("owner");
  alertsRead(null);
  openEmail(settings("notifications"));
  const tree = settle("notifications");
  const lines = all(tree, (n) => n.props?.["data-testid"] === "ntf-address").map((n) => textOf(n));
  assert.ok(lines[0].includes("dana@northside.example") && lines[0].includes("Dana · you"), lines[0]);
  assert.ok(lines[1].includes("desk@northside.example") && lines[1].includes(ALERT_PANE_WORDS.notOnTeam), lines[1]);
  // Lee is on the team and not on the list.
  const lee = labelled(tree, "button", "Email Lee too");
  assert.ok(lee);
  press(lee);
  await flush();
  assert.deepEqual(saved[0].config.notifications.escalation_emails, [
    "dana@northside.example",
    "desk@northside.example",
    "lee@northside.example",
  ]);
});

test("Send a test asks for one email to every address and says what came of it; a role that may not is not offered it (0040)", async () => {
  workspace("owner");
  alertsRead(null);
  flashes.length = 0;
  let asked = 0;
  alertVerbs.test = async () => {
    asked++;
    return { ok: true, sent: true, to: 2, why: null, message: "" };
  };
  openEmail(settings("notifications"));
  press(byTestId(settle("notifications"), "ntf-test"));
  await flush();
  assert.equal(asked, 1);
  assert.equal(textOf(flashes.at(-1).msg), "A test was sent to 2 addresses.");
  restoreVerbs();
  assert.equal(ALERT_PANE_WORDS.testNot("not_live"), "Tests are sent from the live app only, not from a preview.");
});

// B16 (audit, 2 Oct 2026): the pane said "Sent from the Chanlytics alert address until your own sending domain is
// verified". Nothing writes notifications.from, and nothing swaps the sender for a sending domain the workspace verifies
// (the sending domains are for campaigns): the sentence promised a feature there is not. It says the sender only where
// an operator set one, and never the switch that does not exist.
test("Notifications says where its mail is sent from only where one is set, and promises no sending domain that changes it (B16)", () => {
  workspace("owner");
  alertsRead(null);
  const bare = textOf(settings("notifications"));
  assert.ok(!bare.includes("Sent from"), "no own address: nothing to say beyond the alerts themselves");
  assert.ok(
    !bare.includes("until your own sending domain is verified") && !/sending domain is verified/.test(bare),
    "REGRESSION: promised a switch to the workspace's own sending domain that nothing makes",
  );
  workspace("owner", {
    record: {
      role: "owner",
      version: 3,
      config: {
        brain: { business_name: "Northside Studio" },
        notifications: { escalation_emails: ["dana@northside.example"], from: "Northside <alerts@northside.example>" },
      },
    },
  });
  const own = textOf(settings("notifications"));
  assert.ok(own.includes(ALERT_PANE_WORDS.sentFrom("Northside <alerts@northside.example>")), "the config's own");
});

test("one save at a time (review round, 0040): while one is out every other tick and the address box wait, so two presses never send two lists or one version twice", async () => {
  workspace("owner");
  alertsRead({ push_off: [], phones: [PHONE], choosable: true });
  const stood = alertVerbs.saveConfig;
  let land = null;
  alertVerbs.saveConfig = (config, version, accepted) => {
    saved.push({ config, version });
    land = () => accepted({ config, version: version + 1 });
    return Promise.resolve({ ok: true });
  };
  try {
    press(byTestId(settings("notifications"), "ntf-email-call"));
    const out = settle("notifications");
    for (const id of ["ntf-email-sweep", "ntf-phone-review"]) {
      const tick = byTestId(out, id);
      assert.equal(tick.props["aria-disabled"], true, `${id} waits`);
      assert.equal(tick.props["data-tip"], "Still saving the last change.");
      press(tick);
    }
    assert.equal(saved.length, 1, "the second press sent nothing");
    land();
    const free = settle("notifications");
    assert.equal(
      byTestId(free, "ntf-email-sweep").props["aria-disabled"],
      undefined,
      "and is free once the first lands",
    );
  } finally {
    alertVerbs.saveConfig = stood;
  }
});
