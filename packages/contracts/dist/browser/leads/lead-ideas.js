import { DAY_MS, MIN_MS } from "../shared/time.js";
import { leadKindKey, stateCode } from "./search/clean.js";
export const LEAD_IDEAS_MAX = 4;
export const LEAD_SUGGEST_RETRY_MS = 10 * MIN_MS;
export const IDEA_SIZES = [25, 50, 100, 200];
const IDEA_PLACES_MAX = 10;
const IDEA_BESIDE_MAX = 4;
const obj = (v) => v && typeof v === "object" && !Array.isArray(v) ? v : {};
const arr = (v) => Array.isArray(v) ? v : [];
const fieldText = (v) => typeof v === "string" ? v.trim() : "";
const fieldCount = (v) => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : 0;
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
};
const whenOf = (v) => {
  const t = typeof v === "string" ? Date.parse(v) : NaN;
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
};
const fieldCounts = (v) => Object.fromEntries(
  Object.entries(obj(v)).map(([k, n]) => [k, fieldCount(n)]).filter(([, n]) => n > 0)
);
export const ideaKey = leadKindKey;
function areaOf(v) {
  const a = obj(v);
  const kind = a.kind === "zip" || a.kind === "city" || a.kind === "radius" ? a.kind : null;
  const label = fieldText(a.label);
  const state = fieldText(a.state).toUpperCase();
  if (!kind || label.length < 2 || !/^[A-Z]{2}$/.test(state)) return null;
  const c = obj(a.center);
  const center = typeof c.lat === "number" && typeof c.lng === "number" ? { lat: c.lat, lng: c.lng } : null;
  const zip = /^\d{5}$/.test(fieldText(a.zip)) ? fieldText(a.zip) : null;
  if (kind === "radius" && !center || kind === "zip" && !zip) return null;
  const radius = Math.min(2e5, Math.max(500, fieldCount(a.radius_m) || 8e3));
  const query = fieldText(a.query) || `${label}, ${state}, USA`;
  return { kind, label, state, center, radius_m: radius, ...zip ? { zip } : {}, query };
}
const keyed = (v) => arr(v).map((x) => ({ key: fieldText(obj(x).key), text: fieldText(obj(x).text) })).filter((x) => x.key && x.text);
function searchOf(v) {
  const s = obj(v);
  const name = fieldText(s.name);
  if (!name) return null;
  const leads = obj(s.leads);
  const reach = obj(s.reach);
  const found = obj(s.found);
  const won = obj(s.won);
  const ending = fieldText(s.ending);
  return {
    kind: ideaKey(fieldText(s.kind) || name),
    name,
    area: areaOf(s.area),
    at: fieldText(s.at),
    removed: s.removed === true,
    ranDry: ending === "searched_everything" || ending === "few_new_matches",
    running: !!fieldText(s.state) && fieldText(s.state) !== "ended",
    fromIdea: s.from_idea === true,
    nearby: arr(s.nearby).map(areaOf).filter((a) => !!a),
    exclusions: keyed(s.exclusions),
    criteria: keyed(s.criteria),
    found: {
      qualified: fieldCount(found.qualified),
      review: fieldCount(found.review),
      excluded: fieldCount(found.excluded)
    },
    leftOut: fieldCounts(s.left_out),
    leads: {
      contacted: fieldCount(leads.contacted),
      interested: fieldCount(leads.interested),
      booked: fieldCount(leads.booked),
      customers: fieldCount(leads.customers),
      said_no: fieldCount(leads.said_no),
      not_a_fit: fieldCount(leads.not_a_fit),
      with_email: fieldCount(leads.with_email),
      with_phone: fieldCount(leads.with_phone),
      lastContactedAt: whenOf(leads.last_contacted_at)
    },
    notAFit: fieldCounts(s.not_a_fit_why),
    reach: {
      sent: fieldCount(reach.sent),
      replied: fieldCount(reach.replied),
      interested: fieldCount(reach.interested),
      declined: fieldCount(reach.declined),
      lastSentAt: whenOf(reach.last_sent_at)
    },
    won: { deals: fieldCount(won.deals), cents: fieldCount(won.cents) }
  };
}
export function ideaHistoryOf(raw) {
  const h = obj(raw);
  const home = obj(h.home);
  const state = stateCode(fieldText(home.region));
  const listing = obj(h.listing);
  return {
    basis: ideaBasisOf(h.basis),
    home: state ? {
      city: fieldText(home.city) || null,
      state,
      zip: /^\d{5}/.test(fieldText(home.zip)) ? fieldText(home.zip).slice(0, 5) : null
    } : null,
    listing: fieldText(listing.address) ? { address: fieldText(listing.address), type: fieldText(listing.type) } : null,
    searches: arr(h.searches).map(searchOf).filter((s) => !!s)
  };
}
export function ideaBasisOf(v) {
  const t = typeof v === "string" ? Date.parse(v) : NaN;
  return Number.isFinite(t) ? new Date(t).toISOString() : "";
}
function homeOfAddress(address) {
  const parts = address.split(",").map((p) => p.trim()).filter(Boolean);
  while (/^(usa|us|united states( of america)?)$/i.test(parts.at(-1) ?? "")) parts.pop();
  const last = parts.pop() ?? "";
  const m = last.match(/^([A-Za-z .]+?)\s+(\d{5})(?:-\d{4})?$/) ?? last.match(/^([A-Za-z .]+)$/);
  const state = m ? stateCode(m[1]) : null;
  if (!state) return null;
  return { city: parts.pop() || null, state, zip: m && m[2] ? m[2] : null };
}
function ideaHome(h, profileAddress) {
  return h.home ?? (h.listing ? homeOfAddress(h.listing.address) : null) ?? homeOfAddress(profileAddress);
}
const REPLIES_THAT_WORK = 0.15;
const SENT_TO_SAY = 5;
const INTERESTED_TO_SAY = 2;
const SENT_WITH_NONE = 10;
const SILENCE_DAYS = 7;
export const IDEA_PASSED_ENOUGH = 2;
const CLOSED_THAT_FAIL = 0.4;
const CLOSED_TO_SAY = 3;
const JUDGED_TO_SAY = 20;
const KEPT_THAT_FAIL = 0.15;
const laterOf = (a, b) => !a ? b : !b ? a : Date.parse(b) > Date.parse(a) ? b : a;
const daysAgo = (at, now) => at ? Math.floor((now.getTime() - Date.parse(at)) / DAY_MS) : Number.POSITIVE_INFINITY;
const addInto = (into, from) => {
  for (const [k, n] of Object.entries(from)) into[k] = (into[k] ?? 0) + n;
};
function sumOf(searches) {
  const s = {
    found: { qualified: 0, review: 0, excluded: 0 },
    leads: {
      contacted: 0,
      interested: 0,
      booked: 0,
      customers: 0,
      said_no: 0,
      not_a_fit: 0,
      with_email: 0,
      with_phone: 0
    },
    reach: { sent: 0, replied: 0, interested: 0, declined: 0 },
    won: { deals: 0, cents: 0 },
    leftOut: {},
    notAFit: {},
    removed: 0,
    running: 0,
    fromIdea: 0,
    lastSentAt: null,
    lastContactedAt: null,
    withWords: /* @__PURE__ */ new Map()
  };
  for (const x of searches) {
    const { found: f, leads: l, reach: r, won: w } = s;
    s.found = {
      qualified: f.qualified + x.found.qualified,
      review: f.review + x.found.review,
      excluded: f.excluded + x.found.excluded
    };
    s.leads = {
      contacted: l.contacted + x.leads.contacted,
      interested: l.interested + x.leads.interested,
      booked: l.booked + x.leads.booked,
      customers: l.customers + x.leads.customers,
      said_no: l.said_no + x.leads.said_no,
      not_a_fit: l.not_a_fit + x.leads.not_a_fit,
      with_email: l.with_email + x.leads.with_email,
      with_phone: l.with_phone + x.leads.with_phone
    };
    s.reach = {
      sent: r.sent + x.reach.sent,
      replied: r.replied + x.reach.replied,
      interested: r.interested + x.reach.interested,
      declined: r.declined + x.reach.declined
    };
    s.won = { deals: w.deals + x.won.deals, cents: w.cents + x.won.cents };
    addInto(s.leftOut, x.leftOut);
    addInto(s.notAFit, x.notAFit);
    if (x.removed) s.removed++;
    if (x.running) s.running++;
    if (x.fromIdea) s.fromIdea++;
    s.lastSentAt = laterOf(s.lastSentAt, x.reach.lastSentAt);
    s.lastContactedAt = laterOf(s.lastContactedAt, x.leads.lastContactedAt);
    for (const e of [...x.exclusions, ...x.criteria]) s.withWords.set(e.key, e.text);
  }
  return s;
}
function verdictOf(s, searches, now) {
  const interested = s.reach.interested + s.leads.interested;
  if (s.leads.customers + s.leads.booked + s.won.deals > 0 || interested >= INTERESTED_TO_SAY || s.reach.sent >= SENT_TO_SAY && s.reach.replied / s.reach.sent >= REPLIES_THAT_WORK)
    return "worked";
  const closed = s.leads.said_no + s.leads.not_a_fit;
  const judged = s.found.qualified + s.found.review + s.found.excluded;
  const silent = s.reach.sent >= SENT_WITH_NONE && s.reach.replied === 0;
  if (silent && daysAgo(s.lastSentAt, now) >= SILENCE_DAYS || closed >= CLOSED_TO_SAY && closed >= CLOSED_THAT_FAIL * Math.max(s.leads.contacted, 1) || judged >= JUDGED_TO_SAY && s.found.qualified + s.found.review <= KEPT_THAT_FAIL * judged || s.removed === searches)
    return "did_not_work";
  if (s.running) return "running";
  return s.leads.contacted === 0 && s.reach.sent === 0 ? "not_reached" : "too_early";
}
function leftOutWord(key, withWords) {
  if (key === "kind") return "not this kind";
  if (key === "unreachable") return "no phone or email";
  if (key === "owner") return "removed by you";
  const said = withWords.get(key);
  return said ?? key.replace(/_/g, " ");
}
const NOT_A_FIT_WORDS = {
  chain: "a chain",
  wrong_kind: "the wrong kind",
  too_far: "too far",
  customer: "already a customer",
  other: "another reason"
};
function topOf(t, word, n = 3) {
  return Object.entries(t).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, c]) => `${word(k)}: ${c}`).join(", ");
}
function agoOf(at, now) {
  const days = Math.floor((now.getTime() - Date.parse(at)) / DAY_MS);
  if (!Number.isFinite(days) || days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  return `${Math.round(days / 30)} months ago`;
}
const dollars = (cents) => `$${Math.round(cents / 100).toLocaleString("en-US")}`;
const VERDICT_SAYS = {
  worked: "worked: build on it, the same kind in another listed place or a close kind",
  did_not_work: "did not work: do not suggest it again; a close kind only with what went wrong left out",
  running: "a search for it is still running or waiting on your answer: do not search it again now",
  not_reached: "its leads are not reached yet: do not search it again now",
  too_early: "too early to say (its leads were reached only lately): do not repeat it where it was searched"
};
function outcomeLine(s) {
  const parts = [`${s.leads.contacted} contacted`];
  if (s.reach.sent)
    parts.push(
      `${s.reach.sent} emailed, ${s.reach.replied} wrote back (${s.reach.interested} interested, ${s.reach.declined} said no)`
    );
  if (s.leads.interested) parts.push(`${s.leads.interested} interested on a call`);
  parts.push(`${s.leads.booked} booked`, `${s.leads.customers} became customers`);
  if (s.won.deals) parts.push(`${s.won.deals} deals won (${dollars(s.won.cents)})`);
  if (s.leads.not_a_fit)
    parts.push(`${s.leads.not_a_fit} not a fit (${topOf(s.notAFit, (k) => NOT_A_FIT_WORDS[k] ?? k)})`);
  if (s.leads.said_no) parts.push(`${s.leads.said_no} said no`);
  return `Of its leads: ${parts.join("; ")}`;
}
function kindLines(s, group, dry, now) {
  const places = [...new Set(group.map((x) => x.area?.label).filter(Boolean))].join("; ");
  const judged = s.found.qualified + s.found.review + s.found.excluded;
  const kept = s.found.qualified + s.found.review;
  const lines = [
    `Searched ${group.length === 1 ? "" : `${group.length} times, last `}${agoOf(group[0]?.at ?? "", now)}${places ? `, in ${places}` : ""}`,
    `Checked ${judged}: ${s.found.qualified} matched, ${s.found.review} to look at, ${s.found.excluded} left out${s.found.excluded ? ` (${topOf(s.leftOut, (k) => leftOutWord(k, s.withWords))})` : ""}`
  ];
  if (kept) lines.push(`${s.leads.with_email} of its ${kept} leads list an email, ${s.leads.with_phone} a phone`);
  if (kept || s.leads.contacted) lines.push(outcomeLine(s));
  if (s.reach.sent && s.lastSentAt) lines.push(`Last emailed ${agoOf(s.lastSentAt, now)}`);
  if (s.running) lines.push("A search for it is still running, or waiting on your answer");
  if (dry.length) lines.push(`Ran dry in: ${dry.join("; ")}`);
  return lines;
}
function ideaKinds(searches, now) {
  const groups = /* @__PURE__ */ new Map();
  for (const s of searches) groups.set(s.kind, [...groups.get(s.kind) ?? [], s]);
  return [...groups.entries()].map(([key, group]) => {
    const s = sumOf(group);
    const dryLabels = group.flatMap((x) => x.ranDry && x.area ? [x.area.label] : []);
    const verdict = verdictOf(s, group.length, now);
    return {
      key,
      name: group[0]?.name ?? key,
      searches: group.length,
      lastAt: group[0]?.at ?? "",
      places: [...new Set(group.map((x) => x.area?.label.toLowerCase()).filter((l) => !!l))],
      dry: [...new Set(dryLabels.map((l) => l.toLowerCase()))],
      verdict,
      lines: [...kindLines(s, group, [...new Set(dryLabels)], now), `Verdict: ${VERDICT_SAYS[verdict]}`]
    };
  });
}
const zipArea = (zip, state) => ({
  kind: "zip",
  label: `near ${zip}`,
  state,
  center: null,
  radius_m: 8e3,
  zip,
  query: `${zip}, ${state}, USA`
});
const cityArea = (city, state) => ({
  kind: "city",
  label: `${city}, ${state}`,
  state,
  center: null,
  radius_m: 25e3,
  query: `${city}, ${state}, USA`
});
function ideaPlaces(home, searches) {
  const out = [];
  const add = (area, note) => {
    const label = area.label.toLowerCase();
    if (out.length >= IDEA_PLACES_MAX || out.some((p) => p.area.label.toLowerCase() === label)) return;
    const takenFor = searches.filter((s) => s.area && s.area.label.toLowerCase() === label).map((s) => s.kind);
    out.push({ id: `P${out.length + 1}`, area, note, takenFor: [...new Set(takenFor)] });
  };
  if (home && home.zip) add(zipArea(home.zip, home.state), "home");
  if (home && home.city) add(cityArea(home.city, home.state), "home city");
  for (const s of searches) if (s.area) add(s.area, s.ranDry ? `searched, ran dry for ${s.name}` : "searched");
  let beside = 0;
  for (const s of searches)
    for (const a of s.nearby) {
      if (beside >= IDEA_BESIDE_MAX) break;
      const before = out.length;
      add(a, `beside ${s.area ? s.area.label : "a search"}`);
      if (out.length > before) beside++;
    }
  const homes = out.filter((x) => x.note === "home" || x.note === "home city");
  if (homes.length === 2) {
    const both = [...new Set(homes.flatMap((x) => x.takenFor))];
    for (const h of homes) h.takenFor = both;
  }
  return out;
}
export const ideaWhere = (i) => (i.plan ?? i.people)?.area.label ?? null;
export function ideaPassed(prev, searches) {
  const since = Date.parse(prev.madeAt);
  const startedSince = (key, place) => searches.some(
    (s) => s.kind === key && !!s.area && s.area.label.toLowerCase() === place && (!Number.isFinite(since) || Date.parse(s.at) >= since)
  );
  const out = /* @__PURE__ */ new Map();
  for (const x of prev.passed) out.set(`${x.key}@${x.place}`, { ...x });
  for (const i of prev.items) {
    const label = ideaWhere(i);
    if (!label) continue;
    const place = label.toLowerCase();
    const at = `${i.category_key}@${place}`;
    if (startedSince(i.category_key, place)) {
      out.delete(at);
      continue;
    }
    const before = out.get(at);
    out.set(at, { key: i.category_key, place, label, times: (before?.times ?? 0) + 1 });
  }
  return [...out.values()].slice(-12);
}
export function ideaPassedOf(raw) {
  return arr(raw).flatMap((x) => {
    const o = obj(x);
    const key = fieldText(o.key);
    const label = fieldText(o.label);
    return key && label ? [{ key, place: fieldText(o.place) || label.toLowerCase(), label, times: fieldCount(o.times) || 1 }] : [];
  });
}
export function ideaPacket(x) {
  const home = ideaHome(x.history, x.profileAddress);
  const room = Math.max(IDEA_SIZES[0], x.leadsLeft);
  const type = x.history.listing && x.history.listing.type ? x.history.listing.type : "";
  return {
    line: x.line,
    about: x.about ?? { services: [], notes: [], website: null },
    memory: x.memory ?? [],
    listingType: type ? type.replace(/_/g, " ") : null,
    ownKind: type ? leadKindKey(type) : null,
    passed: x.passed,
    language: x.language,
    home,
    leadsLeft: Math.max(0, x.leadsLeft),
    sizes: IDEA_SIZES.filter((n) => n <= room),
    places: ideaPlaces(home, x.history.searches),
    kinds: ideaKinds(x.history.searches, x.now),
    now: x.now
  };
}
