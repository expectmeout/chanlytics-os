/**
 * Ask knows a calendar the way the rest of the product does (contracts calendarFeedKeyOf, decision 0073): a calendar link,
 * or the calendar of a connected mailbox where one is granted. Its suggestions on the Line (bridge/ask/palette.ts) looked
 * for the link alone, so a business whose openings are read from its Google mailbox's calendar was never offered "What's
 * open tomorrow?", while Ask itself, asked, read those openings (server/ask/prompt/stable-system.ts). Run on the real
 * palette, over the settings surface as the settings read lands it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "../../_source.mjs";

globalThis.window ??= globalThis;
const { askPalette } = await importSrc("apps/dashboard/src/bridge/ask/palette.ts");
const { setSurfaceValue } = await importSrc("apps/dashboard/src/surfaces/surface-values.ts");

/** A tab with nothing waiting, on a workspace with a zone: what the suggestions read beside the settings. */
const tab = () => ({
  location: { pathname: "/w/studio", hash: "", assign() {} },
  __WORKSPACES: [{ id: "w1", slug: "studio", name: "Studio", status: "active", timezone: "America/New_York" }],
  __ACTIVE_WORKSPACE: "w1",
  __ME: { role: "owner" },
});
/** The settings read, landed whole (what follows it reads every part), with this config. */
const settingsAre = (config) =>
  setSurfaceValue("settings", {
    settings: { config, version: 1, role: "owner" },
    facts: null,
    templatesAll: [],
    templateVersions: [],
    messages: [],
    templateUse: null,
    templateSent: null,
    policies: null,
    team: [],
    invites: [],
  });
/** Whether Today's suggestions ask what is open tomorrow. */
const asksWhatIsOpen = () =>
  askPalette(tab(), null)
    .suggestions("today", null, "en")
    .some((s) => /open tomorrow/i.test(s.q));

test("REGRESSION: a calendar connected through a mailbox is a calendar to Ask's suggestions -- only a calendar link was", () => {
  try {
    settingsAre({ brain: {}, calendar_grant: { mailbox_id: "mb-1", provider: "google" } });
    assert.equal(asksWhatIsOpen(), true, "REGRESSION: a business on its Google calendar was never asked what is open");
    settingsAre({ brain: {}, calendar: { ical_url: "https://cal.example.com/feed.ics" } });
    assert.equal(asksWhatIsOpen(), true, "a calendar link, as it always was");
    settingsAre({ brain: {} });
    assert.equal(asksWhatIsOpen(), false, "and no calendar at all is no such question");
  } finally {
    setSurfaceValue("settings", undefined);
  }
});
