/**
 * Open now by the business's own night, a kept mark served from our own storage, the rail's sequences, and a row
 * named without its search's words (the live run of 14 Nov 2026).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { leadRowOf } from "@chanlytics/contracts";
import {
  parseLeadsRoute,
  toLeadPeekVM,
  toLeadRowVM,
  leadRail,
  leadsStanding,
  leadMapPlot,
  leadMapNote,
  leadTodayLine,
  leadHoursShort,
  leadMarkSrc,
  leadQuestionTitle,
  leadQuestionRoute,
  leadQuestionMail,
  LEAD_QUESTION_WAIT_LINE,
} from "../../../../packages/contracts/src/leads/leads.ts";
import { COUNTS, NOW, SEARCH_A, SEARCH_B, SEARCH_DONE, TZ, row, searchWith } from "./_vm.mjs";

// D8: today as an owner about to call asks it -- are they open now -- and the week in as few characters as say it.
// NOW is 2:20 PM on a Friday in America/Chicago.
test("today says whether they are open now, a night past midnight is the day it began, and hours are said short", () => {
  const at = (hours, iso = NOW.toISOString()) => leadTodayLine(hours, TZ, new Date(iso));
  const fri = (h) => [
    { day: "Thursday", hours: "Closed" },
    { day: "Friday", hours: h },
  ];
  assert.equal(at(fri("9 AM to 6 PM")), "Open until 6 PM");
  assert.equal(at(fri("4:30 PM to 11 PM")), "Opens 4:30 PM", "not open yet: when they open");
  assert.equal(at(fri("7 AM to 1 PM")), "Closed now", "shut for the day");
  assert.equal(at(fri("Closed")), "Closed today");
  assert.equal(at(fri("Open 24 hours")), "Open 24 hours");
  assert.equal(at(fri("11 AM to 2 PM, 5 PM to 10 PM")), "Open today · 11–2, 5–10 PM", "two runs keep both, short");
  assert.equal(at(fri("by appointment")), "Open today · by appointment", "words the parser cannot read are kept");
  assert.equal(at([{ day: "Monday", hours: "9 AM to 6 PM" }]), null, "a listing silent about today says nothing");
  assert.equal(at([]), null);
  // 1 AM Saturday in Chicago: Friday's night is still running.
  const late = "2026-09-19T06:00:00.000Z";
  assert.equal(
    at(
      [
        { day: "Friday", hours: "5 PM to 2 AM" },
        { day: "Saturday", hours: "5 PM to 2 AM" },
      ],
      late,
    ),
    "Open until 2 AM",
    'not "Opens 5 PM" while the doors are open',
  );
  assert.equal(
    at(
      [
        { day: "Friday", hours: "5 PM to 11 PM" },
        { day: "Saturday", hours: "5 PM to 2 AM" },
      ],
      late,
    ),
    "Opens 5 PM",
    "a night that ended before midnight holds nothing over",
  );

  assert.deepEqual(
    [
      "10 AM to 6 PM",
      "5 PM to 10 PM",
      "8 AM to 11 AM",
      "5 PM to 2 AM",
      "9:30 AM to 5:30 PM",
      "Open 24 hours",
      "Closed",
      "by appointment",
    ].map(leadHoursShort),
    ["10–6", "5–10 PM", "8–11 AM", "5 PM–2 AM", "9:30–5:30", "24 hours", "Closed", "by appointment"],
    "morning into afternoon says neither half; one half says it once; into the night says both",
  );
});

// D6: the row's tile and the peek's band draw the same three stacked layers -- the business's own mark over the
// listing's photograph over initials. They drifted apart once because each surface kept the
// photo somewhere different, so the shape itself is the thing to hold: one tile, the same keys, the same values.
test("the two surfaces wear one tile: the peek's is the row's, mark and photograph and all", () => {
  const dto = row({
    image_url: "https://lh3.example/p.jpg",
    mark_url:
      "https://project.supabase.co/storage/v1/object/public/lead-marks/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png",
  });
  const r = toLeadRowVM(dto, TZ, NOW).tile;
  const p = toLeadPeekVM(dto, SEARCH_DONE, TZ, NOW).tile;
  assert.deepEqual(
    Object.keys(p).sort(),
    Object.keys(r).sort(),
    "one shape, so neither surface can grow a layer the other cannot draw",
  );
  assert.deepEqual(p, r, "and one set of values, so the mark and the photograph are the same on both");
  assert.deepEqual(
    [p.logo, p.image],
    [
      "https://project.supabase.co/storage/v1/object/public/lead-marks/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png",
      "https://lh3.example/p.jpg",
    ],
    "both reach the peek through the tile, not beside it",
  );
  assert.equal(
    toLeadPeekVM(row(), SEARCH_DONE, TZ, NOW).tile.image,
    null,
    "and a lead whose listing gave no photograph carries none",
  );
});

// D5: the same leads, on the ground. A plot of one town, measured in metres from one centre -- no projection of
// the world, no tile, and no request to anybody.
test("D5: the map plots every lead the door placed, and the area the search asked for, in one square", () => {
  const AREA = {
    kind: "city",
    label: "Austin, TX",
    state: "TX",
    center: { lat: 30.2672, lng: -97.7431 },
    radius_m: 8000,
    query: "Austin, TX, USA",
  };
  const at = (id, lat, lng) => ({ id, point: { lat, lng } });
  const plot = leadMapPlot(
    [at("a", 30.2672, -97.7431), at("b", 30.3122, -97.7431), at("c", 30.2672, -97.6912), { id: "d", point: null }],
    AREA,
  );
  assert.deepEqual(
    plot.pins.map((p) => p.id),
    ["a", "b", "c"],
    "a lead the source placed nowhere is not on it",
  );
  const a = plot.pins[0];
  assert.deepEqual(
    [Math.round(a.x * 1000) / 1000, Math.round(a.y * 1000) / 1000],
    [0.5, 0.5],
    "the centre of the area is the centre of the square",
  );
  assert.ok(plot.pins[1].y < 0.5, "north is up");
  assert.ok(plot.pins[2].x > 0.5, "east is right");
  assert.deepEqual(plot.ring, { x: 0.5, y: 0.5, r: plot.ring.r }, "the area sits where its centre is");
  assert.ok(plot.ring.r > 0.4 && plot.ring.r < 0.5, "and fills the square with a margin, never touching its edge");
  assert.deepEqual([plot.spanM > 8000 * 2, plot.center], [true, AREA.center]);
  // A search with no centre yet: the leads alone make the picture, and no ring is drawn.
  const loose = leadMapPlot([at("a", 30.2672, -97.7431), at("b", 30.2772, -97.7431)], { ...AREA, center: null });
  assert.equal(loose.ring, null);
  // The square sits on the middle of the leads, not on whichever came first (Ruben, 10 Oct 2026).
  assert.deepEqual([loose.pins.length, loose.center], [2, { lat: (30.2672 + 30.2772) / 2, lng: -97.7431 }]);
  // One lead alone is a place, not a pinpoint; nothing placed at all is no plot.
  assert.equal(leadMapPlot([at("a", 30.2672, -97.7431)], null).spanM, 1120);
  assert.deepEqual(leadMapPlot([{ id: "d", point: null }], null), {
    pins: [],
    ring: null,
    spanM: 0,
    tooWide: false,
    center: null,
  });

  // Six searches in six cities are not one place. Without an area to anchor the square it is drawn from the leads
  // themselves, and on production that made one square four thousand miles across with every city as a dot.
  const far = [
    { id: "pdx", point: { lat: 45.52, lng: -122.68 } },
    { id: "mia", point: { lat: 25.77, lng: -80.19 } },
  ];
  const wide = leadMapPlot(far, null);
  assert.equal(wide.tooWide, true, "arithmetically honest and useless: say so instead of drawing it");
  assert.match(leadMapNote(wide, false), /^These leads are spread too far apart/);
  // One city is one place, area or no area.
  const close = leadMapPlot(
    [
      { id: "a", point: { lat: 45.52, lng: -122.68 } },
      { id: "b", point: { lat: 45.54, lng: -122.62 } },
    ],
    null,
  );
  assert.equal(close.tooWide, false);
  // One search with no centre: the leads are the picture, and no line says so (Ruben, 10 Oct 2026).
  assert.equal(leadMapNote(close, true), "", "a city ask has no centre until its probe measures one");
  assert.equal(leadMapNote(close, false), "Every lead these searches placed on the ground.");
  // An area always anchors the square, however wide the search asked to look.
  const anchored = leadMapPlot(far, {
    kind: "city",
    label: "Portland, OR",
    state: "OR",
    center: { lat: 45.52, lng: -122.68 },
    radius_m: 25_000,
    query: "Portland, OR",
  });
  assert.equal(anchored.tooWide, false, "the area is the anchor, so the square means something");
  assert.equal(leadMapNote(anchored, true), "The area this search asked for, and every lead it placed inside it.");
});

// 00161: a lead's mark draws from our own storage, on the Supabase origin the content policy already allows, and
// only a name the collect wrote becomes an address: whatever else the column held could never reach an <img>.
test("a kept mark is served from the project's own storage, and only a name we wrote is ever an address", () => {
  const NAME = `${"0f".repeat(32)}.png`;
  assert.equal(
    leadMarkSrc("https://abcd.supabase.co", NAME),
    `https://abcd.supabase.co/storage/v1/object/public/lead-marks/${NAME}`,
  );
  assert.equal(
    leadMarkSrc("https://abcd.supabase.co/", NAME),
    `https://abcd.supabase.co/storage/v1/object/public/lead-marks/${NAME}`,
    "the origin, however the variable was written",
  );
  assert.equal(
    leadMarkSrc("http://127.0.0.1:54321", NAME),
    `http://127.0.0.1:54321/storage/v1/object/public/lead-marks/${NAME}`,
    "the local stack serves over http",
  );
  for (const [base, name, why] of [
    ["https://abcd.supabase.co", null, "no copy"],
    ["https://abcd.supabase.co", "https://zilkerstrength.example/logo.png", "a site's own address"],
    ["https://abcd.supabase.co", `../${NAME}`, "a name that climbs out of the bucket"],
    ["https://abcd.supabase.co", `${"0f".repeat(32)}.svg`, "a kind we never keep"],
    ["https://abcd.supabase.co", `${"0F".repeat(32)}.png`, "a hash not as we spell it"],
    ["http://abcd.supabase.co", NAME, "an origin a page served over https could not draw from"],
    ["", NAME, "no origin"],
    [undefined, NAME, "an unset variable"],
    ["not a url", NAME, "a variable that is not an address"],
  ])
    assert.equal(leadMarkSrc(base, name), null, why);
});

// The bell's row (00163 writes the title in SQL), the strip's line, the address it opens and the email: one set of
// words for the one moment a search stops to ask.
test("a question's words are said once: the bell's title, the wait line, where it opens, and the email", () => {
  assert.equal(
    leadQuestionTitle("wedding photographers"),
    "Your search for wedding photographers is waiting for your answer",
  );
  assert.equal(
    LEAD_QUESTION_WAIT_LINE,
    "Nothing is spent while this waits. With no answer in a day, it stops and keeps what it found.",
  );
  assert.equal(leadQuestionRoute("s1"), "clients/leads:s-s1:c-excluded", "the pile the question is about");
  assert.deepEqual(parseLeadsRoute(leadQuestionRoute(SEARCH_A)).cls, "excluded", "and the page reads it back");
  const sentence = "Some of the first 16 are large studio chains, which I'm leaving out. Is that what you meant?";
  const link = "https://app.example.com/w/harbor#/clients/leads:s-s1:c-excluded";
  const m = leadQuestionMail({ name: "wedding photographers", sentence, link });
  assert.equal(m.subject, "Your search for wedding photographers is waiting for your answer");
  assert.equal(m.body, [sentence, "", LEAD_QUESTION_WAIT_LINE, "", `Answer it: ${link}`].join("\n"));
});

test("a row's Source says where its facts came from: a Maps listing, a business directory, or the owner's own list", () => {
  assert.equal(toLeadRowVM(row(), TZ, NOW).source, "Google Maps listing");
  assert.equal(toLeadRowVM(row({ kind: "company", place_id: null }), TZ, NOW).source, "Business directory");
  assert.equal(toLeadRowVM(row({ place_id: null }), TZ, NOW).source, "Your list");
});

test("the rail draws a sequence's own list with the sequences, apart from the search its leads came from, and the head counts no more", () => {
  const search = searchWith({ id: SEARCH_A, name: "Agency owners" }, { counted: 20 });
  const list = searchWith({ id: SEARCH_B, name: "Agency owners", via: "chosen", sequence_list: true }, { counted: 20 });
  const empty = searchWith(
    { id: "00000000-0000-4000-8000-0000000000c3", name: "Auto shops", via: "chosen", sequence_list: true },
    { counted: 0 },
  );
  const own = searchWith(
    { id: "00000000-0000-4000-8000-0000000000c4", name: "Expo gyms", via: "import" },
    { counted: 4 },
  );
  const rail = leadRail(COUNTS, [search, list, empty, own], NOW);
  assert.deepEqual(
    rail.searches.map((s) => s.name),
    ["Agency owners", "Expo gyms"],
    "a list of the owner's own stays a search",
  );
  assert.deepEqual(
    rail.sequences.map((s) => [s.name, s.count]),
    [["Agency owners", 20]],
    "one with nobody added by hand is no row: its 0 said nobody was in a sequence that had people",
  );
  assert.deepEqual(
    leadRail(COUNTS, [search, list, empty, own], NOW, empty.id).sequences.map((s) => s.name),
    ["Agency owners", "Auto shops"],
    "unless it is the one open",
  );
  assert.deepEqual(leadRail(COUNTS, [search], NOW).sequences, [], "a server before 00496 says none");
  assert.deepEqual(
    leadsStanding(COUNTS, [search, list, empty, own]).parts,
    ["272 not contacted"],
    "the head counts no searches at all: the rail and the Lists sheet list them",
  );
});

test("a row reads its status group, and none where the read asked none", () => {
  const groupOf = (over) => leadRowOf(row(over), "UTC", new Date("2026-11-05T12:00:00Z")).statusGroup;
  assert.equal(groupOf({ status_group: "needs" }), "needs");
  assert.equal(groupOf({ status_group: null }), null);
  assert.equal(groupOf({}), null, "a server before 00552 says nothing of it");
});

test("REGRESSION (the live run of 14 Nov 2026): over one search, the count of every lead says it is every lead", () => {
  // "120 leads · 104 not contacted" stood over a search that had found none yet.
  assert.equal(leadsStanding(COUNTS, [SEARCH_DONE], true).total, `${COUNTS.all} leads in all`);
  assert.equal(leadsStanding(COUNTS, [SEARCH_DONE]).total, `${COUNTS.all} leads`, "over every search, as it was");
});

test("REGRESSION (the live run of 14 Nov 2026): a row says a business's name without the search words its listing strings after a bar", () => {
  const shown = (name) => toLeadRowVM(row({ business_name: name }), TZ, NOW).name;
  assert.equal(shown("Unique Clinique Aesthetics | Med Spa Brooklyn"), "Unique Clinique Aesthetics");
  assert.equal(
    shown("Next Level Aesthetics - Brooklyn Med Spa | Facials | Microneedling"),
    "Next Level Aesthetics - Brooklyn Med Spa",
  );
  assert.equal(shown("SYLK MEDSPA"), "SYLK MEDSPA", "a name with no bar is as it is");
  assert.equal(shown(" | Med Spa"), " | Med Spa", "a name that is only a tail is said whole");
});

test("REGRESSION (the live run of 14 Nov 2026): two searches of one name are listed by their places, one of its own by its name", () => {
  const at = (id, name, label) => ({
    ...SEARCH_DONE,
    id,
    name,
    plan: { ...SEARCH_DONE.plan, area: { ...SEARCH_DONE.plan.area, label } },
  });
  const searches = [
    at("s-bk", "med spas", "Brooklyn, NY"),
    at("s-ny", "med spas", "New York, NY"),
    at("s-pt", "Personal trainers", "Austin, TX"),
  ];
  const rail = leadRail(COUNTS, searches, NOW);
  assert.deepEqual(
    ["s-bk", "s-ny", "s-pt"].map((id) => rail.searches.find((r) => r.id === id)?.name),
    ["med spas · Brooklyn, NY", "med spas · New York, NY", "Personal trainers"],
  );
});
